/**
 * SafeTea Safety Vault — Journaling Assistant (OpenAI)
 *
 * Feature-flagged dark by default. Only runs when BOTH:
 *   - VAULT_ASSISTANT_ENABLED === 'true' at the server
 *   - folder.ai_enabled === true
 *
 * Per the behavior spec in
 *   2-product/specs/safety-vault-journaling-assistant.md
 *
 * Critical rules the spec encodes:
 *   - Retrieve-never-invent: the assistant may only surface resources
 *     that come from vault_resources. The server injects rows into the
 *     system prompt; the model is instructed never to name a resource
 *     not in that list.
 *   - Never summarize the user's trauma unprompted.
 *   - Never generate evidence-style narratives.
 *   - Never ask "why" questions about the event or perpetrator.
 *
 * Implementation detail worth flagging: the model does NOT receive the
 * user's vault entries. It only sees the chat messages (user<->assistant).
 * This keeps vault content isolated from the model even when the same
 * folder has AI organization enabled — two separate trust boundaries.
 */

'use strict';

const OpenAI = require('openai');
const { getOne, getMany } = require('../../api/_utils/db');

const MODEL_NAME = 'gpt-4o';
const MAX_HISTORY_MESSAGES = 20;
const MAX_RESOURCE_INJECT = 15;
const RESPONSE_MAX_TOKENS = 600;

function isEnabled() {
  return process.env.VAULT_ASSISTANT_ENABLED === 'true'
    && !!process.env.VAULT_ASSISTANT_OPENAI_KEY;
}

function getClient() {
  if (!process.env.VAULT_ASSISTANT_OPENAI_KEY) return null;
  return new OpenAI({ apiKey: process.env.VAULT_ASSISTANT_OPENAI_KEY });
}

/**
 * Production system prompt from
 *   2-product/specs/safety-vault-journaling-assistant.md
 * — see that file for the rationale behind each rule. Any change here
 * must be mirrored in the spec.
 */
const SYSTEM_PROMPT = [
  'You are the Safety Vault Assistant inside the SafeTea app. Your job is to help the user journal, document, and organize sensitive personal safety records. Many users come to you after experiencing intimate-partner violence, sexual assault, stalking, coercive control, or harassment.',
  '',
  'Core behavior:',
  '1. BELIEVE the user on first mention. Do not ask "are you sure?", do not ask "what happened to make you think that?", do not question the experience.',
  '2. USE THE USER\'S OWN WORDS. Do not substitute clinical terms for what they wrote.',
  '3. OFFER CHOICE in every response. The user decides what to write, when to pause, what to save, what to delete.',
  '4. VALIDATE BEFORE SUGGESTING. First reply to any disclosure is validation. Suggestions only if the user explicitly asks.',
  '5. DO NOT ASK "WHY" QUESTIONS about the event, the perpetrator, or the user\'s choices.',
  '6. DO NOT DIAGNOSE. You are not a clinician.',
  '7. DO NOT GIVE LEGAL ADVICE. Refer to RAINN / NDVH legal lines instead.',
  '8. DO NOT SUMMARIZE the user\'s trauma unprompted.',
  '9. DO NOT ROLEPLAY as the perpetrator, a therapist, a police officer, or a lawyer. Decline politely.',
  '10. ASSUME THE DEVICE MAY NOT BE SAFE. On first turn of a new session, briefly remind the user they can exit fast. Do not lecture after that.',
  '',
  'Tone: warm, plain, short. Not clinical. Not saccharine. You are a quiet, trustworthy presence.',
  '',
  'Escalation: if the user signals self-harm ("I want to die"), imminent danger ("he\'s outside right now"), or a child at risk, gently surface the relevant crisis hotline from the curated resources provided to you in context (988, 911, NDVH, Childhelp, RAINN). Do not repeat these unless the signal recurs.',
  '',
  'Resource recommendations — RETRIEVE, NEVER INVENT:',
  '- You will receive a list of SafeTea-vetted resources in every turn. Surface only those. Do not name any therapist, shelter, app, phone number, organization, or URL that is not in that list — not from your training data, not from inference.',
  '- If the list is empty, say so plainly. Do not guess.',
  '- Always offer resources as OPTIONS, never as PRESCRIPTIONS. "Here\'s one you could look at" — never "you should call this one."',
  '',
  'Hard limits:',
  '- You will not tell the user what to do about the person who harmed them.',
  '- You will not tell the user whether their experience "counts" as abuse.',
  '- You will not generate narratives that sound like evidence statements.',
  '- You will not identify or name third parties back to the user beyond what they typed themselves.',
  '',
  'The user is the author. You are the pen.',
].join('\n');

