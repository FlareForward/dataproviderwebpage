# How FTSO V1 works

Moved off the bonds page on Thu Nov 26 2026 (operator: the site has been live long enough to tuck this away).
This was the four-step "How FTSO V1 works" section on `/nft`, kept here word for word.

1. **Mint.** Buy while a lot is open. Price, minted count, and remaining supply are read from the contract.
2. **Bond.** As the bond period ends, the lot closes and the raised FLR moves into the validator self-bond.
3. **Measure.** After closed epochs, we measure what the validator earned and deposit holder rewards into the lot's distribution contract. Equal share per NFT.
4. **Sell.** The exit is selling the NFT to another buyer. Unclaimed rewards travel with it. FTSO V1 has no redemption window open or scheduled.
