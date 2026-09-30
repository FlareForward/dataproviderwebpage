import { useMemo, useState } from "react";
import { Link } from "react-router";
import {
  useAccount,
  usePublicClient,
  useReadContracts,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { formatEther } from "viem";
import { AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink, Gem, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./components/Button";
import { ConnectWallet } from "./components/ConnectWallet";
import {
  ADDRESS_RE,
  bondVaultAbi,
  CURRENT_LOT,
  IPFS_GATEWAY,
  isTermTier,
  termBondAbi,
  type BondTier,
} from "../lib/bondLot";
import { TERM_CHAIN, TERM_EXPLORER_URL } from "../lib/flare";
import { TERM_PREVIEW } from "../lib/termPreview";
import { REDEMPTION_STEPS, STARSHIP2_KNOW_BULLETS } from "../lib/starship2Copy";

const ZERO = "0x0000000000000000000000000000000000000000" as const;
const MAX_ENUMERATE = 100;

type LiveTermTier = BondTier & { kind: "term"; address: `0x${string}` };
type BondRecord = { tier: LiveTermTier; tokenId: bigint };

const LIVE_TERM_TIERS = CURRENT_LOT.tiers.filter(
  (tier): tier is LiveTermTier => isTermTier(tier) && !!tier.address,
);

function fmtFlr(wei: bigint | null | undefined): string {
  if (wei == null) return "-";
  const n = Number(formatEther(wei));
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function fmtDate(seconds: bigint | null | undefined): string {
  if (seconds == null || seconds === 0n) return "-";
  return new Date(Number(seconds) * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function bondKey(record: BondRecord): string {
  return `${record.tier.key}-${record.tokenId.toString()}`;
}

function readMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default function Redeem() {
  const { address, isConnected, chainId: walletChainId } = useAccount();
  const chainId = TERM_CHAIN.id;
  const onTargetChain = !isConnected || walletChainId === chainId;
  const publicClient = usePublicClient({ chainId });
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [pendingBond, setPendingBond] = useState<string | null>(null);
  const [failureByBond, setFailureByBond] = useState<Record<string, string>>({});
  const [lastSuccess, setLastSuccess] = useState<{
    tierName: string;
    tokenId: bigint;
    hash: `0x${string}`;
  } | null>(null);

  const { data: tierData, isLoading: loadingTiers, refetch: refetchTiers } = useReadContracts({
    contracts: LIVE_TERM_TIERS.flatMap((tier) => [
      {
        address: tier.address,
        abi: termBondAbi,
        functionName: "bondExpiry" as const,
        chainId,
      },
      {
        address: tier.address,
        abi: termBondAbi,
        functionName: "bondVault" as const,
        chainId,
      },
    ]),
    query: { enabled: LIVE_TERM_TIERS.length > 0, refetchInterval: 30_000 },
  });

  const tierInfo = useMemo(() => {
    const map = new Map<
      string,
      { expiry?: bigint; vault?: `0x${string}`; tier: LiveTermTier }
    >();
    LIVE_TERM_TIERS.forEach((tier, index) => {
      const vaultRead = tierData?.[index * 2 + 1]?.result as `0x${string}` | undefined;
      const vault = vaultRead && ADDRESS_RE.test(vaultRead) ? vaultRead : tier.vault ?? undefined;
      map.set(tier.key, {
        tier,
        expiry: tierData?.[index * 2]?.result as bigint | undefined,
        vault: vault && ADDRESS_RE.test(vault) ? vault : undefined,
      });
    });
    return map;
  }, [tierData]);

  const { data: balances, isLoading: loadingBalances, refetch: refetchBalances } = useReadContracts({
    contracts: LIVE_TERM_TIERS.map((tier) => ({
      address: tier.address,
      abi: termBondAbi,
      functionName: "balanceOf" as const,
      args: [address ?? ZERO] as const,
      chainId,
    })),
    query: { enabled: !!address && LIVE_TERM_TIERS.length > 0, refetchInterval: 30_000 },
  });

  const indexCalls = useMemo(
    () =>
      LIVE_TERM_TIERS.flatMap((tier, tierIndex) => {
        const balance = Number((balances?.[tierIndex]?.result as bigint | undefined) ?? 0n);
        return Array.from({ length: Math.min(balance, MAX_ENUMERATE) }, (_, index) => ({
          tier,
          index,
        }));
      }),
    [balances],
  );

  const { data: ids, isLoading: loadingIds, refetch: refetchIds } = useReadContracts({
    contracts: indexCalls.map((call) => ({
      address: call.tier.address,
      abi: termBondAbi,
      functionName: "tokenOfOwnerByIndex" as const,
      args: [address ?? ZERO, BigInt(call.index)] as const,
      chainId,
    })),
    query: { enabled: !!address && indexCalls.length > 0 },
  });

  const held = useMemo(
    () =>
      indexCalls
        .map((call, index) => {
          const id = ids?.[index]?.result as bigint | undefined;
          return id == null ? null : { tier: call.tier, tokenId: id };
        })
        .filter((record): record is BondRecord => !!record)
        .sort((a, b) => a.tier.key.localeCompare(b.tier.key) || Number(a.tokenId - b.tokenId)),
    [ids, indexCalls],
  );

  const vaultCalls = useMemo(
    () =>
      [...tierInfo.values()]
        .filter((info): info is { tier: LiveTermTier; expiry?: bigint; vault: `0x${string}` } => !!info.vault)
        .flatMap((info) => [
          {
            tierKey: info.tier.key,
            vault: info.vault,
            functionName: "distributionFinalized" as const,
          },
          { tierKey: info.tier.key, vault: info.vault, functionName: "payoutPerToken" as const },
          { tierKey: info.tier.key, vault: info.vault, functionName: "totalAssets" as const },
          { tierKey: info.tier.key, vault: info.vault, functionName: "expiry" as const },
          { tierKey: info.tier.key, vault: info.vault, functionName: "emergencyReleased" as const },
        ]),
    [tierInfo],
  );

  const { data: vaultData, isLoading: loadingVaults, refetch: refetchVaults } = useReadContracts({
    contracts: vaultCalls.map((call) => ({
      address: call.vault,
      abi: bondVaultAbi,
      functionName: call.functionName,
      chainId,
    })),
    query: { enabled: vaultCalls.length > 0, refetchInterval: 30_000 },
  });

  const vaultState = useMemo(() => {
    const map = new Map<
      string,
      {
        distributionFinalized?: boolean;
        payoutPerToken?: bigint;
        totalAssets?: bigint;
        expiry?: bigint;
        emergencyReleased?: boolean;
      }
    >();
    for (let index = 0; index < vaultCalls.length; index += 5) {
      const tierKey = vaultCalls[index]?.tierKey;
      if (!tierKey) continue;
      map.set(tierKey, {
        distributionFinalized: vaultData?.[index]?.result as boolean | undefined,
        payoutPerToken: vaultData?.[index + 1]?.result as bigint | undefined,
        totalAssets: vaultData?.[index + 2]?.result as bigint | undefined,
        expiry: vaultData?.[index + 3]?.result as bigint | undefined,
        emergencyReleased: vaultData?.[index + 4]?.result as boolean | undefined,
      });
    }
    return map;
  }, [vaultCalls, vaultData]);

  const claimCalls = useMemo(
    () =>
      held
        .map((record) => {
          const vault = tierInfo.get(record.tier.key)?.vault;
          return vault ? { record, vault } : null;
        })
        .filter((call): call is { record: BondRecord; vault: `0x${string}` } => !!call),
    [held, tierInfo],
  );

  const {
    data: claimableData,
    isLoading: loadingClaimable,
    refetch: refetchClaimable,
  } = useReadContracts({
    contracts: claimCalls.map((call) => ({
      address: call.vault,
      abi: bondVaultAbi,
      functionName: "claimableForToken" as const,
      args: [call.record.tokenId] as const,
      chainId,
    })),
    query: { enabled: claimCalls.length > 0, refetchInterval: 30_000 },
  });

  const claimableByBond = useMemo(() => {
    const map = new Map<string, bigint>();
    claimCalls.forEach((call, index) => {
      const value = claimableData?.[index]?.result as bigint | undefined;
      if (value != null) map.set(bondKey(call.record), value);
    });
    return map;
  }, [claimCalls, claimableData]);

  const groups = useMemo(() => {
    const byTier = new Map<string, { tier: LiveTermTier; records: BondRecord[] }>();
    for (const record of held) {
      const group = byTier.get(record.tier.key) ?? { tier: record.tier, records: [] };
      group.records.push(record);
      byTier.set(record.tier.key, group);
    }
    return [...byTier.values()];
  }, [held]);

  const loading = loadingTiers || loadingBalances || loadingIds || loadingVaults || loadingClaimable;

  async function refresh() {
    await Promise.all([
      refetchTiers(),
      refetchBalances(),
      refetchIds(),
      refetchVaults(),
      refetchClaimable(),
    ]);
  }

  async function onSwitch() {
    try {
      await switchChainAsync({ chainId });
    } catch (err) {
      const msg = readMessage(err);
      if (/rejected|denied|User rejected/i.test(msg)) return;
      toast.error("Could not switch network", {
        description: `Select ${TERM_CHAIN.name} in your wallet, then try again.`,
      });
    }
  }

  async function redeem(record: BondRecord) {
    const key = bondKey(record);
    if (!publicClient || pendingBond) return;
    setPendingBond(key);
    setFailureByBond((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    try {
      const hash = await writeContractAsync({
        address: record.tier.address,
        abi: termBondAbi,
        functionName: "burn",
        args: [record.tokenId],
        chainId,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setLastSuccess({ tierName: record.tier.name, tokenId: record.tokenId, hash });
      toast.success("Redeemed", { description: "Your bond was burned and the FLR was sent." });
      await refresh();
    } catch (err) {
      const msg = readMessage(err);
      if (/rejected|denied|User rejected/i.test(msg)) return;
      setFailureByBond((current) => ({ ...current, [key]: msg.slice(0, 180) }));
      toast.error("Redemption failed", { description: msg.slice(0, 160) });
    } finally {
      setPendingBond(null);
    }
  }

  return (
    <div className="p-4 lg:p-8">
      <div className="max-w-5xl">
        <Link
          to="/nft"
          className="inline-flex items-center gap-1 text-sm text-[#8FA0B8] hover:text-[#FAFAFA]"
        >
          <ArrowLeft size={14} /> Bond lots
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Gem size={24} className="text-[#E85A95]" />
          <h1 className="text-2xl font-bold tracking-tight">Starship 2 redemption</h1>
          {TERM_PREVIEW && (
            <span className="rounded-full border border-sky-300/40 bg-sky-300/10 px-2.5 py-0.5 text-[10px] font-medium text-sky-200">
              TESTNET PREVIEW
            </span>
          )}
        </div>
      </div>

      <section className="mt-8 max-w-5xl" aria-labelledby="redemption-rules">
        <h2 id="redemption-rules" className="text-xl font-semibold">
          How redemption works
        </h2>
        <ol className="glass-panel mt-4 space-y-3 p-5 text-sm leading-relaxed text-[#8FA0B8]">
          {REDEMPTION_STEPS.map((step, index) => (
            <li key={step} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#EE1A58]/15 text-xs font-bold text-[#E85A95]">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>

        <div className="glass-panel mt-4 p-5">
          <h3 className="font-semibold text-[#FAFAFA]">What you should know</h3>
          <ul className="mt-3 grid gap-2 text-sm leading-relaxed text-[#8FA0B8] lg:grid-cols-2">
            {STARSHIP2_KNOW_BULLETS.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-10 max-w-5xl" aria-labelledby="your-starship2-bonds">
        <h2 id="your-starship2-bonds" className="text-xl font-semibold">
          Your Starship 2 bonds
        </h2>

        {LIVE_TERM_TIERS.length === 0 ? (
          <div className="glass-panel mt-4 p-6 text-sm text-[#8FA0B8]">
            Starship 2 bonds are not on sale yet.
          </div>
        ) : !isConnected ? (
          <div className="glass-panel mt-4 p-5">
            <p className="mb-4 text-sm leading-relaxed text-[#8FA0B8]">
              Connect your wallet to see your Starship 2 bonds and redeem after maturity.
            </p>
            <ConnectWallet />
          </div>
        ) : (
          <>
            {!onTargetChain && (
              <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-amber-300">
                  <AlertTriangle size={16} />
                  Your wallet is on another network
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[#FAFAFA]/90">
                  Switch to {TERM_CHAIN.name} before redeeming a Starship 2 bond.
                </p>
                <Button className="mt-3" onClick={onSwitch} disabled={switching}>
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
            )}

            {lastSuccess && (
              <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                  <CheckCircle2 size={16} />
                  Redeemed {lastSuccess.tierName} #{lastSuccess.tokenId.toString()}
                </p>
                <a
                  href={`${TERM_EXPLORER_URL}/tx/${lastSuccess.hash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-sm text-[#FAFAFA] underline"
                >
                  View transaction <ExternalLink size={12} />
                </a>
              </div>
            )}

            {loading ? (
              <div className="glass-panel mt-4 flex items-center gap-2 p-6 text-sm text-[#8FA0B8]">
                <Loader2 size={15} className="animate-spin" />
                Reading your Starship 2 bonds.
              </div>
            ) : held.length === 0 ? (
              <div className="glass-panel mt-4 p-6 text-sm text-[#8FA0B8]">
                This wallet holds no Starship 2 bonds.
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {groups.map((group) => {
                  const info = tierInfo.get(group.tier.key);
                  const vault = vaultState.get(group.tier.key);
                  const maturity = info?.expiry ?? vault?.expiry;
                  return (
                    <div key={group.tier.key} className="glass-panel p-0">
                      <div className="flex flex-col gap-3 border-b border-white/8 p-4 sm:flex-row sm:items-center">
                        {group.tier.imageCid && (
                          <img
                            src={`${IPFS_GATEWAY}/${group.tier.imageCid}`}
                            alt=""
                            loading="lazy"
                            className="h-14 w-14 rounded-lg object-cover"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[#FAFAFA]">{group.tier.name}</p>
                          <p className="text-sm text-[#8FA0B8]">
                            {group.records.length} bond{group.records.length === 1 ? "" : "s"} held.
                            {maturity ? ` Matures ${fmtDate(maturity)}.` : " Reading maturity."}
                          </p>
                        </div>
                        <div className="text-xs text-[#8FA0B8] sm:text-right">
                          Vault assets {fmtFlr(vault?.totalAssets)} FLR
                          <br />
                          {vault?.distributionFinalized
                            ? `Per bond ${fmtFlr(vault?.payoutPerToken)} FLR`
                            : "Per bond: set when the vault is finalized"}
                        </div>
                      </div>
                      <div className="divide-y divide-white/8">
                        {group.records.map((record) => (
                          <BondRedeemRow
                            key={bondKey(record)}
                            record={record}
                            maturity={maturity}
                            emergencyReleased={vault?.emergencyReleased}
                            distributionFinalized={vault?.distributionFinalized}
                            claimable={claimableByBond.get(bondKey(record))}
                            pending={pendingBond === bondKey(record)}
                            disabled={!onTargetChain || !!pendingBond}
                            failure={failureByBond[bondKey(record)]}
                            onRedeem={() => void redeem(record)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function BondRedeemRow({
  record,
  maturity,
  emergencyReleased,
  distributionFinalized,
  claimable,
  pending,
  disabled,
  failure,
  onRedeem,
}: {
  record: BondRecord;
  maturity: bigint | undefined;
  emergencyReleased: boolean | undefined;
  distributionFinalized: boolean | undefined;
  claimable: bigint | undefined;
  pending: boolean;
  disabled: boolean;
  failure: string | undefined;
  onRedeem: () => void;
}) {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const matured = maturity != null && now >= maturity;
  const status = emergencyReleased
    ? "Normal redemption has ended for this tier."
    : maturity == null
      ? "Reading maturity."
      : !matured
        ? `Matures ${fmtDate(maturity)}`
        : distributionFinalized
          ? `${fmtFlr(claimable)} FLR claimable`
          : "Matured. Waiting for the vault to be finalized.";
  const canRedeem =
    matured && distributionFinalized === true && emergencyReleased !== true && claimable != null;

  return (
    <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-[#FAFAFA]">Token #{record.tokenId.toString()}</p>
        <p className="mt-1 text-sm text-[#8FA0B8]">{status}</p>
        {failure && <p className="mt-1 max-w-2xl text-xs text-red-300">{failure}</p>}
      </div>
      {emergencyReleased ? null : canRedeem ? (
        <Button variant="action" size="sm" disabled={disabled || pending} onClick={onRedeem}>
          {pending ? (
            <span className="flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              Redeeming
            </span>
          ) : (
            "Redeem"
          )}
        </Button>
      ) : null}
    </div>
  );
}
