import { useEffect, useMemo, useState } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { Gem, ExternalLink, Search } from "lucide-react";
import { useSearchParams } from "react-router";
import { isAddress } from "viem";
import { Button } from "./Button";
import { bondLotAbi, CURRENT_LOT, IPFS_GATEWAY, type BondTier } from "../../lib/bondLot";

/**
 * "Your bonds" — the holder's own tokens, read STRAIGHT FROM THE CONTRACT.
 *
 * Why this exists: after minting, wallets show nothing for hours or days
 * (they depend on third-party indexers that must discover a brand-new
 * collection), and several of them never render Flare NFT artwork at all. A
 * buyer who has just spent 10,000 FLR and sees an empty wallet reasonably
 * assumes the worst. This view answers that in one place we fully control:
 * balanceOf + tokenOfOwnerByIndex from the lot contract, artwork from our own
 * pinned CID. No indexer, no cache, no gateway roulette.
 */

const LIVE_TIERS = CURRENT_LOT.tiers.filter(
  (t): t is BondTier & { address: `0x${string}` } => !!t.address,
);

/** Contract-side cap on how many tokens we enumerate per tier. */
const MAX_ENUMERATE = 50;

/**
 * `bare` drops the heading, the explainer and the address lookup, leaving just
 * the tokens. The member page already knows whose wallet it is and supplies its
 * own heading — asking someone to paste their own address there is noise.
 */
