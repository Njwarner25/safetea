// Apple StoreKit wrapper — stubbed out pending react-native-iap compatibility fix.
// react-native-iap v12+ requires appTransactionID (iOS 17.4+) which fails on
// the current EAS build image. All IAP functions return no-ops until resolved.
//
// Product IDs match App Store Connect "LinkHer Plus" subscription group.

export const IOS_PRODUCT_IDS = [
  'linkher.plus.monthly',
  'linkher.plus.yearly',
] as const;

export type IOSProductId = (typeof IOS_PRODUCT_IDS)[number];

export type IAPProduct = {
  productId: string;
  title: string;
  description: string;
  localizedPrice: string;
  price: string;
  currency: string;
};

export async function initIAP(): Promise<boolean> {
  return false;
}

export async function endIAP(): Promise<void> {}

export async function getProducts(): Promise<IAPProduct[]> {
  return [];
}

export async function purchaseSubscription(_productId: IOSProductId): Promise<void> {
  throw new Error('IAP is temporarily unavailable');
}

export async function restorePurchases(): Promise<any[]> {
  return [];
}

type PurchaseHandlers = {
  onSuccess?: (productId: string) => void;
  onError?: (message: string) => void;
};

export function setupPurchaseListener(_handlers: PurchaseHandlers = {}) {
  return () => {};
}
