/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** "true": REST calls go to /api on the website's own address (forwarded by Vercel). */
  readonly VITE_SAME_ORIGIN_API?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
