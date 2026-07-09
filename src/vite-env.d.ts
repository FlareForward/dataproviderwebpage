/// <reference types="vite/client" />

declare module "*.svg" {
  const src: string;
  export default src;
}

declare module "*.png" {
  const src: string;
  export default src;
}

interface ImportMetaEnv {
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
  readonly VITE_FLARE_RPC_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
