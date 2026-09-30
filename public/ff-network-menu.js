/*! ff-network-menu v1.2.1 | list v5 | sha256:40b80e40d9fdfd8387e46cdd502b575620297db1f413bf1d34fe0dfdaaef1fa3 | copied in, do not edit; source https://github.com/FlareForward/flareforward-network-menu */
(() => {
  "use strict";

  const MENU_VERSION = "1.2.1";
  const BAKED_LIST = {
  "version": 5,
  "updated": "2026-09-28",
  "labels": {
    "networkGroup": "FlareForward network",
    "supportGroup": "Support us",
    "headerButton": "Delegate to our FTSO",
    "soonBadge": "Soon"
  },
  "support": [
    {
      "name": "Delegate your FLR",
      "note": "Your FLR stays in your wallet",
      "url": "https://ftso.flareforward.com/delegation"
    },
    {
      "name": "Stake with us",
      "note": "On Flare's P-chain",
      "url": "https://ftso.flareforward.com/staking"
    }
  ],
  "network": [
    {
      "id": "home",
      "name": "flareforward.com",
      "note": "Who we are",
      "url": "https://flareforward.com"
    },
    {
      "id": "ftso",
      "name": "FTSO",
      "note": "Delegate and stake with us",
      "url": "https://ftso.flareforward.com"
    },
    {
      "id": "apex",
      "name": "Apex",
      "note": "Non-custodial trading",
      "url": "https://apexhammer.app"
    },
    {
      "id": "orca",
      "name": "Orca Pay",
      "note": "Payments, live on Coston2 testnet",
      "url": "https://c2-web-coston2.up.railway.app"
    },
    {
      "id": "tracker",
      "name": "DeFi Tracker",
      "note": "Free",
      "url": null,
      "soon": true
    },
    {
      "id": "reef",
      "name": "The Reef",
      "note": "Science on Flare",
      "url": "https://reef-app-production.up.railway.app"
    },
    {
      "id": "arcade",
      "name": "Arcade",
      "note": "Games on Flare",
      "url": "https://arcade.flareforward.com"
    },
    {
      "id": "ai",
      "name": "FlareForward AI",
      "note": "Watch AI build, live",
      "url": "https://ai.flareforward.com"
    },
    {
      "id": "education",
      "name": "DeFi Education",
      "note": "Free",
      "url": "https://defi.flareforward.com"
    }
  ]
};
  const LIVE_URL = "https://flareforward.com/network.json";
  const TAG_NAME = "ff-network-menu";
  const HERE_TEXT = "You are here";
  const DEFAULT_SITE_LABEL = "This site";
  const DATA = {
    current: BAKED_LIST,
    liveStarted: false,
    liveDone: false,
    instances: new Set()
  };

  if (
    typeof window === "undefined" ||
    !window.customElements ||
    !window.HTMLElement ||
    !window.document
  ) {
    return;
  }

  if (window.customElements.get(TAG_NAME)) {
    return;
  }

  const win = window;
  const doc = win.document;
  const canUseSheets =
    "adoptedStyleSheets" in doc &&
    "CSSStyleSheet" in win &&
    "replaceSync" in win.CSSStyleSheet.prototype;
  const canUsePopover =
    "showPopover" in win.HTMLElement.prototype &&
    "hidePopover" in win.HTMLElement.prototype;

  const cssText = `
:host {
  --ffn-bg: #0f1424;
  --ffn-fg: #f5f7fb;
  --ffn-accent: #e62058;
  --ffn-muted: color-mix(in srgb, var(--ffn-fg) 60%, transparent);
  --ffn-border: color-mix(in srgb, var(--ffn-fg) 14%, transparent);
  --ffn-radius: 14px;
  --ffn-button-size: 44px;
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
  font: inherit;
  color: inherit;
}

button {
  inline-size: max(44px, var(--ffn-button-size));
  block-size: max(44px, var(--ffn-button-size));
  display: inline-grid;
  place-items: center;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 8px;
  color: inherit;
  background: transparent;
  font: inherit;
  cursor: pointer;
}

button:hover,
button[aria-expanded="true"] {
  background: color-mix(in srgb, currentColor 10%, transparent);
}

button:focus-visible,
a:focus-visible {
  outline: 3px solid var(--ffn-accent);
  outline-offset: 3px;
}

svg {
  inline-size: 24px;
  block-size: 24px;
  display: block;
}

.panel {
  inset: auto;
  margin: 0;
  position: fixed;
  z-index: 2147483647;
  box-sizing: border-box;
  padding: 8px;
  overflow: auto;
  color: var(--ffn-fg);
  background: var(--ffn-bg);
  border: 1px solid var(--ffn-border);
  border-radius: var(--ffn-radius);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
  font: inherit;
  opacity: 1;
  transform: translateY(0);
}

.panel[data-fallback="true"]:not([data-open="true"]) {
  display: none;
}

@media (prefers-reduced-motion: no-preference) {
  .panel {
    transition: opacity 120ms ease, transform 120ms ease;
  }
}

section + section {
  margin-block-start: 6px;
  padding-block-start: 6px;
  border-block-start: 1px solid var(--ffn-border);
}

section[hidden] {
  display: none;
}

/* No divider above the first group that actually shows. */
section[hidden] + section {
  margin-block-start: 0;
  padding-block-start: 0;
  border-block-start: 0;
}

h2 {
  margin: 0 0 2px;
  padding: 0 6px;
  color: var(--ffn-muted);
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1.4;
  text-transform: uppercase;
  letter-spacing: 0;
}

.site-links {
  display: grid;
  gap: 2px;
}

.row {
  box-sizing: border-box;
  min-block-size: 44px;
  display: grid;
  align-content: center;
  gap: 1px;
  padding: 5px 10px;
  border-radius: 8px;
  color: inherit;
  text-decoration: none;
}

::slotted(a) {
  box-sizing: border-box !important;
  min-block-size: 44px !important;
  /* display stays normal priority so a site can hide a slotted link with its own CSS (responsive nav). */
  display: grid;
  align-content: center !important;
  gap: 1px !important;
  padding: 5px 10px !important;
  border-radius: 8px !important;
  color: inherit !important;
  text-decoration: none !important;
}

a.row {
  cursor: pointer;
}

::slotted(a) {
  cursor: pointer !important;
}

a.row:hover {
  background: color-mix(in srgb, var(--ffn-fg) 8%, transparent);
}

::slotted(a:hover) {
  background: color-mix(in srgb, var(--ffn-fg) 8%, transparent) !important;
}

.name-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-inline-size: 0;
}

.name,
.note {
  overflow-wrap: anywhere;
}

.name {
  font-weight: 700;
  line-height: 1.2;
}

.note {
  color: var(--ffn-muted);
  font-size: 0.86rem;
  line-height: 1.25;
}

.badge {
  flex: 0 0 auto;
  padding: 2px 7px;
  border-radius: 999px;
  color: #ffffff;
  background: var(--ffn-accent);
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1.4;
  white-space: nowrap;
}
`;

  const baseSheet = canUseSheets ? new win.CSSStyleSheet() : null;
  if (baseSheet) {
    baseSheet.replaceSync(cssText);
  }

  function text(value) {
    return typeof value === "string" ? value : "";
  }

  function boundedString(value, max, allowEmpty) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!allowEmpty && trimmed.length === 0) return null;
    if (trimmed.length > max) return null;
    return trimmed;
  }

  function bakedHosts() {
    const hosts = new Set(["flareforward.com"]);
    for (const group of ["network", "support"]) {
      for (const item of BAKED_LIST[group] || []) {
        if (typeof item.url !== "string") continue;
        try {
          hosts.add(new URL(item.url).hostname);
        } catch {
          continue;
        }
      }
    }
    return hosts;
  }

  const allowedHosts = bakedHosts();

  function safeUrl(value) {
    if (value === null) return null;
    if (typeof value !== "string") return undefined;
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      return undefined;
    }
    if (parsed.protocol !== "https:") return undefined;
    if (parsed.username || parsed.password) return undefined;
    const host = parsed.hostname;
    if (
      host === "flareforward.com" ||
      host.endsWith(".flareforward.com") ||
      allowedHosts.has(host)
    ) {
      return parsed.href;
    }
    return undefined;
  }

  function validateEntry(entry, kind, seen) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const name = boundedString(entry.name, 40, false);
    if (!name) return null;
    const note = entry.note === undefined ? "" : boundedString(entry.note, 60, true);
    if (note === null) return null;
    if (!Object.prototype.hasOwnProperty.call(entry, "url")) return null;
    const url = safeUrl(entry.url);
    if (url === undefined) return null;
    const clean = { name, note, url };
    if (kind === "network") {
      const id = boundedString(entry.id, 24, false);
      if (!id || !/^[a-z0-9-]{1,24}$/.test(id) || seen.has(id)) return null;
      seen.add(id);
      clean.id = id;
      if (entry.soon === true) clean.soon = true;
    }
    return clean;
  }

  function validateLiveList(candidate) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    if (!Number.isFinite(candidate.version)) return null;
    if (!Array.isArray(candidate.network) || candidate.network.length < 1 || candidate.network.length > 24) {
      return null;
    }
    if (!Array.isArray(candidate.support) || candidate.support.length > 6) {
      return null;
    }

    const labels = Object.assign({}, BAKED_LIST.labels);
    if (candidate.labels && typeof candidate.labels === "object" && !Array.isArray(candidate.labels)) {
      for (const key of Object.keys(labels)) {
        const value = candidate.labels[key];
        if (typeof value === "string" && value.length <= 40) {
          labels[key] = value;
        }
      }
    }

    const seen = new Set();
    const network = [];
    for (const entry of candidate.network) {
      const clean = validateEntry(entry, "network", seen);
      if (clean) network.push(clean);
    }
    if (network.length === 0) return null;

    const support = [];
    for (const entry of candidate.support) {
      const clean = validateEntry(entry, "support", seen);
      if (clean && clean.url) support.push(clean);
    }

    return { version: candidate.version, labels, network, support };
  }

  function ensureLiveRefresh() {
    if (DATA.liveStarted) return;
    DATA.liveStarted = true;

    const controller = new win.AbortController();
    const timer = win.setTimeout(() => controller.abort(), 2500);
    win.fetch(LIVE_URL, { cache: "no-cache", signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("fetch failed");
        return response.json();
      })
      .then((json) => {
        const list = validateLiveList(json);
        if (!list || list.version < BAKED_LIST.version) return;
        DATA.current = list;
        DATA.liveDone = true;
        for (const instance of DATA.instances) {
          if (instance.getAttribute("live") !== "off") instance.render();
        }
      })
      .catch(() => {})
      .finally(() => {
        win.clearTimeout(timer);
      });
  }

  function appendText(parent, className, value) {
    const element = doc.createElement("span");
    element.className = className;
    element.textContent = value;
    parent.append(element);
    return element;
  }

  function makeIcon() {
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    for (const y of ["6", "12", "18"]) {
      const line = doc.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", "4");
      line.setAttribute("x2", "20");
      line.setAttribute("y1", y);
      line.setAttribute("y2", y);
      line.setAttribute("stroke", "currentColor");
      line.setAttribute("stroke-width", "2");
      line.setAttribute("stroke-linecap", "round");
      svg.append(line);
    }
    return svg;
  }

  class FlareForwardNetworkMenu extends win.HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this.panelId = `ffn-panel-${Math.random().toString(36).slice(2)}`;
      this.opened = false;
      this.positionSheet = canUseSheets ? new win.CSSStyleSheet() : null;
      this.onDocumentPointerDown = this.onDocumentPointerDown.bind(this);
      this.onDocumentKeyDown = this.onDocumentKeyDown.bind(this);
      this.onResize = this.onResize.bind(this);
      this.onScroll = this.onScroll.bind(this);
      this.render = this.render.bind(this);

      const buttonLabel = "FlareForward network menu";
      this.button = doc.createElement("button");
      this.button.type = "button";
      this.button.setAttribute("aria-label", buttonLabel);
      this.button.setAttribute("aria-haspopup", "true");
      this.button.setAttribute("aria-expanded", "false");
      this.button.setAttribute("aria-controls", this.panelId);
      this.button.append(makeIcon());
      this.button.addEventListener("click", () => {
        if (this.opened) this.closePanel(true);
        else this.openPanel();
      });

      this.panel = doc.createElement("nav");
      this.panel.id = this.panelId;
      this.panel.className = "panel";
      this.panel.setAttribute("aria-label", buttonLabel);
      if (canUsePopover) {
        this.panel.setAttribute("popover", "manual");
      } else {
        this.panel.dataset.fallback = "true";
      }
      this.panel.addEventListener("click", (event) => {
        const path = typeof event.composedPath === "function" ? event.composedPath() : [];
        const link =
          path.find((node) => node instanceof win.HTMLAnchorElement) ||
          (event.target.closest ? event.target.closest("a") : null);
        if (link) {
          this.dispatchNavigateEvent(link, path);
          this.closePanel(false);
        }
      });

      if (canUseSheets) {
        this.shadowRoot.adoptedStyleSheets = [baseSheet, this.positionSheet];
      } else {
        const style = doc.createElement("style");
        style.textContent = cssText;
        this.shadowRoot.append(style);
      }
      this.shadowRoot.append(this.button, this.panel);
    }

    connectedCallback() {
      DATA.instances.add(this);
      this.render();
      if (this.getAttribute("live") !== "off") ensureLiveRefresh();
    }

    disconnectedCallback() {
      DATA.instances.delete(this);
      this.closePanel(false);
    }

    attributeChangedCallback() {
      if (this.isConnected) this.render();
    }

    static get observedAttributes() {
      return ["site", "site-label", "live"];
    }

    dataForInstance() {
      return this.getAttribute("live") === "off" ? BAKED_LIST : DATA.current;
    }

    dispatchNavigateEvent(link, path) {
      const section = path.find((node) => node instanceof win.HTMLElement && node.dataset?.group);
      const group = section?.dataset.group;
      if (group !== "site" && group !== "network" && group !== "support") return;
      this.dispatchEvent(
        new win.CustomEvent("ff-network-menu:navigate", {
          bubbles: true,
          composed: true,
          cancelable: false,
          detail: {
            group,
            id: group === "network" ? link.dataset.networkId || null : null,
            href: link.href
          }
        })
      );
    }

    updateSlotGroup(section, slot) {
      const visible = slot
        .assignedElements({ flatten: true })
        .filter((node) => node.nodeType === 1 && win.getComputedStyle(node).display !== "none");
      section.hidden = visible.length === 0;
    }

    updateSlotGroups() {
      if (this.siteSection && this.siteSlot) this.updateSlotGroup(this.siteSection, this.siteSlot);
    }

    render() {
      const data = this.dataForInstance();
      const labels = data.labels || BAKED_LIST.labels;
      const currentSite = this.getAttribute("site") || "";
      const focused = this.shadowRoot.activeElement;
      const focusedHref = focused && focused.href ? focused.href : "";
      const focusedNetworkId = focused && focused.dataset ? focused.dataset.networkId || "" : "";
      this.panel.replaceChildren();

      const siteSection = doc.createElement("section");
      siteSection.dataset.group = "site";
      const siteHeading = doc.createElement("h2");
      siteHeading.textContent = text(this.getAttribute("site-label")) || DEFAULT_SITE_LABEL;
      const siteLinks = doc.createElement("div");
      siteLinks.className = "site-links";
      const slot = doc.createElement("slot");
      slot.name = "site";
      slot.addEventListener("slotchange", () => this.updateSlotGroup(siteSection, slot));
      siteLinks.append(slot);
      siteSection.append(siteHeading, siteLinks);
      this.panel.append(siteSection);
      this.siteSection = siteSection;
      this.siteSlot = slot;

      const networkSection = this.makeGroup(labels.networkGroup, "network");
      for (const item of data.network) {
        networkSection.append(this.makeRow(item, "network", currentSite, labels));
      }
      this.panel.append(networkSection);

      const supportSection = this.makeGroup(labels.supportGroup, "support");
      for (const item of data.support) {
        supportSection.append(this.makeRow(item, "support", currentSite, labels));
      }
      this.panel.append(supportSection);

      this.updateSlotGroup(siteSection, slot);
      if (this.opened) this.updatePosition();
      if (focused && (focusedHref || focusedNetworkId)) {
        const next =
          (focusedNetworkId
            ? this.panel.querySelector(`a[data-network-id="${focusedNetworkId}"]`)
            : [...this.panel.querySelectorAll("a")].find((link) => link.href === focusedHref)) ||
          this.panel.querySelector("a");
        if (next) next.focus();
      }
    }

    makeGroup(label, key) {
      const section = doc.createElement("section");
      section.dataset.group = key;
      const heading = doc.createElement("h2");
      heading.textContent = label || "";
      section.append(heading);
      return section;
    }

    makeRow(item, kind, currentSite, labels) {
      const isCurrent = kind === "network" && item.id === currentSite;
      const isSoon = kind === "network" && item.soon === true;
      const canLink = Boolean(item.url) && !isCurrent && !isSoon;
      const row = doc.createElement(canLink ? "a" : "div");
      row.className = "row";
      row.dataset.rowKind = kind;
      if (kind === "network") row.dataset.networkId = item.id;
      if (canLink) row.href = item.url;
      if (isCurrent) row.setAttribute("aria-current", "page");

      const nameLine = doc.createElement("div");
      nameLine.className = "name-line";
      appendText(nameLine, "name", item.name);
      if (isCurrent) appendText(nameLine, "badge", HERE_TEXT);
      else if (isSoon || !item.url) appendText(nameLine, "badge", labels.soonBadge || "");
      row.append(nameLine);
      if (item.note) appendText(row, "note", item.note);
      return row;
    }

    openPanel() {
      this.opened = true;
      this.updateSlotGroups();
      this.updatePosition();
      this.button.setAttribute("aria-expanded", "true");
      if (canUsePopover) {
        try {
          this.panel.showPopover();
        } catch {
          this.panel.dataset.open = "true";
        }
      } else {
        this.panel.dataset.open = "true";
      }
      doc.addEventListener("pointerdown", this.onDocumentPointerDown, true);
      doc.addEventListener("keydown", this.onDocumentKeyDown, true);
      win.addEventListener("resize", this.onResize);
      win.addEventListener("scroll", this.onScroll, { capture: true, passive: true });
    }

    closePanel(restoreFocus) {
      if (!this.opened) return;
      this.opened = false;
      this.button.setAttribute("aria-expanded", "false");
      if (canUsePopover && this.panel.matches(":popover-open")) {
        this.panel.hidePopover();
      }
      this.panel.removeAttribute("data-open");
      doc.removeEventListener("pointerdown", this.onDocumentPointerDown, true);
      doc.removeEventListener("keydown", this.onDocumentKeyDown, true);
      win.removeEventListener("resize", this.onResize);
      win.removeEventListener("scroll", this.onScroll, true);
      if (restoreFocus && this.isConnected) this.button.focus();
    }

    onDocumentPointerDown(event) {
      const path = event.composedPath();
      if (!path.includes(this)) this.closePanel(true);
    }

    onDocumentKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        this.closePanel(true);
      }
    }

    onResize() {
      if (this.opened) {
        this.updateSlotGroups();
        this.updatePosition();
      }
    }

    onScroll() {
      if (this.opened) this.updatePosition();
    }

    updatePosition() {
      const rect = this.button.getBoundingClientRect();
      const viewportWidth = win.innerWidth || doc.documentElement.clientWidth;
      const viewportHeight = win.innerHeight || doc.documentElement.clientHeight;
      const width = Math.max(0, Math.min(320, viewportWidth - 24));
      const top = Math.max(12, Math.round(rect.bottom + 8));
      const left = Math.max(12, Math.min(Math.round(rect.left), Math.round(viewportWidth - width - 12)));
      const maxHeight = Math.max(80, Math.round(viewportHeight - top - 16));
      if (this.positionSheet) {
        this.positionSheet.replaceSync(
          `.panel{left:${left}px;top:${top}px;width:${width}px;max-height:${maxHeight}px;}`
        );
      } else {
        this.panel.style.left = `${left}px`;
        this.panel.style.top = `${top}px`;
        this.panel.style.width = `${width}px`;
        this.panel.style.maxHeight = `${maxHeight}px`;
      }
    }
  }

  Object.defineProperties(FlareForwardNetworkMenu, {
    version: { value: MENU_VERSION, writable: false, configurable: false },
    bakedListVersion: { value: BAKED_LIST.version, writable: false, configurable: false }
  });

  win.customElements.define(TAG_NAME, FlareForwardNetworkMenu);
})();
