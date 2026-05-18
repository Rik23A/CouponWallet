// CouponVault Server — /api/auth routes
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDb } from '../lib/mongo';
import { sendVerificationOtp, sendPasswordResetOtp } from '../lib/mailService';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET ?? 'fallback_secret';
const USERS_COL  = 'users';

// Utility helper to generate a 6-digit numeric OTP
function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Utility to validate E.164 phone standard (+ followed by country code and 10 to 14 digits)
function isValidE164Phone(phone: string): boolean {
  const phoneRegex = /^\+?[1-9]\d{10,14}$/;
  return phoneRegex.test(phone);
}

// Helper to standardise user objects in responses
function makeUserResponse(user: any) {
  return {
    id:       user._id,
    email:    user.email,
    username: user.username,
    phone:    user.phone,
    is_verified: user.is_verified ?? false,
  };
}

// ── POST /api/auth/register ──────────────────────────────────────────────────
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, username, phone } = req.body;
    if (!email || !password || !username || !phone) {
      res.status(400).json({ error: 'Email, password, username, and phone are required' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim().toLowerCase();
    const cleanPhone = phone.trim();

    // 1. Mobile validation
    if (!isValidE164Phone(cleanPhone)) {
      res.status(400).json({ error: 'Invalid phone number format. Must be a valid country code followed by a 10-digit number.' });
      return;
    }

    const db = getDb();

    // 2. Uniqueness Checks
    const existingEmail = await db.collection(USERS_COL).findOne({ email: cleanEmail });
    if (existingEmail) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const existingUser = await db.collection(USERS_COL).findOne({ username: cleanUsername });
    if (existingUser) {
      res.status(409).json({ error: 'Username already taken' });
      return;
    }

    // Phone uniqueness check for future-proofing OTP login
    const existingPhone = await db.collection(USERS_COL).findOne({ phone: cleanPhone });
    if (existingPhone) {
      res.status(409).json({ error: 'Phone number already registered' });
      return;
    }

    // 3. Generate Verification OTP (expires in 15 minutes)
    const verificationOtp = generateOtp();
    const otpExpires = new Date(Date.now() + 15 * 60 * 1000);

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.collection(USERS_COL).insertOne({
      email:                    cleanEmail,
      username:                 cleanUsername,
      phone:                    cleanPhone,
      password:                 hashedPassword,
      is_verified:              false,
      verification_otp:         verificationOtp,
      verification_otp_expires: otpExpires,
      created_at:               new Date(),
    });

    // 4. Send the verification code
    await sendVerificationOtp(cleanEmail, verificationOtp);

    res.status(201).json({ 
      success: true, 
      message: 'Registration successful. Verification code sent to email.',
      userId: result.insertedId,
      email: cleanEmail
    });
  } catch (err) {
    console.error('[Auth] Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const db = getDb();
    const cleanEmail = email.trim().toLowerCase();

    const user = await db.collection(USERS_COL).findOne({ email: cleanEmail });
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Check email verification status
    if (user.is_verified === false) {
      res.status(403).json({ 
        error: 'Email not verified', 
        message: 'Email not verified', 
        email: cleanEmail,
        isVerified: false 
      });
      return;
    }

    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '180d' });

    res.json({
      token,
      user: makeUserResponse(user),
    });
  } catch (err) {
    console.error('[Auth] Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── POST /api/auth/verify-email ──────────────────────────────────────────────
router.post('/verify-email', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      res.status(400).json({ error: 'Email and verification OTP are required' });
      return;
    }

    const db = getDb();
    const cleanEmail = email.trim().toLowerCase();

    const user = await db.collection(USERS_COL).findOne({ email: cleanEmail });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (user.is_verified === true) {
      res.status(400).json({ error: 'Account is already verified' });
      return;
    }

    // Validate OTP and Expiration
    if (user.verification_otp !== otp.trim()) {
      res.status(400).json({ error: 'Invalid verification code' });
      return;
    }

    if (new Date() > new Date(user.verification_otp_expires)) {
      res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
      return;
    }

    // Activate the user account and clear the OTP fields
    await db.collection(USERS_COL).updateOne(
      { _id: user._id },
      { 
        $set: { is_verified: true },
        $unset: { verification_otp: '', verification_otp_expires: '' }
      }
    );

    // Generate immediate login token on successful verification
    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '180d' });

    console.log(`[Auth] User ${cleanEmail} successfully verified email.`);

    res.json({
      success: true,
      message: 'Account successfully verified!',
      token,
      user: {
        id:          user._id,
        email:       user.email,
        username:    user.username,
        phone:       user.phone,
        is_verified: true
      }
    });
  } catch (err) {
    console.error('[Auth] Verify email error:', err);
    res.status(500).json({ error: 'Email verification failed' });
  }
});

