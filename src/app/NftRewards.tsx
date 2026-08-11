import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { Gem } from "lucide-react";

/**
 * NFT bond-series rewards board.
 *
 * Renders per-token unclaimed rewards for FlareForward's bond-series NFT lots,
 * served by the same-origin Worker at /api/nft-rewards (shared hourly cache —
 * one chain read per hour for all visitors). `?preview=0x<distributor>` renders
 * any VeriGuard distributor unlisted, labeled as a preview.
 *
 * Override with VITE_NFT_REWARDS_URL for local dev against a deployed worker.
 */
const NFT_REWARDS_URL = import.meta.env.VITE_NFT_REWARDS_URL ?? "/api/nft-rewards";

interface BoardRow {
  id: number;
  claimable: Record<string, string>;
  total: string;
  has_claimed: boolean;
}

interface BoardJson {
  slug: string;
  name: string;
  preview: boolean;
  distributor: string;
  collection: string;
  supply: number;
  payment_tokens: string[];
  unclaimed_total: string;
  lifetime_per_nft: string;
  rows: BoardRow[];
}

interface ApiPayload {
  generated_at_unix?: number;
  boards?: BoardJson[];
  error?: string;
  detail?: string;
}

function fmt(dec: string): string {
  const [whole, frac] = dec.split(".");
  return `${Number(whole).toLocaleString("en-US")}${frac ? "." + frac : ""}`;
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-panel p-4">
      <p className="text-xs uppercase tracking-wide text-[#8FA0B8]">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function BoardCard({ board }: { board: BoardJson }) {
  const shown = board.rows.slice(0, 100);
  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-xl font-semibold">{board.name}</h2>
        {board.preview && (
          <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[11px] font-medium text-amber-300">
            PREVIEW — not a FlareForward collection
          </span>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <StatTile label="Collection size" value={`${board.supply.toLocaleString("en-US")} NFTs`} />
        <StatTile label="Unclaimed across collection" value={`${fmt(board.unclaimed_total)} FLR`} />
        <StatTile label="Distributed per NFT (lifetime)" value={`${fmt(board.lifetime_per_nft)} FLR`} />
      </div>

      <p className="mt-4 max-w-3xl text-sm leading-relaxed text-[#8FA0B8]">
        Unclaimed rewards travel with the NFT, not the wallet — buying a token on the secondary
        market includes everything it has not yet claimed. Never burn a token: a burned token&apos;s
        share is gone for good.
      </p>

      <div className="glass-panel mt-4 overflow-x-auto p-0">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-[#8FA0B8]">
            <tr className="border-b border-white/8">
              <th className="px-4 py-3">Token ID</th>
              {board.payment_tokens.map((t) => (
                <th key={t} className="px-4 py-3">
                  Unclaimed {t}
                </th>
              ))}
              <th className="px-4 py-3">Ever claimed?</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-b border-white/5 last:border-0">
                <td className="px-4 py-2.5 font-medium">#{r.id}</td>
                {board.payment_tokens.map((t) => (
                  <td key={t} className="px-4 py-2.5 tabular-nums">
                    {fmt(r.claimable[t] ?? "0")}
                  </td>
                ))}
                <td className="px-4 py-2.5 text-[#8FA0B8]">{r.has_claimed ? "yes" : "never"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {board.rows.length > 100 && (
        <p className="mt-2 text-xs text-[#8FA0B8]">
          Showing top 100 of {board.rows.length.toLocaleString("en-US")} tokens by unclaimed balance.
        </p>
      )}
    </section>
  );
}

export default function NftRewards() {
  const [searchParams] = useSearchParams();
  const preview = searchParams.get("preview");
  const url = preview
    ? `${NFT_REWARDS_URL}?preview=${encodeURIComponent(preview)}`
    : NFT_REWARDS_URL;

  const { data, isLoading, error } = useQuery<ApiPayload>({
    queryKey: ["nft-rewards", preview],
    queryFn: async () => {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`nft-rewards ${res.status}`);
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const boards = data?.boards ?? [];
  const updated = data?.generated_at_unix
    ? new Date(data.generated_at_unix * 1000).toUTCString()
    : null;

  return (
    <div className="p-4 lg:p-8">
      <div className="flex items-center gap-3">
        <Gem size={24} className="text-[#E85A95]" />
        <h1 className="text-2xl font-bold tracking-tight">NFT rewards board</h1>
      </div>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#8FA0B8]">
        Live, per-token unclaimed rewards for FlareForward bond-series NFT lots — read straight from
        the distribution contracts on Flare, refreshed hourly. Anyone can verify any token at any
        time.
      </p>
      {updated && (
        <p className="mt-1 text-xs text-[#8FA0B8]/70">Updated {updated} · refreshes hourly</p>
      )}

      {isLoading && (
        <div className="glass-panel mt-8 p-8 text-sm text-[#8FA0B8]">Reading the chain…</div>
      )}

      {error != null && (
        <div className="glass-panel mt-8 border border-red-400/30 p-6 text-sm text-red-300">
          Chain read failed: {error instanceof Error ? error.message : String(error)}. The board
          retries on the next refresh.
        </div>
      )}

      {!isLoading && error == null && boards.length === 0 && (
        <div className="glass-panel mt-8 p-8">
          <p className="text-lg font-semibold">Lot 1 opens soon.</p>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#8FA0B8]">
            When the first bond-series lot closes its mint, its distribution contract goes live here
            — every token&apos;s unclaimed balance, public and verifiable, updated hourly.
          </p>
        </div>
      )}

      {boards.map((b) => (
        <BoardCard key={b.distributor} board={b} />
      ))}
    </div>
  );
}
