export const STARSHIP2_INTRO =
  "A 12 month bond. Your FLR backs the FlareForward validator for the term. When the bond matures, you redeem it here for your share of what the treasury has returned to the bond vault. The bond does not renew. Returns are not guaranteed.";

export const REDEMPTION_STEPS = [
  "Each Starship 2 bond has one maturity date, set when the bond was created. It is the same for every bond in that tier and it cannot be changed.",
  "Until that date you can hold the bond or sell it. You cannot redeem early.",
  "Before the maturity date, the FlareForward treasury returns funds to that tier's bond vault. The vault is a contract on Flare that anyone can read.",
  "On or after the maturity date, the vault is finalized. That locks in the amount per bond: everything in the vault, split equally across the bonds sold in that tier.",
  "You then redeem here. Redeeming burns your bond and sends your share to your wallet as FLR in the same transaction. If the payment cannot be made, the bond is not burned.",
  "After the maturity date a bond can no longer be transferred or sold. It can only be redeemed.",
];

export const STARSHIP2_KNOW_BULLETS = [
  "The amount you receive is your share of what is in the vault. It is not a fixed or promised amount. The contract cannot force the treasury to deposit.",
  "Redemption opens when the vault is finalized, not at the exact second of maturity. This page shows the live status.",
  "If something goes badly wrong, 2 of the 3 Safe signers can release what remains in the vault to a recovery address, no sooner than 30 days after maturity. That would end normal redemption.",
  "There is no deadline to redeem. Your share waits in the vault.",
];

/** Security notes for /nft/disclosures. Not shown on the redemption page or the mint cards. */
export const STARSHIP2_SECURITY_NOTES = [
  "The Starship 2 bond contract can be upgraded by the 2-of-3 Bond Treasury Safe. There is no time delay on an upgrade.",
  "The vault contract that holds redemption funds cannot be upgraded.",
  "The Bond Treasury Safe owns each Starship 2 bond contract and manages each vault. The key that deployed them holds no role.",
];
