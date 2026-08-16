import { Loader2 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import { useRewardHistory } from "../../hooks/useRewardHistory";

/**
 * "Your rewards by epoch" — per-epoch unclaimed FTSO rewards for the checked
 * address, read live from the RewardManager. Renders nothing when the address
 * has no pending epochs (already claimed, or not delegating yet), so it never
 * shows a broken empty state inside Your Position.
 */
export function RewardEpochChart({ address }: { address: string }) {
  const { epochs, isLoading } = useRewardHistory(address);

  if (isLoading) {
    return (
      <div className="mt-4 glass-panel p-4 flex items-center gap-2 text-sm text-[#8FA0B8]">
        <Loader2 size={14} className="animate-spin" /> Reading your reward epochs from the chain…
      </div>
    );
  }
  if (epochs.length === 0) return null;

  return (
    <div className="mt-4 glass-panel p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-sm font-semibold text-[#FAFAFA]">Your rewards by epoch</h4>
        <span className="text-[11px] text-[#8FA0B8]">
          Unclaimed epochs, live from the RewardManager
        </span>
      </div>
      <div className="h-[180px] mt-3">
        <ResponsiveContainer width="100%" height={180} minWidth={0}>
          <BarChart data={epochs} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2E3F56" vertical={false} />
            <XAxis
              dataKey="epoch"
              stroke="#8FA0B8"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(e) => `#${e}`}
            />
            <YAxis
              stroke="#8FA0B8"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) =>
                Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })
              }
            />
            <RechartsTooltip
              contentStyle={{
                backgroundColor: "#1C2D47",
                borderColor: "#2E3F56",
                borderRadius: "8px",
                color: "#FAFAFA",
              }}
              itemStyle={{ color: "#FAFAFA" }}
              formatter={(v: number) => [
                `${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })} FLR`,
                "Reward",
              ]}
              labelFormatter={(e) => `Reward epoch #${e}`}
            />
            <Bar dataKey="amountFlr" fill="#EE1A58" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[11px] text-[#8FA0B8]">
        Epochs you've already claimed (or that expired) no longer appear here —
        this is the pending pot, not lifetime earnings.
      </p>
    </div>
  );
}
