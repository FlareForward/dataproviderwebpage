import { defineConfig } from "vite";
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // @flarenetwork/flare-tx-sdk (via flarejs) relies on Node built-ins such as
    // `util` and `buffer`; polyfill them for the browser.
    nodePolyfills({
      globals: { Buffer: true, global: true, process: true },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // The FTSO accuracy board fetches the same-origin `/api/ftso` proxy that the
    // Cloudflare Worker (worker/index.ts) serves in prod. The Vite dev server
    // doesn't run the Worker, so forward `/api` to a local `wrangler dev`
    // (`npx wrangler dev --port 8788`) during development. Alternatively set
    // VITE_ACCURACY_URL to a deployed worker's /api/ftso URL.
    proxy: {
      "/api": {
        target: "http://localhost:8788",
        changeOrigin: true,
      },
    },
  },
  assetsInclude: ["**/*.svg", "**/*.csv"],
  build: {
    // The WalletConnect / Reown AppKit tree is very large. Splitting it (and the
    // other heavy vendors) into separate chunks keeps any single chunk small,
    // which lowers peak memory during rollup rendering/minification — important
    // for memory-constrained CI builders like Cloudflare Workers Builds.
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // Only pull out the large, self-contained vendor trees. Leaving the
        // React ecosystem (and everything else) in the default chunk avoids
        // circular-chunk init-order problems while still shrinking the main
        // bundle enough to keep the build within CI memory limits.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@walletconnect") || id.includes("@reown"))
            return "walletconnect";
          if (id.includes("/@wagmi/") || id.includes("/wagmi/") || id.includes("/viem/"))
            return "wagmi";
          if (id.includes("recharts") || id.includes("/d3-")) return "charts";
          return undefined;
        },
      },
    },
  },
});
