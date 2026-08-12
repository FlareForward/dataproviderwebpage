import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { MintLot } from "./components/MintLot";
import { MyBonds } from "./components/MyBonds";
import { CURRENT_LOT, ADDRESS_RE, type BondTier } from "../lib/bondLot";
import { Gem, Coins, TrendingUp, Landmark, Tag, Wallet, Store, Activity } from "lucide-react";

/**
 * Measured bond performance, served by /api/bond-yield (worker/bondYield.ts).
 * Everything shown is observed — the only derived figure is annualization, a
 * labelled restatement of an observed epoch rate. No projections, ever: the
 * whole premise of FlareForward Bonds is that we publish what was measured.
 */
const BOND_YIELD_URL = import.meta.env.VITE_BOND_YIELD_URL ?? "/api/bond-yield";

interface Bucket {
  label: string;
  epoch_count: number;
  bond_rate_annualized_pct: number | null;
  provider_income_flr: number | null;
}

interface BondYield {
  logged_epochs?: number;
  total_epochs?: number;
  current?: {
    reward_epoch: number;
    bond_rate_annualized_pct: number | null;
    delegator_staking_pct: number | null;
    delegation_fee_pct: number | null;
    staking_component_pct: number | null;
    pure_component_pct: number | null;
    provider_income_flr: number | null;
  } | null;
  weeks?: Bucket[];
  overall?: Bucket | null;
}

function pct(v: number | null | undefined): string {
  return typeof v === "number" ? `${v.toFixed(2)}%` : "—";
}

