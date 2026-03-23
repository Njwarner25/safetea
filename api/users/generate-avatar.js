const { authenticate, cors } = require('../_utils/auth');

const adjectives = [
    'Brave', 'Clever', 'Gentle', 'Bold', 'Calm', 'Fierce', 'Kind', 'Swift',
    'Wise', 'Witty', 'Bright', 'Cozy', 'Daring', 'Lively', 'Mellow',
    'Radiant', 'Savvy', 'Serene', 'Steady', 'Sunny', 'Warm', 'Vivid',
    'Golden', 'Cosmic', 'Lucky', 'Mystic', 'Noble', 'Plucky', 'Sassy',
    'Spicy', 'Starry', 'Velvet', 'Wild', 'Chill', 'Peachy', 'Electric'
];

const nouns = [
    'Teacup', 'Sparrow', 'Orchid', 'Fern', 'Meadow', 'Pebble', 'Willow',
    'Dahlia', 'Clover', 'Ember', 'Jasmine', 'Maple', 'Iris', 'Sage',
    'Luna', 'Ivy', 'Pearl', 'Wren', 'Coral', 'Hazel', 'Poppy', 'Opal',
    'Violet', 'Juniper', 'Rosemary', 'Thistle', 'Marigold', 'Cricket',
    'Finch', 'Petal', 'Breeze', 'Dove', 'Starling', 'Lotus', 'Daisy'
];

const colors = [
    '#E8A0B5', '#D4768E', '#A78BFA', '#7C3AED', '#6EE7B7', '#34D399',
    '#F59E0B', '#F97316', '#60A5FA', '#3B82F6', '#FB7185', '#EC4899'
];

module.exports = async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const display_name = adj + ' ' + noun;
    const initial = adj[0];
    const color = colors[Math.floor(Math.random() * colors.length)];

    return res.status(200).json({ display_name, initial, color });
};
