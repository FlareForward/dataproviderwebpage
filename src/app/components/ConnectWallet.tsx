import { useState, useRef, useEffect } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { Wallet, LogOut, ChevronDown, Copy, Check } from "lucide-react";
import { Button } from "./Button";
import { shortAddress, EXPLORER_URL } from "../../lib/flare";

export function ConnectWallet({ size = "sm" }: { size?: "sm" | "md" | "lg" }) {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (!isConnected) {
    const injected = connectors.find((c) => c.type === "injected") ?? connectors[0];
    return (
      <Button
        variant="primary"
        size={size}
        disabled={isPending || !injected}
        onClick={() => injected && connect({ connector: injected })}
        className="gap-2"
      >
        <Wallet size={16} />
        {isPending ? "Connecting..." : "Connect Wallet"}
      </Button>
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
        <div className="absolute right-0 mt-2 w-56 bg-[#243552] border border-[#2E3F56] rounded-lg shadow-xl z-50 overflow-hidden">
          <button
            className="w-full flex items-center gap-2 px-4 py-3 text-sm text-[#FAFAFA] hover:bg-[#2E3F56]/50 transition-colors"
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
            className="block px-4 py-3 text-sm text-[#8FA0B8] hover:bg-[#2E3F56]/50 hover:text-[#FAFAFA] transition-colors"
          >
            View on explorer
          </a>
          <button
            className="w-full flex items-center gap-2 px-4 py-3 text-sm text-red-400 hover:bg-[#2E3F56]/50 transition-colors border-t border-[#2E3F56]"
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
