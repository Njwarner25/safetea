import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { AlessiaScreen } from '../../components/companion/AlessiaScreen';
import { AlessiaStyleSelector } from '../../components/companion/AlessiaStyleSelector';
import { AlessiaGradientButton } from '../../components/companion/AlessiaGradientButton';
import { AlessiaColors } from '../../constants/companion';
import { useAiCompanionStore } from '../../store/aiCompanionStore';

export default function ChooseStyle() {
  const router = useRouter();
  const styleId = useAiCompanionStore((s) => s.styleId);
  const setStyle = useAiCompanionStore((s) => s.setStyle);

  return (
    <AlessiaScreen>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={12}>
          <FontAwesome5 name="chevron-left" size={18} color={AlessiaColors.white} />
        </Pressable>
        <Text style={styles.title}>Choose Your{'\n'}Alessia Style</Text>
        <View style={{ width: 28 }} />
      </View>

      <AlessiaStyleSelector value={styleId} onChange={setStyle} />

      <AlessiaGradientButton label="Next" onPress={() => router.push('/companion/personalize' as any)} />
    </AlessiaScreen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  back: { padding: 4 },
  title: {
    color: AlessiaColors.white,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
});
