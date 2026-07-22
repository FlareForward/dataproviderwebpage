import { useMemo, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { Activity, ChevronDown, ChevronUp } from "lucide-react";
import {
  useAccuracy,
  isSubmitting,
  type AccuracyFeed,
} from "../../hooks/useAccuracy";
import { EpochGapNotice } from "./EpochGapNotice";

/** Round to one decimal (e.g. 30 -> "30.0"); null/NaN render as an em dash. */
function f1(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return (Math.round(v * 10) / 10).toFixed(1);
}

/**
 * Heat color for a landing-rate cell: red (weak) -> amber (mid) -> green (strong).
 * Primary band is scaled 0..55, secondary 40..100, matching the reward-band shapes.
 * Returns an inline foreground + translucent background tuned for the dark card.
 */
function heat(
  v: number,
  kind: "p" | "s",
): { color: string; background: string } {
  let t = kind === "p" ? v / 55 : (v - 40) / 60;
  t = Math.max(0, Math.min(1, t));
  const hue = 2 + t * 143; // 2 = red, 145 = green
  return {
    color: `hsl(${hue} 68% 66%)`,
    background: `hsl(${hue} 62% 50% / 0.18)`,
  };
}

function HeatCell({ value, kind }: { value: number | null; kind: "p" | "s" }) {
  if (value === null || value === undefined) {
    return (
      <span className="inline-block min-w-[3.25rem] rounded-md px-2 py-0.5 font-semibold tabular-nums text-[#8FA0B8]/50">
        —
      </span>
    );
  }
  const h = heat(value, kind);
  return (
    <span
      className="inline-block min-w-[3.25rem] rounded-md px-2 py-0.5 font-semibold tabular-nums"
      style={{ color: h.color, background: h.background }}
    >
      {f1(value)}
    </span>
  );
}

type SortKey =
  | "feed"
  | "primary_6h"
  | "secondary_6h"
  | "primary_24h"
  | "secondary_24h"
  | "n_24h";

interface ColumnDef {
  key: SortKey;
  label: string;
  align: "left" | "right";
}

const COLUMNS: ColumnDef[] = [
  { key: "feed", label: "Feed", align: "left" },
  { key: "primary_6h", label: "6h primary", align: "right" },
  { key: "secondary_6h", label: "6h secondary", align: "right" },
  { key: "primary_24h", label: "24h primary", align: "right" },
  { key: "secondary_24h", label: "24h secondary", align: "right" },
  { key: "n_24h", label: "rounds", align: "right" },
];

/** One headline band: big number + % sign, colored by band. */
function Band({
  value,
  tone,
}: {
  value: number | null;
  tone: "primary" | "secondary";
}) {
  const color = tone === "primary" ? "#EE1A58" : "#46C9D6";
  const isNull = value === null || value === undefined;
  return (
    <div className="flex items-baseline gap-1.5">
      <span
        className="text-4xl font-bold leading-none tracking-tight tabular-nums"
        style={{ color: isNull ? "#8FA0B8" : color }}
      >
        {f1(value)}
      </span>
      {!isNull && (
        <span className="text-base font-semibold text-[#8FA0B8]">%</span>
      )}
    </div>
  );
}

function BandLegend() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] uppercase tracking-wider text-[#8FA0B8]">
      <span className="flex items-center gap-1.5">
        <span
          className="inline-block h-2.5 w-5 rounded-[3px]"
          style={{ background: "#EE1A58" }}
        />
        Primary band
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className="inline-block h-2.5 w-5 rounded-[3px] border-[1.5px]"
          style={{ borderColor: "#46C9D6" }}
        />
        Secondary band
      </span>
    </div>
  );
}

