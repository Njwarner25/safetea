const { authenticate, cors, parseBody } = require('../_utils/auth');
const { getOne, run } = require('../_utils/db');
const { extractWatermark } = require('../_utils/watermark');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const body = await parseBody(req);
    const { image } = body;

    if (!image) return res.status(400).json({ error: 'image (base64) is required' });

    // Strip data URI prefix
    const base64Only = image.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Only, 'base64');

    if (imageBuffer.length < 512) {
      return res.status(400).json({ error: 'Image too small to contain watermark' });
    }

    // Extract watermark
    const result = extractWatermark(imageBuffer);

    if (!result.found) {
      return res.status(200).json({
        success: true,
        watermarkFound: false,
        message: 'No SafeTea watermark detected in this image. It may not have been uploaded through SafeTea, or the watermark was stripped.',
      });
    }

    // Look up the user who originally uploaded
    const originalUser = await getOne(
      'SELECT id, display_name, avatar_initial, avatar_color, banned FROM users WHERE id = $1',
      [result.userId]
    );

    // Check if this photo was reported before
    const watermarkHash = require('crypto').createHash('sha256').update(base64Only).digest('hex');

    // Log the extraction/report
    await run(
      `INSERT INTO photo_watermarks (photo_id, user_id, watermark_hash, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT DO NOTHING`,
      [null, user.id, watermarkHash]
    ).catch(() => {});

    // If the reporter is different from the uploader, this is a potential leak
    const isLeak = result.userId !== String(user.id);

    // Count strikes for the original uploader
    let strikeCount = 0;
    if (originalUser) {
      const strikes = await getOne(
        'SELECT COUNT(*) as count FROM user_strikes WHERE user_id = $1',
        [result.userId]
      );
      strikeCount = parseInt(strikes?.count || 0);
    }

    return res.status(200).json({
      success: true,
      watermarkFound: true,
      verified: result.verified,
      originalUploader: originalUser ? {
        id: originalUser.id,
        displayName: originalUser.display_name,
        avatarInitial: originalUser.avatar_initial,
        avatarColor: originalUser.avatar_color,
        isBanned: originalUser.banned || false,
      } : { id: result.userId, displayName: 'Unknown User' },
      uploadedAt: result.timestamp ? new Date(parseInt(result.timestamp)).toISOString() : null,
      isLeak,
      strikeCount,
      message: isLeak
        ? 'SafeTea watermark detected. This image was originally uploaded by another user. This may be a leaked photo.'
        : 'SafeTea watermark detected. This image was uploaded by you.',
    });
  } catch (err) {
    console.error('Watermark extract error:', err);
    return res.status(500).json({ error: 'Failed to analyze image', details: err.message });
  }
};
