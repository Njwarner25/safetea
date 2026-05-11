import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { AlessiaScreen } from '../../components/companion/AlessiaScreen';
import { AlessiaGradientButton } from '../../components/companion/AlessiaGradientButton';
import { AlessiaLivePreview } from '../../components/companion/AlessiaLivePreview';
import {
  AlessiaColors,
  SKIN_TONES,
  HAIR_COLORS,
  EYE_COLORS,
  HAIRSTYLES,
  OUTFIT_STYLES,
  VOICE_TONES,
  PERSONALITY_TONES,
} from '../../constants/companion';
import { useAiCompanionStore } from '../../store/aiCompanionStore';

export default function Personalize() {
  const router = useRouter();
  const store = useAiCompanionStore();

  return (
    <AlessiaScreen>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={12}>
          <FontAwesome5 name="chevron-left" size={18} color={AlessiaColors.white} />
        </Pressable>
        <Text style={styles.title}>Personalize Alessia</Text>
        <View style={{ width: 28 }} />
      </View>

      <AlessiaLivePreview
        styleId={store.styleId}
        skinTone={store.skinTone}
        hairColor={store.hairColor}
        eyeColor={store.eyeColor}
        outfit={store.outfit}
        hairstyle={store.hairstyle}
      />

      <Row label="Skin Tone">
        <SwatchRow colors={SKIN_TONES} value={store.skinTone} onChange={store.setSkinTone} />
      </Row>

      <Row label="Hairstyle">
        <ChipRow options={HAIRSTYLES} value={store.hairstyle} onChange={store.setHairstyle} />
      </Row>

      <Row label="Hair Color">
        <SwatchRow colors={HAIR_COLORS} value={store.hairColor} onChange={store.setHairColor} />
      </Row>

      <Row label="Eye Color">
        <SwatchRow colors={EYE_COLORS} value={store.eyeColor} onChange={store.setEyeColor} />
      </Row>

      <Row label="Outfit Style">
        <ChipRow options={OUTFIT_STYLES} value={store.outfit} onChange={store.setOutfit} />
      </Row>

      <Row label="Voice Tone">
        <ChipRow
          options={VOICE_TONES.map((v) => v.label)}
          value={VOICE_TONES.find((v) => v.id === store.voiceTone)?.label || ''}
          onChange={(label) => {
            const v = VOICE_TONES.find((x) => x.label === label);
            if (v) store.setVoiceTone(v.id);
          }}
        />
      </Row>

      <Row label="Personality Tone">
        <ChipRow
          options={PERSONALITY_TONES.map((p) => p.label)}
          value={PERSONALITY_TONES.find((p) => p.id === store.personality)?.label || ''}
          onChange={(label) => {
            const p = PERSONALITY_TONES.find((x) => x.label === label);
            if (p) store.setPersonality(p.id);
          }}
        />
      </Row>

      <AlessiaGradientButton label="Next" onPress={() => router.push('/companion/preview' as any)} />
    </AlessiaScreen>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {children}
    </View>
  );
}

function SwatchRow({
  colors,
  value,
  onChange,
}: {
  colors: string[];
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollRow}>
      {colors.map((c) => (
        <Pressable
          key={c}
          onPress={() => onChange(c)}
          style={[
            styles.swatch,
            { backgroundColor: c },
            value === c && styles.swatchSelected,
          ]}
        />
      ))}
    </ScrollView>
  );
}

function ChipRow({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((o) => {
        const selected = o === value;
        return (
          <Pressable
            key={o}
            onPress={() => onChange(o)}
            style={[styles.chip, selected && styles.chipSelected]}
          >
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{o}</Text>
          </Pressable>
        );
      })}
    </View>
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
    fontSize: 18,
    fontWeight: '700',
  },
  row: {
    gap: 10,
  },
  rowLabel: {
    color: AlessiaColors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  scrollRow: { gap: 12, paddingVertical: 4 },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchSelected: {
    borderColor: AlessiaColors.coral,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: AlessiaColors.borderMuted,
    backgroundColor: AlessiaColors.card,
  },
  chipSelected: {
    backgroundColor: 'rgba(255,107,107,0.18)',
    borderColor: AlessiaColors.coral,
  },
  chipText: {
    color: AlessiaColors.muted,
    fontSize: 13,
    fontWeight: '500',
  },
  chipTextSelected: {
    color: AlessiaColors.white,
    fontWeight: '700',
  },
});
