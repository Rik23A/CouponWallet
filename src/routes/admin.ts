// CouponVault Server — /api/admin routes
import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { getDb } from '../lib/mongo';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET ?? 'fallback_secret';
const USERS_COL  = 'users';
const LOGINS_COL = 'user_logins';
const ACTIVITY_COL = 'user_activity';

// ── Admin Auth Middleware ──────────────────────────────────────────────────
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Admin authorization required' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string; role?: string };

    const db = getDb();
    const user = await db.collection(USERS_COL).findOne({ _id: new ObjectId(decoded.id) });

    if (!user) {
      res.status(401).json({ error: 'User account not found' });
      return;
    }

    if (user.role !== 'admin') {
      res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
      return;
    }

    (req as any).adminUser = user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired admin session token' });
  }
}

// ── POST /api/admin/promote-first-admin ─────────────────────────────────────
// Promote a user to admin if no admin currently exists or if the bootstrap email matches
router.post('/promote-first-admin', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    const db = getDb();
    const cleanEmail = email.trim().toLowerCase();

    const existingAdmin = await db.collection(USERS_COL).findOne({ role: 'admin' });
    const userToPromote = await db.collection(USERS_COL).findOne({ email: cleanEmail });

    if (!userToPromote) {
      res.status(404).json({ error: `User with email ${cleanEmail} not found. Please register the account first.` });
      return;
    }

    // Allow promotion if no admin exists or if already an admin
    if (existingAdmin && existingAdmin.email !== cleanEmail) {
      // Check if caller is authenticated admin
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        try {
          const token = authHeader.split(' ')[1];
          const decoded = jwt.verify(token, JWT_SECRET) as { id: string; role?: string };
          const caller = await db.collection(USERS_COL).findOne({ _id: new ObjectId(decoded.id) });
          if (caller?.role !== 'admin') {
            res.status(403).json({ error: 'Only existing admins can promote new admins.' });
            return;
          }
        } catch (_) {
          res.status(403).json({ error: 'Only existing admins can promote new admins.' });
          return;
        }
      } else {
        res.status(403).json({ error: 'Admin already initialized. Please login with your admin account.' });
        return;
      }
    }

    await db.collection(USERS_COL).updateOne(
      { _id: userToPromote._id },
      { $set: { role: 'admin', is_verified: true } }
    );

    console.log(`[Admin] Promoted user ${cleanEmail} to Admin role.`);
    res.json({ success: true, message: `User ${cleanEmail} is now an Administrator!` });
  } catch (err) {
    console.error('[Admin] Promotion error:', err);
    res.status(500).json({ error: 'Failed to promote admin' });
  }
});

