// CouponVault Server — Local regex parser (ported from mobile app)
// Used as Tier-1 fast parse before calling Gemini

// ── Brand detection ───────────────────────────────────────────────────────────
const BRAND_MAP: Array<{ keys: string[]; brand: string; category: string }> = [
  { keys: ['axis bank', 'axisbank', 'axis card', 'axis neo'], brand: 'Axis Bank', category: 'Payments' },
  { keys: ['hdfc bank', 'hdfc card', 'hdfcbank', 'regalia', 'diners club'], brand: 'HDFC Bank', category: 'Payments' },
  { keys: ['icici bank', 'icici card', 'icicibank', 'amazon pay icici', 'coral card'], brand: 'ICICI Bank', category: 'Payments' },
  { keys: ['sbi card', 'sbi bank', 'sbicard', 'sbi pulse'], brand: 'SBI Card', category: 'Payments' },
  { keys: ['kotak bank', 'kotak card', 'kotakbank', 'kotak league'], brand: 'Kotak Mahindra Bank', category: 'Payments' },
  { keys: ['idfc bank', 'idfc first', 'idfc card'], brand: 'IDFC FIRST Bank', category: 'Payments' },
  { keys: ['rbl bank', 'rbl card'], brand: 'RBL Bank', category: 'Payments' },
  { keys: ['yes bank', 'yes card'], brand: 'Yes Bank', category: 'Payments' },
  { keys: ['indusind bank', 'indusind card'], brand: 'IndusInd Bank', category: 'Payments' },
  { keys: ['amex', 'american express'], brand: 'American Express', category: 'Payments' },
  { keys: ['hsbc'], brand: 'HSBC', category: 'Payments' },
  { keys: ['federal bank'], brand: 'Federal Bank', category: 'Payments' },
  { keys: ['sc bank', 'standard chartered'], brand: 'Standard Chartered', category: 'Payments' },
  { keys: ['bob card', 'bank of baroda'], brand: 'Bank of Baroda', category: 'Payments' },
  { keys: ['au bank', 'au small finance'], brand: 'AU Small Finance Bank', category: 'Payments' },
  { keys: ['swiggy', 'instamart', 'dineout'], brand: 'Swiggy', category: 'Food' },
  { keys: ['zomato', 'district'], brand: 'Zomato', category: 'Food' },
  { keys: ['bigbasket', 'big basket'], brand: 'BigBasket', category: 'Grocery' },
  { keys: ['blinkit', 'grofers'], brand: 'Blinkit', category: 'Grocery' },
  { keys: ['zepto'], brand: 'Zepto', category: 'Grocery' },
  { keys: ['jiomart'], brand: 'JioMart', category: 'Grocery' },
  { keys: ['dunzo'], brand: 'Dunzo', category: 'Grocery' },
  { keys: ['dmart', 'd-mart'], brand: 'DMart', category: 'Grocery' },
  { keys: ['reliance fresh', 'reliance smart'], brand: 'Reliance', category: 'Grocery' },
  { keys: ['more supermarket'], brand: 'More', category: 'Grocery' },
  { keys: ['myntra'], brand: 'Myntra', category: 'Shopping' },
  { keys: ['ajio'], brand: 'Ajio', category: 'Shopping' },
  { keys: ['meesho'], brand: 'Meesho', category: 'Shopping' },
  { keys: ['flipkart', 'shopsy'], brand: 'Flipkart', category: 'Shopping' },
  { keys: ['amazon'], brand: 'Amazon', category: 'Shopping' },
  { keys: ['snapdeal'], brand: 'Snapdeal', category: 'Shopping' },
  { keys: ['shopclues'], brand: 'ShopClues', category: 'Shopping' },
  { keys: ['tata cliq', 'tatacliq'], brand: 'Tata CLiQ', category: 'Shopping' },
  { keys: ['tata neu'], brand: 'Tata Neu', category: 'Shopping' },
  { keys: ['nykaa'], brand: 'Nykaa', category: 'Shopping' },
  { keys: ['purplle'], brand: 'Purplle', category: 'Shopping' },
  { keys: ['firstcry'], brand: 'FirstCry', category: 'Shopping' },
  { keys: ['fastrack'], brand: 'Fastrack', category: 'Shopping' },
  { keys: ['titan'], brand: 'Titan', category: 'Shopping' },
  { keys: ['westside'], brand: 'Westside', category: 'Shopping' },
  { keys: ['boat', 'bo@t'], brand: 'boAt', category: 'Shopping' },
  { keys: ['noise', 'gonoise'], brand: 'Noise', category: 'Shopping' },
  { keys: ['fire-boltt', 'fireboltt'], brand: 'Fire-Boltt', category: 'Shopping' },
  { keys: ['lenskart'], brand: 'Lenskart', category: 'Shopping' },
  { keys: ['pepperfry'], brand: 'Pepperfry', category: 'Shopping' },
  { keys: ['myglamm'], brand: 'MyGlamm', category: 'Shopping' },
  { keys: ['mamaearth'], brand: 'Mamaearth', category: 'Shopping' },
  { keys: ['derma co', 'dermaco'], brand: 'The Derma Co', category: 'Shopping' },
  { keys: ['beyoung'], brand: 'BeYoung', category: 'Shopping' },
  { keys: ['zop'], brand: 'Zop', category: 'Shopping' },
  { keys: ['mobilla'], brand: 'Mobilla', category: 'Shopping' },
  { keys: ['eatsure'], brand: 'EatSure', category: 'Food' },
  { keys: ['dominos', "domino's"], brand: 'Dominos', category: 'Food' },
  { keys: ['mcdonalds', "mcdonald's"], brand: 'McDonalds', category: 'Food' },
  { keys: ['kfc'], brand: 'KFC', category: 'Food' },
  { keys: ['pizza hut'], brand: 'Pizza Hut', category: 'Food' },
  { keys: ['burger king'], brand: 'Burger King', category: 'Food' },
  { keys: ['starbucks'], brand: 'Starbucks', category: 'Food' },
  { keys: ['licious'], brand: 'Licious', category: 'Food' },
  { keys: ['freshtohome'], brand: 'FreshToHome', category: 'Food' },
  { keys: ['google pay', 'gpay', 'g pay'], brand: 'GPay', category: 'Payments' },
  { keys: ['phonepe'], brand: 'PhonePe', category: 'Payments' },
  { keys: ['paytm'], brand: 'Paytm', category: 'Payments' },
  { keys: ['cred'], brand: 'CRED', category: 'Payments' },
  { keys: ['amazon pay'], brand: 'Amazon Pay', category: 'Payments' },
  { keys: ['freecharge'], brand: 'Freecharge', category: 'Payments' },
  { keys: ['slice', 'sliceit'], brand: 'Slice', category: 'Payments' },
  { keys: ['bookmyshow'], brand: 'BookMyShow', category: 'Entertainment' },
  { keys: ['pvr', 'pvr cinemas'], brand: 'PVR', category: 'Entertainment' },
  { keys: ['inox'], brand: 'INOX', category: 'Entertainment' },
  { keys: ['cinepolis'], brand: 'Cinepolis', category: 'Entertainment' },
  { keys: ['hotstar'], brand: 'Hotstar', category: 'Entertainment' },
  { keys: ['netflix'], brand: 'Netflix', category: 'Entertainment' },
  { keys: ['spotify'], brand: 'Spotify', category: 'Entertainment' },
  { keys: ['times prime', 'timesprime'], brand: 'Times Prime', category: 'Entertainment' },
  { keys: ['insider', 'paytm insider'], brand: 'Insider', category: 'Entertainment' },
  { keys: ['makemytrip', 'mmt'], brand: 'MakeMyTrip', category: 'Travel' },
  { keys: ['ixigo'], brand: 'Ixigo', category: 'Travel' },
  { keys: ['redbus'], brand: 'RedBus', category: 'Travel' },
  { keys: ['oyo', 'oyorooms'], brand: 'OYO', category: 'Travel' },
  { keys: ['irctc'], brand: 'IRCTC', category: 'Travel' },
  { keys: ['goibibo'], brand: 'Goibibo', category: 'Travel' },
  { keys: ['cleartrip'], brand: 'Cleartrip', category: 'Travel' },
  { keys: ['rapido'], brand: 'Rapido', category: 'Travel' },
  { keys: ['ola'], brand: 'Ola', category: 'Travel' },
  { keys: ['uber'], brand: 'Uber', category: 'Travel' },
  { keys: ['indigo'], brand: 'IndiGo', category: 'Travel' },
  { keys: ['1mg', 'tata 1mg', 'onmg'], brand: 'Tata 1mg', category: 'Health' },
  { keys: ['pharmeasy', 'pharm easy'], brand: 'PharmEasy', category: 'Health' },
  { keys: ['netmeds'], brand: 'Netmeds', category: 'Health' },
  { keys: ['apollo pharmacy', 'apollo'], brand: 'Apollo', category: 'Health' },
  { keys: ['urban company', 'urbancompany'], brand: 'Urban Company', category: 'Other' },
  { keys: ['housejoy'], brand: 'HouseJoy', category: 'Other' },
];

