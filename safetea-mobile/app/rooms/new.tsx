import { View, Text, TextInput, StyleSheet, Pressable, Alert, ActivityIndicator, Switch } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/colors';
import { api } from '../../services/api';

export default function CreateRoomScreen() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || loading) return;
    setLoading(true);
    try {
      const res = await api.createRoom({ name: name.trim(), description: description.trim(), is_private: isPrivate });
      if (res.status === 200 || res.status === 201) {
        const d = res.data as any;
        const joinCode = d.join_code || d.joinCode || '';
        Alert.alert('Room Created!', joinCode ? `Share this code with others: ${joinCode}` : 'Your room is ready.');
        const roomId = d.room_id || d.id;
        if (roomId) router.replace('/rooms/' + roomId);
        else router.replace('/rooms');
      } else {
        Alert.alert('Error', (res.data as any)?.error || 'Failed to create room.');
      }
    } catch {
      Alert.alert('Error', 'Network error. Please try again.');
    }
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Create a Room</Text>
        <Text style={styles.label}>Room Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. My Safety Circle"
          placeholderTextColor={Colors.textMuted}
          value={name}
          onChangeText={setName}
          autoFocus
        />
        <Text style={styles.label}>Description (optional)</Text>
        <TextInput
          style={[styles.input, { minHeight: 80 }]}
          placeholder="What's this room about?"
          placeholderTextColor={Colors.textMuted}
          value={description}
          onChangeText={setDescription}
          multiline
          textAlignVertical="top"
        />
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Private (invite-only)</Text>
          <Switch value={isPrivate} onValueChange={setIsPrivate} trackColor={{ true: Colors.coral }} />
        </View>
        <Pressable
          style={[styles.createBtn, (!name.trim() || loading) && { opacity: 0.4 }]}
          onPress={handleCreate}
          disabled={!name.trim() || loading}
        >
          {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.createBtnText}>Create Room</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: Spacing.lg },
  card: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.xl },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.lg },
  label: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary, marginBottom: Spacing.xs },
  input: { backgroundColor: Colors.background, borderRadius: BorderRadius.md, padding: Spacing.md, color: Colors.textPrimary, fontSize: FontSize.md, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg, paddingVertical: Spacing.sm },
  switchLabel: { fontSize: FontSize.md, color: Colors.textPrimary },
  createBtn: { backgroundColor: Colors.coral, padding: Spacing.md, borderRadius: BorderRadius.lg, alignItems: 'center' },
  createBtnText: { color: '#FFF', fontWeight: '700', fontSize: FontSize.lg },
});
