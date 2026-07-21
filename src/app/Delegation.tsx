import { useState } from "react";
import { formatUnits } from "viem";
import { Shield, Search, CheckCircle2, Wallet, Info, Loader2, XCircle, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./components/Card";
import { Button } from "./components/Button";
import { Badge } from "./components/Badge";
import { ConnectWallet } from "./components/ConnectWallet";
import { ImageWithFallback } from "./components/figma/ImageWithFallback";
import { useProviders, type ProviderRow } from "../hooks/useProviders";
import { useDelegation } from "../hooks/useDelegation";
import { shortAddress } from "../lib/flare";

interface CurrentDelegation {
  address: `0x${string}`;
  bips: number;
}

const MAX_TARGETS = 2;

export function Delegation() {
  const { providers } = useProviders();
  const {
    isConnected,
    flrBalance,
    wflrBalance,
    flrLabel,
    wflrLabel,
    currentDelegations,
    busy,
    wrap,
    delegate,
    undelegate,
  } = useDelegation();

  const [selected, setSelected] = useState<`0x${string}`[]>([]);
  // Percentage of vote power assigned to the FIRST selected provider when two
  // are chosen. The second provider receives the remainder (100 - split).
  const [split, setSplit] = useState(50);
  const [wrapAmount, setWrapAmount] = useState("");
  const [query, setQuery] = useState("");
  const [confirming, setConfirming] = useState(false);

  const selectedProviders = selected
    .map((addr) => providers.find((p) => p.address === addr))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const q = query.trim().toLowerCase();
  const filtered = providers.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.address.toLowerCase().includes(q) ||
      p.identityAddress.toLowerCase().includes(q)
  );

  const hasVotePower = wflrBalance > 0n;
  const isTwo = selectedProviders.length === 2;

  function shareFor(index: number) {
    if (selectedProviders.length < 2) return 100;
    return index === 0 ? split : 100 - split;
  }

  function toggleProvider(addr: `0x${string}`) {
    setConfirming(false);
    setSelected((prev) => {
      if (prev.includes(addr)) return prev.filter((a) => a !== addr);
      if (prev.length >= MAX_TARGETS) return prev;
      const next = [...prev, addr];
      if (next.length === 2) setSplit(50);
      return next;
    });
  }

  async function handleWrap() {
    try {
      await wrap(wrapAmount);
      setWrapAmount("");
    } catch {
      /* toast already shown */
    }
  }

  async function handleConfirmDelegate() {
    if (selectedProviders.length === 0) return;
    try {
      await delegate(
        selectedProviders.map((p, i) => ({ address: p.address, sharePct: shareFor(i) }))
      );
      setConfirming(false);
    } catch {
      /* toast already shown */
    }
  }

  return (
    <div className="space-y-6">
      {/* Your delegations — a prominent summary of who your WFLR vote power is
          currently delegated to, mirroring the "Your Stakes" card. */}
      {isConnected && currentDelegations.length > 0 && (
        <YourDelegations
          delegations={currentDelegations}
          providers={providers}
          busy={busy}
          onUndelegate={undelegate}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Provider Selection List */}
        <Card className="col-span-1 lg:col-span-2">
          <CardHeader className="border-b border-white/8 pb-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <CardTitle className="text-[#FAFAFA]">Available Providers</CardTitle>
                <CardDescription className="text-[#8FA0B8]">
                  Choose up to {MAX_TARGETS} providers to split your vote power
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 glass-panel px-3 py-1.5 focus-within:border-[#EE1A58]/60 transition-colors w-full sm:w-auto">
                <Search size={16} className="text-[#8FA0B8]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  type="text"
                  placeholder="Search providers..."
                  className="bg-transparent border-none outline-none text-sm w-full placeholder:text-[#8FA0B8] text-[#FAFAFA]"
                />
              </div>
            </div>
            <div className="text-xs text-[#8FA0B8] mt-3">
              {selected.length}/{MAX_TARGETS} selected
            </div>
          </CardHeader>
          <div className="divide-y divide-white/8 max-h-[560px] overflow-y-auto">
            {providers.length === 0 && (
              <div className="p-8 text-center text-[#8FA0B8] text-sm">Loading providers...</div>
            )}
            {filtered.map((provider) => {
              const selIndex = selected.indexOf(provider.address);
              const isSel = selIndex !== -1;
              const atLimit = selected.length >= MAX_TARGETS && !isSel;
              const isCurrent = currentDelegations.some(
                (d) => d.address.toLowerCase() === provider.address.toLowerCase()
              );
              return (
                <div
                  key={provider.address}
                  onClick={() => !atLimit && toggleProvider(provider.address)}
                  className={`p-4 flex items-center justify-between transition-colors ${
                    atLimit
                      ? "opacity-40 cursor-not-allowed"
                      : "cursor-pointer hover:bg-white/5"
                  } ${isSel ? "bg-[#EE1A58]/15" : ""}`}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center border overflow-hidden shrink-0 ${
                        isSel ? "border-[#EE1A58]" : "border-white/10"
                      } bg-white/5`}
                    >
                      {provider.logoURI ? (
                        <ImageWithFallback src={provider.logoURI} alt={provider.name} className="w-10 h-10 object-cover" />
                      ) : (
                        <Shield size={18} className="text-[#8FA0B8]" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-[#FAFAFA] flex items-center gap-2">
                        <span className="truncate">{provider.name}</span>
                        {isSel && (
                          <span className="flex items-center gap-1 text-[#EE1A58] shrink-0">
                            <CheckCircle2 size={14} />
                            <span className="text-xs font-semibold">{shareFor(selIndex)}%</span>
                          </span>
                        )}
                        {isCurrent && (
                          <Badge variant="success" className="ml-1">
                            Delegated
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-[#8FA0B8] flex items-center gap-3 mt-1">
                        <span>VP: {provider.votePowerLabel}</span>
                        <span className="w-1 h-1 rounded-full bg-white/20" />
                        <span className="font-mono">{shortAddress(provider.address)}</span>
                      </div>
                    </div>
                  </div>
                  <Badge
                    variant={provider.status === "Active" ? "success" : provider.status === "Warning" ? "outline" : "dark"}
                    className={provider.status === "Warning" ? "border-yellow-500/50 text-yellow-500" : ""}
                  >
                    {provider.status}
                  </Badge>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Delegation Action Panel */}
        <div className="col-span-1">
          <Card className="sticky top-24">
            <CardHeader className="border-b border-white/8 pb-4">
              <CardTitle className="text-[#FAFAFA]">Delegate Vote Power</CardTitle>
              <CardDescription className="text-[#8FA0B8]">Delegate WFLR to earn FTSO rewards</CardDescription>
            </CardHeader>
            <CardContent className="p-5 space-y-6">
              {!isConnected ? (
                <div className="text-center py-8 text-[#8FA0B8] flex flex-col items-center gap-4">
                  <Wallet size={32} className="opacity-20" />
                  <p className="text-sm">Connect your wallet to delegate on Flare Mainnet.</p>
                  <ConnectWallet size="md" />
                </div>
              ) : selectedProviders.length === 0 ? (
                <div className="text-center py-8 text-[#8FA0B8] flex flex-col items-center">
                  <Shield size={32} className="mb-3 opacity-20" />
                  <p className="text-sm">Select one or two data providers from the list to continue.</p>
                </div>
              ) : (
                <>
                  {/* Balances */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="glass-panel p-3">
                      <div className="text-xs text-[#8FA0B8] mb-1">FLR Balance</div>
                      <div className="font-medium text-[#FAFAFA] text-sm">{flrLabel}</div>
                    </div>
                    <div className="glass-panel p-3">
                      <div className="text-xs text-[#8FA0B8] mb-1">WFLR (Vote Power)</div>
                      <div className="font-medium text-[#FAFAFA] text-sm">{wflrLabel}</div>
                    </div>
                  </div>

                  {/* Selected providers */}
                  <div className="space-y-3">
                    <div className="text-xs text-[#8FA0B8]">
                      Selected {selectedProviders.length === 1 ? "provider" : "providers"}
                    </div>
                    {selectedProviders.map((p, i) => (
                      <div
                        key={p.address}
                        className="glass-panel p-3 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-[#FAFAFA] truncate">{p.name}</div>
                          <div className="text-xs text-[#8FA0B8] font-mono mt-0.5">{shortAddress(p.address)}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[#EE1A58] font-semibold text-sm">{shareFor(i)}%</span>
                          <button
                            onClick={() => toggleProvider(p.address)}
                            className="text-[#8FA0B8] hover:text-red-400 transition-colors"
                            aria-label={`Remove ${p.name}`}
                          >
                            <XCircle size={16} />
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* Split slider (only when two providers are selected) */}
                    {isTwo && (
                      <div className="glass-panel p-3 space-y-2">
                        <div className="flex justify-between text-xs text-[#8FA0B8]">
                          <span className="truncate max-w-[45%]">{selectedProviders[0].name}</span>
                          <span className="truncate max-w-[45%] text-right">{selectedProviders[1].name}</span>
                        </div>
                        <input
                          type="range"
                          min={1}
                          max={99}
                          step={1}
                          value={split}
                          onChange={(e) => setSplit(Number(e.target.value))}
                          className="w-full accent-[#EE1A58] cursor-pointer"
                        />
                        <div className="flex justify-between text-xs font-semibold text-[#FAFAFA]">
                          <span>{split}%</span>
                          <span>{100 - split}%</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Wrap step */}
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-[#8FA0B8]">Wrap FLR to WFLR (optional)</span>
                      <button
                        onClick={() => setWrapAmount(formatUnits(flrBalance, 18))}
                        className="text-xs text-[#EE1A58] hover:underline"
                      >
                        MAX
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        value={wrapAmount}
                        onChange={(e) => setWrapAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full glass-panel py-3 px-4 text-[#FAFAFA] text-lg focus:outline-none focus:border-[#EE1A58]/60 transition-colors pr-16"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8FA0B8] font-medium">FLR</span>
                    </div>
                    <Button
                      variant="secondary"
                      className="w-full"
                      disabled={busy !== null || !wrapAmount || Number(wrapAmount) <= 0}
                      onClick={handleWrap}
                    >
                      {busy === "wrap" ? <Loader2 className="animate-spin" size={16} /> : "Wrap FLR"}
                    </Button>
                  </div>

                  <div className="bg-[#EE1A58]/10 border border-[#EE1A58]/20 rounded-lg p-3 flex gap-3 text-sm">
                    <Info size={16} className="text-[#EE1A58] shrink-0 mt-0.5" />
                    <div className="text-[#FAFAFA]">
                      {isTwo ? (
                        <>
                          Your <span className="font-semibold">{wflrLabel} WFLR</span> vote power is split{" "}
                          <span className="font-semibold">
                            {split}% / {100 - split}%
                          </span>{" "}
                          across the two providers. Your tokens never leave your wallet.
                        </>
                      ) : (
                        <>
                          Delegation assigns 100% of your <span className="font-semibold">{wflrLabel} WFLR</span> vote power to
                          this provider. Your tokens never leave your wallet.
                        </>
                      )}
                    </div>
                  </div>

                  {/* Confirm delegation (human-in-the-loop) */}
                  {!confirming ? (
                    <Button
                      variant="primary"
                      className="w-full py-6 text-base font-semibold"
                      disabled={busy !== null || !hasVotePower}
                      onClick={() => setConfirming(true)}
                    >
                      {hasVotePower ? "Delegate Vote Power" : "Wrap FLR first to get vote power"}
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-[#FAFAFA] text-center">
                        {isTwo ? (
                          <>
                            Delegate your {wflrLabel} WFLR{" "}
                            <span className="font-semibold">{split}%</span> to {selectedProviders[0].name} and{" "}
                            <span className="font-semibold">{100 - split}%</span> to {selectedProviders[1].name}?
                          </>
                        ) : (
                          <>
                            Delegate 100% of your {wflrLabel} WFLR to{" "}
                            <span className="font-semibold">{selectedProviders[0].name}</span>?
                          </>
                        )}
                      </p>
                      <div className="flex gap-2">
                        <Button variant="outline" className="flex-1" disabled={busy !== null} onClick={() => setConfirming(false)}>
                          Cancel
                        </Button>
                        <Button variant="primary" className="flex-1" disabled={busy !== null} onClick={handleConfirmDelegate}>
                          {busy === "delegate" ? <Loader2 className="animate-spin" size={16} /> : "Confirm"}
                        </Button>
                      </div>
                    </div>
                  )}

                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function YourDelegations({
  delegations,
  providers,
  busy,
  onUndelegate,
}: {
  delegations: CurrentDelegation[];
  providers: ProviderRow[];
  busy: null | "wrap" | "delegate" | "undelegate";
  onUndelegate: () => void;
}) {
  const totalPct = delegations.reduce((sum, d) => sum + d.bips, 0) / 100;

  return (
    <Card>
      <CardHeader className="border-b border-white/8 pb-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-[#EE1A58]" />
            <CardTitle className="text-[#FAFAFA]">Your Delegations</CardTitle>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xs text-[#8FA0B8]">Vote power delegated</div>
              <div className="text-sm font-semibold text-[#FAFAFA]">{totalPct.toFixed(0)}%</div>
            </div>
            <Button
              variant="ghost"
              className="text-red-400 hover:bg-red-500/10 gap-2"
              disabled={busy !== null}
              onClick={onUndelegate}
            >
              {busy === "undelegate" ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <>
                  <XCircle size={16} /> Undelegate all
                </>
              )}
            </Button>
          </div>
        </div>
        <CardDescription className="text-[#8FA0B8]">
          Providers your WFLR vote power is currently delegated to
        </CardDescription>
      </CardHeader>
      <div className="divide-y divide-white/8">
        {delegations.map((d) => {
          const provider = providers.find(
            (p) => p.address.toLowerCase() === d.address.toLowerCase()
          );
          return (
            <div
              key={d.address}
              className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-10 h-10 rounded-full flex items-center justify-center border border-white/10 bg-white/5 overflow-hidden shrink-0">
                  {provider?.logoURI ? (
                    <ImageWithFallback
                      src={provider.logoURI}
                      alt={provider.name}
                      className="w-10 h-10 object-cover"
                    />
                  ) : (
                    <Shield size={18} className="text-[#8FA0B8]" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-[#FAFAFA] truncate">
                    {provider?.name ?? "Unknown provider"}
                  </div>
                  <div className="text-xs text-[#8FA0B8] font-mono mt-0.5">
                    {shortAddress(d.address)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 sm:justify-end pl-14 sm:pl-0">
                <div className="text-right">
                  <div className="text-sm font-semibold text-[#EE1A58]">
                    {(d.bips / 100).toFixed(0)}%
                  </div>
                  {provider && (
                    <div className="text-xs text-[#8FA0B8]">VP: {provider.votePowerLabel}</div>
                  )}
                </div>
                <Badge variant="success">Delegated</Badge>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
