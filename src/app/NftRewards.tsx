import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { useReadContracts } from "wagmi";
import { MintLot } from "./components/MintLot";
import { MyBonds } from "./components/MyBonds";
import { bondLotAbi, CURRENT_LOT, ADDRESS_RE, type BondTier } from "../lib/bondLot";
import { useValidatorStaking } from "../hooks/useValidatorStaking";
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

interface TierStatus {
  key: string;
  address: `0x${string}` | null;
  maxSupply?: bigint;
  sold?: bigint;
  mintOpen?: boolean;
}

function pct(v: number | null | undefined): string {
  return typeof v === "number" ? `${v.toFixed(2)}%` : "—";
}

function fmtCount(v: bigint | null | undefined): string {
  return v != null ? v.toLocaleString("en-US") : "—";
}

function remainingFor(status: TierStatus): bigint | null {
  if (status.maxSupply == null || status.sold == null) return null;
  const remaining = status.maxSupply - status.sold;
  return remaining > 0n ? remaining : 0n;
}

function mintStateLabel(status: TierStatus, loading: boolean): string {
  if (!status.address) return "Mint not open";
  const remaining = remainingFor(status);
  if (remaining === 0n) return "Sold out";
  if (status.mintOpen === false) return "Mint closed";
  if (status.mintOpen === true) return "Mint open";
  return loading ? "Reading mint state" : "Mint state unavailable";
}

function mintStateTone(status: TierStatus, loading: boolean): string {
  const label = mintStateLabel(status, loading);
  if (label === "Mint open") {
    return "border-emerald-400/40 bg-emerald-400/10 text-emerald-300";
  }
  if (label === "Mint not open" || label === "Reading mint state") {
    return "border-amber-400/40 bg-amber-400/10 text-amber-300";
  }
  return "border-white/15 bg-white/5 text-[#8FA0B8]";
}

function useDisplayedLot() {
  const [searchParams] = useSearchParams();
  const previewAddr = searchParams.get("lot");
  const preview = previewAddr && ADDRESS_RE.test(previewAddr) ? (previewAddr as `0x${string}`) : null;

  const tiers: BondTier[] = useMemo(
    () =>
      preview
        ? [
            {
              ...CURRENT_LOT.tiers[0],
              address: preview,
              name: "Preview lot",
              blurb: "Verification against a deployed contract, not a FlareForward offering.",
            },
          ]
        : CURRENT_LOT.tiers,
    [preview],
  );

  return { tiers, preview: !!preview };
}

function useTierStatuses(tiers: BondTier[]) {
  const liveTiers = useMemo(
    () => tiers.filter((t): t is BondTier & { address: `0x${string}` } => !!t.address),
    [tiers],
  );

  const contracts = useMemo(
    () =>
      liveTiers.flatMap((tier) => {
        const contract = { address: tier.address, abi: bondLotAbi } as const;
        return [
          { ...contract, functionName: "maxSupply" as const },
          { ...contract, functionName: "totalSupply" as const },
          { ...contract, functionName: "mintOpen" as const },
        ];
      }),
    [liveTiers],
  );

  const { data, isLoading } = useReadContracts({
    contracts,
    query: { enabled: contracts.length > 0, refetchInterval: 30_000 },
  });

  const statuses = useMemo(() => {
    const byKey = new Map<string, TierStatus>();
    liveTiers.forEach((tier, index) => {
      const offset = index * 3;
      byKey.set(tier.key, {
        key: tier.key,
        address: tier.address,
        maxSupply: data?.[offset]?.result as bigint | undefined,
        sold: data?.[offset + 1]?.result as bigint | undefined,
        mintOpen: data?.[offset + 2]?.result as boolean | undefined,
      });
    });

    return tiers.map(
      (tier) => byKey.get(tier.key) ?? { key: tier.key, address: tier.address },
    );
  }, [data, liveTiers, tiers]);

  return { statuses, statusLoading: isLoading };
}

