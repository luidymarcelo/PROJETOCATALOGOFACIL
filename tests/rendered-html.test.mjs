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
  assert.match(html, /<meta name="viewport" content="[^"]*width=device-width[^"]*initial-scale=1/);
  assert.match(html, /Catalogo Facil/);
  assert.match(html, /Lojas e catálogos|Nenhum catalogo configurado/);
  assert.match(html, /Estabelecimentos disponíveis|Nenhum catalogo configurado/);
  assert.match(html, /Bella Massa Pizzaria|Nenhum catalogo configurado/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|SkeletonPreview/);
});

test("keeps the growth surfaces present", async () => {
  const [page, pageStyles, adminPage, ordersPage, createCompanyFunction, companyWorkspaceSql, catalogImagesSql, catalogImageRlsFixSql, addAndersonAdminSql, storeLocationsSql, companyParametersSql, publicCatalogCompaniesSql, companyBrandingSql, branchManagementSql, branchCoverNotesSql, productOptionGroupsSql, internalOrdersSql, layout, packageJson, schema, viteConfig, worker, headers, legacyCatalogBundle, legacyStyles] = await Promise.all([
    readFile(new URL("app/page.tsx", projectRoot), "utf8"),
    readFile(new URL("app/globals.css", projectRoot), "utf8"),
    readFile(new URL("app/admin/page.tsx", projectRoot), "utf8"),
    readFile(new URL("app/pedidos/page.tsx", projectRoot), "utf8"),
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
    readFile(new URL("supabase/014_branch_cover_notes.sql", projectRoot), "utf8"),
    readFile(new URL("supabase/015_product_option_groups.sql", projectRoot), "utf8"),
    readFile(new URL("supabase/017_internal_orders.sql", projectRoot), "utf8"),
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
  assert.match(page, /Filial: \$\{cleanOrderText\(branchName\)\}/);
  assert.match(page, /function catalogThemeStyle/);
  assert.match(page, /merchant\.companyProfileImage/);
  assert.match(page, /function ProductGallery/);
  assert.match(page, /product_images\(id, image_url, sort_order\)/);
  assert.doesNotMatch(page, /updatedAt: product\.updated_at/);
  assert.doesNotMatch(page, /function formatProductUpdatedAt/);
  assert.doesNotMatch(page, /className="product-updated-at"/);
  assert.doesNotMatch(page, /useState<StoreId>\("bella-massa"\)/);
  assert.doesNotMatch(page, /: loadedMerchants\[0\]\.id/);
  assert.doesNotMatch(page, /direct-store-topbar/);
  assert.doesNotMatch(page, /function compactMerchantLocation/);
  assert.doesNotMatch(page, /merchantBranchLabel\(merchant\) \?\? merchant\.segment/);
  assert.doesNotMatch(page, /<span>\{store\.segment\}<\/span>/);
  assert.match(page, /className="merchant-info-card"/);
  assert.match(page, /className="merchant-cover-note"/);
  assert.match(page, /className="merchant-location-link"/);
  assert.match(page, /Abrir localização/);
  assert.match(page, /locationUrl = hasCoordinates\(merchant\) \? mapsUrl\(merchant\) : null/);
  assert.doesNotMatch(page, /coverNotePositionValue/);
  assert.match(page, /directStoreId \? "direct-store-page"/);
  assert.match(page, /commerce-grid direct-store/);
  assert.match(page, /<button className="location-pill" type="button"/);
  assert.match(pageStyles, /\.store-discovery/);
  assert.match(pageStyles, /\.discovery-store-grid/);
  assert.match(pageStyles, /\.discovery-branch-name/);
  assert.match(pageStyles, /\.direct-store-page/);
  assert.match(pageStyles, /\.merchant-hero \{[\s\S]*?width: 100%;[\s\S]*?border-radius: 0;/);
  assert.doesNotMatch(pageStyles, /\.merchant-cover-description/);
  assert.match(pageStyles, /\.merchant-cover-note/);
  assert.match(pageStyles, /\.merchant-location-link/);
  assert.match(pageStyles, /\.merchant-location-link-copy/);
  assert.doesNotMatch(pageStyles, /\.topbar\.direct-store-topbar\s*\{[\s\S]*?position: sticky !important;/);
  assert.match(pageStyles, /\.merchant-info-card/);
  assert.match(pageStyles, /\.category-strip \{\s*position: static;/);
  assert.match(layout, /export const viewport/);
  assert.match(layout, /width: "device-width"/);
  assert.match(pageStyles, /\.product-gallery/);
  assert.doesNotMatch(pageStyles, /\.product-updated-at/);
  assert.match(pageStyles, /\.company-profile-field/);
  assert.match(pageStyles, /\.parameter-number-field/);
  assert.match(pageStyles, /\.commerce-grid,\s*\.commerce-grid\.direct-store\s*\{\s*grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(page, /function StoreNotFound/);
  assert.match(page, /calculate_delivery_fee/);
  assert.match(page, /option_groups/);
  assert.match(page, /ProductOptionsModal/);
  assert.match(page, /selectedOptions/);
  assert.match(pageStyles, /\.customer-option-group label\.selected\s*\{\s*border-color: var\(--line\);\s*background: var\(--surface-strong\);/s);
  assert.match(pageStyles, /\.direct-store-theme \.quantity-stepper button:active,[\s\S]*?background: var\(--primary, #176b52\);[\s\S]*?transition-duration: 0s;/);
  assert.match(pageStyles, /@media \(hover: none\), \(pointer: coarse\)[\s\S]*?button:hover:not\(:active\)[\s\S]*?background: transparent;/);
  assert.match(page, /delivery_fee_type/);
  assert.match(page, /calculatesDeliveryFee/);
  assert.match(page, /Math\.round\(targetMerchant\.deliveryFee \* deliveryDistanceKm \* 100\) \/ 100/);
  assert.match(page, /Use sua localização para calcular automaticamente a taxa de entrega/);
  assert.match(page, /Cálculo da entrega/);
  assert.match(page, /catalog_layout/);
  assert.match(page, /catalogLayout/);
  assert.match(page, /product-grid \$\{merchant\.catalogLayout\}/);
  assert.doesNotMatch(page, /<h1>\{activeCategory\}<\/h1>/);
  assert.doesNotMatch(pageStyles, /\.section-title/);
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
  assert.match(adminPage, /DELIVERY_FEE_TYPE_PARAMETER_KEY = "delivery_fee_type"/);
  assert.match(adminPage, /Forma de cálculo padrão/);
  assert.match(adminPage, /Valor por km/);
  assert.match(adminPage, /branch-delivery-fee-type/);
  assert.match(adminPage, /Controle de estoque/);
  assert.match(adminPage, />6 parâmetros</);
  assert.match(adminPage, /ORDER_MODE_PARAMETER_KEY = "order_mode"/);
  assert.match(adminPage, /Modo de pedidos/);
  assert.match(adminPage, /Comanda interna/);
  assert.match(adminPage, /type OrderMode = "whatsapp" \| "internal" \| "both"/);
  assert.match(adminPage, /onCompanyOrderModeChange\("both"\)/);
  assert.match(adminPage, /onBranchOrderModeChange\(activeBranch\.id, "both"\)/);
  assert.match(adminPage, /Um link para cada operação/);
  assert.match(adminPage, /function BranchOrderLinks/);
  assert.match(adminPage, /Equipe · Comanda interna/);
  assert.match(adminPage, /Cliente · WhatsApp/);
  assert.match(adminPage, /branchOrderModes/);
  assert.match(page, /create_internal_order/);
  assert.match(page, /orderMode/);
  assert.match(page, /type OrderMode = OrderChannel \| "both"/);
  assert.match(page, /value === "both"/);
  assert.match(page, /function orderChannelAvailable/);
  assert.match(page, /export function CatalogApplication/);
  assert.match(page, /CatalogApplication orderChannel="whatsapp"/);
  assert.match(page, /catalogo-facil-cart-\$\{orderChannel\}/);
  assert.match(page, /channel === "internal" \? "\/comanda" : "\/"/);
  assert.match(page, /Enviar pelo WhatsApp/);
  assert.doesNotMatch(page, /selectedOrderChannel/);
  assert.doesNotMatch(page, /className="order-channel-selector"/);
  assert.match(pageStyles, /\.branch-order-links/);
  assert.match(page, /className="category-nav-title">Categorias/);
  assert.match(page, /hasVerticalCategoryNav/);
  assert.match(pageStyles, /Tablet landscape catalog navigation/);
  assert.match(pageStyles, /orientation: landscape.*any-pointer: coarse/s);
  assert.match(pageStyles, /grid-template-columns: 204px minmax\(0, 1fr\)/);
  assert.match(pageStyles, /width: min\(520px, 62vw\)/);
  assert.match(pageStyles, /\.direct-store-page \.cart-footer \.whatsapp-button/);
  assert.match(pageStyles, /\.direct-store-page \.category-nav-title\s*\{[^}]*min-height: 48px[^}]*border-bottom: 1px solid var\(--line\)[^}]*font-size: 0\.92rem/s);
  assert.match(adminPage, /className="admin-form-panel catalog-structure-panel category-overview-panel"/);
  assert.match(adminPage, /className="catalog-entity-info"/);
  assert.match(pageStyles, /\.catalog-structure-panel \.catalog-panel-heading h2/);
  assert.match(pageStyles, /\.catalog-entity-info > strong/);
  assert.doesNotMatch(pageStyles, /\.measurement-unit-row strong\s*\{[^}]*ui-monospace/s);
  assert.match(page, /Mesa ou identificação/);
  assert.match(ordersPage, /Pedidos e comandas/);
  assert.match(ordersPage, /payment_status/);
  assert.match(ordersPage, /billing_status/);
  assert.match(internalOrdersSql, /create or replace function public\.create_internal_order/);
  assert.match(internalOrdersSql, /order_channel/);
  assert.match(internalOrdersSql, /payment_status/);
  assert.match(internalOrdersSql, /billing_status/);
  assert.match(internalOrdersSql, /v_order_mode not in \('internal', 'both'\)/);
  const commandCatalogPage = await readFile(new URL("app/comanda/page.tsx", projectRoot), "utf8");
  assert.match(commandCatalogPage, /CatalogApplication orderChannel="internal"/);
  const bothOrderChannelsSql = await readFile(new URL("supabase/020_allow_both_order_channels.sql", projectRoot), "utf8");
  assert.match(bothOrderChannelsSql, /create or replace function public\.create_internal_order/);
  assert.match(bothOrderChannelsSql, /v_order_mode not in \('internal', 'both'\)/);
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
  assert.doesNotMatch(pageStyles, /\.branch-commerce-fields/);
  assert.match(pageStyles, /\.branch-location-picker/);
  assert.match(pageStyles, /\.branch-map-preview iframe/);
  assert.match(pageStyles, /\.location-address-row/);
  assert.match(pageStyles, /\.company-availability-panel/);
  assert.match(pageStyles, /\.availability-branch-row/);
  assert.match(pageStyles, /\.availability-switch\.active/);
  assert.match(pageStyles, /aspect-ratio: 4 \/ 5/);
  assert.match(headers, /Permissions-Policy: geolocation=\(self\)/);
  assert.match(worker, /headers\.set\("Permissions-Policy", "geolocation=\(self\)"\)/);
  assert.match(adminPage, /Supabase não configurado neste computador/);
  assert.match(adminPage, /captureBranchLocation/);
  assert.match(adminPage, /async function validateBranchAddress/);
  assert.match(adminPage, /function findAddressOnOpenStreetMap/);
  assert.match(adminPage, /nominatim\.openstreetmap\.org\/search/);
  assert.match(adminPage, /nominatim\.openstreetmap\.org\/reverse/);
  assert.match(adminPage, /function BranchLocationPicker/);
  assert.match(adminPage, /Validar endereço/);
  assert.match(adminPage, /Usar localização atual/);
  assert.match(adminPage, /openstreetmap\.org\/export\/embed\.html/);
  assert.doesNotMatch(adminPage, />Latitude<input/);
  assert.doesNotMatch(adminPage, />Longitude<input/);
  assert.match(adminPage, /async function saveBranchDetails/);
  assert.match(adminPage, /if \(!address\)/);
  assert.match(adminPage, /Use a localização atual ou valide o endereço antes de salvar/);
  assert.doesNotMatch(adminPage, /address\.trim\(\)\.length < 5/);
  assert.match(adminPage, /function BranchDetailsEditor/);
  assert.match(adminPage, /function BranchCoverNoteEditor/);
  assert.match(adminPage, /Descrição abaixo da capa/);
  assert.doesNotMatch(adminPage, /COVER_NOTE_POSITIONS/);
  assert.doesNotMatch(adminPage, /Escolha a posição/);
  assert.match(adminPage, /cover_note: branchDetailsForm\.coverNote\.trim\(\) \|\| null/);
  assert.match(pageStyles, /\.branch-cover-note-preview/);
  assert.match(adminPage, /Dados da filial/);
  assert.match(adminPage, /Filial ativa no catálogo público/);
  assert.doesNotMatch(adminPage, />Pedido mínimo<input/);
  assert.doesNotMatch(adminPage, />Taxa de entrega<input/);
  assert.doesNotMatch(adminPage, />Prazo de entrega<input/);
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
  assert.match(createCompanyFunction, /whatsapp_phone, address, cover_image_url, cover_note, cover_note_position, latitude, longitude, minimum_order, delivery_fee, delivery_time_label, is_active/);
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
  assert.match(adminPage, /async function deleteCategory/);
  assert.match(adminPage, /A categoria \$\{category\.name\} possui \$\{localProductCount\} produto/);
  assert.match(adminPage, /select\("id", \{ count: "exact", head: true \}\)/);
  assert.match(adminPage, /disabled=\{!canDelete \|\| Boolean\(deletingCategoryId\)\}/);
  assert.match(adminPage, /category-delete-button/);
  assert.match(adminPage, /workbook\.addWorksheet\("Categorias"/);
  assert.match(adminPage, /name: EXCEL_CATEGORY_TABLE_NAME/);
  assert.match(adminPage, /workbook\.addWorksheet\("Unidades"/);
  assert.match(adminPage, /EXCEL_MEASUREMENT_UNIT_TABLE_NAME/);
  assert.match(adminPage, /async function createMeasurementUnit/);
  assert.match(adminPage, /measurement_units/);
  assert.match(adminPage, /function readableMeasurementUnitError/);
  assert.match(adminPage, /Execute a migration 016_measurement_units\.sql/);
  assert.match(adminPage, /isMeasurementUnitsUnavailable\(error\)/);
  assert.match(adminPage, /async function refreshMeasurementUnitUsage/);
  assert.match(adminPage, /measurementUnitUsageReady/);
  assert.match(adminPage, /produtos vinculados/);
  assert.match(adminPage, /disabled=\{!canDelete \|\| Boolean\(deletingMeasurementUnitId\)\}/);
  assert.match(adminPage, /<label>Unidade<select/);
  assert.match(adminPage, /measurementUnitCode\.trim\(\)\.toUpperCase\(\)/);
  assert.match(adminPage, /setMeasurementUnitCode\(event\.target\.value\.toUpperCase\(\)\)/);
  assert.match(adminPage, /unit\.code\.toUpperCase\(\)/);
  assert.match(adminPage, /Código<input/);
  assert.match(adminPage, /Nome da unidade<input/);
  assert.match(adminPage, /function addExcelRangeValidation/);
  assert.match(adminPage, /dataValidations\.add\(address, validation\)/);
  assert.match(adminPage, /INDIRECT\("\$\{EXCEL_CATEGORY_TABLE_NAME\}\[Categoria\]\"\)/);
  assert.match(adminPage, /Categoria inválida/);
  assert.match(adminPage, /categoria \"\$\{category\}\" não cadastrada na aba Categorias/);
  assert.match(adminPage, /productsSheet\.addRows\(exportProducts\.map/);
  assert.match(adminPage, /function catalogImportHeaders/);
  assert.match(adminPage, /header !== "Estoque"/);
  assert.match(adminPage, /"Produto", "Status", "Descrição"/);
  assert.match(adminPage, /PRODUCT_STATUS_OPTIONS = \["Ativo", "Desativado"\]/);
  assert.match(adminPage, /formatMoneyInput/);
  assert.match(adminPage, /OPTION_IMPORT_HEADERS/);
  assert.match(adminPage, /function readableCatalogError/);
  assert.match(adminPage, /Execute a migration 015_product_option_groups\.sql/);
  assert.match(adminPage, /workbook\.getWorksheet\("Opcionais"\)/);
  assert.match(adminPage, /INDIRECT\("'Produtos'!\$B\$2:\$B\$5000"\)/);
  assert.match(adminPage, /Novo grupo de adicionais/);
  assert.match(adminPage, /Grupos de adicionais/);
  assert.match(adminPage, /ADDITION_GROUP_HEADERS/);
  assert.match(adminPage, /ADDITION_GROUP_HEADERS = \["Grupo", "Obrigat\\u00f3rio", "M\\u00e1ximo", "Status", "Ordem"\]/);
  assert.match(adminPage, /ADDITION_IMPORT_HEADERS = \["Grupo", "Produto", "Adicional", "Acr\\u00e9scimo", "Status", "Ordem"\]/);
  assert.match(adminPage, /workbook\.getWorksheet\("Adicionais"\)/);
  assert.match(adminPage, /max_selections: group\.max/);
  assert.doesNotMatch(adminPage, /ADDITION_IMPORT_HEADERS = \["Grupo", "Produto", "M\\u00e1ximo"/);
  assert.match(adminPage, /companySettingsSection === "additions"/);
  assert.match(adminPage, /createOptionGroup/);
  assert.match(adminPage, /async function resolveBranchControlsStock/);
  assert.match(adminPage, /storeParameterResult\.data\?\.parameter_value \?\? tenantParameterResult\.data\?\.parameter_value/);
  assert.match(adminPage, /const controlsStock = await resolveBranchControlsStock\(activeBranchId\)/);
  assert.match(adminPage, /const exportHeaders = catalogImportHeaders\(controlsStock\)/);
  assert.match(adminPage, /productsSheet\.addRow\(exportHeaders\)/);
  assert.match(adminPage, /if \(controlsStock\) instructionRows\.splice/);
  assert.match(adminPage, /activeControlsStock \? <label>Estoque/);
  assert.match(adminPage, /controlsStock \? \{ stock_quantity: row\.stock \} : \{\}/);
  assert.match(adminPage, /listsSheet\.state = "veryHidden"/);
  assert.match(adminPage, /addExcelRangeValidation\(productsSheet/);
  assert.match(adminPage, /formulae: \["'Listas'!\$A\$1:\$A\$2"\]/);
  assert.match(adminPage, /is_active: row\.isActive/);
  assert.match(adminPage, /status inválido; use Ativo ou Desativado/);
  assert.match(adminPage, /const \[categoryResult, productResult, measurementUnitResult\] = await Promise\.all/);
  const downloadCatalogSource = adminPage.slice(
    adminPage.indexOf("async function downloadCatalogTemplate"),
    adminPage.indexOf("async function importCatalog"),
  );
  const exportedProductQuery = downloadCatalogSource.slice(
    downloadCatalogSource.indexOf('.from("products")'),
    downloadCatalogSource.indexOf('.from("measurement_units")'),
  );
  assert.doesNotMatch(exportedProductQuery, /\.eq\("is_active", true\)/);
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
  assert.match(adminPage, /updated_at, product_images/);
  assert.match(adminPage, /function formatAdminProductUpdatedAt/);
  assert.match(adminPage, /className="product-admin-updated"/);
  assert.match(pageStyles, /\.product-admin-updated/);
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
  assert.match(adminPage, /let uploadedPath = ""/);
  assert.doesNotMatch(adminPage, /const uploadedPaths: string\[\] = \[\];\s*try \{\s*let profileImageUrl/);
  assert.match(adminPage, /select\("id, is_active, theme_color, profile_image_url"\)\s*\.single\(\)/);
  assert.match(adminPage, /companyIdentityFeedback/);
  assert.match(adminPage, /identity-save-feedback/);
  assert.match(adminPage, /salva com sucesso/);
  assert.match(adminPage, /async function updateCompanyAvailability/);
  assert.match(adminPage, /async function updateBranchAvailability/);
  assert.match(adminPage, /function CompanyAvailabilityPanel/);
  assert.match(adminPage, /function AvailabilitySwitch/);
  assert.match(adminPage, /A empresa inteira está oculta, incluindo todas as filiais/);
  assert.match(adminPage, /As configurações individuais abaixo serão preservadas/);
  assert.match(adminPage, /Disponibilidade pública/);
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
  assert.match(companyBrandingSql, /and s\.is_active/);
  assert.match(companyBrandingSql, /and t\.is_active/);
  assert.match(companyBrandingSql, /platform admins update company identity/);
  assert.match(branchManagementSql, /company members read own stores/);
  assert.match(branchManagementSql, /using \(public\.can_manage_store\(id\)\)/);
  assert.match(branchManagementSql, /company members update own stores/);
  assert.match(branchManagementSql, /with check \(public\.can_manage_store\(id\)\)/);
  assert.match(branchManagementSql, /create or replace function public\.get_company_workspace/);
  assert.match(branchManagementSql, /'minimum_order', s\.minimum_order/);
  assert.match(branchManagementSql, /'is_active', s\.is_active/);
  assert.match(branchCoverNotesSql, /add column if not exists cover_note/);
  assert.match(branchCoverNotesSql, /add column if not exists cover_note_position/);
  assert.match(branchCoverNotesSql, /stores_cover_note_length_check/);
  assert.match(branchCoverNotesSql, /'cover_note_position', s\.cover_note_position/);
  assert.match(productOptionGroupsSql, /create table if not exists public\.option_groups/);
  assert.match(productOptionGroupsSql, /create table if not exists public\.option_group_items/);
  assert.match(productOptionGroupsSql, /create table if not exists public\.product_option_groups/);
  assert.match(productOptionGroupsSql, /public can read active option groups/);
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
  assert.match(schema, /create table public\.measurement_units/);
  const measurementUnitsSql = await readFile(new URL("supabase/016_measurement_units.sql", projectRoot), "utf8");
  assert.match(measurementUnitsSql, /create table if not exists public\.measurement_units/);
  assert.match(measurementUnitsSql, /unique \(tenant_id, code\)/);
  assert.match(measurementUnitsSql, /members can manage measurement units/);
  assert.match(measurementUnitsSql, /normalize_measurement_unit_code/);
  const uppercaseMeasurementUnitsSql = await readFile(new URL("supabase/018_uppercase_measurement_unit_codes.sql", projectRoot), "utf8");
  assert.match(uppercaseMeasurementUnitsSql, /set code = upper\(trim\(code\)\)/);
  assert.match(uppercaseMeasurementUnitsSql, /add constraint measurement_units_code_check/);
  const protectedMeasurementUnitsSql = await readFile(new URL("supabase/019_protect_linked_measurement_units.sql", projectRoot), "utf8");
  assert.match(protectedMeasurementUnitsSql, /prevent_linked_measurement_unit_delete/);
  assert.match(protectedMeasurementUnitsSql, /from public\.tenants t/);
  assert.match(protectedMeasurementUnitsSql, /join public\.stores s on s\.id = p\.store_id/);
  assert.match(protectedMeasurementUnitsSql, /s\.tenant_id = old\.tenant_id/);
  assert.match(protectedMeasurementUnitsSql, /before delete on public\.measurement_units/);
  assert.match(protectedMeasurementUnitsSql, /errcode = '23503'/);
  assert.match(viteConfig, /catalog-page\.js/);
  assert.match(viteConfig, /chunkFileNames: stableEntryName/);
  assert.match(viteConfig, /cssCodeSplit: false/);
  assert.match(headers, /Cache-Control: no-cache, must-revalidate/);
  assert.ok(legacyCatalogBundle.length > 30000);
  assert.ok(legacyStyles.length > 30000);
});

test("preserves the category dropdown when writing the Excel catalog", async () => {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const categoriesSheet = workbook.addWorksheet("Categorias");
  categoriesSheet.addTable({
    name: "CatalogCategories",
    ref: "A1",
    headerRow: true,
    totalsRow: false,
    columns: [{ name: "Categoria" }, { name: "Ordem" }],
    rows: [["Bebidas", 0]],
  });
  const productsSheet = workbook.addWorksheet("Produtos");
  productsSheet.dataValidations.add("A2:A1001", {
    type: "list",
    allowBlank: true,
    formulae: ['INDIRECT("CatalogCategories[Categoria]")'],
  });
  assert.equal(productsSheet.rowCount, 0);

  const savedWorkbook = new ExcelJS.Workbook();
  await savedWorkbook.xlsx.load(await workbook.xlsx.writeBuffer());

  assert.deepEqual(
    savedWorkbook.getWorksheet("Produtos").getCell("A2").dataValidation.formulae,
    ['INDIRECT("CatalogCategories[Categoria]")'],
  );
  assert.deepEqual(
    savedWorkbook.getWorksheet("Produtos").getCell("A1001").dataValidation.formulae,
    ['INDIRECT("CatalogCategories[Categoria]")'],
  );
  assert.ok(savedWorkbook.getWorksheet("Categorias").getTable("CatalogCategories"));
  assert.equal(savedWorkbook.getWorksheet("Categorias").getCell("A2").value, "Bebidas");
});
