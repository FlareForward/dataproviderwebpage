import { useEffect, useMemo, useState } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { Gem, ExternalLink, Search } from "lucide-react";
import { useSearchParams } from "react-router";
import { isAddress } from "viem";
import { Button } from "./Button";
import { bondLotAbi, CURRENT_LOT, IPFS_GATEWAY, type BondTier } from "../../lib/bondLot";
import { useRewards } from "../../hooks/useRewards";
import { settledRate } from "../../lib/rewards";

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

  /**
   * The rate staged capital actually earns right now.
   *
   * NOT the bond rate. Until the lot closes the raised FLR is not in the
   * validator self-bond at all — it is wrapped WFLR delegated to our own
   * provider, so it earns the DELEGATION rate. Showing the bond rate here would
   * tell a holder their staged money is earning roughly six times what it is.
   */
  const { data: rewards } = useRewards();
  const stagedRatePct = settledRate(rewards?.rates.delegation_annual_pct);

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

  const [openTier, setOpenTier] = useState<string | null>(null);

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

  /** One entry per tier, holding every token id of that tier. */
  const groups = useMemo(() => {
    const byTier = new Map<
      string,
      { tier: BondTier & { address: `0x${string}` }; tokenIds: number[] }
    >();
    for (const { tier, tokenId } of held) {
      const g = byTier.get(tier.key) ?? { tier, tokenIds: [] };
      g.tokenIds.push(tokenId);
      byTier.set(tier.key, g);
    }
    return [...byTier.values()];
  }, [held]);

  const openGroup = groups.find((g) => g.tier.key === openTier) ?? null;

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
          {/* Grouped by tier, not one card per token. These are identical
              artworks — thirty of them side by side is noise, and the only
              thing that distinguishes one from another is what it has earned.
              The stack opens into a compact grid for that. */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((g) => (
              <button
                key={g.tier.key}
                type="button"
                onClick={() => setOpenTier(g.tier.key)}
                className="group glass-panel overflow-hidden p-0 text-left transition-colors hover:border-[#E85A95]/40"
              >
                <div className="relative">
                  {/* Fanned edges behind the top card so a stack reads as a
                      stack at a glance, without rendering N images. */}
                  {g.tokenIds.length > 1 && (
                    <>
                      <div className="absolute inset-x-3 -top-1.5 h-3 rounded-t-lg border border-white/10 bg-white/[0.06]" />
                      <div className="absolute inset-x-1.5 -top-0.5 h-3 rounded-t-lg border border-white/12 bg-white/[0.09]" />
                    </>
                  )}
                  <img
                    src={`${IPFS_GATEWAY}/${g.tier.imageCid}`}
                    alt={`FlareForward Bonds ${g.tier.name}`}
                    loading="lazy"
                    className="relative aspect-square w-full object-cover"
                  />
                  {g.tokenIds.length > 1 && (
                    <span className="absolute right-2 top-2 rounded-full bg-black/70 px-2.5 py-1 text-xs font-semibold text-[#FAFAFA]">
                      ×{g.tokenIds.length}
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <p className="font-semibold">
                    {g.tier.name} tier
                    <span className="ml-2 text-sm font-normal text-[#8FA0B8]">
                      {g.tokenIds.length} bond{g.tokenIds.length === 1 ? "" : "s"}
                    </span>
                  </p>
                  {/* This was a hardcoded "Earned 0.00 FLR", which read as a
                      measurement of an idle asset. Nothing has been DISTRIBUTED
                      yet -- true -- but the capital is not sitting still, so a
                      flat zero told a holder their money is doing nothing.
                      Show what it is doing, at the rate it is actually doing it. */}
                  {/* The rate, not a per-year figure. The terms on this site
                      say plainly "we do not publish projections", and an
                      annualised FLR amount per holder is exactly that. The rate
                      is an observed number; multiplying it out into what someone
                      will receive is a forecast we promised not to make. */}
                  <div className="mt-2 flex items-baseline justify-between gap-3">
                    <span className="text-xs text-[#8FA0B8]">Earning while staged</span>
                    <span className="text-sm font-semibold tabular-nums text-emerald-400">
                      {stagedRatePct != null ? `${stagedRatePct.toFixed(2)}%` : "—"}
                    </span>
                  </div>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[#E85A95] group-hover:underline">
                    {g.tokenIds.length === 1 ? "View bond" : `View all ${g.tokenIds.length}`}
                  </span>
                </div>
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-[#8FA0B8]/80">
            Holding {held.length} bond{held.length === 1 ? "" : "s"}. Distributions open once the
            lot closes and its distribution contract is deployed.
          </p>
        </>
      )}

      {/* Expanded stack: small thumbnails, one row per token, with the only
          thing that actually differs between them — what each has earned, and
          the ability to claim just that one. */}
      {openGroup && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label={`${openGroup.tier.name} bonds`}
          onClick={() => setOpenTier(null)}
        >
          <div
            className="glass-modal max-h-[80vh] w-full max-w-2xl overflow-y-auto p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">{openGroup.tier.name} tier</h3>
                <p className="mt-0.5 text-sm text-[#8FA0B8]">
                  {openGroup.tokenIds.length} bond
                  {openGroup.tokenIds.length === 1 ? "" : "s"} · {CURRENT_LOT.label}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpenTier(null)}
                className="rounded-lg px-2 py-1 text-sm text-[#8FA0B8] hover:bg-white/5 hover:text-[#FAFAFA]"
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {openGroup.tokenIds.map((tokenId) => (
                <div
                  key={tokenId}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5"
                >
                  <img
                    src={`${IPFS_GATEWAY}/${openGroup.tier.imageCid}`}
                    alt=""
                    loading="lazy"
                    className="h-12 w-12 shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">#{tokenId}</p>
                    <a
                      href={`https://flare-explorer.flare.network/token/${openGroup.tier.address}/instance/${tokenId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-[#E85A95] hover:underline"
                    >
                      Explorer <ExternalLink size={10} />
                    </a>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular-nums text-[#FAFAFA]">0.00 FLR</div>
                    <div className="text-[10px] uppercase tracking-wide text-[#8FA0B8]">earned</div>
                  </div>
                  <Button variant="secondary" size="sm" disabled>
                    Claim
                  </Button>
                </div>
              ))}
            </div>

            <p className="mt-4 text-xs leading-relaxed text-[#8FA0B8]">
              Per-bond claiming opens once the lot closes and its distribution contract is
              deployed. Until then every bond here has earned the same — nothing yet.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
