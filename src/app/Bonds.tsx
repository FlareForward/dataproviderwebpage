import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { ArrowRight, ExternalLink, Gem, Gift, Loader2 } from "lucide-react";
import { useAccount } from "wagmi";
import { Button } from "./components/Button";
import { MyBonds } from "./components/MyBonds";
import { ClaimNoticeDialog, hasSeenClaimNotice, markClaimNoticeSeen } from "./components/ClaimNoticeDialog";
import { useEarned } from "../hooks/useEarned";
import { useBondClaims } from "../hooks/useBondClaims";
import { settledRate, fmtPct, fmtFlrWei } from "../lib/rewards";

const BOND_YIELD_URL = import.meta.env.VITE_BOND_YIELD_URL ?? "/api/bond-yield";

/**
 * /bonds — what this wallet holds and what it has earned. Nothing else.
 *
 * No marketplace block (that belongs on the mint page, where someone is
 * choosing between minting and buying) and no address lookup (this page already
 * knows whose wallet it is).
 *
 * Claim works for every lot that has a payout contract (a lot gets one after it
 * closes). It pokes the distributor's lazy accounting, then claims, so a holder
 * never has to know the distributor needs a nudge. For a wallet holding only
 * bonds in still-open lots the button stays shut and says why.
 */
export default function Bonds() {
  const { address } = useAccount();
  const earned = useEarned(address);
  const claims = useBondClaims();
  const [noticeOpen, setNoticeOpen] = useState(false);
  // One-time notice per wallet, shown on the first bond claim after the payout schedule change.
  function onClaimClick() {
    if (address && !hasSeenClaimNotice(address)) {
      setNoticeOpen(true);
      return;
    }
    void claims.claimAll();
  }
  const busy = claims.phase === "processing" || claims.phase === "claiming";
  const claimLabel =
    claims.phase === "processing"
      ? "Updating payouts…"
      : claims.phase === "claiming"
        ? "Claiming…"
        : "Claim all";
  const claimCaption = !claims.isConnected
    ? "Connect your wallet to claim"
    : claims.heldPaid === 0
      ? "Opens when your lot closes"
      : claims.mayClaim
        ? `${fmtFlrWei(claims.claimableWei, 4)} WFLR ready${
            claims.unprocessedWei > 0n ? ", plus a new release to process" : ""
          } · two wallet confirmations`
        : "Nothing to claim yet";
  const { data } = useQuery<{
    current?: { bond_rate_annualized_pct: number | null } | null;
    last_measured?: { bond_rate_annualized_pct: number | null } | null;
  }>({
    queryKey: ["bond-yield"],
    queryFn: async () => {
      const res = await fetch(BOND_YIELD_URL, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`bond-yield ${res.status}`);
      return res.json();
    },
    staleTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // `current` is zero for the whole of an in-flight epoch, so fall back to the
  // last epoch that actually paid out rather than showing nothing for days.
  const rate =
    settledRate(data?.current?.bond_rate_annualized_pct) ??
    settledRate(data?.last_measured?.bond_rate_annualized_pct);
  const earnedBondsWei = earned.data?.earned.bondsWei;
  const earnedLabel =
    earned.isLoading || earnedBondsWei === undefined
      ? "—"
      : earnedBondsWei === null
        ? "not tracked yet"
        : `${fmtFlrWei(earnedBondsWei, 2)} FLR`;
  const earnedSubline = !address
    ? "connect your wallet to see yours"
    : earnedBondsWei === null
      ? "distribution contract pending"
      : "claimed plus currently claimable";

  return (
    <div className="p-4 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-3">
              <Gem size={22} className="text-[#E85A95]" />
              <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
                Your Bonds
              </h1>
            </div>
            <p className="text-[#8FA0B8] text-sm mt-1">
              What you hold, and what it has earned.
            </p>
          </div>
          <Link to="/nft">
            <Button variant="action" className="gap-2">
              <Gem size={16} /> Bond lots <ArrowRight size={15} />
            </Button>
          </Link>
        </div>

        {/* Earnings and claim, together and at the top — the two things someone
            opens this page to find. */}
        <div className="glass-card p-5 lg:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-[#8FA0B8]">
                Current bond rate
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-400">
                {fmtPct(rate)}
              </div>
              <div className="mt-1 text-xs text-[#8FA0B8]">
                what our validator bond earns now — measured
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-[#8FA0B8]">
                Earned so far
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-[#FAFAFA]">
                {earnedLabel}
              </div>
              <div className="mt-1 text-xs text-[#8FA0B8]">{earnedSubline}</div>
            </div>
            <div className="sm:text-right">
              <Button
                variant="action"
                className="gap-2 w-full sm:w-auto"
                disabled={!claims.mayClaim || busy}
                onClick={onClaimClick}
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Gift size={16} />}{" "}
                {claimLabel}
              </Button>
              <p className="mt-2 text-xs text-[#8FA0B8]">{claimCaption}</p>
              {noticeOpen && address && (
                <ClaimNoticeDialog
                  onCancel={() => setNoticeOpen(false)}
                  onContinue={() => {
                    markClaimNoticeSeen(address);
                    setNoticeOpen(false);
                    void claims.claimAll();
                  }}
                />
              )}
              {claims.lastTx && (
                <a
                  href={`https://flare-explorer.flare.network/tx/${claims.lastTx}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-400 hover:underline"
                >
                  Claimed · view transaction <ExternalLink size={12} />
                </a>
              )}
            </div>
          </div>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-[#8FA0B8]">
            Rewards are released to bond holders every reward epoch, about
            every 3.5 days, after the epoch closes. Your share is equal per
            bond. Click Claim to receive it as WFLR; a 0.3% processing fee is
            taken by the payout contract's operator. Unclaimed rewards wait for
            you; they do not expire. The rate above is what our validator bond
            is earning; it moves epoch to epoch and is not a promise.
          </p>
        </div>

        <MyBonds compact bare />
      </div>
    </div>
  );
}
