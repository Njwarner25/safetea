const { sql } = require('@vercel/postgres');

async function query(text, params = []) {
    try {
          const result = await sql.query(text, params);
          return result;
    } catch (error) {
          // Log full error details so we can see the actual problem in Vercel logs
          console.error('Database query error:', error.message || error);
          if (error.code) console.error('  DB error code:', error.code);
          if (error.severity) console.error('  Severity:', error.severity);
          if (error.routine) console.error('  Routine:', error.routine);

          // Retry once on connection errors (ECONNRESET, ECONNREFUSED, connection terminated, etc.)
          const retriable = ['ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ETIMEDOUT', '57P01', '57P03', '08006', '08001', '08003', '08004'];
          const isRetriable = retriable.includes(error.code) ||
              (error.message && (
                  error.message.includes('connection terminated') ||
                  error.message.includes('Connection terminated') ||
                  error.message.includes('fetch failed') ||
                  error.message.includes('CONNECT_TIMEOUT') ||
                  error.message.includes('socket hang up')
              ));

          if (isRetriable) {
              console.log('  Retrying query in 1s...');
              await new Promise(r => setTimeout(r, 1000));
              try {
                  const retry = await sql.query(text, params);
                  console.log('  Retry succeeded');
                  return retry;
              } catch (retryErr) {
                  console.error('  Retry also failed:', retryErr.message || retryErr);
                  throw retryErr;
              }
          }
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
