const { cors, authenticate, parseBody } = require('../_utils/auth');
const { getOne, getMany, run } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  try {
    // Ensure table exists
    await run(`CREATE TABLE IF NOT EXISTS recording_contacts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      contact_name VARCHAR(100) NOT NULL,
      contact_phone VARCHAR(30) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, contact_phone)
    )`);

    // GET — list contacts
    if (req.method === 'GET') {
      const contacts = await getMany(
        'SELECT id, contact_name, contact_phone, created_at FROM recording_contacts WHERE user_id = $1 ORDER BY created_at',
        [user.id]
      );
      return res.status(200).json({ contacts });
    }

    // POST — add contact (max 2)
    if (req.method === 'POST') {
      const body = await parseBody(req);
      const { contactName, contactPhone } = body;

      if (!contactName || !contactPhone) {
        return res.status(400).json({ error: 'Contact name and phone number are required' });
      }

      // Clean phone number
      var phone = contactPhone.replace(/[^0-9+]/g, '');
      if (phone.length < 10) {
        return res.status(400).json({ error: 'Please enter a valid phone number' });
      }
      if (!phone.startsWith('+')) phone = '+1' + phone.replace(/^1/, '');

      // Check max 2 contacts
      const count = await getOne(
        'SELECT COUNT(*) AS total FROM recording_contacts WHERE user_id = $1',
        [user.id]
      );
      if (parseInt(count.total) >= 2) {
        return res.status(400).json({ error: 'Maximum 2 emergency contacts allowed. Remove one first.' });
      }

      // Check duplicate
      const existing = await getOne(
        'SELECT id FROM recording_contacts WHERE user_id = $1 AND contact_phone = $2',
        [user.id, phone]
      );
      if (existing) {
        return res.status(409).json({ error: 'This phone number is already saved' });
      }

      await run(
        'INSERT INTO recording_contacts (user_id, contact_name, contact_phone) VALUES ($1, $2, $3)',
        [user.id, contactName.trim().substring(0, 100), phone]
      );

      return res.status(201).json({ success: true, message: 'Contact added' });
    }

    // DELETE — remove contact
    if (req.method === 'DELETE') {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const contactId = url.searchParams.get('id');
      if (!contactId) return res.status(400).json({ error: 'Contact ID is required' });

      await run(
        'DELETE FROM recording_contacts WHERE id = $1 AND user_id = $2',
        [contactId, user.id]
      );

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Recording contacts error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
