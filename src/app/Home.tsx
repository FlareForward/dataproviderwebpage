import { Link } from "react-router";
import {
  Wallet,
  Landmark,
  Gift,
  ArrowRight,
  Hammer,
  Flame,
  Scale,
  GraduationCap,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { useReadContracts } from "wagmi";
import { formatEther } from "viem";
import { Card, CardContent } from "./components/Card";
import { RewardEpochLine, useCountdown, fmtCountdown, ProgressBar } from "./components/RewardEpochClock";
import { Button } from "./components/Button";
import { useRewards } from "../hooks/useRewards";
import { settledRate, fmtFlrCompact, fmtPct } from "../lib/rewards";
import { LINKS } from "../lib/links";
import { CURRENT_LOT, isTermTier, termBondAbi } from "../lib/bondLot";
import { TERM_CHAIN } from "../lib/flare";

/**
 * / — the front door, built to sell. One job: a visitor who has never heard
 * of FlareForward understands in 30 seconds why to put their vote power with
 * us, and can act (delegate or stake) without leaving the site. Every number
 * shown is sourced live on-chain / from the Flare Systems Explorer — no
 * hardcoded yield claims, ever. Raw network/market data lives on /analytics.
 */
export default function Home() {
  const { data: rewards, isLoading } = useRewards();

  return (
    <div className="p-4 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-10 lg:space-y-14">
        {/* ---------------------------------------------------------- Hero */}
        <section className="pt-4 lg:pt-10 text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 glass-panel px-3.5 py-1.5 text-xs font-semibold text-[#8FA0B8]">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
            Flare FTSO data provider &amp; validator — live on Mainnet
          </div>
          <h1 className="mt-5 text-4xl lg:text-6xl font-extrabold tracking-tight leading-[1.05]">
            Delegate to{" "}
            <span className="bg-gradient-to-br from-[#EE1A58] to-[#E85A95] bg-clip-text text-transparent">
              builders
            </span>
            , not just an oracle.
          </h1>
          <p className="mt-5 text-base lg:text-lg text-[#8FA0B8] leading-relaxed">
            FlareForward is an education platform and a builder collective on the
            Flare network. Delegating your vote power to us backs people who ship
            for this ecosystem every day — and your FLR stays under your own keys.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link to="/delegation">
              <Button variant="primary" size="lg" className="gap-2">
                <Wallet size={18} /> Delegate WFLR <ArrowRight size={16} />
              </Button>
            </Link>
            <Link to="/staking">
              <Button variant="outline" size="lg" className="gap-2">
                <Landmark size={18} /> Stake on P-chain
              </Button>
            </Link>
            <Link to="/rewards">
              <Button variant="ghost" size="lg" className="gap-2 text-[#8FA0B8] hover:text-[#FAFAFA]">
                <Gift size={18} /> Check my rewards
              </Button>
            </Link>
          </div>
          <p className="mt-3 text-xs text-[#8FA0B8]">
            Non-custodial. Delegation and staking never move your FLR — you stay
            in control, always.
          </p>
        </section>

        {/* ------------------------------------------- Live proof numbers */}
        <section aria-label="Live performance">
          {isLoading && !rewards ? (
            <div className="glass-panel p-6 flex items-center justify-center gap-2 text-sm text-[#8FA0B8]">
              <Loader2 size={16} className="animate-spin" /> Pulling live numbers from the chain…
            </div>
          ) : rewards ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <ProofStat
                  label="Delegation APY"
                  value={fmtPct(settledRate(rewards.rates.delegation_annual_pct))}
                  sub="Current rate, WFLR delegators"
                  emphasize
                />
                <ProofStat
                  label="Staking APY"
                  value={fmtPct(settledRate(rewards.rates.staking_annual_pct))}
                  sub="Current rate, P-chain stakers"
                  emphasize
                />
                {/* Shown beside the staking rate on purpose: the bond earns more
                    than a delegator does, and that difference is what the Bonds
                    series sells. */}
                <ProofStat
                  label="Bond rate"
                  value={fmtPct(settledRate(rewards.rates.bond_annual_pct))}
                  sub="What the validator bond earned, annualized"
                  emphasize
                />
              </div>
              {rewards.staking.has_validator &&
                rewards.staking.capacity_flr != null &&
                rewards.staking.total_stake_flr != null && (
                  <StakingCapacityStrip
                    staked={rewards.staking.total_stake_flr}
                    capacity={rewards.staking.capacity_flr}
                    spaceLeft={rewards.staking.space_left_flr}
                  />
                )}
              <Starship2Strip />
              <p className="mt-2 text-[11px] text-[#8FA0B8] text-center">
                Sourced live from the Flare Systems Explorer and Flare RPC. Rates
                vary epoch to epoch and are not a guarantee of future rewards.
              </p>
            </>
          ) : null}
        </section>

        {/* -------------------------------------------------- Proof strip */}
        <section aria-labelledby="why-heading" className="space-y-5">
          <div className="text-center max-w-2xl mx-auto">
            <h2 id="why-heading" className="text-2xl lg:text-3xl font-bold tracking-tight">
              Why bond your vote power to FlareForward?
            </h2>
            <p className="mt-2 text-sm text-[#8FA0B8]">
              Every provider signs the same oracle feeds. Here's what your
              delegation actually funds when it sits with us.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <WhyCard
              icon={<GraduationCap size={20} />}
              title="We teach this network"
              body="FlareForward gives away its DeFi courses: free, plain-English education that turns curious FLR holders into confident ones. Your delegation funds people bringing the next wave of users into Flare."
              cta={{ label: "Take the free DeFi courses", href: LINKS.university }}
            />
            <WhyCard
              icon={<Hammer size={20} />}
              title="We build here, every day"
              body="We're a builder collective, not a passive node operator. Trading tools, payment rails, data infrastructure — shipped on Flare, by the same team signing your feeds."
              cta={{ label: "See what we've built", href: LINKS.site }}
            />
            <WhyCard
              icon={<Flame size={20} />}
              title="We give value back"
              body="We've engineered burn protocols around our systems so the things we build return value to the network, and we publish what our infrastructure actually earns rather than what we hope it will."
              cta={{
                label: "See the FLR burn in Apex's fee split",
                href: LINKS.apexDocsFees,
              }}
            />
            <WhyCard
              icon={<Scale size={20} />}
              title="We're straight with you"
              body="FIP.16 rebalanced how FTSO providers earn, network-wide. We won't pretend otherwise — the rates on this page are pulled live and shown as they are. No inflated promises, just the real number."
            />
          </div>
        </section>

        {/* -------------------------------------------------- How it works */}
        <section aria-labelledby="how-heading" className="space-y-5">
          <div className="text-center max-w-2xl mx-auto">
            <h2 id="how-heading" className="text-2xl lg:text-3xl font-bold tracking-tight">
              Support us in any of these ways
            </h2>
            <p className="mt-2 text-sm text-[#8FA0B8]">
              Pick whichever suits you. Delegating and staking are non-custodial — your FLR
              stays yours. Minting a bond is a purchase: that FLR funds the validator bond and
              is not returned.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <SupportCard
              to="/delegation"
              icon={<Wallet size={18} />}
              title="Delegate WFLR"
              body="Point your vote power at our data provider. Reversible any time, about a minute to do."
            />
            <SupportCard
              to="/staking"
              icon={<Landmark size={18} />}
              title="Stake on P-chain"
              body="Stake FLR to our validator for the bond period you choose."
            />
            <SupportCard
              to="/nft"
              icon={<Flame size={18} />}
              title="FlareForward Bonds"
              body="Starship 1 bonds fund the validator self-bond; the FLR is not returned and every lot is closed today. Starship 2, a 12 month bond you redeem at maturity, is coming soon."
            />
            {/* The odd one out: the first three are ways to back us, this one
                is where you go once you have. It keeps its slot in the row, but
                it carries the destination's own name — everywhere else in the
                app that page is "My Rewards", and a card called "See what
                you've earned" landed people somewhere that never used the
                phrase. */}
            <SupportCard
              to="/rewards"
              icon={<Gift size={18} />}
              title="My Rewards"
              body="Already backing us? Your delegation, staking and bonds in one place — and what's ready to claim."
            />
          </div>
        </section>

        {/* ---------------------------------------------------- Community */}
        <section aria-labelledby="community-heading">
          <Card>
            <CardContent className="p-6 lg:p-8">
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                <div className="max-w-xl">
                  <h2 id="community-heading" className="text-xl lg:text-2xl font-bold tracking-tight">
                    Powered by FlareForward
                  </h2>
                  <p className="mt-2 text-sm text-[#8FA0B8] leading-relaxed">
                    Learn who we are at{" "}
                    <a
                      href={LINKS.site}
                      className="text-[#EE1A58] hover:underline"
                    >
                      flareforward.com
                    </a>{" "}
                    or follow{" "}
                    <a
                      href={LINKS.x}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#EE1A58] hover:underline"
                    >
                      @flareforward
                    </a>{" "}
                    on X.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <a href={LINKS.site}>
                    <Button variant="outline" className="gap-2">
                      <ExternalLink size={16} /> flareforward.com
                    </Button>
                  </a>
                  <a href={LINKS.x} target="_blank" rel="noopener noreferrer">
                    <Button variant="ghost" className="gap-2 text-[#8FA0B8] hover:text-[#FAFAFA]">
                      <XGlyph /> FlareForward
                    </Button>
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* -------------------------------------------------- Closing CTA */}
        <section className="pb-6">
          <div className="glass-card p-8 lg:p-12 text-center">
            <h2 className="text-2xl lg:text-4xl font-extrabold tracking-tight">
              Your vote power is sitting idle.{" "}
              <span className="bg-gradient-to-br from-[#EE1A58] to-[#E85A95] bg-clip-text text-transparent">
                Put it with builders.
              </span>
            </h2>
            <p className="mt-3 text-sm lg:text-base text-[#8FA0B8] max-w-xl mx-auto">
              Two minutes to set up. Delegating is non-custodial from start to finish. And
              it funds a team that gives back to the network you're part of.
            </p>
            <p className="mt-4 text-xs text-[#8FA0B8]">
              Pick a way to support us above, or{" "}
              <Link to="/analytics" className="text-[#EE1A58] hover:underline">
                see our full performance analytics
              </Link>{" "}
              first.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

/** X (Twitter) logo — lucide has no up-to-date X mark, so a small inline glyph. */
function XGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/**
 * How full the FlareForward validator is, in plain numbers. The staking pot on
 * a node is shared pro-rata by everyone staked on it, so open capacity is the
 * honest sales angle: the more room left, the less a new stake is diluted.
 */
function StakingCapacityStrip({
  staked,
  capacity,
  spaceLeft,
}: {
  staked: number;
  capacity: number;
  spaceLeft: number | null;
}) {
  const open = spaceLeft ?? Math.max(0, capacity - staked);
  // Keep a sliver of bar visible even at ~1% fill so the strip reads as a bar.
  const fillPct = capacity > 0 ? Math.max(1, Math.min(100, (staked / capacity) * 100)) : 0;
  return (
    <div className="mt-4 glass-panel p-4 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-[#8FA0B8]">
          <span className="font-semibold text-[#FAFAFA]">Starship 1</span>
          <span aria-hidden="true">·</span>
          Validator staking capacity
          {/* Under 1 FLR open is full in practice: the node reports dust like 0.29 FLR. */}
          {open < 1 && (
            <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-[#FAFAFA]">
              Full
            </span>
          )}
        </span>
        <span className="text-xs text-[#8FA0B8]">
          Staking rewards are shared by everyone on the node — the bigger the
          open gap, the less your stake is diluted.
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/5 overflow-hidden" aria-hidden="true">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#EE1A58] to-[#E85A95]"
          style={{ width: `${fillPct}%` }}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
        <span className="text-[#FAFAFA] font-medium tabular-nums">
          {fmtFlrCompact(staked)} FLR staked
        </span>
        <span className="text-[#8FA0B8] tabular-nums">
          {fmtFlrCompact(open)} FLR open of {fmtFlrCompact(capacity)} FLR total
        </span>
      </div>
      <RewardEpochLine />
    </div>
  );
}

/**
 * When the Starship 2 sales opened: Bond Treasury Safe nonce 13, tx 0x41f64b13…,
 * block 70998062, 2026-09-30 16:41:56Z. The term bar runs from here to maturity.
 */
const STARSHIP2_OPENED_AT = 1790786516;

const STARSHIP2_TIERS = CURRENT_LOT.tiers.filter(
  (t): t is typeof t & { kind: "term"; address: `0x${string}` } => isTermTier(t) && !!t.address,
);

/**
 * Starship 2, the next capacity: 12 month bond NFTs whose sale is open now. Every
 * number is read from the three bond contracts, so the strip cannot say "open"
 * after the Safe closes a sale or the backstop date passes.
 */
function Starship2Strip() {
  const { data } = useReadContracts({
    contracts: STARSHIP2_TIERS.flatMap((t) => [
      { address: t.address, abi: termBondAbi, functionName: "isMintOpen" as const, chainId: TERM_CHAIN.id },
      { address: t.address, abi: termBondAbi, functionName: "totalSupply" as const, chainId: TERM_CHAIN.id },
      { address: t.address, abi: termBondAbi, functionName: "maxSupply" as const, chainId: TERM_CHAIN.id },
      { address: t.address, abi: termBondAbi, functionName: "mintPrice" as const, chainId: TERM_CHAIN.id },
      { address: t.address, abi: termBondAbi, functionName: "bondExpiry" as const, chainId: TERM_CHAIN.id },
    ]),
    query: { enabled: STARSHIP2_TIERS.length > 0, refetchInterval: 60_000 },
  });
  let maturity: number | null = null;
  for (let i = 0; data && i < STARSHIP2_TIERS.length; i++) {
    const exp = data[i * 5 + 4]?.result as bigint | undefined;
    if (exp && exp > 0n) maturity = Number(exp);
  }
  const toMaturity = useCountdown(maturity);
  if (STARSHIP2_TIERS.length === 0 || !data) return null;

  let anyOpen = false;
  let raisedWei = 0n;
  let capWei = 0n;
  for (let i = 0; i < STARSHIP2_TIERS.length; i++) {
    const open = data[i * 5]?.result as boolean | undefined;
    const sold = data[i * 5 + 1]?.result as bigint | undefined;
    const max = data[i * 5 + 2]?.result as bigint | undefined;
    const price = data[i * 5 + 3]?.result as bigint | undefined;
    if (open) anyOpen = true;
    if (sold != null && price != null) raisedWei += sold * price;
    if (max != null && price != null) capWei += max * price;
  }
  const raised = Number(formatEther(raisedWei));
  const cap = Number(formatEther(capWei));
  const fillPct = cap > 0 ? Math.min(100, (raised / cap) * 100) : 0;

  return (
    <div className="mt-3 glass-panel p-4 space-y-2.5 border border-[#EE1A58]/25">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-[#8FA0B8]">
          <span className="font-semibold text-[#FAFAFA]">Starship 2</span>
          <span aria-hidden="true">·</span>
          Bond mint
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
              anyOpen
                ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                : "border-white/15 bg-white/5 text-[#FAFAFA]"
            }`}
          >
            {anyOpen ? "Open now" : "Closed"}
          </span>
        </span>
        <span className="text-xs text-[#8FA0B8]">
          A 12 month bond NFT. Redeem it at maturity for your share of the bond vault.
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/5 overflow-hidden" aria-hidden="true">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300"
          style={{ width: `${raised > 0 ? Math.max(1, fillPct) : 0}%` }}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
        <span className="text-[#FAFAFA] font-medium tabular-nums">
          {fmtFlrCompact(raised)} FLR raised of {fmtFlrCompact(cap)} FLR
        </span>
        <Link
          to="/nft"
          className="inline-flex items-center gap-1 text-sm font-medium text-[#E85A95] hover:underline"
        >
          {anyOpen ? "Mint a Starship 2 bond" : "See Starship 2"} <ArrowRight size={14} />
        </Link>
      </div>
      {toMaturity != null && maturity != null && (
        <div>
          <p className="text-[11px] leading-relaxed text-[#8FA0B8]">
            No payouts during the term. Redeem once at maturity, in{" "}
            <span className="tabular-nums text-[#FAFAFA]">{fmtCountdown(toMaturity)}</span> (
            {new Date(maturity * 1000).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
            ).
          </p>
          <ProgressBar
            pct={((maturity - toMaturity - STARSHIP2_OPENED_AT) / (maturity - STARSHIP2_OPENED_AT)) * 100}
            tone="green"
            label="Starship 2 term progress"
          />
        </div>
      )}
    </div>
  );
}

function ProofStat({
  label,
  value,
  sub,
  emphasize,
}: {
  label: string;
  value: string;
  sub?: string;
  emphasize?: boolean;
}) {
  return (
    <Card className="glass-card-hover">
      <CardContent className="p-5">
        <div className="text-[11px] uppercase tracking-wider text-[#8FA0B8]">{label}</div>
        <div
          className={`mt-1 font-bold tabular-nums ${
            emphasize ? "text-3xl text-emerald-400" : "text-2xl text-[#FAFAFA]"
          }`}
        >
          {value}
        </div>
        {sub && <div className="text-xs text-[#8FA0B8] mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function WhyCard({
  icon,
  title,
  body,
  cta,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  cta?: { label: string; href: string; external?: boolean };
}) {
  return (
    <Card className="glass-card-hover">
      <CardContent className="p-6 space-y-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EE1A58]/10 text-[#EE1A58]">
          {icon}
        </div>
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        <p className="text-sm text-[#8FA0B8] leading-relaxed">{body}</p>
        {cta && (
          <a
            href={cta.href}
            target={cta.external ? "_blank" : undefined}
            rel={cta.external ? "noopener noreferrer" : undefined}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#EE1A58] hover:underline"
          >
            {cta.label} <ExternalLink size={13} />
          </a>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * One way to support FlareForward. The whole card is the link — the page used
 * to repeat "Delegate" and "Stake" as buttons in three separate places, so
 * these carry the navigation instead of another row of CTAs.
 */
function SupportCard({
  to,
  icon,
  title,
  body,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Link to={to} className="group block h-full">
      <Card className="h-full transition-colors group-hover:border-[#EE1A58]/40">
        <CardContent className="p-6 flex h-full flex-col">
          <div className="flex items-center gap-3">
            <span className="text-[#EE1A58]">{icon}</span>
            <h3 className="text-base font-semibold tracking-tight group-hover:text-[#EE1A58] transition-colors">
              {title}
            </h3>
          </div>
          <p className="mt-3 flex-1 text-sm text-[#8FA0B8] leading-relaxed">{body}</p>
          <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-[#EE1A58]">
            Go <ArrowRight size={13} />
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
