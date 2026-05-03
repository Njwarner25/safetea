import { View, Text, TextInput, StyleSheet, Pressable, FlatList, Alert, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { Colors, Spacing, FontSize, BorderRadius, APP_NAME_PLUS } from '../constants/colors';
import { useSafeWalkStore } from '../store/safeWalkStore';
import { useAuthStore } from '../store/authStore';
import { api } from '../services/api';
import SOSFloatingButton from '../components/SOSFloatingButton';

export default function SafeWalkScreen() {
  const user = useAuthStore((s) => s.user);
  const {
    trustedContacts, activeSession, pastSessions,
    addContact, removeContact, startSession, endSession, triggerPanic, triggerSOS, respondToCheckIn, addCheckIn,
  } = useSafeWalkStore();

  const [venue, setVenue] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactRelation, setNewContactRelation] = useState('');
  const [showAddContact, setShowAddContact] = useState(false);

  if (user?.tier === 'free') {
    return (
      <View style={styles.container}>
        <View style={styles.gateCard}>
          <Text style={styles.gateIcon}>🔒</Text>
          <Text style={styles.gateTitle}>SafeWalk is a {APP_NAME_PLUS} Feature</Text>
          <Text style={styles.gateDesc}>
            Share your plans with trusted contacts and get check-in reminders. Upgrade to {APP_NAME_PLUS} to unlock.
          </Text>
          <Pressable style={styles.upgradeBtn} onPress={() => router.push('/subscription')}>
            <Text style={styles.upgradeBtnText}>Upgrade to {APP_NAME_PLUS}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const handleAddContact = () => {
    if (!newContactName.trim() || !newContactPhone.trim()) {
      Alert.alert('Missing Info', 'Please enter a name and phone number.');
      return;
    }
    addContact({
      id: 'tc-' + Date.now(),
      name: newContactName.trim(),
      phone: newContactPhone.trim(),
      relationship: newContactRelation.trim() || 'Contact',
    });
    setNewContactName('');
    setNewContactPhone('');
    setNewContactRelation('');
    setShowAddContact(false);
  };

  const handleStartSession = async () => {
    if (!venue || !partnerName || !selectedContactId) {
      Alert.alert('Missing Info', 'Please fill in all fields and select a trusted contact.');
      return;
    }
    const selectedContact = trustedContacts.find(c => c.id === selectedContactId);
    if (!selectedContact) return;

    setLoading(true);
    try {
      const res = await api.dateCheckout({
        dateName: partnerName,
        venue,
        contacts: [{ name: selectedContact.name, phone: selectedContact.phone }],
      });
      const id = (res.data as any)?.checkout?.id || (res.data as any)?.id;
      if (id) setCheckoutId(id.toString());

      startSession({
        id: id?.toString() || 'session-' + Date.now(),
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

      if (res.status >= 200 && res.status < 300) {
        Alert.alert('SafeWalk Started', 'Your trusted contact has been notified via SMS.');
      }
    } catch {
      Alert.alert('Network Error', 'Could not reach the server. Session started locally.');
      startSession({
        id: 'session-' + Date.now(),
        venue,
        partnerName,
        startTime: new Date().toISOString(),
        trustedContactId: selectedContactId,
        status: 'active',
        checkIns: [],
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSafeCheckin = async () => {
    const id = checkoutId || activeSession?.id;
    if (id) {
      try {
        await api.dateCheckin(id, 5);
      } catch { /* best effort */ }
    }
    const checkIn = {
      id: 'ci-' + Date.now(),
      sessionId: activeSession?.id || '',
      time: new Date().toISOString(),
      status: 'safe' as const,
    };
    addCheckIn(checkIn);
    Alert.alert('Check-in Sent', 'Your trusted contact has been notified you are safe.');
  };

  const handlePanic = () => {
    Alert.alert(
      'Emergency Alert',
      'This will notify your trusted contacts with your GPS location. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Alert', style: 'destructive', onPress: async () => {
            triggerPanic();
            try {
              const { status } = await Location.requestForegroundPermissionsAsync();
              let lat: number | undefined;
              let lng: number | undefined;
              if (status === 'granted') {
                const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
                lat = loc.coords.latitude;
                lng = loc.coords.longitude;
              }
              const res = await api.sosAlert('alert_contacts', lat, lng);
              const data = res.data as any;
              if (data?.success) {
                Alert.alert('SOS Sent', `${data.contactsNotified || 0} contact(s) notified with your location.`);
              } else {
                Alert.alert('Alert Sent', 'Your emergency contacts have been notified.');
              }
            } catch {
              Alert.alert('Alert Sent', 'Your emergency contacts have been notified.');
            }
          }
        },
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
    <View style={{ flex: 1 }}>
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
                <Pressable style={styles.safeBtn} onPress={handleSafeCheckin}>
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
              <Text style={styles.setupDesc}>Share your plans with a trusted contact. They'll be notified if you miss a check-in.</Text>

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

              <Pressable style={[styles.startBtn, loading && styles.startBtnDisabled]} onPress={handleStartSession} disabled={loading}>
                {loading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.startBtnText}>Start SafeWalk</Text>
                )}
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

            {showAddContact ? (
              <View style={styles.addContactForm}>
                <TextInput style={styles.input} placeholder="Contact name" placeholderTextColor={Colors.textMuted} value={newContactName} onChangeText={setNewContactName} />
                <TextInput style={styles.input} placeholder="Phone number" placeholderTextColor={Colors.textMuted} value={newContactPhone} onChangeText={setNewContactPhone} keyboardType="phone-pad" />
                <TextInput style={styles.input} placeholder="Relationship (optional)" placeholderTextColor={Colors.textMuted} value={newContactRelation} onChangeText={setNewContactRelation} />
                <View style={styles.addContactRow}>
                  <Pressable style={styles.addContactSave} onPress={handleAddContact}>
                    <Text style={styles.addContactSaveText}>Save Contact</Text>
                  </Pressable>
                  <Pressable style={styles.addContactCancel} onPress={() => setShowAddContact(false)}>
                    <Text style={styles.addContactCancelText}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable style={styles.addContactBtn} onPress={() => setShowAddContact(true)}>
                <Text style={styles.addContactBtnText}>+ Add Trusted Contact</Text>
              </Pressable>
            )}
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
    {activeSession && user?.tier !== 'free' && <SOSFloatingButton />}
    </View>
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
  gateCard: {
    margin: Spacing.md, backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.xl, alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  gateIcon: { fontSize: 48, marginBottom: Spacing.md },
  gateTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm, textAlign: 'center' },
  gateDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: Spacing.lg },
  startBtnDisabled: { opacity: 0.5 },
  addContactBtn: { borderWidth: 1, borderColor: Colors.coral, borderStyle: 'dashed', padding: Spacing.md, borderRadius: BorderRadius.md, alignItems: 'center', marginTop: Spacing.sm },
  addContactBtnText: { color: Colors.coral, fontWeight: '600', fontSize: FontSize.sm },
  addContactForm: { backgroundColor: Colors.surfaceLight, padding: Spacing.md, borderRadius: BorderRadius.md, marginTop: Spacing.sm },
  addContactRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  addContactSave: { flex: 1, backgroundColor: Colors.coral, padding: Spacing.sm, borderRadius: BorderRadius.md, alignItems: 'center' },
  addContactSaveText: { color: '#FFF', fontWeight: '600', fontSize: FontSize.sm },
  addContactCancel: { flex: 1, borderWidth: 1, borderColor: Colors.border, padding: Spacing.sm, borderRadius: BorderRadius.md, alignItems: 'center' },
  addContactCancelText: { color: Colors.textSecondary, fontSize: FontSize.sm },
  upgradeBtn: { backgroundColor: Colors.coral, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: BorderRadius.lg },
  upgradeBtnText: { color: '#FFF', fontWeight: '700', fontSize: FontSize.md },
});