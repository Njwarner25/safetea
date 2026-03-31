const { getMany, run, getOne } = require('./_utils/db');
const { encrypt, hashForLookup } = require('./_utils/encrypt');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!process.env.MIGRATE_SECRET) {
    return res.status(500).json({ error: 'Not configured' });
  }
  const secret = req.query.secret || req.headers['x-migrate-secret'];
  if (secret !== process.env.MIGRATE_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const results = [];

  try {
    // Step 1: Add hash columns if they don't exist
    try {
      await run('ALTER TABLE users ADD COLUMN IF NOT EXISTS email_hash VARCHAR(128)');
      results.push('Added email_hash column');
    } catch (e) {
      results.push('email_hash column: ' + (e.message.includes('already exists') ? 'exists' : e.message));
    }

    try {
      await run('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_hash VARCHAR(128)');
      results.push('Added phone_hash column');
    } catch (e) {
      results.push('phone_hash column: ' + (e.message.includes('already exists') ? 'exists' : e.message));
    }

    // Step 2: Encrypt existing plaintext emails (those without ':' separator = not yet encrypted)
    const unencryptedUsers = await getMany(
      "SELECT id, email, phone FROM users WHERE email_hash IS NULL AND email IS NOT NULL LIMIT 200"
    );

    let encrypted = 0;
    for (const user of unencryptedUsers) {
      try {
        const emailLower = user.email.toLowerCase();
        // Skip if already encrypted (contains ':')
        if (emailLower.includes(':')) {
          // Already encrypted, just need hash
          await run(
            'UPDATE users SET email_hash = $1 WHERE id = $2',
            [hashForLookup(emailLower), user.id]
          );
        } else {
          // Encrypt email and set hash
          const encryptedEmail = encrypt(emailLower);
          const emailHash = hashForLookup(emailLower);

          const updates = ['email = $1', 'email_hash = $2'];
          const params = [encryptedEmail, emailHash];
          let paramIdx = 3;

          // Encrypt phone if present and not already encrypted
          if (user.phone && !user.phone.includes(':')) {
            updates.push('phone = $' + paramIdx);
            params.push(encrypt(user.phone));
            paramIdx++;
            updates.push('phone_hash = $' + paramIdx);
            params.push(hashForLookup(user.phone));
            paramIdx++;
          }

          params.push(user.id);
          await run(
            'UPDATE users SET ' + updates.join(', ') + ' WHERE id = $' + paramIdx,
            params
          );
        }
        encrypted++;
      } catch (e) {
        results.push('Failed to encrypt user ' + user.id + ': ' + e.message);
      }
    }

    results.push('Encrypted ' + encrypted + ' of ' + unencryptedUsers.length + ' users');

    // Step 3: Also encrypt phone numbers in trusted contacts
    try {
      await run('ALTER TABLE date_trusted_contacts ADD COLUMN IF NOT EXISTS contact_phone_hash VARCHAR(128)');
      results.push('Added contact_phone_hash column');
    } catch (e) {
      results.push('contact_phone_hash: ' + (e.message.includes('already exists') ? 'exists' : e.message));
    }

    const total = await getOne('SELECT COUNT(*) as count FROM users');
    const remaining = await getOne("SELECT COUNT(*) as count FROM users WHERE email_hash IS NULL AND email IS NOT NULL");

    return res.status(200).json({
      success: true,
      results,
      totalUsers: parseInt(total.count),
      remainingUnencrypted: parseInt(remaining.count),
      note: remaining.count > 0 ? 'Run this endpoint again to encrypt more users (200 per batch)' : 'All users encrypted!'
    });
  } catch (err) {
    console.error('PII encryption migration error:', err);
    return res.status(500).json({ error: 'Internal server error', results });
  }
};
