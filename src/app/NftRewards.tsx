import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useReadContracts } from "wagmi";
import { MintLot } from "./components/MintLot";
import { MintTermLot } from "./components/MintTermLot";
import {
  bondLotAbi,
  termBondAbi,
  CURRENT_LOT,
  ADDRESS_RE,
  IPFS_GATEWAY,
  isShareTier,
  isTermTier,
  type BondTier,
} from "../lib/bondLot";
import { EXPLORER_URL, TERM_CHAIN } from "../lib/flare";
import { TERM_PREVIEW } from "../lib/termPreview";
import { FTSO_V2_GOAL_FLR, FTSO_V2_LAUNCH_FLR, STARSHIP2_INTRO } from "../lib/starship2Copy";
import { StakingBatchTimer } from "./components/StarshipStrip";
import { Gem, Coins, TrendingUp, Landmark, Tag, Activity, HeartHandshake, FileText, ExternalLink, ChevronDown } from "lucide-react";
import { useBondApy } from "../hooks/useBondApy";
import { fmtPct } from "../lib/rewards";

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
function fmtCount(v: bigint | null | undefined): string {
  return v != null ? v.toLocaleString("en-US") : "-";
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
    () => {
      if (!preview) return CURRENT_LOT.tiers;
      const firstShareTier = CURRENT_LOT.tiers.find(isShareTier) ?? CURRENT_LOT.tiers[0];
      return [
        {
          ...firstShareTier,
          address: preview,
          name: "Preview lot",
          blurb: "Verification against a deployed contract, not a FlareForward offering.",
        },
        ...CURRENT_LOT.tiers.filter(isTermTier),
      ];
    },
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
 * FTSO V2 as a series: whether any tier is selling right now, and the FLR
 * raised so far (bonds sold x mint price, summed over the tiers). Read from
 * the tier contracts; wagmi dedupes these against MintTermLot's own calls.
 * Both are null until measured, so the bar never shows a figure it has not read.
 */
function useTermSeries(termTiers: BondTier[]): { selling: boolean | null; raisedWei: bigint | null } {
  const contracts = useMemo(
    () =>
      termTiers
        .filter((t): t is BondTier & { address: `0x${string}` } => !!t.address)
        .flatMap((tier) => {
          const contract = { address: tier.address, abi: termBondAbi, chainId: TERM_CHAIN.id } as const;
          return [
            { ...contract, functionName: "maxSupply" as const },
            { ...contract, functionName: "totalSupply" as const },
            { ...contract, functionName: "isMintOpen" as const },
            { ...contract, functionName: "saleClosed" as const },
            { ...contract, functionName: "mintPrice" as const },
          ];
        }),
    [termTiers],
  );

  const { data, isLoading } = useReadContracts({
    contracts,
    query: { enabled: contracts.length > 0, refetchInterval: 30_000 },
  });

  if (contracts.length === 0) return { selling: false, raisedWei: 0n };
  if (isLoading || !data) return { selling: null, raisedWei: null };
  let selling = false;
  let raisedWei: bigint | null = 0n;
  for (let i = 0; i < data.length; i += 5) {
    const maxSupply = data[i]?.result as bigint | undefined;
    const sold = data[i + 1]?.result as bigint | undefined;
    const mintOpen = data[i + 2]?.result as boolean | undefined;
    const saleClosed = data[i + 3]?.result as boolean | undefined;
    const price = data[i + 4]?.result as bigint | undefined;
    const soldOut = maxSupply != null && sold != null && sold >= maxSupply;
    if (mintOpen === true && saleClosed !== true && !soldOut) selling = true;
    raisedWei = raisedWei != null && sold != null && price != null ? raisedWei + sold * price : null;
  }
  return { selling, raisedWei };
}

/**
 * Raise progress on the FTSO V2 bar (operator 2026-10-23): the 10M goal, what
 * is raised so far, and the 3M mark where the new validator launches. The goal
 * matches the three tiers sold out; the launch mark is a FlareForward call,
 * not a contract value, so it lives in starship2Copy.
 */
function RaiseProgress({ raisedWei }: { raisedWei: bigint | null }) {
  const WEI = 10n ** 18n;
  const goal = FTSO_V2_GOAL_FLR * WEI;
  const launch = FTSO_V2_LAUNCH_FLR * WEI;
  const raised = raisedWei ?? 0n;
  const pct = (wei: bigint) => Math.min(100, Number((wei * 10000n) / goal) / 100);
  const launched = raisedWei != null && raised >= launch;
  const flr = (wei: bigint) => (wei / WEI).toLocaleString("en-US");

  return (
    <span className="block">
      <span className="flex items-baseline justify-between gap-3 text-xs">
        <span className="uppercase tracking-wide text-[#8FA0B8]">Raised</span>
        <span className="tabular-nums text-[#8FA0B8]">
          <span className="text-sm font-semibold text-[#FAFAFA]">
            {raisedWei == null ? "-" : flr(raised)}
          </span>{" "}
          / {flr(goal)} FLR goal
        </span>
      </span>
      <span
        className="relative mt-2 block h-2 rounded-full bg-white/10"
        role="progressbar"
        aria-label="FTSO V2 raised toward the goal"
        aria-valuemin={0}
        aria-valuemax={Number(FTSO_V2_GOAL_FLR)}
        aria-valuenow={Number(raised / WEI)}
      >
        <span
          className="block h-full rounded-full bg-gradient-to-r from-[#EE1A58] to-[#E85A95] transition-[width] duration-700 motion-reduce:transition-none"
          style={{ width: `${pct(raised)}%`, minWidth: raised > 0n ? "0.5rem" : undefined }}
        />
        <span
          className="absolute -bottom-1 -top-1 w-0.5 rounded-full bg-white/80"
          style={{ left: `${pct(launch)}%` }}
          aria-hidden="true"
        />
      </span>
      <span className="relative mt-1 block h-4 text-[10px] font-semibold uppercase tracking-wide text-[#FAFAFA]/80">
        <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${pct(launch)}%` }}>
          Launch {flr(launch)}
        </span>
      </span>
      <span className="mt-1 block text-xs leading-snug text-[#8FA0B8]">
        {launched
          ? `${flr(launch)} FLR reached, the launch amount for the new FlareForward validator. The raise continues to the ${flr(goal)} FLR goal.`
          : `The new FlareForward validator launches the moment we reach ${flr(launch)} FLR.`}
      </span>
    </span>
  );
}

/** "Bond open" / "Bond closed" on a series bar, so the state reads before the click. */
function SeriesState({ open }: { open: boolean | null }) {
  if (open == null) return null;
  if (open) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
        <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
        </span>
        Bond open
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#8FA0B8]">
      Bond closed
    </span>
  );
}

function MeasuredPerformance() {
  const bondApy = useBondApy();

  return (
    <section className="mt-10">
      <div className="flex items-center gap-3">
        <Activity size={20} className="text-[#E85A95]" />
        <h2 className="text-xl font-semibold">Bond earnings</h2>
      </div>
      <div className="glass-panel mt-4 p-5">
        <p className="text-xs uppercase tracking-wide text-[#8FA0B8]">
          APY so far, from real payouts
        </p>
        <p className="mt-1 text-3xl font-semibold tabular-nums text-emerald-400">
          {fmtPct(bondApy.apyPct)}
        </p>
      </div>
    </section>
  );
}

/**
 * The lots. Closed lots collapse to one row each; only a lot that is actually
 * on sale gets the full storefront card. Every figure is read from the tier
 * contract, so when the next lot deploys its card appears on its own.
 *
 * Each series bar starts expanded while that series is selling and collapsed
 * once it closes (operator 2026-10-23): a buyer lands on the open bond, and a
 * closed one stays one click away. A visitor's own click always wins.
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
  const [v1Choice, setV1Choice] = useState<boolean | null>(null);
  const [v2Choice, setV2Choice] = useState<boolean | null>(null);
  const statusFor = (tier: BondTier): TierStatus =>
    statuses.find((s) => s.key === tier.key) ?? { key: tier.key, address: tier.address };

  const termTiers = tiers.filter(isTermTier);
  const shareTiers = tiers.filter(isShareTier);
  const openTiers = shareTiers.filter((t) => t.address && isOpen(statusFor(t)));
  const closedTiers = shareTiers.filter((t) => t.address && !isOpen(statusFor(t)));
  const anyOpen = openTiers.length > 0;
  const v1BondCount = statuses.reduce((total, status) => total + (status.sold ?? 0n), 0n);
  const v1Selling = statusLoading ? null : anyOpen;
  const { selling: v2Selling, raisedWei: v2RaisedWei } = useTermSeries(termTiers);
  const v1Open = v1Choice ?? v1Selling === true;
  const v2Open = v2Choice ?? v2Selling === true;

  return (
    <>
      <section className="mt-10" aria-labelledby="starship1-title">
        <button
          type="button"
          onClick={() => setV1Choice(!v1Open)}
          aria-expanded={v1Open}
          className="glass-panel flex w-full flex-wrap items-center justify-between gap-4 p-4 text-left"
        >
          <span>
            <span className="flex flex-wrap items-center gap-2.5">
              <span id="starship1-title" className="text-xl font-semibold">FTSO V1</span>
              <SeriesState open={v1Selling} />
            </span>
            <span className="mt-0.5 block text-sm text-[#8FA0B8]">
              {statusLoading ? "Reading bonds" : `${fmtCount(v1BondCount)} bonds`}
            </span>
          </span>
          <span className="order-3 w-full sm:order-none sm:ml-auto sm:w-[min(320px,28%)] sm:min-w-[240px]">
            <StakingBatchTimer />
          </span>
          <ChevronDown
            className={`order-2 transition-transform motion-reduce:transition-none sm:order-none ${v1Open ? "rotate-180" : ""}`}
            size={18}
          />
        </button>

        {v1Open && (
          <div className="mt-3">
            {anyOpen && (
              <div className="grid gap-3 md:grid-cols-2">
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
              <ul className={`glass-panel ${anyOpen ? "mt-3" : ""} divide-y divide-white/8 p-0`}>
                {closedTiers.map((tier) => {
                  const status = statusFor(tier);
                  return (
                    <li key={tier.key} className="flex items-center gap-4 px-4 py-3">
                      <img
                        src={`${IPFS_GATEWAY}/${tier.imageCid}`}
                        alt=""
                        loading="lazy"
                        className="h-10 w-10 shrink-0 rounded-lg object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[#FAFAFA]">{tier.name}</p>
                        <p className="text-xs text-[#8FA0B8]">{fmtCount(status.sold)} bonds</p>
                      </div>
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${mintStateTone(status, statusLoading)}`}>
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
            )}
          </div>
        )}
      </section>

      <section className="mt-10" aria-labelledby="starship2-title">
        <button
          type="button"
          onClick={() => setV2Choice(!v2Open)}
          aria-expanded={v2Open}
          className="glass-panel flex w-full flex-wrap items-center justify-between gap-4 p-4 text-left"
        >
          <span className="flex items-center gap-3">
            <span>
              <span className="flex flex-wrap items-center gap-2.5">
                <span id="starship2-title" className="text-xl font-semibold">FTSO V2</span>
                <SeriesState open={v2Selling} />
              </span>
              <span className="mt-0.5 block text-sm text-[#8FA0B8]">
                {termTiers.length} {termTiers.length === 1 ? "tier" : "tiers"}
              </span>
            </span>
            {TERM_PREVIEW && (
              <span className="rounded-full border border-sky-300/40 bg-sky-300/10 px-2.5 py-0.5 text-[10px] font-medium text-sky-200">
                TESTNET PREVIEW
              </span>
            )}
          </span>
          <span className="order-3 w-full sm:order-none sm:ml-auto sm:w-[min(360px,34%)] sm:min-w-[260px]">
            <RaiseProgress raisedWei={v2RaisedWei} />
          </span>
          <ChevronDown
            className={`order-2 transition-transform motion-reduce:transition-none sm:order-none ${v2Open ? "rotate-180" : ""}`}
            size={18}
          />
        </button>
        {v2Open && (
          <div className="mt-3">
            <p className="max-w-3xl text-sm leading-relaxed text-[#8FA0B8]">
              {STARSHIP2_INTRO}{" "}
              <Link to="/nft/redeem" className="font-medium text-[#E85A95] hover:underline">
                How redemption works
              </Link>
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {termTiers.map((tier) => (
                <MintTermLot key={tier.key} tier={tier} />
              ))}
            </div>
          </div>
        )}
      </section>
    </>
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
  const shareTiers = useMemo(() => tiers.filter(isShareTier), [tiers]);
  const { statuses, statusLoading } = useTierStatuses(shareTiers);

  return (
    <div className="p-4 lg:p-8">
      <div className="max-w-3xl">
        <div className="flex items-center gap-3">
          <Gem size={24} className="text-[#E85A95]" />
          <h1 className="text-2xl font-bold tracking-tight">FlareForward Bonds</h1>
        </div>
        <p className="mt-3 text-lg leading-relaxed text-[#FAFAFA]/90">
          FTSO V1 bonds are perpetual shares of holder distributions. FTSO V2 bonds have a
          12 month term and redeem through their tier vault after maturity.
        </p>
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

      <h2 className="mt-10 text-xl font-semibold">How FTSO V1 works</h2>
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
          body="The exit is selling the NFT to another buyer. Unclaimed rewards travel with it. FTSO V1 has no redemption window open or scheduled."
        />
      </div>

      <section className="mt-10">
        <div className="glass-panel p-5">
          <p className="flex items-start gap-3 text-sm leading-relaxed text-[#8FA0B8]">
            <HeartHandshake size={18} className="mt-0.5 shrink-0 text-[#E85A95]" />
            <span>
              5% of the FTSO&apos;s profit goes straight to a{" "}
              <a
                href="https://flare-explorer.flare.network/address/0xD797c533f890F2f1ECf4f5D6e7d7BF3bBF6eeCfa"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#E85A95] hover:underline"
              >
                charity wallet
              </a>
              , automatically.
            </span>
          </p>
        </div>
      </section>
    </div>
  );
}
