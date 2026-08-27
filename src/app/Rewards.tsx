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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./components/Card";
import { Button } from "./components/Button";
import { useReadContracts } from "wagmi";
import { ConnectWallet } from "./components/ConnectWallet";
import { EarningsStrip } from "./components/EarningsStrip";
import { RewardHistory } from "./components/RewardHistory";
import { bondLotAbi, CURRENT_LOT, type BondTier } from "../lib/bondLot";
import { useDelegation } from "../hooks/useDelegation";
import { useEarned } from "../hooks/useEarned";
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
  const [claimState, setClaimState] = useState<Record<ClaimSource, ClaimState>>(
    {
      delegation: "idle",
      staking: "idle",
    },
  );

  const isConnected = delegation.isConnected || staking.isConnected;
  const ffDelegationAddress =
    rewards?.delegation_address?.toLowerCase() ?? FLAREFORWARD_ADDRESS;
  const delegatedWflr = useMemo(() => {
    const delegatedBips =
      delegation.currentDelegations.find(
        (d) => d.address.toLowerCase() === ffDelegationAddress,
      )?.bips ?? 0;
    return (delegation.wflrBalance * BigInt(delegatedBips)) / 10_000n;
  }, [
    delegation.currentDelegations,
    delegation.wflrBalance,
    ffDelegationAddress,
  ]);

  const stakedWithUs = useMemo(
    () => totalStakedWithNode(staking.stakes, rewards?.node_id ?? null),
    [staking.stakes, rewards?.node_id],
  );
  const earned = useEarned(delegation.address, {
    delegationWei: delegation.claimableReward,
    stakingWei: staking.claimableReward,
    claimableReady:
      delegation.claimableRewardReady && staking.claimableRewardReady,
  });
  const bondsClaimable = earned.data?.claimable.bondsWei;
  const totalClaimable =
    delegation.claimableReward +
    staking.claimableReward +
    (bondsClaimable ?? 0n);
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
      source === "delegation"
        ? delegation.claimableReward
        : staking.claimableReward;
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
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
              My Rewards
            </h1>
            <p className="text-[#8FA0B8] text-sm mt-1">
              Thank you for backing FlareForward. Here's what your wallet has
              earned, and what's ready to claim.
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
                  bondsClaimable={bondsClaimable}
                  bondsLoading={earned.isLoading}
                  delegationState={
                    delegation.busy === "claim"
                      ? "claiming"
                      : claimState.delegation
                  }
                  stakingState={
                    staking.busy === "claim" ? "claiming" : claimState.staking
                  }
                  busy={claimBusy}
                  onClaimDelegation={() => claimSource("delegation")}
                  onClaimStaking={() => claimSource("staking")}
                  onClaimBoth={claimBoth}
                  address={delegation.address}
                  claimableReady={earned.data?.claimableReady === true}
                  claimableLoading={
                    earned.isLoading ||
                    delegation.claimableRewardLoading ||
                    staking.claimableRewardLoading
                  }
                  claimableError={
                    !!earned.error ||
                    delegation.claimableRewardError ||
                    staking.claimableRewardError
                  }
                />

                <RewardSection
                  title="Delegation"
                  description="Your WFLR delegated to FlareForward and delegation rewards claimable now."
                  action={
                    <Link to="/delegation">
                      <Button variant="outline" size="sm" className="gap-2">
                        <Wallet size={15} /> Manage delegation{" "}
                        <ArrowRight size={14} />
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
                        <Landmark size={15} /> Manage staking{" "}
                        <ArrowRight size={14} />
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
                              value={fmtPct(
                                settledRate(rewards.rates.staking_annual_pct),
                              )}
                              accent={
                                settledRate(rewards.rates.staking_annual_pct) !=
                                null
                              }
                            />
                            <RateTile
                              label="Claimable now"
                              value={`${fmtFlrWei(staking.claimableReward)} FLR`}
                              accent={staking.claimableReward > 0n}
                            />
                          </div>
                          <p className="text-sm text-[#8FA0B8]">
                            Enable P-chain staking to read your FlareForward
                            stake and soonest unlock.
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

                <BondsSection
                  address={delegation.address ?? undefined}
                  stagedRatePct={settledRate(
                    rewards.rates.delegation_annual_pct,
                  )}
                  earnedBondsWei={earned.data?.earned.bondsWei}
                  earnedLoading={earned.isLoading}
                />
                {/* The address-lookup card that sat here is gone by operator
                    call: My Rewards is about the connected wallet, and /bonds
                    carries the public lookup. Epoch basis lives on analytics,
                    not member pages. */}
              </>
            )}

            <p className="text-[11px] text-[#8FA0B8]">
              Figures come from the FlareForward rewards hooks, Flare RPC, and
              the lot contracts — read live, not cached.
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
                This page shows your delegation rewards, staking rewards, and
                bond holdings.
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
  bondsClaimable,
  bondsLoading,
  delegationState,
  stakingState,
  busy,
  onClaimDelegation,
  onClaimStaking,
  onClaimBoth,
  address,
  claimableReady,
  claimableLoading,
  claimableError,
}: {
  totalClaimable: bigint;
  delegationClaimable: bigint;
  stakingClaimable: bigint;
  bondsClaimable: bigint | null | undefined;
  bondsLoading: boolean;
  delegationState: ClaimState;
  stakingState: ClaimState;
  busy: boolean;
  onClaimDelegation: () => void;
  onClaimStaking: () => void;
  onClaimBoth: () => void;
  address: `0x${string}` | undefined;
  claimableReady: boolean;
  claimableLoading: boolean;
  claimableError: boolean;
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
              Delegation and staking pay from separate contracts, so claiming
              both is two confirmations.
            </CardDescription>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div className="sm:text-right">
              <div className="text-[11px] uppercase tracking-wider text-[#8FA0B8]">
                Total claimable
              </div>
              <div className="text-3xl font-bold tabular-nums text-emerald-400">
                {fmtFlrWei(totalClaimable)}{" "}
                <span className="text-base text-[#8FA0B8]">FLR</span>
              </div>
            </div>
            {hasDelegationClaim && hasStakingClaim && (
              <Button
                variant="action"
                className="gap-2"
                disabled={!canClaimBoth}
                onClick={onClaimBoth}
              >
                {busy ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Gift size={16} />
                )}
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-stretch">
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
          {/* Three holdings, three claim cards, three sections below — the
              panel mirrors the page. Bonds pay through Jon's distribution
              contract, which has nothing in it until a lot closes, so this
              card states the condition rather than reading as a broken zero.
              It stays inert until the lots are registered in the on-chain
              CollectionRegistry; see BondsSection. */}
          <ClaimItem
            title="Bond distributions"
            amount={bondsClaimable}
            state="idle"
            disabled
            onClaim={() => {}}
            pending={bondsLoading}
            emptyNote="not tracked yet"
          />
        </div>

        {/* Accumulated payouts live here as one line + a button, not a tile. */}
        <RewardHistory
          address={address}
          claimable={{
            delegationWei: delegationClaimable,
            stakingWei: stakingClaimable,
            claimableReady,
          }}
          claimableLoading={claimableLoading}
          claimableError={claimableError}
        />
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
  emptyNote,
  pending,
}: {
  title: string;
  amount: bigint | null | undefined;
  state: ClaimState;
  disabled: boolean;
  onClaim: () => void;
  /** Replaces the generic zero-state line when a source is 0 for a reason. */
  emptyNote?: string;
  pending?: boolean;
}) {
  const hasAmount = typeof amount === "bigint";
  const canClaim = hasAmount && amount > 0n && state !== "claiming";
  const status =
    state === "failed"
      ? {
          text: "Claim failed. You can retry this source.",
          tone: "text-red-400",
        }
      : state === "claimed"
        ? { text: "Claim submitted.", tone: "text-emerald-400" }
        : pending || amount === undefined
          ? { text: "Reading this source.", tone: "text-[#8FA0B8]" }
          : amount === null
            ? { text: emptyNote ?? "not tracked yet", tone: "text-[#8FA0B8]" }
            : amount === 0n
              ? {
                  text: emptyNote ?? "Nothing claimable from this source.",
                  tone: "text-[#8FA0B8]",
                }
              : { text: "Ready to claim.", tone: "text-[#8FA0B8]" };

  return (
    <div className="glass-panel h-full p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <div className="text-sm font-semibold text-[#FAFAFA]">{title}</div>
        <div
          className={`mt-1 text-xl font-bold tabular-nums ${
            hasAmount && amount > 0n ? "text-emerald-400" : "text-[#FAFAFA]"
          }`}
        >
          {pending || amount === undefined
            ? "—"
            : amount === null
              ? "not tracked yet"
              : fmtFlrWei(amount)}{" "}
          {hasAmount && (
            <span className="text-sm font-normal text-[#8FA0B8]">FLR</span>
          )}
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
          <h2 className="text-xl font-semibold tracking-tight text-[#FAFAFA]">
            {title}
          </h2>
          <p className="mt-1 text-sm text-[#8FA0B8]">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * Bonds, as a peer of Delegation and Staking.
 *
 * This was twice pared down to a one-line strip, and twice that left the third
 * thing a member can hold reading as an afterthought next to two full sections
 * — a 52px strip beside two 168px blocks. Restored by operator call to the same
 * shape as the others: heading, manage action, four tiles on the same 104px
 * grid, so all three holdings answer "what is this earning" identically.
 *
 * Staged capital is derived, not hardcoded: balanceOf x mintPrice per tier,
 * both read from the lot contracts. Bond payouts stay "not tracked yet" until
 * a RoyaltyDistributor lands in the worker LOTS registry.
 */
function BondsSection({
  address,
  stagedRatePct,
  earnedBondsWei,
  earnedLoading,
}: {
  address: `0x${string}` | undefined;
  stagedRatePct: number | null;
  earnedBondsWei: bigint | null | undefined;
  earnedLoading: boolean;
}) {
  const tiers = CURRENT_LOT.tiers.filter(
    (t): t is BondTier & { address: `0x${string}` } => !!t.address,
  );

  const { data } = useReadContracts({
    contracts: tiers.flatMap((t) => [
      {
        address: t.address,
        abi: bondLotAbi,
        functionName: "balanceOf" as const,
        args: [
          address ?? "0x0000000000000000000000000000000000000000",
        ] as const,
      },
      {
        address: t.address,
        abi: bondLotAbi,
        functionName: "mintPrice" as const,
      },
    ]),
    query: { enabled: !!address && tiers.length > 0 },
  });

  // Reads come back as [balanceOf, mintPrice] per tier, in tier order.
  let held = 0;
  let stagedWei = 0n;
  tiers.forEach((_, i) => {
    const balance = (data?.[i * 2]?.result as bigint | undefined) ?? 0n;
    const price = (data?.[i * 2 + 1]?.result as bigint | undefined) ?? 0n;
    held += Number(balance);
    stagedWei += balance * price;
  });

  const annualWei =
    stagedRatePct != null && Number.isFinite(stagedRatePct)
      ? (stagedWei * BigInt(Math.round(stagedRatePct * 100))) / 10_000n
      : null;

  return (
    <RewardSection
      title="Bonds"
      description="Your FlareForward Bonds and what they earn while the capital is staged."
      action={
        <Link to="/bonds">
          <Button variant="outline" size="sm" className="gap-2">
            <Gem size={15} /> Manage bonds <ArrowRight size={14} />
          </Button>
        </Link>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 items-stretch">
        <BondStat
          label="Bond rate"
          value={fmtPct(stagedRatePct)}
          sub="while staged"
          accent={stagedRatePct != null}
        />
        <BondStat label="Bonds held" value={`${held}`} sub="your position" />
        <BondStat
          label="What we've earned you"
          value={
            earnedLoading || earnedBondsWei === undefined
              ? "—"
              : earnedBondsWei === null
                ? "not tracked yet"
                : `${fmtFlrWei(earnedBondsWei, 2)} FLR`
          }
          sub={
            earnedBondsWei == null
              ? "distribution contract pending"
              : "claimed plus claimable"
          }
        />
        <BondStat
          label="At the current rate"
          value={annualWei != null ? `${fmtFlrWei(annualWei)} FLR` : "—"}
          sub="per year, projection"
        />
      </div>
    </RewardSection>
  );
}

/** Same tile as the earnings strip, so all three sections share one grid. */
function BondStat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div className="glass-panel h-full px-4 py-3 flex flex-col">
      <div className="min-h-[2.4em] text-[11px] uppercase leading-[1.2] tracking-wider text-[#8FA0B8]">
        {label}
      </div>
      <div
        className={`mt-1 text-xl font-bold tabular-nums ${
          accent ? "text-emerald-400" : "text-[#FAFAFA]"
        }`}
      >
        {value}
      </div>
      <div className="mt-1 text-xs text-[#8FA0B8]">{sub}</div>
    </div>
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
      <div className="text-[11px] uppercase tracking-wider text-[#8FA0B8]">
        {label}
      </div>
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

function totalStakedWithNode(
  stakes: DisplayStake[],
  nodeId: string | null,
): bigint {
  if (!nodeId) return 0n;
  return stakes
    .filter((stake) => stake.nodeId === nodeId)
    .reduce((sum, stake) => sum + stake.amount, 0n);
}
