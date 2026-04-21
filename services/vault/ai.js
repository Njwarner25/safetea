/**
 * SafeTea Safety Vault — AI organization (Gemini)
 *
 * Produces structured metadata from a single user-authored entry:
 *   - A one-sentence neutral summary (their language, not the model's)
 *   - 0..5 suggested kebab-case tags
 *   - 0..N extracted dates with per-item confidence
 *   - An overall confidence score 0..1
 *
 * This service must:
 *   - NEVER invent facts not present in the text
 *   - NEVER overwrite the user's original content
 *   - NEVER interpret, diagnose, or recommend
 *   - Mark low-confidence extracted dates (< 0.7) with the flag intact
 *
 * All outputs are encrypted with the folder's DEK before persistence.
 * Raw plaintext never touches vault_entries.
 *
 * V1 model: gemini-2.0-flash. Opt-in per folder (folder.ai_enabled = true).
 */

'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');

const MODEL_NAME = 'gemini-2.0-flash';
const MAX_INPUT_CHARS = 12000;   // ~3000 tokens of content — plenty for a journal entry
const MAX_SUMMARY_CHARS = 280;

/**
 * Returns null if the API key is not configured (fails closed without
 * throwing — AI is opt-in, absence is a valid state).
 */
function getClient() {
  const key = process.env.VAULT_GEMINI_API_KEY;
  if (!key) return null;
  return new GoogleGenerativeAI(key);
}

/**
 * Survivor content often involves abuse, violence, or coercion. Default
 * safety filters over-block this testimony as "harassment" or "sexually
 * explicit" when the user is simply describing what happened to them.
 * Dialing to BLOCK_ONLY_HIGH avoids silencing survivors while still
 * preventing explicit harm-inducing output from the model.
 */
const SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
];

/**
 * Strict JSON schema for Gemini's structured-output mode. Any field the
 * model can't fill gets a safe default (empty string / array / zero) so
 * the caller never has to defend against missing keys.
 */
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    suggested_tags: { type: 'array', items: { type: 'string' } },
    extracted_dates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          iso: { type: 'string' },
          confidence: { type: 'number' },
          evidence: { type: 'string' },
        },
        required: ['iso', 'confidence'],
      },
    },
    overall_confidence: { type: 'number' },
  },
  required: ['summary', 'suggested_tags', 'extracted_dates', 'overall_confidence'],
};

/**
 * The prompt is tight on purpose. No persona. No "be helpful." Third-person,
 * mechanical, instructed to refuse invention.
 */
function buildPrompt(entryText) {
  return (
    'You are a privacy-preserving organizer that produces structured metadata for a personal safety journal. ' +
    'Your ONLY job is to extract what is in the text. You must not add, infer, diagnose, recommend, or interpret.\n\n' +
    'Rules:\n' +
    '- summary: one neutral sentence, <= 280 chars, using the author\'s own vocabulary. Never add words like "allegedly", "claims", or clinical terms the author did not use. If you cannot summarize without adding, return an empty string.\n' +
    '- suggested_tags: 0..5 kebab-case tags (lowercase alphanumeric + hyphens only). Topical only (e.g. "work", "text-messages", "location"). NOT diagnostic ("abuse", "trauma") unless the author explicitly used that word.\n' +
    '- extracted_dates: every specific date/time the author mentioned, normalized to ISO-8601 UTC. Include confidence 0..1 and a short evidence snippet (verbatim) that supports the extraction. If the author wrote a relative time ("last Monday at 3pm"), use the current date as reference and mark confidence <= 0.7.\n' +
    '- overall_confidence: your confidence in the summary and extractions overall.\n' +
    '- NEVER invent a date, person, or event not in the text.\n' +
    '- NEVER return nested objects other than what the schema allows.\n\n' +
    'Author\'s text:\n"""\n' + entryText + '\n"""'
  );
}

/**
 * Call Gemini and parse its structured JSON response.
 * Returns a normalized object or throws on hard failure.
 */
async function organizeText(plaintext) {
  const client = getClient();
  if (!client) throw new Error('VAULT_GEMINI_API_KEY not configured');

  const input = String(plaintext || '').slice(0, MAX_INPUT_CHARS);
  if (!input.trim()) {
    return { summary: '', suggested_tags: [], extracted_dates: [], overall_confidence: 0 };
  }

  const model = client.getGenerativeModel({
    model: MODEL_NAME,
    safetySettings: SAFETY_SETTINGS,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 512,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  const result = await model.generateContent(buildPrompt(input));
  const response = result && result.response;

  // Safety-blocked responses have an empty text(). Treat as "unable to
  // organize" not as an error — the user still has their original entry.
  let text;
  try {
    text = response && typeof response.text === 'function' ? response.text() : '';
  } catch (_) {
    text = '';
  }
  if (!text) {
    return { summary: '', suggested_tags: [], extracted_dates: [], overall_confidence: 0, skipped_by_safety: true };
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error('Gemini returned non-JSON content');
  }

  return normalize(parsed);
}

/**
 * Final defense against malformed output. Returns the fields the caller
 * expects, regardless of what the model produced.
 */
function normalize(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const summary = typeof r.summary === 'string' ? r.summary.slice(0, MAX_SUMMARY_CHARS) : '';
  const tags = Array.isArray(r.suggested_tags) ? r.suggested_tags.slice(0, 5).map(normalizeTag).filter(Boolean) : [];
  const dates = Array.isArray(r.extracted_dates)
    ? r.extracted_dates.map(normalizeDate).filter(Boolean).slice(0, 20)
    : [];
  const conf = typeof r.overall_confidence === 'number' && isFinite(r.overall_confidence)
    ? clamp01(r.overall_confidence)
    : 0;
  return {
    summary: summary,
    suggested_tags: tags,
    extracted_dates: dates,
    overall_confidence: conf,
  };
}

function normalizeTag(t) {
  if (typeof t !== 'string') return null;
  const norm = t.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
  if (norm.length < 2 || norm.length > 30) return null;
  return norm;
}

function normalizeDate(d) {
  if (!d || typeof d !== 'object') return null;
  const iso = typeof d.iso === 'string' ? d.iso.trim() : '';
  if (!iso) return null;
  const parsed = new Date(iso);
  if (isNaN(parsed.getTime())) return null;
  const confidence = typeof d.confidence === 'number' && isFinite(d.confidence) ? clamp01(d.confidence) : 0;
  const evidence = typeof d.evidence === 'string' ? d.evidence.trim().slice(0, 200) : '';
  return {
    iso: parsed.toISOString(),
    confidence: confidence,
    evidence: evidence,
    low_confidence: confidence < 0.7,
  };
}

function clamp01(n) {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

module.exports = {
  organizeText,
  MODEL_NAME,
};
