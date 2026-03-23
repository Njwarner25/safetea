require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { pool } = require('./database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const migrate = require('./migrate');

async function seed() {
  // Run migrations first
  await migrate();

  console.log('Seeding SafeTea database...');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const salt = await bcrypt.genSalt(10);

    // Seed admin user
    const adminId = uuidv4();
    const adminHash = await bcrypt.hash('SafeTea2026!', salt);

    await client.query(`
      INSERT INTO users (id, email, password_hash, display_name, role, city, state, is_verified, avatar_initial, avatar_color, subscription_tier)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (email) DO NOTHING
    `, [adminId, 'admin@getsafetea.app', adminHash, 'Admin', 'admin', 'Chicago', 'IL', true, 'A', '#e74c3c', 'premium']);

    // Seed test members
    const members = [
      { email: 'kate@test.com', name: 'Anonymous Member', city: 'Chicago', state: 'IL', initial: 'K', color: '#6c7b95' },
      { email: 'jen@test.com', name: 'Anonymous Member', city: 'Austin', state: 'TX', initial: 'J', color: '#e67e22' },
      { email: 'anna@test.com', name: 'Anonymous Member', city: 'Miami', state: 'FL', initial: 'A', color: '#9b59b6' },
      { email: 'lisa@test.com', name: 'Anonymous Member', city: 'Denver', state: 'CO', initial: 'L', color: '#2ecc71' }
    ];

    const memberIds = [];
    for (const m of members) {
      const id = uuidv4();
      memberIds.push(id);
      const hash = await bcrypt.hash('TestPass123!', salt);
      await client.query(`
        INSERT INTO users (id, email, password_hash, display_name, role, city, state, is_verified, avatar_initial, avatar_color)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (email) DO NOTHING
      `, [id, m.email, hash, m.name, 'member', m.city, m.state, true, m.initial, m.color]);
    }

    // Seed community posts
    const posts = [
      { userId: memberIds[0], city: 'Chicago', content: 'Has anyone dated someone named Jake from Lincoln Park? Looking for experiences...', category: 'question', replies: 12, verified: true },
      { userId: memberIds[1], city: 'Chicago', content: 'PSA: This person has been flagged by 4 members across 2 cities...', category: 'alert', replies: 28, verified: false },
      { userId: memberIds[2], city: 'Chicago', content: 'Update: He has a second profile on Hinge under a different name. Verified by 3 members.', category: 'warning', replies: 41, verified: true },
      { userId: memberIds[3], city: 'Chicago', content: 'Be careful around Wicker Park area. Same person reported by members in 3 cities.', category: 'warning', replies: 56, verified: false }
    ];

    for (const p of posts) {
      await client.query(`
        INSERT INTO posts (id, user_id, city, content, category, reply_count, is_verified)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [uuidv4(), p.userId, p.city, p.content, p.category, p.replies, p.verified]);
    }

    // Seed alerts
    const alerts = [
      { city: 'Chicago', type: 'safety', title: 'Catfishing Report - Lincoln Park', description: 'Multiple reports of someone using fake photos on Hinge in the Lincoln Park area.', location: 'Lincoln Park', severity: 'high', reports: 8 },
      { city: 'Chicago', type: 'stalking', title: 'Stalking / Unwanted Contact', description: 'Repeated unwanted contact reported by multiple members.', location: 'Lakeview', severity: 'critical', reports: 4 },
      { city: 'Austin', type: 'scam', title: 'Romance Scam Alert', description: 'Be aware of someone requesting money transfers after matching on dating apps.', location: 'Downtown', severity: 'high', reports: 12 }
    ];

    for (const a of alerts) {
      await client.query(`
        INSERT INTO alerts (id, city, type, title, description, location, severity, report_count)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [uuidv4(), a.city, a.type, a.title, a.description, a.location, a.severity, a.reports]);
    }

    // Seed city votes - includes major dating app user cities (18-35 demographic)
    const cities = [
      // Active communities (already above 200 threshold)
      { name: 'Chicago', state: 'IL', votes: 245, isActive: true },
      { name: 'Austin', state: 'TX', votes: 228, isActive: true },
      { name: 'Miami', state: 'FL', votes: 215, isActive: true },
      { name: 'Denver', state: 'CO', votes: 202, isActive: true },

      // Near-threshold cities
      { name: 'Phoenix', state: 'AZ', votes: 187, isActive: false },
      { name: 'Nashville', state: 'TN', votes: 156, isActive: false },
      { name: 'Portland', state: 'OR', votes: 134, isActive: false },
      { name: 'Charlotte', state: 'NC', votes: 112, isActive: false },
      { name: 'San Diego', state: 'CA', votes: 98, isActive: false },
      { name: 'Minneapolis', state: 'MN', votes: 76, isActive: false },
      { name: 'Philadelphia', state: 'PA', votes: 61, isActive: false },
      { name: 'Las Vegas', state: 'NV', votes: 43, isActive: false },

      // Major metropolitan areas with high dating app usage
      { name: 'New York', state: 'NY', votes: 289, isActive: true },
      { name: 'Los Angeles', state: 'CA', votes: 267, isActive: true },
      { name: 'Houston', state: 'TX', votes: 198, isActive: false },
      { name: 'Dallas', state: 'TX', votes: 187, isActive: false },
      { name: 'Atlanta', state: 'GA', votes: 176, isActive: false },
      { name: 'Seattle', state: 'WA', votes: 168, isActive: false },
      { name: 'Boston', state: 'MA', votes: 154, isActive: false },
      { name: 'Washington DC', state: 'DC', votes: 142, isActive: false },
      { name: 'San Francisco', state: 'CA', votes: 139, isActive: false },
      { name: 'Miami Beach', state: 'FL', votes: 124, isActive: false },
      { name: 'Brooklyn', state: 'NY', votes: 118, isActive: false },
      { name: 'Santa Monica', state: 'CA', votes: 108, isActive: false },
      { name: 'West Hollywood', state: 'CA', votes: 95, isActive: false },
      { name: 'Arlington', state: 'VA', votes: 87, isActive: false }
    ];

    for (const c of cities) {
      await client.query(`
        INSERT INTO city_votes (id, city_name, state, vote_count, is_active)
        VALUES ($1, $2, $3, $4, $5)
      `, [uuidv4(), c.name, c.state, c.votes, c.isActive]);
    }

    await client.query('COMMIT');
    console.log('Database seeded successfully!');
    console.log('Admin login: admin@getsafetea.app / SafeTea2026!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
} else {
  module.exports = seed;
}
