import { Link } from "react-router";
import {
  Loader2,
  ShieldCheck,
  Wallet,
  Landmark,
  ArrowRight,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Card, CardContent } from "./components/Card";
import { Button } from "./components/Button";
import { YourPosition } from "./components/YourPosition";
import { MyBonds } from "./components/MyBonds";
import { RewardsBreakdown } from "./components/RewardsBreakdown";
import { useRewards } from "../hooks/useRewards";
import { fmtFlrCompact, fmtPct } from "../lib/rewards";

/**
 * /rewards — FlareForward's sales page. One job: show why delegating or
 * staking with us is worth it (real, sourced numbers only) and let a visitor
 * check their own standing without leaving our site.
 */
export default function Rewards() {
  const { data: rewards, isLoading, error } = useRewards();

  const conditions = rewards?.conditions;
  const allConditions = [
    { label: "FTSO price feeds", ok: conditions?.ftso_scaling },
    { label: "Fast updates", ok: conditions?.ftso_fast_updates },
    { label: "Staking", ok: conditions?.staking },
    { label: "Data connector (FDC)", ok: conditions?.fdc },
  ];

  return (
    <div className="p-4 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Rewards</h1>
            <p className="text-[#8FA0B8] text-sm mt-1">
              What delegating and staking with FlareForward earns — and where
              you stand.
            </p>
          </div>
          {rewards?.eligible_for_reward != null && (
            <div className="flex items-center gap-2.5 glass-panel px-3.5 py-2 self-start sm:self-auto">
              <ShieldCheck
                size={16}
                className={rewards.eligible_for_reward ? "text-emerald-400" : "text-amber-400"}
              />
              <span className="text-xs font-semibold text-[#FAFAFA]">
                {rewards.eligible_for_reward
                  ? "Reward-eligible this epoch"
                  : "Eligibility pending"}
              </span>
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
            {/* Headline rates — the pitch */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <HeroStat
                label="Delegation APY"
                value={fmtPct(rewards.rates.delegation_annual_pct)}
                sub="WFLR delegators, current rate"
                emphasize
              />
              <HeroStat
                label="Staking APY"
                value={fmtPct(rewards.rates.staking_annual_pct)}
                sub="P-chain stakers, current rate"
                emphasize
              />
              <HeroStat
                label="Availability"
                value={fmtPct(rewards.uptime_availability_pct, 2)}
                sub="FTSO submission uptime"
              />
              <HeroStat
                label="Fee"
                value={fmtPct(rewards.fee_pct, 2)}
                sub="Flat provider fee"
              />
            </div>

            {/* Vote power + capacity strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <HeroStat
                label="Delegated vote power"
                value={`${fmtFlrCompact(rewards.vote_power.delegation_flr)} FLR`}
                sub="WFLR delegated to us"
              />
              <HeroStat
                label="Staked with validator"
                value={`${fmtFlrCompact(rewards.staking.total_stake_flr)} FLR`}
                sub={`incl. our ${fmtFlrCompact(rewards.staking.self_bond_flr)} FLR self-bond`}
              />
              <HeroStat
                label="Validator space left"
                value={`${fmtFlrCompact(rewards.staking.space_left_flr)} FLR`}
                sub="Room for new stake"
              />
              <HeroStat
                label="Latest reward epoch"
                value={
                  rewards.latest_reward_epoch != null
                    ? `#${rewards.latest_reward_epoch}`
                    : "—"
                }
                sub="Explorer-graded"
              />
            </div>

            {/* Your Position — the reason to come back */}
            <YourPosition rewards={rewards} />

            {/* Bond NFTs held by this wallet, read from the lot contracts. */}
            <MyBonds compact />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <RewardsBreakdown rewards={rewards} />

              {/* Why FlareForward */}
              <Card>
                <CardContent className="space-y-4">
                  <div>
                    <h3 className="text-[1.25rem] font-semibold tracking-tight">
                      Why delegate to FlareForward?
                    </h3>
                    <p className="text-sm text-[#8FA0B8] mt-1.5">
                      Every protocol the network grades us on, we pass — checked
                      live from the Flare Systems Explorer.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {allConditions.map((c) => (
                      <div
                        key={c.label}
                        className="glass-panel px-3 py-2.5 flex items-center gap-2"
                      >
                        {c.ok ? (
                          <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                        ) : c.ok === false ? (
                          <XCircle size={15} className="text-red-400 shrink-0" />
                        ) : (
                          <Loader2 size={15} className="text-[#8FA0B8] shrink-0" />
                        )}
                        <span className="text-xs font-medium text-[#FAFAFA]">
                          {c.label}
                        </span>
                      </div>
                    ))}
                  </div>

                  <ul className="space-y-2 text-sm text-[#8FA0B8]">
                    <li>
                      • <span className="text-[#FAFAFA] font-medium">Skin in the game:</span>{" "}
                      {fmtFlrCompact(rewards.staking.self_bond_flr)} FLR of our
                      own capital self-bonded on the validator.
                    </li>
                    <li>
                      • <span className="text-[#FAFAFA] font-medium">Non-custodial:</span>{" "}
                      delegation and staking never move your funds — your keys
                      stay in your wallet.
                    </li>
                    <li>
                      • <span className="text-[#FAFAFA] font-medium">Everything on one page:</span>{" "}
                      check your standing above any time — no third-party
                      dashboard needed.
                    </li>
                  </ul>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Link to="/delegation">
                      <Button variant="primary" size="sm" className="gap-2">
                        <Wallet size={15} /> Delegate WFLR <ArrowRight size={14} />
                      </Button>
                    </Link>
                    <Link to="/staking">
                      <Button variant="outline" size="sm" className="gap-2">
                        <Landmark size={15} /> Stake on P-chain
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>

            <p className="text-[11px] text-[#8FA0B8]">
              All figures sourced live from the Flare Systems Explorer indexer
              and Flare RPC. Rate basis: {rewards.rates.basis}. Rates vary epoch
              to epoch and are not a guarantee of future rewards.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function HeroStat({
  label,
  value,
  sub,
  emphasize,
}: {
  label: string;
  value: string;
  sub?: string;
  emphasize?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-[11px] uppercase tracking-wider text-[#8FA0B8]">{label}</div>
        <div
          className={`mt-1 font-bold tabular-nums ${
            emphasize ? "text-3xl text-emerald-400" : "text-2xl text-[#FAFAFA]"
          }`}
        >
          {value}
        </div>
        {sub && <div className="text-xs text-[#8FA0B8] mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}
