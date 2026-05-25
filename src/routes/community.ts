// CouponVault Server — /api/community routes (MongoDB proxy)
import { Router, Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { findMany, insertOne, upsertOne, incrementField, getDb } from '../lib/mongo';
import { resolvePackageName } from '../lib/brandUtils';

const router = Router();

const COUPONS_COL = 'community_coupons';
const VOTES_COL   = 'coupon_votes';

// ── GET /api/community ─────────────────────────────────────────────────────
// Query params: brand, category, sort (newest|trending|expiring), page, limit
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { brand, category, sort = 'trending', page = '0', limit = '20' } = req.query as Record<string, string>;

    const filter: Record<string, unknown> = { is_active: true };
    if (brand)    filter['brand_name'] = { $regex: brand, $options: 'i' };
    if (category) filter['category']   = category;

    const sortMap: Record<string, Record<string, number>> = {
      newest:   { created_at: -1 },
      trending: { valid_votes: -1, trust_score: -1 },
      expiring: { expiry_date: 1 },
    };

    console.log(`[Community] GET filter:`, filter);
    const docs = await findMany(
      COUPONS_COL,
      filter,
      sortMap[sort] ?? sortMap.trending,
      parseInt(limit, 10),
      parseInt(page, 10) * parseInt(limit, 10),
    );
    console.log(`[Community] GET found ${docs.length} coupons`);

    res.json({ coupons: docs, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) {
    console.error('[Community] GET error:', err);
    res.status(500).json({ error: 'Failed to fetch community coupons' });
  }
});

// ── POST /api/community ────────────────────────────────────────────────────
// Body: { couponCode, brandName, packageName, category, discountText, discountValue, minOrder, expiryDate, contributorHash }
router.post('/', async (req: Request, res: Response): Promise<void> => {
  console.log('[Community] POST body:', JSON.stringify(req.body, null, 2));
  try {
    const {
      couponCode, brandName, packageName, category,
      discountText, discountValue, minOrder, expiryDate,
      termsAndConditions, contributorHash,
    } = req.body;

    if (!couponCode || !brandName) {
      res.status(400).json({ error: 'couponCode and brandName are required' });
      return;
    }

    const now = new Date().toISOString();
    const filter = { coupon_code: couponCode.toUpperCase(), brand_name: brandName };

    const updateDoc: any = {
      coupon_code:      couponCode.toUpperCase(),
      brand_name:       brandName,
      package_name:     packageName || resolvePackageName(brandName),
      category:         category ?? 'other',
      discount_text:    discountText ?? '',
      discount_value:   discountValue ?? null,
      min_order:        minOrder ?? null,
      expiry_date:      expiryDate ?? null,
      terms_and_conditions: termsAndConditions ?? '',
      is_active:        true,
      source_region:    'IN',
      contributor_hash: contributorHash ?? 'anonymous',
      updated_at:       now,
    };

    console.log(`[MongoDB] Upserting to ${COUPONS_COL}:`, filter);
    const result = await getDb().collection(COUPONS_COL).updateOne(
      filter,
      { 
        $set: updateDoc, 
        $setOnInsert: { 
          created_at: now,
          valid_votes: 0,
          invalid_votes: 0,
          trust_score: 0 
        } 
      },
      { upsert: true },
    );
    console.log(`[MongoDB] Upsert result:`, { matched: result.matchedCount, upserted: result.upsertedId });

    res.status(201).json({ success: true });
  } catch (err) {
    console.error('[Community] POST error:', err);
    res.status(500).json({ error: 'Failed to submit coupon' });
  }
});

// ── POST /api/community/:id/vote ──────────────────────────────────────────
// Body: { vote: 'valid' | 'invalid', userHash: string }
router.post('/:id/vote', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id }       = req.params;
    const { vote, userHash } = req.body as { vote: 'valid' | 'invalid'; userHash: string };

    if (!vote || !['valid', 'invalid'].includes(vote)) {
      res.status(400).json({ error: 'vote must be "valid" or "invalid"' });
      return;
    }

    const objectId = ObjectId.isValid(id) ? new ObjectId(id) : id;

    // Record vote (upsert — one vote per user per coupon)
    await upsertOne(
      VOTES_COL,
      { coupon_id: id, user_hash: userHash },
      { coupon_id: id, user_hash: userHash, vote, voted_at: new Date().toISOString() },
    );

    // Increment vote counter
    const field = vote === 'valid' ? 'valid_votes' : 'invalid_votes';
    await incrementField(COUPONS_COL, { _id: objectId }, field);

    // Recalculate trust_score
    const coupon = await getDb().collection(COUPONS_COL).findOne({ _id: objectId as any });
    if (coupon) {
      const valid = (coupon.valid_votes || 0);
      const invalid = (coupon.invalid_votes || 0);
      const total = valid + invalid;
      const trustScore = total > 0 ? valid / total : 0;
      await getDb().collection(COUPONS_COL).updateOne(
        { _id: objectId as any },
        { $set: { trust_score: trustScore } }
      );
      console.log(`[Community] Vote recorded: ${vote} for coupon ${id}. New trust score: ${trustScore}`);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[Community] Vote error:', err);
    res.status(500).json({ error: 'Failed to record vote' });
  }
});

export default router;
