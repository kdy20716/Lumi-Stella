/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** 게임 서버(Socket.io) 주소. 예: https://lumi-server.azurewebsites.net */
  readonly VITE_SERVER_URL?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv }
