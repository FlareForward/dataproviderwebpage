import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { useReadContracts } from "wagmi";
import { useRewards } from "../hooks/useRewards";
import { settledRate } from "../lib/rewards";
import { MintLot } from "./components/MintLot";
import { bondLotAbi, CURRENT_LOT, ADDRESS_RE, type BondTier } from "../lib/bondLot";
import { useValidatorStaking } from "../hooks/useValidatorStaking";
import { Gem, Coins, TrendingUp, Landmark, Tag, Wallet, Store, Activity, Undo2, HeartHandshake } from "lucide-react";

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
        <h2 className="text-xl font-semibold">The current bond APY</h2>
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#8FA0B8]">
        This is what our validator bond earns right now. We are not guaranteeing it will be the
        rate when you bond with us — it moves epoch to epoch. We publish what we measure.
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
                Bond APY — what our validator bond earns
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
                P-chain staking APY — what a delegator earns
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

          {/* The provider-income tile, epoch counter, and the week-by-week
              table came off this page by operator call: this is the mint page,
              and epoch bookkeeping is analytics' job. What stays is the one
              honest sentence the numbers above need. */}
          <p className="mt-3 max-w-3xl text-xs leading-relaxed text-[#8FA0B8]/80">
            These are measured rates, not promises — past performance does not guarantee future
            rates. The full epoch-by-epoch record lives on{" "}
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
 * Rabby does not pull this collection's artwork in on its own yet, so a freshly
 * minted bond can land in the wallet's hidden section looking like nothing
 * happened. Sits outside `MintLot` so it stays on screen after a mint, which is
 * exactly when someone goes looking for the token and does not find it.
 */
function RabbyArtworkNote() {
  return (
    <div className="mt-3 flex max-w-3xl gap-3 rounded-lg border border-amber-400/25 bg-amber-400/10 p-3">
      <Wallet size={16} className="mt-0.5 shrink-0 text-amber-300" />
      <p className="text-sm leading-relaxed text-[#FAFAFA]/90">
        <span className="font-medium">Using Rabby?</span> Rabby doesn&apos;t pull this
        collection&apos;s artwork in automatically yet, so your bond may show up under the
        wallet&apos;s hidden section rather than with the rest of your NFTs. It is still yours and
        still on-chain — check the hidden section to see it. We&apos;ve submitted the collection
        details to Rabby; until they pick them up, the artwork may not render there.
      </p>
    </div>
  );
}

