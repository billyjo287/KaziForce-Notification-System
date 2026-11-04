/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** "true": REST calls go to /api on the website's own address (forwarded by Vercel). */
  readonly VITE_SAME_ORIGIN_API?: string;
  /** "false": no code steps at sign-up (match ACCOUNT_CODES=false on the server). */
  readonly VITE_ACCOUNT_CODES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
