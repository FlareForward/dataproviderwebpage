import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ArrowRight, ExternalLink, Gem, Gift, Loader2, Search } from "lucide-react";
import { useAccount } from "wagmi";
import { isAddress } from "viem";
import { Button } from "./components/Button";
import { MyBonds } from "./components/MyBonds";
import { ClaimNoticeDialog, hasSeenClaimNotice, markClaimNoticeSeen } from "./components/ClaimNoticeDialog";
import { useEarned } from "../hooks/useEarned";
import { useBondClaims } from "../hooks/useBondClaims";
import { useBondApy } from "../hooks/useBondApy";
import { shortAddress } from "../lib/flare";
import { fmtPct, fmtFlrWei } from "../lib/rewards";
import { BondRewardHistory } from "./components/RewardHistory";

const PAYOUT_NOTE_VISIBLE_AT = Date.parse("2026-11-05T00:00:00Z");

export default function Bonds() {
  const { address: connectedAddress } = useAccount();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryAddress = searchParams.get("address");
  const viewedAddress =
    queryAddress && isAddress(queryAddress)
      ? (queryAddress as `0x${string}`)
      : connectedAddress;
  const [input, setInput] = useState(viewedAddress ?? "");
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [pendingTierKey, setPendingTierKey] = useState<string | null>(null);

  useEffect(() => {
    if (viewedAddress) setInput(viewedAddress);
  }, [viewedAddress]);

  const earned = useEarned(viewedAddress);
  const claims = useBondClaims(viewedAddress);
  const bondApy = useBondApy();
  const lifetimeWei = useMemo(
    () => claims.perTier.reduce((total, tier) => total + tier.lifetimeWei, 0n),
    [claims.perTier],
  );
  const busy = claims.phase === "processing" || claims.phase === "claiming";
  const claimLabel =
    claims.phase === "processing"
      ? "Updating payouts..."
      : claims.phase === "claiming"
        ? "Claiming..."
        : "Claim all";

  function lookUp() {
    const value = input.trim();
    if (!isAddress(value)) return;
    const next = new URLSearchParams(searchParams);
    next.set("address", value);
    setSearchParams(next, { replace: true });
  }

  function backToConnectedWallet() {
    const next = new URLSearchParams(searchParams);
    next.delete("address");
    setSearchParams(next, { replace: true });
    setInput(connectedAddress ?? "");
  }

  function runClaim(tierKey: string | null) {
    if (tierKey) {
      void claims.claimTier(tierKey);
    } else {
      void claims.claimAll();
    }
  }

  function onClaimClick(tierKey: string | null = null) {
    if (connectedAddress && !hasSeenClaimNotice(connectedAddress)) {
      setPendingTierKey(tierKey);
      setNoticeOpen(true);
      return;
    }
    runClaim(tierKey);
  }

  const claimCaption = !claims.isConnected
    ? "Connect this wallet to claim"
    : !claims.isViewingConnectedWallet
      ? "Connect the address shown above to claim"
      : claims.heldPaid === 0
        ? "No reward-paying bonds in this wallet"
        : claims.mayClaim
          ? "Two wallet confirmations per lot"
          : "Nothing to claim yet";

  return (
    <div className="p-4 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Gem size={22} className="text-[#E85A95]" />
              <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Your Bonds</h1>
            </div>
            <p className="mt-1 text-sm text-[#8FA0B8]">Live earnings from every lot you hold.</p>
          </div>
          <Link to="/nft">
            <Button variant="outline" className="gap-2">
              Bond lots <ArrowRight size={15} />
            </Button>
          </Link>
        </div>

        {!connectedAddress && (
          <div className="max-w-2xl">
            <label htmlFor="bond-wallet-lookup" className="text-sm font-medium text-[#FAFAFA]">
              View any wallet&apos;s bonds
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="flex min-w-[260px] flex-1 items-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2">
                <Search size={14} className="shrink-0 text-[#8FA0B8]" />
                <input
                  id="bond-wallet-lookup"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && lookUp()}
                  placeholder="0x... Flare address"
                  spellCheck={false}
                  className="w-full border-none bg-transparent font-mono text-sm text-[#FAFAFA] outline-none placeholder:text-[#8FA0B8]"
                />
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={lookUp}
                disabled={!isAddress(input.trim())}
              >
                Look up
              </Button>
            </div>
          </div>
        )}

        {connectedAddress &&
          queryAddress &&
          isAddress(queryAddress) &&
          queryAddress.toLowerCase() !== connectedAddress.toLowerCase() && (
            <p className="text-xs text-[#8FA0B8]">
              Viewing <span className="font-mono">{shortAddress(queryAddress)}</span>{" "}
              <span aria-hidden="true">·</span>{" "}
              <button
                type="button"
                onClick={backToConnectedWallet}
                className="font-medium text-[#E85A95] hover:underline"
              >
                Back to my bonds
              </button>
            </p>
          )}

        {Date.now() >= PAYOUT_NOTE_VISIBLE_AT && (
          <p className="text-xs text-[#8FA0B8]">
            Bond rewards are paid every 2 weeks, after each Flare staking payout.
          </p>
        )}

        {viewedAddress ? (
          <>
            <section className="glass-card p-5 sm:p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wider text-[#8FA0B8]">Earned</p>
                  <p className="mt-1 text-4xl font-semibold tabular-nums text-[#FAFAFA] sm:text-5xl">
                    {claims.isLoading ? "-" : fmtFlrWei(lifetimeWei, 2)}{" "}
                    <span className="text-lg font-medium text-[#8FA0B8]">FLR</span>
                  </p>
                  <p className="mt-2 text-xs text-[#8FA0B8]">Claimed plus currently claimable</p>
                  <p className="mt-3 text-sm text-emerald-400">
                    {fmtPct(bondApy.apyPct)} APY so far, from real payouts
                  </p>
                </div>
                <div className="sm:text-right">
                  <Button
                    variant="action"
                    className="w-full gap-2 sm:w-auto"
                    disabled={!claims.mayClaim || busy}
                    onClick={() => onClaimClick()}
                  >
                    {busy ? <Loader2 size={16} className="animate-spin" /> : <Gift size={16} />}
                    {claimLabel}
                    {claims.claimableWei > 0n && (
                      <span className="rounded-full bg-black/20 px-2 py-0.5 text-xs tabular-nums">
                        Ready to claim: {fmtFlrWei(claims.claimableWei, 2)} WFLR
                      </span>
                    )}
                  </Button>
                  <p className="mt-2 text-xs text-[#8FA0B8]">{claimCaption}</p>
                  <p className="mt-1 text-xs text-[#8FA0B8]">
                    0.3% fee goes to the payout contract&apos;s operator
                  </p>
                  {claims.lastTx && (
                    <a
                      href={`https://flare-explorer.flare.network/tx/${claims.lastTx}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-400 hover:underline"
                    >
                      Claimed. View transaction <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </div>
              <div className="mt-4 sm:ml-auto sm:max-w-md">
                <BondRewardHistory
                  lots={earned.data?.bondLots ?? []}
                  loading={earned.isLoading}
                  unavailable={!!earned.error}
                  showTotal={false}
                />
              </div>
            </section>

            <MyBonds
              compact
              bare
              tiers={claims.perTier}
              history={earned.data?.bondLots ?? []}
              apyPct={bondApy.apyPct}
              rewardsLoading={claims.isLoading}
              claimPhase={claims.phase}
              activeTierKey={claims.activeTierKey}
              canClaim={claims.isConnected && claims.isViewingConnectedWallet}
              onClaimTier={(tierKey) => onClaimClick(tierKey)}
            />
          </>
        ) : (
          <div className="glass-panel p-6 text-sm text-[#8FA0B8]">
            Connect a wallet or look up an address to see its bonds.
          </div>
        )}

        {noticeOpen && connectedAddress && (
          <ClaimNoticeDialog
            onCancel={() => {
              setNoticeOpen(false);
              setPendingTierKey(null);
            }}
            onContinue={() => {
              markClaimNoticeSeen(connectedAddress);
              setNoticeOpen(false);
              runClaim(pendingTierKey);
              setPendingTierKey(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
