import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useAccount } from "wagmi";
import { Search, Loader2, Wallet, Landmark, ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./Card";
import { Button } from "./Button";
import { usePosition } from "../../hooks/usePosition";
import { RewardEpochChart } from "./RewardEpochChart";
import {
  daysLeft,
  fmtDate,
  fmtFlr,
  fmtPct,
  shortPAddress,
  type RewardsData,
} from "../../lib/rewards";

/**
 * "Your Position" — the reason a delegator bookmarks OUR page. Paste any
 * address (or connect a wallet) and see exactly where you stand with
 * FlareForward: what you've delegated or staked, what's claimable, and what
 * that earns at our current reward rates. All reads are public chain/indexer
 * state; no connection or signature required.
 */
export function YourPosition({
  rewards,
  compact = false,
}: {
  rewards: RewardsData | null;
  compact?: boolean;
}) {
  const { address: connectedAddress } = useAccount();
  const [input, setInput] = useState("");
  const [submitted, setSubmitted] = useState("");

  // Prefill (and auto-check) with the connected wallet, but never clobber an
  // address the visitor typed themselves.
  useEffect(() => {
    if (!compact && connectedAddress && !input && !submitted) {
      setInput(connectedAddress);
      setSubmitted(connectedAddress);
    }
  }, [compact, connectedAddress]); // eslint-disable-line react-hooks/exhaustive-deps

  const { kind, position, isLoading, error } = usePosition(submitted, rewards);

  const delegationApy = rewards?.rates.delegation_annual_pct ?? null;
  const stakingApy = rewards?.rates.staking_annual_pct ?? null;

  function check() {
    setSubmitted(input);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{compact ? "Address lookup" : "Your Position"}</CardTitle>
        <CardDescription>
          {compact
            ? "Check another C-chain (0x…) or P-chain (P-flare…) address. Read-only; no signature ever requested."
            : "See where you stand with FlareForward — paste your C-chain (0x…) or P-chain (P-flare…) address, or connect your wallet. Read-only; no signature ever requested."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex items-center gap-2 glass-panel px-3 py-2 flex-1 focus-within:border-[#EE1A58]/60 transition-colors">
            <Search size={16} className="text-[#8FA0B8] shrink-0" />
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && check()}
              placeholder="0x… or P-flare1…"
              spellCheck={false}
              className="bg-transparent border-none outline-none text-sm w-full placeholder:text-[#8FA0B8] text-[#FAFAFA] font-mono"
              aria-label="Address to check"
            />
          </div>
          <Button variant="primary" size="sm" onClick={check} disabled={!input.trim()}>
            Check standing
          </Button>
        </div>

        {submitted && kind === "invalid" && (
          <p className="mt-3 text-sm text-amber-400">
            That doesn't look like a Flare C-chain (0x…) or P-chain (P-flare…)
            address.
          </p>
        )}

        {isLoading && (
          <div className="mt-4 flex items-center gap-2 text-sm text-[#8FA0B8]">
            <Loader2 size={16} className="animate-spin" /> Reading on-chain
            position…
          </div>
        )}

        {error && !isLoading && (
          <p className="mt-3 text-sm text-red-400">
            Couldn't read that address right now — try again in a moment.
          </p>
        )}

        {position?.kind === "cchain" && !isLoading && (
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label="WFLR balance" value={`${fmtFlr(position.wflr, 2)}`} />
              <Stat
                label="Delegated to us"
                value={
                  position.ffSharePct > 0
                    ? `${fmtFlr(position.ffDelegatedWflr, 2)} WFLR`
                    : "0"
                }
                sub={
                  position.ffSharePct > 0
                    ? `${fmtPct(position.ffSharePct, 0)} of your vote power`
                    : undefined
                }
                accent={position.ffSharePct > 0}
              />
              <Stat
                label="Claimable rewards"
                value={`${fmtFlr(position.claimableFlr, 2)} FLR`}
                accent={position.claimableFlr > 0}
              />
              <Stat
                label="At the current rate"
                value={
                  delegationApy != null && position.ffDelegatedWflr > 0
                    ? `${fmtFlr((position.ffDelegatedWflr * delegationApy) / 100, 1)} FLR per year`
                    : "—"
                }
                sub={
                  delegationApy != null
                    ? `${fmtPct(delegationApy)} current rate`
                    : undefined
                }
              />
            </div>

            {position.ffSharePct === 0 && (
              <div className="glass-panel px-4 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                <div className="text-sm text-[#8FA0B8]">
                  {position.wflr > 0 && delegationApy != null ? (
                    <>
                      You're not delegating to FlareForward yet. At the current rate,{" "}
                      {fmtFlr(position.wflr, 0)} WFLR corresponds to{" "}
                      <span className="text-emerald-400 font-semibold">
                        {fmtFlr((position.wflr * delegationApy) / 100, 0)} FLR per year
                      </span>.
                    </>
                  ) : (
                    <>
                      You're not delegating to FlareForward yet — wrap FLR and
                      delegate in two clicks.
                    </>
                  )}
                </div>
                <Link to="/delegation" className="shrink-0">
                  <Button variant="primary" size="sm" className="gap-2">
                    <Wallet size={15} /> Delegate now <ArrowRight size={14} />
                  </Button>
                </Link>
              </div>
            )}

            {/* Per-epoch unclaimed rewards, live from the RewardManager. */}
            <RewardEpochChart address={submitted} />

            {position.ffSharePct > 0 && (
              <div className="flex flex-wrap gap-2">
                <Link to="/delegation">
                  <Button variant="outline" size="sm" className="gap-2">
                    <Wallet size={15} /> Manage delegation
                  </Button>
                </Link>
                <Link to="/staking">
                  <Button variant="outline" size="sm" className="gap-2">
                    <Landmark size={15} /> Stake on the P-chain too
                  </Button>
                </Link>
              </div>
            )}
          </div>
        )}

        {position?.kind === "pchain" && !isLoading && (
          <div className="mt-5">
            {position.found && position.stake ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <Stat
                    label="Staked with our validator"
                    value={`${fmtFlr(position.stake.stake_flr, 0)} FLR`}
                    accent
                  />
                  <Stat
                    label="At the current rate"
                    value={
                      stakingApy != null && position.stake.stake_flr != null
                        ? `${fmtFlr((position.stake.stake_flr * stakingApy) / 100, 0)} FLR per year`
                        : "—"
                    }
                    sub={
                      stakingApy != null
                        ? `${fmtPct(stakingApy)} current rate`
                        : undefined
                    }
                  />
                  <Stat label="Started" value={fmtDate(position.stake.start_unix)} />
                  <Stat
                    label="Ends"
                    value={fmtDate(position.stake.end_unix)}
                    sub={
                      daysLeft(position.stake.end_unix) != null
                        ? `${daysLeft(position.stake.end_unix)}d left`
                        : undefined
                    }
                  />
                </div>
                <p className="text-[11px] text-[#8FA0B8]">
                  At the current rate uses the latest epoch's staking reward rate,
                  annualized. Actual rewards vary epoch to epoch.
                </p>
              </div>
            ) : (
              <div className="glass-panel px-4 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                <div className="text-sm text-[#8FA0B8]">
                  No active stake from {shortPAddress(position.address)} on our
                  validator. Stake FLR on the P-chain and earn at{" "}
                  {stakingApy != null && (
                    <span className="text-emerald-400 font-semibold">
                      {fmtPct(stakingApy)}
                    </span>
                  )}{" "}
                  current rate.
                </div>
                <Link to="/staking" className="shrink-0">
                  <Button variant="primary" size="sm" className="gap-2">
                    <Landmark size={15} /> Stake now <ArrowRight size={14} />
                  </Button>
                </Link>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="glass-panel px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-[#8FA0B8]">{label}</div>
      <div
        className={`text-lg font-bold tabular-nums ${
          accent ? "text-emerald-400" : "text-[#FAFAFA]"
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-[#8FA0B8] mt-0.5">{sub}</div>}
    </div>
  );
}
