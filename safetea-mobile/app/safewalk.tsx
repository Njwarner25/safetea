import { View, Text, TextInput, StyleSheet, Pressable, FlatList, Alert } from 'react-native';
import { useState } from 'react';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/colors';
import { useSafeWalkStore } from '../store/safeWalkStore';

export default function SafeWalkScreen() {
  const {
    trustedContacts, activeSession, pastSessions,
    addContact, removeContact, startSession, endSession, triggerPanic, respondToCheckIn,
  } = useSafeWalkStore();

  const [venue, setVenue] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  const handleStartSession = () => {
    if (!venue || !partnerName || !selectedContactId) {
      Alert.alert('Missing Info', 'Please fill in all fields and select a trusted contact.');
      return;
    }
    startSession({
      id: 'session-' + Date.now(),
      venue,
      partnerName,
      startTime: new Date().toISOString(),
      trustedContactId: selectedContactId,
      status: 'active',
      checkIns: [],
    });
    setVenue('');
    setPartnerName('');
    setSelectedContactId(null);
  };

  const handlePanic = () => {
    Alert.alert(
      'Emergency Alert',
      'This will notify your trusted contact immediately. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send Alert', style: 'destructive', onPress: () => triggerPanic() },
      ]
    );
  };

  const getElapsedTime = () => {
    if (!activeSession) return '';
    const start = new Date(activeSession.startTime).getTime();
    const now = Date.now();
    const mins = Math.floor((now - start) / 60000);
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  return (
    <FlatList
      style={styles.container}
      data={[]}
      renderItem={() => null}
      ListHeaderComponent={
        <View>
          {activeSession ? (
            <View style={styles.activeCard}>
              <View style={styles.activeHeader}>
                <Text style={styles.activeLabel}>ACTIVE SESSION</Text>
                <View style={styles.liveDot} />
              </View>
              <Text style={styles.venueName}>{activeSession.venue}</Text>
              <Text style={styles.partnerText}>With: {activeSession.partnerName}</Text>
              <Text style={styles.timerText}>{getElapsedTime()} elapsed</Text>
              <View style={styles.statusBadge}>
                <Text style={styles.statusText}>
                  {activeSession.status === 'active' ? '✓ Session Active' : '⚠ PANIC TRIGGERED'}
                </Text>
              </View>

              <View style={styles.actionRow}>
                <Pressable
                  style={styles.safeBtn}
                  onPress={() => {
                    const checkIn = {
                      id: 'ci-' + Date.now(),
                      sessionId: activeSession.id,
                      time: new Date().toISOString(),
                      status: 'safe' as const,
                    };
                    respondToCheckIn(checkIn.id, 'safe');
                    Alert.alert('Check-in Sent', 'Your contact has been notified you are safe.');
                  }}
                >
                  <Text style={styles.safeBtnText}>✓ I'm Safe</Text>
                </Pressable>
                <Pressable style={styles.panicBtn} onPress={handlePanic}>
                  <Text style={styles.panicBtnText}>🚨 Panic</Text>
                </Pressable>
              </View>

              <Pressable style={styles.endBtn} onPress={endSession}>
                <Text style={styles.endBtnText}>End Session</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.setupCard}>
              <Text style={styles.sectionTitle}>Start a SafeWalk</Text>
              <Text style={styles.setupDesc}>Share your date details with a trusted contact. They'll be notified if you miss a check-in.</Text>

              <TextInput
                style={styles.input}
                placeholder="Venue name (e.g. Blue Door Coffee)"
                placeholderTextColor={Colors.textMuted}
                value={venue}
                onChangeText={setVenue}
              />
              <TextInput
                style={styles.input}
                placeholder="Partner's name"
                placeholderTextColor={Colors.textMuted}
                value={partnerName}
                onChangeText={setPartnerName}
              />

              <Text style={styles.label}>Select Trusted Contact</Text>
              {trustedContacts.map((contact) => (
                <Pressable
                  key={contact.id}
                  style={[
                    styles.contactOption,
                    selectedContactId === contact.id && styles.contactSelected,
                  ]}
                  onPress={() => setSelectedContactId(contact.id)}
                >
                  <Text style={styles.contactName}>{contact.name}</Text>
                  <Text style={styles.contactRelation}>{contact.relationship}</Text>
                </Pressable>
              ))}

              <Pressable style={styles.startBtn} onPress={handleStartSession}>
                <Text style={styles.startBtnText}>Start SafeWalk</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Trusted Contacts</Text>
            {trustedContacts.map((contact) => (
              <View key={contact.id} style={styles.contactCard}>
                <View>
                  <Text style={styles.contactName}>{contact.name}</Text>
                  <Text style={styles.contactPhone}>{contact.phone}</Text>
                  <Text style={styles.contactRelation}>{contact.relationship}</Text>
                </View>
                <Pressable onPress={() => removeContact(contact.id)}>
                  <Text style={styles.removeText}>Remove</Text>
                </Pressable>
              </View>
            ))}
          </View>

          {pastSessions.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Past Sessions</Text>
              {pastSessions.map((session) => (
                <View key={session.id} style={styles.pastCard}>
                  <Text style={styles.pastVenue}>{session.venue}</Text>
                  <Text style={styles.pastMeta}>
                    {session.partnerName} · {new Date(session.startTime).toLocaleDateString()}
                  </Text>
                  <Text style={[styles.pastStatus, session.status === 'panic' && { color: Colors.danger }]}>
                    {session.status === 'completed' ? '✓ Completed safely' : '⚠ Panic triggered'}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: Spacing.md },
  activeCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.lg,
    borderWidth: 2, borderColor: Colors.success, marginBottom: Spacing.lg,
  },
  activeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  activeLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.success, letterSpacing: 1 },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.success },
  venueName: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  partnerText: { fontSize: FontSize.md, color: Colors.textSecondary, marginBottom: 4 },
  timerText: { fontSize: FontSize.lg, fontWeight: '600', color: Colors.coral, marginBottom: Spacing.md },
  statusBadge: { backgroundColor: Colors.successMuted, padding: Spacing.sm, borderRadius: BorderRadius.sm, alignItems: 'center', marginBottom: Spacing.md },
  statusText: { color: Colors.success, fontWeight: '600', fontSize: FontSize.sm },
  actionRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  safeBtn: { flex: 1, backgroundColor: Colors.success, padding: Spacing.md, borderRadius: BorderRadius.md, alignItems: 'center' },
  safeBtnText: { color: '#FFF', fontWeight: '700', fontSize: FontSize.md },
  panicBtn: { flex: 1, backgroundColor: Colors.danger, padding: Spacing.md, borderRadius: BorderRadius.md, alignItems: 'center' },
  panicBtnText: { color: '#FFF', fontWeight: '700', fontSize: FontSize.md },
  endBtn: { borderWidth: 1, borderColor: Colors.border, padding: Spacing.sm, borderRadius: BorderRadius.md, alignItems: 'center' },
  endBtnText: { color: Colors.textSecondary, fontSize: FontSize.sm },
  setupCard: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.lg, marginBottom: Spacing.lg },
  setupDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.lg, lineHeight: 20 },
  input: {
    backgroundColor: Colors.surfaceLight, borderRadius: BorderRadius.md, padding: Spacing.md,
    color: Colors.textPrimary, fontSize: FontSize.md, marginBottom: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border,
  },
  label: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary, marginTop: Spacing.sm, marginBottom: Spacing.sm },
  contactOption: {
    backgroundColor: Colors.surfaceLight, padding: Spacing.md, borderRadius: BorderRadius.md,
    marginBottom: Spacing.xs, borderWidth: 1, borderColor: Colors.border,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  contactSelected: { borderColor: Colors.coral, backgroundColor: Colors.coralMuted },
  startBtn: { backgroundColor: Colors.coral, padding: Spacing.md, borderRadius: BorderRadius.lg, alignItems: 'center', marginTop: Spacing.md },
  startBtnText: { color: '#FFF', fontWeight: '700', fontSize: FontSize.lg },
  section: { marginBottom: Spacing.lg },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },
  contactCard: {
    backgroundColor: Colors.surface, padding: Spacing.md, borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.border,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  contactName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  contactPhone: { fontSize: FontSize.sm, color: Colors.textSecondary },
  contactRelation: { fontSize: FontSize.xs, color: Colors.textMuted },
  removeText: { fontSize: FontSize.sm, color: Colors.danger },
  pastCard: { backgroundColor: Colors.surface, padding: Spacing.md, borderRadius: BorderRadius.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  pastVenue: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  pastMeta: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  pastStatus: { fontSize: FontSize.sm, color: Colors.success, marginTop: 4 },
});
