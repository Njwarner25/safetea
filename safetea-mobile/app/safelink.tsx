import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Share,
  Alert,
} from 'react-native';
import { Stack } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useThemeColors } from '../constants/useThemeColors';
import { FontSize, Spacing, BorderRadius } from '../constants/colors';
import { API_BASE } from '../constants/api';
import { useAuthStore } from '../store/authStore';

const HEARTBEAT_MS = 30_000;

type Session = {
  session_key: string;
  label: string | null;
  contacts_notified: number;
  created_at: string;
} | null;

export default function SafeLinkScreen() {
  const colors = useThemeColors();
  const [session, setSession] = useState<Session>(null);
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const authedFetch = useCallback(async (path: string, init?: RequestInit) => {
    const token = useAuthStore.getState().token;
    return fetch(`${API_BASE}${path}`, {
      ...(init || {}),
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...((init?.headers as Record<string, string>) || {}),
      },
    });
  }, []);

  // Resume the active session on screen mount (if any).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch('/api/safelink/active');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.session?.session_key) {
          setSession(data.session);
        }
      } catch {
        // Silent: screen still usable from idle state.
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authedFetch]);

  // Heartbeat: while session is active, POST location every 30s.
  useEffect(() => {
    if (!session) return;
    const tick = async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        await authedFetch('/api/safelink/location', {
          method: 'POST',
          body: JSON.stringify({
            sessionKey: session.session_key,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          }),
        });
      } catch {
        // Heartbeat failures are non-fatal; the session keeps running on the server.
      }
    };
    tick();
    heartbeatRef.current = setInterval(tick, HEARTBEAT_MS);
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    };
  }, [session, authedFetch]);

  const start = async () => {
    setError(null);
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Location permission is needed to share your SafeLink.');
        setLoading(false);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const res = await authedFetch('/api/safelink/start', {
        method: 'POST',
        body: JSON.stringify({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setError('Please sign in to start a SafeLink.');
      } else if (res.status === 403) {
        setError(data?.error || 'SafeLink requires SafeTea+ ($7.99/mo).');
      } else if (!res.ok) {
        setError(data?.error || 'Could not start SafeLink. Try again.');
      } else if (data?.session?.session_key || data?.session_key) {
        const s = data.session || data;
        setSession({
          session_key: s.session_key,
          label: s.label ?? null,
          contacts_notified: s.contacts_notified ?? 0,
          created_at: s.created_at ?? new Date().toISOString(),
        });
      } else {
        setError('SafeLink started, but no session key was returned.');
      }
    } catch (e: any) {
      setError(e?.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const stop = () => {
    Alert.alert('Stop SafeLink?', 'Trusted contacts will no longer receive your live location.', [
      { text: 'Keep sharing', style: 'cancel' },
      {
        text: 'Stop',
        style: 'destructive',
        onPress: async () => {
          if (!session) return;
          setLoading(true);
          try {
            await authedFetch('/api/safelink/stop', {
              method: 'POST',
              body: JSON.stringify({ sessionKey: session.session_key }),
            });
          } catch {
            // Even if the server call fails, end locally — the heartbeat will stop and
            // the user can retry from a fresh state.
          } finally {
            setSession(null);
            setLoading(false);
          }
        },
      },
    ]);
  };

  const shareLink = async () => {
    if (!session) return;
    const url = `https://getsafetea.app/safelink-track.html?key=${encodeURIComponent(
      session.session_key,
    )}`;
    try {
      await Share.share({ message: `I'm sharing my live location with you via SafeTea. Track me here: ${url}` });
    } catch {
      // user cancelled
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'SafeLink',
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.textPrimary,
        }}
      />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.iconCircle, { backgroundColor: colors.pinkMuted }]}>
          <FontAwesome5
            name={session ? 'broadcast-tower' : 'link'}
            size={32}
            color={colors.pink}
          />
        </View>
        <Text style={[styles.title, { color: colors.textPrimary }]}>SafeLink</Text>

        {bootstrapping ? (
          <ActivityIndicator size="small" color={colors.pink} style={{ marginTop: Spacing.md }} />
        ) : session ? (
          <>
            <View style={[styles.activeBadge, { borderColor: colors.pink }]}>
              <View style={[styles.dot, { backgroundColor: colors.pink }]} />
              <Text style={[styles.activeText, { color: colors.pink }]}>SHARING NOW</Text>
            </View>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Your trusted contacts can see your live location. We're sending an update every 30 seconds.
            </Text>
            <View style={styles.buttonStack}>
              <Pressable
                onPress={shareLink}
                style={[styles.buttonPrimary, { backgroundColor: colors.pink }]}
              >
                <FontAwesome5 name="share-alt" size={14} color="#FFF" solid />
                <Text style={styles.buttonPrimaryText}>Share link</Text>
              </Pressable>
              <Pressable
                onPress={stop}
                disabled={loading}
                style={[styles.buttonSecondary, { borderColor: colors.border, opacity: loading ? 0.5 : 1 }]}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={colors.textPrimary} />
                ) : (
                  <>
                    <FontAwesome5 name="stop" size={14} color={colors.textPrimary} solid />
                    <Text style={[styles.buttonSecondaryText, { color: colors.textPrimary }]}>Stop sharing</Text>
                  </>
                )}
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Share a temporary live-location link with a trusted contact. Great for rides, walks, dates, or meetups. You control when it's active.
            </Text>
            <Pressable
              onPress={start}
              disabled={loading}
              style={[styles.buttonPrimary, { backgroundColor: colors.pink, opacity: loading ? 0.6 : 1 }]}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <FontAwesome5 name="play" size={14} color="#FFF" solid />
                  <Text style={styles.buttonPrimaryText}>Start SafeLink</Text>
                </>
              )}
            </Pressable>
            {error ? (
              <Text style={[styles.error, { color: colors.pink }]}>{error}</Text>
            ) : null}
          </>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
    marginBottom: Spacing.lg,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 4,
    marginBottom: Spacing.md,
  },
  activeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  buttonStack: {
    width: '100%',
    maxWidth: 320,
    gap: Spacing.sm,
  },
  buttonPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: BorderRadius.lg,
    minWidth: 220,
  },
  buttonPrimaryText: {
    color: '#FFF',
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  buttonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  buttonSecondaryText: {
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  error: {
    marginTop: Spacing.md,
    fontSize: FontSize.sm,
    textAlign: 'center',
    maxWidth: 320,
  },
});
