/**
 * Save to Vault — Android share-sheet handler.
 *
 * Reached when the user picks the app from Android's share sheet.
 * `_layout.tsx` detects the incoming SEND / SEND_MULTIPLE intent via
 * `expo-share-intent`, hands the file metadata off via expo-router
 * params, and pushes this screen on top of the navigation stack.
 *
 * Flow:
 *   1. Read uri / mime / name params (single file v1).
 *   2. Ensure auth.
 *   3. Look up / auto-create a "Shared from Apps" vault folder.
 *   4. Create a parent vault_entry.
 *   5. Upload the file via @vercel/blob/client upload() — same handleUpload
 *      protocol that powers /api/vault/files/upload on the web.
 *   6. Commit via /api/vault/files/commit.
 *   7. Success → bounce back to the vault tab.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import { useThemeColors } from '../constants/useThemeColors';
import { FontSize, Spacing, BorderRadius } from '../constants/colors';
import { API_BASE } from '../constants/api';
import { useAuthStore } from '../store/authStore';

const FOLDER_NAME = 'Shared from Apps';
const MAX_BYTES = 25 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp',
  'application/pdf',
  'audio/m4a', 'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/webm',
  'audio/aac', 'audio/ogg',
  'video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v',
]);

function inferMimeFromName(name: string): string {
  const n = (name || '').toLowerCase();
  const i = n.lastIndexOf('.');
  if (i < 0) return '';
  const ext = n.slice(i + 1);
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    heic: 'image/heic', heif: 'image/heif', webp: 'image/webp',
    mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v',
    webm: 'video/webm',
    mp3: 'audio/mpeg', m4a: 'audio/m4a', wav: 'audio/wav',
    aac: 'audio/aac', ogg: 'audio/ogg',
    pdf: 'application/pdf',
    txt: 'text/plain',
  };
  return map[ext] || '';
}

function fmtSize(n: number): string {
  if (!n || !Number.isFinite(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function entryTypeFromMime(mime: string): string {
  const m = (mime || '').toLowerCase();
  if (m.startsWith('image/')) return 'photo';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (m === 'application/pdf') return 'document';
  return 'note';
}

type VaultFolder = {
  id: string;
  title: string;
};

export default function ShareReceiveScreen() {
  const colors = useThemeColors();
  const params = useLocalSearchParams<{ uri?: string; mime?: string; name?: string; size?: string }>();
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [progressText, setProgressText] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);

  const incomingUri = String(params.uri || '');
  const incomingMime = (String(params.mime || '') || inferMimeFromName(String(params.name || ''))).toLowerCase();
  const incomingName = String(params.name || (incomingUri ? incomingUri.split('/').pop() : '') || 'shared-file');
  const incomingSize = Number(params.size || 0);

  const authedFetch = useCallback(async (path: string, init?: RequestInit) => {
    const token = useAuthStore.getState().token;
    return fetch(`${API_BASE}${path}`, {
      ...(init || {}),
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...((init?.headers as Record<string, string>) || {}),
      },
    });
  }, []);

  // --- vault folder helpers ---
  const findOrCreateFolder = useCallback(async (): Promise<VaultFolder> => {
    const listRes = await authedFetch('/api/vault/folders');
    if (listRes.status === 401) {
      const e: any = new Error('Please sign in to save to your vault.');
      e.code = '401';
      throw e;
    }
    if (!listRes.ok) {
      const j = await listRes.json().catch(() => ({}));
      const e: any = new Error(j?.error || 'Could not list vault folders');
      e.upgrade = !!j?.upgrade;
      throw e;
    }
    const json = await listRes.json();
    const existing = (json.folders || []).find(
      (f: any) => (f.title || '').toLowerCase() === FOLDER_NAME.toLowerCase(),
    );
    if (existing) return { id: String(existing.id), title: existing.title };

    const createRes = await authedFetch('/api/vault/folders', {
      method: 'POST',
      body: JSON.stringify({
        title: FOLDER_NAME,
        description: 'Files you save from other apps via the share sheet.',
      }),
    });
    if (!createRes.ok) {
      const j = await createRes.json().catch(() => ({}));
      const e: any = new Error(j?.error || 'Could not create vault folder');
      e.upgrade = !!j?.upgrade;
      throw e;
    }
    const cj = await createRes.json();
    return { id: String(cj.folder.id), title: cj.folder.title };
  }, [authedFetch]);

  // --- run upload ---
  const runUpload = useCallback(async () => {
    setStatus('uploading');
    setErrorMsg(null);
    setProgressText('Preparing your vault…');

    const token = useAuthStore.getState().token;
    if (!token) {
      setStatus('error');
      setErrorMsg('Please sign in first, then try sharing again.');
      return;
    }
    if (!incomingUri) {
      setStatus('error');
      setErrorMsg('No file was shared.');
      return;
    }
    if (!ALLOWED_MIME.has(incomingMime)) {
      setStatus('error');
      setErrorMsg(`Files of type ${incomingMime || 'unknown'} aren’t supported yet.`);
      return;
    }

    try {
      // Resolve byte size if not provided by the share intent.
      let bytes = incomingSize;
      if (!bytes || !Number.isFinite(bytes)) {
        try {
          const info = await FileSystem.getInfoAsync(incomingUri, { size: true });
          if (info.exists && (info as any).size) bytes = Number((info as any).size);
        } catch {
          // Some content:// URIs aren't directly statable; we'll read into
          // memory below regardless, and the resulting blob has its own size.
        }
      }
      if (bytes && bytes > MAX_BYTES) {
        setStatus('error');
        setErrorMsg('File is larger than 25 MB.');
        return;
      }

      // Get or create the folder.
      setProgressText('Opening your "Shared from Apps" folder…');
      const folder = await findOrCreateFolder();

      // Create a parent entry so the file row has somewhere to attach.
      setProgressText('Creating entry…');
      const entryRes = await authedFetch('/api/vault/entries', {
        method: 'POST',
        body: JSON.stringify({
          folder_id: parseInt(folder.id, 10),
          entry_type: entryTypeFromMime(incomingMime),
          content: 'Saved from share sheet',
        }),
      });
      const entryJson = await entryRes.json();
      if (!entryRes.ok) throw new Error(entryJson?.error || 'Could not create vault entry');
      const entryId = parseInt(entryJson.entry.id, 10);

      // Read the file into a Blob so we can hand it to fetch().
      // RN's fetch supports the { uri, name, type } shape for multipart, but
      // Vercel Blob storage wants a single-part PUT. The cleanest path is
      // base64 → Uint8Array → Blob.
      //
      // content:// URIs (from Android share-sheet SEND intents) can't be
      // read directly by expo-file-system. Copy into cache first.
      setProgressText('Reading file…');
      let readableUri = incomingUri;
      if (incomingUri.startsWith('content://')) {
        const safeName = (incomingName || 'attachment').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
        const dest = `${FileSystem.cacheDirectory}share-${Date.now()}-${safeName}`;
        try {
          await FileSystem.copyAsync({ from: incomingUri, to: dest });
          readableUri = dest;
        } catch (copyErr) {
          // Some content URIs still aren't copyable; fall through and let
          // readAsStringAsync attempt directly so the user gets a real error.
          console.warn('[share-receive] cache copy failed:', (copyErr as any)?.message);
        }
      }
      const b64 = await FileSystem.readAsStringAsync(readableUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const bin = atob(b64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const fileBytes = u8.byteLength;
      if (fileBytes > MAX_BYTES) {
        setStatus('error');
        setErrorMsg('File is larger than 25 MB.');
        return;
      }
      bytes = fileBytes;

      // --- Two-phase signed-token upload (manual, no @vercel/blob/client).
      // Step A: ask our handler for a client token.
      const pathnameSafe = (incomingName || 'attachment').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
      const pathname = `vault/${folder.id}/${Date.now()}-${pathnameSafe}`;
      const clientPayloadStr = JSON.stringify({
        jwt: token,
        folder_id: parseInt(folder.id, 10),
        entry_id: entryId,
        filename: incomingName,
        mime_type: incomingMime,
        byte_size: bytes,
      });
      setProgressText('Getting upload token…');
      const tokenRes = await fetch(
        `${API_BASE}/api/vault/files/upload?jwt=${encodeURIComponent(token)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'blob.generate-client-token',
            payload: {
              pathname,
              callbackUrl: `${API_BASE}/api/vault/files/upload`,
              clientPayload: clientPayloadStr,
              multipart: false,
            },
          }),
        },
      );
      const tokenJson = await tokenRes.json();
      if (!tokenRes.ok) {
        throw new Error(tokenJson?.error || 'Could not get upload token');
      }
      const blobClientToken: string | undefined =
        tokenJson?.clientToken ||
        tokenJson?.token ||
        tokenJson?.value?.clientToken;
      const blobUploadUrl: string | undefined =
        tokenJson?.value?.uploadUrl ||
        tokenJson?.uploadUrl ||
        `https://blob.vercel-storage.com/${encodeURI(pathname)}`;
      if (!blobClientToken) {
        throw new Error('Upload token missing in server response');
      }

      // Step B: PUT the bytes directly to Vercel Blob storage.
      setProgressText('Uploading…');
      const putRes = await fetch(blobUploadUrl, {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${blobClientToken}`,
          'x-api-version': '7',
          'x-content-type': incomingMime,
          'content-type': incomingMime,
        },
        body: u8 as unknown as BodyInit,
      });
      if (!putRes.ok) {
        const errText = await putRes.text().catch(() => '');
        throw new Error(`Upload failed (HTTP ${putRes.status}): ${errText.slice(0, 200)}`);
      }
      const putJson = await putRes.json().catch(() => ({} as any));
      const blobUrl: string | undefined =
        putJson?.url || putJson?.downloadUrl;
      if (!blobUrl) {
        throw new Error('Upload succeeded but no blob URL was returned');
      }

      // Step C: synchronous commit on our side.
      setProgressText('Saving to your vault…');
      const commitRes = await authedFetch('/api/vault/files/commit', {
        method: 'POST',
        body: JSON.stringify({
          folder_id: parseInt(folder.id, 10),
          entry_id: entryId,
          blob_url: blobUrl,
          pathname,
          filename: incomingName,
          mime_type: incomingMime,
          byte_size: bytes,
        }),
      });
      if (!commitRes.ok) {
        const cj = await commitRes.json().catch(() => ({}));
        throw new Error(cj?.error || 'Could not save file to your vault');
      }

      setSavedCount(1);
      setStatus('done');
      setProgressText('Saved.');
    } catch (e: any) {
      console.warn('[share-receive] upload failed:', e?.message);
      setStatus('error');
      if (e?.upgrade) {
        setErrorMsg(
          'Saving to your vault requires an active subscription. Upgrade to unlock end-to-end encrypted storage.',
        );
      } else if (e?.code === '401') {
        setErrorMsg('Please sign in first, then try sharing again.');
      } else {
        setErrorMsg(e?.message || 'Something went wrong saving to your vault.');
      }
    }
  }, [authedFetch, findOrCreateFolder, incomingMime, incomingName, incomingSize, incomingUri]);

  // Auto-redirect to vault after success.
  useEffect(() => {
    if (status !== 'done') return;
    const t = setTimeout(() => {
      try {
        router.replace('/vault' as any);
      } catch {
        router.replace('/' as any);
      }
    }, 2500);
    return () => clearTimeout(t);
  }, [status]);

  // Bounce out if nothing was shared.
  useEffect(() => {
    if (!incomingUri && !incomingName) {
      Alert.alert('Nothing shared', 'No file was passed in to save.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    }
  }, [incomingUri, incomingName]);

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Save to Vault',
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.textPrimary,
        }}
      />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.iconCircle, { backgroundColor: colors.vaultMuted }]}>
          <FontAwesome5 name="shield-alt" size={28} color={colors.vault} />
        </View>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Save to your Vault</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          We’ll save this into your <Text style={{ fontWeight: '700' }}>{FOLDER_NAME}</Text> folder.
        </Text>

        <View style={[styles.fileCard, { backgroundColor: colors.surfaceDark, borderColor: colors.border }]}>
          <View style={[styles.fileIcon, { backgroundColor: colors.pinkMuted }]}>
            <FontAwesome5
              name={
                incomingMime.startsWith('image/')
                  ? 'image'
                  : incomingMime.startsWith('video/')
                  ? 'film'
                  : incomingMime.startsWith('audio/')
                  ? 'music'
                  : incomingMime === 'application/pdf'
                  ? 'file-pdf'
                  : 'file'
              }
              size={18}
              color={colors.pink}
            />
          </View>
          <View style={styles.fileMeta}>
            <Text style={[styles.fileName, { color: colors.textPrimary }]} numberOfLines={1}>
              {incomingName}
            </Text>
            <Text style={[styles.fileSub, { color: colors.textMuted }]} numberOfLines={1}>
              {incomingMime || 'unknown type'}
              {incomingSize ? ` · ${fmtSize(incomingSize)}` : ''}
            </Text>
          </View>
        </View>

        {status === 'idle' && (
          <>
            <Pressable
              onPress={runUpload}
              style={[styles.btnPrimary, { backgroundColor: colors.pink }]}
            >
              <FontAwesome5 name="cloud-upload-alt" size={14} color="#FFF" solid />
              <Text style={styles.btnPrimaryText}>Save to Vault</Text>
            </Pressable>
            <Pressable onPress={() => router.back()} style={styles.btnGhost}>
              <Text style={[styles.btnGhostText, { color: colors.textMuted }]}>Cancel</Text>
            </Pressable>
          </>
        )}

        {status === 'uploading' && (
          <View style={styles.progressRow}>
            <ActivityIndicator size="small" color={colors.pink} />
            <Text style={[styles.progressText, { color: colors.textSecondary }]}>{progressText}</Text>
          </View>
        )}

        {status === 'done' && (
          <View style={styles.doneWrap}>
            <View style={[styles.doneMark, { backgroundColor: colors.successMuted }]}>
              <FontAwesome5 name="check" size={20} color={colors.success} />
            </View>
            <Text style={[styles.doneText, { color: colors.textPrimary }]}>
              Saved to your Vault.
            </Text>
            <Text style={[styles.doneSub, { color: colors.textMuted }]}>
              {savedCount} item saved. Redirecting…
            </Text>
          </View>
        )}

        {status === 'error' && (
          <>
            <Text style={[styles.errorText, { color: colors.danger }]}>{errorMsg}</Text>
            <Pressable
              onPress={runUpload}
              style={[styles.btnPrimary, { backgroundColor: colors.pink }]}
            >
              <FontAwesome5 name="redo" size={13} color="#FFF" solid />
              <Text style={styles.btnPrimaryText}>Retry</Text>
            </Pressable>
            <Pressable onPress={() => router.back()} style={styles.btnGhost}>
              <Text style={[styles.btnGhostText, { color: colors.textMuted }]}>Cancel</Text>
            </Pressable>
          </>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    paddingTop: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
    marginBottom: Spacing.lg,
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignSelf: 'stretch',
    maxWidth: 480,
    width: '100%',
    marginBottom: Spacing.lg,
  },
  fileIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fileMeta: { flex: 1, minWidth: 0 },
  fileName: { fontSize: FontSize.md, fontWeight: '600' },
  fileSub: { fontSize: FontSize.xs, marginTop: 2 },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: BorderRadius.lg,
    alignSelf: 'stretch',
    maxWidth: 320,
    marginBottom: Spacing.sm,
  },
  btnPrimaryText: {
    color: '#FFF',
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  btnGhost: {
    paddingVertical: 12,
  },
  btnGhostText: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: Spacing.md,
  },
  progressText: {
    fontSize: FontSize.sm,
  },
  doneWrap: {
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  doneMark: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  doneText: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  doneSub: {
    fontSize: FontSize.xs,
    marginTop: 4,
  },
  errorText: {
    fontSize: FontSize.sm,
    textAlign: 'center',
    maxWidth: 320,
    marginBottom: Spacing.md,
  },
});
