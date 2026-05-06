import { Redirect } from 'expo-router';
import { useAuthStore } from '../store/authStore';

export default function RootIndex() {
  const user = useAuthStore((s) => s.user);

  if (!user) {
    return <Redirect href="/(auth)/welcome" />;
  }

  return <Redirect href="/(tabs)" />;
}
