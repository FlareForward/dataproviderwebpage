import { useState } from "react";
import { ArrowUpRight, ArrowDownRight, Loader2 } from "lucide-react";
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
import { Badge } from "./Badge";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { usePriceFeeds } from "../../hooks/usePriceFeeds";
import { useProviders } from "../../hooks/useProviders";

function formatLarge(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

/**
 * Network + market data demoted off the homepage: aggregate network metrics,
 * the session-sampled FTSOv2 price chart, and the full live feed list.
 * Rendered on /analytics for visitors who want the numbers; the homepage
 * sells instead. Deliberately shows NO other provider's identity or stats —
 * this site presents FlareForward only.
 */
export function MarketOverview() {
  const { feeds, history, chartSymbols, timestamp, isLoading, error } = usePriceFeeds();
  const { providers, totalVotePower } = useProviders();
  const [chartSymbol, setChartSymbol] = useState("BTC");

  const flrFeed = feeds.find((f) => f.symbol === "FLR");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 glass-panel px-3.5 py-2">
          <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
            <span
              className={`absolute inline-flex h-full w-full rounded-full ${
                error ? "bg-red-400/60" : "bg-emerald-400/70 animate-ping"
              }`}
            />
            <span
              className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                error ? "bg-red-500" : "bg-emerald-500"
              }`}
            />
          </span>
          <span className="text-xs font-semibold text-[#FAFAFA]">
            {error ? "Feed offline" : isLoading && !timestamp ? "Connecting…" : "Live"}
          </span>
          {timestamp ? (
            <>
              <span className="h-3.5 w-px bg-white/10" aria-hidden="true" />
              <span className="text-xs tabular-nums text-[#8FA0B8]">
                {new Date(timestamp * 1000).toLocaleTimeString()}
              </span>
            </>
          ) : null}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Vote Power"
          value={totalVotePower > 0 ? `${formatLarge(totalVotePower)} FLR` : "-"}
          hint="Delegated WFLR"
        />
        <MetricCard
          title="Registered Providers"
          value={providers.length > 0 ? providers.length.toString() : "-"}
          hint="From on-chain list"
        />
        <MetricCard
          title="Supported Feeds"
          value={feeds.length > 0 ? feeds.length.toString() : "-"}
          hint="FTSOv2 crypto feeds"
        />
        <MetricCard
          title="FLR / USD"
          value={flrFeed ? flrFeed.priceLabel : "-"}
          trend={flrFeed?.change ?? null}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Crypto Pricing Chart */}
        <Card className="col-span-1 lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-[#FAFAFA]">Live Price Trend</CardTitle>
              <CardDescription className="text-[#8FA0B8]">
                Real-time FTSOv2 feed, sampled this session
              </CardDescription>
            </div>
            <div className="flex items-center gap-1">
              {chartSymbols.map((sym) => (
                <button
                  key={sym}
                  onClick={() => setChartSymbol(sym)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                    chartSymbol === sym
                      ? "bg-[#EE1A58] text-white glass-glow"
                      : "bg-white/5 text-[#8FA0B8] hover:text-[#FAFAFA] hover:bg-white/10"
                  }`}
                >
                  {sym}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full mt-4">
              {history.length < 2 ? (
                <div className="h-full flex flex-col items-center justify-center text-[#8FA0B8] gap-2">
                  <Loader2 className="animate-spin" size={24} />
                  <span className="text-sm">Collecting live price samples...</span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300} minWidth={0}>
                  <AreaChart data={history} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#EE1A58" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#EE1A58" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2E3F56" vertical={false} />
                    <XAxis dataKey="time" stroke="#8FA0B8" fontSize={11} tickLine={false} axisLine={false} minTickGap={40} />
                    <YAxis
                      stroke="#8FA0B8"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      domain={["auto", "auto"]}
                      width={70}
                      tickFormatter={(val) => `$${Number(val).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: "#1C2D47",
                        borderColor: "#2E3F56",
                        borderRadius: "8px",
                        color: "#FAFAFA",
                      }}
                      itemStyle={{ color: "#FAFAFA" }}
                      formatter={(val: number) => [`$${Number(val).toLocaleString()}`, chartSymbol]}
                    />
                    <Area
                      type="monotone"
                      dataKey={chartSymbol}
                      stroke="#EE1A58"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorPrice)"
                      isAnimationActive={false}
                      connectNulls
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Live Price Feed */}
        <Card className="col-span-1">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-[#FAFAFA]">Live Price Feed</CardTitle>
                <CardDescription className="text-[#8FA0B8]">Every supported token</CardDescription>
              </div>
              <Badge variant="rose">Live</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 mt-2 max-h-[340px] overflow-y-auto pr-1">
              {feeds.length === 0 && (
                <div className="text-center py-8 text-[#8FA0B8] text-sm">
                  {isLoading ? "Loading feeds..." : error ? "Failed to load feeds" : "No feeds"}
                </div>
              )}
              {feeds.map((asset) => {
                const positive = (asset.change ?? 0) >= 0;
                return (
                  <div
                    key={asset.feedId}
                    className="flex items-center justify-between p-3 glass-panel"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0 overflow-hidden">
                        <ImageWithFallback src={asset.logo} alt={`${asset.name} logo`} className="w-5 h-5 object-contain" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-[#FAFAFA]">{asset.symbol}</div>
                        <div className="text-xs text-[#8FA0B8] truncate">{asset.name}</div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-medium text-[#FAFAFA]">{asset.priceLabel}</div>
                      {asset.change !== null && (
                        <div
                          className={`text-xs flex items-center justify-end gap-1 ${
                            positive ? "text-emerald-400" : "text-red-400"
                          }`}
                        >
                          {positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                          {Math.abs(asset.change).toFixed(2)}%
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}

function MetricCard({
  title,
  value,
  trend,
  hint,
}: {
  title: string;
  value: string;
  trend?: number | null;
  hint?: string;
}) {
  const hasTrend = trend !== undefined && trend !== null;
  const positive = (trend ?? 0) >= 0;
  return (
    <Card className="glass-card-hover">
      <CardContent className="p-5">
        <div className="text-sm font-medium text-[#8FA0B8]">{title}</div>
        <div className="mt-2 flex items-baseline gap-2">
          <div className="text-2xl font-bold tracking-tight text-[#FAFAFA]">{value}</div>
        </div>
        <div
          className={`mt-2 flex items-center gap-1 text-xs font-medium ${
            hasTrend ? (positive ? "text-emerald-400" : "text-red-400") : "text-[#8FA0B8]"
          }`}
        >
          {hasTrend ? (
            <>
              {positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              {Math.abs(trend!).toFixed(2)}% this session
            </>
          ) : (
            hint ?? ""
          )}
        </div>
      </CardContent>
    </Card>
  );
}
