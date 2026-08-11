import { Link } from "react-router";
import {
  Wallet,
  Landmark,
  Gift,
  ArrowRight,
  Hammer,
  Flame,
  Users,
  Scale,
  GraduationCap,
  Youtube,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "./components/Card";
import { Button } from "./components/Button";
import { useRewards } from "../hooks/useRewards";
import { useYouTubeFeed } from "../hooks/useYouTubeFeed";
import { fmtFlrCompact, fmtPct } from "../lib/rewards";
import { LINKS } from "../lib/links";
import { ImageWithFallback } from "./components/figma/ImageWithFallback";

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
            for this ecosystem every day — and your funds never leave your wallet.
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
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <ProofStat
                  label="Delegation APY"
                  value={fmtPct(rewards.rates.delegation_annual_pct)}
                  sub="Current rate, WFLR delegators"
                  emphasize
                />
                <ProofStat
                  label="Staking APY"
                  value={fmtPct(rewards.rates.staking_annual_pct)}
                  sub="Current rate, P-chain stakers"
                  emphasize
                />
                <ProofStat
                  label="Uptime"
                  value={fmtPct(rewards.uptime_availability_pct, 2)}
                  sub="FTSO submission availability"
                />
                <ProofStat
                  label="Delegated to us"
                  value={`${fmtFlrCompact(rewards.vote_power.delegation_flr)} FLR`}
                  sub={`+ ${fmtFlrCompact(rewards.staking.total_stake_flr)} FLR staked`}
                />
              </div>
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
              body="FlareForward runs DeFi University — free, plain-English education that turns curious FLR holders into confident ones. Your delegation funds people bringing the next wave of users into Flare."
              cta={{ label: "Visit DeFi University", href: LINKS.university, external: true }}
            />
            <WhyCard
              icon={<Hammer size={20} />}
              title="We build here, every day"
              body="We're a builder collective, not a passive node operator. Trading tools, payment rails, data infrastructure — shipped on Flare, by the same team signing your feeds."
              cta={{ label: "See what we've built", href: LINKS.site, external: true }}
            />
            <WhyCard
              icon={<Flame size={20} />}
              title="We give value back"
              body="We've engineered burn protocols around our systems so the things we build return value to the network — and we keep working on bonding structures designed to push more of what we earn back to you."
            />
            <WhyCard
              icon={<Scale size={20} />}
              title="We're straight with you"
              body="FIP.16 rebalanced how FTSO providers earn, network-wide. We won't pretend otherwise — the rates on this page are pulled live and shown as they are. No inflated promises, just the real number."
            />
          </div>
        </section>

        {/* --------------------------------------- VeriGuard bonds teaser */}
        <section aria-labelledby="veriguard-heading">
          <div className="glass-card p-6 lg:p-8 border border-[#EE1A58]/20">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
              <div className="max-w-2xl">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EE1A58] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow-[0_0_20px_rgba(238,26,88,0.45)]">
                    <Flame size={12} /> Coming soon
                  </span>
                </div>
                <h2 id="veriguard-heading" className="mt-3 text-xl lg:text-2xl font-bold tracking-tight">
                  VeriGuard NFT Bonds — grow the bond with us
                </h2>
                <p className="mt-2 text-sm text-[#8FA0B8] leading-relaxed">
                  A new way to strengthen FlareForward's infrastructure is in the
                  works: NFT bond raises on VeriGuard, run in 90-day cycles. A
                  bigger bond means stronger, better-funded infrastructure —
                  built with the community instead of around it. Terms are being
                  finalized now; the announcement drops on our channels first.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <a href={LINKS.x} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" className="gap-2">
                    <XGlyph /> Get the announcement
                  </Button>
                </a>
                <a href={LINKS.youtube} target="_blank" rel="noopener noreferrer">
                  <Button variant="ghost" className="gap-2 text-[#8FA0B8] hover:text-[#FAFAFA]">
                    <Youtube size={16} /> Watch for updates
                  </Button>
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------- How it works */}
        <section aria-labelledby="how-heading" className="space-y-5">
          <div className="text-center max-w-2xl mx-auto">
            <h2 id="how-heading" className="text-2xl lg:text-3xl font-bold tracking-tight">
              Put your FLR to work in three steps
            </h2>
            <p className="mt-2 text-sm text-[#8FA0B8]">
              No experience needed. Your tokens stay in your wallet the whole time.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StepCard
              step={1}
              title="Connect your wallet"
              body="Use the wallet you already have. Connecting is read-only — nothing moves without your signature."
            />
            <StepCard
              step={2}
              title="Delegate or stake"
              body="Delegate wrapped FLR (WFLR) to our data provider, or stake to our validator on the P-chain. Both take about a minute."
            />
            <StepCard
              step={3}
              title="Earn every epoch"
              body="Rewards accrue every ~3.5-day reward epoch. Track and claim them any time on your My Rewards page."
            />
          </div>
          <div className="flex justify-center gap-3">
            <Link to="/delegation">
              <Button variant="primary" className="gap-2">
                <Wallet size={16} /> Start delegating
              </Button>
            </Link>
            <Link to="/staking">
              <Button variant="outline" className="gap-2">
                <Landmark size={16} /> Start staking
              </Button>
            </Link>
          </div>
        </section>

        {/* ---------------------------------------------------- Community */}
        <section aria-labelledby="community-heading">
          <Card>
            <CardContent className="p-6 lg:p-8">
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                <div className="max-w-xl">
                  <div className="flex items-center gap-2 text-[#EE1A58]">
                    <Users size={18} />
                    <span className="text-xs font-bold uppercase tracking-wider">Community</span>
                  </div>
                  <h2 id="community-heading" className="mt-2 text-xl lg:text-2xl font-bold tracking-tight">
                    Built in the open by Whale &amp; Ace
                  </h2>
                  <p className="mt-2 text-sm text-[#8FA0B8] leading-relaxed">
                    We show our work — breakdowns, tutorials, and honest takes on
                    where Flare is heading. Follow along and you'll know exactly
                    who your vote power is backing.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <a href={LINKS.youtubeAce} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" className="gap-2">
                      <Youtube size={16} /> AFHD Media
                    </Button>
                  </a>
                  <a href={LINKS.x} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" className="gap-2">
                      <XGlyph /> @flareforward
                    </Button>
                  </a>
                  <a href={LINKS.xWhale} target="_blank" rel="noopener noreferrer">
                    <Button variant="ghost" className="gap-2 text-[#8FA0B8] hover:text-[#FAFAFA]">
                      <XGlyph /> Whale
                    </Button>
                  </a>
                  <a href={LINKS.xSteven} target="_blank" rel="noopener noreferrer">
                    <Button variant="ghost" className="gap-2 text-[#8FA0B8] hover:text-[#FAFAFA]">
                      <XGlyph /> Steven
                    </Button>
                  </a>
                  <a href={LINKS.xAce} target="_blank" rel="noopener noreferrer">
                    <Button variant="ghost" className="gap-2 text-[#8FA0B8] hover:text-[#FAFAFA]">
                      <XGlyph /> Ace
                    </Button>
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* -------------------------------------------------- Content hub */}
        <ContentHub />

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
              Two minutes to set up. Non-custodial from start to finish. And it
              funds a team that gives back to the network you're betting on.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link to="/delegation">
                <Button variant="primary" size="lg" className="gap-2">
                  <Wallet size={18} /> Delegate now <ArrowRight size={16} />
                </Button>
              </Link>
              <Link to="/staking">
                <Button variant="outline" size="lg" className="gap-2">
                  <Landmark size={18} /> Stake now
                </Button>
              </Link>
            </div>
            <p className="mt-4 text-xs text-[#8FA0B8]">
              Want the raw numbers first?{" "}
              <Link to="/analytics" className="text-[#EE1A58] hover:underline">
                See our full performance analytics
              </Link>
              .
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * Latest videos from the FlareForward channel, via the Worker's `/api/youtube`
 * proxy. Renders nothing when the feed is empty or unavailable — the community
 * block above already carries the channel link, so there's no broken state.
 */
