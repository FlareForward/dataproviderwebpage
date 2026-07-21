import { useEffect, useMemo, useState } from "react";
import { parseUnits } from "viem";
import {
  Server,
  Search,
  CheckCircle2,
  Wallet,
  Info,
  Loader2,
  XCircle,
  ArrowRightLeft,
  Gift,
  Download,
  ShieldCheck,
  Layers,
  Clock,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./components/Card";
import { Button } from "./components/Button";
import { Badge } from "./components/Badge";
import { ConnectWallet } from "./components/ConnectWallet";
import { useStaking } from "../hooks/useStaking";
import {
  buildDurationOptions,
  formatFlr,
  shortNodeId,
  validateStakeAmount,
  type DisplayStake,
  type DurationOption,
  type ValidatorRow,
} from "../lib/staking";

export function Staking() {
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
    stake,
    claimRewards,
    withdrawToC,
    getValidatorCapacity,
    refetchStakes,
  } = useStaking();

  const [query, setQuery] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [moveAmount, setMoveAmount] = useState("");
  const [stakeAmount, setStakeAmount] = useState("");
  const [durationSecs, setDurationSecs] = useState<bigint | null>(null);
  const [capacity, setCapacity] = useState<bigint | null>(null);
  const [confirming, setConfirming] = useState(false);

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

  const q = query.trim().toLowerCase();
  const filtered = validators.filter((v) => v.nodeId.toLowerCase().includes(q));

  const amountWei = (() => {
    try {
      return stakeAmount ? parseUnits(stakeAmount, 18) : 0n;
    } catch {
      return 0n;
    }
  })();

  const amountError =
    limits && stakeAmount ? validateStakeAmount(amountWei, limits, balance.availableOnP) : null;
  const capacityError =
    capacity !== null && amountWei > capacity
      ? `Exceeds validator's remaining capacity of ${formatFlr(capacity, 0)} FLR.`
      : null;
  const canStake =
    !!selectedValidator &&
    !!durationSecs &&
    amountWei > 0n &&
    !amountError &&
    !capacityError &&
    busy === null;

  function selectValidator(nodeId: string) {
    setConfirming(false);
    setSelectedNodeId((prev) => (prev === nodeId ? null : nodeId));
  }

  async function handleEnable() {
    try {
      await enableP();
    } catch {
      /* toast already shown */
    }
  }

  async function handleMove() {
    try {
      await moveToP(moveAmount);
      setMoveAmount("");
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
      {/* Your stakes — always visible once enabled, so users can see who they
          are staked to without searching the validator list again. */}
      {isConnected && pEnabled && (
        <YourStakes
          stakes={stakes}
          validators={validators}
          totalStaked={balance.stakedOnP}
          fetching={stakesFetching}
          onchainFailed={stakesOnchainFailed}
          onRefresh={refetchStakes}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Validator list */}
        <Card className="col-span-1 lg:col-span-2 bg-[#243552] border-[#2E3F56]">
          <CardHeader className="border-b border-[#2E3F56] pb-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <CardTitle className="text-[#FAFAFA]">Available Validators</CardTitle>
                <CardDescription className="text-[#8FA0B8]">
                  Stake FLR on the P-chain by delegating to a validator node
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 bg-[#1C2D47] border border-[#2E3F56] rounded-md px-3 py-1.5 focus-within:border-[#EE1A58] transition-colors w-full sm:w-auto">
                <Search size={16} className="text-[#8FA0B8]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  type="text"
                  placeholder="Search by NodeID..."
                  className="bg-transparent border-none outline-none text-sm w-full placeholder:text-[#8FA0B8] text-[#FAFAFA]"
                />
              </div>
            </div>
          </CardHeader>
          <div className="divide-y divide-[#2E3F56] max-h-[560px] overflow-y-auto">
            {validatorsLoading && validators.length === 0 && (
              <div className="p-8 text-center text-[#8FA0B8] text-sm">Loading validators...</div>
            )}
            {!validatorsLoading && filtered.length === 0 && (
              <div className="p-8 text-center text-[#8FA0B8] text-sm">
                {validators.length === 0 ? "No validators found." : `No validators match "${query}".`}
              </div>
            )}
            {filtered.map((v) => {
              const isSel = v.nodeId === selectedNodeId;
              const disabled = !v.acceptsDelegations;
              return (
                <div
                  key={v.nodeId}
                  onClick={() => !disabled && selectValidator(v.nodeId)}
                  className={`p-4 flex items-center justify-between transition-colors ${
                    disabled
                      ? "opacity-40 cursor-not-allowed"
                      : "cursor-pointer hover:bg-[#2E3F56]/30"
                  } ${isSel ? "bg-[#EE1A58]/10" : ""}`}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center border overflow-hidden shrink-0 ${
                        isSel ? "border-[#EE1A58]" : "border-[#2E3F56]"
                      } bg-[#1D2430]`}
                    >
                      <Server size={18} className={isSel ? "text-[#EE1A58]" : "text-[#8FA0B8]"} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-[#FAFAFA] flex items-center gap-2">
                        <span className="font-mono truncate" title={v.nodeId}>
                          {shortNodeId(v.nodeId)}
                        </span>
                        {isSel && <CheckCircle2 size={14} className="text-[#EE1A58] shrink-0" />}
                      </div>
                      <div className="text-sm text-[#8FA0B8] flex items-center gap-3 mt-1 flex-wrap">
                        <span>Self-bond: {v.selfBondLabel} FLR</span>
                        <span className="w-1 h-1 rounded-full bg-[#2E3F56]" />
                        <span>Fee: {v.delegationFeePct.toFixed(2)}%</span>
                        <span className="w-1 h-1 rounded-full bg-[#2E3F56]" />
                        <span>Ends: {v.endDate.toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <Badge variant={disabled ? "dark" : "success"}>
                    {disabled ? "Ending soon" : "Accepting"}
                  </Badge>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Staking action panel */}
        <div className="col-span-1">
          <Card className="bg-[#243552] border-[#2E3F56] sticky top-24">
            <CardHeader className="border-b border-[#2E3F56] pb-4">
              <CardTitle className="text-[#FAFAFA]">Stake on the P-chain</CardTitle>
              <CardDescription className="text-[#8FA0B8]">
                Delegate FLR to a validator to earn staking rewards
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 space-y-6">
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
                    P-chain staking needs your public key. Sign a message once to enable it — this
                    does not move any funds.
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
                  {/* Balances */}
                  <div className="grid grid-cols-3 gap-2">
                    <BalanceTile label="C-chain" value={formatFlr(balance.availableOnC)} />
                    <BalanceTile label="P-chain" value={formatFlr(balance.availableOnP)} />
                    <BalanceTile label="Staked" value={formatFlr(balance.stakedOnP)} />
                  </div>

                  {/* Move FLR to P-chain */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[#8FA0B8] flex items-center gap-2">
                        <ArrowRightLeft size={14} /> Move FLR to P-chain
                      </span>
                      <button
                        onClick={() => setMoveAmount(formatFlr(balance.availableOnC, 6))}
                        className="text-xs text-[#EE1A58] hover:underline"
                      >
                        MAX
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        value={moveAmount}
                        onChange={(e) => setMoveAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-[#1C2D47] border border-[#2E3F56] rounded-md py-3 px-4 text-[#FAFAFA] text-lg focus:outline-none focus:border-[#EE1A58] transition-colors pr-16"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8FA0B8] font-medium">
                        FLR
                      </span>
                    </div>
                    <Button
                      variant="secondary"
                      className="w-full"
                      disabled={busy !== null || !moveAmount || Number(moveAmount) <= 0}
                      onClick={handleMove}
                    >
                      {busy === "moveToP" ? (
                        <Loader2 className="animate-spin" size={16} />
                      ) : (
                        "Move to P-chain"
                      )}
                    </Button>
                  </div>

                  {/* Stake form */}
                  <div className="pt-4 border-t border-[#2E3F56] space-y-3">
                    {!selectedValidator ? (
                      <div className="text-center py-4 text-[#8FA0B8] flex flex-col items-center">
                        <Server size={28} className="mb-2 opacity-20" />
                        <p className="text-sm">Select a validator from the list to stake.</p>
                      </div>
                    ) : (
                      <>
                        <div className="bg-[#1C2D47] rounded-lg p-3 border border-[#2E3F56]">
                          <div className="text-xs text-[#8FA0B8] mb-1">Selected validator</div>
                          <div className="font-mono text-sm text-[#FAFAFA] break-all">
                            {shortNodeId(selectedValidator.nodeId, 10)}
                          </div>
                          <div className="text-xs text-[#8FA0B8] mt-1">
                            Fee {selectedValidator.delegationFeePct.toFixed(2)}%
                            {capacity !== null && (
                              <> · Capacity {formatFlr(capacity, 0)} FLR</>
                            )}
                          </div>
                        </div>

                        {/* Amount */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-[#8FA0B8]">Amount to stake</span>
                            <button
                              onClick={() => setStakeAmount(formatFlr(balance.availableOnP, 6))}
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
                              placeholder="0.00"
                              className="w-full bg-[#1C2D47] border border-[#2E3F56] rounded-md py-3 px-4 text-[#FAFAFA] text-lg focus:outline-none focus:border-[#EE1A58] transition-colors pr-16"
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
                                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                                    durationSecs === opt.seconds
                                      ? "border-[#EE1A58] text-[#EE1A58] bg-[#EE1A58]/10"
                                      : "border-[#2E3F56] text-[#8FA0B8] hover:text-[#FAFAFA]"
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
                            FLR returns to your P-chain balance, ready to withdraw back to the
                            C-chain.
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
                              <span className="font-mono">{shortNodeId(selectedValidator.nodeId)}</span>?
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

                  {/* Rewards + withdraw */}
                  <div className="pt-4 border-t border-[#2E3F56] space-y-3">
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
                    <Button
                      variant="ghost"
                      className="w-full gap-2"
                      disabled={busy !== null || balance.availableOnP <= 0n}
                      onClick={() => withdrawToC()}
                    >
                      {busy === "withdraw" ? (
                        <Loader2 className="animate-spin" size={16} />
                      ) : (
                        <>
                          <Download size={16} /> Withdraw P-chain balance to C-chain
                        </>
                      )}
                    </Button>
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

function YourStakes({
  stakes,
  validators,
  totalStaked,
  fetching,
  onchainFailed,
  onRefresh,
}: {
  stakes: DisplayStake[];
  validators: ValidatorRow[];
  totalStaked: bigint;
  fetching: boolean;
  onchainFailed: boolean;
  onRefresh: () => void;
}) {
  const feeByNode = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of validators) map.set(v.nodeId, v.delegationFeePct);
    return map;
  }, [validators]);

  const nowSecs = Math.floor(Date.now() / 1000);

  return (
    <Card className="bg-[#243552] border-[#2E3F56]">
      <CardHeader className="border-b border-[#2E3F56] pb-4">
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
      <div className="divide-y divide-[#2E3F56]">
        {stakes.length === 0 && (
          <div className="p-6 text-center text-sm text-[#8FA0B8]">
            {fetching
              ? "Loading your stakes from the P-chain..."
              : "No active stakes yet. Stake to a validator below to get started."}
          </div>
        )}
        {stakes.map((s) => {
          const fee = feeByNode.get(s.nodeId);
          const unlocked = Number(s.endTime) <= nowSecs;
          return (
            <div
              key={s.key}
              className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-10 h-10 rounded-full flex items-center justify-center border border-[#2E3F56] bg-[#1D2430] shrink-0">
                  <Server size={18} className="text-[#8FA0B8]" />
                </div>
                <div className="min-w-0">
                  <div className="font-mono text-sm text-[#FAFAFA] truncate" title={s.nodeId}>
                    {shortNodeId(s.nodeId, 10)}
                  </div>
                  <div className="text-xs text-[#8FA0B8] flex items-center gap-3 mt-1 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {unlocked ? "Unlocked" : "Unlocks"}{" "}
                      {new Date(Number(s.endTime) * 1000).toLocaleDateString()}
                    </span>
                    {fee !== undefined && (
                      <>
                        <span className="w-1 h-1 rounded-full bg-[#2E3F56]" />
                        <span>Fee {fee.toFixed(2)}%</span>
                      </>
                    )}
                    <span className="w-1 h-1 rounded-full bg-[#2E3F56]" />
                    <span>Since {new Date(Number(s.startTime) * 1000).toLocaleDateString()}</span>
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
        <div className="px-4 py-3 border-t border-[#2E3F56] text-xs text-[#8FA0B8] flex items-center gap-2">
          <Info size={12} className="shrink-0" />
          Showing stakes recorded on this device. The P-chain is busy right now — use refresh to
          reconcile with on-chain data.
        </div>
      )}
    </Card>
  );
}

function BalanceTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#1C2D47] rounded-lg p-3 border border-[#2E3F56]">
      <div className="text-xs text-[#8FA0B8] mb-1">{label}</div>
      <div className="font-medium text-[#FAFAFA] text-sm truncate" title={value}>
        {value}
      </div>
    </div>
  );
}
