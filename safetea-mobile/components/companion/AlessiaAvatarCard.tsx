import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome5 } from '@expo/vector-icons';
import { AlessiaColors, AlessiaGradient } from '../../constants/companion';

interface Props {
  icon: string;
  label?: string;
  size?: number;
  selected?: boolean;
}

// Stylized placeholder avatar — coral/peach radial gradient with a representative
// FontAwesome glyph centered. Replaced with real artwork once assets land.
export function AlessiaAvatarCard({ icon, label, size = 96, selected = false }: Props) {
  return (
    <View style={[styles.wrap, { width: size }]}>
      <View
        style={[
          styles.frame,
          { width: size, height: size, borderRadius: size / 2 },
          selected && styles.selected,
        ]}
      >
        <LinearGradient
          colors={AlessiaGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.gradient, { borderRadius: size / 2 }]}
        >
          <FontAwesome5 name={icon as any} size={size * 0.4} color="#FFF" solid />
        </LinearGradient>
      </View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 6 },
  frame: {
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selected: {
    borderColor: AlessiaColors.coral,
    shadowColor: AlessiaColors.coral,
    shadowOpacity: 0.6,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  gradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: AlessiaColors.white,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
});