function LeadStatus({
  statuses,
  statusLoading,
}: {
  statuses: TierStatus[];
  statusLoading: boolean;
}) {
  const liveStatuses = statuses.filter((s) => s.address);

  if (liveStatuses.length === 0) {
    return (
      <p className="mt-4 max-w-3xl rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm font-medium text-amber-300">
        Live status: mint not open yet. Contract-read minted/total, remaining supply, and open
        state will appear here when the lot is deployed.
      </p>
    );
  }

  const allRead = liveStatuses.every(
    (s) => s.maxSupply != null && s.sold != null && s.mintOpen != null,
  );

  if (statusLoading && !allRead) {
    return (
      <p className="mt-4 max-w-3xl rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm font-medium text-amber-300">
        Live status: reading minted/total, remaining supply, and open state from the tier
        contracts.
      </p>
    );
  }

  const totalSupply = liveStatuses.reduce((sum, s) => sum + (s.maxSupply ?? 0n), 0n);
  const minted = liveStatuses.reduce((sum, s) => sum + (s.sold ?? 0n), 0n);
  const remaining = liveStatuses.reduce((sum, s) => sum + (remainingFor(s) ?? 0n), 0n);
  const anyOpen = liveStatuses.some((s) => s.mintOpen === true && remainingFor(s) !== 0n);
  const allSoldOut = liveStatuses.every((s) => remainingFor(s) === 0n);
  const allClosed = liveStatuses.every((s) => s.mintOpen === false);
  const state = allSoldOut ? "sold out" : anyOpen ? "mint open" : allClosed ? "mint closed" : "status unavailable";

  return (
    <p className="mt-4 max-w-3xl rounded-xl border border-[#E85A95]/30 bg-[#E85A95]/10 px-4 py-3 text-sm font-medium text-[#FAFAFA]">
      Live status: {state}. {fmtCount(minted)} / {fmtCount(totalSupply)} minted;{" "}
      {fmtCount(remaining)} remaining.
    </p>
  );
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
 * `?lot=0x...` points the storefront at a deployed contract for verification.
 */
function CurrentLot({
  tiers,
  statuses,
  statusLoading,
  preview,
}: {
  tiers: BondTier[];
  statuses: TierStatus[];
  statusLoading: boolean;
  preview: boolean;
}) {
  const anyLive = tiers.some((t) => t.address);

  return (
    <section className="mt-8" aria-labelledby="current-lot-title">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="current-lot-title" className="text-xl font-semibold">
          {CURRENT_LOT.label}: mint the current lot
        </h2>
        {!anyLive && (
          <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[11px] font-medium text-amber-300">
            MINT NOT YET OPEN
          </span>
        )}
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#8FA0B8]">
        {anyLive
          ? "Price, supply, sold count, remaining supply, and mint state are read live from each tier contract."
          : "Price, supply, sold count, remaining supply, and mint state will be read from each tier contract once deployed."}
      </p>
      <LotCloseLine />
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {tiers.map((tier) => (
          <TierOffer
            key={tier.key}
            tier={tier}
            status={statuses.find((s) => s.key === tier.key) ?? { key: tier.key, address: tier.address }}
            statusLoading={statusLoading}
            preview={preview}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * When the lot closes, tied to the thing that actually decides it: the current
 * bond period on FlareForward's validator. The mint closes as that period ends,
 * because that is when the raised capital is bonded and the next lot opens.
 *
 * `active_end_unix` is the validator's live registration end from the Explorer,
 * so this date maintains itself — re-bonding moves it forward with no config to
 * update here. The bond contract itself carries no deadline, so the wording must
 * not read as a contractual cutoff.
 */
function LotCloseLine() {
  const { data: validator } = useValidatorStaking();
  const endUnix = validator?.active_end_unix ?? null;

  if (!endUnix) {
    return (
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#8FA0B8]">
        This lot closes as the current bond period ends, when the raised capital is bonded to the
        validator and the next lot opens.
      </p>
    );
  }

  const end = new Date(endUnix * 1000);
  const daysLeft = Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86_400_000));

  return (
    <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#8FA0B8]">
      This lot closes as the current bond period ends —{" "}
      <span className="text-[#FAFAFA] font-medium">
        {end.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
      </span>
      {daysLeft > 0 && <> ({daysLeft} {daysLeft === 1 ? "day" : "days"} away)</>} — when the raised
      capital is bonded to the validator and the next lot opens. The date tracks the validator's
      current bond period on-chain; the mint contract itself has no deadline.
    </p>
  );
}

function TierOffer({
  tier,
  status,
  statusLoading,
  preview,
}: {
  tier: BondTier;
  status: TierStatus;
  statusLoading: boolean;
  preview: boolean;
}) {
  const remaining = remainingFor(status);
  const state = mintStateLabel(status, statusLoading);
  const tone = mintStateTone(status, statusLoading);

  return (
    <div>
      <div className="rounded-t-xl border border-white/10 bg-white/[0.045] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${tone}`}>
            {state}
          </span>
          <span className="text-xs font-medium text-[#8FA0B8]">
            {status.mintOpen === true
              ? "mintOpen true"
              : status.mintOpen === false
                ? "mintOpen false"
                : "mintOpen reading"}
          </span>
        </div>
        <p className="mt-2 text-sm font-medium text-[#FAFAFA]">
          {fmtCount(status.sold)} / {fmtCount(status.maxSupply)} minted ·{" "}
          {fmtCount(remaining)} remaining
        </p>
      </div>
      <div className="-mt-px [&>.glass-panel]:rounded-t-none">
        <MintLot tier={tier} preview={preview} />
      </div>
    </div>
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
  const { tiers, preview } = useDisplayedLot();
  const { statuses, statusLoading } = useTierStatuses(tiers);

  return (
    <div className="p-4 lg:p-8">
      <div className="max-w-3xl">
        <div className="flex items-center gap-3">
          <Gem size={24} className="text-[#E85A95]" />
          <h1 className="text-2xl font-bold tracking-tight">
            Fund FlareForward&apos;s validator self-bond
          </h1>
        </div>
        <p className="mt-3 text-lg leading-relaxed text-[#FAFAFA]/90">
          Minting a FlareForward Bond NFT adds FLR to the self-bond behind our FTSO validator. That
          capital grows the validator, and the validator&apos;s measured earnings are what back
          holder rewards paid through on-chain contracts.
        </p>
        <LeadStatus statuses={statuses} statusLoading={statusLoading} />
      </div>

      <CurrentLot
        tiers={tiers}
        statuses={statuses}
        statusLoading={statusLoading}
        preview={preview}
      />

      <MeasuredPerformance />

      <h2 className="mt-10 text-xl font-semibold">How a lot works</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Step
          n={1}
          icon={<Coins size={18} />}
          title="Mint"
          body="Buy while the tier contract reports mintOpen true. Price, minted count, and remaining supply are read from that contract."
        />
        <Step
          n={2}
          icon={<Landmark size={18} />}
          title="Bond"
          body="When the P-chain staking window opens, minting closes and the raised FLR moves into FlareForward's validator self-bond."
        />
        <Step
          n={3}
          icon={<TrendingUp size={18} />}
          title="Measure"
          body="After closed epochs, we measure provider earnings and deposit holder rewards into the lot's distribution contract. Every NFT in a lot has an equal claim."
        />
        <Step
          n={4}
          icon={<Tag size={18} />}
          title="Sell anytime"
          body="Your exit is the open market. Unclaimed rewards travel with the NFT, so a token that has not claimed carries its balance to the buyer."
        />
      </div>

      <h2 className="mt-10 text-xl font-semibold">The series lives in three places</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <SurfaceCard
          icon={<Coins size={18} />}
          title="Mint"
          body="The storefront for the current lot: live sold count, remaining supply, price, open/closed state, and the mint itself."
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

      <MyBonds compact />

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
