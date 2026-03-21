import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/colors';
import { useAuthStore } from '../store/authStore';

const PLANS = [
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
    name: 'SafeTea+',
    price: '$5.99',
    period: '/month',
    description: 'Full access to protect yourself',
    popular: true,
    features: [
      'Everything in Free',
      'Unlimited posts & searches',
      'Multi-city search',
      'Smart alerts & notifications',
      'SafeWalk date sharing',
      'AI Profile Screening (3/month)',
    ],
  },
  {
    id: 'pro',
    name: 'SafeTea Pro',
    price: '$9.99',
    period: '/month',
    description: 'Maximum protection, unlimited tools',
    features: [
      'Everything in SafeTea+',
      'Unlimited AI screening',
      'Background check credits (3/month)',
      'Safety map premium',
      'Scam database access',
      'Priority support',
    ],
  },
];

export default function SubscriptionScreen() {
  const user = useAuthStore((s) => s.user);
  const currentTier = user?.tier || 'free';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Subscription & Pricing</Text>
      <Text style={styles.subheading}>Choose the plan that fits your safety needs.</Text>

      {PLANS.map((plan) => {
        const isCurrent = plan.id === currentTier;
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
              ]}
            >
              <Text
                style={[
                  styles.planBtnText,
                  (plan.popular && !isCurrent) && styles.planBtnTextPopular,
                ]}
              >
                {isCurrent ? 'Current Plan' : plan.id === 'free' ? 'Downgrade' : 'Upgrade'}
              </Text>
            </Pressable>
          </View>
        );
      })}

      <View style={styles.modCallout}>
        <Text style={styles.modCalloutText}>
          💎 <Text style={styles.bold}>Volunteer moderators get all Pro features free.</Text>{' '}
          Our community mods are the backbone of SafeTea.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  heading: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.xs },
  subheading: { fontSize: FontSize.md, color: Colors.textSecondary, marginBottom: Spacing.xl },
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
  modCallout: {
    marginTop: Spacing.md, padding: Spacing.lg, borderWidth: 2, borderStyle: 'dashed',
    borderColor: 'rgba(232,81,63,0.3)', borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(232,81,63,0.04)',
  },
  modCalloutText: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  bold: { fontWeight: '700', color: Colors.textPrimary },
});
