import { useEffect, useMemo, useState } from "react";
import { useAccount, useReadContracts, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { formatEther } from "viem";
import { Loader2, Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./Button";
import { ConnectWallet } from "./ConnectWallet";
import { bondLotAbi, IPFS_GATEWAY, MAX_BATCH_MINT, type BondTier } from "../../lib/bondLot";

/** FLR amounts on a sales page need separators: "10,000" not "10000". */
function fmtFlr(wei: bigint): string {
  const n = Number(formatEther(wei));
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

/**
 * Storefront for one bond lot tier.
 *
 * Every number shown — supply, price, sold count, open/closed — is read from
 * the contract, never hardcoded, so the page cannot advertise terms the
 * contract wouldn't honour.
 */
export function MintLot({ tier, preview }: { tier: BondTier; preview?: boolean }) {
  const { isConnected } = useAccount();
  const [qty, setQty] = useState(1);
  const address = tier.address;

  const contract = { address: address ?? undefined, abi: bondLotAbi } as const;
  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      { ...contract, functionName: "maxSupply" },
      { ...contract, functionName: "totalSupply" },
      { ...contract, functionName: "mintPrice" },
      { ...contract, functionName: "mintOpen" },
    ],
    query: { enabled: !!address, refetchInterval: 30_000 },
  });

  const maxSupply = data?.[0]?.result as bigint | undefined;
  const sold = data?.[1]?.result as bigint | undefined;
  const price = data?.[2]?.result as bigint | undefined;
  const open = data?.[3]?.result as boolean | undefined;

  const { writeContractAsync, isPending } = useWriteContract();
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const {
    data: receipt,
    isLoading: confirming,
    isSuccess: confirmed,
  } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: !!txHash },
  });

  /**
   * A completed mint latches here and REPLACES the mint button until the buyer
   * explicitly chooses to buy again. Leaving a live "Mint · 10,000 FLR" button
   * sitting under a small success note is how people spend twice by accident.
   */
  const [minted, setMinted] = useState<{ tokenIds: number[]; hash: `0x${string}` } | null>(null);

  useEffect(() => {
    if (!confirmed || !receipt || !txHash) return;
    // Idempotent per transaction: without this, an unstable `refetch` identity
    // would re-run the effect after every refetch and loop on the RPC.
    if (minted?.hash === txHash) return;
    // ERC-721 Transfer(address,address,uint256): mints come from the zero
    // address and carry the token id in the last indexed topic.
    const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    const ids = receipt.logs
      .filter(
        (l) =>
          l.address.toLowerCase() === (address ?? "").toLowerCase() &&
          l.topics[0]?.toLowerCase() === TRANSFER &&
          l.topics.length === 4 &&
          BigInt(l.topics[1] as string) === 0n,
      )
      .map((l) => Number(BigInt(l.topics[3] as string)));
    setMinted({ tokenIds: ids, hash: txHash });
    // Update the sold counter straight away rather than waiting for the poll —
    // watching it sit at the old number is what makes a mint feel unfinished.
    void refetch();
  }, [confirmed, receipt, txHash, address, refetch, minted]);

  const remaining = useMemo(
    () => (maxSupply != null && sold != null ? Number(maxSupply - sold) : null),
    [maxSupply, sold],
  );
  const soldPct = useMemo(
    () => (maxSupply && sold != null && maxSupply > 0n ? Number((sold * 10000n) / maxSupply) / 100 : 0),
    [maxSupply, sold],
  );
  const maxQty = Math.max(1, Math.min(MAX_BATCH_MINT, remaining ?? MAX_BATCH_MINT));
  const total = price != null ? price * BigInt(qty) : undefined;

  async function onMint() {
    if (!address || total == null) return;
    try {
      const hash = await writeContractAsync({
        address,
        abi: bondLotAbi,
        functionName: "mint",
        args: [BigInt(qty)],
        value: total,
      });
      setTxHash(hash);
      toast.success("Mint submitted", { description: "Waiting for confirmation…" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // User rejections are not failures worth shouting about.
      if (/rejected|denied|User rejected/i.test(msg)) return;
      toast.error("Mint failed", { description: msg.slice(0, 160) });
    }
  }

  if (!address) {
    return (
      <div className="glass-panel overflow-hidden p-0">
        {tier.imageCid && (
          <img
            src={`${IPFS_GATEWAY}/${tier.imageCid}`}
            alt={`FlareForward Bonds ${tier.name} artwork`}
            loading="lazy"
            className="aspect-square w-full object-cover"
          />
        )}
        <div className="p-5">
          <h3 className="font-semibold">{tier.name}</h3>
          <p className="mt-2 text-sm text-[#8FA0B8]">{tier.blurb}</p>
          <span className="mt-4 inline-flex rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[11px] font-medium text-amber-300">
            OPENS WITH LOT 1
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel overflow-hidden p-0">
      {/* The artwork a buyer actually receives — same image the token metadata
          points at, so the card and the marketplace show the same thing. */}
      {tier.imageCid && (
        <img
          src={`${IPFS_GATEWAY}/${tier.imageCid}`}
          alt={`FlareForward Bonds ${tier.name} artwork`}
          loading="lazy"
          className="aspect-square w-full object-cover"
        />
      )}
      <div className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold">{tier.name}</h3>
        {preview && (
          <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-0.5 text-[10px] font-medium text-amber-300">
            PREVIEW CONTRACT
          </span>
        )}
        {open === false && (
          <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-[10px] font-medium text-[#8FA0B8]">
            CLOSED
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-[#8FA0B8]">{tier.blurb}</p>

      {isLoading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-[#8FA0B8]">
          <Loader2 size={14} className="animate-spin" /> Reading the contract…
        </div>
      ) : (
        <>
          <div className="mt-4 flex items-baseline justify-between text-sm">
            <span className="font-medium">
              {sold != null ? sold.toString() : "—"} / {maxSupply != null ? maxSupply.toString() : "—"} minted
            </span>
            <span className="text-[#8FA0B8]">
              {price != null ? `${fmtFlr(price)} FLR each` : "—"}
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#EE1A58] to-[#E85A95] transition-all"
              style={{ width: `${Math.min(100, soldPct)}%` }}
            />
          </div>

          {open === false ? (
            <p className="mt-4 text-sm text-[#8FA0B8]">
              This lot is closed. Supply is capped at what sold; the capital is bonded. Tokens trade
              on the secondary market.
            </p>
          ) : !isConnected ? (
            <div className="mt-4">
              <ConnectWallet />
            </div>
          ) : minted ? (
            /* Terminal state: no mint button here at all, so a second purchase
               has to be a deliberate act. */
            <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-5">
              <p className="flex items-center gap-2 text-lg font-semibold text-emerald-300">
                <Check size={20} />
                Thank you for being here at the start.
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[#FAFAFA]/90">
                {minted.tokenIds.length > 1
                  ? `Tokens #${minted.tokenIds.join(", #")} are yours`
                  : `Token #${minted.tokenIds[0] ?? "?"} is yours`}
                , from the Genesis lot — the very first FlareForward Bonds ever issued. Nothing
                about this works without people willing to go first, and you did. We&apos;re
                genuinely grateful for this community and for the support that gets independent
                infrastructure off the ground. You&apos;re part of the journey now, not a customer
                of it.
              </p>

              <ol className="mt-4 space-y-2 text-sm leading-relaxed text-[#8FA0B8]">
                <li>
                  <span className="font-medium text-[#FAFAFA]">Today.</span> Your FLR goes
                  straight to work — delegated to our FTSO provider, earning from now rather than
                  from the day the bond opens.
                </li>
                <li>
                  <span className="font-medium text-[#FAFAFA]">At our next P-chain window.</span>{" "}
                  This lot closes, supply caps at whatever sold, and the capital moves into the
                  validator self-bond.
                </li>
                <li>
                  <span className="font-medium text-[#FAFAFA]">From there, monthly.</span> You
                  share what the infrastructure earns, claimed per token, for as long as you hold.
                </li>
              </ol>

              <div className="mt-4 flex flex-wrap items-center gap-4">
                <a
                  href="#your-bonds"
                  className="inline-flex items-center gap-1 text-sm font-medium text-[#E85A95] underline"
                >
                  See your bonds
                </a>
                <a
                  href={`https://flarescan.com/tx/${minted.hash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-[#8FA0B8] underline transition hover:text-[#FAFAFA]"
                >
                  Receipt <ExternalLink size={12} />
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setMinted(null);
                    setQty(1);
                  }}
                  className="text-sm text-[#8FA0B8] underline transition hover:text-[#FAFAFA]"
                >
                  Mint another
                </button>
              </div>

              <p className="mt-4 border-t border-white/10 pt-3 text-xs leading-relaxed text-[#8FA0B8]/80">
                Your wallet app may take a day to show it — that is the wallet indexing a brand-new
                collection, not a problem with your token. It is on-chain and yours the moment this
                transaction confirmed; &ldquo;See your bonds&rdquo; reads it straight from the
                contract.
              </p>
              <p className="mt-2 text-xs italic text-[#8FA0B8]/70">
                Grateful to God, and to you, for the start of this.
              </p>
            </div>
          ) : (
            <>
              <div className="mt-4 flex items-center gap-2">
                <label htmlFor={`qty-${tier.key}`} className="text-sm text-[#8FA0B8]">
                  Quantity
                </label>
                <input
                  id={`qty-${tier.key}`}
                  type="number"
                  min={1}
                  max={maxQty}
                  value={qty}
                  onChange={(e) =>
                    setQty(Math.max(1, Math.min(maxQty, Number(e.target.value) || 1)))
                  }
                  className="w-20 rounded-lg border border-white/12 bg-white/[0.04] px-2 py-1 text-sm"
                />
                <span className="text-xs text-[#8FA0B8]">max {maxQty} per transaction</span>
              </div>

              <Button
                className="mt-3 w-full"
                onClick={onMint}
                disabled={isPending || confirming || remaining === 0}
              >
                {isPending || confirming ? (
                  <span className="flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    {isPending ? "Confirm in wallet…" : "Confirming…"}
                  </span>
                ) : remaining === 0 ? (
                  "Sold out"
                ) : (
                  `Mint ${qty} · ${total != null ? fmtFlr(total) : "—"} FLR`
                )}
              </Button>

            </>
          )}
        </>
      )}
      </div>
    </div>
  );
}
