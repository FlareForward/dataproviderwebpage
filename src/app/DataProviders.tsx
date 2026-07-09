import { useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { Search, Shield, ExternalLink } from "lucide-react";
import { useLocation } from "react-router";
import { Delegation } from "./Delegation";
import { Badge } from "./components/Badge";
import { ImageWithFallback } from "./components/figma/ImageWithFallback";
import { useProviders } from "../hooks/useProviders";
import { shortAddress, EXPLORER_URL } from "../lib/flare";

export function DataProviders() {
  const location = useLocation();
  const defaultTab = location.pathname.includes("delegation") ? "delegation" : "all";

  return (
    <div className="p-4 lg:p-8 flex-1 flex flex-col h-full overflow-hidden">
      <div className="max-w-7xl mx-auto w-full space-y-6 flex-1 flex flex-col">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Data Providers</h1>
          <p className="text-[#8FA0B8] text-sm mt-1">
            View registered FTSO data providers and delegate your vote power.
          </p>
        </div>

        <Tabs.Root defaultValue={defaultTab} className="flex-1 flex flex-col">
          <Tabs.List className="flex border-b border-[#2E3F56] mb-6">
            <Tabs.Trigger
              value="all"
              className="px-6 py-3 text-sm font-medium text-[#8FA0B8] hover:text-[#FAFAFA] border-b-2 border-transparent data-[state=active]:border-[#EE1A58] data-[state=active]:text-[#EE1A58] transition-colors"
            >
              All Providers
            </Tabs.Trigger>
            <Tabs.Trigger
              value="delegation"
              className="px-6 py-3 text-sm font-medium text-[#8FA0B8] hover:text-[#FAFAFA] border-b-2 border-transparent data-[state=active]:border-[#EE1A58] data-[state=active]:text-[#EE1A58] transition-colors"
            >
              Delegation
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="all" className="flex-1 outline-none">
            <AllProviders />
          </Tabs.Content>

          <Tabs.Content value="delegation" className="flex-1 outline-none">
            <Delegation />
          </Tabs.Content>
        </Tabs.Root>
      </div>
    </div>
  );
}

function AllProviders() {
  const { providers, isLoading, error } = useProviders();
  const [q, setQ] = useState("");

  const filtered = providers.filter(
    (p) =>
      p.name.toLowerCase().includes(q.toLowerCase()) ||
      p.address.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 bg-[#243552] border border-[#2E3F56] rounded-md px-3 py-2 focus-within:border-[#EE1A58] transition-colors max-w-md">
        <Search size={16} className="text-[#8FA0B8]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          type="text"
          placeholder="Search providers by name or address..."
          className="bg-transparent border-none outline-none text-sm w-full placeholder:text-[#8FA0B8] text-[#FAFAFA]"
        />
      </div>

      {error && (
        <div className="bg-[#243552] border border-red-500/30 rounded-xl p-6 text-center text-red-400">
          Failed to load providers: {error.message}
        </div>
      )}

      {isLoading && providers.length === 0 && (
        <div className="bg-[#243552] border border-[#2E3F56] rounded-xl p-8 text-center text-[#8FA0B8]">
          Loading data providers...
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((p) => (
          <div
            key={p.address}
            className="bg-[#243552] border border-[#2E3F56] rounded-xl p-5 flex flex-col gap-3 hover:border-[#EE1A58]/40 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-[#1D2430] border border-[#2E3F56] flex items-center justify-center overflow-hidden shrink-0">
                  {p.logoURI ? (
                    <ImageWithFallback src={p.logoURI} alt={p.name} className="w-10 h-10 object-cover" />
                  ) : (
                    <Shield size={18} className="text-[#8FA0B8]" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-[#FAFAFA] truncate">{p.name}</div>
                  <div className="text-xs text-[#8FA0B8] font-mono">{shortAddress(p.address)}</div>
                </div>
              </div>
              <Badge
                variant={p.status === "Active" ? "success" : p.status === "Warning" ? "outline" : "dark"}
                className={p.status === "Warning" ? "border-yellow-500/50 text-yellow-500" : ""}
              >
                {p.status}
              </Badge>
            </div>

            {p.description && (
              <p className="text-xs text-[#8FA0B8] line-clamp-3">{p.description}</p>
            )}

            <div className="flex items-center justify-between mt-auto pt-3 border-t border-[#2E3F56]/60 text-sm">
              <div>
                <div className="text-[#8FA0B8] text-xs">Vote Power</div>
                <div className="text-[#FAFAFA] font-medium">{p.votePowerLabel}</div>
              </div>
              <div className="text-right">
                <div className="text-[#8FA0B8] text-xs">Delegation</div>
                <div className="text-[#FAFAFA] font-medium">
                  {p.delegationPct !== null ? `${p.delegationPct.toFixed(2)}%` : "-"}
                </div>
              </div>
            </div>

            {p.url && (
              <a
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-[#EE1A58] hover:underline flex items-center gap-1"
              >
                <ExternalLink size={12} />
                Website
              </a>
            )}
            <a
              href={`${EXPLORER_URL}/address/${p.address}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-[#8FA0B8] hover:text-[#FAFAFA] flex items-center gap-1"
            >
              <ExternalLink size={12} />
              View on explorer
            </a>
          </div>
        ))}
      </div>

      {!isLoading && filtered.length === 0 && providers.length > 0 && (
        <div className="text-center text-[#8FA0B8] py-8">No providers match "{q}".</div>
      )}
    </div>
  );
}
