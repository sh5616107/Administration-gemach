/// <reference types="vite/client" />

interface Window {
  require: NodeRequire
}

declare module 'stylis-plugin-rtl' {
  const rtlPlugin: unknown
  export default rtlPlugin
}

declare module 'stylis' {
  export const prefixer: unknown
}
