import { Gem, Coins, TrendingUp, Landmark, Tag, Wallet, Store } from "lucide-react";

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
          <h1 className="text-2xl font-bold tracking-tight">NFT Bond Series</h1>
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

      {/* Current lot */}
      <div className="glass-panel mt-8 max-w-3xl border border-[#E85A95]/25 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold">Lot 1 — opening soon</h2>
          <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[11px] font-medium text-amber-300">
            MINT NOT YET OPEN
          </span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-[#8FA0B8]">
          Supply, price and dates announced here first. The mint window stays open until our next
          P-chain bond window — then the lot closes and caps at whatever sold, and the money goes
          to work.
        </p>
      </div>

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
