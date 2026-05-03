import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius, APP_NAME } from '../constants/colors';
import { useTetherStore, TetherMember } from '../store/tetherStore';

type ScreenView = 'idle' | 'config' | 'join' | 'pending' | 'active';

const DISTANCE_OPTIONS = [100, 200, 300, 400, 500];

const STATUS_COLORS: Record<string, string> = {
  active: Colors.success,
  idle: Colors.warning,
  separated: Colors.danger,
  offline: Colors.textMuted,
  ended: Colors.textMuted,
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Safe',
  idle: 'Idle',
  separated: 'Separated',
  offline: 'Offline',
  ended: 'Ended',
};

function timeAgo(dateStr?: string): string {
  if (!dateStr) return '--';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return mins + 'm ago';
  return Math.floor(mins / 60) + 'h ago';
}

export default function TetherScreen() {
  const router = useRouter();
  const store = useTetherStore();

  const [view, setView] = useState<ScreenView>('idle');
  const [sessionName, setSessionName] = useState("Girls' Night Out");
  const [threshold, setThreshold] = useState(300);
  const [nightMode, setNightMode] = useState(false);
  const [escalation, setEscalation] = useState(false);
  const [joinCode, setJoinCode] = useState('');

  // Sync view with store state
  useEffect(() => {
    if (store.session) {
      if (store.session.status === 'pending') {
        setView('pending');
      } else if (store.session.status === 'active' || store.session.status === 'locked') {
        setView('active');
      } else if (store.session.status === 'ended' || store.session.status === 'expired') {
        setView('idle');
      }
    }
  }, [store.session?.status]);

  // Auto-refresh status while active/pending
  useEffect(() => {
    if (view !== 'active' && view !== 'pending') return;
    const interval = setInterval(() => {
      store.refreshStatus();
    }, 10000);
    return () => clearInterval(interval);
  }, [view]);

  const handleCreate = useCallback(async () => {
    await store.createSession(sessionName, threshold, nightMode, escalation);
  }, [sessionName, threshold, nightMode, escalation]);

  const handleJoin = useCallback(async () => {
    if (joinCode.replace(/\s/g, '').length < 4) {
      Alert.alert('Invalid Code', 'Please enter a valid join code.');
      return;
    }
    // Mock coordinates for now
    await store.joinSession(joinCode.replace(/\s/g, ''), 40.7128, -74.006);
  }, [joinCode]);

  const handleLock = useCallback(async () => {
    Alert.alert('Lock Tether?', 'No one else will be able to join after locking.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Lock', onPress: () => store.lockSession() },
    ]);
  }, []);

  const handleEnd = useCallback(() => {
    Alert.alert('End Tether?', 'This will end the session for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Session',
        style: 'destructive',
        onPress: async () => {
          await store.endSession();
          store.reset();
          setView('idle');
        },
      },
    ]);
  }, []);

  const handleRespond = useCallback((response: 'okay' | 'heading_back' | 'need_help') => {
    store.respond(response);
  }, []);

  // ─── Idle View ───
  const renderIdle = () => (
    <View style={styles.centered}>
      <FontAwesome5 name="users" size={48} color={Colors.info} style={styles.heroIcon} />
      <Text style={styles.heroTitle}>{APP_NAME} Tether</Text>
      <Text style={styles.heroSub}>Stay connected with your group</Text>

      <Pressable style={[styles.bigButton, { backgroundColor: Colors.coral }]} onPress={() => setView('config')}>
        <FontAwesome5 name="plus-circle" size={20} color={Colors.textPrimary} />
        <Text style={styles.bigButtonText}>Start Tether</Text>
      </Pressable>

      <Pressable style={[styles.bigButton, { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.info }]} onPress={() => setView('join')}>
        <FontAwesome5 name="sign-in-alt" size={20} color={Colors.info} />
        <Text style={[styles.bigButtonText, { color: Colors.info }]}>Join Tether</Text>
      </Pressable>

      <View style={styles.explainerCard}>
        <FontAwesome5 name="info-circle" size={14} color={Colors.textSecondary} />
        <Text style={styles.explainerText}>
          Tether keeps your group connected. If someone separates beyond the set distance, everyone gets alerted.
        </Text>
      </View>
    </View>
  );

  // ─── Join View ───
  const renderJoin = () => (
    <View style={styles.centered}>
      <FontAwesome5 name="keyboard" size={36} color={Colors.info} style={styles.heroIcon} />
      <Text style={styles.sectionTitle}>Enter Join Code</Text>
      <Text style={styles.sectionSub}>Ask the host for the 6-digit code</Text>

      <TextInput
        style={styles.codeInput}
        value={joinCode}
        onChangeText={setJoinCode}
        placeholder="000000"
        placeholderTextColor={Colors.textMuted}
        keyboardType="number-pad"
        maxLength={7}
        textAlign="center"
      />

      <Pressable
        style={[styles.actionButton, { backgroundColor: Colors.info, opacity: store.loading ? 0.6 : 1 }]}
        onPress={handleJoin}
        disabled={store.loading}
      >
        {store.loading ? (
          <ActivityIndicator color={Colors.textPrimary} />
        ) : (
          <Text style={styles.actionButtonText}>Join Session</Text>
        )}
      </Pressable>

      <Pressable style={styles.linkButton} onPress={() => setView('idle')}>
        <Text style={styles.linkButtonText}>Back</Text>
      </Pressable>
    </View>
  );

  // ─── Config View ───
  const renderConfig = () => (
    <ScrollView contentContainerStyle={styles.configContainer}>
      <Text style={styles.sectionTitle}>Create Tether</Text>

      <Text style={styles.label}>Session Name</Text>
      <TextInput
        style={styles.textInput}
        value={sessionName}
        onChangeText={setSessionName}
        placeholder="Girls' Night Out"
        placeholderTextColor={Colors.textMuted}
      />

      <Text style={styles.label}>Distance Threshold (ft)</Text>
      <View style={styles.chipRow}>
        {DISTANCE_OPTIONS.map((d) => (
          <Pressable
            key={d}
            style={[styles.chip, threshold === d && styles.chipActive]}
            onPress={() => setThreshold(d)}
          >
            <Text style={[styles.chipText, threshold === d && styles.chipTextActive]}>{d}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable style={styles.toggleRow} onPress={() => setNightMode(!nightMode)}>
        <View style={styles.toggleInfo}>
          <Text style={styles.toggleLabel}>Night Mode</Text>
          <Text style={styles.toggleDesc}>Enhanced alerts for dark/loud venues</Text>
        </View>
        <View style={[styles.toggleTrack, nightMode && styles.toggleTrackActive]}>
          <View style={[styles.toggleThumb, nightMode && styles.toggleThumbActive]} />
        </View>
      </Pressable>

      <Pressable style={styles.toggleRow} onPress={() => setEscalation(!escalation)}>
        <View style={styles.toggleInfo}>
          <Text style={styles.toggleLabel}>Emergency Escalation</Text>
          <Text style={styles.toggleDesc}>Auto-notify emergency contacts if no response</Text>
        </View>
        <View style={[styles.toggleTrack, escalation && styles.toggleTrackActive]}>
          <View style={[styles.toggleThumb, escalation && styles.toggleThumbActive]} />
        </View>
      </Pressable>

      <Pressable
        style={[styles.actionButton, { backgroundColor: Colors.coral, marginTop: Spacing.lg, opacity: store.loading ? 0.6 : 1 }]}
        onPress={handleCreate}
        disabled={store.loading}
      >
        {store.loading ? (
          <ActivityIndicator color={Colors.textPrimary} />
        ) : (
          <>
            <FontAwesome5 name="link" size={16} color={Colors.textPrimary} />
            <Text style={styles.actionButtonText}>Create Tether</Text>
          </>
        )}
      </Pressable>

      <Pressable style={styles.linkButton} onPress={() => setView('idle')}>
        <Text style={styles.linkButtonText}>Back</Text>
      </Pressable>
    </ScrollView>
  );

  // ─── Pending View ───
  const renderPending = () => (
    <View style={styles.centered}>
      <Text style={styles.sectionTitle}>Waiting for Group</Text>
      <Text style={styles.sectionSub}>Share this code with friends nearby</Text>

      <View style={styles.codeDisplay}>
        <Text style={styles.codeDisplayText}>
          {(store.joinCode ?? '------').split('').join(' ')}
        </Text>
      </View>

      <Text style={styles.memberCount}>
        {store.members.length} {store.members.length === 1 ? 'member' : 'members'} joined
      </Text>

      {store.members.map((m) => (
        <View key={m.id} style={styles.memberRow}>
          <FontAwesome5 name="user-circle" size={20} color={Colors.textSecondary} />
          <Text style={styles.memberName}>{m.displayName}</Text>
          <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[m.status] }]} />
        </View>
      ))}

      <Pressable
        style={[
          styles.actionButton,
          {
            backgroundColor: Colors.info,
            marginTop: Spacing.lg,
            opacity: store.members.length < 2 || store.loading ? 0.4 : 1,
          },
        ]}
        onPress={handleLock}
        disabled={store.members.length < 2 || store.loading}
      >
        {store.loading ? (
          <ActivityIndicator color={Colors.textPrimary} />
        ) : (
          <>
            <FontAwesome5 name="lock" size={16} color={Colors.textPrimary} />
            <Text style={styles.actionButtonText}>Lock Tether</Text>
          </>
        )}
      </Pressable>
      {store.members.length < 2 && (
        <Text style={styles.hintText}>Need at least 2 members to lock</Text>
      )}

      <Pressable style={[styles.linkButton, { marginTop: Spacing.md }]} onPress={handleEnd}>
        <Text style={[styles.linkButtonText, { color: Colors.danger }]}>Cancel Session</Text>
      </Pressable>
    </View>
  );

  // ─── Active View ───
  const renderActive = () => {
    const myMember = store.members.find((m) => m.role === (store.isHost ? 'host' : 'member'));
    const isSeparated = myMember?.status === 'separated';

    return (
      <ScrollView contentContainerStyle={styles.activeContainer}>
        <View style={styles.activeHeader}>
          <FontAwesome5 name="link" size={16} color={Colors.success} />
          <Text style={styles.activeTitle}>{store.session?.sessionName ?? 'Tether Active'}</Text>
        </View>
        <Text style={styles.activeSub}>
          Threshold: {store.session?.distanceThresholdFt ?? 300} ft
        </Text>

        {store.members.map((member) => (
          <MemberCard
            key={member.id}
            member={member}
            onPing={() => store.pingMember(member.userId)}
            isSelf={member.userId === 'self' || (store.isHost && member.role === 'host')}
          />
        ))}

        {isSeparated && (
          <View style={styles.responseSection}>
            <Text style={styles.responseSectionTitle}>You are separated from the group</Text>
            <View style={styles.responseRow}>
              <Pressable style={[styles.responseBtn, { backgroundColor: Colors.successMuted }]} onPress={() => handleRespond('okay')}>
                <FontAwesome5 name="check-circle" size={18} color={Colors.success} />
                <Text style={[styles.responseBtnText, { color: Colors.success }]}>I'm Okay</Text>
              </Pressable>
              <Pressable style={[styles.responseBtn, { backgroundColor: Colors.warningMuted }]} onPress={() => handleRespond('heading_back')}>
                <FontAwesome5 name="walking" size={18} color={Colors.warning} />
                <Text style={[styles.responseBtnText, { color: Colors.warning }]}>Heading Back</Text>
              </Pressable>
              <Pressable style={[styles.responseBtn, { backgroundColor: Colors.dangerMuted }]} onPress={() => handleRespond('need_help')}>
                <FontAwesome5 name="exclamation-triangle" size={18} color={Colors.danger} />
                <Text style={[styles.responseBtnText, { color: Colors.danger }]}>Need Help</Text>
              </Pressable>
            </View>
          </View>
        )}

        <Pressable style={[styles.endButton]} onPress={handleEnd}>
          <FontAwesome5 name="times-circle" size={16} color={Colors.danger} />
          <Text style={styles.endButtonText}>End Tether</Text>
        </Pressable>
      </ScrollView>
    );
  };

  // ─── Error banner ───
  const renderError = () =>
    store.error ? (
      <Pressable style={styles.errorBanner} onPress={() => useTetherStore.setState({ error: null })}>
        <Text style={styles.errorText}>{store.error}</Text>
        <FontAwesome5 name="times" size={12} color={Colors.danger} />
      </Pressable>
    ) : null;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <FontAwesome5 name="arrow-left" size={18} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Tether</Text>
        <View style={{ width: 40 }} />
      </View>

      {renderError()}

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {view === 'idle' && renderIdle()}
        {view === 'join' && renderJoin()}
        {view === 'config' && renderConfig()}
        {view === 'pending' && renderPending()}
        {view === 'active' && renderActive()}
      </ScrollView>

      <Text style={styles.disclaimer}>
        Location accuracy may vary. {APP_NAME} Tether is a communication tool and does not guarantee safety.
      </Text>
    </View>
  );
}

