"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import {
  DynamicContextProvider,
  DynamicMultiWalletPromptsWidget,
  overrideNetworkRpcUrl,
} from "@dynamic-labs/sdk-react-core";
import { DynamicWagmiConnector } from "@dynamic-labs/wagmi-connector";
import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";
import { dynamicApiBaseUrl, dynamicAuthConfigured, dynamicEnvironmentId } from "@/lib/auth/config";
import { AuthProvider } from "@/components/auth-provider";
import { FinancialProvider } from "@/components/financial-provider";
import { LEOPOLD_SEPOLIA_RPC_URL } from "@/lib/leopold/network";

const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  transports: {
    [sepolia.id]: http(LEOPOLD_SEPOLIA_RPC_URL),
  },
  multiInjectedProviderDiscovery: false,
  ssr: true,
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const app = (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {dynamicAuthConfigured ? (
          <DynamicWagmiConnector suppressChainMismatchError>
            <AuthProvider configured>
              <FinancialProvider>{children}</FinancialProvider>
            </AuthProvider>
          </DynamicWagmiConnector>
        ) : (
          <AuthProvider configured={false}>
            <FinancialProvider>{children}</FinancialProvider>
          </AuthProvider>
        )}
      </QueryClientProvider>
    </WagmiProvider>
  );

  if (!dynamicAuthConfigured) return app;
  return (
    <DynamicContextProvider
      settings={{
        environmentId: dynamicEnvironmentId,
        apiBaseUrl: dynamicApiBaseUrl || undefined,
        appName: "Leopold",
        initialAuthenticationMode: "connect-and-sign",
        enableConnectOnlyFallback: false,
        siweStatement: "Sign in to Leopold with your external financial wallet.",
        walletConnectors: [EthereumWalletConnectors],
        overrides: {
          evmNetworks: (networks) =>
            overrideNetworkRpcUrl(networks, { [String(sepolia.id)]: [LEOPOLD_SEPOLIA_RPC_URL] }).map((network) =>
              network.chainId === sepolia.id ? { ...network, rpcUrls: [LEOPOLD_SEPOLIA_RPC_URL] } : network,
            ),
        },
        // Dynamic's Ethereum connector bundle also exposes Dynamic WaaS and
        // turnkey embedded connectors. Leopold's financial identity is always
        // an external wallet, so those connector options are removed here as
        // well as disabled in the Dynamic dashboard.
        walletsFilter: (options) =>
          options.filter((option) => option.key !== "dynamicwaas" && !option.key.toLowerCase().startsWith("turnkey")),
      }}
    >
      {app}
      <DynamicMultiWalletPromptsWidget />
    </DynamicContextProvider>
  );
}
