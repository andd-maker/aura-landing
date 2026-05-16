/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_YANDEX_CAPTCHA_SITE_KEY?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    smartCaptcha?: {
      execute: (siteKey: string) => Promise<string>;
      render?: (...args: unknown[]) => unknown;
      reset?: () => void;
    };
  }
}

export {};
