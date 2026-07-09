import { useState } from "react";
import { Link } from "react-router";
import { ArrowUpRight, ArrowDownRight, Shield, Loader2 } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/Card";
import { Badge } from "./components/Badge";
import { Button } from "./components/Button";
import { ImageWithFallback } from "./components/figma/ImageWithFallback";
import { usePriceFeeds } from "../hooks/usePriceFeeds";
import { useProviders } from "../hooks/useProviders";

function formatLarge(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

export default function Dashboard() {
  const { feeds, history, chartSymbols, timestamp, isLoading, error } = usePriceFeeds();
  const { providers, totalVotePower } = useProviders();
  const [chartSymbol, setChartSymbol] = useState("BTC");

  const flrFeed = feeds.find((f) => f.symbol === "FLR");

  return (
    <div className="p-4 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Dashboard Overview</h1>
            <p className="text-[#8FA0B8] text-sm mt-1">
              Live FTSOv2 price feeds and Flare data-provider metrics.
              {timestamp ? (
                <span className="ml-1 text-[#8FA0B8]/70">
                  Updated {new Date(timestamp * 1000).toLocaleTimeString()}
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/providers">
              <Button variant="outline" size="sm">
                View Providers
              </Button>
            </Link>
            <Link to="/delegation">
              <Button variant="primary" size="sm">
                Delegate
              </Button>
            </Link>
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
          <Card className="col-span-1 lg:col-span-2 bg-[#243552] border-[#2E3F56]">
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
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                      chartSymbol === sym
                        ? "bg-[#EE1A58] text-white"
                        : "bg-[#1D2430] text-[#8FA0B8] hover:text-[#FAFAFA]"
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
          <Card className="col-span-1 bg-[#243552] border-[#2E3F56]">
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
                      className="flex items-center justify-between p-3 rounded-lg bg-[#1D2430] border border-[#2E3F56]"
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

        {/* Provider Vote Power Table */}
        <Card className="bg-[#243552] border-[#2E3F56]">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-[#FAFAFA]">Data Providers by Vote Power</CardTitle>
              <CardDescription className="text-[#8FA0B8]">Top FTSO providers on Flare Mainnet</CardDescription>
            </div>
            <Link to="/providers">
              <Button variant="outline" size="sm">
                View All
              </Button>
            </Link>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-[#FAFAFA]">
              <thead className="bg-[#1D2430] border-y border-[#2E3F56] text-[#8FA0B8] text-xs uppercase tracking-wider font-semibold">
                <tr>
                  <th className="px-6 py-3">Provider</th>
                  <th className="px-6 py-3">Vote Power</th>
                  <th className="px-6 py-3">Delegation %</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2E3F56]">
                {providers.slice(0, 6).map((val) => (
                  <tr key={val.address} className="hover:bg-[#2E3F56]/30 transition-colors">
                    <td className="px-6 py-4 font-medium flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#1D2430] flex items-center justify-center border border-[#2E3F56] overflow-hidden shrink-0">
                        {val.logoURI ? (
                          <ImageWithFallback src={val.logoURI} alt={val.name} className="w-8 h-8 object-cover" />
                        ) : (
                          <Shield size={14} className="text-[#8FA0B8]" />
                        )}
                      </div>
                      {val.name}
                    </td>
                    <td className="px-6 py-4 font-mono">{val.votePowerLabel}</td>
                    <td className="px-6 py-4">{val.delegationPct !== null ? `${val.delegationPct.toFixed(2)}%` : "-"}</td>
                    <td className="px-6 py-4">
                      <Badge
                        variant={val.status === "Active" ? "success" : val.status === "Warning" ? "outline" : "dark"}
                        className={val.status === "Warning" ? "border-yellow-500/50 text-yellow-500" : ""}
                      >
                        {val.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link to="/delegation">
                        <Button variant="ghost" size="sm" className="h-8 px-2 text-[#8FA0B8] hover:text-[#EE1A58]">
                          Delegate
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
                {providers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-[#8FA0B8]">
                      Loading providers...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
    <Card className="bg-[#243552] border-[#2E3F56]">
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
