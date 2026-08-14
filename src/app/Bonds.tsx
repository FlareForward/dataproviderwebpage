import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { ArrowRight, Gem, Gift } from "lucide-react";
import { Button } from "./components/Button";
import { MyBonds } from "./components/MyBonds";
import { settledRate, fmtPct } from "../lib/rewards";

const BOND_YIELD_URL = import.meta.env.VITE_BOND_YIELD_URL ?? "/api/bond-yield";

/**
 * /bonds — what this wallet holds and what it has earned. Nothing else.
 *
 * No marketplace block (that belongs on the mint page, where someone is
 * choosing between minting and buying) and no address lookup (this page already
 * knows whose wallet it is).
 *
 * Claim is shown but cannot do anything yet: the lot contracts expose no claim
 * function and no distribution contract exists. Rather than hide the row, it
 * states the real position — a claim control that silently isn't there is worse
 * than one that tells you when it opens.
 */
export default function Bonds() {
  const { data } = useQuery<{
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
              What you hold, and what it has earned.
            </p>
          </div>
          <Link to="/nft">
            <Button variant="primary" className="gap-2">
              <Gem size={16} /> Mint a bond <ArrowRight size={15} />
            </Button>
          </Link>
        </div>

        {/* Earnings and claim, together and at the top — the two things someone
            opens this page to find. */}
        <div className="glass-card p-5 lg:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-[#8FA0B8]">
                Current bond APY
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-400">
                {fmtPct(rate)}
              </div>
              <div className="mt-1 text-xs text-[#8FA0B8]">what our bond earns now</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-[#8FA0B8]">
                Earned so far
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-[#FAFAFA]">0.00 FLR</div>
              <div className="mt-1 text-xs text-[#8FA0B8]">across all bonds you hold</div>
            </div>
            <div className="sm:text-right">
              <Button variant="secondary" className="gap-2 w-full sm:w-auto" disabled>
                <Gift size={16} /> Claim
              </Button>
              <p className="mt-2 text-xs text-[#8FA0B8]">
                Opens when the lot closes
              </p>
            </div>
          </div>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-[#8FA0B8]">
            Nothing has been distributed yet — payouts start once the lot closes and its
            distribution contract is deployed, split equally per bond. The rate above is what our
            validator bond is earning; it moves epoch to epoch and is not a promise.
          </p>
        </div>

        <MyBonds compact bare />
      </div>
    </div>
  );
}
