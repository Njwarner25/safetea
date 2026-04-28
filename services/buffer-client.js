/**
 * Buffer API client.
 *
 * Tiny fetch-based wrapper around Buffer's Publish API. Buffer (buffer.com) is
 * a third-party scheduler that holds the OAuth tokens for our TikTok / IG /
 * Threads / X accounts and pushes content to all of them on our behalf. Using
 * Buffer means we never store platform tokens directly and we don't have to
 * pass Meta or TikTok app review.
 *
 * Setup (one-time, ~5 minutes):
 *   1. Create a Buffer account: https://buffer.com (Essentials plan or above
 *      to get API access — currently $6/mo)
 *   2. Connect your TikTok (@safetea_official) and Instagram (@safe_teaapp)
 *      accounts inside Buffer's UI
 *   3. Generate an access token at:
 *        https://buffer.com/developers/api/oauth/access-token
 *   4. Set BUFFER_ACCESS_TOKEN in your Vercel environment
 *
 * Without the token this module operates in "log only" mode — the cross-post
 * endpoint will record intent in the social_posts table but never make outbound
 * API calls. That makes the admin form usable for review/queueing before we go
 * live with paid scheduling.
 */

const BUFFER_API = 'https://api.bufferapp.com/1';

function isConfigured() {
  return !!process.env.BUFFER_ACCESS_TOKEN;
}

async function bufferRequest(pathOrUrl, opts) {
  if (!isConfigured()) {
    return { ok: false, status: 0, error: 'BUFFER_ACCESS_TOKEN not configured', simulated: true };
  }

  const token = process.env.BUFFER_ACCESS_TOKEN;
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : (BUFFER_API + pathOrUrl);
  const method = (opts && opts.method) || 'GET';
  const body = opts && opts.body;

  // Buffer accepts form-urlencoded for POST; we marshal accordingly.
  const init = {
    method,
    headers: {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/json'
    }
  };

  if (body) {
    init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    if (typeof body === 'string') {
      init.body = body;
    } else {
      const params = new URLSearchParams();
      for (const k of Object.keys(body)) {
        const v = body[k];
        if (Array.isArray(v)) {
          for (const item of v) params.append(k + '[]', item);
        } else if (v != null) {
          params.append(k, String(v));
        }
      }
      init.body = params.toString();
    }
  }

  try {
    const res = await fetch(url, init);
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = { raw: text }; }
    if (!res.ok) {
      return { ok: false, status: res.status, error: (data && data.error) || text || ('HTTP ' + res.status), data };
    }
    return { ok: true, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, error: err.message };
  }
}

// List the connected Buffer "profiles" (one per platform connection).
// Used by the admin form to populate the platform picker.
async function listProfiles() {
  return bufferRequest('/profiles.json');
}

// Schedule a post.
//   profileIds: array of Buffer profile IDs (one per platform we're posting to)
//   text:        caption / body
//   mediaUrl:    public URL of the image or video. Buffer fetches it.
//   scheduledAt: ISO string or null for "share now"
async function schedulePost({ profileIds, text, mediaUrl, scheduledAt }) {
  if (!profileIds || !profileIds.length) {
    return { ok: false, status: 0, error: 'No profile IDs' };
  }

  const body = {
    profile_ids: profileIds,
    text: text || ''
  };

  if (mediaUrl) {
    body.media = JSON.stringify({ link: mediaUrl, photo: mediaUrl });
  }

  if (scheduledAt) {
    // Buffer expects a Unix timestamp (seconds). Accept ISO too.
    const ts = Math.floor(new Date(scheduledAt).getTime() / 1000);
    if (Number.isFinite(ts) && ts > 0) {
      body.scheduled_at = ts;
    } else {
      body.now = true;
    }
  } else {
    body.now = true;
  }

  return bufferRequest('/updates/create.json', { method: 'POST', body });
}

module.exports = {
  isConfigured,
  listProfiles,
  schedulePost
};
