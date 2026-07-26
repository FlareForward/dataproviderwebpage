import { Server } from "lucide-react";
import { Card, CardContent } from "./Card";
import { useValidatorStaking } from "../../hooks/useValidatorStaking";

/** Compact FLR amount: 1_305_990 -> "1.31M FLR". null -> em dash. */
function flr(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B FLR`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M FLR`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(2)}K FLR`;
  return `${v.toFixed(0)} FLR`;
}

function pct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${v.toFixed(digits)}%`;
}

function count(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : v.toLocaleString();
}

function Tile({
  title,
  value,
  sub,
}: {
  title: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card className="glass-card-hover">
      <CardContent className="p-5">
        <div className="text-sm font-medium text-[#8FA0B8]">{title}</div>
        <div className="mt-2 text-2xl font-bold tracking-tight text-[#FAFAFA]">
          {value}
        </div>
        <div className="mt-2 text-xs font-medium text-[#8FA0B8]">
          {sub ?? "\u00A0"}
        </div>
      </CardContent>
    </Card>
  );
}

export function ValidatorStaking() {
  const { data, isLoading, error } = useValidatorStaking();

  if (error) {
    return (
      <div className="glass-panel border-red-500/30 p-6 text-center text-red-400">
        Failed to load validator staking: {error.message}
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="glass-panel p-8 text-center text-[#8FA0B8]">
        Loading validator staking…
      </div>
    );
  }

  if (!data.has_validator) {
    return (
      <div className="glass-panel flex flex-col items-center gap-2 p-8 text-center text-[#8FA0B8]">
        <Server size={22} className="text-[#EE1A58]" />
        <p className="font-medium text-[#FAFAFA]">No active validator</p>
        <p className="text-sm">
          Flare Forward has no registered validator for the current reward
          epoch.
        </p>
      </div>
    );
  }

  const r = data.rewards;

  return (
    <section aria-labelledby="staking-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#EE1A58]/10 text-[#EE1A58]">
            <Server size={18} />
          </div>
          <div>
            <h2
              id="staking-heading"
              className="text-[1.25rem] font-semibold tracking-tight text-[#FAFAFA]"
            >
              Validator Staking
            </h2>
            <p className="mt-0.5 text-[0.8125rem] text-[#8FA0B8]">
              Flare Forward's P-chain validator — stake, capacity, and staking
              rewards from the Flare Systems Explorer.
            </p>
          </div>
        </div>
        {data.node_id ? (
          <span
            className="rounded-md bg-white/5 px-2.5 py-1 font-mono text-[11px] text-[#8FA0B8]"
            title={data.node_id}
          >
            {data.node_id.slice(0, 12)}…{data.node_id.slice(-4)}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Tile
          title="Total Stake"
          value={flr(data.total_stake_flr)}
          sub={`${flr(data.self_bond_flr)} self-bond · ${flr(
            data.delegated_flr,
          )} delegated`}
        />
        <Tile
          title="Capacity Used"
          value={pct(data.capacity_used_pct)}
          sub={`${flr(data.total_stake_flr)} of ${flr(data.capacity_flr)}`}
        />
        <Tile
          title="Delegators"
          value={count(data.delegators_count)}
          sub="P-chain stake delegations"
        />
        <Tile title="Staking Fee" value={pct(data.fee_pct)} sub="Charged to delegators" />
        <Tile
          title="Staking Rewards"
          value={flr(r.total_flr)}
          sub={
            r.reward_epoch != null
              ? `Reward epoch ${r.reward_epoch} · ${flr(
                  r.self_bond_earnings_flr,
                )} self-bond`
              : undefined
          }
        />
        <Tile
          title="Reward Rate"
          value={pct(r.reward_rate_annual_pct)}
          sub={
            r.reward_rate_epoch_pct != null
              ? `${pct(r.reward_rate_epoch_pct, 3)} per epoch · annualized`
              : undefined
          }
        />
      </div>
    </section>
  );
}
