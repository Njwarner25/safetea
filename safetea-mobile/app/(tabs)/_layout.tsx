import { Tabs } from 'expo-router';
import { View, Image, Platform } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { Colors, APP_NAME } from '../../constants/colors';

const headerLogo = Platform.OS === 'ios'
  ? require('../../assets/icon-linkher.png')
  : require('../../assets/logo.png');

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.pink,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          paddingBottom: 8,
          paddingTop: 8,
          height: 70,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
        },
        headerStyle: {
          backgroundColor: Colors.background,
        },
        headerTintColor: Colors.textPrimary,
        headerTitleStyle: { fontWeight: '700' },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <FontAwesome5 name="home" size={size || 20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Alerts',
          headerShown: true,
          headerTitle: 'Alerts',
          headerStyle: { backgroundColor: Colors.background },
          tabBarIcon: ({ color, size }) => <FontAwesome5 name="bell" size={size || 20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: '',
          headerShown: true,
          headerTitle: 'New Post',
          headerStyle: { backgroundColor: Colors.background },
          tabBarIcon: () => (
            <View style={{
              width: 48, height: 48, borderRadius: 24,
              backgroundColor: Colors.pink,
              justifyContent: 'center', alignItems: 'center',
              marginBottom: 8,
              shadowColor: Colors.pink,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.4,
              shadowRadius: 8,
            }}>
              <FontAwesome5 name="plus" size={20} color="#FFF" />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Messages',
          headerShown: true,
          headerTitle: 'Messages',
          headerStyle: { backgroundColor: Colors.background },
          tabBarIcon: ({ color, size }) => <FontAwesome5 name="comment-dots" size={size || 20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          headerShown: true,
          headerTitle: 'Profile',
          headerStyle: { backgroundColor: Colors.background },
          tabBarIcon: ({ color, size }) => <FontAwesome5 name="user" size={size || 20} color={color} solid />,
        }}
      />
    </Tabs>
  );
}