const CODE_IGNORE = new Set([
  'OFF','USE','GET','APP','VIEW','CODE','CASHBACK','DISCOUNT','VALID','TILL','UNTIL',
  'EXPIRES','LEFT','DAYS','HOURS','MINS','SAVE','FLAT','ONLY','BEST','JUST','THIS',
  'COPY','FREE','PLUS','ENTER','APPLY','PRODUCTS','HAPPY','INDIA','QUICK','DETAILS',
  'MINIMUM','MAXIMUM','SPEND','EXCLUSIVE','ITEMS','OFFER','REDEEM','BACK','RECHARGE',
  'JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC',
]);

const CODE_PATTERNS = [
  /(?:code|use\s*code|apply|promo|coupon|enter\s*code|voucher)\s*[:=\-'"\s]+([A-Za-z0-9][A-Za-z0-9\-._]{3,39})/gi,
  /\b([A-Za-z0-9]{3,15}-[A-Za-z0-9]{3,25})\b/g,
  /\b([A-Za-z]{1,}[0-9]{1,}[A-Za-z0-9]{2,}|[A-Za-z0-9]{2,}[0-9]{2,}[A-Za-z]{1,})\b/g,
  /\b([A-Za-z0-9]{3,25}(?:OFF|BACK|FREE))\b/gi,
  /\b([A-Z][A-Z0-9]{7,39})\b/g,
  /\b([A-Z]{2,6}[0-9]{2,6})\b/g,
];

function findBestCode(text: string): string {
  const candidates: Array<{ code: string; score: number; idx: number }> = [];
  const seen = new Set<string>();

  CODE_PATTERNS.forEach((pattern, pi) => {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const code = (m[1] ?? m[0]).trim().replace(/^[:=\-"'\s.()\[\]{}]+|[:=\-"'\s.()\[\]{}]+$/g, '');
      if (!code || code.length < 4 || code.length > 40) continue;
      const upper = code.toUpperCase();
      if (CODE_IGNORE.has(upper) || seen.has(upper)) continue;
      if (/^\d+$/.test(code)) continue;
      const hasAlpha = /[A-Za-z]/.test(code);
      const hasDigit = /[0-9]/.test(code);
      if (!((hasAlpha && hasDigit) || code.includes('-') || (code.length >= 8 && code === code.toUpperCase()))) continue;
      let score = code.length;
      if (hasAlpha && hasDigit) score += 10;
      if (code.includes('-'))   score += 5;
      if (pi === 0)             score += 50;
      candidates.push({ code, score, idx: m.index });
      seen.add(upper);
    }
  });

  candidates.sort((a, b) => b.score - a.score || a.idx - b.idx);
  return candidates[0]?.code.toUpperCase() ?? '';
}

function detectBrand(text: string): { brand: string; category: string } {
  const lower = text.toLowerCase();
  for (const { keys, brand, category } of BRAND_MAP) {
    if (keys.some(k => lower.includes(k))) return { brand, category };
  }
  return { brand: 'Unknown', category: 'other' };
}

function extractDiscount(text: string): {
  discountType: string | null;
  discountValue: number | null;
  discountText: string;
  minOrder: number | null;
  maxDiscount: number | null;
} {
  const numStr = (s: string) => parseInt(s.replace(/,/g, ''), 10);

  const pctCb    = text.match(/(\d{1,3})\s*%\s*(?:cashback|back\b)/i);
  const pctOff   = text.match(/(\d{1,3})\s*%\s*(?:off|discount|extra)/i);
  const rangeCb  = text.match(/(?:₹|rs\.?|inr)?\s*(\d{1,5})\s*[-–]\s*(?:₹|rs\.?|inr)?\s*(\d{1,5})\s*(?:cashback|back)/i);
  const flatCb   = text.match(/(?:get\s+up\s+to\s+)?(?:₹|rs\.?|inr)?\s*(\d{1,5})\s*(?:cashback|back\b)/i);
  const flatOff  = text.match(/(?:flat\s+)?(?:₹|rs\.?|inr)?\s*(\d{1,5})\s*(?:rupees\s*)?(?:off|discount)\b/i);
  const pctOffer = text.match(/(\d{1,3})\s*%\s*(?:offer|reward|back\*?)/i);

  let discountType:  string | null = null;
  let discountValue: number | null = null;
  let discountText  = '';

  if (pctCb)    { discountType = 'cashback'; discountValue = parseInt(pctCb[1], 10);    discountText = `${discountValue}% Cashback`; }
  else if (rangeCb)  { discountType = 'cashback'; discountValue = numStr(rangeCb[2]);  discountText = `₹${rangeCb[1]}–₹${rangeCb[2]} Cashback`; }
  else if (pctOff)   { discountType = 'percent';  discountValue = parseInt(pctOff[1], 10);   discountText = `${discountValue}% OFF`; }
  else if (pctOffer) { discountType = 'cashback'; discountValue = parseInt(pctOffer[1], 10); discountText = `${discountValue}% Back`; }
  else if (flatCb)   { discountType = 'cashback'; discountValue = numStr(flatCb[1]);   discountText = `₹${discountValue} Cashback`; }
  else if (flatOff)  { discountType = 'flat';     discountValue = numStr(flatOff[1]);  discountText = `₹${discountValue} OFF`; }

  const noMax = /no\s+(?:cap|max(?:imum)?|capping)/i.test(text);
  let maxDiscount: number | null = null;
  if (!noMax) {
    const maxM = text.match(/max(?:imum)?\s*(?:discount|cashback|off)?\s*(?:of\s*)?(?:₹|rs\.?)?\s*(\d{1,5})/i)
              ?? text.match(/(?:upto|up\s+to)\s*(?:₹|rs\.?)?\s*(\d{1,5})/i)
              ?? text.match(/get\s+up\s+to\s+(?:₹|rs\.?)?\s*(\d{1,5})\s*(?:back|cashback)/i);
    if (maxM) maxDiscount = numStr(maxM[1]);
  }

  if (!discountText && maxDiscount) {
    discountType  = 'cashback';
    discountValue = maxDiscount;
    discountText  = `Up to ₹${maxDiscount} Cashback`;
  }

  const noMin = /no\s+min(?:imum)?\s+(?:spend|order|purchase)/i.test(text);
  let minOrder: number | null = null;
  if (noMin) {
    minOrder = 0;
  } else {
    const minM = text.match(/min(?:imum)?\s*(?:₹|rs\.?|inr|:)?\s*(\d{2,5})/i)
              ?? text.match(/on\s+(?:min(?:imum)?\s+)?(?:spend|order)\s+of\s+(?:₹|rs\.?)?\s*(\d{2,5})/i)
              ?? text.match(/minimum\s+(?:₹|rs\.?)?\s*(\d{2,5})/i);
    if (minM) minOrder = numStr(minM[1]);
  }

  return { discountType, discountValue, discountText, minOrder, maxDiscount };
}

const DATE_PATTERNS = [
  /(?:valid\s*(?:till|until|upto)|expires?\s*(?:on|at)?|expiry)\s*[:\-]?\s*([\w\s,]+?\d{4}|\d{1,2}[\s\/\-]\w+(?:[\s\/\-]\d{2,4})?)/gi,
  /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})\b/gi,
  /\b(\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*(?:\s+\d{2,4})?)\b/gi,
  /\b(\d{4}[\-\/\.]\d{1,2}[\-\/\.]\d{1,2})\b/g,
];

