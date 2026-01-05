/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly SERVER?: string
  readonly DEV_MODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