// ── GET /api/admin/metrics ─────────────────────────────────────────────────
// Returns executive KPIs, DAU, WAU, signups, and trends
router.get('/metrics', requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const db = getDb();
    const now = new Date();

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek  = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      verifiedUsers,
      unverifiedUsers,
      suspendedUsers,
      totalLogins,
      totalActivityLogs,
      activeTodayDistinct,
      activeWeekDistinct,
      activeMonthDistinct,
    ] = await Promise.all([
      db.collection(USERS_COL).countDocuments({}),
      db.collection(USERS_COL).countDocuments({ is_verified: true }),
      db.collection(USERS_COL).countDocuments({ is_verified: false }),
      db.collection(USERS_COL).countDocuments({ status: 'suspended' }),
      db.collection(LOGINS_COL).countDocuments({}),
      db.collection(ACTIVITY_COL).countDocuments({}),
      db.collection(LOGINS_COL).distinct('email', { login_at: { $gte: startOfToday } }),
      db.collection(LOGINS_COL).distinct('email', { login_at: { $gte: startOfWeek } }),
      db.collection(LOGINS_COL).distinct('email', { login_at: { $gte: startOfMonth } }),
    ]);

    // Registration trend for last 14 days
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const recentUsers = await db.collection(USERS_COL)
      .find({ created_at: { $gte: fourteenDaysAgo } })
      .project({ created_at: 1 })
      .toArray();

    const recentLogins = await db.collection(LOGINS_COL)
      .find({ login_at: { $gte: fourteenDaysAgo } })
      .project({ login_at: 1 })
      .toArray();

    // Group by Day (YYYY-MM-DD)
    const signupsByDay: Record<string, number> = {};
    const loginsByDay: Record<string, number> = {};

    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateKey = d.toISOString().split('T')[0];
      signupsByDay[dateKey] = 0;
      loginsByDay[dateKey] = 0;
    }

    recentUsers.forEach(u => {
      if (u.created_at) {
        const d = new Date(u.created_at).toISOString().split('T')[0];
        if (signupsByDay[d] !== undefined) signupsByDay[d]++;
      }
    });

    recentLogins.forEach(l => {
      if (l.login_at) {
        const d = new Date(l.login_at).toISOString().split('T')[0];
        if (loginsByDay[d] !== undefined) loginsByDay[d]++;
      }
    });

    const trendData = Object.keys(signupsByDay).map(date => ({
      date,
      signups: signupsByDay[date] || 0,
      logins:  loginsByDay[date] || 0,
    }));

    res.json({
      metrics: {
        totalUsers,
        verifiedUsers,
        unverifiedUsers,
        activeUsers: totalUsers - suspendedUsers,
        suspendedUsers,
        verificationRate: totalUsers > 0 ? Math.round((verifiedUsers / totalUsers) * 100) : 0,
        dau: activeTodayDistinct.length,
        wau: activeWeekDistinct.length,
        mau: activeMonthDistinct.length,
        totalLogins,
        totalActivityLogs,
      },
      trendData,
    });
  } catch (err) {
    console.error('[Admin] Metrics error:', err);
    res.status(500).json({ error: 'Failed to aggregate dashboard metrics' });
  }
});

// ── GET /api/admin/users ───────────────────────────────────────────────────
// Supports multi-criteria filtering, search, date ranges, sorting, and pagination
router.get('/users', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      search,
      verified,
      status,
      role,
      dateFrom,
      dateTo,
      activeFrom,
      activeTo,
      platform,
      sortBy = 'created_at',
      sortOrder = 'desc',
      page = '1',
      limit = '20',
    } = req.query as Record<string, string>;

    const db = getDb();
    const filter: Record<string, any> = {};

    // 1. Search Query (username, email, phone)
    if (search && search.trim()) {
      const searchRegex = { $regex: search.trim(), $options: 'i' };
      filter.$or = [
        { username: searchRegex },
        { email:    searchRegex },
        { phone:    searchRegex },
      ];
    }

    // 2. Verified Status Filter
    if (verified === 'true') {
      filter.is_verified = true;
    } else if (verified === 'false') {
      filter.is_verified = false;
    }

    // 3. Account Status Filter
    if (status && status !== 'all') {
      filter.status = status;
    }

    // 4. Role Filter
    if (role && role !== 'all') {
      filter.role = role;
    }

    // 5. Platform Filter
    if (platform && platform !== 'all') {
      filter.last_platform = platform;
    }

    // 6. Registration Date Range Filter
    if (dateFrom || dateTo) {
      filter.created_at = {};
      if (dateFrom) filter.created_at.$gte = new Date(dateFrom);
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        filter.created_at.$lte = toDate;
      }
    }

    // 7. Last Active Date Range Filter
    if (activeFrom || activeTo) {
      filter.last_active_at = {};
      if (activeFrom) filter.last_active_at.$gte = new Date(activeFrom);
      if (activeTo) {
        const toDate = new Date(activeTo);
        toDate.setHours(23, 59, 59, 999);
        filter.last_active_at.$lte = toDate;
      }
    }

    // Sort definition
    const order = sortOrder === 'asc' ? 1 : -1;
    const sortFieldMap: Record<string, string> = {
      created_at:     'created_at',
      last_login_at:  'last_login_at',
      last_active_at: 'last_active_at',
      login_count:    'login_count',
      username:       'username',
      email:          'email',
    };
    const sort: Record<string, number> = {
      [sortFieldMap[sortBy] || 'created_at']: order,
    };

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(1000, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [usersList, totalCount] = await Promise.all([
      db.collection(USERS_COL)
        .find(filter)
        .sort(sort as any)
        .skip(skip)
        .limit(limitNum)
        .project({
          password: 0,
          verification_otp: 0,
          verification_otp_expires: 0,
          reset_otp: 0,
          reset_otp_expires: 0,
        })
        .toArray(),
      db.collection(USERS_COL).countDocuments(filter),
    ]);

    const sanitizedUsers = usersList.map(u => ({
      id:              u._id.toString(),
      username:        u.username || 'User',
      email:           u.email,
      phone:           u.phone || '-',
      role:            u.role || 'user',
      status:          u.status || 'active',
      is_verified:     u.is_verified ?? false,
      login_count:     u.login_count || 0,
      last_login_at:   u.last_login_at || null,
      last_active_at:  u.last_active_at || u.created_at || null,
      last_ip:         u.last_ip || '-',
      last_platform:   u.last_platform || 'mobile',
      app_version:     u.app_version || '1.0.0',
      activity_counts: u.activity_counts || {},
      created_at:      u.created_at || new Date(),
    }));

    res.json({
      users: sanitizedUsers,
      total: totalCount,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(totalCount / limitNum),
    });
  } catch (err) {
    console.error('[Admin] Users list error:', err);
    res.status(500).json({ error: 'Failed to fetch user list' });
  }
});

