import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome5 } from '@expo/vector-icons';
import {
  AlessiaColors,
  AlessiaGradient,
  ALESSIA_STYLES,
  AlessiaStyleId,
} from '../../constants/companion';

interface Props {
  styleId: AlessiaStyleId;
  skinTone: string;
  hairColor: string;
  eyeColor: string;
  outfit: string;
  hairstyle: string;
  size?: number;
}

// Live, schematic representation of the user's Alessia customization. Composed
// from primitive shapes (no PNG artwork yet) so every choice the user makes is
// reflected immediately. Replaced with a real layered avatar once art lands.
export function AlessiaLivePreview({
  styleId,
  skinTone,
  hairColor,
  eyeColor,
  outfit,
  hairstyle,
  size = 140,
}: Props) {
  const styleDef = ALESSIA_STYLES.find((s) => s.id === styleId) || ALESSIA_STYLES[0];
  const headSize = size * 0.7;
  const eyeSize = headSize * 0.13;

  return (
    <View style={[styles.wrap, { width: size, height: size + 32 }]}>
      <LinearGradient
        colors={AlessiaGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }]}
      >
        <View
          style={[
            styles.head,
            {
              width: headSize,
              height: headSize,
              borderRadius: headSize / 2,
              backgroundColor: skinTone,
            },
          ]}
        >
          <View
            style={[
              styles.hair,
              {
                width: headSize,
                height: headSize * 0.42,
                backgroundColor: hairColor,
                borderTopLeftRadius: headSize / 2,
                borderTopRightRadius: headSize / 2,
              },
            ]}
          />
          <View style={[styles.eyesRow, { top: headSize * 0.5 }]}>
            <View
              style={{
                width: eyeSize,
                height: eyeSize,
                borderRadius: eyeSize / 2,
                backgroundColor: eyeColor,
              }}
            />
            <View style={{ width: headSize * 0.18 }} />
            <View
              style={{
                width: eyeSize,
                height: eyeSize,
                borderRadius: eyeSize / 2,
                backgroundColor: eyeColor,
              }}
            />
          </View>
          <View
            style={[
              styles.outfit,
              {
                width: headSize,
                height: headSize * 0.25,
                backgroundColor: AlessiaColors.rose,
              },
            ]}
          >
            <FontAwesome5 name={styleDef.icon as any} size={headSize * 0.14} color="#FFF" solid />
          </View>
        </View>
      </LinearGradient>
      <Text style={styles.caption}>
        {styleDef.label} · {hairstyle} · {outfit}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', alignSelf: 'center', gap: 8 },
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  head: {
    overflow: 'hidden',
    position: 'relative',
  },
  hair: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  eyesRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    left: 0,
    right: 0,
  },
  outfit: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: {
    color: AlessiaColors.muted,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});
