import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import {
  ArrowRight,
  CheckCircle2,
  Gem,
  Gift,
  Landmark,
  Loader2,
  Wallet,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/Card";
import { Button } from "./components/Button";
import { useReadContracts } from "wagmi";
import { ConnectWallet } from "./components/ConnectWallet";
import { EarningsStrip } from "./components/EarningsStrip";
import { RewardHistory } from "./components/RewardHistory";
import { bondLotAbi, CURRENT_LOT, type BondTier } from "../lib/bondLot";
import { useDelegation } from "../hooks/useDelegation";
import { useRewards } from "../hooks/useRewards";
import { useStaking } from "../hooks/useStaking";
import { settledRate, fmtPct, fmtFlrWei } from "../lib/rewards";
import { type DisplayStake } from "../lib/staking";


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
                  address={delegation.address}
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
                  description="Your FLR staked with FlareForward and staking rewards claimable now."
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
                      {/* Soonest-unlock came off the glance page with the rest
                          of the per-position detail — every stake's unlock now
                          rides its own life bar on /staking. */}
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
                              value={`${fmtFlrWei(staking.claimableReward)} FLR`}
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

                {/* Bonds do NOT get their own section — the operator pared it
                    twice: first the card grid, then the titled section. One
                    slim row in the Soonest-unlock idiom, everything about the
                    bonds in a single line, detail one click away on /bonds. */}
                <BondsGlance
                  address={delegation.address ?? undefined}
                  stagedRatePct={settledRate(rewards.rates.delegation_annual_pct)}
                />
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
  address,
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
  address: `0x${string}` | undefined;
}) {
  const hasDelegationClaim = delegationClaimable > 0n;
  const hasStakingClaim = stakingClaimable > 0n;
  const canClaimBoth = hasDelegationClaim && hasStakingClaim && !busy;

  return (
    <Card>
      {/* The title and the headline number share one row. They used to sit in
          two stacked bands — a header block, then a separate 70px band for
          "Total claimable" — which made this card more than twice the height of
          the sections under it and threw the whole page's vertical rhythm out. */}
      <CardHeader className="border-b border-white/8 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Gift size={18} className="text-[#EE1A58]" />
              <CardTitle className="text-[#FAFAFA]">Claimable now</CardTitle>
            </div>
            <CardDescription className="text-[#8FA0B8]">
              Delegation and staking pay from separate contracts, so claiming both is two
              confirmations.
            </CardDescription>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div className="sm:text-right">
              <div className="text-[11px] uppercase tracking-wider text-[#8FA0B8]">
                Total claimable
              </div>
              <div className="text-3xl font-bold tabular-nums text-emerald-400">
                {fmtFlrWei(totalClaimable)} <span className="text-base text-[#8FA0B8]">FLR</span>
              </div>
            </div>
            {hasDelegationClaim && hasStakingClaim && (
              <Button
                variant="action"
                className="gap-2"
                disabled={!canClaimBoth}
                onClick={onClaimBoth}
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Gift size={16} />}
                Claim both
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-5 space-y-4">
        {/* items-stretch + h-full on the child: the two source cards hold the
            same height whatever their state, so the amounts share a baseline
            instead of one card floating above the other. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch">
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

        {/* Accumulated payouts live here as one line + a button, not a tile. */}
        <RewardHistory address={address} />
      </CardContent>
    </Card>
  );
}

/**
 * One reward source. Structurally identical whether or not it has money in it —
 * same rows, same button, same height — because the previous version dropped
 * the button on an empty source and swapped one line of copy for another, which
 * is exactly what made the pair sit crooked next to each other.
 */
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
  const status =
    state === "failed"
      ? { text: "Claim failed. You can retry this source.", tone: "text-red-400" }
      : state === "claimed"
        ? { text: "Claim submitted.", tone: "text-emerald-400" }
        : amount === 0n
          ? { text: "Nothing claimable from this source.", tone: "text-[#8FA0B8]" }
          : { text: "Ready to claim.", tone: "text-[#8FA0B8]" };

  return (
    <div className="glass-panel h-full p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <div className="text-sm font-semibold text-[#FAFAFA]">{title}</div>
        <div
          className={`mt-1 text-xl font-bold tabular-nums ${
            amount > 0n ? "text-emerald-400" : "text-[#FAFAFA]"
          }`}
        >
          {fmtFlrWei(amount)} <span className="text-sm font-normal text-[#8FA0B8]">FLR</span>
        </div>
        <p className={`mt-1 text-xs ${status.tone}`}>{status.text}</p>
      </div>
      <Button
        variant="action"
        size="sm"
        className="gap-2 sm:w-auto w-full shrink-0"
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
        {state === "failed" ? "Retry" : "Claim"}
      </Button>
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

/**
 * Bonds at a glance — deliberately no artwork and no per-tier cards. This page
 * answers "what is everything earning" in one sweep; the gallery and per-bond
 * detail live on /bonds. The count comes from the same balanceOf reads MyBonds
 * makes, minus everything visual. Claimable is a hard 0 until a lot closes and
 * its distribution contract exists; the section description says why.
 */
function BondsGlance({
  address,
  stagedRatePct,
}: {
  address: `0x${string}` | undefined;
  stagedRatePct: number | null;
}) {
  const tiers = CURRENT_LOT.tiers.filter(
    (t): t is BondTier & { address: `0x${string}` } => !!t.address
  );
  const { data } = useReadContracts({
    contracts: tiers.map((t) => ({
      address: t.address,
      abi: bondLotAbi,
      functionName: "balanceOf" as const,
      args: [address ?? "0x0000000000000000000000000000000000000000"] as const,
    })),
    query: { enabled: !!address && tiers.length > 0 },
  });
  const held = (data ?? []).reduce(
    (sum, r) => sum + Number((r?.result as bigint | undefined) ?? 0n),
    0
  );

  return (
    <Card>
      <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-[#FAFAFA]">
          <Gem size={15} className="text-[#EE1A58]" /> Bonds
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[#8FA0B8]">
          <span className="tabular-nums font-medium text-[#FAFAFA]">{held}</span> held ·
          <span className="flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            <span className="font-medium text-emerald-400">{fmtPct(stagedRatePct)}</span> while
            staged
          </span>
          · 0 FLR claimable
          <Link to="/bonds" className="ml-1 font-medium text-[#E85A95] hover:underline">
            Manage →
          </Link>
        </span>
      </CardContent>
    </Card>
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

function totalStakedWithNode(stakes: DisplayStake[], nodeId: string | null): bigint {
  if (!nodeId) return 0n;
  return stakes
    .filter((stake) => stake.nodeId === nodeId)
    .reduce((sum, stake) => sum + stake.amount, 0n);
}
