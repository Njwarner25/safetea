import { View, Text, StyleSheet, Pressable, ScrollView, Alert, ActivityIndicator, Linking, Platform } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { Colors, Spacing, FontSize, BorderRadius, APP_NAME, APP_NAME_PLUS } from '../constants/colors';
import { useAuthStore } from '../store/authStore';
import { api } from '../services/api';
import { getProducts, purchaseSubscription, restorePurchases, IOS_PRODUCT_IDS, IAPProduct } from '../services/iap';

const STRIPE_PRICES = {
  plus: 'price_1TDXLUFaKA9n89CXkfEotpfL',
};

const isIOS = Platform.OS === 'ios';

type Plan = {
  id: string;
  name: string;
  price: string;
  period: string;
  description: string;
  popular?: boolean;
  features: string[];
  appleProductId?: string;
};

function buildPlans(iosProducts: IAPProduct[]): Plan[] {
  // Default Stripe-priced plan shown on Android + web. On iOS we override the
  // price string with whatever StoreKit returns (Apple requires their pricing).
  const monthlyApple = iosProducts.find((p) => p.productId === 'safetea.plus.monthly');

  return [
    {
      id: 'free',
      name: 'Free',
      price: '$0',
      period: '/month',
      description: 'Essential safety features',
      features: [
        "Join your city's community",
        'Browse & read posts',
        'Post anonymously (3/month)',
        'Access safety resources',
        'DV hotline directory',
      ],
    },
    {
      id: 'plus',
      name: APP_NAME_PLUS,
      price: isIOS && monthlyApple ? monthlyApple.localizedPrice : '$7.99',
      period: '/month',
      description: 'Full access & maximum protection',
      popular: true,
      appleProductId: 'safetea.plus.monthly',
      features: [
        'Everything in Free',
        'Unlimited posts & searches',
        'Multi-city search',
        'Smart alerts & notifications (community)',
        'SafeWalk date sharing',
        'Name Ping \u2014 get alerted when someone you know is posted about',
        'Unlimited AI Profile Screening',
        'Advanced safety tools',
        'Safety map premium',
        'Scam database access',
        'Priority support',
      ],
    },
  ];
}

