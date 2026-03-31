const { getOne, run } = require('../_utils/db');
const { authenticate, cors, parseBody } = require('../_utils/auth');
const { extractWatermark } = require('../_utils/watermark');

module.exports = async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return cors(res, req);
  }

  try {
    // Handle POST: Create a removal request
    if (req.method === 'POST') {
      // Apply CORS headers
      cors(res, req);

      // Authenticate the user
      const user = await authenticate(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Parse request body
      const { photo_id, reason } = await parseBody(req);

      if (!photo_id) {
        return res.status(400).json({ error: 'photo_id is required' });
      }

      if (!reason) {
        return res.status(400).json({ error: 'reason is required' });
      }

      // Look up the photo by photo_id
      const photo = await getOne(
        'SELECT id, image_data, user_id, deleted_at FROM photos WHERE id = $1',
        [photo_id]
      );

      // Check if photo exists and is not deleted
      if (!photo) {
        return res.status(404).json({ error: 'Photo not found' });
      }

      if (photo.deleted_at) {
        return res.status(404).json({ error: 'Photo has already been deleted' });
      }

      // Extract watermark from the photo's image_data
      let watermarkData;
      try {
        // Decode from base64
        const imageBuffer = Buffer.from(photo.image_data, 'base64');
        watermarkData = await extractWatermark(imageBuffer);
      } catch (error) {
        return res.status(400).json({ error: 'Failed to extract watermark from image' });
      }

      // Verify watermark exists
      if (!watermarkData || !watermarkData.found) {
        return res.status(403).json({
          error: 'Watermark verification failed. Only the original uploader can request photo removal.'
        });
      }

      // Verify watermark's userId matches the authenticated user's ID
      if (watermarkData.userId !== user.id) {
        return res.status(403).json({
          error: 'Watermark verification failed. Only the original uploader can request photo removal.'
        });
      }

      // Create a removal_requests record
      await run(
        `INSERT INTO removal_requests (photo_id, user_id, reason, status, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [photo_id, user.id, reason, 'pending']
      );

      return res.status(201).json({
        success: true,
        message: 'Photo removal request submitted successfully'
      });
    }

    // Handle GET: Check status of user's removal requests
    if (req.method === 'GET') {
      // Apply CORS headers
      cors(res, req);

      // Authenticate the user
      const user = await authenticate(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Get all removal requests for this user
      const { getMany } = require('../_utils/db');
      const removalRequests = await getMany(
        `SELECT id, photo_id, reason, status, created_at
         FROM removal_requests
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [user.id]
      );

      return res.status(200).json({
        success: true,
        requests: removalRequests || []
      });
    }

    // Method not allowed
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Photo removal request error:', error);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
};
