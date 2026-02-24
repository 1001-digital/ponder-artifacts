import { Hono } from "hono";
import { createArtifactService } from "./service";
import type { ArtifactPluginConfig } from "./types";

export function createArtifactRoutes(config: ArtifactPluginConfig): Hono {
  const {
    fetchToken,
    updateToken,
    fetchCollection,
    updateCollection,
    isFresh,
  } = createArtifactService(config);

  const app = new Hono();

  // Token endpoints
  app.get("/token/:collection/:tokenId", async (c) => {
    const collection = c.req.param("collection");
    const tokenId = c.req.param("tokenId");

    const cached = await fetchToken(collection, tokenId);
    if (cached && isFresh(cached.updatedAt)) {
      return c.json(cached);
    }

    try {
      await updateToken(collection, tokenId);
      return c.json(await fetchToken(collection, tokenId));
    } catch {
      if (cached) return c.json(cached);
      return c.json({ error: "Failed to fetch token metadata" }, 500);
    }
  });

  app.post("/token/:collection/:tokenId", async (c) => {
    const collection = c.req.param("collection");
    const tokenId = c.req.param("tokenId");

    try {
      await updateToken(collection, tokenId);
      return c.json(await fetchToken(collection, tokenId));
    } catch {
      const cached = await fetchToken(collection, tokenId);
      if (cached) return c.json(cached);
      return c.json({ error: "Failed to fetch token metadata" }, 500);
    }
  });

  // Collection endpoints
  app.get("/collection/:address", async (c) => {
    const address = c.req.param("address");

    const cached = await fetchCollection(address);
    if (cached && isFresh(cached.updatedAt)) {
      return c.json(cached);
    }

    try {
      await updateCollection(address);
      return c.json(await fetchCollection(address));
    } catch {
      if (cached) return c.json(cached);
      return c.json({ error: "Failed to fetch collection metadata" }, 500);
    }
  });

  app.post("/collection/:address", async (c) => {
    const address = c.req.param("address");

    try {
      await updateCollection(address);
      return c.json(await fetchCollection(address));
    } catch {
      const cached = await fetchCollection(address);
      if (cached) return c.json(cached);
      return c.json({ error: "Failed to fetch collection metadata" }, 500);
    }
  });

  return app;
}
