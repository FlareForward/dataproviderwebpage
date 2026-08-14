import { useMemo, useState } from "react";
import { settledRate } from "../lib/rewards";
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
import { shortAddress, EXPLORER_URL } from "../lib/flare";
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
          basis={rewards?.rates.basis}
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
              variant="primary"
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* FlareForward — the one and only delegation target on this site. */}
        <Card className="col-span-1 lg:col-span-2">
          <CardHeader className="border-b border-white/8 pb-4">
            <CardTitle className="text-[#FAFAFA]">Your provider: FlareForward</CardTitle>
            <CardDescription className="text-[#8FA0B8]">
              This page delegates your vote power to the FlareForward data
              provider — builders and educators on the Flare network.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-12 h-12 rounded-full flex items-center justify-center border border-[#EE1A58]/40 bg-white/5 overflow-hidden shrink-0">
                  <ImageWithFallback
                    src={logoImage}
                    alt="FlareForward"
                    className="w-8 h-8 object-contain"
                  />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-lg text-[#FAFAFA]">FlareForward</div>
                  <div className="text-xs text-[#8FA0B8] font-mono">
                    {flareForward
                      ? shortAddress(flareForward.address)
                      : shortAddress(FLAREFORWARD_ADDRESS as `0x${string}`)}
                  </div>
                </div>
              </div>
              <Badge variant={flareForward?.status === "Active" || !flareForward ? "success" : "outline"}>
                {flareForward?.status ?? "Active"}
              </Badge>
            </div>

            <ul className="space-y-3 text-sm text-[#8FA0B8]">
              <li className="flex gap-3">
                <GraduationCap size={16} className="text-[#EE1A58] shrink-0 mt-0.5" />
                <span>
                  <span className="text-[#FAFAFA] font-medium">Backs education.</span>{" "}
                  Your delegation funds DeFi University and free plain-English
                  Flare education.
                </span>
              </li>
              <li className="flex gap-3">
                <Hammer size={16} className="text-[#EE1A58] shrink-0 mt-0.5" />
                <span>
                  <span className="text-[#FAFAFA] font-medium">Backs builders.</span>{" "}
                  The same team signing your feeds ships tools on Flare every
                  day.
                </span>
              </li>
              <li className="flex gap-3">
                <Flame size={16} className="text-[#EE1A58] shrink-0 mt-0.5" />
                <span>
                  <span className="text-[#FAFAFA] font-medium">Gives back.</span>{" "}
                  Burn protocols around our systems return value to the network
                  you're betting on.
                </span>
              </li>
              <li className="flex gap-3">
                <Shield size={16} className="text-[#EE1A58] shrink-0 mt-0.5" />
                <span>
                  <span className="text-[#FAFAFA] font-medium">Non-custodial.</span>{" "}
                  Delegation assigns vote power only — your WFLR never leaves
                  your wallet, and you can undelegate any time.
                </span>
              </li>
            </ul>

            <div className="flex flex-wrap items-center gap-4 pt-1">
              <a
                href={`${EXPLORER_URL}/address/${flareForward?.identityAddress ?? FLAREFORWARD_ADDRESS}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#8FA0B8] hover:text-[#FAFAFA] flex items-center gap-1"
              >
                <ExternalLink size={12} /> View on explorer
              </a>
              <Link
                to="/rewards"
                className="text-xs text-[#EE1A58] hover:underline flex items-center gap-1"
              >
                <Gift size={12} /> See current reward rates
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Delegation Action Panel */}
        <div className="col-span-1">
          <Card className="sticky top-24">
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
                  {/* Balances */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="glass-panel p-3">
                      <div className="text-xs text-[#8FA0B8] mb-1">FLR Balance</div>
                      <div className="font-medium text-[#FAFAFA] text-sm">{flrLabel}</div>
                    </div>
                    <div className="glass-panel p-3">
                      <div className="text-xs text-[#8FA0B8] mb-1">WFLR (Vote Power)</div>
                      <div className="font-medium text-[#FAFAFA] text-sm">{wflrLabel}</div>
                    </div>
                  </div>

                  {alreadyDelegated && (
                    <div className="glass-panel p-3 flex items-center gap-2 text-sm text-emerald-400">
                      <CheckCircle2 size={16} className="shrink-0" />
                      You're already delegated to FlareForward. Thank you!
                    </div>
                  )}

                  {/* Wrap step */}
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-[#8FA0B8]">Wrap FLR to WFLR (optional)</span>
                      <button
                        onClick={() => setWrapAmount(formatUnits(flrBalance, 18))}
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
                      variant="secondary"
                      className="w-full"
                      disabled={busy !== null || !wrapAmount || Number(wrapAmount) <= 0}
                      onClick={handleWrap}
                    >
                      {busy === "wrap" ? <Loader2 className="animate-spin" size={16} /> : "Wrap FLR"}
                    </Button>
                  </div>

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
                      variant="primary"
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
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xs text-[#8FA0B8]">Vote power delegated</div>
              <div className="text-sm font-semibold text-[#FAFAFA]">{totalPct.toFixed(0)}%</div>
            </div>
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
        <CardDescription className="text-[#8FA0B8]">
          Where your WFLR vote power is currently delegated
        </CardDescription>
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
                  <div className="text-xs text-[#8FA0B8] font-mono mt-0.5">
                    {shortAddress(d.address)}
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