export function MyBonds({
  compact = false,
  bare = false,
}: {
  compact?: boolean;
  bare?: boolean;
}) {
  const { address: connectedAddress } = useAccount();
  const [searchParams, setSearchParams] = useSearchParams();

  // Holdings are public chain data — no wallet connection required. Paste an
  // address, or share a ?address=0x… link. A connected wallet just prefills it.
  const [input, setInput] = useState("");
  const [submitted, setSubmitted] = useState<`0x${string}` | "">("");

  useEffect(() => {
    const fromUrl = searchParams.get("address");
    if (fromUrl && isAddress(fromUrl)) {
      setSubmitted(fromUrl as `0x${string}`);
      setInput(fromUrl);
    } else if (connectedAddress) {
      setSubmitted(connectedAddress);
    }
  }, [searchParams, connectedAddress]);

  const address = submitted || connectedAddress;
  const valid = !!address && isAddress(address);

  function lookUp() {
    const v = input.trim();
    if (!isAddress(v)) return;
    setSubmitted(v as `0x${string}`);
    const next = new URLSearchParams(searchParams);
    next.set("address", v);
    setSearchParams(next, { replace: true });
  }

  // Pass 1: how many does this wallet hold in each tier?
  const { data: balances, isLoading: loadingBalances } = useReadContracts({
    contracts: LIVE_TIERS.map((t) => ({
      address: t.address,
      abi: bondLotAbi,
      functionName: "balanceOf" as const,
      args: [address ?? "0x0000000000000000000000000000000000000000"] as const,
    })),
    query: { enabled: valid && LIVE_TIERS.length > 0 },
  });

  // Pass 2: enumerate the actual token ids behind those balances.
  const indexCalls = useMemo(() => {
    const calls: { address: `0x${string}`; tierKey: string; index: number }[] = [];
    LIVE_TIERS.forEach((t, i) => {
      const bal = Number((balances?.[i]?.result as bigint | undefined) ?? 0n);
      for (let idx = 0; idx < Math.min(bal, MAX_ENUMERATE); idx++) {
        calls.push({ address: t.address, tierKey: t.key, index: idx });
      }
    });
    return calls;
  }, [balances]);

  const { data: ids, isLoading: loadingIds } = useReadContracts({
    contracts: indexCalls.map((c) => ({
      address: c.address,
      abi: bondLotAbi,
      functionName: "tokenOfOwnerByIndex" as const,
      args: [address ?? "0x0000000000000000000000000000000000000000", BigInt(c.index)] as const,
    })),
    query: { enabled: valid && indexCalls.length > 0 },
  });

  const held = useMemo(() => {
    return indexCalls
      .map((c, i) => {
        const id = ids?.[i]?.result as bigint | undefined;
        const tier = LIVE_TIERS.find((t) => t.key === c.tierKey);
        return id != null && tier ? { tier, tokenId: Number(id) } : null;
      })
      .filter((x): x is { tier: BondTier & { address: `0x${string}` }; tokenId: number } => !!x)
      .sort((a, b) => a.tier.key.localeCompare(b.tier.key) || a.tokenId - b.tokenId);
  }, [indexCalls, ids]);

  const loading = loadingBalances || loadingIds;

  if (LIVE_TIERS.length === 0) return null;

  return (
    <section id="your-bonds" className={compact ? "mt-8 scroll-mt-20" : "p-4 lg:p-8 scroll-mt-20"}>
      {!bare && (
        <>
      <div className="flex items-center gap-3">
        <Gem size={compact ? 20 : 24} className="text-[#E85A95]" />
        <h2 className={compact ? "text-xl font-semibold" : "text-2xl font-bold tracking-tight"}>
          Your bonds
        </h2>
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#8FA0B8]">
        Read directly from the bond contracts — not from a wallet or an NFT indexer. Holdings are
        public, so any address can be checked without connecting anything. If you have just minted,
        your token appears here immediately, even while your wallet app still shows nothing.
      </p>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#8FA0B8]">
        Distributions open once the lot closes and its distribution contract is deployed.
      </p>

      <div className="mt-4 flex max-w-xl flex-wrap items-center gap-2">
        <div className="flex min-w-[260px] flex-1 items-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2">
          <Search size={14} className="shrink-0 text-[#8FA0B8]" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && lookUp()}
            placeholder="0x… any address"
            spellCheck={false}
            className="w-full border-none bg-transparent font-mono text-sm text-[#FAFAFA] outline-none placeholder:text-[#8FA0B8]"
          />
        </div>
        <Button variant="primary" size="sm" onClick={lookUp} disabled={!isAddress(input.trim())}>
          Look up
        </Button>
      </div>
        </>
      )}
      {valid && !bare && (
        <p className="mt-2 font-mono text-xs text-[#8FA0B8]">
          Showing {address}
          {connectedAddress?.toLowerCase() === address?.toLowerCase() ? " (connected wallet)" : ""}
        </p>
      )}

      {!valid ? (
        <div className="glass-panel mt-4 p-6 text-sm text-[#8FA0B8]">
          Paste any Flare address to see the bonds it holds. Holdings are public on-chain data — no
          wallet connection needed.
        </div>
      ) : loading ? (
        <div className="glass-panel mt-4 p-6 text-sm text-[#8FA0B8]">Reading the contracts…</div>
      ) : held.length === 0 ? (
        <div className="glass-panel mt-4 p-6">
          <p className="text-sm text-[#8FA0B8]">This address holds no FlareForward Bonds yet.</p>
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {held.map(({ tier, tokenId }) => (
              <div key={`${tier.key}-${tokenId}`} className="glass-panel overflow-hidden p-0">
                <img
                  src={`${IPFS_GATEWAY}/${tier.imageCid}`}
                  alt={`FlareForward Bonds ${tier.name} token ${tokenId}`}
                  loading="lazy"
                  className="aspect-square w-full object-cover"
                />
                <div className="p-4">
                  <p className="font-semibold">#{tokenId}</p>
                  <p className="mt-0.5 text-sm text-[#8FA0B8]">
                    {CURRENT_LOT.label} · {tier.name} tier
                  </p>
                  <a
                    href={`https://flare-explorer.flare.network/token/${tier.address}/instance/${tokenId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-xs text-[#E85A95] underline"
                  >
                    View on explorer <ExternalLink size={11} />
                  </a>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-[#8FA0B8]/80">
            Holding {held.length} bond{held.length === 1 ? "" : "s"}. Distributions open once the
            lot closes and its distribution contract is deployed.
          </p>
        </>
      )}
    </section>
  );
}
