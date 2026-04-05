import { View, Text, TextInput, Pressable, StyleSheet, Modal, ScrollView } from 'react-native';
import { useState } from 'react';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/colors';
import { useFakeCallStore, VOICE_PERSONAS, VoicePersona, CallStyle } from '../store/fakeCallStore';

interface FakeCallSettingsSheetProps {
  visible: boolean;
  onClose: () => void;
}

export default function FakeCallSettingsSheet({ visible, onClose }: FakeCallSettingsSheetProps) {
  const store = useFakeCallStore();
  const [name, setName] = useState(store.callerName);
  const [persona, setPersona] = useState<VoicePersona>(store.voicePersona);
  const [delay, setDelay] = useState(store.delaySeconds.toString());
  const [context, setContext] = useState(store.scriptContext);
  const [style, setStyle] = useState<CallStyle>(store.callStyle);

  const handleSave = () => {
    store.setCallerName(name.trim() || 'Mom');
    store.setVoicePersona(persona);
    const parsedDelay = parseInt(delay, 10);
    store.setDelaySeconds(isNaN(parsedDelay) ? 15 : Math.max(5, Math.min(60, parsedDelay)));
    store.setScriptContext(context);
    store.setCallStyle(style);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          <View style={styles.handle} />
          <Text style={styles.title}>Fake Call Settings</Text>
          <Text style={styles.subtitle}>Customize your fake incoming call</Text>

          <Text style={styles.label}>Caller Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Mom, Roommate, Boss"
            placeholderTextColor={Colors.textMuted}
          />

          <Text style={styles.label}>Voice Persona</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.personaRow}>
            {VOICE_PERSONAS.map((v) => (
              <Pressable
                key={v.id}
                style={[styles.personaChip, persona === v.id && styles.personaChipActive]}
                onPress={() => setPersona(v.id)}
              >
                <Text style={[styles.personaLabel, persona === v.id && styles.personaLabelActive]}>{v.label}</Text>
                <Text style={styles.personaDesc}>{v.desc}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={styles.label}>Phone Style</Text>
          <View style={styles.osRow}>
            <Pressable
              style={[styles.osChip, style === 'ios' && styles.osChipActive]}
              onPress={() => setStyle('ios')}
            >
              <Text style={[styles.osLabel, style === 'ios' && styles.osLabelActive]}>iPhone</Text>
            </Pressable>
            <Pressable
              style={[styles.osChip, style === 'android' && styles.osChipActive]}
              onPress={() => setStyle('android')}
            >
              <Text style={[styles.osLabel, style === 'android' && styles.osLabelActive]}>Android</Text>
            </Pressable>
          </View>

          <Text style={styles.label}>Delay (seconds)</Text>
          <TextInput
            style={styles.input}
            value={delay}
            onChangeText={setDelay}
            keyboardType="number-pad"
            placeholder="5-60"
            placeholderTextColor={Colors.textMuted}
          />
          <Text style={styles.hint}>How long before the fake call arrives (5-60 seconds)</Text>

          <Text style={styles.label}>Script Context (optional)</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={context}
            onChangeText={setContext}
            placeholder="e.g. I'm at a coffee shop downtown, make it sound like an emergency"
            placeholderTextColor={Colors.textMuted}
            multiline
            numberOfLines={3}
          />
          <Text style={styles.hint}>AI will generate a realistic script based on this context</Text>

          <Pressable style={styles.saveBtn} onPress={handleSave}>
            <Text style={styles.saveBtnText}>Save Settings</Text>
          </Pressable>

          <Pressable style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
    marginTop: Spacing.md,
  },
  input: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  textarea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  hint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 4,
  },
  saveBtn: {
    backgroundColor: Colors.coral,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  saveBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: FontSize.md,
  },
  cancelBtn: {
    marginTop: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  personaRow: {
    flexDirection: 'row',
    marginBottom: Spacing.xs,
  },
  personaChip: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginRight: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    minWidth: 110,
  },
  personaChipActive: {
    borderColor: Colors.coral,
    backgroundColor: Colors.coralMuted,
  },
  personaLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  personaLabelActive: {
    color: Colors.coral,
  },
  personaDesc: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  osRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  osChip: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  osChipActive: {
    borderColor: Colors.coral,
    backgroundColor: Colors.coralMuted,
  },
  osLabel: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  osLabelActive: {
    color: Colors.coral,
  },
});
