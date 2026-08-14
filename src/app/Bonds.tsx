import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { ArrowRight, Gem, Store, Activity } from "lucide-react";
import { Button } from "./components/Button";
import { MyBonds } from "./components/MyBonds";
import { settledRate, fmtPct } from "../lib/rewards";

const BOND_YIELD_URL = import.meta.env.VITE_BOND_YIELD_URL ?? "/api/bond-yield";

/**
 * /bonds — the member page for bond holders, the counterpart to /nft (which
 * sells). Delegate and Stake each have a member page; this is the third.
 *
 * The rate here is deliberately retrospective. Distributions have not started,
 * so nobody has been paid anything yet — the only honest number is what our own
 * bond has been measured earning, framed as what a holder's FLR would have been
 * working at over that period. It is not a forecast and not a promise.
 */
export default function Bonds() {
  const { data } = useQuery<{
    logged_epochs?: number;
    current?: { bond_rate_annualized_pct: number | null } | null;
  }>({
    queryKey: ["bond-yield"],
    queryFn: async () => {
      const res = await fetch(BOND_YIELD_URL, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`bond-yield ${res.status}`);
      return res.json();
    },
    staleTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const rate = settledRate(data?.current?.bond_rate_annualized_pct);
  const epochs = data?.logged_epochs ?? 0;

  return (
    <div className="p-4 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-3">
              <Gem size={22} className="text-[#E85A95]" />
              <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Your Bonds</h1>
            </div>
            <p className="text-[#8FA0B8] text-sm mt-1">
              The bond NFTs this wallet holds, and what the bond behind them has been earning.
            </p>
          </div>
          <Link to="/nft">
            <Button variant="primary" className="gap-2">
              <Gem size={16} /> Mint a bond <ArrowRight size={15} />
            </Button>
          </Link>
        </div>

        {/* What the bond earned — measured, retrospective, never a promise. */}
        <div className="glass-card p-5 lg:p-6">
          <div className="flex items-center gap-3">
            <Activity size={18} className="text-[#E85A95]" />
            <h2 className="text-lg font-semibold">What the bond has earned</h2>
          </div>
          {rate == null ? (
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#8FA0B8]">
              No closed epoch has been measured yet. The rate appears here once there is a real
              number to show.
            </p>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap items-baseline gap-3">
                <span className="text-3xl font-bold tabular-nums text-emerald-400">
                  {fmtPct(rate)}
                </span>
                <span className="text-sm text-[#8FA0B8]">
                  annualized, from {epochs} closed {epochs === 1 ? "epoch" : "epochs"}
                </span>
              </div>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#8FA0B8]">
                That is what our validator bond actually earned over the measured period. Had you
                been holding a bond through it, that is the rate your FLR would have been working
                at — because it is the same capital doing the same job.
              </p>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#8FA0B8]">
                It is a measurement, not a promise. The rate moves every epoch and nobody has
                tracked this yield before, so we publish what we measure and let it stand on its
                own.
                {epochs <= 1 && " One epoch is a starting point, not a track record."}
              </p>
            </>
          )}
        </div>

        <MyBonds compact />

        <div className="glass-panel p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Store size={18} className="text-[#E85A95]" />
            <h2 className="text-lg font-semibold">Marketplace</h2>
            <span className="inline-flex rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
              Coming soon
            </span>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#8FA0B8]">
            Somewhere to sell a bond you no longer want to hold, and to buy one from someone else —
            including bonds that already carry unclaimed rewards. Holders will set their own price.
            In build now.
          </p>
        </div>

        <div className="glass-panel p-5">
          <p className="text-sm leading-relaxed text-[#8FA0B8]">
            Distributions have not started. They open once a lot closes and its distribution
            contract is deployed, and are equal per NFT within that lot. Until then your bonds
            accrue nothing to claim here — your delegation and staking rewards are unaffected and
            live under{" "}
            <Link to="/rewards" className="text-[#EE1A58] hover:underline">
              My Rewards
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