function MeasuredPerformance() {
  const { data, isLoading } = useQuery<BondYield>({
    queryKey: ["bond-yield"],
    queryFn: async () => {
      const res = await fetch(BOND_YIELD_URL, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`bond-yield ${res.status}`);
      return res.json();
    },
    staleTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const cur = data?.current;
  const weeks = data?.weeks ?? [];

  return (
    <section className="mt-10">
      <div className="flex items-center gap-3">
        <Activity size={20} className="text-[#E85A95]" />
        <h2 className="text-xl font-semibold">What the bond actually earns</h2>
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#8FA0B8]">
        Post-FIP.16 the validator bond is where provider economics live — and nobody has been
        keeping the receipts, because Flare&apos;s explorer only retains the most recent reward
        epoch. So we started the record ourselves. These are measured rates from closed epochs, not
        forecasts. We publish them whether they look good or not.
      </p>

      {isLoading && (
        <div className="glass-panel mt-4 p-6 text-sm text-[#8FA0B8]">Reading the chain…</div>
      )}

      {!isLoading && cur && (
        <>
          {/* The comparison IS the point: the bond and P-chain staking are two
              different rates on the same validator, and the difference is what
              the Bonds product is actually selling. */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="glass-panel border border-[#E85A95]/30 p-5">
              <p className="text-xs uppercase tracking-wide text-[#8FA0B8]">
                Bond APY — what the bond earns
              </p>
              <p className="mt-1 text-3xl font-semibold text-[#FAFAFA]">
                {pct(cur.bond_rate_annualized_pct)}
              </p>
              <p className="mt-1 text-xs text-[#8FA0B8]">
                staking {pct(cur.staking_component_pct)} + pure {pct(cur.pure_component_pct)} ·
                epoch {cur.reward_epoch}
              </p>
            </div>
            <div className="glass-panel p-5">
              <p className="text-xs uppercase tracking-wide text-[#8FA0B8]">
                P-chain staking APY — what a delegator earns
              </p>
              <p className="mt-1 text-3xl font-semibold">{pct(cur.delegator_staking_pct)}</p>
              <p className="mt-1 text-xs text-[#8FA0B8]">
                after our {cur.delegation_fee_pct ?? 20}% provider fee
              </p>
            </div>
          </div>

          <div className="glass-panel mt-3 border-l-2 border-[#E85A95]/50 p-4">
            <p className="text-sm leading-relaxed text-[#8FA0B8]">
              <span className="font-semibold text-[#FAFAFA]">Why the bond earns more.</span> Two
              reasons, both structural. The staking APY a delegator sees is already{" "}
              <em>net of the {cur.delegation_fee_pct ?? 20}% provider fee</em> — the bond is our own
              stake, so no delegation fee comes off it. And the bond earns a second component on top
              of the staking rate that delegated stake does not. That gap is the whole reason these
              NFTs exist.
            </p>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="glass-panel p-4">
              <p className="text-xs uppercase tracking-wide text-[#8FA0B8]">
                Provider income this epoch
              </p>
              <p className="mt-1 text-2xl font-semibold">
                {cur.provider_income_flr != null
                  ? `${Math.round(cur.provider_income_flr).toLocaleString("en-US")} FLR`
                  : "—"}
              </p>
              <p className="mt-1 text-xs text-[#8FA0B8]">the pool holder rewards come from</p>
            </div>
            <div className="glass-panel p-4">
              <p className="text-xs uppercase tracking-wide text-[#8FA0B8]">Epochs on record</p>
              <p className="mt-1 text-2xl font-semibold">{data?.total_epochs ?? 0}</p>
              <p className="mt-1 text-xs text-[#8FA0B8]">3.5 days each · log grows every epoch</p>
            </div>
          </div>

          {weeks.length > 0 && (
            <div className="glass-panel mt-3 overflow-x-auto p-0">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-[#8FA0B8]">
                  <tr className="border-b border-white/8">
                    <th className="px-4 py-3">Period</th>
                    <th className="px-4 py-3">Epochs</th>
                    <th className="px-4 py-3">Measured bond rate</th>
                    <th className="px-4 py-3">Provider income</th>
                  </tr>
                </thead>
                <tbody>
                  {[...weeks, ...(data?.overall ? [data.overall] : [])].map((w) => (
                    <tr key={w.label} className="border-b border-white/5 last:border-0">
                      <td className="px-4 py-2.5 font-medium">{w.label}</td>
                      <td className="px-4 py-2.5 text-[#8FA0B8]">{w.epoch_count}</td>
                      <td className="px-4 py-2.5 tabular-nums">
                        {pct(w.bond_rate_annualized_pct)}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-[#8FA0B8]">
                        {w.provider_income_flr != null
                          ? `${Math.round(w.provider_income_flr).toLocaleString("en-US")} FLR`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-3 max-w-3xl text-xs leading-relaxed text-[#8FA0B8]/80">
            Rates are the observed per-epoch bond rate restated annually (×365/3.5) — a restatement
            of what happened, not a prediction of what will. Past epochs do not guarantee future
            ones, and nothing here is a promised return.
          </p>
        </>
      )}
    </section>
  );
}

/**
 * NFT Bond Series hub — the sales-journey landing for FlareForward's
 * quarterly bond-raise NFT lots. Three product surfaces hang off this page as
 * they come online:
 *
 *   1. Mint       — buy into the current lot (goes live with Lot 1's window)
 *   2. Track/claim — YOUR tokens + claimable, wallet-connected, in My Rewards
 *   3. Marketplace — buy/sell series NFTs; listings show unclaimed value
 *
 * Per-token reward data is served by /api/nft-rewards (worker/nftRewards.ts);
 * this page deliberately shows no global token table — reward tracking is a
 * personal view, not a public wall of token IDs.
 */


/**
 * The current lot's storefront. Renders one card per tier; each is a
 * "coming soon" placeholder until that tier's contract address is set in
 * lib/bondLot.ts (addresses land at launch, because deploying opens the mint).
 * `?lot=0x...` points both cards at one deployed contract for verification.
 */
function CurrentLot() {
  const [searchParams] = useSearchParams();
  const previewAddr = searchParams.get("lot");
  const preview = previewAddr && ADDRESS_RE.test(previewAddr) ? (previewAddr as `0x${string}`) : null;

  const tiers: BondTier[] = preview
    ? [{ ...CURRENT_LOT.tiers[0], address: preview, name: "Preview lot", blurb: "Verification against a deployed contract — not a FlareForward offering." }]
    : CURRENT_LOT.tiers;

  const anyLive = tiers.some((t) => t.address);

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold">
          {CURRENT_LOT.label} {anyLive ? "" : "— opening soon"}
        </h2>
        {!anyLive && (
          <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[11px] font-medium text-amber-300">
            MINT NOT YET OPEN
          </span>
        )}
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#8FA0B8]">
        {anyLive
          ? "Priced in FLR. The mint window stays open until our next P-chain bond window — then the lot closes and caps at whatever sold. Every term below is read live from the contract."
          : "Supply, price and dates announced here first. The mint window stays open until our next P-chain bond window — then the lot closes and caps at whatever sold, and the money goes to work."}
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {tiers.map((t) => (
          <MintLot key={t.key} tier={t} preview={!!preview} />
        ))}
      </div>
    </section>
  );
}

function Step({
  n,
  icon,
  title,
  body,
}: {
  n: number;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="glass-panel p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EE1A58]/15 text-sm font-bold text-[#E85A95]">
          {n}
        </span>
        <span className="text-[#E85A95]">{icon}</span>
        <h3 className="font-semibold">{title}</h3>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-[#8FA0B8]">{body}</p>
    </div>
  );
}

function SurfaceCard({
  icon,
  title,
  body,
  status,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  status: string;
}) {
  return (
    <div className="glass-panel flex flex-col p-5">
      <div className="flex items-center gap-3">
        <span className="text-[#E85A95]">{icon}</span>
        <h3 className="font-semibold">{title}</h3>
      </div>
      <p className="mt-3 flex-1 text-sm leading-relaxed text-[#8FA0B8]">{body}</p>
      <span className="mt-4 inline-flex w-fit rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-[#8FA0B8]">
        {status}
      </span>
    </div>
  );
}

export default function NftRewards() {
  return (
    <div className="p-4 lg:p-8">
      {/* Hero */}
      <div className="max-w-3xl">
        <div className="flex items-center gap-3">
          <Gem size={24} className="text-[#E85A95]" />
          <h1 className="text-2xl font-bold tracking-tight">FlareForward Bonds</h1>
        </div>
        <p className="mt-3 text-lg leading-relaxed text-[#FAFAFA]/90">
          Back the FlareForward validator bond. Earn a share of provider rewards, monthly, for as
          long as you hold.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-[#8FA0B8]">
          Every 90 days we open a limited lot of NFTs. The raise grows our self-bond — the stake
          that anchors our validator — and holders share in what the infrastructure earns. Rewards
          are paid on-chain through a distribution contract anyone can verify.
        </p>
      </div>

      {/* Current lot — the storefront. Reads every term from the contract. */}
      <CurrentLot />

      {/* Immediately below the mint: proof the buyer owns what they just bought,
          read from the contract rather than any wallet or indexer. */}
      <MyBonds compact />

      {/* How it works */}
      <h2 className="mt-10 text-xl font-semibold">How a lot works</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Step
          n={1}
          icon={<Coins size={18} />}
          title="Mint"
          body="Buy during the 90-day window, priced in FLR. Your funds go to work immediately — delegated to our FTSO provider, earning from the day you mint, not the day the bond opens."
        />
        <Step
          n={2}
          icon={<Landmark size={18} />}
          title="Bond"
          body="When our P-chain window opens, the mint closes and supply is capped at what sold. The lot's capital moves into the validator self-bond."
        />
        <Step
          n={3}
          icon={<TrendingUp size={18} />}
          title="Earn"
          body="Holders share provider rewards, deposited monthly into the lot's distribution contract. Every NFT in a lot earns an equal share — claim whenever you like."
        />
        <Step
          n={4}
          icon={<Tag size={18} />}
          title="Sell anytime"
          body="Your exit is the open market. Unclaimed rewards travel with the NFT — a token that hasn't claimed carries its balance to the buyer, and that value shows right on the listing."
        />
      </div>

      {/* The three surfaces */}
      <MeasuredPerformance />

      <h2 className="mt-10 text-xl font-semibold">The series lives in three places</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <SurfaceCard
          icon={<Coins size={18} />}
          title="Mint"
          body="The storefront for the current lot: live sold count, price, time remaining, and the mint itself."
          status="Opens with Lot 1"
        />
        <SurfaceCard
          icon={<Wallet size={18} />}
          title="Track & claim"
          body="Connect your wallet under My Rewards to see your tokens across every lot, what each has earned, and claim."
          status="Lands with Lot 1 · in My Rewards"
        />
        <SurfaceCard
          icon={<Store size={18} />}
          title="Marketplace"
          body="Buy and sell series NFTs. Every listing shows the token's unclaimed reward balance, so both sides see its real value."
          status="Opens when Lot 1 closes"
        />
      </div>

      {/* Honesty block */}
      <div className="glass-panel mt-10 max-w-3xl p-5">
        <h3 className="font-semibold">The plain-English terms</h3>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-[#8FA0B8]">
          <li>
            • Funds bond at lot close. After that, your exit is selling the NFT — there is no
            redeem-for-principal.
          </li>
          <li>
            • Distributions are equal per NFT within a lot, enforced by the distribution contract
            on-chain.
          </li>
          <li>
            • Never burn a series NFT — a burned token&apos;s share of future distributions is gone
            for good. Sell it instead.
          </li>
          <li>
            • Reward amounts follow what the infrastructure actually earns. We publish real
            distribution numbers every month; we don&apos;t publish projections.
          </li>
        </ul>
      </div>
    </div>
  );
}
