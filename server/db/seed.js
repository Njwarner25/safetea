const db = require('./database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// First run migrations
require('./migrate');

console.log('Seeding SafeTea database...');

const salt = bcrypt.genSaltSync(10);

// Seed admin user
const adminId = uuidv4();
const adminHash = bcrypt.hashSync('SafeTea2026!', salt);

const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (id, email, password_hash, display_name, role, city, state, is_verified, avatar_initial, avatar_color)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

insertUser.run(adminId, 'admin@getsafetea.app', adminHash, 'Admin', 'admin', 'Chicago', 'IL', 1, 'A', '#e74c3c');

// Seed test members
const members = [
  { email: 'kate@test.com', name: 'Anonymous Member', city: 'Chicago', state: 'IL', initial: 'K', color: '#6c7b95' },
  { email: 'jen@test.com', name: 'Anonymous Member', city: 'Austin', state: 'TX', initial: 'J', color: '#e67e22' },
  { email: 'anna@test.com', name: 'Anonymous Member', city: 'Miami', state: 'FL', initial: 'A', color: '#9b59b6' },
  { email: 'lisa@test.com', name: 'Anonymous Member', city: 'Denver', state: 'CO', initial: 'L', color: '#2ecc71' }
  ];

const memberIds = [];
members.forEach(m => {
    const id = uuidv4();
    memberIds.push(id);
    const hash = bcrypt.hashSync('TestPass123!', salt);
    insertUser.run(id, m.email, hash, m.name, 'member', m.city, m.state, 1, m.initial, m.color);
});

// Seed community posts
const insertPost = db.prepare(`
  INSERT OR IGNORE INTO posts (id, user_id, city, content, category, reply_count, is_verified)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

const posts = [
  { userId: memberIds[0], city: 'Chicago', content: 'Has anyone dated someone named Jake from Lincoln Park? Looking for experiences...', category: 'question', replies: 12, verified: 1 },
  { userId: memberIds[1], city: 'Chicago', content: 'PSA: This person has been flagged by 4 members across 2 cities...', category: 'alert', replies: 28, verified: 0 },
  { userId: memberIds[2], city: 'Chicago', content: 'Update: He has a second profile on Hinge under a different name. Verified by 3 members.', category: 'warning', replies: 41, verified: 1 },
  { userId: memberIds[3], city: 'Chicago', content: 'Be careful around Wicker Park area. Same person reported by members in 3 cities.', category: 'warning', replies: 56, verified: 0 }
  ];

posts.forEach(p => {
    insertPost.run(uuidv4(), p.userId, p.city, p.content, p.category, p.replies, p.verified);
});

// Seed alerts
const insertAlert = db.prepare(`
  INSERT OR IGNORE INTO alerts (id, city, type, title, description, location, severity, report_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

const alerts = [
  { city: 'Chicago', type: 'safety', title: 'Catfishing Report - Lincoln Park', description: 'Multiple reports of someone using fake photos on Hinge in the Lincoln Park area.', location: 'Lincoln Park', severity: 'high', reports: 8 },
  { city: 'Chicago', type: 'stalking', title: 'Stalking / Unwanted Contact', description: 'Repeated unwanted contact reported by multiple members.', location: 'Lakeview', severity: 'critical', reports: 4 },
  { city: 'Austin', type: 'scam', title: 'Romance Scam Alert', description: 'Be aware of someone requesting money transfers after matching on dating apps.', location: 'Downtown', severity: 'high', reports: 12 }
  ];

alerts.forEach(a => {
    insertAlert.run(uuidv4(), a.city, a.type, a.title, a.description, a.location, a.severity, a.reports);
});

// Seed city votes
const insertCity = db.prepare(`
  INSERT OR IGNORE INTO city_votes (id, city_name, state, vote_count)
    VALUES (?, ?, ?, ?)
    `);

const cities = [
  { name: 'Phoenix', state: 'AZ', votes: 187 },
  { name: 'Nashville', state: 'TN', votes: 156 },
  { name: 'Portland', state: 'OR', votes: 134 },
  { name: 'Charlotte', state: 'NC', votes: 112 },
  { name: 'San Diego', state: 'CA', votes: 98 },
  { name: 'Minneapolis', state: 'MN', votes: 76 },
  { name: 'Philadelphia', state: 'PA', votes: 61 },
  { name: 'Las Vegas', state: 'NV', votes: 43 }
  ];

cities.forEach(c => {
    insertCity.run(uuidv4(), c.name, c.state, c.votes);
});

console.log('Database seeded successfully!');
console.log('Admin login: admin@getsafetea.app / SafeTea2026!');