// ─── Member Card Component ───
function MemberCard({
  member,
  onPing,
  isSelf,
}: {
  member: TetherMember;
  onPing: () => void;
  isSelf: boolean;
}) {
  const statusColor = STATUS_COLORS[member.status] ?? Colors.textMuted;
  const statusLabel = STATUS_LABELS[member.status] ?? member.status;

  return (
    <View style={styles.memberCard}>
      <View style={styles.memberCardLeft}>
        <FontAwesome5
          name={member.role === 'host' ? 'crown' : 'user'}
          size={18}
          color={member.role === 'host' ? Colors.warning : Colors.textSecondary}
        />
        <View style={styles.memberCardInfo}>
          <Text style={styles.memberCardName}>
            {member.displayName}
            {isSelf ? ' (You)' : ''}
          </Text>
          <View style={styles.memberCardMeta}>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '25' }]}>
              <View style={[styles.statusDotSmall, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusBadgeText, { color: statusColor }]}>{statusLabel}</Text>
            </View>
            {member.distanceFt != null && (
              <Text style={styles.distanceText}>{member.distanceFt} ft</Text>
            )}
            <Text style={styles.updateText}>{timeAgo(member.lastLocationUpdatedAt)}</Text>
          </View>
        </View>
      </View>
      {!isSelf && (
        <Pressable style={styles.pingBtn} onPress={onPing} hitSlop={8}>
          <FontAwesome5 name="bell" size={14} color={Colors.info} />
        </Pressable>
      )}
    </View>
  );
}

