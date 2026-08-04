import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./Card";
import {
  fmtFlrCompact,
  fmtPct,
  type RewardsData,
} from "../../lib/rewards";

/**
 * Latest-epoch reward breakdown — where FlareForward's rewards actually came
 * from, in the same buckets the Flare Systems Explorer grades (delegation /
 * staking / direct / fees / self-bond). Our layout, full information density.
 */
export function RewardsBreakdown({ rewards }: { rewards: RewardsData }) {
  const b = rewards.breakdown;
  const r = rewards.rates;

  const rows: Array<{ label: string; note: string; value: number | null }> = [
    {
      label: "Delegation rewards",
      note: "Paid to WFLR delegators",
      value: b.delegation_flr,
    },
    {
      label: "Staking rewards",
      note: "Paid to P-chain stakers (MIRROR)",
      value: b.staking_flr,
    },
    {
      label: "Direct rewards",
      note: "Direct protocol claims",
      value: b.direct_flr,
    },
    {
      label: "Self-bond earnings",
      note: "Earned on our own 1M FLR bond",
      value: b.self_bond_flr,
    },
    {
      label: "Provider fees",
      note: `Our ${fmtPct(rewards.fee_pct, 0)} fee across pools`,
      value: b.fees_flr,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Rewards Breakdown
          {b.reward_epoch != null && (
            <span className="ml-2 text-sm font-medium text-[#8FA0B8]">
              Epoch {b.reward_epoch}
            </span>
          )}
        </CardTitle>
        <CardDescription>
          Where the latest reward epoch's earnings came from, straight from the
          Flare Systems Explorer indexer.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between glass-panel px-4 py-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[#FAFAFA]">{row.label}</div>
                <div className="text-xs text-[#8FA0B8] truncate">{row.note}</div>
              </div>
              <div className="text-sm font-bold tabular-nums text-[#FAFAFA] shrink-0 pl-4">
                {fmtFlrCompact(row.value)}{" "}
                <span className="text-xs font-medium text-[#8FA0B8]">FLR</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="glass-panel px-4 py-3">
            <div className="text-[11px] uppercase tracking-wider text-[#8FA0B8]">
              Delegation rate / epoch
            </div>
            <div className="text-lg font-bold text-emerald-400 tabular-nums">
              {fmtPct(r.delegation_epoch_pct, 4)}
            </div>
          </div>
          <div className="glass-panel px-4 py-3">
            <div className="text-[11px] uppercase tracking-wider text-[#8FA0B8]">
              Staking rate / epoch
            </div>
            <div className="text-lg font-bold text-emerald-400 tabular-nums">
              {fmtPct(r.staking_epoch_pct, 4)}
            </div>
          </div>
        </div>

        <p className="mt-3 text-[11px] text-[#8FA0B8]">
          Rate basis: {r.basis}. Source: Flare Systems Explorer.
        </p>
      </CardContent>
    </Card>
  );
}
