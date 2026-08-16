/* eslint-disable @typescript-eslint/no-require-imports */
require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const tables = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public'"
    );
    console.log('TABLES:', JSON.stringify(tables.rows));
    const cols = await client.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='User'"
    );
    console.log('USER COLS:', JSON.stringify(cols.rows));
    const phones = await client.query(
      'SELECT phoneNumber, role, status FROM "User" LIMIT 5'
    );
    console.log('SAMPLE:', JSON.stringify(phones.rows));
  } catch (e) {
    console.error('ERR:', e.message);
  } finally {
    await client.end().catch(() => {});
  }
})();
