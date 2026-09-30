import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  useAccount,
  useBalance,
  useReadContracts,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { formatEther } from "viem";
import { AlertTriangle, Check, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./Button";
import { ConnectWallet } from "./ConnectWallet";
import {
  IPFS_GATEWAY,
  MAX_BATCH_MINT,
  termBondAbi,
  type BondTier,
} from "../../lib/bondLot";
import { TERM_CHAIN, TERM_EXPLORER_URL } from "../../lib/flare";
import { TERM_PREVIEW } from "../../lib/termPreview";

function fmtFlr(wei: bigint): string {
  const n = Number(formatEther(wei));
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function fmtNumber(value: number | bigint | null | undefined): string {
  if (value == null) return "-";
  return value.toLocaleString("en-US");
}

function fmtDate(seconds: bigint | null | undefined): string {
  if (seconds == null || seconds === 0n) return "-";
  return new Date(Number(seconds) * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function readErr(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function MintTermLot({ tier }: { tier: BondTier }) {
  const { isConnected, chainId: walletChainId, address: account } = useAccount();
  const [qtyText, setQtyText] = useState("1");
  const address = tier.address;
  const chainId = TERM_CHAIN.id;
  const onTargetChain = !isConnected || walletChainId === chainId;
  const { switchChainAsync, isPending: switching } = useSwitchChain();

  const contract = { address: address ?? undefined, abi: termBondAbi, chainId } as const;
  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      { ...contract, functionName: "maxSupply" },
      { ...contract, functionName: "totalSupply" },
      { ...contract, functionName: "mintPrice" },
      { ...contract, functionName: "isMintOpen" },
      { ...contract, functionName: "mintDeadline" },
      { ...contract, functionName: "bondExpiry" },
      { ...contract, functionName: "saleClosed" },
    ],
    query: { enabled: !!address, refetchInterval: 30_000 },
  });

  const maxSupply = data?.[0]?.result as bigint | undefined;
  const sold = data?.[1]?.result as bigint | undefined;
  const price = data?.[2]?.result as bigint | undefined;
  const mintOpen = data?.[3]?.result as boolean | undefined;
  const mintDeadline = data?.[4]?.result as bigint | undefined;
  const bondExpiry = data?.[5]?.result as bigint | undefined;
  const saleClosed = data?.[6]?.result as boolean | undefined;

  const remaining = useMemo(
    () => (maxSupply != null && sold != null ? Number(maxSupply - sold) : null),
    [maxSupply, sold],
  );
  const soldPct = useMemo(
    () => (maxSupply && sold != null && maxSupply > 0n ? Number((sold * 10000n) / maxSupply) / 100 : 0),
    [maxSupply, sold],
  );
  const maxQty = Math.max(1, Math.min(MAX_BATCH_MINT, remaining ?? MAX_BATCH_MINT));
  const qty = Math.max(1, Math.min(maxQty, Number(qtyText) || 1));
  const total = price != null ? price * BigInt(qty) : undefined;
  const openForMint = mintOpen === true && saleClosed !== true && remaining !== 0;
  // Deployed but not yet opened by the Safe: the bond has no maturity set.
  const notOpenedYet = bondExpiry === 0n;
  const saleEnded =
    !!address &&
    !notOpenedYet &&
    !openForMint &&
    (mintOpen === false || saleClosed === true || remaining === 0);

  const { data: balance } = useBalance({
    address: account,
    chainId,
    query: { enabled: !!account && !!address && onTargetChain, refetchInterval: 30_000 },
  });
  const gasReserveWei = 5n * 10n ** 18n;
  const affordable = useMemo(() => {
    if (balance == null || price == null || price === 0n) return null;
    const spendable = balance.value > gasReserveWei ? balance.value - gasReserveWei : 0n;
    return Number(spendable / price);
  }, [balance, price]);
  const shortfall =
    balance != null && price != null && affordable === 0
      ? price + gasReserveWei - balance.value
      : null;

  const { writeContractAsync, isPending } = useWriteContract();
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const {
    data: receipt,
    isLoading: confirming,
    isSuccess: confirmed,
  } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId,
    query: { enabled: !!txHash },
  });
  const [minted, setMinted] = useState<{ tokenIds: number[]; hash: `0x${string}` } | null>(null);

  useEffect(() => {
    if (!confirmed || !receipt || !txHash || !address) return;
    if (minted?.hash === txHash) return;
    const transfer = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    const ids = receipt.logs
      .filter(
        (log) =>
          log.address.toLowerCase() === address.toLowerCase() &&
          log.topics[0]?.toLowerCase() === transfer &&
          log.topics.length === 4 &&
          BigInt(log.topics[1] as string) === 0n,
      )
      .map((log) => Number(BigInt(log.topics[3] as string)));
    setMinted({ tokenIds: ids, hash: txHash });
    void refetch();
  }, [address, confirmed, minted, receipt, refetch, txHash]);

  async function onSwitch() {
    try {
      await switchChainAsync({ chainId });
    } catch (err) {
      const msg = readErr(err);
      if (/rejected|denied|User rejected/i.test(msg)) return;
      toast.error("Could not switch network", {
        description: `Select ${TERM_CHAIN.name} in your wallet, then try again.`,
      });
    }
  }

  async function onMint() {
    if (!address || total == null) return;
    try {
      const hash = await writeContractAsync({
        address,
        abi: termBondAbi,
        functionName: "mint",
        args: [BigInt(qty)],
        value: total,
        chainId,
      });
      setTxHash(hash);
      toast.success("Mint submitted", { description: "Waiting for confirmation." });
    } catch (err) {
      const msg = readErr(err);
      if (/rejected|denied|User rejected/i.test(msg)) return;
      toast.error("Mint failed", { description: msg.slice(0, 160) });
    }
  }

  if (!address) {
    return (
      <div className="glass-panel p-0">
        {tier.imageCid && (
          <img
            src={`${IPFS_GATEWAY}/${tier.imageCid}`}
            alt={`FlareForward Bonds ${tier.name} artwork`}
            loading="lazy"
            className="aspect-square w-full rounded-t-xl object-cover"
          />
        )}
        <div className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="text-lg font-semibold">{tier.name}</h3>
            <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-0.5 text-[10px] font-medium text-amber-300">
              Coming soon
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wide text-[#8FA0B8]">Price</p>
              <p className="font-semibold text-[#FAFAFA]">
                {fmtNumber(tier.terms?.priceFlr)} FLR
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-[#8FA0B8]">Supply</p>
              <p className="font-semibold text-[#FAFAFA]">{fmtNumber(tier.terms?.supply)}</p>
            </div>
          </div>
          <p className="mt-3 text-sm text-[#8FA0B8]">12 month term</p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel p-0">
      {tier.imageCid && (
        <img
          src={`${IPFS_GATEWAY}/${tier.imageCid}`}
          alt={`FlareForward Bonds ${tier.name} artwork`}
          loading="lazy"
          className="aspect-square w-full rounded-t-xl object-cover"
        />
      )}
      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="text-lg font-semibold">{tier.name}</h3>
          <div className="flex flex-wrap justify-end gap-2">
            {TERM_PREVIEW && (
              <span className="rounded-full border border-sky-300/40 bg-sky-300/10 px-2.5 py-0.5 text-[10px] font-medium text-sky-200">
                TESTNET PREVIEW
              </span>
            )}
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${
                openForMint
                  ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                  : saleEnded
                    ? "border-white/15 bg-white/5 text-[#8FA0B8]"
                    : "border-amber-400/40 bg-amber-400/10 text-amber-300"
              }`}
            >
              {openForMint ? "Mint open" : saleEnded ? "Sale closed" : notOpenedYet ? "Coming soon" : "Reading state"}
            </span>
          </div>
        </div>

        {isLoading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-[#8FA0B8]">
            <Loader2 size={14} className="animate-spin" /> Reading the contract.
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-[#8FA0B8]">Price</p>
                <p className="font-semibold text-[#FAFAFA]">
                  {price != null ? fmtFlr(price) : "-"} FLR
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[#8FA0B8]">Term</p>
                <p className="font-semibold text-[#FAFAFA]">12 month term</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[#8FA0B8]">Sold</p>
                <p className="font-semibold text-[#FAFAFA]">
                  {fmtNumber(sold)} of {fmtNumber(maxSupply)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[#8FA0B8]">Maturity</p>
                <p className="font-semibold text-[#FAFAFA]">
                  {notOpenedYet ? "Set at opening" : `Matures ${fmtDate(bondExpiry)}`}
                </p>
              </div>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/8">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#EE1A58] to-[#E85A95] transition-all"
                style={{ width: `${Math.min(100, soldPct)}%` }}
              />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-[#8FA0B8]">
              Sale open until {fmtDate(mintDeadline)} at the latest. It may close sooner.
            </p>

            {notOpenedYet ? (
              <p className="mt-4 text-sm leading-relaxed text-[#8FA0B8]">
                This tier is deployed and not open yet.
              </p>
            ) : saleEnded ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-sm font-semibold text-[#FAFAFA]">Sale closed</p>
                <p className="mt-1 text-sm leading-relaxed text-[#8FA0B8]">
                  Holders redeem Starship 2 bonds after maturity and vault finalization.
                </p>
                <Link
                  to="/nft/redeem"
                  className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[#E85A95] hover:underline"
                >
                  Go to redemption
                </Link>
              </div>
            ) : !isConnected ? (
              <div className="mt-4">
                <ConnectWallet />
              </div>
            ) : minted ? (
              <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-5">
                <p className="flex items-center gap-2 text-lg font-semibold text-emerald-300">
                  <Check size={20} />
                  Mint confirmed
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[#FAFAFA]/90">
                  {minted.tokenIds.length > 1
                    ? `Tokens #${minted.tokenIds.join(", #")} are yours.`
                    : `Token #${minted.tokenIds[0] ?? "?"} is yours.`}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-4">
                  <Link
                    to="/bonds"
                    className="inline-flex items-center gap-1 text-sm font-medium text-[#E85A95] underline"
                  >
                    See your bonds
                  </Link>
                  <a
                    href={`${TERM_EXPLORER_URL}/tx/${minted.hash}`}
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
                      setQtyText("1");
                    }}
                    className="text-sm text-[#8FA0B8] underline transition hover:text-[#FAFAFA]"
                  >
                    Mint another
                  </button>
                </div>
              </div>
            ) : !onTargetChain ? (
              <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-amber-300">
                  <AlertTriangle size={16} />
                  Your wallet is on another network
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[#FAFAFA]/90">
                  These bonds are read on {TERM_CHAIN.name}. Switch networks before minting.
                </p>
                <Button className="mt-3 w-full" onClick={onSwitch} disabled={switching}>
                  {switching ? (
                    <span className="flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin" />
                      Check your wallet.
                    </span>
                  ) : (
                    `Switch to ${TERM_CHAIN.name}`
                  )}
                </Button>
              </div>
            ) : (
              <>
                <div className="mt-4 flex items-center gap-2">
                  <label htmlFor={`term-qty-${tier.key}`} className="text-sm text-[#8FA0B8]">
                    Quantity
                  </label>
                  <input
                    id={`term-qty-${tier.key}`}
                    type="number"
                    min={1}
                    max={maxQty}
                    value={qtyText}
                    onChange={(e) => {
                      const next = e.target.value;
                      if (next === "" || /^\d+$/.test(next)) setQtyText(next);
                    }}
                    onBlur={() => setQtyText(String(qty))}
                    className="w-20 rounded-lg border border-white/12 bg-white/[0.04] px-2 py-1 text-sm"
                  />
                  <span className="text-xs text-[#8FA0B8]">max {maxQty} per transaction</span>
                </div>

                {balance != null && (
                  <p className="mt-2 text-xs text-[#8FA0B8]">
                    <span className="font-medium text-[#FAFAFA] tabular-nums">
                      {fmtFlr(balance.value)} FLR
                    </span>{" "}
                    in your wallet
                    {affordable != null && affordable > 0
                      ? `, enough for ${affordable} ${affordable === 1 ? "bond" : "bonds"} at this tier.`
                      : shortfall != null && shortfall > 0n
                        ? `, about ${fmtFlr(shortfall)} FLR short of one bond here, allowing for gas.`
                        : "."}
                  </p>
                )}

                <p className="mt-3 text-xs leading-relaxed text-amber-300/90">
                  Your FLR backs the validator for this term. At maturity, redeem the bond for its
                  share of the bond vault. Returns are not guaranteed.
                </p>

                <Button
                  className="mt-3 w-full"
                  onClick={onMint}
                  disabled={isPending || confirming || remaining === 0 || !openForMint}
                >
                  {isPending || confirming ? (
                    <span className="flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin" />
                      {isPending ? "Confirm in wallet." : "Confirming."}
                    </span>
                  ) : remaining === 0 ? (
                    "Sale closed"
                  ) : (
                    `Mint ${qty} for ${total != null ? fmtFlr(total) : "-"} FLR`
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