export function AccuracyBoard() {
  const { data, isLoading, error } = useAccuracy();
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "primary_24h",
    dir: "desc",
  });

  const sortedFeeds = useMemo(() => {
    if (!data) return [];
    const rows = [...data.feeds];
    rows.sort((a, b) => {
      let cmp: number;
      if (sort.key === "feed") cmp = a.feed.localeCompare(b.feed);
      else {
        // Nulls (no data) sort to the weak end.
        const av = a[sort.key] ?? -Infinity;
        const bv = b[sort.key] ?? -Infinity;
        cmp = (av as number) - (bv as number);
      }
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [data, sort]);

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "feed" ? "asc" : "desc" },
    );
  }

  if (error) {
    return (
      <div className="glass-panel border-red-500/30 p-6 text-center text-red-400">
        Failed to load accuracy feed: {error.message}
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="glass-panel p-8 text-center text-[#8FA0B8]">
        Loading FTSO accuracy…
      </div>
    );
  }

  const s = data.summary;
  const submitting = isSubmitting(data);
  const updated = new Date(data.generated_at_unix * 1000);
  const updatedLabel = `${updated.toISOString().slice(11, 16)} UTC`;
  const epochMax = Math.max(...data.epochs.map((e) => e.primary), 1) * 1.25;
  const EPOCH_BAR_MAX_PX = 92; // track height in px; avoids flexbox %-height ambiguity

  return (
    <section
      aria-labelledby="accuracy-heading"
      className="overflow-hidden glass-card text-[#FAFAFA]"
    >
      {/* Header */}
      <div className="relative flex flex-col gap-3 border-b border-white/8 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#EE1A58]/10 text-[#EE1A58]">
            <Activity size={18} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id="accuracy-heading"
                className="text-[1.25rem] font-semibold tracking-tight"
              >
                FTSO Success Rate
              </h2>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                  submitting
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                    : "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30"
                }`}
              >
                {submitting ? "On-chain" : "Paused"}
              </span>
            </div>
            <p className="mt-0.5 text-[0.8125rem] text-[#8FA0B8]">
              {submitting
                ? "How often our feeds land inside the on-chain reward bands"
                : "Not submitting this epoch — accuracy paused until we resume"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-right">
          <div>
            <div className="font-mono text-sm font-semibold tabular-nums">
              {data.current_round.toLocaleString()}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-[#8FA0B8]">
              Voting round
            </div>
          </div>
          <div>
            <div className="text-sm font-semibold">{updatedLabel}</div>
            <div className="text-[10px] uppercase tracking-wider text-[#8FA0B8]">
              Updated · every 10 min
            </div>
          </div>
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full animate-pulse ${
              submitting ? "bg-emerald-500" : "bg-yellow-500"
            }`}
            title={submitting ? "Live · submitting" : "Grading paused"}
            aria-hidden="true"
          />
        </div>
      </div>

      {!submitting ? (
        <div className="px-6 py-6">
          <EpochGapNotice
            rewardEpoch={data.status?.reward_epoch_current}
            gapReason={data.status?.gap_reason}
            expectedResumeUtc={data.status?.expected_resume_utc}
          />
        </div>
      ) : (
      <Tabs.Root defaultValue="success-rate">
        <Tabs.List className="relative flex border-b border-white/8 px-6">
          <Tabs.Trigger
            value="success-rate"
            className="px-4 py-3 text-sm font-medium text-[#8FA0B8] hover:text-[#FAFAFA] border-b-2 border-transparent data-[state=active]:border-[#EE1A58] data-[state=active]:text-[#EE1A58] transition-colors"
          >
            Success Rate
          </Tabs.Trigger>
          <Tabs.Trigger
            value="performance"
            className="px-4 py-3 text-sm font-medium text-[#8FA0B8] hover:text-[#FAFAFA] border-b-2 border-transparent data-[state=active]:border-[#EE1A58] data-[state=active]:text-[#EE1A58] transition-colors"
          >
            FTSO Performance
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="success-rate" className="outline-none">
          {/* Headline: overall success rate, 6h + 24h, pinned at the top */}
          <div className="px-6 py-6">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8FA0B8]">
              Overall — across all {s.feeds_count} feeds and every voting round
              in the window
            </div>
            <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="glass-panel p-5">
                <div className="text-[11px] uppercase tracking-wider text-[#8FA0B8]">
                  Last 6 hours
                </div>
                <div className="mt-3 flex flex-wrap items-baseline gap-x-8 gap-y-2">
                  <Band value={s.overall_primary_6h} tone="primary" />
                  <Band value={s.overall_secondary_6h} tone="secondary" />
                </div>
                <BandLegend />
              </div>
              <div className="glass-panel p-5">
                <div className="text-[11px] uppercase tracking-wider text-[#8FA0B8]">
                  Last 24 hours
                </div>
                <div className="mt-3 flex flex-wrap items-baseline gap-x-8 gap-y-2">
                  <Band value={s.overall_primary_24h} tone="primary" />
                  <Band value={s.overall_secondary_24h} tone="secondary" />
                </div>
                <div className="mt-3 font-mono text-[11px] uppercase tracking-wider text-[#8FA0B8]">
                  median across {s.feeds_count} feeds —{" "}
                  {f1(s.median_primary_24h)}% / {f1(s.median_secondary_24h)}%
                </div>
              </div>
            </div>
            <p className="mt-4 border-t border-white/8 pt-3 text-[12.5px] leading-relaxed text-[#8FA0B8]">
              <span className="font-semibold text-[#FAFAFA]">Primary</span> is
              the tight reward band;{" "}
              <span className="font-semibold text-[#FAFAFA]">secondary</span>{" "}
              the wider one. These are trailing 6h / 24h averages graded
              on-chain against the real consensus bands — a new engine's gains
              show up here gradually as the window fills.
            </p>
          </div>

          {/* Epoch trend */}
          <div className="border-t border-white/8 px-6 py-5">
            <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-[#8FA0B8]">
              Primary-band accuracy by reward epoch
            </h3>
            <div className="flex items-end gap-4">
              {data.epochs.map((e) => {
                const barPx = Math.max(
                  6,
                  Math.round((e.primary / epochMax) * EPOCH_BAR_MAX_PX),
                );
                return (
                  <div
                    key={e.reward_epoch}
                    className="flex flex-1 flex-col items-center gap-2"
                  >
                    <div
                      className="relative w-full max-w-[52px] rounded-t-md bg-gradient-to-b from-[#EE1A58] to-[#EE1A58]/40"
                      style={{ height: barPx }}
                    >
                      <span className="absolute -top-5 left-0 right-0 text-center font-mono text-xs font-semibold tabular-nums">
                        {f1(e.primary)}
                      </span>
                    </div>
                    <div className="font-mono text-[11px] text-[#8FA0B8]">
                      #{e.reward_epoch}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Tabs.Content>

        <Tabs.Content value="performance" className="outline-none">
          {/* Per-feed table */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 px-6 pb-3 pt-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#8FA0B8]">
                Per-feed landing — all {data.feeds.length} feeds
              </h3>
              <div className="flex items-center gap-4 text-[11px] text-[#8FA0B8]">
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-3 w-3 rounded-[3px]"
                    style={{ background: "hsl(145 60% 45%)" }}
                  />
                  strong
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-3 w-3 rounded-[3px]"
                    style={{ background: "hsl(48 70% 50%)" }}
                  />
                  mid
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-3 w-3 rounded-[3px]"
                    style={{ background: "hsl(2 70% 52%)" }}
                  />
                  weak / thin data
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <caption className="sr-only">
                  FTSO per-feed landing rate inside the primary and secondary
                  reward bands over trailing 6-hour and 24-hour windows,
                  sortable by column.
                </caption>
                <thead>
                  <tr className="border-y border-white/8 bg-white/5 text-[10.5px] uppercase tracking-wider text-[#8FA0B8]">
                    {COLUMNS.map((col) => {
                      const active = sort.key === col.key;
                      return (
                        <th
                          key={col.key}
                          scope="col"
                          aria-sort={
                            active
                              ? sort.dir === "asc"
                                ? "ascending"
                                : "descending"
                              : "none"
                          }
                          className={`px-3.5 py-2.5 font-semibold ${col.align === "left" ? "text-left" : "text-right"}`}
                        >
                          <button
                            type="button"
                            onClick={() => toggleSort(col.key)}
                            className={`inline-flex items-center gap-1 rounded-sm hover:text-[#FAFAFA] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EE1A58] focus-visible:ring-offset-1 focus-visible:ring-offset-[#1D2430] ${
                              active ? "text-[#FAFAFA]" : ""
                            } ${col.align === "right" ? "flex-row-reverse" : ""}`}
                          >
                            {col.label}
                            {active ? (
                              sort.dir === "asc" ? (
                                <ChevronUp size={12} />
                              ) : (
                                <ChevronDown size={12} />
                              )
                            ) : (
                              <span className="w-3" aria-hidden="true" />
                            )}
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {sortedFeeds.map((r: AccuracyFeed) => {
                    const [base, quote] = r.feed.split("/");
                    return (
                      <tr
                        key={r.feed}
                        className="border-b border-white/8 transition-colors hover:bg-white/5"
                      >
                        <td className="px-3.5 py-1.5 text-left font-semibold">
                          {base}
                          <span className="font-medium text-[#8FA0B8]">
                            /{quote}
                          </span>
                        </td>
                        <td className="px-3.5 py-1.5 text-right">
                          <HeatCell value={r.primary_6h} kind="p" />
                        </td>
                        <td className="px-3.5 py-1.5 text-right">
                          <HeatCell value={r.secondary_6h} kind="s" />
                        </td>
                        <td className="px-3.5 py-1.5 text-right">
                          <HeatCell value={r.primary_24h} kind="p" />
                        </td>
                        <td className="px-3.5 py-1.5 text-right">
                          <HeatCell value={r.secondary_24h} kind="s" />
                        </td>
                        <td className="px-3.5 py-1.5 text-right font-mono tabular-nums text-[#8FA0B8]">
                          {r.n_24h.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t border-white/8 px-6 py-3 text-[11.5px] text-[#8FA0B8]">
              Graded on-chain against the real consensus bands, not a
              self-report — the same measure the public trackers use. Snapshot{" "}
              <span className="font-semibold text-[#FAFAFA]">
                {updated.toISOString().slice(0, 16).replace("T", " ")} UTC
              </span>
              .
            </div>
          </div>
        </Tabs.Content>
      </Tabs.Root>
      )}
    </section>
  );
}
