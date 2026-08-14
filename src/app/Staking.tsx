import { useEffect, useMemo, useState } from "react";
import { settledRate } from "../lib/rewards";
import { parseUnits } from "viem";
import {
  Server,
  Wallet,
  Info,
  Loader2,
  ArrowRightLeft,
  Gift,
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
  formatFlrPlain,
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
          basis={rewards?.rates.basis}
          emptyMessage="Stake FLR with FlareForward when you're ready."
        />
      )}

      {/* Your stakes — always visible once enabled, so users can see who they
          are staked to without searching the validator list again. */}
      {isConnected && pEnabled && (
        <YourStakes
          stakes={stakes}
          ourNodeId={ourNodeId}
          ourFeePct={selectedValidator?.delegationFeePct ?? null}
          totalStaked={balance.stakedOnP}
          fetching={stakesFetching}
          onchainFailed={stakesOnchainFailed}
          onRefresh={refetchStakes}
        />
      )}

      <div className="max-w-2xl">
        {/* Staking action panel */}
        <div>
          <Card>
            <CardHeader className="border-b border-white/8 pb-4">
              <CardTitle className="text-[#FAFAFA]">Stake on the P-chain</CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-6">
                  {/* Rewards */}
                  <div className="pt-4 border-t border-white/8 space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[#8FA0B8] flex items-center gap-2">
                        <Gift size={14} /> Claimable rewards
                      </span>
                      <span className="text-[#FAFAFA] font-medium">
                        {formatFlr(claimableReward)} FLR
                      </span>
                    </div>
                    <Button
                      variant="secondary"
                      className="w-full gap-2"
                      disabled={busy !== null || claimableReward <= 0n}
                      onClick={() => claimRewards()}
                    >
                      {busy === "claim" ? (
                        <Loader2 className="animate-spin" size={16} />
                      ) : (
                        <>
                          <Gift size={16} /> Claim staking rewards
                        </>
                      )}
                    </Button>
                  </div>
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
                    variant="primary"
                    className="w-full py-6 text-base font-semibold"
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
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-[#FAFAFA]">
                      <ArrowRightLeft size={14} className="text-[#8FA0B8]" />
                      <span>Move FLR</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[#8FA0B8] shrink-0">Wallet</span>
                        <span className="text-[#FAFAFA] font-medium tabular-nums truncate">
                          {formatFlr(balance.availableOnC)}
                        </span>
                        <button
                          onClick={() => {
                            setAmount(formatFlrPlain(balance.availableOnC));
                            setIntent("toP");
                          }}
                          className="text-[#EE1A58] hover:underline shrink-0"
                        >
                          MAX
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[#8FA0B8] shrink-0">P-chain</span>
                        <span className="text-[#FAFAFA] font-medium tabular-nums truncate">
                          {formatFlr(balance.availableOnP)}
                        </span>
                        <button
                          onClick={() => {
                            setAmount(formatFlrPlain(balance.availableOnP));
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
                      <Button
                        variant={intent === "toP" ? "primary" : "secondary"}
                        className="w-full"
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
                        variant={intent === "toC" ? "primary" : "secondary"}
                        className="w-full"
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

                  {/* P-chain: what is staked, directly above the stake form. */}
                  <div className="pt-4 border-t border-white/8 space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[#8FA0B8]">Currently staked</span>
                      <span className="text-[#FAFAFA] font-medium">
                        {formatFlr(balance.stakedOnP)} FLR
                      </span>
                    </div>
                    {!selectedValidator ? (
                      <div className="text-center py-4 text-[#8FA0B8] flex flex-col items-center">
                        <Server size={28} className="mb-2 opacity-20" />
                        <p className="text-sm">Loading the FlareForward validator…</p>
                      </div>
                    ) : (
                      <>
                        {/* The FlareForward card next to this panel already
                            carries the branding — keep only the numbers here. */}
                        <div className="glass-panel p-3 flex items-center justify-between text-xs text-[#8FA0B8]">
                          <span>Fee {selectedValidator.delegationFeePct.toFixed(2)}%</span>
                          {effectiveCapacity !== null && (
                            <span>Open capacity {formatFlr(effectiveCapacity, 0)} FLR</span>
                          )}
                        </div>

                        {/* Amount */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-[#8FA0B8]">Amount to stake</span>
                            <button
                              onClick={() => setStakeAmount(formatFlrPlain(balance.availableOnP))}
                              className="text-xs text-[#EE1A58] hover:underline"
                            >
                              MAX
                            </button>
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
                          {limits && (
                            <div className="text-xs text-[#8FA0B8]">
                              Minimum {formatFlr(limits.minStakeAmountDelegator, 0)} FLR
                            </div>
                          )}
                        </div>

                        {/* Duration */}
                        <div className="space-y-2">
                          <span className="text-sm text-[#8FA0B8]">Stake duration</span>
                          {durationOptions.length === 0 ? (
                            <div className="text-xs text-yellow-500">
                              This validator has no window long enough for a new stake.
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {durationOptions.map((opt) => (
                                <button
                                  key={opt.label}
                                  onClick={() => setDurationSecs(opt.seconds)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                    durationSecs === opt.seconds
                                      ? "border-[#EE1A58] text-[#EE1A58] bg-[#EE1A58]/15 glass-glow"
                                      : "border-white/10 text-[#8FA0B8] hover:text-[#FAFAFA] hover:bg-white/5"
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {(amountError || capacityError) && stakeAmount && (
                          <div className="text-xs text-red-400">
                            {amountError ?? capacityError}
                          </div>
                        )}

                        <div className="bg-[#EE1A58]/10 border border-[#EE1A58]/20 rounded-lg p-3 flex gap-3 text-sm">
                          <Info size={16} className="text-[#EE1A58] shrink-0 mt-0.5" />
                          <div className="text-[#FAFAFA]">
                            Staked FLR is locked for the chosen duration. When the stake ends the
                            FLR returns to your P-chain balance, ready to move back to your wallet.
                          </div>
                        </div>

                        {!confirming ? (
                          <Button
                            variant="primary"
                            className="w-full py-6 text-base font-semibold"
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
                                variant="primary"
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
  ourFeePct,
  totalStaked,
  fetching,
  onchainFailed,
  onRefresh,
}: {
  stakes: DisplayStake[];
  ourNodeId: string | null;
  ourFeePct: number | null;
  totalStaked: bigint;
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
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xs text-[#8FA0B8]">Total staked</div>
              <div className="text-sm font-semibold text-[#FAFAFA]">
                {formatFlr(totalStaked, 0)} FLR
              </div>
            </div>
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
        <CardDescription className="text-[#8FA0B8]">
          Validators you are currently staked to
        </CardDescription>
      </CardHeader>
      <div className="divide-y divide-white/8">
        {stakes.length === 0 && (
          <div className="p-6 text-center text-sm text-[#8FA0B8]">
            {fetching
              ? "Loading your stakes from the P-chain..."
              : "No active stakes yet. Stake to a validator below to get started."}
          </div>
        )}
        {stakes.map((s) => {
          const isUs = ourNodeId != null && s.nodeId === ourNodeId;
          const fee = isUs ? (ourFeePct ?? undefined) : undefined;
          const unlocked = Number(s.endTime) <= nowSecs;
          return (
            <div
              key={s.key}
              className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
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
                  {isUs ? (
                    <div className="text-sm text-[#FAFAFA] font-medium truncate">FlareForward</div>
                  ) : (
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
                  <div className="text-sm font-semibold text-[#FAFAFA]">
                    {formatFlr(s.amount, 0)} FLR
                  </div>
                  <div className="text-xs text-[#8FA0B8] capitalize">{s.type}</div>
                </div>
                <Badge variant={s.pending ? "outline" : unlocked ? "dark" : "success"}>
                  {s.pending ? "Pending" : unlocked ? "Unlocked" : "Active"}
                </Badge>
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
      <Button variant="secondary" className="w-full" disabled={disabled} onClick={onFinish}>
        {finishing ? (
          <Loader2 className="animate-spin" size={16} />
        ) : (
          `Finish import to ${target}`
        )}
      </Button>
    </div>
  );
}
