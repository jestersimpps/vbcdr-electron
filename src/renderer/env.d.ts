/// <reference types="vite/client" />

declare module '*.vrm?url' {
  const src: string
  export default src
}

import type { ElectronAPI } from '../preload/index'

declare global {
  interface Window {
    api: ElectronAPI
  }
}
