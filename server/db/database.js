const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

// Test connection on startup
pool.on('connect', () => {
  console.log('Connected to PostgreSQL');
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL error:', err);
});

// Helper: run a query and return all rows
async function query(text, params) {
  const result = await pool.query(text, params);
  return result;
}

// Helper: get a single row
async function getOne(text, params) {
  const result = await pool.query(text, params);
  return result.rows[0] || null;
}

// Helper: get all rows
async function getAll(text, params) {
  const result = await pool.query(text, params);
  return result.rows;
}

module.exports = { pool, query, getOne, getAll };
