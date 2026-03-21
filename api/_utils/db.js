const { sql } = require('@vercel/postgres');

async function query(text, params = []) {
    try {
          const result = await sql.query(text, params);
          return result;
    } catch (error) {
          console.error('Database query error:', error);
          throw error;
    }
}

async function getOne(text, params = []) {
    const result = await query(text, params);
    return result.rows[0] || null;
}

async function getMany(text, params = []) {
    const result = await query(text, params);
    return result.rows;
}

async function run(text, params = []) {
    const result = await query(text, params);
    return { rowCount: result.rowCount };
}

module.exports = { query, getOne, getMany, run };
