import { useEffect, useMemo, useState } from "react";
import { settledRate } from "../lib/rewards";
import { formatUnits, parseUnits } from "viem";
import {
  Server,
  Wallet,
  Info,
  Loader2,
  ArrowRightLeft,
  ShieldCheck,
  Layers,
  Clock,
  RefreshCw,
  Landmark,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./components/Card";
import { Button } from "./components/Button";
import { Badge } from "./components/Badge";
import { ConnectWallet } from "./components/ConnectWallet";
import { EarningsStrip } from "./components/EarningsStrip";
import { ImageWithFallback } from "./components/figma/ImageWithFallback";
import { useStaking } from "../hooks/useStaking";
import { useValidatorStaking } from "../hooks/useValidatorStaking";
import { useRewards } from "../hooks/useRewards";
import logoImage from "../imports/flareforward_logo.png";
import {
  buildDurationOptions,
  formatFlr,
  formatFlrInput,
  shortNodeId,
  validateStakeAmount,
  validateTransferAmount,
  type DisplayStake,
  type DurationOption,
  type ValidatorRow,
} from "../lib/staking";

/** How long until a stake unlocks, in the units someone actually thinks in. */
function countdownTo(endTime: bigint): string {
  const secs = Number(endTime) - Math.floor(Date.now() / 1000);
  if (secs <= 0) return "0 days";
  const days = Math.floor(secs / 86_400);
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"}`;
  const hours = Math.max(1, Math.floor(secs / 3_600));
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

export function Staking() {
  const { data: rewards } = useRewards();
  const {
    isConnected,
    pEnabled,
    balance,
    limits,
    validators,
    validatorsLoading,
    stakes,
    stakesFetching,
    stakesOnchainFailed,
    claimableReward,
    busy,
    enableP,
    moveToP,
    importToP,
    importToC,
    stake,
    claimRewards,
    withdrawToC,
    getValidatorCapacity,
    refetchStakes,
  } = useStaking();

  // FlareForward's own validator node — the only staking target on this site.
  const { data: ffValidator } = useValidatorStaking();
  const ourNodeId = ffValidator?.node_id ?? null;

  const [amount, setAmount] = useState("");
  // Which way the user last signalled they want to move FLR. One input feeds
  // two buttons, so MAX has to carry intent — otherwise filling from the wallet
  // balance leaves both directions looking equally plausible.
  const [intent, setIntent] = useState<"toP" | "toC" | null>(null);
  const [stakeAmount, setStakeAmount] = useState("");
  const [durationSecs, setDurationSecs] = useState<bigint | null>(null);
  const [capacity, setCapacity] = useState<bigint | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Pinned selection: always FlareForward's node, resolved against the live
  // validator list so limits/durations/capacity come from on-chain data.
  const selectedNodeId = ourNodeId;
  const selectedValidator = useMemo(
    () => validators.find((v) => v.nodeId === selectedNodeId) ?? null,
    [validators, selectedNodeId]
  );

  const durationOptions: DurationOption[] = useMemo(() => {
    if (!limits || !selectedValidator) return [];
    return buildDurationOptions(limits, selectedValidator.endTime);
  }, [limits, selectedValidator]);

  // Reset the duration selection to the first valid preset whenever the set of
  // options changes (e.g. after picking a different validator).
  useEffect(() => {
    setDurationSecs(durationOptions[0]?.seconds ?? null);
  }, [durationOptions]);

  // Lazily fetch the remaining delegation capacity for the selected validator.
  useEffect(() => {
    let cancelled = false;
    setCapacity(null);
    if (selectedNodeId) {
      getValidatorCapacity(selectedNodeId).then((c) => {
        if (!cancelled) setCapacity(c);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [selectedNodeId, getValidatorCapacity]);

  // The SDK capacity above is the protocol-wide per-validator cap (~300M), not
  // what this node can actually accept — the node's own cap scales with its
  // self-bond and comes from the explorer. Use whichever is tighter so we never
  // advertise room the node doesn't have.
  const effectiveCapacity = useMemo(() => {
    const cap = ffValidator?.capacity_flr;
    const total = ffValidator?.total_stake_flr;
    if (cap == null || total == null) return capacity;
    const nodeSpaceLeft = parseUnits(Math.max(0, cap - total).toFixed(9), 18);
    if (capacity === null) return nodeSpaceLeft;
    return capacity < nodeSpaceLeft ? capacity : nodeSpaceLeft;
  }, [capacity, ffValidator]);

  const stakeAmountWei = (() => {
    try {
      return stakeAmount ? parseUnits(stakeAmount, 18) : 0n;
    } catch {
      return 0n;
    }
  })();
  const amountWei = (() => {
    try {
      return amount ? parseUnits(amount, 18) : 0n;
    } catch {
      return 0n;
    }
  })();

  const amountError =
    limits && stakeAmount
      ? validateStakeAmount(stakeAmountWei, limits, balance.availableOnP)
      : null;
  const toPError = amount
    ? validateTransferAmount(amountWei, balance.availableOnC, "in your wallet")
    : null;
  const toCError = amount
    ? validateTransferAmount(amountWei, balance.availableOnP, "on the P-chain")
    : null;
  const capacityError =
    effectiveCapacity !== null && stakeAmountWei > effectiveCapacity
      ? `Exceeds validator's remaining capacity of ${formatFlr(effectiveCapacity, 0)} FLR.`
      : null;
  const canStake =
    !!selectedValidator &&
    !!durationSecs &&
    stakeAmountWei > 0n &&
    !amountError &&
    !capacityError &&
    busy === null;
  const nextUnlockingStake = useMemo(() => {
    const nowSecs = BigInt(Math.floor(Date.now() / 1000));
    return stakes.reduce<DisplayStake | null>((soonest, stake) => {
      if (stake.endTime <= nowSecs) return soonest;
      return !soonest || stake.endTime < soonest.endTime ? stake : soonest;
    }, null);
  }, [stakes]);
  // Only stake held with OUR validator, because the rate shown beside it is
  // ours. Summing every stake would apply FlareForward's rate to capital
  // staked with someone else and overstate what the user actually earns here.
  const stakedWithUs = useMemo(
    () =>
      ourNodeId
        ? stakes
            .filter((stake) => stake.nodeId === ourNodeId)
            .reduce((sum, stake) => sum + stake.amount, 0n)
        : 0n,
    [stakes, ourNodeId]
  );
  const withdrawUnavailableMessage =
    balance.availableOnP === 0n
      ? nextUnlockingStake
        ? `Nothing available yet — ${formatFlr(nextUnlockingStake.amount)} FLR unlocks ${new Date(
            Number(nextUnlockingStake.endTime) * 1000
          ).toLocaleDateString()}`
        : "No FLR on the P-chain to move."
      : null;

  async function handleEnable() {
    try {
      await enableP();
    } catch {
      /* toast already shown */
    }
  }

  async function handleMove() {
    try {
      await moveToP(amount);
      setAmount("");
    } catch {
      /* toast already shown */
    }
  }

  async function handleWithdraw() {
    try {
      await withdrawToC(amount);
      setAmount("");
    } catch {
      /* toast already shown */
    }
  }

  async function handleConfirmStake() {
    if (!selectedValidator || !durationSecs) return;
    try {
      await stake({
        amountFlr: stakeAmount,
        nodeId: selectedValidator.nodeId,
        durationSecs,
        validatorEndTime: selectedValidator.endTime,
      });
      setStakeAmount("");
      setConfirming(false);
    } catch {
      /* toast already shown */
    }
  }

  return (
    <div className="space-y-6">
      {isConnected && (
        <EarningsStrip
          rateLabel="Staking APY"
          ratePct={settledRate(rewards?.rates.staking_annual_pct)}
          positionLabel="Staked with FlareForward"
          positionAmount={stakedWithUs}
          positionUnit="FLR"
          claimableReward={claimableReward}
          emptyMessage="Stake FLR with FlareForward when you're ready."
          onClaim={() => claimRewards()}
          claimBusy={busy === "claim"}
          claimLabel="Claim staking rewards"
        />
      )}

      {/* Your stakes — always visible once enabled, so users can see who they
          are staked to without searching the validator list again. */}
      {isConnected && pEnabled && (
        <YourStakes
          stakes={stakes}
          ourNodeId={ourNodeId}
          ratePct={settledRate(rewards?.rates.staking_annual_pct)}
          totalStaked={balance.stakedOnP}
          claimable={claimableReward}
          fetching={stakesFetching}
          onchainFailed={stakesOnchainFailed}
          onRefresh={refetchStakes}
        />
      )}

      {/* Full width. A max-w here made this card narrower than Your Stakes and
          the tiles above it, which is what read as cockeyed. */}
      <div>
        {/* Staking action panel */}
        <div>
          <Card>
            <CardHeader className="border-b border-white/8 pb-4">
              <CardTitle className="text-[#FAFAFA]">Stake on the P-chain</CardTitle>
              {/* Terms belong with the title, in fine print. They are context
                  for the whole panel, not a step in the stake form -- sitting
                  in the column they read like something to act on. */}
              {selectedValidator && (
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[#8FA0B8]">
                  <span>Fee {selectedValidator.delegationFeePct.toFixed(2)}%</span>
                  {effectiveCapacity !== null && (
                    <span>Open capacity {formatFlr(effectiveCapacity, 0)} FLR</span>
                  )}
                </div>
              )}
            </CardHeader>
            <CardContent className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-start">
                  {/* Claim has moved up to the hero at the top of the page --
                      money already earned is the one number here worth making
                      large, and it only belongs in one place.

                      The blocks below are placed explicitly rather than by
                      document order: the connected branch is a fragment, so its
                      children land as grid items in their own right, which
                      otherwise strands the stake form alone on a second row. */}
              {!isConnected ? (
                <div className="text-center py-8 text-[#8FA0B8] flex flex-col items-center gap-4">
                  <Wallet size={32} className="opacity-20" />
                  <p className="text-sm">Connect your wallet to stake on Flare Mainnet.</p>
                  <ConnectWallet size="md" />
                </div>
              ) : !pEnabled ? (
                <div className="text-center py-8 text-[#8FA0B8] flex flex-col items-center gap-4">
                  <ShieldCheck size={32} className="opacity-20" />
                  <p className="text-sm">
                    P-chain staking needs your account's public key. If your wallet prompts you,
                    sign the one-time message to enable it — this never moves funds or submits a
                    transaction. Wallets whose account already has on-chain activity may be enabled
                    without any prompt.
                  </p>
                  <Button
                    variant="action"
                    className="w-full"
                    disabled={busy !== null}
                    onClick={handleEnable}
                  >
                    {busy === "enableP" ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : (
                      "Enable P-chain Staking"
                    )}
                  </Button>
                </div>
              ) : (
                <>
                  {/* Transfers share one amount so either direction is always available. */}
                  <div className="space-y-3 lg:col-start-1 lg:row-start-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-[#FAFAFA]">
                      <ArrowRightLeft size={14} className="text-[#8FA0B8]" />
                      <span>Move FLR</span>
                    </div>
                    {/* min-h matches the duration-chip row opposite: the two
                        columns are built line-for-line — header, context row,
                        amount box, action — so the inputs and buttons sit
                        level. Change one row's height and change both. */}
                    <div className="grid grid-cols-2 gap-3 text-xs items-center min-h-[30px]">
                      {/* "Wallet" and "P-chain" alone read as places, not
                          balances. Name the token: someone new here does not
                          have to infer what the number is. */}
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[#8FA0B8] shrink-0">FLR in wallet</span>
                        <span className="text-[#FAFAFA] font-medium tabular-nums truncate">
                          {formatFlr(balance.availableOnC)}
                        </span>
                        <button
                          onClick={() => {
                            setAmount(formatFlrInput(balance.availableOnC));
                            setIntent("toP");
                          }}
                          className="text-[#EE1A58] hover:underline shrink-0"
                        >
                          MAX
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[#8FA0B8] shrink-0">FLR on P-chain</span>
                        <span className="text-[#FAFAFA] font-medium tabular-nums truncate">
                          {formatFlr(balance.availableOnP)}
                        </span>
                        <button
                          onClick={() => {
                            setAmount(formatFlrInput(balance.availableOnP));
                            setIntent("toC");
                          }}
                          className="text-[#EE1A58] hover:underline shrink-0"
                        >
                          MAX
                        </button>
                      </div>
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        value={amount}
                        onChange={(e) => {
                          setAmount(e.target.value);
                          setIntent(null);
                        }}
                        onWheel={(e) => e.currentTarget.blur()}
                        placeholder="0.00"
                        className="w-full glass-panel py-3 px-4 text-[#FAFAFA] text-lg focus:outline-none focus:border-[#EE1A58]/60 transition-colors pr-16"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8FA0B8] font-medium">
                        FLR
                      </span>
                    </div>
                    {amount && toPError && (
                      <div className="text-xs text-red-400">To P-chain: {toPError}</div>
                    )}
                    {amount && toCError && (
                      <div className="text-xs text-red-400">To wallet: {toCError}</div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      {/* Both directions are always available, so neither gets a
                          loud fill. The direction the typed amount implies keeps
                          a faint pink edge as a hint, nothing more. */}
                      <Button
                        variant="action"
                        className={`w-full${intent === "toP" ? " border-[#EE1A58]/45" : ""}`}
                        disabled={busy !== null || !amount || Number(amount) <= 0 || !!toPError}
                        onClick={handleMove}
                      >
                        {busy === "moveToP" ? (
                          <Loader2 className="animate-spin" size={16} />
                        ) : (
                          "To P-chain"
                        )}
                      </Button>
                      <Button
                        variant="action"
                        className={`w-full${intent === "toC" ? " border-[#EE1A58]/45" : ""}`}
                        disabled={busy !== null || !amount || Number(amount) <= 0 || !!toCError}
                        onClick={handleWithdraw}
                      >
                        {busy === "withdraw" ? (
                          <Loader2 className="animate-spin" size={16} />
                        ) : (
                          "To wallet"
                        )}
                      </Button>
                    </div>
                    {balance.availableOnP === 0n && withdrawUnavailableMessage && (
                      <p className="text-xs text-[#8FA0B8]">
                        {withdrawUnavailableMessage}
                      </p>
                    )}
                    {busy === "moveToP" && (
                      <p className="text-xs text-[#8FA0B8]">
                        This takes two wallet confirmations — export from your wallet, then import
                        to the P-chain. Approve both and keep this tab open until they complete.
                      </p>
                    )}
                    {balance.notImportedToP > 0n && (
                      <PendingImportNotice
                        amount={balance.notImportedToP}
                        target="the P-chain"
                        finishing={busy === "importToP"}
                        disabled={busy !== null}
                        onFinish={() => importToP().catch(() => {})}
                      />
                    )}
                    {busy === "withdraw" && (
                      <p className="text-xs text-[#8FA0B8]">
                        This takes two wallet confirmations — export from the P-chain, then import
                        to your wallet. Approve both and keep this tab open until they complete.
                      </p>
                    )}
                    {balance.notImportedToC > 0n && (
                      <PendingImportNotice
                        amount={balance.notImportedToC}
                        target="your wallet"
                        finishing={busy === "importToC"}
                        disabled={busy !== null}
                        onFinish={() => importToC().catch(() => {})}
                      />
                    )}
                  </div>

                  {/* "Currently staked" was the third copy of the same figure --
                      it is the tile at the top of the page and the amount on the
                      stake row. It belongs at the top, once. */}
                  <div className="space-y-3 lg:col-start-2 lg:row-start-1">
                    {!selectedValidator ? (
                      <div className="text-center py-4 text-[#8FA0B8] flex flex-col items-center">
                        <Server size={28} className="mb-2 opacity-20" />
                        <p className="text-sm">Loading the FlareForward validator…</p>
                      </div>
                    ) : (
                      <>
                        {/* Fee and capacity moved to the card header. */}
                        {/* Line-for-line with the move column: label row, then
                            duration chips beside their label (the counterpart
                            of the balances row opposite), then the amount box
                            level with the move box, then the button level with
                            the move buttons. The minimum rides in the label row
                            so nothing under the input pushes the button out of
                            line. */}
                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span className="text-[#8FA0B8]">
                            Amount to stake
                            {limits && (
                              <span className="text-xs">
                                {" "}
                                · minimum {formatFlr(limits.minStakeAmountDelegator, 0)} FLR
                              </span>
                            )}
                          </span>
                          <button
                            onClick={() => setStakeAmount(formatFlrInput(balance.availableOnP))}
                            className="text-xs text-[#EE1A58] hover:underline"
                          >
                            MAX
                          </button>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 min-h-[30px]">
                          <span className="text-xs text-[#8FA0B8]">Stake duration</span>
                          {durationOptions.length === 0 ? (
                            <span className="text-xs text-yellow-500">
                              This validator has no window long enough for a new stake.
                            </span>
                          ) : (
                            durationOptions.map((opt) => (
                              <button
                                key={opt.label}
                                onClick={() => setDurationSecs(opt.seconds)}
                                className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
                                  durationSecs === opt.seconds
                                    ? "border-[#EE1A58] text-[#EE1A58] bg-[#EE1A58]/15 glass-glow"
                                    : "border-white/10 text-[#8FA0B8] hover:text-[#FAFAFA] hover:bg-white/5"
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))
                          )}
                        </div>

                        <div className="relative">
                          <input
                            type="number"
                            value={stakeAmount}
                            onChange={(e) => setStakeAmount(e.target.value)}
                            onWheel={(e) => e.currentTarget.blur()}
                            placeholder="0.00"
                            className="w-full glass-panel py-3 px-4 text-[#FAFAFA] text-lg focus:outline-none focus:border-[#EE1A58]/60 transition-colors pr-16"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8FA0B8] font-medium">
                            FLR
                          </span>
                        </div>

                        {(amountError || capacityError) && stakeAmount && (
                          <div className="text-xs text-red-400">
                            {amountError ?? capacityError}
                          </div>
                        )}

                        {!confirming ? (
                          <Button
                            variant="action"
                            className="w-full"
                            disabled={!canStake}
                            onClick={() => setConfirming(true)}
                          >
                            Stake FLR
                          </Button>
                        ) : (
                          <div className="space-y-3">
                            <p className="text-sm text-[#FAFAFA] text-center">
                              Stake {stakeAmount} FLR to{" "}
                              <span className="font-medium">FlareForward</span>?
                            </p>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                className="flex-1"
                                disabled={busy !== null}
                                onClick={() => setConfirming(false)}
                              >
                                Cancel
                              </Button>
                              <Button
                                variant="action"
                                className="flex-1"
                                disabled={busy !== null}
                                onClick={handleConfirmStake}
                              >
                                {busy === "stake" ? (
                                  <Loader2 className="animate-spin" size={16} />
                                ) : (
                                  "Confirm"
                                )}
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* The round-trip explainer spans both columns so neither
                      runs longer than the other. It covers both halves anyway:
                      the lock is the stake side, "back to your wallet" is the
                      move side. */}
                  <div className="lg:col-span-2 lg:row-start-2 bg-[#EE1A58]/10 border border-[#EE1A58]/20 rounded-lg p-3 flex gap-3 text-sm">
                    <Info size={16} className="text-[#EE1A58] shrink-0 mt-0.5" />
                    <div className="text-[#FAFAFA]">
                      Staked FLR is locked for the chosen duration. When the stake ends the FLR
                      returns to your P-chain balance, ready to move back to your wallet.
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
 * The user's own P-chain stakes. Stakes to FlareForward are branded; stakes to
 * any other validator render as a shortened NodeID only — no other operator's
 * name, logo, or fee appears on this site.
 */
function YourStakes({
  stakes,
  ourNodeId,
  ratePct,
  totalStaked,
  claimable,
  fetching,
  onchainFailed,
  onRefresh,
}: {
  stakes: DisplayStake[];
  ourNodeId: string | null;
  /** Live staking APY — each stake shows its own output at this rate. */
  ratePct: number | null;
  totalStaked: bigint;
  claimable: bigint;
  fetching: boolean;
  onchainFailed: boolean;
  onRefresh: () => void;
}) {
  const nowSecs = Math.floor(Date.now() / 1000);

  return (
    <Card>
      <CardHeader className="border-b border-white/8 pb-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Layers size={18} className="text-[#EE1A58]" />
            <CardTitle className="text-[#FAFAFA]">Your Stakes</CardTitle>
          </div>
          {/* The totals that used to live here -- staked and earned-unclaimed --
              are already the tiles at the top of the page and the claim box
              below. Three copies of the same number is not emphasis. */}
          <div className="flex items-center gap-4">
            <button
              onClick={onRefresh}
              disabled={fetching}
              className="text-[#8FA0B8] hover:text-[#FAFAFA] transition-colors disabled:opacity-50"
              title="Refresh from chain"
              aria-label="Refresh stakes from chain"
            >
              <RefreshCw size={16} className={fetching ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
      </CardHeader>
      {/* Each stake is a position holding real money, so each renders as its
          own asset tile rather than a table row: lit edge, hover sheen, its
          own output at the current rate, and a life bar walking start to
          unlock. Someone with three stakes should see three engines. */}
      <div className="p-4 space-y-3">
        {stakes.length === 0 && (
          <div className="p-6 text-center text-sm text-[#8FA0B8]">
            {fetching
              ? "Loading your stakes from the P-chain..."
              : "No active stakes yet. Stake to a validator below to get started."}
          </div>
        )}
        {stakes.map((s) => {
          const isUs = ourNodeId != null && s.nodeId === ourNodeId;
          const unlocked = Number(s.endTime) <= nowSecs;
          const start = Number(s.startTime);
          const end = Number(s.endTime);
          // How far through its term this stake is, clamped: pending local
          // records and clock skew must never draw <0% or >100%.
          const pctDone =
            end > start
              ? Math.min(100, Math.max(0, ((nowSecs - start) / (end - start)) * 100))
              : 100;
          // This stake's own output at the live rate — a labelled restatement,
          // same idiom as the hero's "at the current rate". Rewards are paid to
          // the address, not per stake, so this is rate × principal, never a
          // claim of attribution.
          const perYear =
            !unlocked && ratePct != null
              ? Number(formatUnits(s.amount, 18)) * (ratePct / 100)
              : null;
          return (
            <div
              key={s.key}
              className={`asset-tile p-4${unlocked ? " asset-tile--ready" : ""}`}
            >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-4 min-w-0">
                {isUs ? (
                  <div className="w-10 h-10 rounded-full flex items-center justify-center border border-[#EE1A58]/40 bg-white/5 overflow-hidden shrink-0">
                    <ImageWithFallback
                      src={logoImage}
                      alt="FlareForward"
                      className="w-7 h-7 object-contain"
                    />
                  </div>
                ) : (
                  <ValidatorAvatar />
                )}
                <div className="min-w-0">
                  {/* The node id and our fee used to repeat on every row. A
                      staker knows who they staked with; what they want is when
                      it unlocks. Non-FlareForward nodes still show an id,
                      because there the id IS the identity. */}
                  {/* Our own name is not information: the logo is right there,
                      and ours is the only validator this page offers. A
                      third-party node still shows its id, because there the id
                      IS the identity. */}
                  {!isUs && (
                    <div className="font-mono text-sm text-[#FAFAFA] truncate" title={s.nodeId}>
                      {shortNodeId(s.nodeId, 10)}
                    </div>
                  )}
                  <div className="text-xs text-[#8FA0B8] flex items-center gap-1.5 mt-1">
                    <Clock size={12} />
                    {unlocked ? (
                      <span className="text-emerald-400">Unlocked — ready to withdraw</span>
                    ) : (
                      <span>
                        <span className="text-[#FAFAFA] font-medium">
                          {countdownTo(s.endTime)}
                        </span>{" "}
                        left · unlocks {new Date(Number(s.endTime) * 1000).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 sm:justify-end pl-14 sm:pl-0">
                <div className="text-right">
                  <div className="text-lg font-semibold tabular-nums text-[#FAFAFA]">
                    {formatFlr(s.amount, 0)} FLR
                  </div>
                  {perYear != null && (
                    <div className="mt-0.5 flex items-center justify-end gap-1.5 text-xs text-emerald-400">
                      <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      </span>
                      ≈ {perYear.toLocaleString(undefined, { maximumFractionDigits: 0 })} FLR /
                      yr at the current rate
                    </div>
                  )}
                </div>
                <Badge variant={s.pending ? "outline" : unlocked ? "dark" : "success"}>
                  {s.pending ? "Pending" : unlocked ? "Unlocked" : "Active"}
                </Badge>
              </div>
            </div>
            {/* The life bar: this stake walking its term, start to unlock.
                Pink while working, emerald once it is done and collectable. */}
            <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/8">
              <div
                className={`h-full rounded-full transition-all ${
                  unlocked
                    ? "bg-emerald-400/80"
                    : "bg-gradient-to-r from-[#EE1A58] to-[#E85A95]"
                }`}
                style={{ width: `${pctDone}%` }}
              />
            </div>
            </div>
          );
        })}
      </div>
      {onchainFailed && (
        <div className="px-4 py-3 border-t border-white/8 text-xs text-[#8FA0B8] flex items-center gap-2">
          <Info size={12} className="shrink-0" />
          Showing stakes recorded on this device. The P-chain is busy right now — use refresh to
          reconcile with on-chain data.
        </div>
      )}
    </Card>
  );
}

/**
 * Circular validator avatar: shows the provider logo when the node id is linked
 * to a known FTSO entity, otherwise falls back to a generic server icon. Broken
 * logo URLs also fall back to the icon.
 */
function ValidatorAvatar({
  name,
  logoURI,
  selected = false,
  size = 40,
}: {
  name?: string;
  logoURI?: string;
  selected?: boolean;
  size?: number;
}) {
  const [errored, setErrored] = useState(false);
  const showLogo = !!logoURI && !errored;
  const iconSize = Math.round(size * 0.45);
  return (
    <div
      className={`rounded-full flex items-center justify-center border overflow-hidden shrink-0 ${
        selected ? "border-[#EE1A58]" : "border-white/10"
      } bg-white/5`}
      style={{ width: size, height: size }}
    >
      {showLogo ? (
        <img
          src={logoURI}
          alt={name ?? "Validator"}
          className="w-full h-full object-cover"
          onError={() => setErrored(true)}
        />
      ) : (
        <Server size={iconSize} className={selected ? "text-[#EE1A58]" : "text-[#8FA0B8]"} />
      )}
    </div>
  );
}

/**
 * Shown when FLR is stuck between chains: the export transaction confirmed but
 * the matching import never did, so the funds appear in no balance row. One
 * click finishes the import (a single wallet confirmation).
 */
function PendingImportNotice({
  amount,
  target,
  finishing,
  disabled,
  onFinish,
}: {
  amount: bigint;
  target: "the P-chain" | "your wallet";
  finishing: boolean;
  disabled: boolean;
  onFinish: () => void;
}) {
  return (
    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 space-y-3 text-sm">
      <div className="flex gap-3">
        <Clock size={16} className="text-yellow-500 shrink-0 mt-0.5" />
        <div className="text-[#FAFAFA]">
          <span className="font-semibold">{formatFlr(amount)} FLR</span> is part-way to {target}. The
          export step confirmed, but the import step hasn't. Your FLR is safe — it just needs one
          more confirmation to land.
        </div>
      </div>
      <Button variant="action" className="w-full" disabled={disabled} onClick={onFinish}>
        {finishing ? (
          <Loader2 className="animate-spin" size={16} />
        ) : (
          `Finish import to ${target}`
        )}
      </Button>
    </div>
  );
}
