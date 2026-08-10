import { useMemo } from "react";
import { ArrowUpRight, ArrowDownRight, Activity } from "lucide-react";
import { Card, CardContent } from "./components/Card";
import { Badge } from "./components/Badge";
import { PerformanceChart } from "./components/PerformanceChart";
import { AccuracyBoard } from "./components/AccuracyBoard";
import { ValidatorStaking } from "./components/ValidatorStaking";
import { MarketOverview } from "./components/MarketOverview";
import {
  usePerformanceHistory,
  type PerformancePoint,
} from "../hooks/usePerformanceHistory";
import { useAccuracy } from "../hooks/useAccuracy";
import { useProviders } from "../hooks/useProviders";

/** Flare Forward identity (pinned) — mirrors PINNED_PROVIDER_ADDRESS. */
const PINNED_PROVIDER_ADDRESS =
  "0x1FBB55a1877817A0f90cAE60c1ab22FC94f97110".toLowerCase();

function pct(v: number | null, digits = 1): string {
  return v === null ? "—" : `${v.toFixed(digits)}%`;
}

/** Submission reveal-participation rate for a box-pipeline point. */
function submissionValue(point: PerformancePoint): number | null {
  return point.submissions_count !== null &&
    point.submissions_total !== null &&
    point.submissions_total > 0
    ? (point.submissions_count / point.submissions_total) * 100
    : null;
}

type MetricCardKey = "uptime" | "submissions" | "delegation";

const CARDS: {
  key: MetricCardKey;
  title: string;
  hint: string;
  digits?: number;
}[] = [
  { key: "uptime", title: "Uptime", hint: "Availability · last 24h" },
  { key: "submissions", title: "Submissions", hint: "Reveal participation" },
  {
    key: "delegation",
    title: "Delegation Share",
    hint: "Share of network vote power",
    digits: 2,
  },
];

export default function Analytics() {
  const { data, isLoading, error } = usePerformanceHistory();
  const { data: accuracy } = useAccuracy();
  const { providers } = useProviders();

  const self =
    providers.find(
      (p) =>
        p.identityAddress.toLowerCase() === PINNED_PROVIDER_ADDRESS ||
        p.address.toLowerCase() === PINNED_PROVIDER_ADDRESS
    ) ?? null;

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

  // Uptime reads the canonical Flare Systems Explorer trailing 24h availability
  // so it agrees with the FTSO Success Rate board's headline above (a trailing
  // window, not an epoch-over-epoch sample, so no "vs previous epoch" delta).
  // Delegation Share is Flare Forward's on-chain share of total network vote
  // power. Submissions has no Explorer equivalent, so it stays sourced from the
  // box performance pipeline (latest/previous series) and keeps its epoch delta.
  function cardValues(key: MetricCardKey): {
    value: number | null;
    prev: number | null;
  } {
    switch (key) {
      case "uptime":
        return { value: accuracy?.last_24h.availability ?? null, prev: null };
      case "delegation":
        return { value: self?.delegationPct ?? null, prev: null };
      case "submissions":
        return {
          value: latest ? submissionValue(latest) : null,
          prev: previous ? submissionValue(previous) : null,
        };
    }
  }

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

        {/* Data-provider performance — FTSO uptime & submissions plus Flare
            Forward's delegation vote-power share, with the historical trend.
            Kept separate from validator staking below to avoid conflating the
            data-provider/delegation metrics with the P-chain validator. */}
        <section aria-labelledby="provider-perf-heading" className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#EE1A58]/10 text-[#EE1A58]">
              <Activity size={18} />
            </div>
            <div>
              <h2
                id="provider-perf-heading"
                className="text-[1.25rem] font-semibold tracking-tight text-[#FAFAFA]"
              >
                Provider Performance
              </h2>
              <p className="mt-0.5 text-[0.8125rem] text-[#8FA0B8]">
                FTSO uptime and submissions, and Flare Forward's delegation
                share of total network vote power.
              </p>
            </div>
          </div>

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
                  const { value, prev } = cardValues(card.key);
                  const delta =
                    value !== null && prev !== null ? value - prev : null;
                  return (
                    <StatCard
                      key={card.key}
                      title={card.title}
                      value={pct(value, card.digits)}
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
        </section>

        {/* Validator staking — P-chain stake, capacity, and staking rewards. */}
        <ValidatorStaking />

        {/* Network & market data — moved here from the homepage so the front
            door can sell; the raw numbers live on this page instead. */}
        <section aria-labelledby="network-market-heading" className="space-y-4">
          <div>
            <h2
              id="network-market-heading"
              className="text-[1.25rem] font-semibold tracking-tight text-[#FAFAFA]"
            >
              Network &amp; Market
            </h2>
            <p className="mt-0.5 text-[0.8125rem] text-[#8FA0B8]">
              Live FTSOv2 price feeds, network vote power, and the provider
              field across Flare Mainnet.
            </p>
          </div>
          <MarketOverview />
        </section>
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
