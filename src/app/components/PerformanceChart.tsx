import { useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./Card";
import {
  aggregate,
  type Granularity,
  type PerformancePoint,
} from "../../hooks/usePerformanceHistory";

type MetricKey = "uptime" | "submissions" | "band";

const METRICS: { key: MetricKey; label: string }[] = [
  { key: "uptime", label: "Uptime" },
  { key: "submissions", label: "Submissions" },
  { key: "band", label: "Band accuracy" },
];

const GRANULARITIES: { key: Granularity; label: string }[] = [
  { key: "week", label: "Weekly" },
  { key: "month", label: "Monthly" },
  { key: "year", label: "Yearly" },
];

const METRIC_DESCRIPTION: Record<MetricKey, string> = {
  uptime: "Share of epochs registered and signing uptime votes",
  submissions: "Voting rounds submitted vs. expected (participation rate)",
  band: "How often feeds land inside the on-chain reward bands",
};

/** Reusable pill toggle matching the Dashboard chart's symbol selector. */
function PillToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {options.map((opt) => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
            value === opt.key
              ? "bg-[#EE1A58] text-white glass-glow"
              : "bg-white/5 text-[#8FA0B8] hover:text-[#FAFAFA] hover:bg-white/10"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function PerformanceChart({ series }: { series: PerformancePoint[] }) {
  const [metric, setMetric] = useState<MetricKey>("uptime");
  const [granularity, setGranularity] = useState<Granularity>("week");

  const data = useMemo(
    () => aggregate(series, granularity),
    [series, granularity]
  );

  const hasMetricData = useMemo(() => {
    const keys: (keyof (typeof data)[number])[] =
      metric === "band" ? ["bandPrimary", "bandSecondary"] : [metric];
    return data.some((row) => keys.some((k) => row[k] !== null));
  }, [data, metric]);

  const showSecondary = metric === "band";

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 pb-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-[#FAFAFA]">Performance Trend</CardTitle>
          <CardDescription className="text-[#8FA0B8]">
            {METRIC_DESCRIPTION[metric]}
          </CardDescription>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <PillToggle options={METRICS} value={metric} onChange={setMetric} />
          <PillToggle
            options={GRANULARITIES}
            value={granularity}
            onChange={setGranularity}
          />
        </div>
      </CardHeader>
      <CardContent>
        {showSecondary && (
          <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] uppercase tracking-wider text-[#8FA0B8]">
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-5 rounded-[3px]"
                style={{ background: "#EE1A58" }}
              />
              Primary band
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-5 rounded-[3px]"
                style={{ background: "#46C9D6" }}
              />
              Secondary band
            </span>
          </div>
        )}
        <div className="h-[320px] w-full mt-2">
          {data.length < 1 || !hasMetricData ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-[#8FA0B8]">
              {metric === "uptime"
                ? "Uptime accumulates from when the snapshot job started — no data for this range yet."
                : metric === "band"
                  ? "No band-accuracy data for this range yet."
                  : "No submissions data for this range yet."}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320} minWidth={0}>
              <AreaChart
                data={data}
                margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="perfPrimary" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EE1A58" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#EE1A58" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="perfSecondary" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#46C9D6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#46C9D6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2E3F56" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="#8FA0B8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                />
                <YAxis
                  stroke="#8FA0B8"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  domain={[0, 100]}
                  width={48}
                  tickFormatter={(val) => `${val}%`}
                />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: "#1C2D47",
                    borderColor: "#2E3F56",
                    borderRadius: "8px",
                    color: "#FAFAFA",
                  }}
                  itemStyle={{ color: "#FAFAFA" }}
                  formatter={(val: number, name) => [
                    `${Number(val).toFixed(1)}%`,
                    name,
                  ]}
                />
                {metric === "band" ? (
                  <>
                    <Area
                      type="monotone"
                      dataKey="bandPrimary"
                      name="Primary"
                      stroke="#EE1A58"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#perfPrimary)"
                      isAnimationActive={false}
                      connectNulls={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="bandSecondary"
                      name="Secondary"
                      stroke="#46C9D6"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#perfSecondary)"
                      isAnimationActive={false}
                      connectNulls={false}
                    />
                  </>
                ) : (
                  <Area
                    type="monotone"
                    dataKey={metric}
                    name={metric === "uptime" ? "Uptime" : "Submissions"}
                    stroke="#EE1A58"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#perfPrimary)"
                    isAnimationActive={false}
                    connectNulls={false}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
