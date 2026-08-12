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
  const [page, pageStyles, adminPage, createCompanyFunction, companyWorkspaceSql, catalogImagesSql, catalogImageRlsFixSql, addAndersonAdminSql, storeLocationsSql, companyParametersSql, layout, packageJson, schema, viteConfig, headers, legacyCatalogBundle, legacyStyles] = await Promise.all([
    readFile(new URL("app/page.tsx", projectRoot), "utf8"),
    readFile(new URL("app/globals.css", projectRoot), "utf8"),
    readFile(new URL("app/admin/page.tsx", projectRoot), "utf8"),
    readFile(new URL("supabase/functions/create-store-user/index.ts", projectRoot), "utf8"),
    readFile(new URL("supabase/005_company_workspace.sql", projectRoot), "utf8"),
    readFile(new URL("supabase/006_catalog_images.sql", projectRoot), "utf8"),
    readFile(new URL("supabase/007_fix_catalog_image_rls.sql", projectRoot), "utf8"),
    readFile(new URL("supabase/008_add_anderson_platform_admin.sql", projectRoot), "utf8"),
    readFile(new URL("supabase/009_store_locations.sql", projectRoot), "utf8"),
    readFile(new URL("supabase/010_company_branch_parameters.sql", projectRoot), "utf8"),
    readFile(new URL("app/layout.tsx", projectRoot), "utf8"),
    readFile(new URL("package.json", projectRoot), "utf8"),
    readFile(new URL("supabase/schema.sql", projectRoot), "utf8"),
    readFile(new URL("vite.config.ts", projectRoot), "utf8"),
    readFile(new URL("public/_headers", projectRoot), "utf8"),
    readFile(new URL("public/assets/page-qV5W06Af.js", projectRoot), "utf8"),
    readFile(new URL("public/assets/index-jblei2xc.css", projectRoot), "utf8"),
  ]);

  assert.match(page, /buildWhatsappMessage/);
  assert.match(page, /\*COMANDA #\$\{orderCode\}\*/);
  assert.match(page, /Troco a devolver/);
  assert.match(page, /Complemento ou referência \(opcional\)/);
  assert.match(page, /Aguardando confirmação da loja/);
  assert.match(page, /whatsapp: normalizeWhatsapp\(store\.whatsapp_phone\)/);
  assert.match(page, /function useCurrentLocation/);
  assert.match(page, /Localização no mapa/);
  assert.match(page, /Mapa da filial/);
  assert.match(page, /Ver carrinho/);
  assert.match(page, /STORE_RADIUS_KM = 30/);
  assert.match(page, /function storeCatalogUrl/);
  assert.match(page, /new URLSearchParams\(window\.location\.search\)\.get\("loja"\)/);
  assert.match(page, /target="_blank"/);
  assert.match(page, /direct-store-topbar/);
  assert.match(page, /commerce-grid direct-store/);
  assert.match(page, /!directStoreId \? <aside/);
  assert.match(page, /!directStoreId \? <button className="location-pill"/);
  assert.match(pageStyles, /\.commerce-grid,\s*\.commerce-grid\.direct-store\s*\{\s*grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(page, /function StoreNotFound/);
  assert.match(page, /calculate_delivery_fee/);
  assert.match(page, /calculatesDeliveryFee/);
  assert.match(page, /Total parcial/);
  assert.match(page, /Taxa de entrega:.*A combinar/);
  assert.doesNotMatch(page, /setIsCartOpen\(true\);\s*\n\s*}/);
  assert.doesNotMatch(page, /checkout\.phone/);
  assert.match(page, /Farmacia Vida/);
  assert.match(page, /Construmais Obras/);
  assert.match(page, /Obra grossa/);
  assert.match(page, /Cano PVC Soldavel 25 mm/);
  assert.match(page, /Atualizar precos/);
  assert.match(page, /demoMerchant \?\? neutralMerchant\(store\)/);
  assert.match(page, /CatalogImage/);
  assert.match(page, /store\.cover_image_url \?\? baseMerchant\.cover/);
  assert.match(adminPage, /adminSection === "companies"/);
  assert.match(adminPage, /Supabase não configurado neste computador/);
  assert.match(adminPage, /captureBranchLocation/);
  assert.match(adminPage, /Usar localização atual da filial/);
  assert.match(adminPage, /saveExistingBranchLocation/);
  assert.match(adminPage, /Salvar localização/);
  assert.match(adminPage, /FreightParametersPanel/);
  assert.match(adminPage, /Herdar da empresa/);
  assert.match(adminPage, /Salvar parâmetros/);
  assert.match(adminPage, /async function saveCompanyParameters/);
  assert.match(adminPage, /rpc\("is_platform_admin"\)/);
  assert.doesNotMatch(adminPage, /ADMIN_EMAILS/);
  assert.match(adminPage, /company: \{/);
  assert.doesNotMatch(adminPage, /createStoreUser|storeUserForm|Salvar acesso principal/);
  assert.match(createCompanyFunction, /tenant_members/);
  assert.match(createCompanyFunction, /const company = body\.company/);
  assert.match(createCompanyFunction, /get-company-workspace/);
  assert.match(createCompanyFunction, /company_tenant_id/);
  assert.match(createCompanyFunction, /store_members/);
  assert.match(adminPage, /get_company_workspace/);
  assert.match(adminPage, /async function createBranch/);
  assert.match(adminPage, /Nova filial/);
  assert.match(adminPage, /Ela já está disponível no Portal da empresa/);
  assert.match(adminPage, /openCompanySettings/);
  assert.match(adminPage, /update-company-access/);
  assert.match(adminPage, /Salvar acesso/);
  assert.match(adminPage, /async function deleteCompany/);
  assert.match(adminPage, /Excluir definitivamente/);
  assert.match(adminPage, /async function downloadCatalogTemplate/);
  assert.match(adminPage, /async function importCatalog/);
  assert.match(adminPage, /Exportar catálogo/);
  assert.match(adminPage, /Adicionar ao catálogo/);
  assert.match(adminPage, /workbook\.addWorksheet\("Categorias"/);
  assert.match(adminPage, /productsSheet\.addRows\(exportProducts\.map/);
  assert.match(adminPage, /const \[categoryResult, productResult\] = await Promise\.all/);
  assert.match(adminPage, /external_id: `CAT-\$\{productId\}`/);
  assert.doesNotMatch(adminPage, /skuText\.toUpperCase/);
  assert.match(adminPage, /Código\/SKU/);
  assert.doesNotMatch(adminPage, /URL da imagem/);
  assert.doesNotMatch(adminPage, /Imagem por link/);
  assert.doesNotMatch(adminPage, /image_url: row\.imageUrl/);
  assert.match(adminPage, /onConflict: "store_id,external_id"/);
  assert.match(adminPage, /catalog-images/);
  assert.match(adminPage, /async function saveBranchCover/);
  assert.match(adminPage, /Foto do produto/);
  assert.match(adminPage, /async function updateQuickProductImage/);
  assert.match(adminPage, /Adicionar ou tirar foto/);
  assert.match(adminPage, /product-photo-button/);
  assert.match(adminPage, /function editProduct/);
  assert.match(adminPage, /product-edit-button/);
  assert.match(adminPage, /Salvar alterações/);
  assert.match(adminPage, /set_store_cover/);
  assert.match(companyWorkspaceSql, /create or replace function public\.get_company_workspace/);
  assert.match(createCompanyFunction, /get-company-settings/);
  assert.match(createCompanyFunction, /update-company-access/);
  assert.match(createCompanyFunction, /delete-company/);
  assert.match(createCompanyFunction, /auth\.admin\.deleteUser/);
  assert.match(catalogImagesSql, /add column if not exists cover_image_url/);
  assert.match(catalogImagesSql, /insert into storage\.buckets/);
  assert.match(catalogImagesSql, /store members upload catalog images/);
  assert.match(catalogImageRlsFixSql, /function public\.can_manage_catalog_image/);
  assert.match(catalogImageRlsFixSql, /function public\.set_store_cover/);
  assert.match(addAndersonAdminSql, /andersonrozwot@gmail\.com/);
  assert.match(addAndersonAdminSql, /insert into public\.platform_admins/);
  assert.match(addAndersonAdminSql, /on conflict \(user_id\) do nothing/);
  assert.match(storeLocationsSql, /add column if not exists latitude/);
  assert.match(storeLocationsSql, /add column if not exists longitude/);
  assert.match(companyParametersSql, /create table if not exists public\.tenant_parameters/);
  assert.match(companyParametersSql, /create table if not exists public\.store_parameters/);
  assert.match(companyParametersSql, /calculate_delivery_fee/);
  assert.match(companyParametersSql, /platform admins manage tenant parameters/);
  assert.match(createCompanyFunction, /latitude/);
  assert.match(createCompanyFunction, /longitude/);
  assert.match(createCompanyFunction, /tenant_parameters/);
  assert.match(layout, /lang="pt-BR"/);
  assert.match(packageJson, /"exceljs"/);
  assert.match(packageJson, /"uuid": "\^11\.1\.0"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(schema, /create table public\.integration_sources/);
  assert.match(schema, /create table public\.sync_jobs/);
  assert.match(schema, /create table public\.orders/);
  assert.match(viteConfig, /catalog-page\.js/);
  assert.match(viteConfig, /chunkFileNames: stableEntryName/);
  assert.match(viteConfig, /cssCodeSplit: false/);
  assert.match(headers, /Cache-Control: no-cache, must-revalidate/);
  assert.ok(legacyCatalogBundle.length > 30000);
  assert.ok(legacyStyles.length > 30000);
});
