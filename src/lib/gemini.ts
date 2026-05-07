// CouponVault Server — Gemma 4 31B & Gemini 3.1 Flash-Lite Extraction Specialist
import { GoogleGenAI, Type } from '@google/genai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';
const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

// ── Strict JSON Schema as requested ──────────────────────────────────────────
const COUPON_SCHEMA = {
  type: Type.ARRAY,
  description: 'List of coupons extracted from the text.',
  items: {
    type: Type.OBJECT,
    properties: {
      couponCode:     { type: Type.STRING,  description: 'Uppercase alphanumeric code. null if not found.' },
      brandName:      { type: Type.STRING,  description: 'Company name (mapped to standard brand name).' },
      category:       { type: Type.STRING,  description: 'One of: Food, Grocery, Shopping, Ecommerce, Payments, Travel, Entertainment, Other' },
      discountText:   { type: Type.STRING,  description: 'Short human-readable string like "20% off", "₹100 off"' },
      discountAmount: { type: Type.NUMBER,  description: 'Numeric value only.' },
      discountType:   { type: Type.STRING,  description: 'One of: percent, flat, cashback' },
      minOrderAmount: { type: Type.NUMBER,  description: 'Minimum cart value as number. null if not mentioned.' },
      maxDiscountCap: { type: Type.NUMBER,  description: 'Maximum discount cap as number. null if not mentioned.' },
      expiryDate:         { type: Type.STRING,  description: 'ISO 8601 format YYYY-MM-DD. null if not found.' },
      termsAndConditions: { type: Type.STRING,  description: 'Terms and conditions, how to redeem, usage details, or important info found in the OCR. null if unclear.' },
      packageName:    { type: Type.STRING,  description: 'Android package name of the app (e.g. "in.swiggy.android"). null if unsure.' },
      confidence:         { type: Type.NUMBER,  description: '0.0 to 1.0 confidence score.' },
    },
    required: ['couponCode', 'brandName', 'category', 'discountText', 'confidence'],
  }
};

const SYSTEM_PROMPT = `You are a coupon data extraction specialist for Indian e-commerce apps.
Extract ALL valid coupons found in the OCR text and return ONLY a valid JSON array of objects.

RULES:
- A single image may contain multiple coupons. Extract every unique code you find.
- couponCode: uppercase alphanumeric, usually near words like "code", "use", "apply", "enter", "promo".
- brandName: the company/brand name applicable for coupon discount. Map these aliases: "swiggy"→"Swiggy", "zomato"→"Zomato", "myntra"→"Myntra", "fk"/"flipkart"→"Flipkart", "amzn"/"amazon"→"Amazon", "gpay"/"google pay"→"Google Pay", "phonepe"→"PhonePe", "paytm"→"Paytm", "bb"/"bigbasket"→"BigBasket", "blinkit"→"Blinkit", "zepto"→"Zepto", "cred"→"CRED", "nykaa"→"Nykaa", "ajio"→"Ajio", "meesho"→"Meesho", "tatacliq"→"Tata CLiQ", "tataneu"→"Tata Neu", "reliance"→"Reliance", "dmart"→"DMart", "jiomart"→"JioMart", "purplle"→"Purplle", "firstcry"→"FirstCry", "starbucks"→"Starbucks", "dominos"→"Dominos", "mcdonalds"→"McDonalds", "kfc"→"KFC", "pvr"→"PVR", "inox"→"INOX", "hotstar"→"Hotstar", "netflix"→"Netflix", "spotify"→"Spotify", "mmt"/"makemytrip"→"MakeMyTrip", "oyo"→"OYO", "ola"→"Ola", "uber"→"Uber", "1mg"→"Tata 1mg", "pharmeasy"→"PharmEasy", "apollo"→"Apollo"
- category: must be one of ["Food","Grocery","Shopping","Ecommerce","Payments","Travel","Entertainment","Other"]
- discountText: short human-readable string like "20% off", "₹100 off", "Flat ₹200 off", "₹100 off on minimum ₹750 spend", "₹10-₹100 cashback" 
- discountAmount: numeric value only (e.g. 20 for "20% off", 100 for "₹100 off")
- discountType: "percent" or "flat" or "cashback"
- minOrderAmount: minimum cart value as number (null if not mentioned)
- maxDiscountCap: maximum discount cap as number (null if not mentioned)
- expiryDate: ISO 8601 format "YYYY-MM-DD" (null if not found). Handle formats like "31 Jul 2026" or "15-May-2026".
- termsAndConditions: Comprehensive terms and conditions, usage details, how to redeem, or important info found in the OCR (e.g. "First order only", "Valid on Weekends", "Max discount ₹100"). Use null if unclear.
- packageName: the Android package name of the app if you are very confident (e.g. "com.amazon.mShop.android.shopping", "in.swiggy.android", "com.application.zomato"). Use null if unsure.
- confidence: 0.0 to 1.0 — how confident you are in the extraction

If a field cannot be determined, use null. Never guess couponCode — if unclear, omit that item or use null.`;

export interface GeminiParsedCoupon {
  couponCode:     string | null;
  brandName:      string;
  category:       string;
  discountText:   string;
  discountAmount: number | null;
  discountType:   string | null;
  minOrderAmount: number | null;
  maxDiscountCap: number | null;
  expiryDate:         string | null;
  termsAndConditions: string | null;
  packageName:        string | null;
  confidence:     number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function extractCouponsFromOCR(rawOcrText: string, retryCount = 0): Promise<GeminiParsedCoupon[]> {
  if (!ai) return [];

  const modelsToTry = ['gemma-4-31b-it', 'gemini-3.1-flash-lite-preview'];
  const currentModelName = modelsToTry[retryCount % modelsToTry.length];

  try {
    const prompt = `Extract ALL coupon data from this OCR text:\n\n${rawOcrText}`;
    
    const response = await ai.models.generateContent({
      model: currentModelName,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        responseJsonSchema: COUPON_SCHEMA,
        temperature:       0.1,
        maxOutputTokens:   1024, // Increased for multiple items
      },
    });

    let text = response.text;
    if (!text) throw new Error('Empty response from AI');

    const jsonMatch = text.match(/\[[\s\S]*\]/); // Match array
    if (jsonMatch) {
      text = jsonMatch[0];
    }

    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (parseErr: any) {
      throw new Error(`JSON_PARSE_ERROR: ${parseErr.message}`);
    }
  } catch (err: any) {
    const isRetryable = 
      err?.status === 429 || err?.message?.includes('429') || 
      err?.status === 500 || err?.message?.includes('500') ||
      err?.status === 503 || err?.message?.includes('503') ||
      err?.message?.includes('JSON_PARSE_ERROR');

    if (isRetryable && retryCount < modelsToTry.length + 1) {
      const waitTime = Math.pow(2, retryCount) * 1000;
      console.warn(`[AI Extraction] ${currentModelName} failed (${err?.message || 'Error'}). Retrying with next model in ${waitTime}ms... (Attempt ${retryCount + 1})`);
      await sleep(waitTime);
      return extractCouponsFromOCR(rawOcrText, retryCount + 1);
    }

    console.error(`[AI Extraction] Final failure for ${currentModelName}:`, err.message || err);
    return [];
  }
}


