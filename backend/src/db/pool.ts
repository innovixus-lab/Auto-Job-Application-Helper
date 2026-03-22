import { Pool } from 'pg';

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.PGHOST || 'localhost',
        port: Number(process.env.PGPORT) || 5432,
        database: process.env.PGDATABASE || 'jobhelper',
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || '',
      }
);

export default pool;
