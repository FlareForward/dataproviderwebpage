import networkBaked from "./network.json";

/**
 * Canonical FlareForward property + community links — single source for the
 * nav, footer, and CTAs so a handle change is a one-line edit.
 *
 * Team as of 2026-09-24 (Whale left the team):
 *   Steven @hudspeth589 · Ace @AceThaGreatest · org @flareforward
 * One YouTube channel on the site: Ace's own (AFHD Media). The FlareForward
 * channel and the latest-videos section were removed 2026-09-24.
 */
export const LINKS = {
  site: "https://flareforward.com",
  university: "https://defiuniversitypro.com",
  x: "https://x.com/flareforward",
  youtubeAce: "https://youtube.com/@afhdmedia",
  xSteven: "https://x.com/hudspeth589",
  xAce: "https://x.com/AceThaGreatest",
  /**
   * Apex docs, Fees section — documents the 10 bps split including the 1 bp
   * FLR burn via BurnRouter. Anchor id verified on the live page 2026-08-11.
   */
  apexDocsFees: "https://apexhammer.app/docs#fees-heading",
} as const;

/**
 * The FlareForward network list, shared by every FlareForward site
 * (standard: ~/codex-coord/flareforward-network/STANDARD.md, operator decision
 * 2026-09-26). This is the baked copy; the sidebar refreshes it from
 * NETWORK_URL on load when that answers, so a new project shows up here
 * without a redeploy. url null = announced, not open yet ("Soon").
 */

export type NetworkItem = { id: string; name: string; note: string; url: string | null; soon?: boolean };
export type NetworkList = { version: number; network: NetworkItem[] };
export const NETWORK: NetworkList = networkBaked as NetworkList;
export const NETWORK_URL = "https://flareforward.com/network.json";
/** This site's own entry: shown as the current site, never linked to itself. */
export const NETWORK_HERE = "ftso";
