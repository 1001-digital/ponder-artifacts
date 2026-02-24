# @1001-digital/ponder-artifacts

Server-side artifact metadata caching for [Ponder](https://ponder.sh) indexers. Resolves NFT token and collection metadata (ERC721 + ERC1155) on demand, caches it with a 30-day TTL, and serves it via ready-to-mount Hono API routes.

Works with both **PostgreSQL** and **PGlite** (Ponder's default embedded database) — no Postgres required for development.

## Why offchain?

Ponder rebuilds its onchain tables from scratch on every reindex. Token metadata (names, images, descriptions) doesn't change often, but fetching it from IPFS/Arweave on every page load is slow and redundant across clients.

This package stores artifact metadata in a **separate offchain table** that persists across reindexes. Metadata is resolved lazily on first request and cached with a 30-day TTL. Many concurrent requests for the same token result in a single RPC + IPFS lookup — not one per client.

## Install

```bash
pnpm add @1001-digital/ponder-artifacts
```

Peer dependencies (your ponder app should already have these):

```bash
pnpm add drizzle-orm hono viem
```

## Quick start

### 1. Mount the routes

```typescript
// src/api/index.ts
import { db, publicClients } from "ponder:api";
import schema from "ponder:schema";
import { Hono } from "hono";
import { client, graphql } from "ponder";
import {
  createArtifactRoutes,
  createOffchainDb,
} from "@1001-digital/ponder-artifacts";

const { db: artifactDb } = await createOffchainDb();

const app = new Hono();

app.route(
  "/artifacts",
  createArtifactRoutes({
    client: publicClients["ethereum"],
    db: artifactDb,
  }),
);

app.use("/sql/*", client({ db, schema }));
app.use("/", graphql({ db, schema }));

export default app;
```

That's it. You now have:

| Method | Path | Behavior |
|--------|------|----------|
| GET | `/artifacts/token/:collection/:tokenId` | Returns cached metadata, refreshes if stale (>30 days) |
| POST | `/artifacts/token/:collection/:tokenId` | Force refresh from chain |
| GET | `/artifacts/collection/:address` | Returns cached collection info, refreshes if stale |
| POST | `/artifacts/collection/:address` | Force refresh from chain |

On fetch failure, stale cache is returned if available; 500 otherwise.

## How `createOffchainDb` works

`createOffchainDb()` auto-detects your database setup:

- **With `DATABASE_URL`** (or `DATABASE_PRIVATE_URL`): connects to PostgreSQL, creates the `offchain` schema and tables if they don't exist.
- **Without `DATABASE_URL`**: uses PGlite (Postgres-in-WASM), stores data in `.ponder/artifacts/` by default.

```typescript
// Auto-detect (recommended)
const { db } = await createOffchainDb();

// Explicit Postgres
const { db } = await createOffchainDb({ databaseUrl: "postgresql://..." });

// Explicit PGlite with custom directory
const { db } = await createOffchainDb({ dataDir: ".data/artifacts" });
```

## Using the service directly

For metadata resolution outside of API routes (e.g. in scripts), use `createArtifactService`:

```typescript
import {
  createArtifactService,
  createOffchainDb,
} from "@1001-digital/ponder-artifacts";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const client = createPublicClient({ chain: mainnet, transport: http() });
const { db } = await createOffchainDb();

const artifacts = createArtifactService({ client, db });

// Fetch cached token (returns null if not yet cached)
const token = await artifacts.fetchToken("0xbc4c...", "42");

// Update token metadata from chain + IPFS
await artifacts.updateToken("0xbc4c...", "42");

// Fetch cached collection
const collection = await artifacts.fetchCollection("0xbc4c...");

// Update collection metadata from chain
await artifacts.updateCollection("0xbc4c...");

// Check if a cached timestamp is still fresh
artifacts.isFresh(token?.updatedAt ?? null);
```

## Bring your own database

If you manage your own offchain database, skip `createOffchainDb` and pass your drizzle instance directly:

```typescript
import { createArtifactRoutes } from "@1001-digital/ponder-artifacts";
import { getOffchainDb } from "./services/database";

app.route(
  "/artifacts",
  createArtifactRoutes({
    client: publicClients["ethereum"],
    db: getOffchainDb(),
  }),
);
```

The package exports the schema for your drizzle config:

```typescript
// offchain.schema.ts
export { artifactToken, artifactCollection } from "@1001-digital/ponder-artifacts";
```

## Token standard detection

The service detects ERC721 vs ERC1155 via ERC165 `supportsInterface`:

- **ERC721** (`0x80ac58cd`): calls `tokenURI(tokenId)`
- **ERC1155** (`0xd9b67a26`): calls `uri(tokenId)`, replaces `{id}` with zero-padded hex token ID
- **Unknown**: falls back to ERC721 `tokenURI`

## URI resolution

Token and collection URIs are resolved inline (no external dependency):

- `ipfs://...` — resolved via IPFS gateway (default: `https://ipfs.io/ipfs/`)
- `ar://...` — resolved via Arweave gateway (default: `https://arweave.net/`)
- `Qm...` / `baf...` — treated as raw IPFS hashes
- `data:application/json;base64,...` — decoded inline
- `data:application/json,...` — URL-decoded inline
- Everything else — fetched as-is

Custom gateways can be passed via config:

```typescript
createArtifactRoutes({
  client: publicClients["ethereum"],
  db: artifactDb,
  ipfsGateway: "https://my-gateway.io/ipfs/",
  arweaveGateway: "https://my-arweave.io/",
});
```

## Configuration

| Option | Type | Description |
|--------|------|-------------|
| `client` | viem `PublicClient` | Client for on-chain reads (ERC165, tokenURI, contractURI, etc.) |
| `db` | drizzle instance | For reading and writing metadata. Use `createOffchainDb()` or bring your own. |
| `cacheTtl` | `number` (ms) | Cache freshness window. Defaults to 30 days. |
| `ipfsGateway` | `string` | IPFS gateway URL. Defaults to `https://ipfs.io/ipfs/`. |
| `arweaveGateway` | `string` | Arweave gateway URL. Defaults to `https://arweave.net/`. |

## Data structures

### Token

```typescript
{
  collection: string;      // Lowercase hex address
  tokenId: string;         // String representation of bigint
  tokenStandard: string;   // "erc721" | "erc1155" | "unknown"
  tokenUri: string | null; // Raw URI from contract
  name: string | null;
  description: string | null;
  image: string | null;
  animationUrl: string | null;
  data: object | null;     // Full raw metadata blob
  updatedAt: number;       // Unix timestamp (seconds)
}
```

### Collection

```typescript
{
  collection: string;       // Lowercase hex address
  tokenStandard: string;    // "erc721" | "erc1155" | "unknown"
  name: string | null;      // From on-chain name() or contractURI
  symbol: string | null;    // From on-chain symbol() or contractURI
  owner: string | null;     // From on-chain owner()
  contractUri: string | null;
  description: string | null;
  image: string | null;
  data: object | null;      // Full raw contractURI metadata blob
  updatedAt: number;        // Unix timestamp (seconds)
}
```
