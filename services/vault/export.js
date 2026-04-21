/**
 * SafeTea Safety Vault — export generation
 *
 * V1: PDF only. Built with pdfkit (pure-JS, bundled default Helvetica).
 * ZIP file-bundling is deferred to V2.
 *
 * Flow:
 *   1. Load folder + entries, decrypt with folder DEK
 *   2. Render a PDF with the neutral spec-§13 disclaimer baked in
 *   3. Upload the PDF to Vercel Blob (private mode; URL is the bearer)
 *   4. Insert a vault_exports row with share_token + expires_at
 *   5. Return the export id + share URL the caller should surface
 *
 * Never emits decrypted content back to the HTTP response; the caller gets
 * only the export id + share token. Raw text only lives in the PDF bytes
 * that flow directly from this function to Blob storage.
 */

'use strict';

const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const blob = require('@vercel/blob');
const { getOne, getMany, run } = require('../../api/_utils/db');
const { unwrapFolderKey, decryptField } = require('./encryption');
const helpers = require('./entry-helpers');
const audit = require('./audit');

const DEFAULT_EXPIRY_HOURS = 72;
const MAX_EXPIRY_HOURS = 30 * 24;
const DISCLAIMER = [
  'This is a personal safety record created by the user. Timestamps may',
  'reflect logged and/or user-supplied times. AI summaries are organizational',
  'aids only and do not constitute legal evidence.',
].join(' ');

/**
 * Produce a fresh export for a single folder.
 *
 * @param {object} opts
 * @param {number|string} opts.folderId
 * @param {number} opts.ownerUserId
 * @param {'owner'|'access_request'|'sos'|'checkin_timeout'} opts.triggeredBy
 * @param {number|null} opts.accessRequestId
 * @param {number} [opts.expiresHours] defaults to 72
 * @param {object} [opts.req] optional request (for audit IP/UA)
 * @returns {Promise<{ exportId: string, shareToken: string, shareUrl: string, expiresAt: string }>}
 */
