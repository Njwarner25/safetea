import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';

// Configure foreground notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Register for push notifications and send the token to the backend.
 * Call this after successful login.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  try {
    // Check/request permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[Push] Permission not granted');
      return null;
    }

    // Get the Expo push token
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: '13404653-99fa-49c1-af47-c981dbd27027',
    });
    const token = tokenData.data;

    // Send token to backend
    const platform = Platform.OS === 'android' ? 'android' : 'ios';
    await api.registerPushToken(token, platform);

    console.log('[Push] Token registered:', token);
    return token;
  } catch (err) {
    console.error('[Push] Registration failed:', err);
    return null;
  }
}
