import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import pool from './pool';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

async function migrate(): Promise<void> {
  const client = await pool.connect();
  try {
    // Ensure the tracking table exists (run the first migration file directly)
    const trackingSql = fs.readFileSync(
      path.join(MIGRATIONS_DIR, '000_create_schema_migrations.sql'),
      'utf8'
    );
    await client.query(trackingSql);

    // Collect all migration files in sorted order
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const version = file.replace('.sql', '');

      // Skip if already applied
      const { rows } = await client.query(
        'SELECT version FROM schema_migrations WHERE version = $1',
        [version]
      );
      if (rows.length > 0) {
        console.log(`[migrate] skipping ${file} (already applied)`);
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1)',
          [version]
        );
        await client.query('COMMIT');
        console.log(`[migrate] applied ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration failed for ${file}: ${(err as Error).message}`);
      }
    }

    console.log('[migrate] all migrations complete');
  } finally {
    client.release();
  }
}

// Allow running directly: ts-node src/db/migrate.ts
if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

export default migrate;
