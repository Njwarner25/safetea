import { Stack } from 'expo-router';
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

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useScreenshotPrevention();

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
      </Stack>
      <PulseAreYouOkayPrompt />
    </>
  );
}
