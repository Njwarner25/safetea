import { View, Text, StyleSheet, Pressable, FlatList, Alert, ActivityIndicator } from 'react-native';
import { useState, useMemo, useEffect, useRef } from 'react';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { FontAwesome5 } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/colors';
import { useAuthStore } from '../store/authStore';
import SOSFloatingButton from '../components/SOSFloatingButton';

// ---------------------------------------------------------------------------
// Situational Messages — calm, empowering, real-world
// ---------------------------------------------------------------------------
const SITUATIONAL_MESSAGES = [
  { situation: 'Riding the train alone?', reassurance: "Don't be afraid — SafeLink has you." },
  { situation: 'Walking alone?', reassurance: "You're not alone." },
  { situation: 'Heading home late?', reassurance: 'Stay connected.' },
  { situation: 'Something feels off?', reassurance: "Trust your instincts — we've got you." },
  { situation: 'Commuting late?', reassurance: "You don't have to do it alone." },
  { situation: 'In an unfamiliar place?', reassurance: 'SafeLink keeps you connected to people who care.' },
  { situation: 'Waiting for your ride?', reassurance: "We'll wait with you." },
  { situation: 'New city, new route?', reassurance: "You've got backup." },
  { situation: 'Late shift ending?', reassurance: "Let someone know you're on your way." },
  { situation: 'Parking garage feels empty?', reassurance: "You're still connected." },
  { situation: 'Long walk to your car?', reassurance: "We're with you every step." },
];

// ---------------------------------------------------------------------------
// Time-aware greeting
// ---------------------------------------------------------------------------
function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return 'Late night?';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Late night?';
}

