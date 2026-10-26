// Aus package.json, gesetzt in vite.config.ts
declare const __APP_VERSION__: string;

// Nur lokal (.env.local): eigenes Supabase und eigene Anmeldeseite statt der von Dendree
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_KEY?: string;
  readonly VITE_AUTH_URL?: string;
}
