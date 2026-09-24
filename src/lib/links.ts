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
 * Everything else FlareForward runs, in the order the flareforward.com network
 * map shows it. Listed in the sidebar and the phone menu so visitors can jump
 * between our projects. href null = announced, not open yet ("Soon").
 * Keep in step with NODES in the flareforward-site repo (lib/content.ts).
 */
export const NETWORK: { name: string; href: string | null }[] = [
  { name: "flareforward.com", href: "https://flareforward.com" },
  { name: "Apex", href: "https://apexhammer.app" },
  { name: "Orca Pay", href: null },
  { name: "DeFi Tracker", href: null },
  { name: "The Reef", href: "https://reef-app-production.up.railway.app" },
  { name: "Arcade", href: "https://arcade.flareforward.com" },
  { name: "DeFi Education", href: null },
  { name: "YouTube: Ace", href: "https://youtube.com/@afhdmedia" },
];
