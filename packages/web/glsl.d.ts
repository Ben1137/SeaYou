/// <reference types="vite/client" />

// Explicit ImportMetaEnv — required because tsconfig "types" array does not
// include vite/client, so without this the keys type as string | undefined
// and Vite's static replacement may silently fall through to undefined.
interface ImportMetaEnv {
  readonly VITE_USE_WEBGL_MAP: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_GOOGLE_PLACES_API_KEY: string;
  readonly VITE_AISSTREAM_API_KEY: string;
  readonly VITE_LINZ_API_KEY: string;
  readonly VITE_ONESIGNAL_APP_ID: string;
  readonly VITE_PWA_BASE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Type declarations for GLSL shader imports
declare module '*.glsl' {
  const value: string;
  export default value;
}

declare module '*.vert' {
  const value: string;
  export default value;
}

declare module '*.frag' {
  const value: string;
  export default value;
}
