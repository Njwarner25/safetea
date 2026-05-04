// Apple StoreKit wrapper for LinkHer (iOS) — required by Apple's IAP guideline 3.1.1.
// Android continues using Stripe via the existing services/api.ts subscribe flow.
//
// Product IDs MUST match what's configured in App Store Connect under the
// "LinkHer Plus" subscription group (group id 22066294). Monthly is $9.99,
// yearly is $59.99.
import { Platform } from 'react-native';
import * as RNIap from 'react-native-iap';
import { api } from './api';

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

let isConnected = false;
let purchaseUpdateSub: { remove: () => void } | null = null;
let purchaseErrorSub: { remove: () => void } | null = null;

function isIOS() {
  return Platform.OS === 'ios';
}

export async function initIAP(): Promise<boolean> {
  if (!isIOS()) return false;
  if (isConnected) return true;
  try {
    await RNIap.initConnection();
    isConnected = true;
    return true;
  } catch (err) {
    console.warn('[iap] initConnection failed', err);
    return false;
  }
}

export async function endIAP(): Promise<void> {
  if (!isIOS() || !isConnected) return;
  try {
    purchaseUpdateSub?.remove();
    purchaseErrorSub?.remove();
    purchaseUpdateSub = null;
    purchaseErrorSub = null;
    await RNIap.endConnection();
  } catch {
    /* swallow */
  }
  isConnected = false;
}

export async function getProducts(): Promise<IAPProduct[]> {
  if (!isIOS()) return [];
  await initIAP();
  try {
    const subs = await RNIap.fetchProducts({ skus: [...IOS_PRODUCT_IDS], type: 'subs' });
    if (!subs) return [];
    return subs.map((s: any) => ({
      productId: s.productId ?? s.id,
      title: s.title || s.productId || s.id,
      description: s.description || '',
      localizedPrice: s.localizedPrice || s.displayPrice || s.price || '',
      price: String(s.price ?? ''),
      currency: s.currency || s.currencyCode || 'USD',
    }));
  } catch (err) {
    console.warn('[iap] fetchProducts failed', err);
    return [];
  }
}

/**
 * Begin a subscription purchase. Resolves when StoreKit accepts the request.
 * The actual transaction completion is delivered via the purchase listener
 * — call setupPurchaseListener() once at app start and handle results there.
 */
export async function purchaseSubscription(productId: IOSProductId): Promise<void> {
  if (!isIOS()) {
    throw new Error('IAP is iOS-only');
  }
  await initIAP();
  await RNIap.requestPurchase({
    request: { ios: { sku: productId } },
    type: 'subs',
  });
}

/**
 * Restore previous purchases (required for iOS approval — users must be able
 * to restore on a new device or after reinstall).
 */
export async function restorePurchases(): Promise<RNIap.Purchase[]> {
  if (!isIOS()) return [];
  await initIAP();
  try {
    const purchases = await RNIap.getAvailablePurchases();
    if (purchases.length > 0) {
      // The legacy app receipt covers all transactions on the device, so we
      // fetch it once and let the backend pick the latest active subscription.
      const receipt = await RNIap.getReceiptIOS();
      if (receipt) {
        await verifyReceiptWithBackend(receipt, purchases[0].productId);
      }
    }
    return purchases;
  } catch (err) {
    console.warn('[iap] restorePurchases failed', err);
    return [];
  }
}

type PurchaseHandlers = {
  onSuccess?: (productId: string) => void;
  onError?: (message: string) => void;
};

/**
 * Wire up StoreKit listeners. Call this once at app startup (e.g. in _layout).
 * On every successful purchase, the receipt is sent to our backend for
 * server-side validation, then finishTransaction() is called.
 */
export function setupPurchaseListener(handlers: PurchaseHandlers = {}) {
  if (!isIOS()) return () => {};

  purchaseUpdateSub?.remove();
  purchaseErrorSub?.remove();

  purchaseUpdateSub = RNIap.purchaseUpdatedListener(async (purchase: RNIap.Purchase) => {
    try {
      // StoreKit 2 doesn't expose a transactionReceipt field on the purchase;
      // pull the legacy app receipt (base64) which the backend's verifyReceipt
      // call expects.
      const receipt = await RNIap.getReceiptIOS();
      if (!receipt) {
        handlers.onError?.('Purchase succeeded but receipt was missing.');
        return;
      }
      const result = await verifyReceiptWithBackend(receipt, purchase.productId);
      if (result.ok) {
        await RNIap.finishTransaction({ purchase, isConsumable: false });
        handlers.onSuccess?.(purchase.productId);
      } else {
        handlers.onError?.(result.error || 'Receipt validation failed.');
      }
    } catch (err: any) {
      handlers.onError?.(err?.message || 'Could not verify purchase with server.');
    }
  });

  purchaseErrorSub = RNIap.purchaseErrorListener((err: RNIap.PurchaseError) => {
    if (err.code === RNIap.ErrorCode.UserCancelled) return;
    handlers.onError?.(err.message || 'Purchase failed.');
  });

  return () => {
    purchaseUpdateSub?.remove();
    purchaseErrorSub?.remove();
    purchaseUpdateSub = null;
    purchaseErrorSub = null;
  };
}

async function verifyReceiptWithBackend(
  receipt: string,
  productId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await api.verifyAppleReceipt(receipt, productId);
    if (res.status >= 200 && res.status < 300) {
      return { ok: true };
    }
    return { ok: false, error: (res.data as any)?.error || 'Server rejected receipt.' };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Network error during receipt validation.' };
  }
}
