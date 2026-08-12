import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

function stableEntryName(chunk: { facadeModuleId?: string | null; name: string }) {
  const moduleId = chunk.facadeModuleId?.replace(/\\/g, "/") ?? "";
  if (moduleId === "app/page.tsx" || moduleId.endsWith("/app/page.tsx")) return "assets/catalog-page.js";
  if (moduleId === "app/admin/page.tsx" || moduleId.endsWith("/app/admin/page.tsx")) return "assets/admin-page.js";
  if (moduleId === "app/empresa/page.tsx" || moduleId.endsWith("/app/empresa/page.tsx")) return "assets/company-page.js";
  if (moduleId === "app/acesso/page.tsx" || moduleId.endsWith("/app/acesso/page.tsx")) return "assets/access-page.js";
  if (moduleId.includes("exceljs")) return "assets/exceljs.min.js";
  if (moduleId.includes("virtual:vinext-app-browser-entry")) return "assets/app.js";
  return `assets/${chunk.name}.js`;
}

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    environments: {
      client: {
        build: {
          cssCodeSplit: false,
          rollupOptions: {
            output: {
              entryFileNames: stableEntryName,
              chunkFileNames: stableEntryName,
              assetFileNames: (asset) => asset.names.some((name) => name.endsWith(".css"))
                ? "assets/app.css"
                : "assets/[name][extname]",
            },
          },
        },
      },
    },
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
