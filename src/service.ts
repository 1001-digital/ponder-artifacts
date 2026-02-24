import { eq, and } from "drizzle-orm";
import { parseAbi } from "viem";
import { artifactToken, artifactCollection } from "./schema";
import { resolveUri, fetchJson } from "./uri";
import type {
  ArtifactPluginConfig,
  ArtifactToken,
  ArtifactCollection,
  TokenStandard,
} from "./types";

const DEFAULT_CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

const ERC721_ABI = parseAbi([
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function supportsInterface(bytes4 interfaceId) view returns (bool)",
]);

const ERC1155_ABI = parseAbi([
  "function uri(uint256) view returns (string)",
  "function supportsInterface(bytes4 interfaceId) view returns (bool)",
]);

const COLLECTION_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function owner() view returns (address)",
  "function contractURI() view returns (string)",
]);

const ERC721_INTERFACE_ID = "0x80ac58cd";
const ERC1155_INTERFACE_ID = "0xd9b67a26";

export function createArtifactService(config: ArtifactPluginConfig) {
  const { client, db } = config;
  const cacheTtl = config.cacheTtl ?? DEFAULT_CACHE_TTL;
  const uriOptions = {
    ipfsGateway: config.ipfsGateway,
    arweaveGateway: config.arweaveGateway,
  };

  function isFresh(timestamp: number | null): boolean {
    if (!timestamp) return false;
    return Date.now() - timestamp * 1000 < cacheTtl;
  }

  async function detectStandard(
    address: `0x${string}`,
  ): Promise<TokenStandard> {
    const isERC721 = await client
      .readContract({
        address,
        abi: ERC721_ABI,
        functionName: "supportsInterface",
        args: [ERC721_INTERFACE_ID],
      })
      .catch(() => false);

    if (isERC721) return "erc721";

    const isERC1155 = await client
      .readContract({
        address,
        abi: ERC1155_ABI,
        functionName: "supportsInterface",
        args: [ERC1155_INTERFACE_ID],
      })
      .catch(() => false);

    if (isERC1155) return "erc1155";

    return "unknown";
  }

  async function fetchTokenUri(
    address: `0x${string}`,
    tokenId: bigint,
    standard: TokenStandard,
  ): Promise<string> {
    if (standard === "erc1155") {
      const uri = (await client.readContract({
        address,
        abi: ERC1155_ABI,
        functionName: "uri",
        args: [tokenId],
      })) as string;
      const tokenIdHex = tokenId.toString(16).padStart(64, "0");
      return uri.replace("{id}", tokenIdHex);
    }

    // ERC721 or unknown — try tokenURI
    return (await client.readContract({
      address,
      abi: ERC721_ABI,
      functionName: "tokenURI",
      args: [tokenId],
    })) as string;
  }

  async function fetchToken(
    collection: string,
    tokenId: string,
  ): Promise<ArtifactToken | null> {
    const result = await db
      .select()
      .from(artifactToken)
      .where(
        and(
          eq(artifactToken.collection, collection.toLowerCase()),
          eq(artifactToken.tokenId, tokenId),
        ),
      )
      .limit(1);

    return (result[0] as ArtifactToken | undefined) ?? null;
  }

  async function updateToken(
    collection: string,
    tokenId: string,
  ): Promise<void> {
    const address = collection.toLowerCase() as `0x${string}`;
    const tokenIdBigInt = BigInt(tokenId);

    const tokenStandard = await detectStandard(address);

    const tokenUri = await fetchTokenUri(
      address,
      tokenIdBigInt,
      tokenStandard,
    ).catch(() => null);

    let name: string | null = null;
    let description: string | null = null;
    let image: string | null = null;
    let animationUrl: string | null = null;
    let data: Record<string, unknown> | null = null;

    if (tokenUri) {
      try {
        const metadata = await fetchJson(tokenUri, uriOptions);
        data = metadata;
        name = (metadata.name as string) ?? null;
        description = (metadata.description as string) ?? null;
        image = (metadata.image as string) ?? null;
        animationUrl = (metadata.animation_url as string) ?? null;
      } catch {
        // Metadata fetch failed — store what we have
      }
    }

    const row = {
      tokenStandard,
      tokenUri,
      name,
      description,
      image,
      animationUrl,
      data,
      updatedAt: Math.floor(Date.now() / 1000),
    };

    await db
      .insert(artifactToken)
      .values({
        collection: address,
        tokenId,
        ...row,
      })
      .onConflictDoUpdate({
        target: [artifactToken.collection, artifactToken.tokenId],
        set: row,
      });
  }

  async function fetchCollection(
    address: string,
  ): Promise<ArtifactCollection | null> {
    const result = await db
      .select()
      .from(artifactCollection)
      .where(eq(artifactCollection.collection, address.toLowerCase()))
      .limit(1);

    return (result[0] as ArtifactCollection | undefined) ?? null;
  }

  async function updateCollection(address: string): Promise<void> {
    const normalized = address.toLowerCase() as `0x${string}`;

    const [name, symbol, owner, contractUri, tokenStandard] =
      await Promise.all([
        client
          .readContract({
            address: normalized,
            abi: COLLECTION_ABI,
            functionName: "name",
          })
          .catch(() => null) as Promise<string | null>,
        client
          .readContract({
            address: normalized,
            abi: COLLECTION_ABI,
            functionName: "symbol",
          })
          .catch(() => null) as Promise<string | null>,
        client
          .readContract({
            address: normalized,
            abi: COLLECTION_ABI,
            functionName: "owner",
          })
          .catch(() => null) as Promise<string | null>,
        client
          .readContract({
            address: normalized,
            abi: COLLECTION_ABI,
            functionName: "contractURI",
          })
          .catch(() => null) as Promise<string | null>,
        detectStandard(normalized),
      ]);

    let description: string | null = null;
    let image: string | null = null;
    let data: Record<string, unknown> | null = null;

    if (contractUri) {
      try {
        const metadata = await fetchJson(contractUri, uriOptions);
        data = metadata;
        description = (metadata.description as string) ?? null;
        image = (metadata.image as string) ?? null;
      } catch {
        // contractURI fetch failed
      }
    }

    const row = {
      tokenStandard,
      name: name ?? (data?.name as string) ?? null,
      symbol: symbol ?? (data?.symbol as string) ?? null,
      owner: owner?.toLowerCase() ?? null,
      contractUri,
      description: description ?? null,
      image: image ?? null,
      data,
      updatedAt: Math.floor(Date.now() / 1000),
    };

    await db
      .insert(artifactCollection)
      .values({
        collection: normalized,
        ...row,
      })
      .onConflictDoUpdate({
        target: artifactCollection.collection,
        set: row,
      });
  }

  return {
    fetchToken,
    updateToken,
    fetchCollection,
    updateCollection,
    isFresh,
  };
}
