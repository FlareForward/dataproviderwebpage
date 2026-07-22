import { useMemo } from "react";
import { ArrowUpRight, ArrowDownRight, Activity } from "lucide-react";
import { Card, CardContent } from "./components/Card";
import { Badge } from "./components/Badge";
import { PerformanceChart } from "./components/PerformanceChart";
import { AccuracyBoard } from "./components/AccuracyBoard";
import {
  usePerformanceHistory,
  type PerformancePoint,
} from "../hooks/usePerformanceHistory";

function pct(v: number | null): string {
  return v === null ? "—" : `${v.toFixed(1)}%`;
}

/** Uptime / band rates carry through directly; submissions is a participation rate. */
function pointValue(point: PerformancePoint, key: MetricCardKey): number | null {
  switch (key) {
    case "uptime":
      return point.uptime_pct;
    case "submissions":
      return point.submissions_count !== null &&
        point.submissions_total !== null &&
        point.submissions_total > 0
        ? (point.submissions_count / point.submissions_total) * 100
        : null;
    case "band":
      return point.band_primary_pct;
  }
}

type MetricCardKey = "uptime" | "submissions" | "band";

const CARDS: { key: MetricCardKey; title: string; hint: string }[] = [
  { key: "uptime", title: "Uptime", hint: "Latest reward epoch" },
  { key: "submissions", title: "Submissions", hint: "Reveal participation" },
  { key: "band", title: "Band Accuracy", hint: "Primary reward band" },
];

export default function Analytics() {
  const { data, isLoading, error } = usePerformanceHistory();

  const series = useMemo(() => {
    if (!data) return [];
    return [...data.series].sort(
      (a, b) => a.bucket_start_unix - b.bucket_start_unix
    );
  }, [data]);

  const latest = series.length > 0 ? series[series.length - 1] : null;
  const previous = series.length > 1 ? series[series.length - 2] : null;
  // During a registration gap we don't present "current" figures as if live —
  // the AccuracyBoard shows the missed-epoch notice + countdown instead, and we
  // fall back to the historical trend only.
  const gap = !!data?.status && !data.status.submitting;

  return (
    <div className="p-4 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
              Provider Analytics
            </h1>
            <p className="text-[#8FA0B8] text-sm mt-1">
              Overall performance of the Flare Forward data provider — uptime,
              submissions, and reward-band accuracy from on-chain data.
              {data?.generated_at_unix ? (
                <span className="ml-1 text-[#8FA0B8]/70">
                  Updated{" "}
                  {new Date(data.generated_at_unix * 1000).toLocaleString()}
                </span>
              ) : null}
            </p>
          </div>
          <Badge variant="rose">Flare Forward</Badge>
        </div>

        {/* FTSO success rate — and, during a registration gap, the prominent
            missed-epoch notice with a countdown to the next epoch. */}
        <AccuracyBoard />

        {error ? (
          <div className="glass-panel border-red-500/30 p-6 text-center text-red-400">
            Failed to load performance history: {error.message}
          </div>
        ) : isLoading ? (
          <div className="glass-panel p-8 text-center text-[#8FA0B8]">
            Loading provider performance…
          </div>
        ) : !latest ? (
          <div className="glass-panel flex flex-col items-center gap-2 p-10 text-center text-[#8FA0B8]">
            <Activity size={22} className="text-[#EE1A58]" />
            <p className="font-medium text-[#FAFAFA]">
              No performance history published yet
            </p>
            <p className="text-sm">
              Once the snapshot job has published its first performance
              time-series, uptime, submissions, and band-accuracy trends will
              appear here.
            </p>
          </div>
        ) : (
          <>
            {gap ? (
              <p className="text-xs text-[#8FA0B8]">
                Live metrics are paused this epoch (see notice above). Showing
                the historical trend from the last completed epochs.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {CARDS.map((card) => {
                  const value = pointValue(latest, card.key);
                  const prev = previous
                    ? pointValue(previous, card.key)
                    : null;
                  const delta =
                    value !== null && prev !== null ? value - prev : null;
                  return (
                    <StatCard
                      key={card.key}
                      title={card.title}
                      value={pct(value)}
                      hint={card.hint}
                      delta={delta}
                    />
                  );
                })}
              </div>
            )}

            <PerformanceChart series={series} />
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  hint,
  delta,
}: {
  title: string;
  value: string;
  hint: string;
  delta: number | null;
}) {
  const hasDelta = delta !== null && Math.abs(delta) >= 0.05;
  const positive = (delta ?? 0) >= 0;
  return (
    <Card className="glass-card-hover">
      <CardContent className="p-5">
        <div className="text-sm font-medium text-[#8FA0B8]">{title}</div>
        <div className="mt-2 flex items-baseline gap-2">
          <div className="text-2xl font-bold tracking-tight text-[#FAFAFA]">
            {value}
          </div>
        </div>
        <div
          className={`mt-2 flex items-center gap-1 text-xs font-medium ${
            hasDelta
              ? positive
                ? "text-emerald-400"
                : "text-red-400"
              : "text-[#8FA0B8]"
          }`}
        >
          {hasDelta ? (
            <>
              {positive ? (
                <ArrowUpRight size={14} />
              ) : (
                <ArrowDownRight size={14} />
              )}
              {Math.abs(delta!).toFixed(1)} pts vs previous epoch
            </>
          ) : (
            hint
          )}
        </div>
      </CardContent>
    </Card>
  );
}