// ── POST /api/auth/resend-verification ─────────────────────────────────────────
router.post('/resend-verification', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    const db = getDb();
    const cleanEmail = email.trim().toLowerCase();

    const user = await db.collection(USERS_COL).findOne({ email: cleanEmail });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (user.is_verified === true) {
      res.status(400).json({ error: 'Account is already verified' });
      return;
    }

    const newOtp = generateOtp();
    const newExpires = new Date(Date.now() + 15 * 60 * 1000);

    await db.collection(USERS_COL).updateOne(
      { _id: user._id },
      { 
        $set: { 
          verification_otp:         newOtp, 
          verification_otp_expires: newExpires 
        } 
      }
    );

    await sendVerificationOtp(cleanEmail, newOtp);

    res.json({ success: true, message: 'New verification code sent!' });
  } catch (err) {
    console.error('[Auth] Resend verification error:', err);
    res.status(500).json({ error: 'Resending verification code failed' });
  }
});

// ── POST /api/auth/forgot-password ───────────────────────────────────────────
router.post('/forgot-password', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    const db = getDb();
    const cleanEmail = email.trim().toLowerCase();

    const user = await db.collection(USERS_COL).findOne({ email: cleanEmail });
    if (!user) {
      // Return 200 for security reasons, so attackers don't know who has accounts,
      // but still skip sending email.
      res.json({ success: true, message: 'If the email exists, a password reset code has been sent.' });
      return;
    }

    const resetOtp = generateOtp();
    const resetExpires = new Date(Date.now() + 15 * 60 * 1000);

    await db.collection(USERS_COL).updateOne(
      { _id: user._id },
      { 
        $set: { 
          reset_otp:         resetOtp, 
          reset_otp_expires: resetExpires 
        } 
      }
    );

    await sendPasswordResetOtp(cleanEmail, resetOtp);

    res.json({ success: true, message: 'If the email exists, a password reset code has been sent.' });
  } catch (err) {
    console.error('[Auth] Forgot password error:', err);
    res.status(500).json({ error: 'Requesting password reset failed' });
  }
});

// ── POST /api/auth/reset-password ────────────────────────────────────────────
router.post('/reset-password', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      res.status(400).json({ error: 'Email, code, and new password are required' });
      return;
    }

    const db = getDb();
    const cleanEmail = email.trim().toLowerCase();

    const user = await db.collection(USERS_COL).findOne({ email: cleanEmail });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (!user.reset_otp || user.reset_otp !== otp.trim()) {
      res.status(400).json({ error: 'Invalid password reset code' });
      return;
    }

    if (new Date() > new Date(user.reset_otp_expires)) {
      res.status(400).json({ error: 'Password reset code has expired. Please request a new one.' });
      return;
    }

    // Encrypt the new password, update the database, and clear the reset OTP fields
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.collection(USERS_COL).updateOne(
      { _id: user._id },
      { 
        $set: { password: hashedPassword },
        $unset: { reset_otp: '', reset_otp_expires: '' }
      }
    );

    console.log(`[Auth] User ${cleanEmail} reset password successfully.`);

    res.json({ success: true, message: 'Password has been reset successfully! You can now log in.' });
  } catch (err) {
    console.error('[Auth] Reset password error:', err);
    res.status(500).json({ error: 'Resetting password failed' });
  }
});

export default router;
