/** Vite-style import.meta.env, shared across app and node tsconfigs. */
interface ImportMetaEnv {
  readonly VITE_LOG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
