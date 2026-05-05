import { View, Text, FlatList, StyleSheet, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { router } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius, APP_NAME } from '../../constants/colors';
import { api } from '../../services/api';

interface Room {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  isPrivate: boolean;
  lastActivity?: string;
}

export default function RoomsScreen() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRooms = useCallback(async () => {
    try {
      const res = await api.getMyRooms();
      if (res.status === 200 && res.data) {
        const raw = Array.isArray(res.data) ? res.data : (res.data as any)?.rooms || [];
        setRooms(raw.map((r: any) => ({
          id: r.id?.toString(),
          name: r.name || 'Unnamed Room',
          description: r.description || '',
          memberCount: r.member_count || r.memberCount || 0,
          isPrivate: r.is_private ?? r.isPrivate ?? true,
          lastActivity: r.last_activity || r.lastActivity || '',
        })));
      }
    } catch { /* keep existing */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchRooms().finally(() => setRefreshing(false));
  }, [fetchRooms]);

  return (
    <View style={styles.container}>
      <View style={styles.actionBar}>
        <Pressable style={styles.actionBtn} onPress={() => router.push('/rooms/new')}>
          <FontAwesome5 name="plus" size={14} color={Colors.coral} />
          <Text style={styles.actionBtnText}>Create Room</Text>
        </Pressable>
        <Pressable style={styles.actionBtn} onPress={() => router.push('/rooms/join')}>
          <FontAwesome5 name="sign-in-alt" size={14} color={Colors.info} />
          <Text style={[styles.actionBtnText, { color: Colors.info }]}>Join with Code</Text>
        </Pressable>
      </View>
      <FlatList
        data={rooms}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable style={styles.roomCard} onPress={() => router.push('/rooms/' + item.id)}>
            <View style={styles.roomIcon}>
              <FontAwesome5 name={item.isPrivate ? 'lock' : 'users'} size={18} color={Colors.purple} />
            </View>
            <View style={styles.roomInfo}>
              <Text style={styles.roomName}>{item.name}</Text>
              {item.description ? <Text style={styles.roomDesc} numberOfLines={1}>{item.description}</Text> : null}
              <Text style={styles.roomMeta}>{item.memberCount} member{item.memberCount !== 1 ? 's' : ''}</Text>
            </View>
            <FontAwesome5 name="chevron-right" size={12} color={Colors.textMuted} />
          </Pressable>
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.coral} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={Colors.coral} style={{ marginTop: 60 }} />
          ) : (
            <View style={styles.empty}>
              <FontAwesome5 name="door-open" size={36} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No rooms yet</Text>
              <Text style={styles.emptySubtext}>Create a room or join one with a code</Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  actionBar: { flexDirection: 'row', padding: Spacing.md, gap: Spacing.sm },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, backgroundColor: Colors.surface, padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border },
  actionBtnText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.coral },
  list: { padding: Spacing.sm },
  roomCard: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, backgroundColor: Colors.surface, borderRadius: BorderRadius.md, marginBottom: Spacing.sm, gap: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  roomIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.purpleMuted, justifyContent: 'center', alignItems: 'center' },
  roomInfo: { flex: 1 },
  roomName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  roomDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  roomMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: Spacing.sm },
  emptyText: { fontSize: FontSize.lg, fontWeight: '600', color: Colors.textPrimary },
  emptySubtext: { fontSize: FontSize.sm, color: Colors.textSecondary },
});
