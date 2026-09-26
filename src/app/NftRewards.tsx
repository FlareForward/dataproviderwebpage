import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { useReadContracts } from "wagmi";
import { useRewards } from "../hooks/useRewards";
import { settledRate } from "../lib/rewards";
import { MintLot } from "./components/MintLot";
import { bondLotAbi, CURRENT_LOT, ADDRESS_RE, IPFS_GATEWAY, type BondTier } from "../lib/bondLot";
import { EXPLORER_URL } from "../lib/flare";
import { useValidatorStaking } from "../hooks/useValidatorStaking";
import { Gem, Coins, TrendingUp, Landmark, Tag, Store, Activity, HeartHandshake, FileText, ExternalLink } from "lucide-react";

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
  last_measured?: {
    reward_epoch: number;
    bond_rate_annualized_pct: number | null;
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

/**
 * The live epoch reports 0 until it settles, and 0 is a number — so an
 * unmeasured epoch used to render as "0.00%" on a page selling the bond.
 * Nothing measured means nothing to show.
 */
function pct(v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? `${v.toFixed(2)}%` : "—";
}

function fmtCount(v: bigint | null | undefined): string {
  return v != null ? v.toLocaleString("en-US") : "—";
}

function remainingFor(status: TierStatus): bigint | null {
  if (status.maxSupply == null || status.sold == null) return null;
  const remaining = status.maxSupply - status.sold;
  return remaining > 0n ? remaining : 0n;
}

/** A tier is on sale only when the contract says open AND something is left. */
function isOpen(status: TierStatus): boolean {
  return status.mintOpen === true && remainingFor(status) !== 0n;
}

function mintStateLabel(status: TierStatus, loading: boolean): string {
  if (!status.address) return "Mint not open";
  const remaining = remainingFor(status);
  if (remaining === 0n) return "Sold out";
  if (status.mintOpen === false) return "Closed";
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

/**
 * One line under the title, read from the contracts. When every lot is closed
 * it says so and counts what was issued; "remaining" only means something
 * while a lot is open.
 */
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
      <p className="mt-4 text-sm text-amber-300">No lot is open. The next one is announced here first.</p>
    );
  }

  const allRead = liveStatuses.every(
    (s) => s.maxSupply != null && s.sold != null && s.mintOpen != null,
  );

  if (statusLoading && !allRead) {
    return <p className="mt-4 text-sm text-[#8FA0B8]">Reading the lot contracts…</p>;
  }

  const minted = liveStatuses.reduce((sum, s) => sum + (s.sold ?? 0n), 0n);
  const openStatuses = liveStatuses.filter(isOpen);

  if (openStatuses.length === 0) {
    return (
      <p className="mt-4 text-sm text-[#8FA0B8]">
        Every lot is closed. <span className="text-[#FAFAFA]">{fmtCount(minted)} bonds</span> issued
        across {liveStatuses.length} lots. The next lot is announced here first.
      </p>
    );
  }

  const remaining = openStatuses.reduce((sum, s) => sum + (remainingFor(s) ?? 0n), 0n);
  return (
    <p className="mt-4 max-w-3xl rounded-xl border border-[#E85A95]/30 bg-[#E85A95]/10 px-4 py-3 text-sm font-medium text-[#FAFAFA]">
      Mint open. {fmtCount(remaining)} remaining across {openStatuses.length}{" "}
      {openStatuses.length === 1 ? "lot" : "lots"}.
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

  // The live epoch reads zero until it settles — 3.5 days of showing nothing on
  // the page that sells the bond. Use it once it is real, else the last epoch
  // that actually paid out, and let the epoch label say which one is on screen.
  const live = data?.current;
  const cur =
    live && typeof live.bond_rate_annualized_pct === "number" && live.bond_rate_annualized_pct > 0
      ? live
      : data?.last_measured
        ? { ...data.last_measured, delegator_staking_pct: null, delegation_fee_pct: null }
        : live;

  // Fallback for the delegator tile: the rewards API measures the same rate
  // and is what the staking page already shows.
  const { data: rewards } = useRewards();
  const delegatorPct =
    cur?.delegator_staking_pct ?? settledRate(rewards?.rates.staking_annual_pct);

  return (
    <section className="mt-10">
      <div className="flex items-center gap-3">
        <Activity size={20} className="text-[#E85A95]" />
        <h2 className="text-xl font-semibold">What the validator bond is earning</h2>
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#8FA0B8]">
        Measured from closed epochs, restated annually. It moves epoch to epoch and is not a
        promised rate. No holder distribution has been paid yet; this is what the validator earns.
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
                Bond rate, annualized
              </p>
              <p className="mt-1 text-3xl font-semibold text-[#FAFAFA]">
                {pct(cur.bond_rate_annualized_pct)}
              </p>
              <p className="mt-1 text-xs text-[#8FA0B8]">
                staking {pct(cur.staking_component_pct)} + pure {pct(cur.pure_component_pct)}
              </p>
            </div>
            <div className="glass-panel p-5">
              <p className="text-xs uppercase tracking-wide text-[#8FA0B8]">
                Delegator staking rate, annualized
              </p>
              {/* The bond-yield fallback bucket nulls the delegator rate, which
                  left this tile a dash for 3.5 days at a stretch — on the page
                  whose whole argument is the gap between the two numbers. The
                  rewards API publishes the same measured delegator rate, so use
                  it whenever the primary read has nothing. */}
              <p className="mt-1 text-3xl font-semibold">{pct(delegatorPct)}</p>
              <p className="mt-1 text-xs text-[#8FA0B8]">
                after our {cur.delegation_fee_pct ?? 20}% provider fee
              </p>
            </div>
          </div>

          <p className="mt-3 max-w-3xl text-xs leading-relaxed text-[#8FA0B8]/80">
            The bond is our own stake, so no delegation fee comes off it, and it earns a second
            component delegated stake does not. Epoch-by-epoch record on{" "}
            <Link to="/analytics" className="text-[#E85A95] hover:underline">
              Analytics
            </Link>
            .
          </p>
        </>
      )}
    </section>
  );
}

