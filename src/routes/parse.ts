// CouponVault Server — /api/parse route
import { Router, Request, Response } from 'express';
import { extractCouponsFromOCR, GeminiParsedCoupon } from '../lib/gemini';
import { parseLocally } from '../lib/localParser';
import { findOne, findMany } from '../lib/mongo';

const router = Router();
const COUPONS_COL = 'community_coupons';

// POST /api/parse
// Body: { ocrText: string }
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { ocrText } = req.body as { ocrText?: string };

    if (!ocrText || typeof ocrText !== 'string' || ocrText.trim().length < 10) {
      res.status(400).json({ error: 'OCR text too short or empty' });
      return;
    }

    // ── Step 1: DB-First Lookup (Short-circuit expensive AI) ──────────────────
    let dbCoupons: any[] = [];
    let potentialCodes: string[] = [];

    try {
      // Use the same heuristic as the mobile client:
      //   ─ Alphanumeric tokens, optionally hyphen-separated (e.g. LSBB100-3W3GR8HRAZJBW6P)
      //   ─ Mixed-case — preserve original, uppercase only for heuristic checks
      //   ─ Exclude pure date tokens (JAN2024, MAR25 etc.)
      const DATE_MONTH_RE = /^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\d{1,4}$/i;
      // Regex: letter start, then any alphanumeric, with optional internal hyphen segments
      const rawTokens = ocrText.match(/\b[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*\b/g) ?? [];
      potentialCodes = Array.from(new Set(
        rawTokens.filter(t => {
          const stripped = t.replace(/-/g, '');        // remove hyphens for length/char checks
          const upper    = stripped.toUpperCase();
          if (upper.length < 5 || upper.length > 40) return false;
          if (DATE_MONTH_RE.test(upper)) return false;
          const letters = (upper.match(/[A-Z]/g) ?? []).length;
          const digits  = (upper.match(/[0-9]/g) ?? []).length;
          return letters >= 2 && digits >= 1;           // Must be mixed alphanumeric
        })
      ));

      if (potentialCodes.length > 0) {
        const candidates = await findMany<any>(COUPONS_COL, {
          coupon_code: { $in: potentialCodes.map(c => c.toUpperCase()) },
          is_active:   true,
        });

        for (const cand of candidates) {
          // Extra guard: brand name must also appear in OCR text
          const brandName = cand.brand_name.toLowerCase();
          if (ocrText.toLowerCase().includes(brandName)) {
            dbCoupons.push({
              couponCode:         cand.coupon_code,
              brandName:          cand.brand_name,
              category:           cand.category,
              discountText:       cand.discount_text,
              discountAmount:     cand.discount_value,
              discountType:       cand.discount_type,
              minOrder:           cand.min_order,
              maxDiscount:        cand.max_discount,
              expiryDate:         cand.expiry_date,
              packageName:        cand.package_name,
              termsAndConditions: cand.terms_and_conditions || '',
              confidence:         1.0,
              fromCommunityDB:    true,
            });
          }
        }
      }
    } catch (dbErr) {
      console.error('[Parse DB] Lookup error:', dbErr);
    }

    // ── Step 2: Gemini AI Extraction (only when DB doesn't fully cover OCR) ───
    //
    // "Full coverage" = every strict coupon-code candidate found in the OCR is
    // already present in the community DB results. In that case there is nothing
    // new for Gemini to discover — skip the API call entirely.
    //
    const dbCodeSet = new Set(
      dbCoupons
        .map(c => c.couponCode)
        .filter((code): code is string => typeof code === 'string')
        .map(code => code.toUpperCase())
    );

    // "Full coverage" = DB found results AND every "meaningful" uncovered token
    // is short enough to be OCR noise (< 7 alphanumeric chars without hyphens).
    // e.g. "Rlul87" (6 chars) is noise; "LSBB100-3W3GR8HRAZJBW6P" (21 alphanum) is real.
    const uncoveredMeaningful = potentialCodes.filter(c => {
      if (dbCodeSet.has(c.toUpperCase())) return false;          // already in DB
      const alphanum = c.replace(/-/g, '').toUpperCase();
      return alphanum.length >= 7;                               // short = noise, long = real new code
    });
    const allCovered = dbCoupons.length > 0 && uncoveredMeaningful.length === 0;

    let extractedCoupons: GeminiParsedCoupon[] = [];

    if (allCovered) {
      // ✅ DB has everything — skip Gemini
      console.log(`[Parse] Full DB coverage for ${dbCoupons.length} coupon(s) — Gemini skipped.`);
    } else {
      // 🔄 Unknown codes present — call Gemini
      const uncoveredCodes = potentialCodes.filter(c => !dbCodeSet.has(c.toUpperCase()));
      console.log(`[Parse] ${uncoveredCodes.length} code(s) not in DB (${uncoveredCodes.join(', ')}) — calling Gemini.`);
      extractedCoupons = await extractCouponsFromOCR(ocrText);
    }

    // Fallback to local parser ONLY if AI found absolutely nothing and we have no DB hits
    if (extractedCoupons.length === 0 && dbCoupons.length === 0) {
      console.warn('[Parse AI] Gemini found nothing. Falling back to local regex parser.');
      const localResult = parseLocally(ocrText);
      if (localResult.couponCode) {
        extractedCoupons.push({
          couponCode:     localResult.couponCode,
          brandName:      localResult.brandName,
          category:       localResult.category,
          discountText:   localResult.discountText || 'Discount Found',
          discountAmount: localResult.discountValue,
          discountType:   localResult.discountType,
          minOrderAmount: localResult.minOrder,
          maxDiscountCap: localResult.maxDiscount,
          expiryDate:     localResult.expiryDate,
          packageName:    null,
          termsAndConditions: null,
          confidence:     localResult.confidence * 0.8,
        });
      }
    }

    // Filter out low-confidence extractions (allowing code-less coupons)
    const validExtracted = extractedCoupons.filter(c => c.confidence > 0.2);

    // ── Step 3: Merge & De-duplicate ──────────────────────────────────────────
    // Prefer DB records over AI extractions for the same code
    const finalCouponsMap = new Map<string, any>();

    // Add AI ones first (lower authority)
    validExtracted.forEach(c => {
      const key = `${c.brandName.toLowerCase()}_${c.couponCode?.toUpperCase()}`;
      finalCouponsMap.set(key, c);
    });

    // Overwrite with DB ones (community-verified, higher authority)
    dbCoupons.forEach(c => {
      const key = `${c.brandName.toLowerCase()}_${c.couponCode?.toUpperCase()}`;
      finalCouponsMap.set(key, c);
    });

    const finalCoupons = Array.from(finalCouponsMap.values());

    console.log(`[Parse] Returning ${finalCoupons.length} coupon(s): ${dbCoupons.length} from DB, ${validExtracted.length} from Gemini.`);

    res.json({
      success: finalCoupons.length > 0,
      coupons: finalCoupons,
      count:   finalCoupons.length,
      message: finalCoupons.length > 0 ? `Found ${finalCoupons.length} coupons` : 'No coupons found',
    });
  } catch (err: any) {
    console.error('[Parse API Error]', err);
    res.status(500).json({ error: err.message || 'Internal server error during coupon parsing' });
  }
});

export default router;
