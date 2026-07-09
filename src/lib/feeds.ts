/**
 * FTSOv2 feed IDs are 21-byte (bytes21) values: a 1-byte category followed by
 * the UTF-8 ticker (e.g. "BTC/USD"), right-padded with zero bytes.
 *
 * Category 01 = crypto. We decode the on-chain supported-feed list back into
 * human-readable tickers so the UI can display every supported token.
 */

export const FEED_CATEGORY = {
  CRYPTO: "01",
  FOREX: "02",
  COMMODITY: "03",
  STOCK: "04",
} as const;

export interface DecodedFeed {
  feedId: `0x${string}`;
  category: string;
  /** Full ticker, e.g. "BTC/USD". */
  name: string;
  /** Base symbol, e.g. "BTC". */
  symbol: string;
  /** Quote symbol, e.g. "USD". */
  quote: string;
}

/** Encode a feed name (e.g. "FLR/USD") into a bytes21 feed ID. */
export function getFeedId(category: string, name: string): `0x${string}` {
  const hexName = Array.from(name)
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("");
  return `0x${(category + hexName).padEnd(42, "0")}` as `0x${string}`;
}

/** Decode a bytes21 feed ID back into its category and ticker name. */
export function decodeFeedId(feedId: string): DecodedFeed {
  const hex = feedId.startsWith("0x") ? feedId.slice(2) : feedId;
  const category = hex.slice(0, 2);
  const nameHex = hex.slice(2);
  let name = "";
  for (let i = 0; i < nameHex.length; i += 2) {
    const code = parseInt(nameHex.slice(i, i + 2), 16);
    if (code === 0) break;
    name += String.fromCharCode(code);
  }
  const [symbol, quote] = name.split("/");
  return {
    feedId: (feedId.startsWith("0x") ? feedId : `0x${feedId}`) as `0x${string}`,
    category,
    name,
    symbol: symbol ?? name,
    quote: quote ?? "",
  };
}

/** Known crypto feed IDs (verified) used as a fallback if the on-chain list is unavailable. */
export const FALLBACK_CRYPTO_FEEDS: `0x${string}`[] = [
  "FLR/USD",
  "SGB/USD",
  "BTC/USD",
  "XRP/USD",
  "ETH/USD",
  "DOGE/USD",
  "ADA/USD",
  "ALGO/USD",
  "LTC/USD",
  "SOL/USD",
  "USDC/USD",
  "USDT/USD",
  "LINK/USD",
  "MATIC/USD",
  "BNB/USD",
  "AVAX/USD",
  "DOT/USD",
  "ATOM/USD",
].map((n) => getFeedId(FEED_CATEGORY.CRYPTO, n));

const FULL_NAMES: Record<string, string> = {
  FLR: "Flare",
  SGB: "Songbird",
  BTC: "Bitcoin",
  XRP: "XRP",
  ETH: "Ethereum",
  DOGE: "Dogecoin",
  ADA: "Cardano",
  ALGO: "Algorand",
  LTC: "Litecoin",
  SOL: "Solana",
  USDC: "USD Coin",
  USDT: "Tether",
  LINK: "Chainlink",
  MATIC: "Polygon",
  POL: "Polygon",
  BNB: "BNB",
  AVAX: "Avalanche",
  DOT: "Polkadot",
  ATOM: "Cosmos",
  TRX: "TRON",
  XLM: "Stellar",
  UNI: "Uniswap",
  SHIB: "Shiba Inu",
  NEAR: "NEAR Protocol",
  APT: "Aptos",
  ARB: "Arbitrum",
  OP: "Optimism",
  FIL: "Filecoin",
  BCH: "Bitcoin Cash",
  ETC: "Ethereum Classic",
};

export function fullName(symbol: string): string {
  return FULL_NAMES[symbol] ?? symbol;
}

/** Best-effort logo URL by symbol; ImageWithFallback renders a placeholder on error. */
export function logoUrl(symbol: string): string {
  return `https://assets.coincap.io/assets/icons/${symbol.toLowerCase()}@2x.png`;
}
