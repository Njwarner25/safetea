import { Pressable, StyleSheet, Animated, Text } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { Colors } from '../constants/colors';
import { useSafeWalkStore } from '../store/safeWalkStore';
import { useAuthStore } from '../store/authStore';
import SOSActionSheet from './SOSActionSheet';

export default function SOSFloatingButton() {
  const activeSession = useSafeWalkStore((s) => s.activeSession);
  const user = useAuthStore((s) => s.user);
  const [sheetVisible, setSheetVisible] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  // Only show when session is active and user is pro
  if (!activeSession || user?.tier === 'free') return null;

  return (
    <>
      <Animated.View style={[styles.container, { transform: [{ scale: pulseAnim }] }]}>
        <Pressable style={styles.button} onPress={() => setSheetVisible(true)}>
          <Text style={styles.text}>SOS</Text>
        </Pressable>
      </Animated.View>
      <SOSActionSheet visible={sheetVisible} onClose={() => setSheetVisible(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 90,
    right: 20,
    zIndex: 999,
  },
  button: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FF2222',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FF0000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 10,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  text: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1,
  },
});
