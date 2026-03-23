import { View, Text, TextInput, StyleSheet, Pressable, FlatList, Modal, Alert } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/colors';
import { useAuthStore } from '../store/authStore';
import { useNameWatchStore } from '../store/nameWatchStore';

export default function NameWatchScreen() {
  const user = useAuthStore((s) => s.user);
  const { watchedNames, matches, addEntry, removeEntry } = useNameWatchStore();

  const [showAddModal, setShowAddModal] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [initialsInput, setInitialsInput] = useState('');

  // Pro tier gate
  if (user?.tier !== 'pro') {
    return (
      <View style={styles.container}>
        <View style={styles.gateCard}>
          <Text style={styles.gateIcon}>🔒</Text>
          <Text style={styles.gateTitle}>Name Watch is a Pro Feature</Text>
          <Text style={styles.gateDesc}>
            Save names and initials of people you're dating or concerned about. Get alerted
            when they're posted about in your city's community.
          </Text>
          <Pressable style={styles.upgradeBtn} onPress={() => router.push('/subscription')}>
            <Text style={styles.upgradeBtnText}>Upgrade to Pro</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const handleAdd = () => {
    if (!nameInput.trim()) return;
    const terms = [nameInput.trim()];
    if (initialsInput.trim()) {
      terms.push(initialsInput.trim().toUpperCase());
    }
    addEntry(nameInput.trim(), terms);
    setNameInput('');
    setInitialsInput('');
    setShowAddModal(false);
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert('Remove Name', `Stop watching "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeEntry(id) },
    ]);
  };

  const getMatchCount = (entryId: string) => matches.filter((m) => m.entryId === entryId).length;

  return (
    <View style={styles.container}>
      <FlatList
        data={watchedNames}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View>
            {/* Explainer card */}
            <View style={styles.explainerCard}>
              <Text style={styles.explainerTitle}>How Name Watch Works</Text>
              <Text style={styles.explainerText}>
                Save the names or initials of people you're dating or concerned about.
                If anyone in your city's community posts about someone matching those
                names, you'll receive an alert in your Alerts tab.
              </Text>
              <View style={styles.explainerBullets}>
                <Text style={styles.bulletItem}>{'  \u2022  Add full names, first names, or initials'}</Text>
                <Text style={styles.bulletItem}>{'  \u2022  Choose which cities to monitor'}</Text>
                <Text style={styles.bulletItem}>{'  \u2022  Get notified when a match appears'}</Text>
                <Text style={styles.bulletItem}>{'  \u2022  Your watched names are private \u2014 only you can see them'}</Text>
              </View>
            </View>

            {/* Add button */}
            <Pressable style={styles.addBtn} onPress={() => setShowAddModal(true)}>
              <Text style={styles.addBtnText}>+ Add Name to Watch</Text>
            </Pressable>

            {watchedNames.length === 0 && (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyIcon}>👁️</Text>
                <Text style={styles.emptyText}>
                  No watched names yet. Tap "Add Name to Watch" to get started.
                </Text>
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.nameCard}
            onLongPress={() => handleDelete(item.id, item.displayName)}
          >
            <View style={styles.nameCardLeft}>
              <Text style={styles.nameCardName}>{item.displayName}</Text>
              <Text style={styles.nameCardTerms}>
                Watching: {item.searchTerms.join(', ')}
              </Text>
              <Text style={styles.nameCardDate}>
                Added {new Date(item.createdAt).toLocaleDateString()}
              </Text>
            </View>
            <View style={styles.nameCardRight}>
              {getMatchCount(item.id) > 0 ? (
                <View style={styles.matchBadge}>
                  <Text style={styles.matchBadgeText}>{getMatchCount(item.id)}</Text>
                </View>
              ) : (
                <Text style={styles.noMatchText}>No matches</Text>
              )}
            </View>
          </Pressable>
        )}
        contentContainerStyle={styles.list}
      />

      {/* Add Name Modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Name to Watch</Text>
            <Text style={styles.modalDesc}>
              Enter the name of someone you want to monitor. You'll be alerted if
              anyone posts about a matching name.
            </Text>

            <Text style={styles.inputLabel}>Full Name or First Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Jake Morrison or Jake M"
              placeholderTextColor={Colors.textMuted}
              value={nameInput}
              onChangeText={setNameInput}
              autoFocus
            />

            <Text style={styles.inputLabel}>Initials (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. JM"
              placeholderTextColor={Colors.textMuted}
              value={initialsInput}
              onChangeText={setInitialsInput}
              autoCapitalize="characters"
              maxLength={4}
            />

            <View style={styles.modalBtns}>
              <Pressable
                style={styles.cancelBtn}
                onPress={() => {
                  setShowAddModal(false);
                  setNameInput('');
                  setInitialsInput('');
                }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.saveBtn, !nameInput.trim() && styles.saveBtnDisabled]}
                onPress={handleAdd}
                disabled={!nameInput.trim()}
              >
                <Text style={styles.saveBtnText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  list: { padding: Spacing.md, paddingBottom: Spacing.xxl },

  // Explainer
  explainerCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.lg,
    marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.borderLight,
  },
  explainerTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  explainerText: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20, marginBottom: Spacing.md },
  explainerBullets: { gap: 4 },
  bulletItem: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },

  // Add button
  addBtn: {
    backgroundColor: Colors.pink, padding: Spacing.md, borderRadius: BorderRadius.lg,
    alignItems: 'center', marginBottom: Spacing.lg,
  },
  addBtnText: { color: Colors.textInverse, fontWeight: '700', fontSize: FontSize.md },

  // Empty state
  emptyCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.xl,
    alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  emptyIcon: { fontSize: 36, marginBottom: Spacing.sm },
  emptyText: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },

  // Name cards
  nameCard: {
    flexDirection: 'row', backgroundColor: Colors.surface, padding: Spacing.md,
    borderRadius: BorderRadius.md, marginBottom: Spacing.sm, borderWidth: 1,
    borderColor: Colors.border, alignItems: 'center',
  },
  nameCardLeft: { flex: 1 },
  nameCardName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  nameCardTerms: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  nameCardDate: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 4 },
  nameCardRight: { marginLeft: Spacing.md },
  matchBadge: {
    backgroundColor: Colors.pink, width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  matchBadgeText: { color: '#FFF', fontSize: FontSize.xs, fontWeight: '700' },
  noMatchText: { fontSize: FontSize.xs, color: Colors.textMuted },

  // Pro gate
  gateCard: {
    margin: Spacing.md, backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.xl, alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  gateIcon: { fontSize: 48, marginBottom: Spacing.md },
  gateTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm, textAlign: 'center' },
  gateDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: Spacing.lg },
  upgradeBtn: { backgroundColor: Colors.pink, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: BorderRadius.lg },
  upgradeBtnText: { color: Colors.textInverse, fontWeight: '700', fontSize: FontSize.md },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.surface, borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl, padding: Spacing.lg, paddingBottom: Spacing.xxl,
  },
  modalTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.xs },
  modalDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20, marginBottom: Spacing.lg },
  inputLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textPrimary, marginBottom: Spacing.xs },
  input: {
    backgroundColor: Colors.background, borderRadius: BorderRadius.md, padding: Spacing.md,
    color: Colors.textPrimary, fontSize: FontSize.md, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  modalBtns: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm },
  cancelBtn: {
    flex: 1, padding: Spacing.md, borderRadius: BorderRadius.lg, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  cancelBtnText: { color: Colors.textSecondary, fontWeight: '600', fontSize: FontSize.md },
  saveBtn: {
    flex: 1, backgroundColor: Colors.pink, padding: Spacing.md,
    borderRadius: BorderRadius.lg, alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: Colors.textInverse, fontWeight: '700', fontSize: FontSize.md },
});
