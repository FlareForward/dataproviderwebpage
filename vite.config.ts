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
  assetsInclude: ["**/*.svg", "**/*.csv"],
});
