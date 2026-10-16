import { Tabs } from 'expo-router';
import { Image } from 'react-native';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' },
        headerLeft: () => (
          <Image
            source={require('../../assets/linkher-header-logo.png')}
            style={{ height: 32, resizeMode: 'contain' }}
          />
        ),
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
    </Tabs>
  );
}
