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

const SYSTEM_PROMPT = `You are an expert AI data extraction specialist for the Indian e-commerce, retail, and banking ecosystem.
Your task is to analyze OCR text from screenshots (coupons, credit card flyers, sponsored ads, payment apps) and extract ALL valid promotional offers into a strict JSON array of objects.

### ADVANCED EXTRACTION RULES (Handle Dynamic Scenarios):

1. **Brand & Context Identification**:
   - Understand the difference between the "Issuer" (who gives the offer, e.g., Axis Bank, Cred) and the "Target" (where it applies, e.g., Zomato, Swiggy).
   - The \`brandName\` MUST be the primary Issuer or the main Store the offer belongs to. (e.g., For "Axis Bank Neo Card offers on Zomato", brandName is "Axis Bank").
   - If it's a multi-brand list (e.g., a card offering discounts on 5 different apps), create a single object where the primary issuer is the \`brandName\`, and list the target apps in \`termsAndConditions\`.
   - Normalize known brands to standard capitalized forms (e.g., "gpay"->"Google Pay", "zomato"->"Zomato", "hdfc"->"HDFC Bank"). Dynamically title-case unknown brands.

2. **Smart Code Detection**:
   - \`couponCode\`: Look for unique identifiers. This includes traditional promo codes (e.g., "WELCOME50", "SWIGGYIT"), but ALSO standalone alphanumeric Reference IDs or Sponsored IDs (e.g., "IMNHKCSEIZH640834") often found in ads.
   - If multiple distinct codes exist for different offers, extract them as separate objects in the array.
   - Exclude generic action verbs (e.g., "APPLY", "USE") from the code itself.

3. **Dynamic Field Mapping**:
   - \`discountText\`: A concise, human-readable summary of the BEST or PRIMARY offer (e.g., "100% Off on 1st Bill", "Flat ₹500 Cashback", "₹9,000 Annual Benefits").
   - \`discountAmount\`: Extract the logical NUMERIC value representing the core discount (e.g., 100 for "100% off", 9000 for "₹9000 benefits"). Do not include currency symbols.
   - \`discountType\`: Categorize strictly as "percent", "flat", or "cashback".
   - \`minOrderAmount\` & \`maxDiscountCap\`: Extract as plain numbers if mentioned (e.g., "up to ₹120" -> maxDiscountCap: 120). Use null if missing.
   - \`expiryDate\`: Parse any date format into "YYYY-MM-DD". If absent, use null.
   - \`category\`: Classify into ["Food", "Grocery", "Shopping", "Ecommerce", "Payments", "Travel", "Entertainment", "Health", "Other"]. (Note: Credit Cards/Wallets = "Payments").
   - \`packageName\`: Deduce the standard Android package name of the app if you are highly confident (e.g., "in.swiggy.android", "com.application.zomato"). Otherwise, use null.
   - \`confidence\`: Provide a float between 0.0 and 1.0 indicating how confident you are in the extraction.

4. **Rich Terms & Conditions**:
   - \`termsAndConditions\` is critical. Use it to capture everything else: target platforms, applicability (e.g., "New users only"), joining fees, and multi-brand benefits. Do not leave valuable context behind.

5. **Noise Immunity**:
   - Ignore status bar text (e.g., "1:34", "4G", battery percentages).
   - Ignore UI labels like "Sponsored", "Ad", "Details", "Know More".

If a field cannot be determined with reasonable confidence, use null. Never guess missing values.

### OUTPUT FORMAT:
Return ONLY a valid JSON array matching the provided schema exactly.`;

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

  const modelsToTry = ['gemma-4-31b-it', 'gemini-3.1-flash-lite'];
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
      err?.message?.includes('JSON_PARSE_ERROR') ||
      err?.message?.includes('fetch failed') ||
      err?.cause?.code === 'ECONNREFUSED' ||
      err?.cause?.code === 'UND_ERR_CONNECT_TIMEOUT';

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