function extractExpiry(text: string): string | null {
  for (const re of DATE_PATTERNS) {
    re.lastIndex = 0;
    const m = re.exec(text);
    if (m && m[1]) {
      let s = m[1].replace(/(\d{1,2})(st|nd|rd|th)\b/gi, '$1').replace(/(\d{1,2})(20\d{2})/, '$1 $2').trim();
      const now = new Date();
      let d = new Date(s);
      if (!/\d{4}/.test(s)) {
        d = new Date(`${s} ${now.getFullYear()}`);
        if (!isNaN(d.getTime()) && d < now) d.setFullYear(now.getFullYear() + 1);
      }
      if (!isNaN(d.getTime()) && d.getFullYear() >= 2020 && d.getFullYear() <= 2035) {
        return d.toISOString().split('T')[0];
      }
    }
  }
  return null;
}

// ── Exported parser result ────────────────────────────────────────────────────

export interface LocalParsedCoupon {
  couponCode:    string;
  brandName:     string;
  category:      string;
  discountType:  string | null;
  discountValue: number | null;
  discountText:  string;
  minOrder:      number | null;
  maxDiscount:   number | null;
  expiryDate:    string | null;
  confidence:    number;
}

export function parseLocally(ocrText: string): LocalParsedCoupon {
  const text = ocrText.trim();
  let confidence = 0;

  const couponCode = findBestCode(text);
  if (couponCode) confidence += 0.4;

  const { discountType, discountValue, discountText, minOrder, maxDiscount } = extractDiscount(text);
  if (discountValue) confidence += 0.2;

  const expiryDate = extractExpiry(text);
  if (expiryDate) confidence += 0.2;

  const { brand: brandName, category } = detectBrand(text);
  if (brandName !== 'Unknown') confidence += 0.1;

  return {
    couponCode, brandName, category,
    discountType, discountValue, discountText,
    minOrder, maxDiscount, expiryDate,
    confidence: Math.min(confidence, 1),
  };
}