// ---------------------------------------------------------------------------
// SafeLink Screen
// ---------------------------------------------------------------------------
export default function SafeLinkScreen() {
  const user = useAuthStore((s) => s.user);
  const [activeLink, setActiveLink] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sharingLocation, setSharingLocation] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pick a random situational message per mount
  const message = useMemo(() => {
    return SITUATIONAL_MESSAGES[Math.floor(Math.random() * SITUATIONAL_MESSAGES.length)];
  }, []);

  // Elapsed timer while link is active
  useEffect(() => {
    if (activeLink) {
      timerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setElapsedSeconds(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activeLink]);

  const formatElapsed = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // --- Free tier gate ---
  if (user?.tier === 'free') {
    return (
      <View style={styles.container}>
        <View style={styles.gateCard}>
          <Text style={styles.gateIcon}>🔗</Text>
          <Text style={styles.gateTitle}>SafeLink is a SafeTea+ Feature</Text>
          <Text style={styles.gateDesc}>
            Share a live safety link with trusted contacts when you're out. Upgrade to SafeTea+ to unlock.
          </Text>
          <Pressable style={styles.upgradeBtn} onPress={() => router.push('/subscription')}>
            <Text style={styles.upgradeBtnText}>Upgrade to SafeTea+</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // --- Activate SafeLink ---
  const handleActivate = async () => {
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Needed', 'SafeLink needs location access to share your position with trusted contacts.');
        setLoading(false);
        return;
      }
      setSharingLocation(true);
      setActiveLink(true);
      Alert.alert('SafeLink Active', 'Your trusted contacts can now see your live location.');
    } catch {
      Alert.alert('Error', 'Could not activate SafeLink. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // --- Deactivate SafeLink ---
  const handleDeactivate = () => {
    Alert.alert(
      'End SafeLink?',
      'Your trusted contacts will no longer see your location.',
      [
        { text: 'Keep Active', style: 'cancel' },
        {
          text: 'End Session',
          onPress: () => {
            setActiveLink(false);
            setSharingLocation(false);
          },
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        style={styles.container}
        data={[]}
        renderItem={() => null}
        ListHeaderComponent={
          <View>
            {/* ---- Situational Message Banner ---- */}
            <View style={styles.messageBanner}>
              <FontAwesome5 name="shield-alt" size={20} color={Colors.coral} style={{ marginBottom: Spacing.sm }} />
              <Text style={styles.messageSituation}>{message.situation}</Text>
              <Text style={styles.messageReassurance}>{message.reassurance}</Text>
            </View>

            {/* ---- Active Session Card ---- */}
            {activeLink ? (
              <View style={styles.activeCard}>
                <View style={styles.activeHeader}>
                  <Text style={styles.activeLabel}>SAFELINK ACTIVE</Text>
                  <View style={styles.liveDot} />
                </View>
                <Text style={styles.timerText}>{formatElapsed(elapsedSeconds)}</Text>
                <Text style={styles.sharingText}>
                  {sharingLocation ? '📍 Sharing live location with your trusted contacts' : 'Connected'}
                </Text>

                <View style={styles.statusRow}>
                  <View style={styles.statusChip}>
                    <FontAwesome5 name="map-marker-alt" size={12} color={Colors.success} />
                    <Text style={styles.statusChipText}>Location On</Text>
                  </View>
                  <View style={styles.statusChip}>
                    <FontAwesome5 name="users" size={12} color={Colors.success} />
                    <Text style={styles.statusChipText}>Contacts Notified</Text>
                  </View>
                </View>

                <Pressable style={styles.endBtn} onPress={handleDeactivate}>
                  <Text style={styles.endBtnText}>End SafeLink</Text>
                </Pressable>
              </View>
            ) : (
              /* ---- Start Card ---- */
              <View style={styles.startCard}>
                <Text style={styles.sectionTitle}>Start SafeLink</Text>
                <Text style={styles.startDesc}>
                  One tap shares your live location with your trusted contacts. They'll know where you are until you end the session.
                </Text>

                <Pressable
                  style={[styles.activateBtn, loading && styles.activateBtnDisabled]}
                  onPress={handleActivate}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <>
                      <FontAwesome5 name="link" size={16} color="#FFF" style={{ marginRight: 8 }} />
                      <Text style={styles.activateBtnText}>Activate SafeLink</Text>
                    </>
                  )}
                </Pressable>
              </View>
            )}

            {/* ---- How It Works ---- */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>How SafeLink Works</Text>
              <View style={styles.stepCard}>
                <View style={styles.stepNumber}><Text style={styles.stepNumberText}>1</Text></View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>Activate</Text>
                  <Text style={styles.stepDesc}>Tap to start sharing your live location.</Text>
                </View>
              </View>
              <View style={styles.stepCard}>
                <View style={styles.stepNumber}><Text style={styles.stepNumberText}>2</Text></View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>Stay Connected</Text>
                  <Text style={styles.stepDesc}>Your trusted contacts receive a link to follow your journey in real time.</Text>
                </View>
              </View>
              <View style={styles.stepCard}>
                <View style={styles.stepNumber}><Text style={styles.stepNumberText}>3</Text></View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>Arrive Safely</Text>
                  <Text style={styles.stepDesc}>End the session when you're safe. Your contacts are notified automatically.</Text>
                </View>
              </View>
            </View>

            {/* ---- Reassurance Footer ---- */}
            <View style={styles.footerCard}>
              <FontAwesome5 name="lock" size={14} color={Colors.textMuted} style={{ marginBottom: Spacing.xs }} />
              <Text style={styles.footerText}>
                Your location is only shared while SafeLink is active and only with contacts you choose. We never store or sell your location data.
              </Text>
            </View>
          </View>
        }
      />
      {activeLink && <SOSFloatingButton />}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: Spacing.md,
  },

  // Message banner
  messageBanner: {
    backgroundColor: Colors.coralMuted,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.coral + '30',
  },
  messageSituation: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 4,
  },
  messageReassurance: {
    fontSize: FontSize.md,
    color: Colors.coral,
    textAlign: 'center',
    fontWeight: '600',
  },

  // Active session
  activeCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 2,
    borderColor: Colors.success,
    marginBottom: Spacing.lg,
    alignItems: 'center',
  },
  activeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: Spacing.md,
  },
  activeLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.success,
    letterSpacing: 1,
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.success,
  },
  timerText: {
    fontSize: FontSize.display,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  sharingText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  statusRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.successMuted,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  statusChipText: {
    fontSize: FontSize.xs,
    color: Colors.success,
    fontWeight: '600',
  },
  endBtn: {
    borderWidth: 1,
    borderColor: Colors.danger,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
  },
  endBtnText: {
    color: Colors.danger,
    fontWeight: '600',
    fontSize: FontSize.sm,
  },

  // Start card
  startCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  startDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: Spacing.lg,
  },
  activateBtn: {
    backgroundColor: Colors.coral,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  activateBtnDisabled: { opacity: 0.5 },
  activateBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: FontSize.lg,
  },

  // How it works
  section: { marginBottom: Spacing.lg },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  stepCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.coralMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.coral,
  },
  stepContent: { flex: 1 },
  stepTitle: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  stepDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 18,
  },

  // Footer
  footerCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  footerText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },

  // Gate
  gateCard: {
    margin: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  gateIcon: { fontSize: 48, marginBottom: Spacing.md },
  gateTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  gateDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Spacing.lg,
  },
  upgradeBtn: {
    backgroundColor: Colors.coral,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  upgradeBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: FontSize.md,
  },
});
