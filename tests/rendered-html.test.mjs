import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the catalog shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Catalogo Facil<\/title>/i);
  assert.match(html, /Catalogo Facil/);
  assert.match(html, /Carrinho|Nenhum catalogo configurado/);
  assert.match(html, /Bella Massa Pizzaria|Nenhum catalogo configurado/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|SkeletonPreview/);
});

test("keeps the growth surfaces present", async () => {
  const [page, layout, packageJson, schema] = await Promise.all([
    readFile(new URL("app/page.tsx", projectRoot), "utf8"),
    readFile(new URL("app/layout.tsx", projectRoot), "utf8"),
    readFile(new URL("package.json", projectRoot), "utf8"),
    readFile(new URL("supabase/schema.sql", projectRoot), "utf8"),
  ]);

  assert.match(page, /buildWhatsappMessage/);
  assert.match(page, /Farmacia Vida/);
  assert.match(page, /Construmais Obras/);
  assert.match(page, /Obra grossa/);
  assert.match(page, /Cano PVC Soldavel 25 mm/);
  assert.match(page, /Atualizar precos/);
  assert.match(layout, /lang="pt-BR"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(schema, /create table public\.integration_sources/);
  assert.match(schema, /create table public\.sync_jobs/);
  assert.match(schema, /create table public\.orders/);
});
