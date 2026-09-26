import { ShieldCheck } from "lucide-react";
import { CUSTODY, CURRENT_LOT } from "../../lib/bondLot";
import { EXPLORER_URL } from "../../lib/flare";

/**
 * Who holds a buyer's money, as a record a reader can check.
 *
 * Every address and transaction here was read from Flare mainnet. The tone is
 * deliberately flat: this is the custody history of the program, stated once,
 * with links. Single-key control was how the program started, control moved to
 * the 2-of-3 Safe on 2026-09-17, and Lot 3 was Safe-owned from its first
 * block. That is the whole story; it needs no apology and no lecture.
 * Doctrine still holds: no APR/APY, no "like staking", no non-custodial claim.
 */
export function CustodySection() {
  const safe = CUSTODY.bondTreasurySafe;
  const addr = (a: string) => `${EXPLORER_URL}/address/${a}`;
  const link = "break-all text-[#E85A95] hover:underline";
  const deployedDistributors = CURRENT_LOT.tiers.filter((t) => t.distributor);

  return (
    <section id="custody" className="scroll-mt-6">
      <div className="flex items-center gap-3">
        <ShieldCheck size={20} className="text-[#E85A95]" />
        <h2 className="text-xl font-semibold">Who holds your money</h2>
      </div>

      <div className="glass-panel mt-4 p-5 text-sm leading-relaxed text-[#8FA0B8]">
        <div className="grid gap-x-8 gap-y-4 lg:grid-cols-2">
          <div className="space-y-4">
            <p className="text-[#FAFAFA]/90">
              <strong className="text-[#FAFAFA]">
                When you mint a bond, your FLR becomes FlareForward&apos;s.
              </strong>{" "}
              It is not held in escrow or in trust, and it is not returned.
            </p>

            <p>
              <strong className="text-[#FAFAFA]">Where it goes.</strong> From the
              lot&apos;s mint contract to the Bond Treasury Safe, where it is
              wrapped and delegated to the FlareForward FTSO provider until the
              lot closes. At close it is bonded to the validator. No contract
              forces that sequence; it is what we do.
            </p>

            <p>
              <strong className="text-[#FAFAFA]">Who can move it.</strong>{" "}
              {safe ? (
                <>
                  The Bond Treasury Safe, a 2-of-3 multisig of the three
                  FlareForward principals. Nothing leaves it without two
                  signatures. Every lot&apos;s mint contract is owned by that
                  Safe.
                </>
              ) : (
                <>
                  A single hardware key (
                  <a href={addr(CUSTODY.treasuryKey)} target="_blank" rel="noopener noreferrer" className={link}>
                    {CUSTODY.treasuryKey}
                  </a>
                  ). The Bond Treasury Safe address will be published here when
                  it is live.
                </>
              )}
            </p>

            <p>
              <strong className="text-[#FAFAFA]">How you get paid.</strong> Each
              closed lot gets its own distribution contract. We measure what
              the validator earned, deposit FLR into that contract, and holders
              claim an equal per-token share. The deposit is a decision we
              make, not something a contract compels. Distribution contracts
              are owned by the same 2-of-3 Safe.
            </p>

            <p>
              <strong className="text-[#FAFAFA]">What you own.</strong> A
              transferable NFT and a claim on whatever is deposited for that
              lot. Not a share of the treasury, the validator, or FlareForward.
            </p>

            <p>
              <strong className="text-[#FAFAFA]">How you exit.</strong> By
              selling the NFT. There is no burn-to-redeem. No redemption window
              is open and none is scheduled.
            </p>

            <p>
              <strong className="text-[#FAFAFA]">
                Never send a bond to an address nobody controls.
              </strong>{" "}
              Supply is fixed, so that token&apos;s share of every future
              distribution is stranded for good.
            </p>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-[#FAFAFA]">Paid so far</h3>
            {/* Standing rule: rewrite to "first distribution paid on <date>"
                when it lands. Never delete. */}
            <p>
              <strong className="text-[#FAFAFA]">Nothing yet, to anyone.</strong>{" "}
              {deployedDistributors.length > 0 ? (
                <>
                  The distribution contract for {deployedDistributors[0]!.name} is
                  deployed (
                  <a href={addr(deployedDistributors[0]!.distributor!)} target="_blank" rel="noopener noreferrer" className={link}>
                    view
                  </a>
                  ) and holds no funds. No deposit has been made for any lot.
                </>
              ) : (
                <>No distribution contract has been deployed for any lot.</>
              )}{" "}
              Any rate shown on this site is what the validator earns, not a
              record of holder payouts.
            </p>

            <h3 className="pt-2 font-semibold text-[#FAFAFA]">The addresses</h3>
            <ul className="space-y-2 pl-1">
              <li>
                • <strong className="text-[#FAFAFA]">Bond Treasury Safe.</strong>{" "}
                Buyer capital only. 2-of-3.{" "}
                {safe ? (
                  <a href={addr(safe)} target="_blank" rel="noopener noreferrer" className={link}>
                    {safe}
                  </a>
                ) : (
                  <span className="text-amber-300">Not yet deployed.</span>
                )}
              </li>
              <li>
                • <strong className="text-[#FAFAFA]">Operating Safe.</strong>{" "}
                FlareForward&apos;s own FTSO fee revenue. 2-of-3, live since
                July 2026. Bond capital never touches it.{" "}
                <a href={addr(CUSTODY.operatingSafe)} target="_blank" rel="noopener noreferrer" className={link}>
                  {CUSTODY.operatingSafe}
                </a>
              </li>
              <li>
                • <strong className="text-[#FAFAFA]">The staked bond.</strong>{" "}
                Flare&apos;s P-chain staking has no multisig support, so for
                each bond term the staked capital sits on one hardware key,
                released by the Safe and returned to it at term end. That is
                the single-key point in the chain, and we would rather name it
                than hide it behind the word multisig.
              </li>
              <li>
                • <strong className="text-[#FAFAFA]">Owner minting.</strong>{" "}
                The lot contracts let the owner mint at no cost. We do not use
                this on public lots, and the owner is the 2-of-3 Safe.
              </li>
            </ul>

            <h3 className="pt-2 font-semibold text-[#FAFAFA]">How it got here</h3>
            <p>
              Lots 1 and 2 were deployed and run from a single hardware key
              while the program was getting started. On 2026-09-17 ownership of
              every lot moved to the Bond Treasury Safe
              {CUSTODY.bondTreasurySafeControlTx && (
                <>
                  {" "}(
                  <a href={`${EXPLORER_URL}/tx/${CUSTODY.bondTreasurySafeControlTx}`} target="_blank" rel="noopener noreferrer" className={link}>
                    transaction
                  </a>
                  )
                </>
              )}
              . Lot 3 was deployed owned by the Safe from its first block. We
              publish this so it can be checked rather than taken on trust.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
