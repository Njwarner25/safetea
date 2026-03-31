const { authenticate, cors } = require('../_utils/auth');
const { getOne, getMany, run } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // GET /api/photos?id=X — get a single photo
  if (req.method === 'GET') {
    const photoId = req.query.id;
    if (photoId) {
      try {
        const photo = await getOne(
          'SELECT id, user_id, image_data, context, context_id, created_at, is_deleted FROM photos WHERE id = $1',
          [photoId]
        );
        if (!photo || photo.is_deleted) {
          return res.status(404).json({ error: 'Photo not found' });
        }
        return res.status(200).json({
          success: true,
          photo: {
            id: photo.id,
            data: photo.image_data,
            context: photo.context,
            context_id: photo.context_id,
            created_at: photo.created_at,
          },
        });
      } catch (err) {
        return res.status(500).json({ error: 'Failed to retrieve photo' });
      }
    }

    // List user's photos
    try {
      const photos = await getMany(
        `SELECT id, context, context_id, created_at FROM photos
         WHERE user_id = $1 AND is_deleted = false
         ORDER BY created_at DESC LIMIT 50`,
        [user.id]
      );
      return res.status(200).json({ success: true, photos });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to list photos' });
    }
  }

  // DELETE /api/photos?id=X — soft delete
  if (req.method === 'DELETE') {
    const photoId = req.query.id;
    if (!photoId) return res.status(400).json({ error: 'id query param required' });

    try {
      const photo = await getOne(
        'SELECT id, user_id FROM photos WHERE id = $1 AND is_deleted = false',
        [photoId]
      );
      if (!photo) return res.status(404).json({ error: 'Photo not found' });
      if (String(photo.user_id) !== String(user.id) && user.role !== 'admin') {
        return res.status(403).json({ error: 'You can only delete your own photos' });
      }
      await run('UPDATE photos SET is_deleted = true WHERE id = $1', [photoId]);
      return res.status(200).json({ success: true, message: 'Photo deleted' });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to delete photo' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