// ── GET /api/admin/users/:id ───────────────────────────────────────────────
// Returns complete user profile, login audit timeline, and activity logs
router.get('/users/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid user ID format' });
      return;
    }

    const db = getDb();
    const user = await db.collection(USERS_COL).findOne(
      { _id: new ObjectId(id) },
      {
        projection: {
          password: 0,
          verification_otp: 0,
          verification_otp_expires: 0,
          reset_otp: 0,
          reset_otp_expires: 0,
        }
      }
    );

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Fetch recent login history (last 50 logins)
    const logins = await db.collection(LOGINS_COL)
      .find({ user_id: new ObjectId(id) })
      .sort({ login_at: -1 })
      .limit(50)
      .toArray();

    // Fetch recent activity events
    const activities = await db.collection(ACTIVITY_COL)
      .find({ user_id: id })
      .sort({ logged_at: -1 })
      .limit(50)
      .toArray();

    res.json({
      user: {
        id:              user._id.toString(),
        username:        user.username,
        email:           user.email,
        phone:           user.phone,
        role:            user.role || 'user',
        status:          user.status || 'active',
        is_verified:     user.is_verified ?? false,
        login_count:     user.login_count || logins.length,
        last_login_at:   user.last_login_at,
        last_active_at:  user.last_active_at,
        last_ip:         user.last_ip,
        last_platform:   user.last_platform,
        app_version:     user.app_version,
        activity_counts: user.activity_counts || {},
        created_at:      user.created_at,
      },
      logins: logins.map(l => ({
        id:           l._id.toString(),
        ip:           l.ip,
        userAgent:    l.user_agent,
        platform:     l.platform,
        deviceModel:  l.device_model,
        appVersion:   l.app_version,
        loginAt:      l.login_at,
      })),
      activities: activities.map(a => ({
        id:        a._id.toString(),
        action:    a.action,
        metadata:  a.metadata,
        platform:  a.platform,
        loggedAt:  a.logged_at,
      })),
    });
  } catch (err) {
    console.error('[Admin] User details error:', err);
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
});

// ── PATCH /api/admin/users/:id ─────────────────────────────────────────────
// Allows toggling account status (active/suspended), verified status, or role
router.patch('/users/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, is_verified, role } = req.body;

    if (!ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid user ID format' });
      return;
    }

    const updates: Record<string, any> = {};
    if (status && ['active', 'suspended'].includes(status)) {
      updates.status = status;
    }
    if (typeof is_verified === 'boolean') {
      updates.is_verified = is_verified;
    }
    if (role && ['user', 'admin'].includes(role)) {
      updates.role = role;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'No valid fields provided for update' });
      return;
    }

    const db = getDb();
    const result = await db.collection(USERS_COL).updateOne(
      { _id: new ObjectId(id) },
      { $set: updates }
    );

    if (result.matchedCount === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ success: true, message: 'User updated successfully', updates });
  } catch (err) {
    console.error('[Admin] Update user error:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

export default router;
