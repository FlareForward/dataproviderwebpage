import { useMemo, useState } from "react";
import { useAccount, useReadContracts, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { formatEther } from "viem";
import { Loader2, Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./Button";
import { ConnectWallet } from "./ConnectWallet";
import { bondLotAbi, MAX_BATCH_MINT, type BondTier } from "../../lib/bondLot";

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
  const { isLoading: confirming, isSuccess: confirmed } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: !!txHash },
  });

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
      <div className="glass-panel p-5">
        <h3 className="font-semibold">{tier.name}</h3>
        <p className="mt-2 text-sm text-[#8FA0B8]">{tier.blurb}</p>
        <span className="mt-4 inline-flex rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[11px] font-medium text-amber-300">
          OPENS WITH LOT 1
        </span>
      </div>
    );
  }

  return (
    <div className="glass-panel p-5">
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

              {confirmed && txHash && (
                <p className="mt-2 flex items-center gap-1.5 text-sm text-emerald-400">
                  <Check size={14} /> Minted.
                  <a
                    href={`https://flarescan.com/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 underline"
                    onClick={() => refetch()}
                  >
                    View <ExternalLink size={12} />
                  </a>
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
