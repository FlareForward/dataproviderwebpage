import { ReactNode } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { chain, FLARE_RPC_URL } from "../lib/flare";

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

const connectors = [
  injected({ shimDisconnect: true }),
  ...(projectId
    ? [
        walletConnect({
          projectId,
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
