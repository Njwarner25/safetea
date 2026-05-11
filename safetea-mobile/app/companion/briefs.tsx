import { useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Platform,
  RefreshControl,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import {
  Colors,
  Spacing,
  FontSize,
  BorderRadius,
  APP_NAME,
} from '../../constants/colors';
import { useBriefsStore, Brief } from '../../store/safetyBriefsStore';

// Map FontAwesome 6 icon names from the API to FontAwesome 5 names available
// in @expo/vector-icons. Unknown names fall back to the shield.
function faName(api: string): any {
  const map: Record<string, string> = {
    'fa-cloud-bolt': 'cloud-showers-heavy',
    'fa-road-bridge': 'road',
    'fa-square-parking': 'parking',
    'fa-train-subway': 'subway',
    'fa-tree': 'tree',
    'fa-martini-glass': 'glass-martini-alt',
    'fa-house': 'home',
    'fa-shield-halved': 'shield-alt',
    'fa-moon': 'moon',
    'fa-car': 'car',
    'fa-people-group': 'users',
    'fa-route': 'route',
    'fa-location-dot': 'map-marker-alt',
  };
  return map[api] || 'shield-alt';
}

function actionLabel(a: string): string {
  const labels: Record<string, string> = {
    share_location: 'Share Location',
    check_in: 'Start Check-In',
    safer_route: 'Safer Route',
    notify_contact: 'Notify Contact',
    safe_walk: 'Start Safe Walk',
    dismiss: 'Dismiss',
  };
  return labels[a] || a;
}

function subline(b: Brief): string {
  if (b.source) return `Source: ${b.source}`;
  return 'Recent activity';
}

export default function BriefsScreen() {
  const router = useRouter();
  const { briefs, loading, error, load, dismiss } = useBriefsStore();

  useEffect(() => {
    load();
  }, [load]);

  const handleAction = (a: string, id: string) => {
    if (a === 'dismiss') return dismiss(id);
    if (a === 'share_location') return router.push('/safelink' as any);
    if (a === 'check_in') return router.push('/date-status' as any);
    if (a === 'safe_walk') return router.push('/pulse' as any);
    if (a === 'safer_route') {
      const url =
        Platform.OS === 'ios'
          ? 'http://maps.apple.com/?dirflg=w'
          : 'https://maps.google.com/?dirflg=w';
      Linking.openURL(url).catch(() => {});
      return;
    }
    if (a === 'notify_contact') {
      router.push('/safelink' as any);
      return;
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      {/* SafeTea-branded header (uses APP_NAME so iOS rebrand still works) */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.iconBtn}>
          <FontAwesome5 name="chevron-left" size={18} color={Colors.textPrimary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.eyebrow}>{APP_NAME} · SAFETY BRIEFS</Text>
          <Text style={styles.headerTitle}>Alessia has a few notes for you</Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => load()}
            tintColor={Colors.coral}
          />
        }
      >
        {loading && briefs.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator size="small" color={Colors.coral} />
            <Text style={styles.muted}>Checking your area…</Text>
          </View>
        ) : null}

        {briefs.map((b) => {
          const severe = b.severity === 'severe' || b.severity === 'urgent';
          return (
            <View
              key={b.id}
              style={[styles.card, severe && styles.cardSevere]}
            >
              <View style={styles.cardHead}>
                <View style={styles.cardIcon}>
                  <FontAwesome5
                    name={faName(b.icon)}
                    size={16}
                    color={Colors.coral}
                    solid
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardType}>{b.type}</Text>
                  <Text style={styles.cardSubline}>{subline(b)}</Text>
                </View>
                <Pressable
                  onPress={() => dismiss(b.id)}
                  hitSlop={10}
                  style={styles.iconBtn}
                >
                  <FontAwesome5
                    name="times"
                    size={14}
                    color={Colors.textMuted}
                  />
                </Pressable>
              </View>

              {/* Brand-neutral body from the API — render verbatim. */}
              <Text style={styles.cardBody}>{b.body}</Text>

              <View style={styles.cardActions}>
                {b.actions.map((a, idx) => {
                  const isDismiss = a === 'dismiss';
                  const primary = severe && !isDismiss && idx === 0;
                  return (
                    <Pressable
                      key={a + idx}
                      onPress={() => handleAction(a, b.id)}
                      style={[
                        styles.actionChip,
                        primary && styles.actionChipPrimary,
                        isDismiss && styles.actionChipDismiss,
                      ]}
                    >
                      <Text
                        style={[
                          styles.actionLabel,
                          primary && styles.actionLabelPrimary,
                        ]}
                      >
                        {actionLabel(a)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}

        {!loading && briefs.length === 0 && !error ? (
          <View style={styles.emptyState}>
            <FontAwesome5 name="shield-alt" size={32} color={Colors.coral} solid />
            <Text style={styles.emptyTitle}>All caught up.</Text>
            <Text style={styles.emptyBody}>
              Alessia will let you know if anything needs your attention.
            </Text>
          </View>
        ) : null}

        {error === 'location_denied' ? (
          <View style={styles.emptyState}>
            <FontAwesome5 name="map-marker-alt" size={28} color={Colors.coral} />
            <Text style={styles.emptyTitle}>Location off</Text>
            <Text style={styles.emptyBody}>
              Alessia needs your location to know which area to check on. Turn
              location on for {APP_NAME} and pull to refresh.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  headerCenter: { flex: 1 },
  eyebrow: {
    color: Colors.coral,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: '700',
    marginTop: 2,
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { padding: Spacing.md, gap: Spacing.md, paddingBottom: 40 },
  center: { paddingVertical: 40, alignItems: 'center', gap: 8 },
  muted: { color: Colors.textMuted, fontSize: FontSize.sm },
  card: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  cardSevere: {
    borderColor: Colors.coralDark,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.coralMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardType: {
    color: Colors.coral,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  cardSubline: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  cardBody: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  cardActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  actionChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceHover,
  },
  actionChipPrimary: {
    backgroundColor: Colors.coral,
    borderColor: Colors.coral,
  },
  actionChipDismiss: {
    backgroundColor: 'transparent',
    borderColor: Colors.border,
  },
  actionLabel: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  actionLabelPrimary: {
    color: Colors.textInverse,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 10,
  },
  emptyTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  emptyBody: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 20,
  },
});
