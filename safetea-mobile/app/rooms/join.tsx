import { View, Text, TextInput, StyleSheet, Pressable, Alert, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/colors';
import { api } from '../../services/api';

export default function JoinRoomScreen() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleJoin = async () => {
    if (!code.trim() || loading) return;
    setLoading(true);
    try {
      const res = await api.joinRoom({ join_code: code.trim().toUpperCase() });
      if (res.status === 200 || res.status === 201) {
        const roomId = (res.data as any)?.room_id || (res.data as any)?.id;
        Alert.alert('Joined!', 'You have joined the room.');
        if (roomId) router.replace('/rooms/' + roomId);
        else router.replace('/rooms');
      } else {
        Alert.alert('Error', (res.data as any)?.error || 'Invalid code or room not found.');
      }
    } catch {
      Alert.alert('Error', 'Network error. Please try again.');
    }
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Join a Room</Text>
        <Text style={styles.desc}>Enter the 6-digit code shared by the room creator.</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter room code"
          placeholderTextColor={Colors.textMuted}
          value={code}
          onChangeText={setCode}
          maxLength={10}
          autoCapitalize="characters"
          autoFocus
        />
        <Pressable
          style={[styles.joinBtn, (!code.trim() || loading) && { opacity: 0.4 }]}
          onPress={handleJoin}
          disabled={!code.trim() || loading}
        >
          {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.joinBtnText}>Join Room</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: Spacing.lg, justifyContent: 'center' },
  card: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.xl },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center', marginBottom: Spacing.xs },
  desc: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.xl },
  input: { backgroundColor: Colors.background, borderRadius: BorderRadius.md, padding: Spacing.md, color: Colors.textPrimary, fontSize: FontSize.xxl, textAlign: 'center', letterSpacing: 4, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.lg },
  joinBtn: { backgroundColor: Colors.coral, padding: Spacing.md, borderRadius: BorderRadius.lg, alignItems: 'center' },
  joinBtnText: { color: '#FFF', fontWeight: '700', fontSize: FontSize.lg },
});
