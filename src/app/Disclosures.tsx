import { Link } from "react-router";
import { AlertTriangle, ArrowLeft, FileText, Wallet } from "lucide-react";
import { CustodySection } from "./components/CustodySection";
import { STARSHIP2_KNOW_BULLETS, STARSHIP2_SECURITY_NOTES } from "../lib/starship2Copy";

/**
 * /nft/disclosures: everything a buyer is entitled to read before they buy,
 * in one quiet place: who holds the money, what can go wrong, the terms, and
 * the wallet footnotes. Moved off the mint page 2026-09-26 by operator call so
 * that page can be short; nothing here was cut, only relocated. Do not trim
 * the risk list to make the page read better.
 */
export default function Disclosures() {
  return (
    <div className="p-4 lg:p-8">
      <div className="max-w-5xl">
        <Link
          to="/nft"
          className="inline-flex items-center gap-1 text-sm text-[#8FA0B8] hover:text-[#FAFAFA]"
        >
          <ArrowLeft size={14} /> Bond lots
        </Link>
        <div className="mt-3 flex items-center gap-3">
          <FileText size={24} className="text-[#E85A95]" />
          <h1 className="text-2xl font-bold tracking-tight">Bond disclosures</h1>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-[#8FA0B8]">
          Who holds the money, what you are taking on, and the terms. Every address links to
          the explorer so you can check it yourself.
        </p>
      </div>

      <div className="mt-8">
        <CustodySection />
      </div>

      <section id="starship-2" className="mt-10 scroll-mt-6">
        <h2 className="text-xl font-semibold">Starship 2 term bonds</h2>
        <div className="glass-panel mt-4 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="font-semibold text-[#FAFAFA]">What you should know</h3>
              <p className="mt-1 text-sm leading-relaxed text-[#8FA0B8]">
                These points apply to Starship 2. The live redemption status is on the{" "}
                <Link to="/nft/redeem" className="text-[#E85A95] hover:underline">
                  redemption page
                </Link>
                .
              </p>
            </div>
            <Link
              to="/nft/redeem"
              className="inline-flex shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium text-[#FAFAFA] transition hover:bg-white/10"
            >
              Go to redemption
            </Link>
          </div>
          <ul className="mt-4 grid gap-x-8 gap-y-2 text-sm leading-relaxed text-[#8FA0B8] lg:grid-cols-2">
            {STARSHIP2_KNOW_BULLETS.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
          <h3 className="mt-5 font-semibold text-[#FAFAFA]">Security notes</h3>
          <ul className="mt-2 grid gap-x-8 gap-y-2 text-sm leading-relaxed text-[#8FA0B8] lg:grid-cols-2">
            {STARSHIP2_SECURITY_NOTES.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section id="risks" className="mt-10 scroll-mt-6">
        <div className="flex items-center gap-3">
          <AlertTriangle size={20} className="text-amber-300" />
          <h2 className="text-xl font-semibold">What you are taking on</h2>
        </div>
        <p className="mt-2 text-sm text-[#8FA0B8]">
          Each line is a real way you could end up with less than you put in.
        </p>
        <ul className="glass-panel mt-4 grid gap-x-8 gap-y-2 p-5 text-sm leading-relaxed text-[#8FA0B8] lg:grid-cols-2">
          <li>
            • <span className="font-medium text-[#FAFAFA]">Starship 1 only.</span> Your FLR does
            not come back. It funds the validator self-bond at lot close. No redemption window is
            open, none is scheduled, and there is no maturity date. You hold an NFT, not a claim
            on the capital.
          </li>
          <li>
            • <span className="font-medium text-[#FAFAFA]">You may not be able to sell.</span>{" "}
            Reselling needs a buyer at a price you accept. There may be none, and there is no
            floor price and no buyback.
          </li>
          <li>
            • <span className="font-medium text-[#FAFAFA]">Rewards vary and can reach zero.</span>{" "}
            What the validator earns moves every epoch with Flare&apos;s reward mechanics, our
            measured accuracy, and total network stake.
          </li>
          <li>
            • <span className="font-medium text-[#FAFAFA]">Validators can be penalised.</span>{" "}
            Downtime or misbehaviour can cost a validator rewards or stake, which reduces the bond
            and what it earns.
          </li>
          <li>
            • <span className="font-medium text-[#FAFAFA]">No distribution has been made yet,
            for any lot.</span> Until a deposit lands in a lot&apos;s distribution contract, there
            is no on-chain claim to anything.
          </li>
          <li>
            • <span className="font-medium text-[#FAFAFA]">You are relying on us.</span>{" "}
            Distributions depend on FlareForward continuing to run the validator and deposit what
            it measures. We are a small team, not an institution.
          </li>
          <li>
            • <span className="font-medium text-[#FAFAFA]">Flare governance can change the
            economics.</span> FIP.16 already rebalanced how providers earn, network-wide. Future
            changes can do it again, and we do not control them.
          </li>
          <li>
            • <span className="font-medium text-[#FAFAFA]">Smart contracts carry risk.</span> The
            lot and distribution contracts are code. Bugs, key loss, or chain-level failures can
            cost you everything you put in.
          </li>
        </ul>
      </section>

      <section id="terms" className="mt-10 scroll-mt-6">
        <h2 className="text-xl font-semibold">The plain-English terms</h2>
        <ul className="glass-panel mt-4 grid gap-x-8 gap-y-2 p-5 text-sm leading-relaxed text-[#8FA0B8] lg:grid-cols-2">
          <li>
            • Starship 1 funds bond at lot close. After that, your exit is selling the NFT.
          </li>
          <li>
            • Any distribution is split equally per NFT within a lot, enforced on-chain by that
            lot&apos;s distribution contract.
          </li>
          <li>
            • Starship 1 only: never burn a bond. A burned token&apos;s share of future distributions
            is gone for good. Sell it instead.
          </li>
          <li>
            • Reward amounts follow what the infrastructure actually earns. We publish measured
            numbers, not projections.
          </li>
          <li>
            • Distributions are not guaranteed in amount or timing, and depend on FlareForward
            continuing to run the validator, measure its earnings, and deposit them.
          </li>
          <li>
            • FlareForward is not a bank, broker, or fund. A bond is not a deposit, a loan, or a
            share in a company, and nothing here is financial advice or a recommendation to buy.
          </li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Good to know</h2>
        <div className="glass-panel mt-4 flex gap-3 p-5">
          <Wallet size={16} className="mt-0.5 shrink-0 text-[#E85A95]" />
          <p className="text-sm leading-relaxed text-[#8FA0B8]">
            <span className="font-medium text-[#FAFAFA]">Using Rabby?</span> Rabby does not pull
            this collection&apos;s artwork in automatically yet, so a bond may sit in the
            wallet&apos;s hidden section. It is still yours and still on-chain. The{" "}
            <Link to="/bonds" className="text-[#E85A95] hover:underline">
              Bonds
            </Link>{" "}
            page reads your tokens straight from the contract.
          </p>
        </div>
      </section>
    </div>
  );
}
