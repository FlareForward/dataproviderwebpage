import { createConnector } from "wagmi";
import {
  getAddress,
  numberToHex,
  SwitchChainError,
  UserRejectedRequestError,
  type Address,
} from "viem";
import type { EthereumProvider } from "@ledgerhq/connect-kit-loader";
import { FLARE_RPC_URL } from "../flare";

type LedgerParameters = {
  /** WalletConnect Cloud project id (required for the Ledger Live / mobile flow). */
  projectId?: string;
};

/**
 * A wagmi connector for Ledger hardware wallets built on Ledger's Connect Kit.
 *
 * Connect Kit is loaded lazily from Ledger's CDN the first time the user picks
 * Ledger, so it adds no weight to the initial bundle and never runs unless the
 * user explicitly chooses it. The kit itself presents Ledger's own UI for
 * choosing between a USB (WebHID) connection and Ledger Live over WalletConnect.
 */
export function ledger({ projectId }: LedgerParameters = {}) {
  let provider: EthereumProvider | undefined;
  let accountsChanged: ((accounts: string[]) => void) | undefined;
  let chainChanged: ((chainId: string) => void) | undefined;
  let disconnected: (() => void) | undefined;

  return createConnector<EthereumProvider>((config) => {
    async function getInstance(): Promise<EthereumProvider> {
      if (!provider) {
        const { loadConnectKit, SupportedProviders } = await import(
          "@ledgerhq/connect-kit-loader"
        );
        const connectKit = await loadConnectKit();
        connectKit.checkSupport({
          providerType: SupportedProviders.Ethereum,
          walletConnectVersion: 2,
          projectId,
          chains: [config.chains[0].id],
          rpcMap: { [config.chains[0].id]: FLARE_RPC_URL },
        });
        provider = await connectKit.getProvider();
      }
      return provider;
    }

    function cleanupListeners(p: EthereumProvider) {
      if (accountsChanged) {
        p.removeListener("accountsChanged", accountsChanged);
        accountsChanged = undefined;
      }
      if (chainChanged) {
        p.removeListener("chainChanged", chainChanged);
        chainChanged = undefined;
      }
      if (disconnected) {
        p.removeListener("disconnect", disconnected);
        disconnected = undefined;
      }
    }

    return {
      id: "ledger",
      name: "Ledger",
      type: "ledger",

      async connect({ chainId }: { chainId?: number } = {}) {
        const p = await getInstance();
        const requested = await p.request<string[]>({
          method: "eth_requestAccounts",
        });
        const accounts = requested.map((x) => getAddress(x)) as readonly Address[];

        if (!accountsChanged) {
          accountsChanged = this.onAccountsChanged.bind(this);
          p.on("accountsChanged", accountsChanged);
        }
        if (!chainChanged) {
          chainChanged = this.onChainChanged.bind(this);
          p.on("chainChanged", chainChanged);
        }
        if (!disconnected) {
          disconnected = this.onDisconnect.bind(this);
          p.on("disconnect", disconnected);
        }

        let currentChainId = Number(
          await p.request<string>({ method: "eth_chainId" })
        );
        if (chainId && currentChainId !== chainId) {
          const chain = await this.switchChain!({ chainId }).catch((error) => {
            if (error.code === UserRejectedRequestError.code) throw error;
            return { id: currentChainId };
          });
          currentChainId = chain?.id ?? currentChainId;
        }

        // wagmi's connect return is generic over `withCapabilities`; we only
        // support the default (plain address list) shape, so relax the type here.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return { accounts, chainId: currentChainId } as any;
      },

      async disconnect() {
        const p = await getInstance();
        cleanupListeners(p);
        await p.disconnect?.();
      },

      async getAccounts() {
        const p = await getInstance();
        const accounts = await p.request<string[]>({ method: "eth_accounts" });
        return accounts.map((x) => getAddress(x)) as readonly Address[];
      },

      async getChainId() {
        const p = await getInstance();
        const chainId = await p.request<string>({ method: "eth_chainId" });
        return Number(chainId);
      },

      async getProvider() {
        return getInstance();
      },

      async isAuthorized() {
        // Only report authorized within a live session; never eagerly load the
        // Connect Kit on mount (hardware wallets are reconnected explicitly).
        if (!provider) return false;
        try {
          const accounts = await this.getAccounts();
          return accounts.length > 0;
        } catch {
          return false;
        }
      },

      async switchChain({ chainId }: { chainId: number }) {
        const chain = config.chains.find((c) => c.id === chainId);
        if (!chain) throw new SwitchChainError(new Error("Chain not configured"));
        const p = await getInstance();
        await p.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: numberToHex(chainId) }],
        });
        return chain;
      },

      onAccountsChanged(accounts: string[]) {
        if (accounts.length === 0) this.onDisconnect();
        else
          config.emitter.emit("change", {
            accounts: accounts.map((x) => getAddress(x)) as readonly Address[],
          });
      },

      onChainChanged(chain: string) {
        config.emitter.emit("change", { chainId: Number(chain) });
      },

      async onDisconnect() {
        config.emitter.emit("disconnect");
        if (provider) cleanupListeners(provider);
      },
    };
  });
}
