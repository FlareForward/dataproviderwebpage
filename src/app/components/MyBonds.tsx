import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useAccount, useReadContracts } from "wagmi";
import { ExternalLink, Gem, Gift, Loader2, Search, Sparkles, X } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { formatUnits, isAddress } from "viem";
import { Button } from "./Button";
import {
  bondLotAbi,
  CURRENT_LOT,
  IPFS_GATEWAY,
  isShareTier,
  isTermTier,
  termBondAbi,
  type BondTier,
} from "../../lib/bondLot";
import { TERM_CHAIN } from "../../lib/flare";
import type { BondClaimTier, ClaimPhase } from "../../hooks/useBondClaims";
import type { EarnedBondLot } from "../../hooks/useEarned";
import { fmtDate as fmtPayoutDate, fmtPct } from "../../lib/rewards";

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

const LIVE_SHARE_TIERS = CURRENT_LOT.tiers.filter(
  (t): t is BondTier & { address: `0x${string}` } => isShareTier(t) && !!t.address,
);

const LIVE_TERM_TIERS = CURRENT_LOT.tiers.filter(
  (t): t is BondTier & { kind: "term"; address: `0x${string}` } => isTermTier(t) && !!t.address,
);

type BondGroup = {
  tier: BondTier & { address: `0x${string}` };
  tokenIds: number[];
};

