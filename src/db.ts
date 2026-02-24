const INIT_SQL = `
  CREATE SCHEMA IF NOT EXISTS offchain;
  CREATE TABLE IF NOT EXISTS offchain.artifact_token (
    collection TEXT NOT NULL,
    token_id TEXT NOT NULL,
    token_standard TEXT NOT NULL,
    token_uri TEXT,
    name TEXT,
    description TEXT,
    image TEXT,
    animation_url TEXT,
    data JSON,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (collection, token_id)
  );
  CREATE TABLE IF NOT EXISTS offchain.artifact_collection (
    collection TEXT PRIMARY KEY,
    token_standard TEXT NOT NULL,
    name TEXT,
    symbol TEXT,
    owner TEXT,
    contract_uri TEXT,
    description TEXT,
    image TEXT,
    data JSON,
    updated_at INTEGER NOT NULL
  );
`;

export async function createOffchainDb(options?: {
  databaseUrl?: string;
  dataDir?: string;
}): Promise<{ db: any }> {
  const databaseUrl =
    options?.databaseUrl ??
    process.env.DATABASE_PRIVATE_URL ??
    process.env.DATABASE_URL;

  if (databaseUrl) {
    const { default: pg } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const pool = new pg.Pool({ connectionString: databaseUrl });
    await pool.query(INIT_SQL);
    return { db: drizzle(pool) };
  }

  const dataDir = options?.dataDir ?? ".ponder/artifacts";
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const client = new PGlite(dataDir);
  await client.exec(INIT_SQL);
  return { db: drizzle(client) };
}
