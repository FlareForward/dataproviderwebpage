import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Gift,
  Landmark,
  Loader2,
  Wallet,
  XCircle,
} from "lucide-react";
import { formatUnits } from "viem";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/Card";
import { Button } from "./components/Button";
import { ConnectWallet } from "./components/ConnectWallet";
import { EarningsStrip } from "./components/EarningsStrip";
import { MyBonds } from "./components/MyBonds";
import { useDelegation } from "../hooks/useDelegation";
import { useRewards } from "../hooks/useRewards";
import { useStaking } from "../hooks/useStaking";
import { settledRate, fmtDate, fmtPct } from "../lib/rewards";
import { formatFlr, type DisplayStake } from "../lib/staking";


type ClaimSource = "delegation" | "staking";
type ClaimState = "idle" | "claiming" | "claimed" | "failed";

const FLAREFORWARD_ADDRESS =
  "0x1FBB55a1877817A0f90cAE60c1ab22FC94f97110".toLowerCase();

/**
 * /rewards is the connected wallet's member page: delegation, staking, and
 * bond holdings in one place. Bond distributions are status-only here because
 * no claim contract exists yet.
 */
export default function Rewards() {
  const { data: rewards, isLoading, error } = useRewards();
  const delegation = useDelegation();
  const staking = useStaking();
  const [claimState, setClaimState] = useState<Record<ClaimSource, ClaimState>>({
    delegation: "idle",
    staking: "idle",
  });

  const isConnected = delegation.isConnected || staking.isConnected;
  const ffDelegationAddress =
    rewards?.delegation_address?.toLowerCase() ?? FLAREFORWARD_ADDRESS;
  const delegatedWflr = useMemo(() => {
    const delegatedBips =
      delegation.currentDelegations.find(
        (d) => d.address.toLowerCase() === ffDelegationAddress
      )?.bips ?? 0;
    return (delegation.wflrBalance * BigInt(delegatedBips)) / 10_000n;
  }, [delegation.currentDelegations, delegation.wflrBalance, ffDelegationAddress]);

  const stakedWithUs = useMemo(
    () => totalStakedWithNode(staking.stakes, rewards?.node_id ?? null),
    [staking.stakes, rewards?.node_id]
  );
  const soonestUnlock = useMemo(
    () => soonestFutureStake(staking.stakes, rewards?.node_id ?? null),
    [staking.stakes, rewards?.node_id]
  );
  const totalClaimable = delegation.claimableReward + staking.claimableReward;
  const claimBusy =
    delegation.busy === "claim" ||
    staking.busy === "claim" ||
    claimState.delegation === "claiming" ||
    claimState.staking === "claiming";

  function setSourceState(source: ClaimSource, state: ClaimState) {
    setClaimState((current) => ({ ...current, [source]: state }));
  }

  async function claimSource(source: ClaimSource) {
    const amount =
      source === "delegation" ? delegation.claimableReward : staking.claimableReward;
    if (amount <= 0n) return;

    setSourceState(source, "claiming");
    try {
      if (source === "delegation") {
        await delegation.claimRewards();
      } else {
        await staking.claimRewards();
      }
      setSourceState(source, "claimed");
    } catch {
      setSourceState(source, "failed");
    }
  }

  async function claimBoth() {
    if (claimBusy) return;
    if (delegation.claimableReward > 0n) await claimSource("delegation");
    if (staking.claimableReward > 0n) await claimSource("staking");
  }

  return (
    <div className="p-4 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">My Rewards</h1>
            <p className="text-[#8FA0B8] text-sm mt-1">
              Thank you for backing FlareForward. Here's what your wallet has earned, and
              what's ready to claim.
            </p>
          </div>
          {isConnected && delegation.address && (
            <div className="glass-panel px-3.5 py-2 text-xs font-mono text-[#8FA0B8]">
              {delegation.address}
            </div>
          )}
        </div>

        {isLoading && (
          <div className="glass-card p-10 flex items-center justify-center gap-2 text-[#8FA0B8]">
            <Loader2 size={18} className="animate-spin" /> Loading rewards data…
          </div>
        )}

        {error && !isLoading && (
          <div className="glass-card p-6 text-sm text-red-400">
            Couldn't load rewards data right now — refresh in a moment.
          </div>
        )}

        {rewards && (
          <>
            {!isConnected ? (
              <DisconnectedRewards rates={rewards.rates} />
            ) : (
              <>
                <ClaimPanel
                  totalClaimable={totalClaimable}
                  delegationClaimable={delegation.claimableReward}
                  stakingClaimable={staking.claimableReward}
                  delegationState={
                    delegation.busy === "claim" ? "claiming" : claimState.delegation
                  }
                  stakingState={staking.busy === "claim" ? "claiming" : claimState.staking}
                  busy={claimBusy}
                  onClaimDelegation={() => claimSource("delegation")}
                  onClaimStaking={() => claimSource("staking")}
                  onClaimBoth={claimBoth}
                />

                <RewardSection
                  title="Delegation"
                  description="Your WFLR delegated to FlareForward and delegation rewards claimable now."
                  action={
                    <Link to="/delegation">
                      <Button variant="outline" size="sm" className="gap-2">
                        <Wallet size={15} /> Manage delegation <ArrowRight size={14} />
                      </Button>
                    </Link>
                  }
                >
                  <EarningsStrip
                    rateLabel="Delegation APY"
                    ratePct={settledRate(rewards.rates.delegation_annual_pct)}
                    positionLabel="Delegated to FlareForward"
                    positionAmount={delegatedWflr}
                    positionUnit="WFLR"
                    claimableReward={delegation.claimableReward}
                    emptyMessage="No WFLR from this wallet is delegated to FlareForward."
                  />
                </RewardSection>

                <RewardSection
                  title="Staking"
                  description="Your FLR staked with FlareForward, staking rewards claimable now, and soonest unlock."
                  action={
                    <Link to="/staking">
                      <Button variant="outline" size="sm" className="gap-2">
                        <Landmark size={15} /> Manage staking <ArrowRight size={14} />
                      </Button>
                    </Link>
                  }
                >
                  {staking.pEnabled ? (
                    <div className="space-y-3">
                      <EarningsStrip
                        rateLabel="Staking APY"
                        ratePct={settledRate(rewards.rates.staking_annual_pct)}
                        positionLabel="Staked with FlareForward"
                        positionAmount={stakedWithUs}
                        positionUnit="FLR"
                        claimableReward={staking.claimableReward}
                        emptyMessage="No active P-chain stake from this wallet is delegated to FlareForward."
                      />
                      <SoonestUnlock stake={soonestUnlock} />
                    </div>
                  ) : (
                    <Card>
                      <CardContent className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <RateTile
                              label="Staking APY"
                              value={fmtPct(settledRate(rewards.rates.staking_annual_pct))}
                              accent={settledRate(rewards.rates.staking_annual_pct) != null}
                            />
                            <RateTile
                              label="Claimable now"
                              value={`${formatAmount(staking.claimableReward)} FLR`}
                              accent={staking.claimableReward > 0n}
                            />
                          </div>
                          <p className="text-sm text-[#8FA0B8]">
                            Enable P-chain staking to read your FlareForward stake and soonest unlock.
                          </p>
                        </div>
                        <Button
                          variant="action"
                          className="gap-2 md:w-auto w-full"
                          disabled={staking.busy !== null}
                          onClick={() => staking.enableP().catch(() => {})}
                        >
                          {staking.busy === "enableP" ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <>
                              <Landmark size={16} /> Enable P-chain
                            </>
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </RewardSection>

                {/* Bonds came OFF this page in the 08-13 rework when /bonds
                    was created, but the page's own copy kept promising "bond
                    holdings" — and the operator noticed the gap. Restored as a
                    third section in the same idiom as Delegation and Staking:
                    the wallet's stacks here, the full detail one click away. */}
                <RewardSection
                  title="Bonds"
                  description="Your FlareForward Bond NFTs, read straight from the lot contracts."
                  action={
                    <Link to="/bonds">
                      <Button variant="outline" size="sm" className="gap-2">
                        <Gift size={15} /> Manage bonds <ArrowRight size={14} />
                      </Button>
                    </Link>
                  }
                >
                  <MyBonds compact bare />
                </RewardSection>
                {/* The address-lookup card that sat here is gone by operator
                    call: My Rewards is about the connected wallet, and /bonds
                    carries the public lookup. Epoch basis lives on analytics,
                    not member pages. */}
              </>
            )}

            <p className="text-[11px] text-[#8FA0B8]">
              Figures come from the FlareForward rewards hooks, Flare RPC, and the
              lot contracts — read live, not cached.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function DisconnectedRewards({
  rates,
}: {
  rates: {
    delegation_annual_pct: number | null;
    staking_annual_pct: number | null;
    basis: string | null;
  };
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-[#FAFAFA]">
                Connect your wallet to see your rewards.
              </h2>
              <p className="mt-1.5 text-sm text-[#8FA0B8]">
                This page shows your delegation rewards, staking rewards, and bond holdings.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <RateTile
                label="Delegation APY"
                value={fmtPct(settledRate(rates.delegation_annual_pct))}
                accent={settledRate(rates.delegation_annual_pct) != null}
              />
              <RateTile
                label="Staking APY"
                value={fmtPct(settledRate(rates.staking_annual_pct))}
                accent={settledRate(rates.staking_annual_pct) != null}
              />
            </div>
            {/* No epoch basis on member pages — that detail lives on analytics. */}
          </div>
          <ConnectWallet size="md" />
        </div>
      </CardContent>
    </Card>
  );
}

function ClaimPanel({
  totalClaimable,
  delegationClaimable,
  stakingClaimable,
  delegationState,
  stakingState,
  busy,
  onClaimDelegation,
  onClaimStaking,
  onClaimBoth,
}: {
  totalClaimable: bigint;
  delegationClaimable: bigint;
  stakingClaimable: bigint;
  delegationState: ClaimState;
  stakingState: ClaimState;
  busy: boolean;
  onClaimDelegation: () => void;
  onClaimStaking: () => void;
  onClaimBoth: () => void;
}) {
  const hasDelegationClaim = delegationClaimable > 0n;
  const hasStakingClaim = stakingClaimable > 0n;
  const canClaimBoth = hasDelegationClaim && hasStakingClaim && !busy;

  return (
    <Card>
      <CardHeader className="border-b border-white/8 pb-4">
        <div className="flex items-center gap-2">
          <Gift size={18} className="text-[#EE1A58]" />
          <CardTitle className="text-[#FAFAFA]">Claimable now</CardTitle>
        </div>
        <CardDescription className="text-[#8FA0B8]">
          What you've earned and can take right now. Delegation and staking pay from separate
          contracts, so claiming both is two confirmations rather than one.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-[#8FA0B8]">Total claimable</div>
            <div className="mt-1 text-3xl font-bold tabular-nums text-emerald-400">
              {formatAmount(totalClaimable)} <span className="text-base text-[#8FA0B8]">FLR</span>
            </div>
            {totalClaimable === 0n && (
              <p className="mt-2 text-sm text-[#8FA0B8]">
                Nothing to claim at this moment. Delegation rewards accrue every reward epoch
                and land here when the epoch closes — nothing is lost in the meantime.
              </p>
            )}
          </div>
          {hasDelegationClaim && hasStakingClaim ? (
            <Button
              variant="action"
              className="gap-2 lg:w-auto w-full"
              disabled={!canClaimBoth}
              onClick={onClaimBoth}
            >
              {busy && hasDelegationClaim && hasStakingClaim ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Gift size={16} />
              )}
              Claim both
            </Button>
          ) : totalClaimable > 0n ? (
            <p className="text-sm text-[#8FA0B8]">
              Only one source has rewards right now; use its claim button below.
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <ClaimItem
            title="Delegation rewards"
            amount={delegationClaimable}
            state={delegationState}
            disabled={busy && delegationState !== "claiming"}
            onClaim={onClaimDelegation}
          />
          <ClaimItem
            title="Staking rewards"
            amount={stakingClaimable}
            state={stakingState}
            disabled={busy && stakingState !== "claiming"}
            onClaim={onClaimStaking}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function ClaimItem({
  title,
  amount,
  state,
  disabled,
  onClaim,
}: {
  title: string;
  amount: bigint;
  state: ClaimState;
  disabled: boolean;
  onClaim: () => void;
}) {
  const canClaim = amount > 0n && state !== "claiming";
  const status = state === "failed" ? "Claim failed. You can retry this source." : null;

  return (
    <div className="glass-panel p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <div className="text-sm font-semibold text-[#FAFAFA]">{title}</div>
        <div className="mt-1 text-xl font-bold tabular-nums text-[#FAFAFA]">
          {formatAmount(amount)} <span className="text-sm text-[#8FA0B8]">FLR</span>
        </div>
        {amount === 0n ? (
          <p className="mt-1 text-xs text-[#8FA0B8]">Nothing claimable from this source.</p>
        ) : status ? (
          <p className="mt-1 text-xs text-red-400">{status}</p>
        ) : state === "claimed" ? (
          <p className="mt-1 text-xs text-emerald-400">Claim submitted.</p>
        ) : null}
      </div>
      {amount > 0n && (
        <Button
          variant="action"
          size="sm"
          className="gap-2 sm:w-auto w-full"
          disabled={disabled || !canClaim}
          onClick={onClaim}
        >
          {state === "claiming" ? (
            <Loader2 size={15} className="animate-spin" />
          ) : state === "claimed" ? (
            <CheckCircle2 size={15} />
          ) : state === "failed" ? (
            <XCircle size={15} />
          ) : (
            <Gift size={15} />
          )}
          {state === "failed" ? "Retry claim" : "Claim"}
        </Button>
      )}
    </div>
  );
}

function RewardSection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-[#FAFAFA]">{title}</h2>
          <p className="mt-1 text-sm text-[#8FA0B8]">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function RateTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="glass-panel px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-[#8FA0B8]">{label}</div>
      <div
        className={`mt-1 text-xl font-bold tabular-nums ${
          accent ? "text-emerald-400" : "text-[#FAFAFA]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function SoonestUnlock({ stake }: { stake: DisplayStake | null }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="glass-panel px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#FAFAFA]">
            <Clock size={16} className="text-[#EE1A58]" />
            Soonest unlock
          </div>
          <div className="text-sm text-[#8FA0B8]">
            {stake
              ? `${formatFlr(stake.amount)} FLR unlocks ${fmtDate(Number(stake.endTime))}`
              : "No active FlareForward stake has a future unlock."}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function totalStakedWithNode(stakes: DisplayStake[], nodeId: string | null): bigint {
  if (!nodeId) return 0n;
  return stakes
    .filter((stake) => stake.nodeId === nodeId)
    .reduce((sum, stake) => sum + stake.amount, 0n);
}

function soonestFutureStake(stakes: DisplayStake[], nodeId: string | null): DisplayStake | null {
  if (!nodeId) return null;
  const nowSecs = BigInt(Math.floor(Date.now() / 1000));
  return stakes
    .filter((stake) => stake.nodeId === nodeId && stake.endTime > nowSecs)
    .reduce<DisplayStake | null>(
      (soonest, stake) => (!soonest || stake.endTime < soonest.endTime ? stake : soonest),
      null
    );
}

function formatAmount(wei: bigint, digits = 0): string {
  return Number(formatUnits(wei, 18)).toLocaleString(undefined, {
    maximumFractionDigits: digits,
  });
}
