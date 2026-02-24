const DEFAULT_IPFS_GATEWAY = "https://ipfs.io/ipfs/";
const DEFAULT_ARWEAVE_GATEWAY = "https://arweave.net/";

export interface ResolveUriOptions {
  ipfsGateway?: string;
  arweaveGateway?: string;
}

export function resolveUri(
  uri?: string | null,
  options?: ResolveUriOptions,
): string {
  if (!uri) return "";

  const ipfs = options?.ipfsGateway || DEFAULT_IPFS_GATEWAY;
  const ar = options?.arweaveGateway || DEFAULT_ARWEAVE_GATEWAY;

  if (uri.startsWith("data:")) return uri;
  if (uri.startsWith("ipfs://")) return ipfs + uri.replace("ipfs://", "");
  if (uri.startsWith("ar://")) return ar + uri.replace("ar://", "");
  if (uri.startsWith("Qm") || uri.startsWith("baf")) return ipfs + uri;

  return uri;
}

export async function fetchJson(
  uri: string,
  options?: ResolveUriOptions,
): Promise<Record<string, unknown>> {
  const resolved = resolveUri(uri, options);

  if (resolved.startsWith("data:application/json;base64,")) {
    const base64Data = resolved.split(",")[1];
    return JSON.parse(atob(base64Data!));
  }

  if (resolved.startsWith("data:application/json")) {
    const jsonStr = decodeURIComponent(resolved.split(",")[1]!);
    return JSON.parse(jsonStr);
  }

  const response = await fetch(resolved);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${resolved}: ${response.status}`);
  }
  return response.json();
}
