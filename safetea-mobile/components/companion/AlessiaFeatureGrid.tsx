import { View, Text, Pressable, StyleSheet } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ALESSIA_FEATURES, AlessiaColors } from '../../constants/companion';

export function AlessiaFeatureGrid() {
  const router = useRouter();
  return (
    <View>
      <Text style={styles.heading}>WHAT ALESSIA CAN DO FOR YOU</Text>
      <View style={styles.grid}>
        {ALESSIA_FEATURES.map((f) => (
          <Pressable
            key={f.id}
            style={styles.card}
            onPress={() => {
              if (f.route) router.push(f.route as any);
            }}
          >
            <View style={styles.iconWrap}>
              <FontAwesome5 name={f.icon as any} size={18} color={AlessiaColors.coral} solid />
            </View>
            <Text style={styles.title}>{f.title}</Text>
            <Text style={styles.desc}>{f.desc}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    color: AlessiaColors.coral,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    width: '48%',
    backgroundColor: AlessiaColors.card,
    borderColor: AlessiaColors.borderMuted,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,107,107,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    color: AlessiaColors.coral,
    fontSize: 14,
    fontWeight: '700',
  },
  desc: {
    color: AlessiaColors.muted,
    fontSize: 12,
    lineHeight: 16,
  },
});
