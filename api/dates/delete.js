const { authenticate, cors, parseBody } = require('../_utils/auth');
const { run, getOne } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = await parseBody(req);
  const { checkoutId } = body;

  if (!checkoutId) {
    return res.status(400).json({ error: 'checkoutId is required' });
  }

  try {
    // Verify the checkout belongs to this user
    const checkout = await getOne(
      'SELECT id FROM date_checkouts WHERE id = $1 AND user_id = $2',
      [checkoutId, user.id]
    );

    if (!checkout) {
      return res.status(404).json({ error: 'Date record not found' });
    }

    // Delete trusted contacts first (FK cascade should handle this, but be explicit)
    await run('DELETE FROM date_trusted_contacts WHERE checkout_id = $1', [checkoutId]);

    // Delete the checkout record
    await run('DELETE FROM date_checkouts WHERE id = $1', [checkoutId]);

    return res.status(200).json({ success: true, message: 'Date record deleted' });
  } catch (err) {
    console.error('Delete checkout error:', err);
    return res.status(500).json({ error: 'Failed to delete record', details: err.message });
  }
};
