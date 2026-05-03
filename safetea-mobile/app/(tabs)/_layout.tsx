import { Tabs } from 'expo-router';
import { Image } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { Colors, APP_NAME } from '../../constants/colors';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.pink,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: 'rgba(255,255,255,0.06)',
          borderTopWidth: 1,
          paddingBottom: 8,
          paddingTop: 8,
          height: 65,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        headerStyle: {
          backgroundColor: Colors.surface,
        },
        headerTintColor: Colors.textPrimary,
        headerTitleStyle: { fontWeight: '700' },
        headerRight: () => (
          <Image
            source={require('../../assets/logo.png')}
            style={{ width: 32, height: 32, marginRight: 16 }}
            resizeMode="contain"
          />
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Community',
          headerTitle: `${APP_NAME} Community`,
          tabBarIcon: ({ color, size }) => <FontAwesome5 name="comments" size={size || 22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ color, size }) => <FontAwesome5 name="search" size={size || 22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: 'Post',
          tabBarIcon: ({ color, size }) => <FontAwesome5 name="plus-circle" size={size || 22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Tools',
          headerTitle: `${APP_NAME} Tools`,
          tabBarIcon: ({ color, size }) => <FontAwesome5 name="toolbox" size={size || 22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <FontAwesome5 name="user" size={size || 22} color={color} solid />,
        }}
      />
    </Tabs>
  );
}