/**
 * When an open lot closes, tied to the thing that actually decides it: the
 * current bond period on FlareForward's validator. Only rendered while a lot
 * is open. Says nothing about when the NEXT lot opens — do not reintroduce a
 * "next lot opens then" claim here without confirming it first.
 */
function LotCloseLine() {
  const { data: validator } = useValidatorStaking();
  const endUnix = validator?.active_end_unix ?? null;

  if (!endUnix) {
    return (
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#8FA0B8]">
        The open lot closes as the current bond period ends, when the raised capital is bonded.
      </p>
    );
  }

  const end = new Date(endUnix * 1000);
  const daysLeft = Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86_400_000));

  return (
    <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#8FA0B8]">
      The open lot closes as the current bond period ends,{" "}
      <span className="text-[#FAFAFA] font-medium">
        {end.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
      </span>
      {daysLeft > 0 && <> ({daysLeft} {daysLeft === 1 ? "day" : "days"} away)</>}. The mint
      contract itself has no deadline.
    </p>
  );
}

/**
 * The lots. Closed lots collapse to one row each; only a lot that is actually
 * on sale gets the full storefront card. Every figure is read from the tier
 * contract, so when the next lot deploys its card appears on its own.
 */
function Lots({
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
  const statusFor = (tier: BondTier): TierStatus =>
    statuses.find((s) => s.key === tier.key) ?? { key: tier.key, address: tier.address };

  const openTiers = tiers.filter((t) => t.address && isOpen(statusFor(t)));
  const closedTiers = tiers.filter((t) => t.address && !isOpen(statusFor(t)));
  const anyOpen = openTiers.length > 0;

  return (
    <section className="mt-10" aria-labelledby="lots-title">
      <h2 id="lots-title" className="text-xl font-semibold">
        {anyOpen ? "Mint the open lot" : "The lots"}
      </h2>
      {anyOpen && <LotCloseLine />}

      {anyOpen && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {openTiers.map((tier) => (
            <TierOffer
              key={tier.key}
              tier={tier}
              status={statusFor(tier)}
              statusLoading={statusLoading}
              preview={preview}
            />
          ))}
        </div>
      )}

      {closedTiers.length > 0 && (
        <div className={`glass-panel ${anyOpen ? "mt-6" : "mt-4"} p-0`}>
          {anyOpen && (
            <p className="border-b border-white/8 px-4 py-2 text-xs uppercase tracking-wide text-[#8FA0B8]">
              Closed lots
            </p>
          )}
          <ul className="divide-y divide-white/8">
            {closedTiers.map((tier) => {
              const status = statusFor(tier);
              return (
                <li key={tier.key} className="flex items-center gap-4 px-4 py-3">
                  {tier.imageCid && (
                    <img
                      src={`${IPFS_GATEWAY}/${tier.imageCid}`}
                      alt=""
                      loading="lazy"
                      className="h-10 w-10 shrink-0 rounded-lg object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[#FAFAFA]">{tier.name}</p>
                    <p className="text-xs text-[#8FA0B8]">
                      {fmtCount(status.sold)} / {fmtCount(status.maxSupply)} minted
                    </p>
                  </div>
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${mintStateTone(status, statusLoading)}`}
                  >
                    {mintStateLabel(status, statusLoading)}
                  </span>
                  {tier.address && (
                    <a
                      href={`${EXPLORER_URL}/address/${tier.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#8FA0B8] hover:text-[#FAFAFA]"
                      aria-label={`${tier.name} contract on the explorer`}
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {!anyOpen && (
        <p className="mt-3 text-sm text-[#8FA0B8]">
          Closed lots are capped at what sold and their capital is bonded. Bonds trade on the
          secondary market.
        </p>
      )}
    </section>
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
        <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${tone}`}>
          {state}
        </span>
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

/**
 * /nft — FlareForward Bonds. Short by operator call (2026-09-26): the lots,
 * what the bond earns, how a lot works, and a pointer to the disclosures.
 * Custody, risks, terms and wallet footnotes live at /nft/disclosures.
 */
export default function NftRewards() {
  const { tiers, preview } = useDisplayedLot();
  const { statuses, statusLoading } = useTierStatuses(tiers);

  return (
    <div className="p-4 lg:p-8">
      <div className="max-w-3xl">
        <div className="flex items-center gap-3">
          <Gem size={24} className="text-[#E85A95]" />
          <h1 className="text-2xl font-bold tracking-tight">FlareForward Bonds</h1>
        </div>
        <p className="mt-3 text-lg leading-relaxed text-[#FAFAFA]/90">
          A bond NFT adds FLR to the self-bond behind our FTSO validator. The FLR is not
          returned. You hold the NFT, holders share what the validator earns, and selling the NFT
          is the exit.
        </p>
        <LeadStatus statuses={statuses} statusLoading={statusLoading} />
      </div>

      <Lots tiers={tiers} statuses={statuses} statusLoading={statusLoading} preview={preview} />

      {/* The one link a buyer needs before they buy, kept next to the lots
          rather than in a footer. Disclosure nobody reaches is not disclosure. */}
      <Link
        to="/nft/disclosures"
        className="glass-panel mt-4 flex items-center gap-3 p-4 text-sm transition hover:bg-white/[0.06]"
      >
        <FileText size={18} className="shrink-0 text-[#E85A95]" />
        <span className="text-[#FAFAFA]">
          Read the disclosures before you buy:{" "}
          <span className="text-[#8FA0B8]">who holds your money, what you are taking on, and the terms.</span>
        </span>
      </Link>

      <MeasuredPerformance />

      <h2 className="mt-10 text-xl font-semibold">How a lot works</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Step
          n={1}
          icon={<Coins size={18} />}
          title="Mint"
          body="Buy while a lot is open. Price, minted count, and remaining supply are read from the contract."
        />
        <Step
          n={2}
          icon={<Landmark size={18} />}
          title="Bond"
          body="As the bond period ends, the lot closes and the raised FLR moves into the validator self-bond."
        />
        <Step
          n={3}
          icon={<TrendingUp size={18} />}
          title="Measure"
          body="After closed epochs, we measure what the validator earned and deposit holder rewards into the lot's distribution contract. Equal share per NFT."
        />
        <Step
          n={4}
          icon={<Tag size={18} />}
          title="Sell"
          body="The exit is selling the NFT to another buyer. Unclaimed rewards travel with it. No redemption window is open or scheduled."
        />
      </div>

      {/* Giving, deliberately loose. Signal the intent before the details
          exist while promising nothing: no cause named, no percentage, no
          date. When the partner and the split are settled they get published
          here, transactions and all. */}
      <section className="mt-10">
        <div className="glass-panel p-5">
          <div className="flex flex-wrap items-center gap-3">
            <HeartHandshake size={18} className="text-[#E85A95]" />
            <h3 className="font-semibold">Giving back</h3>
            <span className="inline-flex rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
              In the works
            </span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-[#8FA0B8]">
            We are shaping a way for part of what the infrastructure earns to go to a cause worth
            backing. Nothing is promised yet; when it is settled, the details go here, transactions
            and all. One thing works today: a bond can be given away. Send it to an address the
            recipient controls, and never burn it.
          </p>
        </div>
      </section>

      {/* One exit on the page, by operator call 2026-08-17: the marketplace.
          Do NOT reinstate a redemption card without an operator decision. */}
      <section className="mt-6">
        <div className="glass-panel p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Store size={18} className="text-[#E85A95]" />
            <h3 className="font-semibold">Marketplace</h3>
            <span className="inline-flex rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
              Coming soon
            </span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-[#8FA0B8]">
            Buy a bond from another holder, or list yours at whatever price you choose. Listings
            will show any unclaimed rewards a bond carries. In build now.
          </p>
        </div>
      </section>
    </div>
  );
}
