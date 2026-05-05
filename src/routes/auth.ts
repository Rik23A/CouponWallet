// CouponVault Server — /api/auth routes
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDb } from '../lib/mongo';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET ?? 'fallback_secret';
const USERS_COL  = 'users';

// ── POST /api/auth/register ──────────────────────────────────────────────────
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, username, phone } = req.body;
    if (!email || !password || !username || !phone) {
      res.status(400).json({ error: 'Email, password, username, and phone are required' });
      return;
    }

    const db = getDb();
    const existingEmail = await db.collection(USERS_COL).findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const existingUser = await db.collection(USERS_COL).findOne({ username: username.toLowerCase() });
    if (existingUser) {
      res.status(409).json({ error: 'Username already taken' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.collection(USERS_COL).insertOne({
      email:      email.toLowerCase(),
      username:   username.toLowerCase(),
      phone:      phone,
      password:   hashedPassword,
      created_at: new Date(),
    });

    res.status(201).json({ success: true, userId: result.insertedId });
  } catch (err) {
    console.error('[Auth] Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;
    const db = getDb();

    const user = await db.collection(USERS_COL).findOne({ email: email.toLowerCase() });
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      token,
      user: { 
        id:       user._id, 
        email:    user.email,
        username: user.username,
        phone:    user.phone,
      },
    });
  } catch (err) {
    console.error('[Auth] Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── POST /api/auth/anonymous ─────────────────────────────────────────────────
router.post('/anonymous', async (_req: Request, res: Response): Promise<void> => {
  try {
    // For anonymous users, we just generate a temporary ID/token
    const tempId = `anon_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const token  = jwt.sign({ id: tempId, email: 'guest' }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: { id: tempId, email: 'guest', username: 'Guest', phone: '' },
    });
  } catch (err) {
    console.error('[Auth] Anonymous error:', err);
    res.status(500).json({ error: 'Guest login failed' });
  }
});

export default router;
