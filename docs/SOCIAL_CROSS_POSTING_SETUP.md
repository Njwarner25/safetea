# Social Cross-Posting Setup (Buffer)

This is the activation guide for the cross-posting feature shipped in
`/api/admin/cross-post.js` and the UI at `/admin-cross-post.html`. The feature
is dormant until you complete the steps below.

## Why Buffer

Posting to TikTok and Instagram from our own backend would require us to:
- Pass Meta's app review (weeks, often denied for safety-related products)
- Pass TikTok's Content Posting API approval (similarly slow)
- Hold OAuth tokens for both platforms (security exposure)

Buffer holds the OAuth on our behalf and exposes one stable API. We pay
Buffer; Buffer handles the platform politics. This is the cheapest legal way
to ship a cross-poster today.

## Cost

Buffer's Essentials plan ($6/month per channel, billed annually) is the
minimum that includes API access. With three channels (TikTok @safetea_official,
IG @safe_teaapp, Threads @safetea_official) that's ~$18/month. Skip Threads
to drop to $12/month if you want.

## Setup steps

1. **Sign up at buffer.com** with the SafeTea ops email.
2. **Subscribe to Essentials** (or higher). Free tier does not have API access.
3. **Connect your platforms** inside Buffer's UI:
   - Channels → Connect → Instagram → log in as @safe_teaapp
   - Channels → Connect → TikTok → log in as @safetea_official
   - (Optional) Threads, X, etc.
4. **Generate an access token** at https://buffer.com/developers/api/oauth/access-token
   (sign in with the same Buffer account; click "Create access token" and copy it).
5. **Set the token in Vercel:**
   - Vercel dashboard → SafeTea project → Settings → Environment Variables
   - Add `BUFFER_ACCESS_TOKEN` = `<the token from step 4>`
   - Apply to Production (and Preview if you want to test there)
   - Trigger a redeploy so the new env var is picked up
6. **Verify it works:** GET `/api/admin/cross-post-profiles` (with admin auth).
   You should see a JSON list of your connected channels with `configured: true`.

## Using the compose form

Once the token is live, navigate to **`/admin-cross-post.html`**:

- The form auto-loads your Buffer profiles. Pick which platforms to post to.
- Paste your caption. Hashtags go inline at the end (not a separate field).
- Optional: paste a public media URL (image or video). For uploaded videos,
  store them in Vercel Blob first or use any public CDN.
- Optional: pick a future schedule time. Leave blank to publish immediately.
- Submit. The endpoint records the attempt in `social_posts` and forwards it
  to Buffer.

## Without the token

If `BUFFER_ACCESS_TOKEN` is unset, the compose endpoint runs in **simulated mode**:

- Posts are recorded in `social_posts` with `status='simulated'`
- No outbound Buffer API calls are made
- Useful for previewing the queue or letting non-paid users draft posts

This means you can compose and review without subscribing. Once you set the
token and redeploy, future posts go live; the simulated ones stay in the
history as a record but don't auto-send.

## Caption length limits

The endpoint enforces 2,200 characters max — Instagram's hard cap. TikTok and
Threads accept less but the cap protects all platforms in one rule. If you
hit the limit, trim the body, not the hashtags.

## Failed posts

A `status='failed'` row in `social_posts` carries the Buffer error in the
`error` column. Common causes:
- A profile was disconnected (re-link it inside Buffer)
- The media URL returned 404 (re-upload to a stable CDN)
- Buffer rate-limit hit (back off and retry; their limit is generous)

The endpoint never auto-retries — re-submit the form once you've fixed the
underlying issue.

## What this is NOT

- **Not a true "post on TikTok and mirror to IG" reactor.** TikTok doesn't
  give third parties read access to your own posts. You can't post natively
  on TikTok and have us pull it down. Always compose in this form to hit both.
- **Not a content scheduler with a calendar UI.** It's a one-shot composer.
  If you need calendar scheduling, use Buffer's own UI directly — same
  account, same channels, just bypassing our endpoint.
- **Not a video editor.** Upload your finished video file to a CDN first,
  paste the URL.

## Operational notes

- The compose endpoint requires admin role on the SafeTea side. The admin
  user authenticates against SafeTea; Buffer authenticates against itself.
- Every post is logged to `social_posts` with the admin user's ID, so we
  have an audit trail of who queued what.
- The `social_posts` table is admin-internal; users never see it.