function fmtDate(seconds: bigint | null | undefined): string {
  if (seconds == null || seconds === 0n) return "-";
  return new Date(Number(seconds) * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * `bare` drops the heading, the explainer and the address lookup, leaving just
 * the tokens. The member page already knows whose wallet it is and supplies its
 * own heading — asking someone to paste their own address there is noise.
 */
export function MyBonds({
  compact = false,
  bare = false,
  tiers = [],
  history = [],
  apyPct = null,
  rewardsLoading = false,
  claimPhase = "idle",
  activeTierKey = null,
  canClaim = false,
  onClaimTier,
}: {
  compact?: boolean;
  bare?: boolean;
  tiers?: BondClaimTier[];
  history?: EarnedBondLot[];
  apyPct?: number | null;
  rewardsLoading?: boolean;
  claimPhase?: ClaimPhase;
  activeTierKey?: string | null;
  canClaim?: boolean;
  onClaimTier?: (tierKey: string) => void;
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
    contracts: LIVE_SHARE_TIERS.map((t) => ({
      address: t.address,
      abi: bondLotAbi,
      functionName: "balanceOf" as const,
      args: [address ?? "0x0000000000000000000000000000000000000000"] as const,
    })),
    query: { enabled: valid && LIVE_SHARE_TIERS.length > 0 },
  });

  // Pass 2: enumerate the actual token ids behind those balances.
  const indexCalls = useMemo(() => {
    const calls: { address: `0x${string}`; tierKey: string; index: number }[] = [];
    LIVE_SHARE_TIERS.forEach((t, i) => {
      const bal = Number((balances?.[i]?.result as bigint | undefined) ?? 0n);
      for (let idx = 0; idx < bal; idx++) {
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
  const openTriggerRef = useRef<HTMLButtonElement | null>(null);
  const closeLotDialog = useCallback(() => setOpenTier(null), []);

  const held = useMemo(() => {
    return indexCalls
      .map((c, i) => {
      const id = ids?.[i]?.result as bigint | undefined;
      const tier = LIVE_SHARE_TIERS.find((t) => t.key === c.tierKey);
      return id != null && tier ? { tier, tokenId: Number(id) } : null;
      })
      .filter((x): x is { tier: BondTier & { address: `0x${string}` }; tokenId: number } => !!x)
      .sort((a, b) => a.tier.key.localeCompare(b.tier.key) || a.tokenId - b.tokenId);
  }, [indexCalls, ids]);

  /** One entry per tier, holding every token id of that tier. */
  const groups = useMemo(() => {
    const byTier = new Map<string, BondGroup>();
    for (const { tier, tokenId } of held) {
      const g = byTier.get(tier.key) ?? { tier, tokenIds: [] };
      g.tokenIds.push(tokenId);
      byTier.set(tier.key, g);
    }
    return [...byTier.values()];
  }, [held]);

  const openGroup = groups.find((group) => group.tier.key === openTier);
  const openReward = tiers.find((candidate) => candidate.tier.key === openTier);
  const openHistory = history.find(
    (lot) =>
      openReward && lot.distributor.toLowerCase() === openReward.tier.distributor.toLowerCase(),
  );

  const { data: termBalances, isLoading: loadingTermBalances } = useReadContracts({
    contracts: LIVE_TERM_TIERS.map((tier) => ({
      address: tier.address,
      abi: termBondAbi,
      functionName: "balanceOf" as const,
      args: [address ?? "0x0000000000000000000000000000000000000000"] as const,
      chainId: TERM_CHAIN.id,
    })),
    query: { enabled: valid && LIVE_TERM_TIERS.length > 0 },
  });

  const { data: termMaturities, isLoading: loadingTermMaturities } = useReadContracts({
    contracts: LIVE_TERM_TIERS.map((tier) => ({
      address: tier.address,
      abi: termBondAbi,
      functionName: "bondExpiry" as const,
      chainId: TERM_CHAIN.id,
    })),
    query: { enabled: LIVE_TERM_TIERS.length > 0, refetchInterval: 30_000 },
  });

  const termIndexCalls = useMemo(() => {
    const calls: { address: `0x${string}`; tierKey: string; index: number }[] = [];
    LIVE_TERM_TIERS.forEach((tier, i) => {
      const bal = Number((termBalances?.[i]?.result as bigint | undefined) ?? 0n);
      for (let idx = 0; idx < bal; idx++) {
        calls.push({ address: tier.address, tierKey: tier.key, index: idx });
      }
    });
    return calls;
  }, [termBalances]);

  const { data: termIds, isLoading: loadingTermIds } = useReadContracts({
    contracts: termIndexCalls.map((c) => ({
      address: c.address,
      abi: termBondAbi,
      functionName: "tokenOfOwnerByIndex" as const,
      args: [address ?? "0x0000000000000000000000000000000000000000", BigInt(c.index)] as const,
      chainId: TERM_CHAIN.id,
    })),
    query: { enabled: valid && termIndexCalls.length > 0 },
  });

  const termHeld = useMemo(
    () =>
      termIndexCalls
        .map((c, i) => {
          const id = termIds?.[i]?.result as bigint | undefined;
          const tier = LIVE_TERM_TIERS.find((t) => t.key === c.tierKey);
          return id != null && tier ? { tier, tokenId: Number(id) } : null;
        })
        .filter(
          (x): x is { tier: BondTier & { kind: "term"; address: `0x${string}` }; tokenId: number } =>
            !!x,
        )
        .sort((a, b) => a.tier.key.localeCompare(b.tier.key) || a.tokenId - b.tokenId),
    [termIds, termIndexCalls],
  );

  const termGroups = useMemo(() => {
    const byTier = new Map<
      string,
      {
        tier: BondTier & { kind: "term"; address: `0x${string}` };
        tokenIds: number[];
        maturity?: bigint;
      }
    >();
    for (const { tier, tokenId } of termHeld) {
      const tierIndex = LIVE_TERM_TIERS.findIndex((t) => t.key === tier.key);
      const g = byTier.get(tier.key) ?? {
        tier,
        tokenIds: [],
        maturity: termMaturities?.[tierIndex]?.result as bigint | undefined,
      };
      g.tokenIds.push(tokenId);
      byTier.set(tier.key, g);
    }
    return [...byTier.values()];
  }, [termHeld, termMaturities]);

  const loading =
    loadingBalances || loadingIds || loadingTermBalances || loadingTermIds || loadingTermMaturities;
  const totalHeld = held.length + termHeld.length;
  const busy = claimPhase === "processing" || claimPhase === "claiming";

  if (LIVE_SHARE_TIERS.length === 0 && LIVE_TERM_TIERS.length === 0) return null;

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
      ) : totalHeld === 0 ? (
        <div className="glass-panel mt-4 p-6">
          <p className="text-sm text-[#8FA0B8]">This address holds no FlareForward Bonds yet.</p>
        </div>
      ) : (
        <>
          {/* Grouped by tier, not one card per token. These are identical
              artworks — thirty of them side by side is noise, and the only
              thing that distinguishes one from another is what it has earned.
              The stack opens into a compact grid for that. */}
          <div className="mt-4 grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {termGroups.map((g) => (
              <Link key={g.tier.key} to="/nft/redeem" className="asset-tile p-0 text-left">
                <div className={`relative${g.tokenIds.length > 1 ? " pt-2" : ""}`}>
                  {g.tokenIds.length > 1 && (
                    <>
                      <div className="absolute inset-x-4 top-0 h-2 rounded-t-md border border-white/10 bg-white/[0.06]" />
                      <div className="absolute inset-x-2 top-1 h-2 rounded-t-md border border-white/12 bg-white/[0.09]" />
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
                    {g.tier.name}
                    <span className="ml-2 text-sm font-normal text-[#8FA0B8]">
                      {g.tokenIds.length} bond{g.tokenIds.length === 1 ? "" : "s"}
                    </span>
                  </p>
                  <p className="mt-2 text-sm text-[#8FA0B8]">Matures {fmtDate(g.maturity)}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[#E85A95]">
                    Redeem after maturity
                  </span>
                </div>
              </Link>
            ))}
            {groups.map((g) => {
              const open = openTier === g.tier.key;
              const reward = tiers.find((candidate) => candidate.tier.key === g.tier.key);
              const hasUnclaimed = !rewardsLoading && !!reward && reward.claimableWei > 0n;

              return (
                <article key={g.tier.key} className="asset-tile p-0 text-left">
                  <button
                    type="button"
                    onClick={(event) => {
                      openTriggerRef.current = event.currentTarget;
                      setOpenTier(g.tier.key);
                    }}
                    aria-haspopup="dialog"
                    aria-expanded={open}
                    aria-controls={open ? `bond-lot-dialog-${g.tier.key}` : undefined}
                    className="group block w-full text-left"
                  >
                    {/* The artwork stack stays byte-for-byte with the original card. */}
                    <div className={`relative${g.tokenIds.length > 1 ? " pt-2" : ""}`}>
                      {g.tokenIds.length > 1 && (
                        <>
                          <div className="absolute inset-x-4 top-0 h-2 rounded-t-md border border-white/10 bg-white/[0.06]" />
                          <div className="absolute inset-x-2 top-1 h-2 rounded-t-md border border-white/12 bg-white/[0.09]" />
                        </>
                      )}
                      <img
                        src={`${IPFS_GATEWAY}/${g.tier.imageCid}`}
                        alt={`FlareForward Bonds ${g.tier.name}`}
                        loading="lazy"
                        className="relative aspect-square w-full object-cover"
                      />
                      {hasUnclaimed && (
                        <div className="absolute left-3 top-3 z-10 max-w-[calc(100%-4.5rem)]">
                          <UnclaimedRibbon wei={reward.claimableWei} />
                        </div>
                      )}
                      {g.tokenIds.length > 1 && (
                        <span
                          className={`absolute right-3 z-20 rounded-full bg-black/80 px-2.5 py-1 text-xs font-semibold text-[#FAFAFA] ${
                            hasUnclaimed ? "top-4" : "top-3"
                          }`}
                        >
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
                      <p className="mt-2 text-xs tabular-nums text-[#8FA0B8]">
                        Earned{" "}
                        <span className="text-[#FAFAFA]">
                          {!rewardsLoading && reward ? (
                            <AnimatedFlr value={reward.lifetimeWei} />
                          ) : (
                            "-"
                          )}{" "}
                          FLR
                        </span>{" "}
                        <span aria-hidden="true">·</span> {fmtPct(apyPct)} APY
                      </p>
                      <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[#E85A95] group-hover:underline">
                        {g.tokenIds.length === 1 ? "View bond" : `View all ${g.tokenIds.length}`}
                      </span>
                    </div>
                  </button>
                </article>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-[#8FA0B8]/80">
            <span>
              Holding {totalHeld} bond{totalHeld === 1 ? "" : "s"}.
            </span>
            {termGroups.length > 0 && (
              <span className="block">FTSO V2 redemption opens after maturity.</span>
            )}
          </p>
        </>
      )}
      {openGroup &&
        createPortal(
          <BondLotDialog
            group={openGroup}
            reward={openReward}
            history={openHistory}
            apyPct={apyPct}
            rewardsLoading={rewardsLoading}
            claimPhase={claimPhase}
            activeTierKey={activeTierKey}
            canClaim={canClaim}
            busy={busy}
            onClaimTier={onClaimTier}
            onClose={closeLotDialog}
            returnFocusRef={openTriggerRef}
          />,
          document.body,
        )}
    </section>
  );
}

function BondLotDialog({
  group,
  reward,
  history,
  apyPct,
  rewardsLoading,
  claimPhase,
  activeTierKey,
  canClaim,
  busy,
  onClaimTier,
  onClose,
  returnFocusRef,
}: {
  group: BondGroup;
  reward: BondClaimTier | undefined;
  history: EarnedBondLot | undefined;
  apyPct: number | null;
  rewardsLoading: boolean;
  claimPhase: ClaimPhase;
  activeTierKey: string | null;
  canClaim: boolean;
  busy: boolean;
  onClaimTier: ((tierKey: string) => void) | undefined;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLButtonElement>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = `bond-lot-dialog-title-${group.tier.key}`;
  const dialogId = `bond-lot-dialog-${group.tier.key}`;
  const claimable = !!reward && (reward.claimableWei > 0n || reward.unprocessedWei > 0n);
  const thisTierBusy = busy && activeTierKey === group.tier.key;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = requestAnimationFrame(() => dialog.focus());

    function onKeyDown(event: KeyboardEvent) {
      const openDialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (openDialogs[openDialogs.length - 1] !== dialog) return;

      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getAttribute("aria-hidden") !== "true");
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      const trigger = returnFocusRef.current;
      if (trigger?.isConnected) trigger.focus();
    };
  }, [onClose, returnFocusRef]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-4 animate-in fade-in duration-200 motion-reduce:animate-none"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        id={dialogId}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="glass-modal relative flex h-[100dvh] w-full flex-col overflow-hidden rounded-none border-x-0 outline-none animate-in slide-in-from-bottom-4 duration-200 motion-reduce:animate-none sm:h-auto sm:max-h-[85vh] sm:max-w-3xl sm:rounded-2xl sm:border-x sm:zoom-in-95"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close bond details"
          className="absolute right-4 top-4 z-10 rounded-lg p-2 text-[#8FA0B8] transition-colors hover:bg-white/10 hover:text-[#FAFAFA] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E85A95] motion-reduce:transition-none"
        >
          <X size={18} />
        </button>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-5 sm:px-6 sm:pt-6">
          <img
            src={`${IPFS_GATEWAY}/${group.tier.imageCid}`}
            alt={`FlareForward Bonds ${group.tier.name}`}
            className="h-20 w-20 rounded-xl object-cover sm:h-24 sm:w-24"
          />
          <div className="mt-4 pr-10">
            <h2 id={titleId} className="text-xl font-semibold text-[#FAFAFA]">
              {group.tier.name} tier
            </h2>
            <p className="mt-1 text-sm text-[#8FA0B8]">
              {group.tokenIds.length} bond{group.tokenIds.length === 1 ? "" : "s"}
            </p>
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm">
            <p className="tabular-nums text-[#8FA0B8]">
              Earned{" "}
              <span className="font-semibold text-[#FAFAFA]">
                {!rewardsLoading && reward ? <AnimatedFlr value={reward.lifetimeWei} /> : "-"} FLR
              </span>{" "}
              <span aria-hidden="true">·</span> {fmtPct(apyPct)} APY
            </p>
            <p className="mt-1 tabular-nums text-[#8FA0B8]">
              Ready to claim{" "}
              <span className="font-semibold text-emerald-400">
                {!rewardsLoading && reward ? fmtFlrTwoDecimals(reward.claimableWei) : "-"} WFLR
              </span>
            </p>
          </div>

          {rewardsLoading ? (
            <p className="py-6 text-sm text-[#8FA0B8]">Reading bond rewards...</p>
          ) : (
            <ul className="mt-3 divide-y divide-white/8">
              {group.tokenIds.map((tokenId) => {
                const bond = reward?.bonds.find(
                  (candidate) => candidate.tokenId === BigInt(tokenId),
                );
                const hasUnclaimed = (bond?.claimableWei ?? 0n) > 0n;
                return (
                  <li key={tokenId} className="py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold tabular-nums text-[#FAFAFA]">
                            Bond #{tokenId}
                          </p>
                          {hasUnclaimed && (
                            <UnclaimedRibbon wei={bond?.claimableWei ?? 0n} compact />
                          )}
                        </div>
                        <a
                          href={`https://flare-explorer.flare.network/token/${group.tier.address}/instance/${tokenId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-xs text-[#8FA0B8] hover:text-[#FAFAFA]"
                        >
                          Explorer <ExternalLink size={10} />
                        </a>
                      </div>
                      <div className="text-right text-xs">
                        <p className="text-[#8FA0B8]">Earned</p>
                        <p className="mt-1 font-semibold tabular-nums text-[#FAFAFA]">
                          {fmtFlrTwoDecimals(bond?.earnedWei ?? 0n)} FLR
                        </p>
                      </div>
                    </div>
                    <BondPayoutHistory history={history} />
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="shrink-0 border-t border-white/10 bg-[#152238]/95 p-4 sm:px-6">
          <Button
            variant="action"
            size="sm"
            className="w-full gap-2"
            disabled={rewardsLoading || !canClaim || !claimable || busy || !onClaimTier}
            onClick={() => onClaimTier?.(group.tier.key)}
          >
            {thisTierBusy ? (
              <Loader2 size={15} className="animate-spin motion-reduce:animate-none" />
            ) : (
              <Gift size={15} />
            )}
            {thisTierBusy && claimPhase === "processing"
              ? "Updating payouts..."
              : thisTierBusy && claimPhase === "claiming"
                ? "Claiming..."
                : `Claim ${group.tier.name}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Money waiting in a lot. A rose capsule floating inside the card instead of
 * slicing across it (operator 2026-10-23: the flat bar had no elegance). The
 * compact form marks the exact bond inside the lot dialog.
 */
function UnclaimedRibbon({ wei, compact = false }: { wei: bigint; compact?: boolean }) {
  const amount = fmtFlrTwoDecimals(wei);
  if (compact) {
    return (
      <span className="claim-ribbon claim-ribbon--compact">
        <Sparkles size={11} className="claim-ribbon__spark" aria-hidden="true" />
        <span className="claim-ribbon__amount">{amount}</span>
        <span className="claim-ribbon__unit">WFLR unclaimed</span>
      </span>
    );
  }
  return (
    <span className="claim-ribbon">
      <span className="claim-ribbon__gem" aria-hidden="true">
        <Sparkles size={12} />
      </span>
      <span className="min-w-0">
        <span className="claim-ribbon__label">Unclaimed</span>
        <span className="block truncate">
          <span className="claim-ribbon__amount">{amount}</span>{" "}
          <span className="claim-ribbon__unit">WFLR</span>
        </span>
      </span>
    </span>
  );
}

function BondPayoutHistory({ history }: { history: EarnedBondLot | undefined }) {
  const [showAll, setShowAll] = useState(false);

  if (!history || !history.payoutsAvailable) {
    return <p className="mt-3 text-xs text-[#8FA0B8]">Payout history is unavailable.</p>;
  }
  if (history.payouts.length === 0) {
    return <p className="mt-3 text-xs text-[#8FA0B8]">No payout releases yet.</p>;
  }

  const payouts = [...history.payouts].sort(
    (a, b) => b.unix - a.unix || b.block - a.block,
  );
  const visiblePayouts = showAll ? payouts : payouts.slice(0, 3);

  return (
    <div className="mt-3 text-xs text-[#8FA0B8]">
      <p>Payout history</p>
      <ul className="mt-1 space-y-1">
        {visiblePayouts.map((payout) => (
          <li
            key={`${payout.block}-${payout.unix}`}
            className="flex items-baseline justify-between gap-3 tabular-nums"
          >
            <span>{fmtPayoutDate(payout.unix)}</span>
            <span className="whitespace-nowrap">
              {fmtFlrTwoDecimals(payout.perBondAmountWei)} FLR
            </span>
          </li>
        ))}
      </ul>
      {payouts.length > 3 && (
        <button
          type="button"
          className="mt-2 text-xs font-medium text-[#E85A95] hover:underline"
          aria-expanded={showAll}
          onClick={() => setShowAll((current) => !current)}
        >
          {showAll ? "Show latest 3" : `Show all ${payouts.length}`}
        </button>
      )}
    </div>
  );
}

function fmtFlrTwoDecimals(wei: bigint): string {
  const negative = wei < 0n;
  const abs = negative ? -wei : wei;
  const int = abs / 10n ** 18n;
  const fraction = (abs % 10n ** 18n).toString().padStart(18, "0").slice(0, 2);
  const value = Number(`${int}.${fraction}`);
  return `${negative ? "-" : ""}${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function AnimatedFlr({ value }: { value: bigint }) {
  const [shown, setShown] = useState(() => Number(formatUnits(value, 18)));
  const previous = useRef(value);

  useEffect(() => {
    const from = Number(formatUnits(previous.current, 18));
    const to = Number(formatUnits(value, 18));
    previous.current = value;
    if (from === to) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(to);
      return;
    }
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / 650);
      setShown(from + (to - from) * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return shown.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