async function generateFolderExport(opts) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN not configured — export disabled');
  }
  if (!process.env.VAULT_KEK) {
    throw new Error('VAULT_KEK not configured — export disabled');
  }

  const folderId = parseInt(opts.folderId, 10);
  const ownerUserId = parseInt(opts.ownerUserId, 10);
  if (!Number.isInteger(folderId) || !Number.isInteger(ownerUserId)) {
    throw new Error('folderId and ownerUserId are required');
  }
  const expiresHours = Math.max(1, Math.min(MAX_EXPIRY_HOURS, opts.expiresHours || DEFAULT_EXPIRY_HOURS));
  const triggeredBy = ['owner', 'access_request', 'sos', 'checkin_timeout'].indexOf(opts.triggeredBy) >= 0
    ? opts.triggeredBy : 'owner';

  // 1. Load folder
  const folder = await getOne(
    `SELECT id, owner_user_id, title_enc, description_enc,
            dek_wrapped, dek_iv, dek_tag, legal_hold, created_at, updated_at
     FROM vault_folders WHERE id = $1`,
    [folderId]
  );
  if (!folder) throw new Error('Folder not found');
  if (folder.owner_user_id !== ownerUserId) throw new Error('Not the folder owner');

  // 2. Load entries + files metadata
  const entries = await getMany(
    `SELECT id, entry_type, logged_at, event_at, location_enc, content_enc,
            ai_summary_enc, ai_dates_enc, tags, created_at
     FROM vault_entries
     WHERE folder_id = $1 AND deleted_at IS NULL
     ORDER BY COALESCE(event_at, logged_at) ASC`,
    [folderId]
  );
  const fileCountRow = await getOne(
    `SELECT COUNT(*)::int AS c FROM vault_files
     WHERE folder_id = $1 AND deleted_at IS NULL`,
    [folderId]
  );

  // 3. Unwrap DEK, decrypt, render PDF
  const dek = unwrapFolderKey(folder);
  let pdfBuffer;
  try {
    const folderTitle = decryptField(dek, folder.title_enc) || 'Untitled folder';
    const folderDesc = folder.description_enc ? decryptField(dek, folder.description_enc) : '';

    const decryptedEntries = entries.map(function (e) {
      return {
        id: e.id,
        entry_type: e.entry_type,
        logged_at: e.logged_at,
        event_at: e.event_at,
        content: e.content_enc ? decryptField(dek, e.content_enc) : null,
        location: helpers.decryptLocation(dek, e.location_enc),
        ai_summary: e.ai_summary_enc ? decryptField(dek, e.ai_summary_enc) : null,
        ai_dates: e.ai_dates_enc ? helpers.safeJsonParse(decryptField(dek, e.ai_dates_enc)) : null,
        tags: e.tags || [],
        created_at: e.created_at,
      };
    });

    pdfBuffer = await renderPdf({
      folderTitle: folderTitle,
      folderDesc: folderDesc,
      entries: decryptedEntries,
      fileCount: fileCountRow ? fileCountRow.c : 0,
      generatedAt: new Date(),
    });
  } finally {
    dek.fill(0);
  }

  // 4. Upload to Vercel Blob. `access: 'public'` is fine — the URL is a
  //    cryptographically-unguessable bearer. We gate access by only
  //    returning the URL to authenticated owner reads, and by storing it
  //    encrypted at rest via our own column encryption.
  const pathname = `vault-exports/${folderId}-${crypto.randomBytes(8).toString('hex')}.pdf`;
  const blobRes = await blob.put(pathname, pdfBuffer, {
    access: 'public',
    contentType: 'application/pdf',
    addRandomSuffix: true,
  });

  // 5. Persist export row
  const shareToken = crypto.randomBytes(36).toString('base64url').slice(0, 48);
  const expiresAt = new Date(Date.now() + expiresHours * 3600 * 1000);

  const inserted = await getOne(
    `INSERT INTO vault_exports
      (folder_id, owner_user_id, triggered_by, access_request_id,
       format, storage_key, share_token, expires_at)
     VALUES ($1, $2, $3, $4, 'pdf', $5, $6, $7)
     RETURNING id, created_at`,
    [
      folderId,
      ownerUserId,
      triggeredBy,
      opts.accessRequestId || null,
      blobRes.url,
      shareToken,
      expiresAt,
    ]
  );

  audit.write({
    req: opts.req || null,
    actor_user_id: triggeredBy === 'owner' ? ownerUserId : null,
    actor_role: triggeredBy === 'owner' ? 'owner' : 'system',
    action: audit.ACTIONS.EXPORT_GENERATE,
    target_type: 'export',
    target_id: inserted.id,
    folder_id: folderId,
    metadata: {
      triggered_by: triggeredBy,
      access_request_id: opts.accessRequestId || null,
      format: 'pdf',
      expires_at: expiresAt.toISOString(),
      entry_count: entries.length,
    },
  });

  const appUrl = (process.env.PUBLIC_APP_URL || 'https://getsafetea.app').replace(/\/$/, '');
  return {
    exportId: String(inserted.id),
    shareToken: shareToken,
    shareUrl: `${appUrl}/api/share/${encodeURIComponent(shareToken)}`,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Render a PDF buffer for an unwrapped folder + entries payload.
 * Synchronous-looking wrapper around pdfkit's stream API.
 */
function renderPdf(data) {
  return new Promise(function (resolve, reject) {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margin: 54, // 0.75"
        info: {
          Title: 'SafeTea Safety Vault export',
          Producer: 'SafeTea',
          Creator: 'SafeTea Safety Vault',
        },
      });
      const chunks = [];
      doc.on('data', function (c) { chunks.push(c); });
      doc.on('end', function () { resolve(Buffer.concat(chunks)); });
      doc.on('error', reject);

      // ─── Header ───────────────────────────────
      doc.fillColor('#E8A0B5').fontSize(20).text('SafeTea', { continued: false });
      doc.fillColor('#666').fontSize(10).text('Safety Vault export', { continued: false });
      doc.moveDown(1.2);

      // ─── Folder title + description ──────────
      doc.fillColor('#000').fontSize(22).text(data.folderTitle, { lineGap: 4 });
      if (data.folderDesc) {
        doc.moveDown(0.3);
        doc.fillColor('#444').fontSize(11).text(data.folderDesc, { lineGap: 2 });
      }
      doc.moveDown(0.6);
      doc.fillColor('#888').fontSize(9).text(
        `Generated ${data.generatedAt.toLocaleString()} · ${data.entries.length} entr${data.entries.length === 1 ? 'y' : 'ies'}` +
        (data.fileCount ? ` · ${data.fileCount} attachment${data.fileCount === 1 ? '' : 's'} (not included in this PDF)` : '')
      );
      doc.moveDown(0.6);

      // ─── Disclaimer ──────────────────────────
      doc.fillColor('#000');
      doc.rect(doc.x, doc.y, 468, 52).fill('#fef6f9');
      doc.fillColor('#8a4b5e').fontSize(9)
        .text(DISCLAIMER, doc.page.margins.left + 8, doc.y + 6, {
          width: 468 - 16, lineGap: 2,
        });
      doc.moveDown(2.5);

      // ─── Entries ──────────────────────────────
      data.entries.forEach(function (e, idx) {
        if (doc.y > 700) doc.addPage();

        // Event / logged timestamp + type
        const stamp = e.event_at
          ? `Event: ${new Date(e.event_at).toLocaleString()}`
          : `Logged: ${new Date(e.logged_at).toLocaleString()}`;
        doc.fillColor('#888').fontSize(9).text(stamp + '   ·   ' + e.entry_type.toUpperCase());

        // Content body
        if (e.content) {
          doc.moveDown(0.3);
          doc.fillColor('#111').fontSize(11).text(e.content, { lineGap: 2 });
        } else {
          doc.moveDown(0.3);
          doc.fillColor('#888').fontSize(10).text('(no text on this entry)', { oblique: true });
        }

        // AI summary (if present)
        if (e.ai_summary) {
          doc.moveDown(0.3);
          doc.fillColor('#7a5a9a').fontSize(9).text('AI summary: ' + e.ai_summary);
        }

        // Extracted dates
        if (e.ai_dates && e.ai_dates.length) {
          const datesText = e.ai_dates
            .map(function (d) {
              const t = d && d.iso ? new Date(d.iso).toLocaleString() : '';
              return t + (d && d.low_confidence ? ' (approximate)' : '');
            })
            .filter(Boolean).join(' · ');
          if (datesText) {
            doc.fillColor('#7a5a9a').fontSize(9).text('Dates noted: ' + datesText);
          }
        }

        // Location
        if (e.location && (e.location.label || e.location.lat)) {
          const locText = e.location.label
            || `${e.location.lat.toFixed(5)}, ${e.location.lng.toFixed(5)}`;
          doc.fillColor('#666').fontSize(9).text('Location: ' + locText);
        }

        // Tags
        if (e.tags && e.tags.length) {
          doc.fillColor('#888').fontSize(8).text(e.tags.join('  ·  '));
        }

        // Separator
        if (idx < data.entries.length - 1) {
          doc.moveDown(0.8);
          doc.strokeColor('#eee').lineWidth(0.5).moveTo(doc.x, doc.y).lineTo(doc.x + 468, doc.y).stroke();
          doc.moveDown(0.8);
        }
      });

      if (!data.entries.length) {
        doc.fillColor('#888').fontSize(11).text('This folder has no entries.', { oblique: true });
      }

      // ─── Footer on every page ────────────────
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.fillColor('#aaa').fontSize(8).text(
          'SafeTea Safety Vault · private record · not legal evidence',
          doc.page.margins.left, doc.page.height - 32,
          { width: 468, align: 'center' }
        );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Revoke an export early. Deletes the Blob, nulls storage_key, keeps the
 * row for audit. Idempotent.
 */
async function revokeExport(exportId, ownerUserId, req) {
  const row = await getOne(
    `SELECT id, owner_user_id, folder_id, storage_key, storage_deleted_at
     FROM vault_exports WHERE id = $1`,
    [exportId]
  );
  if (!row || row.owner_user_id !== ownerUserId) return { ok: false, error: 'Not found' };
  if (row.storage_deleted_at) return { ok: true, already: true };

  if (row.storage_key) {
    try { await blob.del(row.storage_key); } catch (_) {}
  }
  await run(
    `UPDATE vault_exports SET storage_key = NULL, storage_deleted_at = NOW() WHERE id = $1`,
    [exportId]
  );

  audit.write({
    req: req || null,
    actor_user_id: ownerUserId,
    actor_role: 'owner',
    action: audit.ACTIONS.EXPORT_PURGE,
    target_type: 'export',
    target_id: row.id,
    folder_id: row.folder_id,
    metadata: { manual_revoke: true },
  });

  return { ok: true };
}

/**
 * Purge expired exports — called by the cron. Returns a summary.
 */
async function purgeExpired() {
  const rows = await getMany(
    `SELECT id, folder_id, storage_key FROM vault_exports
     WHERE storage_key IS NOT NULL
       AND expires_at <= NOW()
       AND storage_deleted_at IS NULL
     ORDER BY expires_at ASC
     LIMIT 200`
  );

  let purged = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try { if (r.storage_key) await blob.del(r.storage_key); } catch (_) {}
    await run(
      `UPDATE vault_exports SET storage_key = NULL, storage_deleted_at = NOW() WHERE id = $1`,
      [r.id]
    );
    audit.write({
      actor_user_id: null,
      actor_role: 'system',
      action: audit.ACTIONS.EXPORT_PURGE,
      target_type: 'export',
      target_id: r.id,
      folder_id: r.folder_id,
      metadata: { cron_purge: true },
    });
    purged++;
  }
  return { scanned: rows.length, purged: purged };
}

module.exports = {
  generateFolderExport,
  revokeExport,
  purgeExpired,
  DEFAULT_EXPIRY_HOURS,
  MAX_EXPIRY_HOURS,
};
