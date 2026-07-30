import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db/pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(__dirname, '..', 'migrations', '001_init.sql');

try {
  const sql = await readFile(migrationPath, 'utf8');
  await pool.query(sql);
  console.log('Migration completed');
} finally {
  await pool.end();
}