export default function SubscriptionScreen() {
  const user = useAuthStore((s) => s.user);
  const refreshUser = useAuthStore((s) => (s as any).refreshUser);
  const currentTier = user?.tier || 'free';
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [iosProducts, setIosProducts] = useState<IAPProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(isIOS);

  useEffect(() => {
    if (!isIOS) return;
    let cancelled = false;
    (async () => {
      try {
        const products = await getProducts();
        if (!cancelled) setIosProducts(products);
      } finally {
        if (!cancelled) setLoadingProducts(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleStripeUpgrade = useCallback(async (planId: string) => {
    const priceId = STRIPE_PRICES[planId as keyof typeof STRIPE_PRICES];
    if (!priceId) return;
    setLoadingPlan(planId);
    try {
      const res = await api.subscribe(priceId);
      if (res.status === 200 && (res.data as any)?.url) {
        await Linking.openURL((res.data as any).url);
      } else {
        const msg = (res.data as any)?.error || res.error || 'Failed to start checkout.';
        Alert.alert('Error', msg);
      }
    } catch {
      Alert.alert('Network Error', 'Could not reach the server. Please try again.');
    } finally {
      setLoadingPlan(null);
    }
  }, []);

  const handleAppleUpgrade = useCallback(async (productId: string) => {
    setLoadingPlan('plus');
    try {
      await purchaseSubscription(productId as any);
      // Result is delivered via the global purchase listener wired up in _layout.
      // We surface a hint here in case the listener has not fired yet.
    } catch (err: any) {
      if (err?.code !== 'E_USER_CANCELLED') {
        Alert.alert('Purchase Error', err?.message || 'Could not start purchase.');
      }
    } finally {
      setLoadingPlan(null);
    }
  }, []);

  const handleRestore = useCallback(async () => {
    try {
      await restorePurchases();
      if (typeof refreshUser === 'function') await refreshUser();
      Alert.alert('Restore Complete', 'Any active subscription has been restored.');
    } catch (err: any) {
      Alert.alert('Restore Failed', err?.message || 'Could not restore purchases.');
    }
  }, [refreshUser]);

  const handleManage = useCallback(() => {
    if (isIOS) {
      Linking.openURL('https://apps.apple.com/account/subscriptions');
    } else {
      Linking.openURL('https://billing.stripe.com/p/login/test');
    }
  }, []);

  const plans = buildPlans(iosProducts);
  const isAlreadyPlus = currentTier === 'plus' || currentTier === 'pro';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Subscription & Pricing</Text>
      <Text style={styles.subheading}>Choose the plan that fits your safety needs.</Text>

      {isIOS && loadingProducts && (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={Colors.coral} />
          <Text style={styles.loadingText}>Loading App Store pricing…</Text>
        </View>
      )}

      {plans.map((plan) => {
        const isCurrent = plan.id === currentTier || (plan.id === 'plus' && isAlreadyPlus);
        const onPress = () => {
          if (isCurrent || plan.id === 'free') return;
          if (isIOS && plan.appleProductId) {
            handleAppleUpgrade(plan.appleProductId);
          } else {
            handleStripeUpgrade(plan.id);
          }
        };
        return (
          <View
            key={plan.id}
            style={[
              styles.planCard,
              plan.popular && styles.popularCard,
              isCurrent && styles.currentCard,
            ]}
          >
            {plan.popular && <Text style={styles.popularBadge}>Most Popular</Text>}
            {isCurrent && <Text style={styles.currentBadge}>Current Plan</Text>}

            <Text style={styles.planName}>{plan.name}</Text>
            <View style={styles.priceRow}>
              <Text style={styles.price}>{plan.price}</Text>
              <Text style={styles.period}>{plan.period}</Text>
            </View>
            <Text style={styles.planDesc}>{plan.description}</Text>

            <View style={styles.featureList}>
              {plan.features.map((feature) => (
                <View key={feature} style={styles.featureItem}>
                  <Text style={styles.checkmark}>✓</Text>
                  <Text style={styles.featureText}>{feature}</Text>
                </View>
              ))}
            </View>

            <Pressable
              style={[
                styles.planBtn,
                isCurrent && styles.planBtnCurrent,
                plan.popular && !isCurrent && styles.planBtnPopular,
                loadingPlan === plan.id && styles.planBtnLoading,
              ]}
              onPress={onPress}
              disabled={isCurrent || plan.id === 'free' || loadingPlan !== null}
            >
              {loadingPlan === plan.id ? (
                <ActivityIndicator color={plan.popular ? '#FFF' : Colors.textSecondary} />
              ) : (
                <Text
                  style={[
                    styles.planBtnText,
                    (plan.popular && !isCurrent) && styles.planBtnTextPopular,
                  ]}
                >
                  {isCurrent ? 'Current Plan' : plan.id === 'free' ? 'Free Forever' : 'Upgrade'}
                </Text>
              )}
            </Pressable>
          </View>
        );
      })}

      {isIOS && (
        <View style={styles.restoreRow}>
          <Pressable onPress={handleRestore}>
            <Text style={styles.restoreLink}>Restore Purchases</Text>
          </Pressable>
          <Text style={styles.restoreDot}> · </Text>
          <Pressable onPress={handleManage}>
            <Text style={styles.restoreLink}>Manage Subscription</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.modCallout}>
        <Text style={styles.modCalloutText}>
          💎 <Text style={styles.bold}>Volunteer moderators get all {APP_NAME_PLUS} features free.</Text>{' '}
          Our community mods are the backbone of {APP_NAME}.
        </Text>
      </View>

      {isIOS && (
        <Text style={styles.appleNotice}>
          Subscriptions are billed by Apple and managed in your iOS Settings.
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  heading: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.xs },
  subheading: { fontSize: FontSize.md, color: Colors.textSecondary, marginBottom: Spacing.xl },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  loadingText: { color: Colors.textSecondary, fontSize: FontSize.sm },
  planCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.lg,
    marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  popularCard: { borderColor: Colors.coral, borderWidth: 2 },
  currentCard: { borderColor: Colors.success },
  popularBadge: {
    position: 'absolute', top: -10, right: Spacing.md,
    backgroundColor: Colors.coral, color: '#FFF', fontSize: FontSize.xs,
    fontWeight: '700', paddingHorizontal: Spacing.sm, paddingVertical: 2,
    borderRadius: BorderRadius.sm, overflow: 'hidden',
  },
  currentBadge: {
    position: 'absolute', top: -10, right: Spacing.md,
    backgroundColor: Colors.success, color: '#FFF', fontSize: FontSize.xs,
    fontWeight: '700', paddingHorizontal: Spacing.sm, paddingVertical: 2,
    borderRadius: BorderRadius.sm, overflow: 'hidden',
  },
  planName: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.xs },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: Spacing.xs },
  price: { fontSize: FontSize.display, fontWeight: '800', color: Colors.textPrimary },
  period: { fontSize: FontSize.sm, color: Colors.textMuted, marginLeft: 4 },
  planDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.lg },
  featureList: { marginBottom: Spacing.lg },
  featureItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  checkmark: { color: Colors.success, fontSize: FontSize.md, fontWeight: '700' },
  featureText: { fontSize: FontSize.sm, color: Colors.textPrimary },
  planBtn: {
    padding: Spacing.md, borderRadius: BorderRadius.lg, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  planBtnCurrent: { backgroundColor: Colors.successMuted, borderColor: Colors.success },
  planBtnPopular: { backgroundColor: Colors.coral, borderColor: Colors.coral },
  planBtnText: { fontWeight: '700', fontSize: FontSize.md, color: Colors.textSecondary },
  planBtnTextPopular: { color: '#FFF' },
  planBtnLoading: { opacity: 0.7 },
  restoreRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginVertical: Spacing.md },
  restoreLink: { color: Colors.coral, fontSize: FontSize.sm, fontWeight: '600' },
  restoreDot: { color: Colors.textMuted },
  modCallout: {
    marginTop: Spacing.md, padding: Spacing.lg, borderWidth: 2, borderStyle: 'dashed',
    borderColor: 'rgba(232,81,63,0.3)', borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(232,81,63,0.04)',
  },
  modCalloutText: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  bold: { fontWeight: '700', color: Colors.textPrimary },
  appleNotice: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.lg, paddingHorizontal: Spacing.md },
});
