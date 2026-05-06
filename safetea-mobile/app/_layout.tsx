import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { Colors } from '../constants/colors';
import { api } from '../services/api';
import { useAuthStore } from '../store/authStore';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await api.restoreToken();
        if ((api as any).token) {
          const res = await api.getMe();
          if (res.status === 200 && res.data) {
            const u = (res.data as any).user || res.data;
            if (u?.id) {
              if (u.subscription_tier) {
                u.tier = (u.subscription_tier === 'premium' || u.subscription_tier === 'pro') ? 'plus' : u.subscription_tier;
              }
              useAuthStore.getState().setUser(u);
            }
          }
        }
      } catch { /* continue without auth */ }
      setReady(true);
      await SplashScreen.hideAsync();
    })();
  }, []);

  if (!ready) return null;

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
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="post/[id]" options={{ headerShown: true, headerTitle: 'Post', headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.textPrimary }} />
        <Stack.Screen name="mod/dashboard" options={{ headerShown: true, headerTitle: 'Mod Dashboard', headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.textPrimary }} />
        <Stack.Screen name="mod/apply" options={{ headerShown: true, headerTitle: 'Become a Moderator', headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.textPrimary }} />
        <Stack.Screen name="tether" />
        <Stack.Screen name="pulse" options={{ headerShown: true, headerTitle: 'Pulse', headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.textPrimary }} />
        <Stack.Screen name="safelink" options={{ headerShown: true, headerTitle: 'SafeLink', headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.textPrimary }} />
        <Stack.Screen name="safewalk" options={{ headerShown: true, headerTitle: 'SafeWalk', headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.textPrimary }} />
        <Stack.Screen name="screening" options={{ headerShown: true, headerTitle: 'AI Screening', headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.textPrimary }} />
        <Stack.Screen name="safety-map" options={{ headerShown: true, headerTitle: 'Safety Map', headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.textPrimary }} />
        <Stack.Screen name="scam-database" options={{ headerShown: true, headerTitle: 'Scam Database', headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.textPrimary }} />
        <Stack.Screen name="fake-call" options={{ headerShown: true, headerTitle: 'Fake Call', headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.textPrimary }} />
        <Stack.Screen name="name-ping" options={{ headerShown: true, headerTitle: 'Name Ping', headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.textPrimary }} />
        <Stack.Screen name="vault" options={{ headerShown: true, headerTitle: 'Safety Vault', headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.textPrimary }} />
        <Stack.Screen name="subscription" options={{ headerShown: true, headerTitle: 'Subscription', headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.textPrimary }} />
        <Stack.Screen name="photo-verify" options={{ headerShown: true, headerTitle: 'Photo Verify', headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.textPrimary }} />
        <Stack.Screen name="conversation-scanner" options={{ headerShown: true, headerTitle: 'Chat Scanner', headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.textPrimary }} />
        <Stack.Screen name="messages/index" options={{ headerShown: true, headerTitle: 'Messages', headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.textPrimary }} />
        <Stack.Screen name="messages/[userId]" options={{ headerShown: true, headerTitle: 'Chat', headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.textPrimary }} />
        <Stack.Screen name="rooms/index" options={{ headerShown: true, headerTitle: 'Rooms', headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.textPrimary }} />
        <Stack.Screen name="rooms/[id]" options={{ headerShown: true, headerTitle: 'Room', headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.textPrimary }} />
        <Stack.Screen name="rooms/join" options={{ headerShown: true, headerTitle: 'Join Room', headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.textPrimary }} />
        <Stack.Screen name="rooms/new" options={{ headerShown: true, headerTitle: 'Create Room', headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.textPrimary }} />
      </Stack>
    </>
  );
}
