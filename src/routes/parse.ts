// CouponVault Server — /api/parse route
import { Router, Request, Response } from 'express';
import { extractCouponFromOCR } from '../lib/gemini';
import { parseLocally } from '../lib/localParser';
import { findOne, findMany } from '../lib/mongo';

const router = Router();
const COUPONS_COL = 'community_coupons';

// POST /api/parse
// Body: { ocrText: string }
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { ocrText } = req.body as { ocrText?: string };

  if (!ocrText || typeof ocrText !== 'string' || ocrText.trim().length < 10) {
    res.status(400).json({ error: 'OCR text too short or empty' });
    return;
  }

  // ── Step 1: DB-First Lookup (Short-circuit expensive AI) ──────────────────
  try {
    // Extract potential uppercase codes (4-30 chars, including hyphens/underscores)
    const potentialCodes = Array.from(new Set(
      ocrText.match(/[A-Z0-9\-_]{4,30}/g) || []
    ));

    if (potentialCodes.length > 0) {
      // Find active coupons matching any of these codes
      const candidates = await findMany<any>(COUPONS_COL, {
        coupon_code: { $in: potentialCodes },
        is_active:   true,
      });

      // Verify if the brand name also exists in the OCR text to avoid false positives
      for (const cand of candidates) {
        const brandName = cand.brand_name.toLowerCase();
        if (ocrText.toLowerCase().includes(brandName)) {
          console.log(`[Parse DB] Short-circuit hit: ${cand.brand_name} - ${cand.coupon_code}`);
          
          res.json({
            success: true,
            fromCommunityDB: true,
            coupon: {
              couponCode:     cand.coupon_code,
              brandName:      cand.brand_name,
              category:       cand.category,
              discountText:   cand.discount_text,
              discountAmount: cand.discount_value,
              discountType:   cand.discount_type,
              minOrderAmount: cand.min_order,
              maxDiscountCap: cand.max_discount,
              expiryDate:     cand.expiry_date,
              packageName:    cand.package_name,
              termsAndConditions: cand.terms_and_conditions || '',
              confidence:     1.0,
            },
            message: 'Fetched from community vault',
          });
          return;
        }
      }
    }
  } catch (dbErr) {
    console.error('[Parse DB] Lookup error:', dbErr);
    // Continue to AI if DB lookup fails
  }

  // ── Step 2: Gemini AI Extraction (Primary Engine) ─────────────────────────
  let coupon = await extractCouponFromOCR(ocrText);

  if (!coupon) {
    console.warn('[Parse AI] Gemini failed or quota exceeded. Falling back to local regex parser.');
    const localResult = parseLocally(ocrText);
    
    // Map local result to the same interface
    coupon = {
      couponCode:     localResult.couponCode || null,
      brandName:      localResult.brandName,
      category:       localResult.category,
      discountText:   localResult.discountText || 'Discount Found',
      discountAmount: localResult.discountValue,
      discountType:   localResult.discountType,
      minOrderAmount: localResult.minOrder,
      maxDiscountCap: localResult.maxDiscount,
      expiryDate:     localResult.expiryDate,
      termsAndConditions: null,
      confidence:     localResult.confidence * 0.8, // Lower confidence for local fallback
    };
  }

  if (!coupon || (!coupon.couponCode && (coupon.confidence || 0) < 0.2)) {
    res.status(500).json({ error: 'AI extraction failed and local parser found nothing useful' });
    return;
  }

  // Validate minimum required fields per user logic
  if (!coupon.couponCode && coupon.confidence < 0.3) {
    res.json({
      success: false,
      message: 'Could not extract coupon — please fill manually',
      coupon: coupon,
    });
    return;
  }

  // ── Step 3: Final check/merge (in case AI found it but we didn't in short-circuit) ──
  let existing = null;
  if (coupon && coupon.couponCode) {
    existing = await findOne<any>(COUPONS_COL, {
      coupon_code: coupon.couponCode.toUpperCase(),
      brand_name:  coupon.brandName,
      is_active:   true,
    });
  }

  console.log(`[Parse AI] Success: ${coupon.brandName} - ${coupon.couponCode} (Conf: ${coupon.confidence})`);
  
  res.json({
    success: true,
    fromCommunityDB: !!existing,
    coupon: existing ? {
      couponCode:     existing.coupon_code,
      brandName:      existing.brand_name,
      category:       existing.category,
      discountText:   existing.discount_text,
      discountAmount: existing.discount_value,
      discountType:   existing.discount_type,
      minOrderAmount: existing.min_order,
      maxDiscountCap: existing.max_discount,
      expiryDate:     existing.expiry_date,
      packageName:    existing.package_name,
      termsAndConditions: existing.terms_and_conditions || '',
      confidence:     1.0,
    } : coupon,
    aiExtracted: coupon,
    confidence: coupon.confidence,
  });
});

export default router;