function ContentHub() {
  const { videos } = useYouTubeFeed();
  if (videos.length === 0) return null;

  return (
    <section aria-labelledby="content-heading" className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id="content-heading" className="text-2xl lg:text-3xl font-bold tracking-tight">
            See the work for yourself
          </h2>
          <p className="mt-2 text-sm text-[#8FA0B8]">
            Fresh from the FlareForward channel — what we're building and teaching right now.
          </p>
        </div>
        <a
          href={LINKS.youtube}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium text-[#EE1A58] hover:underline shrink-0"
        >
          All videos <ExternalLink size={13} />
        </a>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {videos.slice(0, 3).map((v) => (
          <a
            key={v.id}
            href={v.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group glass-card glass-card-hover overflow-hidden rounded-2xl block"
          >
            <div className="aspect-video overflow-hidden bg-white/5">
              <ImageWithFallback
                src={v.thumbnail}
                alt={v.title}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              />
            </div>
            <div className="p-4">
              <h3 className="text-sm font-semibold leading-snug line-clamp-2 group-hover:text-[#EE1A58] transition-colors">
                {v.title}
              </h3>
              {v.published_unix && (
                <p className="mt-1.5 text-xs text-[#8FA0B8]">
                  {new Date(v.published_unix * 1000).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              )}
            </div>
          </a>
        ))}
      </div>
    </section>
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

function StepCard({ step, title, body }: { step: number; title: string; body: string }) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#EE1A58] to-[#E85A95] text-sm font-bold text-white">
            {step}
          </div>
          <h3 className="text-base font-semibold tracking-tight">{title}</h3>
        </div>
        <p className="mt-3 text-sm text-[#8FA0B8] leading-relaxed">{body}</p>
      </CardContent>
    </Card>
  );
}
