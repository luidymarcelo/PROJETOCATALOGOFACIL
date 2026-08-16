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

test("server-renders the store discovery homepage", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.equal(response.headers.get("permissions-policy"), "geolocation=(self)");

  const html = await response.text();
  assert.match(html, /<title>Catalogo Facil<\/title>/i);
  assert.match(html, /Catalogo Facil/);
  assert.match(html, /Lojas e catálogos|Nenhum catalogo configurado/);
  assert.match(html, /Estabelecimentos disponíveis|Nenhum catalogo configurado/);
  assert.match(html, /Bella Massa Pizzaria|Nenhum catalogo configurado/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|SkeletonPreview/);
});

test("keeps the growth surfaces present", async () => {
  const [page, pageStyles, adminPage, createCompanyFunction, companyWorkspaceSql, catalogImagesSql, catalogImageRlsFixSql, addAndersonAdminSql, storeLocationsSql, companyParametersSql, publicCatalogCompaniesSql, companyBrandingSql, branchManagementSql, layout, packageJson, schema, viteConfig, worker, headers, legacyCatalogBundle, legacyStyles] = await Promise.all([
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
    readFile(new URL("supabase/011_public_catalog_companies.sql", projectRoot), "utf8"),
    readFile(new URL("supabase/012_company_branding_and_product_gallery.sql", projectRoot), "utf8"),
    readFile(new URL("supabase/013_company_branch_management.sql", projectRoot), "utf8"),
    readFile(new URL("app/layout.tsx", projectRoot), "utf8"),
    readFile(new URL("package.json", projectRoot), "utf8"),
    readFile(new URL("supabase/schema.sql", projectRoot), "utf8"),
    readFile(new URL("vite.config.ts", projectRoot), "utf8"),
    readFile(new URL("worker/index.ts", projectRoot), "utf8"),
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
  assert.match(page, /function catalogLocationError/);
  assert.doesNotMatch(page, /navigator\.permissions\.query\(\{ name: "geolocation" \}\)/);
  assert.match(page, /Ative a localização do aparelho, confirme a permissão deste site no navegador/);
  assert.match(page, /Localização no mapa/);
  assert.match(page, /Mapa da filial/);
  assert.match(page, /Ver carrinho/);
  assert.match(page, /STORE_RADIUS_KM = 30/);
  assert.match(page, /function storeCatalogUrl/);
  assert.match(page, /new URLSearchParams\(window\.location\.search\)\.get\("loja"\)/);
  assert.match(page, /target="_blank"/);
  assert.match(page, /function StoreDiscovery/);
  assert.match(page, /merchants=\{discoveryMerchants\}/);
  assert.match(page, /commerce-grid discovery/);
  assert.match(page, /Buscar lojas ou produtos/);
  assert.match(page, /Lojas e catálogos/);
  assert.match(page, /companyName/);
  assert.match(page, /rpc\("get_public_catalog_companies"\)/);
  assert.match(page, /className="discovery-branch-name"/);
  assert.match(page, /className="merchant-branch-name"/);
  assert.match(page, /<h1>\{merchant\.companyName\}<\/h1>/);
  assert.match(page, /Filial: \$\{cleanOrderText\(branchName\)\}/);
  assert.match(page, /function catalogThemeStyle/);
  assert.match(page, /merchant\.companyProfileImage/);
  assert.match(page, /function ProductGallery/);
  assert.match(page, /product_images\(id, image_url, sort_order\)/);
  assert.match(page, /updatedAt: product\.updated_at \?\? null/);
  assert.match(page, /function formatProductUpdatedAt/);
  assert.match(page, /className="product-updated-at"/);
  assert.doesNotMatch(page, /useState<StoreId>\("bella-massa"\)/);
  assert.doesNotMatch(page, /: loadedMerchants\[0\]\.id/);
  assert.match(page, /direct-store-topbar/);
  assert.match(page, /directStoreId \? merchant\.address : "Pedidos por WhatsApp"/);
  assert.match(page, /merchant\.deliveryTime !== "Consulte a filial"/);
  assert.match(page, /<MapPin size=\{16\} \/>\{merchant\.address\}/);
  assert.match(page, /merchant\.minimumOrder > 0/);
  assert.match(page, /commerce-grid direct-store/);
  assert.match(page, /!directStoreId \? <button className="location-pill"/);
  assert.match(pageStyles, /\.store-discovery/);
  assert.match(pageStyles, /\.discovery-store-grid/);
  assert.match(pageStyles, /\.discovery-branch-name/);
  assert.match(pageStyles, /\.merchant-branch-name/);
  assert.match(pageStyles, /\.product-gallery/);
  assert.match(pageStyles, /\.product-updated-at/);
  assert.match(pageStyles, /\.company-profile-field/);
  assert.match(pageStyles, /\.parameter-number-field/);
  assert.match(pageStyles, /\.commerce-grid,\s*\.commerce-grid\.direct-store\s*\{\s*grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(page, /function StoreNotFound/);
  assert.match(page, /calculate_delivery_fee/);
  assert.match(page, /calculatesDeliveryFee/);
  assert.match(page, /catalog_layout/);
  assert.match(page, /catalogLayout/);
  assert.match(page, /product-grid \$\{merchant\.catalogLayout\}/);
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
  assert.match(adminPage, /function PlatformAdminSidebar/);
  assert.match(adminPage, /function CompanySettingsNav/);
  assert.match(adminPage, /companySettingsSection === "parameters"/);
  assert.match(adminPage, /function ParameterWorkspace/);
  assert.match(adminPage, /type ParameterScope = "company" \| "branch"/);
  assert.match(adminPage, /saveBranchParameters/);
  assert.match(adminPage, /Afeta somente/);
  assert.doesNotMatch(adminPage, /navigator\.permissions\.query\(\{ name: "geolocation" \}\)/);
  assert.match(adminPage, /Ative a localização do aparelho, confirme a permissão deste site no navegador/);
  assert.match(adminPage, /window\.self !== window\.top/);
  assert.match(adminPage, /Buscar por empresa ou filial/);
  assert.match(adminPage, /Aplicar parâmetros em/);
  assert.match(adminPage, /className="parameter-scope-control"/);
  assert.match(adminPage, /className="parameter-mode-options"/);
  assert.match(adminPage, /className="parameter-compact-item"/);
  assert.match(adminPage, /<details className="parameter-compact-item">/);
  assert.match(adminPage, /CATALOG_LAYOUT_PARAMETER_KEY = "catalog_layout"/);
  assert.match(adminPage, /STOCK_CONTROL_PARAMETER_KEY = "control_stock"/);
  assert.match(adminPage, /Controle de estoque/);
  assert.match(adminPage, />4 parâmetros</);
  assert.match(adminPage, /branch-stock-control-mode/);
  assert.match(adminPage, /Layout do catálogo/);
  assert.match(adminPage, /Foto acima do nome do produto/);
  assert.match(adminPage, /branchCatalogLayouts/);
  assert.doesNotMatch(adminPage, />Empresa selecionada</);
  assert.doesNotMatch(adminPage, /: nextTenants\[0\]\?\.id/);
  assert.match(pageStyles, /\.admin-console-layout/);
  assert.match(pageStyles, /\.company-settings-layout/);
  assert.match(pageStyles, /\.parameter-workspace/);
  assert.match(pageStyles, /\.parameter-mode-options/);
  assert.match(pageStyles, /\.parameter-compact-item/);
  assert.match(pageStyles, /\.parameter-list-panel/);
  assert.match(pageStyles, /\.product-grid\.showcase/);
  assert.match(pageStyles, /\.product-status-badge\.active/);
  assert.match(pageStyles, /\.product-status-toggle\[aria-checked="true"\]/);
  assert.match(pageStyles, /\.admin-form-grid\.single/);
  assert.match(pageStyles, /\.parameter-item-icon\.stock/);
  assert.match(pageStyles, /\.branch-details-panel/);
  assert.match(pageStyles, /\.branch-commerce-fields/);
  assert.match(pageStyles, /aspect-ratio: 4 \/ 5/);
  assert.match(headers, /Permissions-Policy: geolocation=\(self\)/);
  assert.match(worker, /headers\.set\("Permissions-Policy", "geolocation=\(self\)"\)/);
  assert.match(adminPage, /Supabase não configurado neste computador/);
  assert.match(adminPage, /captureBranchLocation/);
  assert.match(adminPage, /Usar localização atual da filial/);
  assert.match(adminPage, /async function saveBranchDetails/);
  assert.match(adminPage, /if \(!address\)/);
  assert.match(adminPage, /Informe uma latitude e longitude válidas para a filial/);
  assert.doesNotMatch(adminPage, /address\.trim\(\)\.length < 5/);
  assert.match(adminPage, /function BranchDetailsEditor/);
  assert.match(adminPage, /Dados da filial/);
  assert.match(adminPage, /Filial ativa no catálogo público/);
  assert.match(adminPage, /minimum_order: minimumOrder/);
  assert.match(adminPage, /delivery_time_label: branchDetailsForm\.deliveryTime/);
  assert.match(adminPage, /Salvar dados/);
  assert.match(adminPage, /BRANCH_DETAIL_SELECT/);
  assert.match(adminPage, /ParameterWorkspace/);
  assert.match(adminPage, />Herdar</);
  assert.match(adminPage, /className="parameter-form-footer"/);
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
  assert.match(createCompanyFunction, /whatsapp_phone, address, cover_image_url, latitude, longitude, minimum_order, delivery_fee, delivery_time_label, is_active/);
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
  assert.match(adminPage, /function catalogImportHeaders/);
  assert.match(adminPage, /header !== "Estoque"/);
  assert.match(adminPage, /const exportHeaders = catalogImportHeaders\(activeControlsStock\)/);
  assert.match(adminPage, /productsSheet\.addRow\(exportHeaders\)/);
  assert.match(adminPage, /if \(activeControlsStock\) instructionRows\.splice/);
  assert.match(adminPage, /activeControlsStock \? <label>Estoque/);
  assert.match(adminPage, /activeControlsStock \? \{ stock_quantity: row\.stock \} : \{\}/);
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
  assert.match(adminPage, /Fotos do produto/);
  assert.match(adminPage, /async function updateQuickProductImage/);
  assert.match(adminPage, /Adicionar fotos/);
  assert.match(adminPage, /product-photo-button/);
  assert.match(adminPage, /async function toggleProductStatus/);
  assert.match(adminPage, /role="switch"/);
  assert.match(adminPage, /aria-checked=\{product\.is_active\}/);
  assert.match(adminPage, /product-status-badge active/);
  assert.match(adminPage, /is_active: editingProduct\?\.is_active \?\? true/);
  assert.match(adminPage, /\.from\("products"\)\s*\.delete\(\)/);
  assert.doesNotMatch(adminPage, /setProducts\(exportProducts\)/);
  const refreshCatalogSource = adminPage.slice(
    adminPage.indexOf("async function refreshBranchCatalog"),
    adminPage.indexOf("async function refreshProductImageLimit"),
  );
  assert.doesNotMatch(
    refreshCatalogSource,
    /\.from\("products"\)[\s\S]*?\.eq\("store_id", branchId\)\s*\.eq\("is_active", true\)/,
  );
  assert.match(adminPage, /PRODUCT_IMAGE_LIMIT_PARAMETER_KEY = "product_image_limit"/);
  assert.match(adminPage, /async function saveCompanyIdentity/);
  assert.match(adminPage, /Empresa ativa no catálogo público/);
  assert.match(adminPage, /Cor principal do tema/);
  assert.match(adminPage, /get_admin_company_identities/);
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
  assert.match(publicCatalogCompaniesSql, /function public\.get_public_catalog_companies/);
  assert.match(publicCatalogCompaniesSql, /security definer/);
  assert.match(publicCatalogCompaniesSql, /grant execute on function public\.get_public_catalog_companies\(\) to anon, authenticated/);
  assert.match(companyBrandingSql, /add column if not exists is_active/);
  assert.match(companyBrandingSql, /add column if not exists theme_color/);
  assert.match(companyBrandingSql, /create table if not exists public\.product_images/);
  assert.match(companyBrandingSql, /function public\.enforce_product_image_limit/);
  assert.match(companyBrandingSql, /function public\.get_admin_company_identities/);
  assert.match(companyBrandingSql, /function public\.is_store_public/);
  assert.match(companyBrandingSql, /platform admins update company identity/);
  assert.match(branchManagementSql, /company members read own stores/);
  assert.match(branchManagementSql, /using \(public\.can_manage_store\(id\)\)/);
  assert.match(branchManagementSql, /company members update own stores/);
  assert.match(branchManagementSql, /with check \(public\.can_manage_store\(id\)\)/);
  assert.match(branchManagementSql, /create or replace function public\.get_company_workspace/);
  assert.match(branchManagementSql, /'minimum_order', s\.minimum_order/);
  assert.match(branchManagementSql, /'is_active', s\.is_active/);
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
