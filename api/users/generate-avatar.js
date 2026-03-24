const { authenticate, cors } = require('../_utils/auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // Generate a pseudonym-style display name
  const adjectives = [
    'Brave', 'Bold', 'Clever', 'Calm', 'Fierce', 'Gentle', 'Kind',
    'Loyal', 'Noble', 'Swift', 'Wise', 'Warm', 'Bright', 'True'
  ];
  const nouns = [
    'Rose', 'Sage', 'Fern', 'Ivy', 'Luna', 'Star', 'Dawn',
    'Wren', 'Pearl', 'Sky', 'Rain', 'Dove', 'Bloom', 'Ember'
  ];

  const colors = [
    '#E8A0B5', '#C77DBA', '#9B59B6', '#3498DB', '#1ABC9C',
    '#2ECC71', '#F39C12', '#E74C3C', '#6C7B95', '#D35400'
  ];

  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const color = colors[Math.floor(Math.random() * colors.length)];

  return res.status(200).json({
    display_name: adj + noun,
    color: color
  });
};
