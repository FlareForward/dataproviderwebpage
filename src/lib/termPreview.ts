export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export interface TermPreviewTier {
  address: `0x${string}`;
  vault: `0x${string}`;
}

export interface TermPreviewConfig {
  chainId: number;
  rpc: string;
  tiers: Record<string, TermPreviewTier>;
}

function parseTermPreview(raw: unknown): TermPreviewConfig | null {
  if (!import.meta.env.DEV || typeof raw !== "string" || raw.trim() === "") {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as {
      chainId?: unknown;
      rpc?: unknown;
      tiers?: unknown;
    };
    const chainId = parsed.chainId;
    if (!Number.isInteger(chainId) || typeof parsed.rpc !== "string") {
      return null;
    }
    if (!/^https?:\/\//i.test(parsed.rpc)) return null;
    if (!parsed.tiers || typeof parsed.tiers !== "object") return null;

    const tiers: Record<string, TermPreviewTier> = {};
    for (const [key, value] of Object.entries(parsed.tiers)) {
      const tier = value as { address?: unknown; vault?: unknown };
      if (typeof tier.address !== "string" || typeof tier.vault !== "string") {
        continue;
      }
      if (!ADDRESS_RE.test(tier.address) || !ADDRESS_RE.test(tier.vault)) {
        continue;
      }
      tiers[key] = {
        address: tier.address as `0x${string}`,
        vault: tier.vault as `0x${string}`,
      };
    }

    return Object.keys(tiers).length > 0
      ? { chainId: chainId as number, rpc: parsed.rpc, tiers }
      : null;
  } catch {
    return null;
  }
}

export const TERM_PREVIEW = parseTermPreview(import.meta.env.VITE_TERM_PREVIEW);
