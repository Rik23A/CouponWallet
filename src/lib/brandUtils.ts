// CouponVault Backend — Brand Utilities
export function resolvePackageName(brandName: string): string {
  const lower = brandName.toLowerCase();
  
  if (lower.includes('swiggy')) return 'in.swiggy.android';
  if (lower.includes('zomato')) return 'com.application.zomato';
  if (lower.includes('myntra')) return 'com.myntra.android';
  if (lower.includes('flipkart')) return 'com.flipkart.android';
  if (lower.includes('amazon')) return 'in.amazon.mShop.android.shopping';
  if (lower.includes('gpay') || lower.includes('google pay')) return 'com.google.android.apps.nbu.paisa.user';
  if (lower.includes('phonepe')) return 'com.phonepe.app';
  if (lower.includes('paytm')) return 'net.one97.paytm';
  if (lower.includes('bigbasket')) return 'com.bigbasket.mobileapp';
  if (lower.includes('blinkit') || lower.includes('grofers')) return 'com.grofers.customerapp';
  if (lower.includes('zepto')) return 'com.zepto.app';
  if (lower.includes('cred')) return 'com.dreamplug.androidapp';
  if (lower.includes('nykaa')) return 'com.nykaa.client';
  if (lower.includes('ajio')) return 'com.ril.ajio';
  if (lower.includes('meesho')) return 'com.meesho.supply';
  if (lower.includes('jiomart')) return 'com.jiomart.online';
  if (lower.includes('uber')) return 'com.ubercab';
  if (lower.includes('ola')) return 'com.ola.client';
  if (lower.includes('dominos')) return 'com.dominospizza.anz';
  if (lower.includes('kfc')) return 'com.yum.kfc.android';
  if (lower.includes('mcdonalds')) return 'com.mcd.android';
  
  return '';
}
