import pg from 'pg';
import { readFileSync } from 'node:fs';

pg.types.setTypeParser(1700, (v) => Number(v)); // NUMERIC -> number
pg.types.setTypeParser(20, (v) => Number(v));   // BIGINT (COUNT) -> number

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres@localhost:5432/clientdeck',
});

export const query = (text, params) => pool.query(text, params);

export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function migrate() {
  const sql = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
  await pool.query(sql);
}
