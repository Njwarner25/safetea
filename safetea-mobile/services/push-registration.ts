// Push-notification token registration for the SafeTea Android app.
// Mirrors the iOS-side work shipping from the Mac in safetea-capacitor-ios/.
//
// Flow:
//   1. Caller (root layout, after auth is restored) calls registerPushToken().
//   2. We ensure notification permissions are granted.
//   3. Fetch the Expo push token (works for both APNs and FCM via Expo's
//      push service, which fans out to the right transport).
//   4. POST it to /api/push/register-token along with platform.
//   5. The backend stores token + platform on the users row.
//
// No-ops gracefully if:
//   - permissions are denied
//   - the user isn't logged in
//   - the network call fails (will retry on next app launch)

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { API_BASE } from '../constants/api';
import { useAuthStore } from '../store/authStore';

let registered = false;

export async function registerPushToken(): Promise<void> {
  if (registered) return;

  try {
    // expo-notifications gracefully returns no token on simulators/emulators;
    // no need to gate via expo-device.
    const token = useAuthStore.getState().token;
    if (!token) {
      // Not signed in — try again next launch.
      return;
    }

    // Request permission if not already granted.
    const { status: existing } = await Notifications.getPermissionsAsync();
    let final = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      final = status;
    }
    if (final !== 'granted') {
      // User declined. Try again next launch.
      return;
    }

    // Get the Expo push token. Uses the EAS projectId from app config.
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ||
      Constants.easConfig?.projectId;

    const tokenResp = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();

    const expoToken = tokenResp.data;
    if (!expoToken) return;

    // POST to the backend.
    const res = await fetch(`${API_BASE}/api/push/register-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        token: expoToken,
        platform: Platform.OS, // 'ios' | 'android'
      }),
    });
    if (res.ok) {
      registered = true;
    }
  } catch (err) {
    // Silent. We try again on next launch.
    if (__DEV__) {
      console.warn('[push] registerPushToken failed', err);
    }
  }
}
