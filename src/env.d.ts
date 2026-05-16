/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_TURNSTILE_SITE_KEY?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    // Cloudflare Turnstile API.
    // Грузится из https://challenges.cloudflare.com/turnstile/v0/api.js (defer в index.html).
    turnstile?: {
      render: (
        container: string | HTMLElement,
        params: {
          sitekey: string;
          size?: "normal" | "flexible" | "compact" | "invisible";
          callback?: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          appearance?: "always" | "execute" | "interaction-only";
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
      execute: (widgetIdOrContainer: string | HTMLElement, params?: object) => void;
      getResponse: (widgetId?: string) => string | undefined;
    };
  }
}

export {};
