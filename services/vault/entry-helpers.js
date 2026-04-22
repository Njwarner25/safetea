/**
 * Shared validators / sanitizers for vault entry writes.
 * Used by both api/vault/entries.js and api/vault/entries/[id].js.
 */

'use strict';

const { decryptField } = require('./encryption');

const ENTRY_TYPES = ['note', 'photo', 'screenshot', 'document', 'audio', 'video'];
const MAX_CONTENT_LEN = 50000;
const MAX_TAGS = 10;
const MAX_TAG_LEN = 30;
const TAG_PATTERN = /^[a-z0-9_-]+$/;

function parseOptionalTimestamp(value) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

function sanitizeLocation(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  if (typeof raw.label === 'string' && raw.label.trim().length > 0) {
    out.label = raw.label.trim().slice(0, 300);
  }
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
    out.lat = lat;
    out.lng = lng;
  }
  if (!out.label && !('lat' in out)) return null;
  return out;
}

function safeJsonParse(str) {
  try { return JSON.parse(str); } catch (e) { return null; }
}

function decryptLocation(dek, enc) {
  if (!enc) return null;
  try { return safeJsonParse(decryptField(dek, enc)); } catch (e) { return null; }
}

/**
 * Normalize tags. Returns null on any validation error (caller returns 400).
 * Returns [] if input was empty/missing. Dedupes and lowercases.
 */
function sanitizeTags(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return null;
  if (raw.length > MAX_TAGS) return null;
  const seen = new Set();
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i];
    if (typeof t !== 'string') return null;
    const norm = t.trim().toLowerCase();
    if (!norm) return null;
    if (norm.length > MAX_TAG_LEN) return null;
    if (!TAG_PATTERN.test(norm)) return null;
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  return out;
}

module.exports = {
  ENTRY_TYPES,
  MAX_CONTENT_LEN,
  MAX_TAGS,
  MAX_TAG_LEN,
  parseOptionalTimestamp,
  sanitizeLocation,
  decryptLocation,
  safeJsonParse,
  sanitizeTags,
};
