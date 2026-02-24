import { pgSchema, text, integer, json, primaryKey } from "drizzle-orm/pg-core";

export const offchainSchema = pgSchema("offchain");

export const artifactToken = offchainSchema.table(
  "artifact_token",
  {
    collection: text("collection").notNull(),
    tokenId: text("token_id").notNull(),
    tokenStandard: text("token_standard").notNull(),
    tokenUri: text("token_uri"),
    name: text("name"),
    description: text("description"),
    image: text("image"),
    animationUrl: text("animation_url"),
    data: json("data").$type<Record<string, unknown>>(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.collection, table.tokenId] })],
);

export const artifactCollection = offchainSchema.table(
  "artifact_collection",
  {
    collection: text("collection").primaryKey(),
    tokenStandard: text("token_standard").notNull(),
    name: text("name"),
    symbol: text("symbol"),
    owner: text("owner"),
    contractUri: text("contract_uri"),
    description: text("description"),
    image: text("image"),
    data: json("data").$type<Record<string, unknown>>(),
    updatedAt: integer("updated_at").notNull(),
  },
);
