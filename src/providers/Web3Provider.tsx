import { ReactNode } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { chain, FLARE_RPC_URL } from "../lib/flare";
import { ledger } from "../lib/connectors/ledger";

// Public WalletConnect Cloud project ID. This is not a secret: Vite inlines
// VITE_* values into the client bundle, so a project ID is always visible in
// the shipped app. We bake in a default so WalletConnect works in every
// deployment without extra build-env configuration; an env var still overrides
// it for local dev or a different project.
const DEFAULT_WALLETCONNECT_PROJECT_ID = "edbee77ea21c931eea27d81df91ac7b9";

const projectId =
  (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined) ||
  DEFAULT_WALLETCONNECT_PROJECT_ID;

/** Whether the WalletConnect-based connectors can be offered. */
export const walletConnectEnabled = Boolean(projectId);

/**
 * Locate the D'CENT-injected EIP-1193 provider. The D'CENT browser extension
 * flags its provider with `isDcentWallet`; we also scan a multi-provider
 * `providers` array in case several wallets are injected side by side.
 */
function dcentProvider(window?: any) {
  const eth = window?.ethereum;
  if (!eth) return undefined;
  const isDcent = (p: any) =>
    Boolean(p && (p.isDcentWallet || p.isDcent || p.isDCENT));
  if (isDcent(eth)) return eth;
  const providers = eth.providers as any[] | undefined;
  return providers?.find(isDcent);
}

const connectors = [
  ledger({ projectId }),
  injected({
    target: {
      id: "dcent",
      name: "D'CENT",
      provider: dcentProvider,
    },
  }),
  injected({ target: "metaMask" }),
  ...(projectId
    ? [
        walletConnect({
          projectId,
          showQrModal: true,
          metadata: {
            name: "FlareForward",
            description: "Flare Network data provider dashboard and delegation portal",
            url: "https://flareforward.app",
            icons: [],
          },
        }),
      ]
    : []),
];

export const wagmiConfig = createConfig({
  chains: [chain],
  connectors,
  transports: {
    [chain.id]: http(FLARE_RPC_URL),
  },
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 5_000 },
  },
});

export function Web3Provider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