/**
 * Load the curated resources and format them for injection into the
 * system prompt. Admin-curated list — never user-influenced.
 */
async function loadResourcesForUser(userId) {
  // Resolve user's state from profile for localization (defaults to US national only).
  const user = await getOne(
    `SELECT city, state FROM users WHERE id = $1`,
    [userId]
  );
  const state = user && user.state ? String(user.state).toUpperCase().slice(0, 2) : null;

  const params = ['US', MAX_RESOURCE_INJECT];
  let stateClause = '';
  if (state) {
    params.push(state);
    stateClause = ` AND (state IS NULL OR state = $${params.length})`;
  }
  const rows = await getMany(
    `SELECT id, category, name, description, url, phone, sms_info
     FROM vault_resources
     WHERE active = true AND country = $1 ${stateClause}
     ORDER BY sort_order ASC, name ASC
     LIMIT $2`,
    params
  );
  return rows;
}

function formatResourcesBlock(resources) {
  if (!resources.length) {
    return 'CURATED RESOURCES AVAILABLE TO YOU IN THIS TURN:\n(none — do not invent any resource. If the user asks for one, say plainly that you don\'t have a verified resource for that specifically and offer to keep helping them document.)';
  }
  const lines = ['CURATED RESOURCES AVAILABLE TO YOU IN THIS TURN (surface only these; never invent):'];
  resources.forEach(function (r) {
    const line = [
      '- [' + r.category + '] ' + r.name,
      '    description: ' + r.description,
      r.phone ? '    phone: ' + r.phone : null,
      r.sms_info ? '    sms: ' + r.sms_info : null,
      r.url ? '    url: ' + r.url : null,
    ].filter(Boolean);
    lines.push(line.join('\n'));
  });
  lines.push('');
  lines.push('Do NOT surface any phone number, URL, name, or organization that is not in the above list.');
  return lines.join('\n');
}

/**
 * Run one chat turn. Takes the full conversation so far (as already
 * decrypted) + the new user message, returns the assistant reply text.
 *
 * @param {object} opts
 * @param {number} opts.userId
 * @param {number} opts.folderId
 * @param {Array<{role:string, content:string}>} opts.history  most-recent-last
 * @param {string} opts.userMessage
 * @returns {Promise<{ reply: string, resources_surfaced: number[], model: string }>}
 */
async function respond(opts) {
  if (!isEnabled()) {
    throw new Error('Journaling Assistant is currently disabled');
  }
  const client = getClient();
  if (!client) throw new Error('Assistant client not configured');

  const userId = parseInt(opts.userId, 10);
  const userMessage = String(opts.userMessage || '').trim();
  if (!userMessage) throw new Error('userMessage required');

  // Pull curated resources for context (retrieve-never-invent)
  const resources = await loadResourcesForUser(userId);
  const resourceIds = resources.map(function (r) { return Number(r.id); });

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: formatResourcesBlock(resources) },
  ];

  // Append up to MAX_HISTORY_MESSAGES prior turns. NOTE: the user's
  // vault entries are NOT included — only chat history.
  const trimmedHistory = (opts.history || []).slice(-MAX_HISTORY_MESSAGES);
  trimmedHistory.forEach(function (m) {
    if (!m || !m.content) return;
    if (m.role !== 'user' && m.role !== 'assistant') return;
    messages.push({ role: m.role, content: String(m.content) });
  });
  messages.push({ role: 'user', content: userMessage });

  const completion = await client.chat.completions.create({
    model: MODEL_NAME,
    messages: messages,
    temperature: 0.4,
    max_tokens: RESPONSE_MAX_TOKENS,
    user: 'vault-' + userId + '-folder-' + opts.folderId,
  });

  const reply = completion && completion.choices && completion.choices[0] &&
                completion.choices[0].message && completion.choices[0].message.content || '';
  return {
    reply: String(reply).trim() || '(I\'m here when you\'re ready to keep writing.)',
    resources_surfaced: resourceIds,
    model: MODEL_NAME,
  };
}

module.exports = {
  respond,
  isEnabled,
  SYSTEM_PROMPT,
};
