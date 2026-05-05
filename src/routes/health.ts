// CouponVault Server — /api/health route
import { Router, Request, Response } from 'express';
import { getDb } from '../lib/mongo';

const router = Router();

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    // Ping MongoDB
    await getDb().command({ ping: 1 });
    res.json({
      status:    'ok',
      version:   '1.0.0',
      timestamp: new Date().toISOString(),
      services:  { mongodb: 'connected', gemini: !!process.env.GEMINI_API_KEY },
    });
  } catch {
    res.status(503).json({ status: 'degraded', mongodb: 'disconnected' });
  }
});

export default router;
