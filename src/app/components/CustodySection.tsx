import { ShieldAlert } from "lucide-react";
import { CUSTODY } from "../../lib/bondLot";
import { EXPLORER_URL } from "../../lib/flare";

/**
 * Who holds a buyer's money, in plain words, directly above the mint.
 *
 * Every claim here was read from Flare mainnet and is re-checked whenever the
 * config in `bondLot.ts` changes. This section is deliberately uncomfortable:
 * it says single-key control while that is true, and only says "multisig"
 * for the parts that actually are. Doctrine: no APR/APY, no "like staking",
 * no site-wide non-custodial claim.
 */
export function CustodySection() {
  const safe = CUSTODY.bondTreasurySafe;
  const addr = (a: string) => `${EXPLORER_URL}/address/${a}`;

  return (
    <section id="custody" className="mt-10 scroll-mt-6">
      <div className="flex items-center gap-3">
        <ShieldAlert size={20} className="text-amber-300" />
        <h2 className="text-xl font-semibold">Who holds your money</h2>
      </div>

      <div className="glass-panel mt-4 border border-amber-400/25 p-5 text-sm leading-relaxed text-[#8FA0B8]">
        <div className="grid gap-x-8 gap-y-4 lg:grid-cols-2">
          <div className="space-y-4">
            <p className="text-[#FAFAFA]/90">
              <strong className="text-[#FAFAFA]">
                When you mint a bond, your FLR becomes FlareForward&apos;s.
              </strong>{" "}
              It is not held in escrow, not held in trust, and not returned.
              This page is the only place that will tell you that plainly, so
              read this section before you mint.
            </p>

            <p>
              <strong className="text-[#FAFAFA]">Where it goes.</strong> Your
              FLR lands in the lot&apos;s mint contract. FlareForward sweeps it
              to the FlareForward treasury, wraps it, and delegates it to the
              FlareForward FTSO provider, where it adds to the provider&apos;s
              vote power and earns delegation rewards. Nothing in any contract
              forces that sequence. It is what we do, and you are trusting us to
              keep doing it.
            </p>

            <p>
              <strong className="text-[#FAFAFA]">Who can move it.</strong>{" "}
              {safe ? (
                <>
                  Bond proceeds are held by the Bond Treasury Safe, a 2-of-3
                  multisig of the three FlareForward principals. Nothing leaves
                  it without two of the three of us signing. The mint contracts
                  for every lot are owned by that Safe.
                </>
              ) : (
                <>
                  Today, one person, with one hardware wallet. The FlareForward
                  treasury is a single-signature address (
                  <a
                    href={addr(CUSTODY.treasuryKey)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-[#E85A95] hover:underline"
                  >
                    {CUSTODY.treasuryKey}
                  </a>
                  ). The mint contracts for every lot are owned by that same
                  address. There is no multisig, no timelock, and no on-chain
                  rule that stops FlareForward from moving this capital
                  anywhere, at any time. We are changing this, see &ldquo;How
                  your money is separated from ours&rdquo; below, but it is true
                  as you read this.
                </>
              )}
            </p>

            <p>
              <strong className="text-[#FAFAFA]">How you get paid.</strong> Each
              closed lot gets its own distribution contract. FlareForward
              measures what the validator earned, deposits FLR into that
              contract, and holders claim their equal per-token share.{" "}
              <strong className="text-[#FAFAFA]">
                The deposit is a decision we make, not something a contract
                compels.
              </strong>{" "}
              The distribution contract is also controlled by the FlareForward
              key described above, and that key can withdraw funds out of it.
            </p>

            <p>
              <strong className="text-[#FAFAFA]">What you own.</strong> A
              transferable NFT and a claim on whatever FlareForward deposits for
              that lot. You do not own a share of the treasury, the validator,
              or FlareForward.
            </p>

            <p>
              <strong className="text-[#FAFAFA]">How you exit.</strong> By
              selling the NFT. There is no burn-to-redeem: supply is frozen at
              deploy so the split never recalculates. Redemption rails for
              returning principal exist and have been tested, but opening a
              redemption window depends on FlareForward pre-funding it with real
              FLR, and bonded capital is locked for the bond period.{" "}
              <strong className="text-[#FAFAFA]">
                No redemption window is open, and none is scheduled.
              </strong>{" "}
              Do not mint on the expectation of one.
            </p>

            <p>
              <strong className="text-[#FAFAFA]">
                Never send your bond NFT to an address nobody controls.
              </strong>{" "}
              Our contracts have no burn function, so the real hazard is a
              transfer to a dead address. That token&apos;s future share is
              stranded permanently, because total supply never changes.
            </p>
          </div>
          <div className="space-y-4">
            <h3 className="font-semibold text-[#FAFAFA]">
              What has actually been paid so far
            </h3>
            {/* Standing rule: this paragraph stays verbatim until the first distribution
            lands, then is rewritten to "first distribution paid on <date>", never deleted. */}
            <p>
              <strong className="text-[#FAFAFA]">
                Nothing, to anyone, for any lot.
              </strong>{" "}
              No distribution contract has been deployed and no holder has ever
              received a payment. {CUSTODY.firstClosedLot.name} closed on{" "}
              {CUSTODY.firstClosedLot.closedOn} at 250/250 and has distributed
              nothing. Any rate shown elsewhere on this site is{" "}
              <strong className="text-[#FAFAFA]">
                what the validator earns
              </strong>
              , not a record of what holders have been paid.
            </p>

            <h3 className="pt-2 font-semibold text-[#FAFAFA]">
              How your money is separated from ours
            </h3>
            <p>
              Decided 2026-09-14, being implemented now. Buyer capital and
              FlareForward&apos;s own revenue will never share an address.
            </p>
            <ul className="space-y-2 pl-1">
              <li>
                •{" "}
                <strong className="text-[#FAFAFA]">
                  Bond Treasury Safe, buyer capital only.
                </strong>{" "}
                A 2-of-3 multisig of the three FlareForward principals, holding
                bond proceeds between mint and bonding, and every payout before
                it is deposited for holders. Nothing leaves it without two of
                the three of us signing.{" "}
                {safe ? (
                  <>
                    Address:{" "}
                    <a
                      href={addr(safe)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all text-[#E85A95] hover:underline"
                    >
                      {safe}
                    </a>
                    {CUSTODY.bondTreasurySafeControlTx && (
                      <>
                        {" "}
                        · the transaction that moved control:{" "}
                        <a
                          href={`${EXPLORER_URL}/tx/${CUSTODY.bondTreasurySafeControlTx}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="break-all text-[#E85A95] hover:underline"
                        >
                          view
                        </a>
                      </>
                    )}
                    .
                  </>
                ) : (
                  <>
                    <span className="text-amber-300">Not yet deployed.</span>{" "}
                    The address and the transaction that moved control will be
                    published here when it is live.
                  </>
                )}
              </li>
              <li>
                •{" "}
                <strong className="text-[#FAFAFA]">
                  Operating Safe, FlareForward revenue only.
                </strong>{" "}
                Our existing 2-of-3 multisig (
                <a
                  href={addr(CUSTODY.operatingSafe)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-[#E85A95] hover:underline"
                >
                  {CUSTODY.operatingSafe}
                </a>
                , live since July 2026), holding FTSO fee revenue. Bond capital
                does not touch it.
              </li>
              <li>
                •{" "}
                <strong className="text-[#FAFAFA]">
                  The validator bond itself: one hardware key, for the whole
                  staking term.
                </strong>{" "}
                Flare&apos;s P-chain staking tooling does not support multisig
                today. So when bond capital is staked, it is held on a single
                hardware wallet key (a Ledger) for the 60-day term, released by
                the 2-of-3 Safe and returned to it at the end. That is the
                weakest point in our custody and we are telling you rather than
                hiding it behind the word &ldquo;multisig.&rdquo; We will
                revisit multisig staking when the tooling supports it.
              </li>
              <li>
                •{" "}
                <strong className="text-[#FAFAFA]">
                  Free operator minting.
                </strong>{" "}
                Our lot contracts allow the owner to mint tokens at no cost into
                an open lot. We commit not to use this on any public lot. It
                will be behind the same 2-of-3.
              </li>
            </ul>
            {!safe && (
              <p className="text-[#FAFAFA]/90">
                Until you see the Bond Treasury Safe address published here,
                assume single-key control of bond proceeds. We would rather you
                read that than assume otherwise.
              </p>
            )}

            <h3 className="pt-2 font-semibold text-[#FAFAFA]">
              Why we are telling you this
            </h3>
            <p>
              A Flare liquid-staking protocol spent seven weeks in 2026 with a
              public claim that it &ldquo;never takes possession, custody, or
              control&rdquo; while, on chain, pooled depositor capital was being
              used as validator self-bonds. Nobody has shown that any of it was
              stolen. The damage was the gap between the claim on the site and
              what the keys could actually do.
            </p>
            <p>
              We would rather publish the uncomfortable version and be
              checkable. We started this program on a single key. That was a
              mistake in posture, not in intent, and it is being corrected in
              the open. It is fine to make a mistake; it is not fine to keep
              making it.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