// ─── Styles ───
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  body: {
    flexGrow: 1,
    padding: Spacing.md,
  },
  centered: {
    alignItems: 'center',
    paddingTop: Spacing.xl,
  },

  // Hero
  heroIcon: {
    marginBottom: Spacing.md,
  },
  heroTitle: {
    fontSize: FontSize.xxl,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  heroSub: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    marginBottom: Spacing.xl,
  },

  // Buttons
  bigButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    width: '100%',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    minHeight: 52,
  },
  bigButtonText: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    width: '100%',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    minHeight: 52,
  },
  actionButtonText: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  linkButton: {
    marginTop: Spacing.md,
    padding: Spacing.sm,
  },
  linkButtonText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
  },

  // Explainer
  explainerCard: {
    flexDirection: 'row',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  explainerText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 18,
  },

  // Config
  configContainer: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  sectionTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  sectionSub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
    marginTop: Spacing.md,
  },
  textInput: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 4,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
  },
  chipRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    minWidth: 52,
    alignItems: 'center',
  },
  chipActive: {
    backgroundColor: Colors.coralMuted,
    borderColor: Colors.coral,
  },
  chipText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  chipTextActive: {
    color: Colors.coral,
    fontWeight: '600',
  },

  // Toggles
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toggleInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  toggleLabel: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  toggleDesc: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  toggleTrack: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surfaceLight,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleTrackActive: {
    backgroundColor: Colors.coral,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.textMuted,
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.textPrimary,
  },

  // Code input (join)
  codeInput: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    fontSize: FontSize.display,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: 8,
    width: '100%',
    marginBottom: Spacing.lg,
  },

  // Code display (pending)
  codeDisplay: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.info,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    marginBottom: Spacing.md,
  },
  codeDisplayText: {
    fontSize: FontSize.display,
    fontWeight: '700',
    color: Colors.info,
    letterSpacing: 6,
    textAlign: 'center',
  },
  memberCount: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    padding: Spacing.sm + 4,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    width: '100%',
    marginBottom: Spacing.xs,
  },
  memberName: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  hintText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },

  // Active dashboard
  activeContainer: {
    paddingBottom: Spacing.xxl,
  },
  activeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  activeTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  activeSub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },

  // Member card (active)
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  memberCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  memberCardInfo: {
    flex: 1,
  },
  memberCardName: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  memberCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  statusDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  distanceText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  updateText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  pingBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.infoMuted,
    borderRadius: BorderRadius.full,
  },

  // Response section
  responseSection: {
    backgroundColor: Colors.dangerMuted,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  responseSectionTitle: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.danger,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  responseRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  responseBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: Spacing.sm + 4,
    borderRadius: BorderRadius.md,
    minHeight: 60,
  },
  responseBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    textAlign: 'center',
  },

  // End button
  endButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    marginTop: Spacing.xl,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.danger,
    backgroundColor: Colors.dangerMuted,
  },
  endButtonText: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.danger,
  },

  // Error
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.dangerMuted,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  errorText: {
    fontSize: FontSize.sm,
    color: Colors.danger,
    flex: 1,
  },

  // Disclaimer
  disclaimer: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    paddingBottom: Spacing.lg,
  },
});