/**
 * When the lot closes, tied to the thing that actually decides it: the current
 * bond period on FlareForward's validator. The mint closes as that period ends,
 * because that is when the raised capital is bonded.
 *
 * Deliberately says nothing about when the NEXT lot opens — it does not follow
 * straight on from this one, and the timing is not settled. Do not reintroduce
 * a "next lot opens then" claim here without confirming it first.
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
        validator.
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
      capital is bonded to the validator. The date tracks the validator's current bond period
      on-chain; the mint contract itself has no deadline.
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


      <MeasuredPerformance />

      <h2 className="mt-10 text-xl font-semibold">How a lot works</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Step
          n={1}
          icon={<Coins size={18} />}
          title="Mint"
          body="Buy while the lot is open. Price, minted count, and remaining supply all come straight from the tier contract, so what you see is what the chain says."
        />
        <Step
          n={2}
          icon={<Landmark size={18} />}
          title="Bond"
          body="As the current bond period ends, minting closes and the raised FLR moves into FlareForward's validator self-bond."
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

      <CurrentLot
        tiers={tiers}
        statuses={statuses}
        statusLoading={statusLoading}
        preview={preview}
      />

      {/* Giving, deliberately loose. The operator's call: signal the intent
          long before the details exist -- another reason to back us -- while
          promising nothing. No cause is named, no percentage stated, no date
          given; the only concrete thing here is the one that already works
          today, gifting a bond, which is a plain NFT transfer. When the
          partner and the split are settled they get published here in the
          same plain English, transactions and all. */}
      <section className="mt-10 space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[#8FA0B8]">
          Giving back
        </h3>
        {/* Full width, with the two paragraphs in a matched pair of columns.
            These sections were pinned to max-w-3xl while everything above them
            ran the full page, so the bottom half of /nft was a narrow stack down
            the left with dead space beside it. Splitting the prose keeps the
            line length readable at full width rather than running one very long
            measure across the page. */}
        <div className="glass-panel p-5">
          <div className="flex flex-wrap items-center gap-3">
            <HeartHandshake size={18} className="text-[#E85A95]" />
            <h3 className="font-semibold">Your working money, working for a cause</h3>
            <span className="inline-flex rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
              In the works
            </span>
          </div>
          <div className="mt-3 grid gap-x-8 gap-y-3 lg:grid-cols-2">
            <p className="text-sm leading-relaxed text-[#8FA0B8]">
              We&apos;re shaping a way for this project to give — part of what the infrastructure
              earns going to a cause worth backing. Choosing who, and settling how much, is going to
              take time, and we&apos;d rather get it right than get it named. Nothing is promised
              yet; when it&apos;s settled, the details go here in plain English, transactions and
              all. More ways to give alongside the bonds are on the drawing board too.
            </p>
            <p className="text-sm leading-relaxed text-[#8FA0B8]">
              <span className="font-medium text-[#FAFAFA]">One thing already works today:</span> a
              bond is a gift that keeps giving. Mint one and send it to an organization you care
              about — whoever holds a bond holds its share of the lot&apos;s distributions, for as
              long as they hold it. Make sure it goes to an address they control, and as always:
              sell or send, never burn.
            </p>
          </div>
        </div>
      </section>

      {/* Getting out, in one place. Two routes, at very different stages: the
          marketplace is being built, redemption is not agreed and has no
          published terms. They are labelled differently on purpose -- a matched
          pair of "coming soon" badges would imply redemption is as settled as
          the marketplace, and the terms directly below still say there is no
          redeem-for-principal. Nothing here promises one. */}
      <section className="mt-10 space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[#8FA0B8]">
          When you want out
        </h3>

        {/* The two exits sit side by side rather than stacked — they are a pair
            of alternatives, and reading them as a pair is the point. */}
        <div className="grid gap-4 lg:grid-cols-2 items-stretch">
        <div className="glass-panel h-full p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Store size={18} className="text-[#E85A95]" />
            <h3 className="font-semibold">Sell on the marketplace</h3>
            <span className="inline-flex rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
              Coming soon
            </span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-[#8FA0B8]">
            Buy a bond from another holder instead of minting a new one. A listed bond can carry
            unclaimed rewards, so both sides can see what it&apos;s actually worth. Holders will be
            able to list at whatever price they choose. In build now.
          </p>
        </div>

        <div className="glass-panel h-full p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Undo2 size={18} className="text-[#8FA0B8]" />
            <h3 className="font-semibold">Redeem your bond</h3>
            <span className="inline-flex rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#8FA0B8]">
              Under review
            </span>
          </div>
          {/* Updated 08-16 once the mechanism was settled with the distributor's
              author: redemption is not a new contract, it is the distribution
              rail run in reverse — deposit principal, split per bond, claim.
              What stays open is whether and when we run it, so no terms are
              promised and the terms below still describe today. */}
          <p className="mt-3 text-sm leading-relaxed text-[#8FA0B8]">
            The rails for this already exist: the same distribution contract that pays rewards can
            return principal — FLR deposited into it is split equally across every bond and claimed
            like any other distribution. No burning, ever; a burned bond&apos;s share is gone for
            good. Whether and when we open a redemption window is the decision still in front of
            us, so today your exit is selling the NFT. The exact rules will be published here in
            plain English before anything ships.
          </p>
        </div>
        </div>
      </section>

      <div className="glass-panel mt-10 p-5">
        <h3 className="font-semibold">The plain-English terms</h3>
        <ul className="mt-3 grid gap-x-8 gap-y-2 text-sm leading-relaxed text-[#8FA0B8] lg:grid-cols-2">
          <li>
            • Funds bond at lot close. After that, your exit is selling the NFT — there is no
            redeem-for-principal.
          </li>
          <li>
            • Distributions will be equal per NFT within a lot, enforced on-chain by that
            lot&apos;s distribution contract once it is deployed.
          </li>
          <li>
            • Never burn a series NFT — a burned token&apos;s share of future distributions is gone
            for good. Sell it instead.
          </li>
          <li>
            • Reward amounts follow what the infrastructure actually earns. Once distributions
            begin we will publish the real numbers; we do not publish projections.
          </li>
        </ul>
      </div>

      {/* Wallet quirks and other footnotes live at the bottom by operator call
          — useful the moment you need them, noise the rest of the time. */}
      <section className="mt-10">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[#8FA0B8]">
          Good to know
        </h3>
        <RabbyArtworkNote />
      </section>
    </div>
  );
}
