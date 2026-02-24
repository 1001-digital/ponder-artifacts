export type TokenStandard = "erc721" | "erc1155" | "unknown";

export type ArtifactToken = {
  collection: string;
  tokenId: string;
  tokenStandard: TokenStandard;
  tokenUri: string | null;
  name: string | null;
  description: string | null;
  image: string | null;
  animationUrl: string | null;
  data: Record<string, unknown> | null;
  updatedAt: number;
};

export type ArtifactCollection = {
  collection: string;
  tokenStandard: TokenStandard;
  name: string | null;
  symbol: string | null;
  owner: string | null;
  contractUri: string | null;
  description: string | null;
  image: string | null;
  data: Record<string, unknown> | null;
  updatedAt: number;
};

export type ArtifactPluginConfig = {
  /** Viem public client for on-chain reads. */
  client: {
    readContract: (args: {
      address: `0x${string}`;
      abi: readonly unknown[];
      functionName: string;
      args?: readonly unknown[];
    }) => Promise<unknown>;
  };
  /** Drizzle DB instance. Use createOffchainDb() or provide your own. */
  db: any;
  /** Cache TTL in milliseconds. Defaults to 30 days. */
  cacheTtl?: number;
  /** IPFS gateway URL. Defaults to https://ipfs.io/ipfs/ */
  ipfsGateway?: string;
  /** Arweave gateway URL. Defaults to https://arweave.net/ */
  arweaveGateway?: string;
};
