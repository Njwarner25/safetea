import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { Colors } from '../constants/colors';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
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
    </>
  );
}
