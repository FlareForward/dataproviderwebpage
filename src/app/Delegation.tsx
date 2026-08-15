import { useMemo, useState } from "react";
import { settledRate } from "../lib/rewards";
import { formatFlrInput } from "../lib/staking";
import { formatUnits } from "viem";
import {
  Shield,
  Wallet,
  Info,
  Loader2,
  XCircle,
  Users,
  Gift,
  CheckCircle2,
  ExternalLink,
  GraduationCap,
  Flame,
  Hammer,
} from "lucide-react";
import { Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./components/Card";
import { Button } from "./components/Button";
import { Badge } from "./components/Badge";
import { ConnectWallet } from "./components/ConnectWallet";
import { EarningsStrip } from "./components/EarningsStrip";
import { ImageWithFallback } from "./components/figma/ImageWithFallback";
import { useProviders, type ProviderRow } from "../hooks/useProviders";
import { useDelegation } from "../hooks/useDelegation";
import { useRewards } from "../hooks/useRewards";
import { EXPLORER_URL } from "../lib/flare";
import logoImage from "../imports/flareforward_logo.png";

interface CurrentDelegation {
  address: `0x${string}`;
  bips: number;
}

/**
 * FlareForward identity (pinned) — mirrors PINNED_PROVIDER_ADDRESS in
 * useProviders. This page delegates to FlareForward only; no other provider
 * is offered or shown.
 */
const FLAREFORWARD_ADDRESS =
  "0x1FBB55a1877817A0f90cAE60c1ab22FC94f97110".toLowerCase();

function isFlareForward(p: ProviderRow): boolean {
  return (
    p.address.toLowerCase() === FLAREFORWARD_ADDRESS ||
    p.identityAddress.toLowerCase() === FLAREFORWARD_ADDRESS
  );
}

export function Delegation() {
  const { providers } = useProviders();
  const { data: rewards } = useRewards();
  const {
    isConnected,
    flrBalance,
    wflrBalance,
    flrLabel,
    wflrLabel,
    currentDelegations,
    claimableReward,
    claimableRewardLabel,
    busy,
    wrap,
    delegate,
    undelegate,
    claimRewards,
  } = useDelegation();

  const [wrapAmount, setWrapAmount] = useState("");
  const [confirming, setConfirming] = useState(false);

  const flareForward = providers.find(isFlareForward) ?? null;
  const flareForwardDelegationAddress =
    flareForward?.address.toLowerCase() ?? rewards?.delegation_address?.toLowerCase() ?? null;
  const delegatedWflr = useMemo(() => {
    if (!flareForwardDelegationAddress) return 0n;
    const delegatedBips =
      currentDelegations.find(
        (d) => d.address.toLowerCase() === flareForwardDelegationAddress
      )?.bips ?? 0;
    return (wflrBalance * BigInt(delegatedBips)) / 10_000n;
  }, [currentDelegations, flareForwardDelegationAddress, wflrBalance]);
  const hasVotePower = wflrBalance > 0n;
  const alreadyDelegated =
    flareForward != null &&
    currentDelegations.some(
      (d) => d.address.toLowerCase() === flareForward.address.toLowerCase()
    );

  async function handleWrap() {
    try {
      await wrap(wrapAmount);
      setWrapAmount("");
    } catch {
      /* toast already shown */
    }
  }

  async function handleClaim() {
    try {
      await claimRewards();
    } catch {
      /* toast already shown */
    }
  }

  async function handleConfirmDelegate() {
    if (!flareForward) return;
    try {
      await delegate([{ address: flareForward.address, sharePct: 100 }]);
      setConfirming(false);
    } catch {
      /* toast already shown */
    }
  }

  return (
    <div className="space-y-6">
      {isConnected && (
        <EarningsStrip
          rateLabel="Delegation APY"
          ratePct={settledRate(rewards?.rates.delegation_annual_pct)}
          positionLabel="Delegated to FlareForward"
          positionAmount={delegatedWflr}
          positionUnit="WFLR"
          claimableReward={claimableReward}
          emptyMessage="Delegate WFLR to FlareForward when you're ready."
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      {/* Your delegations — the user's own current position. */}
      {isConnected && currentDelegations.length > 0 && (
        <YourDelegations
          delegations={currentDelegations}
          flareForward={flareForward}
          busy={busy}
          onUndelegate={undelegate}
        />
      )}

      {/* Delegation rewards — claimable FTSO rewards accrued from delegation. */}
      {isConnected && (
        <Card>
          <CardHeader className="border-b border-white/8 pb-4">
            <div className="flex items-center gap-2">
              <Gift size={18} className="text-[#EE1A58]" />
              <CardTitle className="text-[#FAFAFA]">Delegation Rewards</CardTitle>
            </div>
            <CardDescription className="text-[#8FA0B8]">
              FTSO rewards earned from delegating your WFLR vote power
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-xs text-[#8FA0B8] mb-1">Claimable rewards</div>
              <div className="text-2xl font-semibold text-[#FAFAFA]">
                {claimableRewardLabel} <span className="text-base text-[#8FA0B8]">FLR</span>
              </div>
            </div>
            <Button
              variant="action"
              className="gap-2 sm:w-auto w-full"
              disabled={busy !== null || claimableReward <= 0n}
              onClick={handleClaim}
            >
              {busy === "claim" ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <>
                  <Gift size={16} /> Claim rewards
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}
      </div>

      {/* Delegation Action Panel. Full width on purpose: a max-w card here sat
          in the left half of a full-width page and left the right half empty. */}
      <div>
        <div>
          <Card>
            <CardHeader className="border-b border-white/8 pb-4">
              <CardTitle className="text-[#FAFAFA]">Delegate Vote Power</CardTitle>
              <CardDescription className="text-[#8FA0B8]">
                Delegate WFLR to FlareForward and earn FTSO rewards
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 space-y-6">
              {!isConnected ? (
                <div className="text-center py-8 text-[#8FA0B8] flex flex-col items-center gap-4">
                  <Wallet size={32} className="opacity-20" />
                  <p className="text-sm">Connect your wallet to delegate on Flare Mainnet.</p>
                  <ConnectWallet size="md" />
                </div>
              ) : (
                <>
                  {/* Two columns. What you hold and the one action still worth
                      taking on the left; where your vote power already goes on
                      the right. */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                  <div className="space-y-6">
                  {/* Balances */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="glass-panel p-3">
                      <div className="text-xs text-[#8FA0B8] mb-1">FLR in wallet</div>
                      <div className="font-medium text-[#FAFAFA] text-sm">{flrLabel}</div>
                    </div>
                    <div className="glass-panel p-3">
                      <div className="text-xs text-[#8FA0B8] mb-1">WFLR vote power</div>
                      <div className="font-medium text-[#FAFAFA] text-sm">{wflrLabel}</div>
                    </div>
                  </div>

                  {/* Wrap step */}
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-[#8FA0B8]">Wrap FLR to WFLR (optional)</span>
                      <button
                        onClick={() => setWrapAmount(formatFlrInput(flrBalance))}
                        className="text-xs text-[#EE1A58] hover:underline"
                      >
                        MAX
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        value={wrapAmount}
                        onChange={(e) => setWrapAmount(e.target.value)}
                        onWheel={(e) => e.currentTarget.blur()}
                        placeholder="0.00"
                        className="w-full glass-panel py-3 px-4 text-[#FAFAFA] text-lg focus:outline-none focus:border-[#EE1A58]/60 transition-colors pr-16"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8FA0B8] font-medium">FLR</span>
                    </div>
                    <Button
                      variant="action"
                      className="w-full"
                      disabled={busy !== null || !wrapAmount || Number(wrapAmount) <= 0}
                      onClick={handleWrap}
                    >
                      {busy === "wrap" ? <Loader2 className="animate-spin" size={16} /> : "Wrap FLR"}
                    </Button>
                  </div>
                  </div>

                  <div className="space-y-6">
                  {alreadyDelegated ? (
                    <>
                      <div className="glass-panel p-3 flex items-center gap-2 text-sm text-emerald-400">
                        <CheckCircle2 size={16} className="shrink-0" />
                        You're already delegated to FlareForward. Thank you!
                      </div>
                      {/* Delegating again is not a thing to do. On Flare the
                          instruction is a percentage, set once — anything wrapped
                          later follows it on its own. Showing a "Delegate" CTA to
                          someone already at 100% invents an action they do not
                          have, so say what is actually true instead. */}
                      <div className="bg-[#EE1A58]/10 border border-[#EE1A58]/20 rounded-lg p-3 flex gap-3 text-sm">
                        <Info size={16} className="text-[#EE1A58] shrink-0 mt-0.5" />
                        <div className="text-[#FAFAFA]">
                          Your delegation is a standing instruction, not a balance —
                          100% of your vote power, set once. Any FLR you wrap from
                          here follows it automatically, with nothing further to
                          sign. Your tokens never leave your wallet.
                        </div>
                      </div>
                    </>
                  ) : (
                  <>
                  <div className="bg-[#EE1A58]/10 border border-[#EE1A58]/20 rounded-lg p-3 flex gap-3 text-sm">
                    <Info size={16} className="text-[#EE1A58] shrink-0 mt-0.5" />
                    <div className="text-[#FAFAFA]">
                      Delegation assigns 100% of your{" "}
                      <span className="font-semibold">{wflrLabel} WFLR</span> vote power to
                      FlareForward. Your tokens never leave your wallet.
                    </div>
                  </div>

                  {/* Confirm delegation (human-in-the-loop) */}
                  {!confirming ? (
                    <Button
                      variant="action"
                      className="w-full py-6 text-base font-semibold"
                      disabled={busy !== null || !hasVotePower || !flareForward}
                      onClick={() => setConfirming(true)}
                    >
                      {!hasVotePower
                        ? "Wrap FLR first to get vote power"
                        : !flareForward
                          ? "Loading provider…"
                          : "Delegate to FlareForward"}
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-[#FAFAFA] text-center">
                        Delegate 100% of your {wflrLabel} WFLR to{" "}
                        <span className="font-semibold">FlareForward</span>?
                      </p>
                      <div className="flex gap-2">
                        <Button variant="outline" className="flex-1" disabled={busy !== null} onClick={() => setConfirming(false)}>
                          Cancel
                        </Button>
                        <Button variant="primary" className="flex-1" disabled={busy !== null} onClick={handleConfirmDelegate}>
                          {busy === "delegate" ? <Loader2 className="animate-spin" size={16} /> : "Confirm"}
                        </Button>
                      </div>
                    </div>
                  )}
                  </>
                  )}
                  </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/**
 * The user's current delegations. This is the user's own on-chain position:
 * targets other than FlareForward render as a shortened address only — no
 * other provider's name, logo, or stats appear on this site.
 */
function YourDelegations({
  delegations,
  flareForward,
  busy,
  onUndelegate,
}: {
  delegations: CurrentDelegation[];
  flareForward: ProviderRow | null;
  busy: null | "wrap" | "delegate" | "undelegate" | "claim";
  onUndelegate: () => void;
}) {
  const totalPct = delegations.reduce((sum, d) => sum + d.bips, 0) / 100;

  return (
    <Card>
      <CardHeader className="border-b border-white/8 pb-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-[#EE1A58]" />
            <CardTitle className="text-[#FAFAFA]">Your Delegations</CardTitle>
          </div>
          {/* Same treatment as Your Stakes: the percentage is already on the
              row below and in the tile at the top. Header carries the action
              only. */}
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              className="text-red-400 hover:bg-red-500/10 gap-2"
              disabled={busy !== null}
              onClick={onUndelegate}
            >
              {busy === "undelegate" ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <>
                  <XCircle size={16} /> Undelegate all
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <div className="divide-y divide-white/8">
        {delegations.map((d) => {
          const isUs =
            flareForward != null &&
            d.address.toLowerCase() === flareForward.address.toLowerCase();
          return (
            <div
              key={d.address}
              className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-10 h-10 rounded-full flex items-center justify-center border border-white/10 bg-white/5 overflow-hidden shrink-0">
                  {isUs ? (
                    <ImageWithFallback
                      src={logoImage}
                      alt="FlareForward"
                      className="w-7 h-7 object-contain"
                    />
                  ) : (
                    <Shield size={18} className="text-[#8FA0B8]" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-[#FAFAFA] truncate">
                    {isUs ? "FlareForward" : "Another provider"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 sm:justify-end pl-14 sm:pl-0">
                <div className="text-right">
                  <div className="text-sm font-semibold text-[#EE1A58]">
                    {(d.bips / 100).toFixed(0)}%
                  </div>
                </div>
                <Badge variant={isUs ? "success" : "dark"}>
                  {isUs ? "FlareForward" : "Delegated"}
                </Badge>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
