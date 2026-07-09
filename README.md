# FlareForward — Flare Network Data Provider Portal

A dashboard and delegation portal for the Flare Network, built from the Figma
design and wired to **real on-chain data** on Flare Mainnet (chain ID 14):

- **Live price feeds** for every supported token, read directly from the FTSOv2
  block-latency feeds (`getFeedsByIdInWei`, ~1.8s updates).
- **Data provider directory** sourced from the community `ftso-signal-providers`
  list, enriched with on-chain vote power from the `WNat` contract.
- **Delegation** — connect a wallet, wrap FLR into WFLR, and delegate your vote
  power to any eligible provider using the official `@flarenetwork/flare-tx-sdk`.

## Tech stack

- Vite + React 18 + TypeScript + Tailwind CSS v4
- `wagmi` + `viem` for wallet connection and contract reads
- [`@flarenetwork/flare-wagmi-periphery-package`](https://www.npmjs.com/package/@flarenetwork/flare-wagmi-periphery-package) — official ABIs
- [`@flarenetwork/flare-tx-sdk`](https://www.npmjs.com/package/@flarenetwork/flare-tx-sdk) — wrap / delegate transactions
- `recharts` for the live price chart, `sonner` for toasts

Contract addresses are always resolved at runtime through the
`FlareContractRegistry` (`0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019`) — never
hardcoded.

## Getting started

```bash
npm install
cp .env.example .env   # optional: add a WalletConnect project ID
npm run dev
```

Open the printed local URL (default `http://localhost:5173`). Price feeds and the
provider directory load without a wallet; connecting a wallet (MetaMask or
WalletConnect) enables the delegation flow.

## Configuration

| Variable | Purpose |
| --- | --- |
| `VITE_WALLETCONNECT_PROJECT_ID` | Enables the WalletConnect connector (optional). |
| `VITE_FLARE_RPC_URL` | Override the default public Flare Mainnet RPC (optional). |

## Delegation model

Flare delegation assigns a **percentage of your WFLR vote power** (in basis
points, max two providers totalling 100%) — it does not move your tokens. This
app wraps FLR to WFLR as needed and delegates 100% of vote power to the selected
provider. Every on-chain action requires explicit confirmation in your wallet.

## Build

```bash
npm run build     # type-check + production build into dist/
npm run preview   # preview the production build
```
