import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { Colors, APP_NAME_PLUS } from '../constants/colors';
import { useScreenshotPrevention } from '../utils/useScreenshotPrevention';
import PulseAreYouOkayPrompt from '../components/pulse/PulseAreYouOkayPrompt';
import { initIAP, setupPurchaseListener, endIAP } from '../services/iap';
import { registerPushToken } from '../services/push-registration';
import { useAuthStore } from '../store/authStore';
// expo-share-intent provides the native bridge that reads Android's
// ACTION_SEND EXTRA_STREAM. We lazy-require so that a missing install
// or an iOS build (where we've disabled the module in app.config.ts)
// doesn't error at Metro bundle time.
let _useShareIntent: any = null;
try {
  if (Platform.OS === 'android') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-share-intent');
    _useShareIntent = mod && (mod.useShareIntent || mod.default);
  }
} catch (e) {
  console.warn('[share-intent] module not available:', (e as any)?.message);
}
function useShareIntentSafe(opts?: any) {
  if (typeof _useShareIntent === 'function') return _useShareIntent(opts);
  return { hasShareIntent: false, shareIntent: null, resetShareIntent: () => {} };
}

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useScreenshotPrevention();

  // Listen for incoming Android share-sheet intents (SEND / SEND_MULTIPLE).
  // The hook returns the latest share payload; when it appears we route to
  // /share-receive with the file URI / mime / name as params, then clear
  // the native cache so re-entering the app doesn't re-fire.
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentSafe({
    resetOnBackground: true,
  });
  useEffect(() => {
    if (!hasShareIntent || !shareIntent) return;
    try {
      const files = shareIntent.files || [];
      const first = files[0];
      if (first) {
        // Android file fields: contentUri / filePath / fileName / mimeType / fileSize
        // iOS file fields: path / fileName / mimeType
        const uri = (first as any).contentUri || (first as any).filePath || (first as any).path || '';
        const mime = (first as any).mimeType || '';
        const name = (first as any).fileName || '';
        const size = (first as any).fileSize || '';
        if (uri) {
          router.push({
            pathname: '/share-receive' as any,
            params: { uri, mime, name, size: String(size || '') },
          });
        }
      } else if (shareIntent.text) {
        // Plain text shares — for now we toast and bail; future task can
        // store these as note entries.
        Alert.alert(
          'Text share received',
          'Saving text shares to the vault is coming soon. For now, please share a file.',
        );
      }
    } catch (err) {
      console.warn('[share-intent] dispatch failed:', (err as any)?.message);
    } finally {
      try { resetShareIntent(false); } catch (_) {}
    }
  }, [hasShareIntent, shareIntent, resetShareIntent]);

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  // Register the device push token with our backend once auth is restored.
  // Runs once on app start; the helper itself is idempotent and no-ops if
  // there's no auth token yet (will try again on the next launch).
  useEffect(() => {
    const token = useAuthStore.getState().token;
    if (!token) {
      const unsub = useAuthStore.subscribe((state: any) => {
        if (state.token) {
          registerPushToken();
          unsub();
        }
      });
      return unsub;
    }
    registerPushToken();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let teardown: (() => void) | null = null;
    (async () => {
      const ok = await initIAP();
      if (!ok) return;
      teardown = setupPurchaseListener({
        onSuccess: async () => {
          const refresh = (useAuthStore.getState() as any).refreshUser;
          if (typeof refresh === 'function') await refresh();
          Alert.alert(`${APP_NAME_PLUS} Active`, 'Thanks — your subscription is active.');
        },
        onError: (msg) => {
          Alert.alert('Purchase Issue', msg);
        },
      });
    })();
    return () => {
      teardown?.();
      endIAP();
    };
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="post/[id]"
          options={{
            headerShown: true,
            headerTitle: 'Post',
            headerStyle: { backgroundColor: Colors.surface },
            headerTintColor: Colors.textPrimary,
          }}
        />
        <Stack.Screen
          name="mod/dashboard"
          options={{
            headerShown: true,
            headerTitle: 'Mod Dashboard',
            headerStyle: { backgroundColor: Colors.surface },
            headerTintColor: Colors.textPrimary,
          }}
        />
        <Stack.Screen
          name="mod/apply"
          options={{
            headerShown: true,
            headerTitle: 'Become a Moderator',
            headerStyle: { backgroundColor: Colors.surface },
            headerTintColor: Colors.textPrimary,
          }}
        />
        <Stack.Screen
          name="tether"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="share-receive"
          options={{
            headerShown: true,
            headerTitle: 'Save to Vault',
            headerStyle: { backgroundColor: Colors.surface },
            headerTintColor: Colors.textPrimary,
          }}
        />
      </Stack>
      <PulseAreYouOkayPrompt />
    </>
  );
}
