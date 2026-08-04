import { useState, useRef, useEffect, type ComponentType } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import {
  Wallet,
  LogOut,
  ChevronDown,
  Copy,
  Check,
  X,
  Usb,
  Fingerprint,
  QrCode,
  Loader2,
  Rabbit,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "./Button";
import { shortAddress, EXPLORER_URL } from "../../lib/flare";
import { walletConnectEnabled } from "../../providers/Web3Provider";

interface WalletOption {
  /** Must match the wagmi connector `id`. */
  id: string;
  name: string;
  description: string;
  icon: ComponentType<{ size?: number | string; className?: string }>;
  /** Brand accent used to tint the icon tile. */
  color: string;
  /** WalletConnect-based options are only usable when a project id is set. */
  requiresWalletConnect?: boolean;
}

const WALLET_OPTIONS: WalletOption[] = [
  {
    id: "ledger",
    name: "Ledger",
    description: "Hardware wallet — USB or Ledger Live",
    icon: Usb,
    color: "#D6D9DE",
    requiresWalletConnect: false,
  },
  {
    id: "dcent",
    name: "D'CENT",
    description: "Biometric hardware & mobile wallet",
    icon: Fingerprint,
    color: "#2A7DE1",
  },
  {
    id: "rabby",
    name: "Rabby",
    description: "Browser extension",
    icon: Rabbit,
    color: "#7084FF",
  },
  {
    id: "metaMask",
    name: "MetaMask",
    description: "Browser extension",
    icon: Wallet,
    color: "#F6851B",
  },
  {
    id: "walletConnect",
    name: "WalletConnect",
    description: "Scan with a mobile wallet",
    icon: QrCode,
    color: "#3B99FC",
    requiresWalletConnect: true,
  },
];

export function ConnectWallet({ size = "sm" }: { size?: "sm" | "md" | "lg" }) {
  const { address, isConnected } = useAccount();
  const { connectAsync, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Close the picker on Escape.
  useEffect(() => {
    if (!pickerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPickerOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pickerOpen]);

  async function handleSelect(option: WalletOption) {
    if (option.requiresWalletConnect && !walletConnectEnabled) {
      toast.error(
        "WalletConnect is not configured. Set VITE_WALLETCONNECT_PROJECT_ID to enable it."
      );
      return;
    }

    const connector = connectors.find((c) => c.id === option.id);
    if (!connector) {
      toast.error(`${option.name} is unavailable in this build.`);
      return;
    }

    const isProviderMissing = (err: unknown) => {
      const e = err as { name?: string; message?: string };
      return (
        e?.name === "ProviderNotFoundError" ||
        /provider.*not.*found|not.*installed|dependency.*not found/i.test(e?.message ?? "")
      );
    };

    // Sentinel raised when a WalletConnect session is approved but contains no
    // account on the Flare network (e.g. the mobile wallet connected with a
    // non-Flare account). The wallet shows "connected" but the dapp can't use it.
    const NO_FLARE_ACCOUNT = "no-flare-account";

    // Runs a connect and verifies we actually received a usable account. Throws
    // NO_FLARE_ACCOUNT when the session came back empty.
    const attempt = async (c: (typeof connectors)[number]) => {
      const data = await connectAsync({ connector: c });
      if (!data?.accounts || data.accounts.length === 0) {
        throw new Error(NO_FLARE_ACCOUNT);
      }
    };

    try {
      setPendingId(option.id);
      await attempt(connector);
      setPickerOpen(false);
    } catch (err: unknown) {
      // Rabby normally injects window.rabby / isRabby, but some configurations
      // only announce it via EIP-6963. wagmi discovers those automatically
      // (connector id = the wallet's rdns), so fall back to that connector.
      if (option.id === "rabby" && isProviderMissing(err)) {
        const discovered = connectors.find((c) => c.id === "io.rabby");
        if (discovered) {
          try {
            await attempt(discovered);
            setPickerOpen(false);
            return;
          } catch (rabbyErr: unknown) {
            err = rabbyErr;
          }
        }
      }

      // D'CENT ships as an extension, a mobile app, and a hardware wallet. The
      // injected path above only covers the extension; if it isn't installed,
      // fall back to the D'CENT mobile app over WalletConnect.
      if (option.id === "dcent" && isProviderMissing(err) && walletConnectEnabled) {
        const wc = connectors.find((c) => c.id === "walletConnect");
        if (wc) {
          try {
            await attempt(wc);
            setPickerOpen(false);
            return;
          } catch (wcErr: unknown) {
            err = wcErr;
          }
        }
      }

      const e = err as { name?: string; shortMessage?: string; message?: string };
      const providerMissing = isProviderMissing(err);
      const wcBased = option.id === "walletConnect" || option.id === "dcent";
      const noFlareAccount =
        e?.message === NO_FLARE_ACCOUNT ||
        e?.name === "ConnectorAccountNotFoundError" ||
        /no accounts|account.*not.*found/i.test(e?.message ?? "");

      // WalletConnect is a QR/relay flow, not a browser extension, so it can
      // never be "not detected" — treat any provider-missing error there as a
      // configuration problem instead of telling the user to install something.
      if (providerMissing && option.id === "walletConnect") {
        toast.error(
          "WalletConnect couldn't start. Check your VITE_WALLETCONNECT_PROJECT_ID and reload."
        );
      } else if (wcBased && noFlareAccount) {
        toast.error(
          "Wallet connected, but not on Flare. In your wallet, add/select your Flare (FLR) account, then reconnect.",
          { duration: 8000 }
        );
      } else if (providerMissing) {
        toast.error(
          `${option.name} was not detected. Install it, or use WalletConnect to connect a mobile wallet.`
        );
      } else if (/rejected/i.test(e?.shortMessage ?? e?.message ?? "")) {
        toast.error(`Connection request rejected in ${option.name}.`);
      } else {
        toast.error(e?.shortMessage || e?.message || `Failed to connect ${option.name}.`);
      }
    } finally {
      setPendingId(null);
    }
  }

  if (!isConnected) {
    return (
      <div className="relative" ref={ref}>
        <Button
          variant="primary"
          size={size}
          onClick={() => setPickerOpen((o) => !o)}
          className="gap-2"
          aria-haspopup="menu"
          aria-expanded={pickerOpen}
        >
          <Wallet size={16} />
          Connect Wallet
        </Button>

        {pickerOpen && (
          <div
            role="menu"
            aria-label="Connect a wallet"
            className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-2rem)] glass-surface border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
              <h3 className="text-sm font-semibold text-[#FAFAFA]">Connect a wallet</h3>
              <button
                onClick={() => setPickerOpen(false)}
                className="text-[#8FA0B8] hover:text-[#FAFAFA] transition-colors"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-2 space-y-1.5">
              {WALLET_OPTIONS.map((option) => {
                const Icon = option.icon;
                const disabled =
                  (option.requiresWalletConnect && !walletConnectEnabled) ||
                  (isPending && pendingId !== option.id);
                const loading = pendingId === option.id;
                return (
                  <button
                    key={option.id}
                    onClick={() => handleSelect(option)}
                    disabled={disabled}
                    className="w-full flex items-center gap-3 glass-panel p-2.5 text-left transition-all hover:border-[#EE1A58]/40 hover:bg-white/10 disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-xl shrink-0"
                      style={{
                        backgroundColor: `${option.color}22`,
                        color: option.color,
                      }}
                    >
                      {loading ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <Icon size={18} />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-[#FAFAFA]">
                        {option.name}
                      </span>
                      <span className="block text-xs text-[#8FA0B8] truncate">
                        {option.requiresWalletConnect && !walletConnectEnabled
                          ? "Unavailable — WalletConnect not configured"
                          : option.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="px-4 py-2.5 border-t border-white/8 text-[11px] text-[#8FA0B8]">
              Your keys stay in your wallet. FlareForward never has custody of your funds.
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <Button variant="outline" size={size} className="gap-2" onClick={() => setMenuOpen((o) => !o)}>
        <div className="w-2 h-2 rounded-full bg-emerald-500" />
        {shortAddress(address)}
        <ChevronDown size={14} />
      </Button>
      {menuOpen && (
        <div className="absolute right-0 mt-2 w-56 glass-surface border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
          <button
            className="w-full flex items-center gap-2 px-4 py-3 text-sm text-[#FAFAFA] hover:bg-white/5 transition-colors"
            onClick={() => {
              if (address) navigator.clipboard.writeText(address);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
            {copied ? "Copied!" : "Copy address"}
          </button>
          <a
            href={`${EXPLORER_URL}/address/${address}`}
            target="_blank"
            rel="noreferrer"
            className="block px-4 py-3 text-sm text-[#8FA0B8] hover:bg-white/5 hover:text-[#FAFAFA] transition-colors"
          >
            View on explorer
          </a>
          <button
            className="w-full flex items-center gap-2 px-4 py-3 text-sm text-red-400 hover:bg-white/5 transition-colors border-t border-white/8"
            onClick={() => {
              disconnect();
              setMenuOpen(false);
            }}
          >
            <LogOut size={16} />
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
