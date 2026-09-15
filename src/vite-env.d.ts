/// <reference types="vite/client" />

declare type PagesFunction = (context: { request: Request; env: Record<string, unknown> }) => Response | Promise<Response>;
