import { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Easing } from 'react-native';
import { AlessiaColors } from '../../constants/companion';

interface Props {
  bars?: number;
  height?: number;
  active?: boolean;
}

// Decorative animated waveform — visual only, not tied to actual audio playback.
export function AlessiaVoicePulse({ bars = 24, height = 28, active = true }: Props) {
  const animations = useRef(
    Array.from({ length: bars }, () => new Animated.Value(Math.random()))
  ).current;

  useEffect(() => {
    if (!active) return;
    const loops = animations.map((val, i) => {
      const dur = 600 + ((i * 37) % 500);
      return Animated.loop(
        Animated.sequence([
          Animated.timing(val, {
            toValue: 1,
            duration: dur,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
          Animated.timing(val, {
            toValue: 0.2,
            duration: dur,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
        ])
      );
    });
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [active, animations]);

  return (
    <View style={[styles.row, { height }]}>
      {animations.map((val, i) => (
        <Animated.View
          key={i}
          style={{
            width: 3,
            marginHorizontal: 1.5,
            backgroundColor: i % 2 === 0 ? AlessiaColors.coral : AlessiaColors.peach,
            borderRadius: 2,
            height: val.interpolate({ inputRange: [0, 1], outputRange: [height * 0.18, height] }),
            opacity: val.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }),
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
