import { View, Text, FlatList, StyleSheet, Pressable, RefreshControl, ActivityIndicator, Alert, TextInput } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { router } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius, APP_NAME_PLUS } from '../constants/colors';
import { useAuthStore } from '../store/authStore';
import { api } from '../services/api';

interface VaultFolder {
  id: string;
  name: string;
  entryCount: number;
  createdAt: string;
}

export default function VaultScreen() {
  const user = useAuthStore((s) => s.user);
  const [folders, setFolders] = useState<VaultFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creating, setCreating] = useState(false);
  const [activeView, setActiveView] = useState<'folders' | 'contacts' | 'log'>('folders');
  const [contacts, setContacts] = useState<any[]>([]);
  const [auditLog, setAuditLog] = useState<any[]>([]);

  const fetchFolders = useCallback(async () => {
    try {
      const res = await api.getVaultFolders();
      if (res.status === 200 && res.data) {
        const raw = Array.isArray(res.data) ? res.data : (res.data as any)?.folders || [];
        setFolders(raw.map((f: any) => ({
          id: f.id?.toString(),
          name: f.name || 'Untitled',
          entryCount: f.entry_count || f.entryCount || 0,
          createdAt: f.created_at || f.createdAt || '',
        })));
      }
    } catch { /* keep existing */ }
    setLoading(false);
  }, []);

  const fetchContacts = useCallback(async () => {
    try {
      const res = await api.getVaultContacts();
      if (res.status === 200 && res.data) {
        setContacts(Array.isArray(res.data) ? res.data : (res.data as any)?.contacts || []);
      }
    } catch { /* empty */ }
  }, []);

  const fetchAuditLog = useCallback(async () => {
    try {
      const res = await api.getVaultAuditLog();
      if (res.status === 200 && res.data) {
        setAuditLog(Array.isArray(res.data) ? res.data : (res.data as any)?.entries || (res.data as any)?.logs || []);
      }
    } catch { /* empty */ }
  }, []);

  useEffect(() => { fetchFolders(); }, [fetchFolders]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchFolders().finally(() => setRefreshing(false));
  }, [fetchFolders]);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || creating) return;
    setCreating(true);
    try {
      const res = await api.createVaultFolder(newFolderName.trim());
      if (res.status === 200 || res.status === 201) {
        setNewFolderName('');
        setShowCreate(false);
        fetchFolders();
      } else {
        Alert.alert('Error', (res.data as any)?.error || 'Failed to create folder.');
      }
    } catch {
      Alert.alert('Error', 'Network error.');
    }
    setCreating(false);
  };

  if (user?.tier === 'free') {
    return (
      <View style={styles.container}>
        <View style={styles.gateCard}>
          <FontAwesome5 name="lock" size={36} color={Colors.vault} />
          <Text style={styles.gateTitle}>Safety Vault is a {APP_NAME_PLUS} Feature</Text>
          <Text style={styles.gateDesc}>Store evidence, screenshots, and safety information in an encrypted vault. Share with trusted contacts in an emergency.</Text>
          <Pressable style={styles.upgradeBtn} onPress={() => router.push('/subscription')}>
            <Text style={styles.upgradeBtnText}>Upgrade to {APP_NAME_PLUS}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.tabRow}>
        {(['folders', 'contacts', 'log'] as const).map((tab) => (
          <Pressable
            key={tab}
            style={[styles.tab, activeView === tab && styles.tabActive]}
            onPress={() => {
              setActiveView(tab);
              if (tab === 'contacts') fetchContacts();
              if (tab === 'log') fetchAuditLog();
            }}
          >
            <FontAwesome5 name={tab === 'folders' ? 'folder' : tab === 'contacts' ? 'user-friends' : 'history'} size={14} color={activeView === tab ? '#FFF' : Colors.textMuted} />
            <Text style={[styles.tabText, activeView === tab && styles.tabTextActive]}>
              {tab === 'folders' ? 'Folders' : tab === 'contacts' ? 'Contacts' : 'Activity'}
            </Text>
          </Pressable>
        ))}
      </View>

      {activeView === 'folders' && (
        <>
          <Pressable style={styles.addBtn} onPress={() => setShowCreate(!showCreate)}>
            <FontAwesome5 name="plus" size={14} color={Colors.vault} />
            <Text style={styles.addBtnText}>New Folder</Text>
          </Pressable>
          {showCreate && (
            <View style={styles.createRow}>
              <TextInput
                style={styles.createInput}
                placeholder="Folder name"
                placeholderTextColor={Colors.textMuted}
                value={newFolderName}
                onChangeText={setNewFolderName}
                autoFocus
              />
              <Pressable style={styles.createBtn} onPress={handleCreateFolder} disabled={creating}>
                {creating ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.createBtnText}>Create</Text>}
              </Pressable>
            </View>
          )}
          <FlatList
            data={folders}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable style={styles.folderCard} onPress={() => router.push('/vault/folder/' + item.id as any)}>
                <FontAwesome5 name="folder" size={24} color={Colors.vault} />
                <View style={styles.folderInfo}>
                  <Text style={styles.folderName}>{item.name}</Text>
                  <Text style={styles.folderMeta}>{item.entryCount} item{item.entryCount !== 1 ? 's' : ''}</Text>
                </View>
                <FontAwesome5 name="chevron-right" size={12} color={Colors.textMuted} />
              </Pressable>
            )}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.vault} />}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              loading ? <ActivityIndicator color={Colors.vault} style={{ marginTop: 40 }} /> : (
                <View style={styles.empty}>
                  <FontAwesome5 name="archive" size={36} color={Colors.textMuted} />
                  <Text style={styles.emptyText}>No folders yet</Text>
                  <Text style={styles.emptySubtext}>Create a folder to start storing safety information</Text>
                </View>
              )
            }
          />
        </>
      )}

      {activeView === 'contacts' && (
        <FlatList
          data={contacts}
          keyExtractor={(item, i) => item.id?.toString() || String(i)}
          renderItem={({ item }) => (
            <View style={styles.contactCard}>
              <FontAwesome5 name="user-shield" size={20} color={Colors.vault} />
              <View style={{ flex: 1 }}>
                <Text style={styles.folderName}>{item.name || 'Contact'}</Text>
                <Text style={styles.folderMeta}>{item.phone || item.email || ''} · {item.relationship || ''}</Text>
              </View>
            </View>
          )}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No trusted contacts</Text>
              <Text style={styles.emptySubtext}>Add contacts who can access your vault in an emergency</Text>
            </View>
          }
        />
      )}

      {activeView === 'log' && (
        <FlatList
          data={auditLog}
          keyExtractor={(item, i) => item.id?.toString() || String(i)}
          renderItem={({ item }) => (
            <View style={styles.logEntry}>
              <Text style={styles.logAction}>{item.action || item.event || 'Activity'}</Text>
              <Text style={styles.folderMeta}>{item.created_at ? new Date(item.created_at).toLocaleString() : ''}</Text>
            </View>
          )}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No activity yet</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  tabRow: { flexDirection: 'row', padding: Spacing.sm, gap: Spacing.xs },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, backgroundColor: Colors.surface },
  tabActive: { backgroundColor: Colors.vault },
  tabText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textMuted },
  tabTextActive: { color: '#FFF' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, marginHorizontal: Spacing.md },
  addBtnText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.vault },
  createRow: { flexDirection: 'row', paddingHorizontal: Spacing.md, gap: Spacing.sm, marginBottom: Spacing.sm },
  createInput: { flex: 1, backgroundColor: Colors.surface, borderRadius: BorderRadius.md, padding: Spacing.sm, color: Colors.textPrimary, borderWidth: 1, borderColor: Colors.border },
  createBtn: { backgroundColor: Colors.vault, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.md, justifyContent: 'center' },
  createBtnText: { color: '#FFF', fontWeight: '700' },
  list: { padding: Spacing.md },
  folderCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm, gap: Spacing.md, borderWidth: 1, borderColor: Colors.vaultBorder },
  folderInfo: { flex: 1 },
  folderName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  folderMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  contactCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm, gap: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  logEntry: { backgroundColor: Colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm },
  logAction: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textPrimary },
  empty: { alignItems: 'center', paddingVertical: 60, gap: Spacing.sm },
  emptyText: { fontSize: FontSize.lg, fontWeight: '600', color: Colors.textPrimary },
  emptySubtext: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center' },
  gateCard: { margin: Spacing.md, backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.xl, alignItems: 'center', gap: Spacing.md },
  gateTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
  gateDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  upgradeBtn: { backgroundColor: Colors.vault, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: BorderRadius.lg },
  upgradeBtnText: { color: '#FFF', fontWeight: '700', fontSize: FontSize.md },
});
