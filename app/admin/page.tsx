"use client";

import {
  ArrowLeft,
  Building2,
  Download,
  FileSpreadsheet,
  LogOut,
  Plus,
  RefreshCw,
  Save,
  Settings,
  Store,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { supabase } from "../../lib/supabase";

type Tenant = { id: string; name: string; slug: string };
type Branch = { id: string; name: string; slug: string; tenant_id: string };
type Category = { id: string; name: string; sort_order: number };
type Product = {
  id: string;
  external_id: string | null;
  name: string;
  description: string | null;
  price: number;
  unit: string | null;
  stock_quantity: number | null;
  image_url: string | null;
  badge: string | null;
  category_id: string | null;
  is_active: boolean;
};

type CatalogImportRow = {
  rowNumber: number;
  category: string;
  name: string;
  description: string | null;
  price: number;
  unit: string | null;
  stock: number | null;
  imageUrl: string | null;
  badge: string | null;
  sku: string | null;
};

const ADMIN_EMAILS = ["luidy123neres@gmail.com"];
const IMPORT_HEADERS = ["Categoria", "Produto", "Descrição", "Preço", "Unidade", "Estoque", "URL da imagem", "Selo", "Código/SKU"] as const;
const REQUIRED_IMPORT_HEADERS = ["Categoria", "Produto", "Preço"] as const;

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function excelValueToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (value instanceof Date) return value.toLocaleDateString("pt-BR");
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.result !== undefined) return excelValueToText(record.result);
    if (record.text !== undefined) return excelValueToText(record.text);
    if (Array.isArray(record.richText)) {
      return record.richText
        .map((part) => typeof part === "object" && part !== null && "text" in part ? String((part as { text: unknown }).text) : "")
        .join("")
        .trim();
    }
  }
  return String(value).trim();
}

function parseBrazilianNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : Number.NaN;
  const text = excelValueToText(value).replace(/R\$/gi, "").replace(/\s/g, "");
  if (!text) return Number.NaN;
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  return Number(normalized);
}

function chunkRows<T>(rows: T[], size = 200) {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) chunks.push(rows.slice(index, index + size));
  return chunks;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function AdminPage() {
  const isCompanyPortal = typeof window !== "undefined" && window.location.pathname === "/empresa";
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [adminTenants, setAdminTenants] = useState<Tenant[]>([]);
  const [adminBranches, setAdminBranches] = useState<Branch[]>([]);
  const [adminSection, setAdminSection] = useState<"companies" | "new" | "catalog" | "settings">("companies");
  const [activeBranchId, setActiveBranchId] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [message, setMessage] = useState("");
  const [companyForm, setCompanyForm] = useState({ name: "", branch: "", phone: "", address: "", userName: "", userEmail: "", userPassword: "" });
  const [branchForm, setBranchForm] = useState({ name: "", phone: "", address: "" });
  const [showBranchForm, setShowBranchForm] = useState(false);
  const [savingBranch, setSavingBranch] = useState(false);
  const [accessForm, setAccessForm] = useState({ name: "", email: "", password: "" });
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [savingAccess, setSavingAccess] = useState(false);
  const [showDeleteCompany, setShowDeleteCompany] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletingCompany, setDeletingCompany] = useState(false);
  const [importingCatalog, setImportingCatalog] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [categoryName, setCategoryName] = useState("");
  const [productForm, setProductForm] = useState({
    name: "",
    description: "",
    price: "",
    unit: "unidade",
    stock: "",
    image: "",
    badge: "",
    categoryId: "",
  });
  const [accessDenied, setAccessDenied] = useState(false);

  async function loadWorkspace(userId: string, preferredTenantId?: string) {
    if (!supabase) return;
    if (isCompanyPortal) {
      const { data: workspace } = await supabase.functions.invoke("create-store-user", {
        body: { action: "get-company-workspace" },
      });
      if (workspace?.tenant && workspace?.branches?.length) {
        const portalBranches = workspace.branches as Branch[];
        setTenant(workspace.tenant as Tenant);
        setBranches(portalBranches);
        setActiveBranchId((current) => current && portalBranches.some((branch) => branch.id === current) ? current : portalBranches[0].id);
        setMessage("");
        setLoading(false);
        return;
      }

      const { data: databaseWorkspace } = await supabase.rpc("get_company_workspace");
      if (databaseWorkspace?.tenant && databaseWorkspace?.branches?.length) {
        const portalBranches = databaseWorkspace.branches as Branch[];
        setTenant(databaseWorkspace.tenant as Tenant);
        setBranches(portalBranches);
        setActiveBranchId((current) => current && portalBranches.some((branch) => branch.id === current) ? current : portalBranches[0].id);
        setMessage("");
        setLoading(false);
        return;
      }

      const { data: memberships, error: membershipError } = await supabase
        .from("tenant_members")
        .select("tenant_id, role")
        .eq("user_id", userId)
        .in("role", ["manager", "staff"])
        .order("created_at", { ascending: true });
      const tenantId = memberships?.[0]?.tenant_id;
      const [{ data: portalTenant, error: tenantError }, { data: portalBranches, error: branchError }] = tenantId
        ? await Promise.all([
            supabase.from("tenants").select("id, name, slug").eq("id", tenantId).single(),
            supabase.from("stores").select("id, name, slug, tenant_id").eq("tenant_id", tenantId).order("created_at", { ascending: true }),
          ])
        : [{ data: null, error: null }, { data: null, error: null }];
      if (!portalTenant || !portalBranches?.length) {
        setTenant(null);
        setBranches([]);
        setMessage(membershipError?.message ?? tenantError?.message ?? branchError?.message ?? databaseWorkspace?.error ?? workspace?.error ?? "Este login não está vinculado a uma empresa.");
        setLoading(false);
        return;
      }
      setTenant(portalTenant as Tenant);
      setBranches(portalBranches as Branch[]);
      setActiveBranchId((portalBranches as Branch[])[0].id);
      setLoading(false);
      return;
    }
    const { data: memberships, error: membershipError } = await supabase
      .from("tenant_members")
      .select("tenant_id, role")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (membershipError || !memberships?.length) {
      setTenant(null);
      setBranches([]);
      setLoading(false);
      return;
    }

    const tenantIds = memberships.map((membership) => membership.tenant_id as string);
    const tenantId = (preferredTenantId ?? tenantIds[0]) as string;
    if (!memberships.some((membership) => membership.tenant_id === tenantId)) {
      setTenant(null);
      setBranches([]);
      setMessage("Esta empresa foi criada por outro usuário. Entre com o e-mail que a criou ou peça para um administrador vincular seu acesso.");
      setLoading(false);
      return;
    }
    const [{ data: tenantRows }, { data: allBranchRows }] = await Promise.all([
      supabase.from("tenants").select("id, name, slug").in("id", tenantIds).order("created_at", { ascending: true }),
      supabase
        .from("stores")
        .select("id, name, slug, tenant_id")
        .in("tenant_id", tenantIds)
        .order("created_at", { ascending: true }),
    ]);

    const nextTenants = (tenantRows ?? []) as Tenant[];
    const allBranches = (allBranchRows ?? []) as Branch[];
    setAdminTenants(nextTenants);
    setAdminBranches(allBranches);
    const tenantRow = nextTenants.find((item) => item.id === tenantId) ?? null;
    setTenant(tenantRow);
    const nextBranches = allBranches.filter((branch) => branch.tenant_id === tenantId);
    setBranches(nextBranches);
    setActiveBranchId((current) =>
      current && nextBranches.some((branch) => branch.id === current)
        ? current
        : nextBranches[0]?.id ?? "",
    );
    setLoading(false);
  }

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user.id && (isCompanyPortal || ADMIN_EMAILS.includes(data.session.user.email?.toLowerCase() ?? ""))) void loadWorkspace(data.session.user.id);
      else if (data.session) {
        setAccessDenied(true);
        setLoading(false);
        void supabase.auth.signOut();
      }
      else setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (nextSession && !isCompanyPortal && !ADMIN_EMAILS.includes(nextSession.user.email?.toLowerCase() ?? "")) {
        setAccessDenied(true);
        setLoading(false);
        void supabase.auth.signOut();
        return;
      }
      setSession(nextSession);
      if (nextSession?.user.id) void loadWorkspace(nextSession.user.id);
      else setLoading(false);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  async function refreshBranchCatalog(branchId: string) {
    if (!supabase || !branchId) {
      setCategories([]);
      setProducts([]);
      return;
    }

    const [{ data: categoryRows }, { data: productRows }] = await Promise.all([
      supabase
        .from("categories")
        .select("id, name, sort_order")
        .eq("store_id", branchId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("products")
        .select("id, external_id, name, description, price, unit, stock_quantity, image_url, badge, category_id, is_active")
        .eq("store_id", branchId)
        .eq("is_active", true)
        .order("name", { ascending: true }),
    ]);

    setCategories((categoryRows ?? []) as Category[]);
    setProducts((productRows ?? []) as Product[]);
  }

  useEffect(() => {
    void refreshBranchCatalog(activeBranchId);
  }, [activeBranchId]);

  async function createCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setMessage("");
    const { data, error } = await supabase.functions.invoke("create-store-user", {
      body: {
        name: companyForm.userName.trim(),
        email: companyForm.userEmail.trim(),
        password: companyForm.userPassword,
        company: {
          name: companyForm.name.trim(),
          slug: slugify(companyForm.name),
          branch_name: companyForm.branch.trim(),
          branch_slug: slugify(companyForm.branch),
          whatsapp_phone: companyForm.phone.replace(/\D/g, ""),
          address: companyForm.address.trim(),
        },
      },
    });
    if (error || data?.error || !data?.tenant || !data?.branch) {
      setMessage(data?.error ?? error?.message ?? "Não foi possível criar a empresa e seu acesso.");
      return;
    }
    const tenantRow = data.tenant as Tenant;
    const branchRow = data.branch as Branch;
    setMessage("Empresa, filial e acesso criados. O cliente já pode entrar no Portal da empresa.");
    setTenant(tenantRow);
    setBranches([branchRow]);
    setActiveBranchId(branchRow.id);
    setAdminTenants((current) => [...current, tenantRow]);
    setAdminBranches((current) => [...current, branchRow]);
    setAdminSection("companies");
    setCompanyForm({ name: "", branch: "", phone: "", address: "", userName: "", userEmail: "", userPassword: "" });
  }

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !activeBranchId || !categoryName.trim()) return;
    const { error } = await supabase.from("categories").insert({
      store_id: activeBranchId,
      name: categoryName.trim(),
      sort_order: categories.length,
      is_active: true,
    });
    setMessage(error?.message ?? "Categoria adicionada.");
    if (!error) {
      setCategoryName("");
      await refreshBranchCatalog(activeBranchId);
    }
  }

  function openAdminCatalog(tenantId: string) {
    const selectedTenant = adminTenants.find((item) => item.id === tenantId) ?? null;
    const selectedBranches = adminBranches.filter((branch) => branch.tenant_id === tenantId);
    setTenant(selectedTenant);
    setBranches(selectedBranches);
    setActiveBranchId(selectedBranches[0]?.id ?? "");
    setShowBranchForm(false);
    setAdminSection("catalog");
  }

  async function openCompanySettings(tenantId: string) {
    if (!supabase) return;
    const selectedTenant = adminTenants.find((item) => item.id === tenantId) ?? null;
    const selectedBranches = adminBranches.filter((branch) => branch.tenant_id === tenantId);
    setTenant(selectedTenant);
    setBranches(selectedBranches);
    setActiveBranchId(selectedBranches[0]?.id ?? "");
    setAccessForm({ name: "", email: "", password: "" });
    setShowDeleteCompany(false);
    setDeleteConfirmation("");
    setAdminSection("settings");
    setLoadingSettings(true);
    setMessage("");

    const { data, error } = await supabase.functions.invoke("create-store-user", {
      body: { action: "get-company-settings", tenant_id: tenantId },
    });
    setLoadingSettings(false);
    if (error || data?.error) {
      setMessage(data?.error ?? error?.message ?? "Não foi possível carregar as configurações da empresa.");
      return;
    }
    setAccessForm({
      name: data?.account?.name ?? "",
      email: data?.account?.email ?? "",
      password: "",
    });
  }

  async function saveCompanyAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !tenant || savingAccess) return;
    setSavingAccess(true);
    setMessage("");
    const { data, error } = await supabase.functions.invoke("create-store-user", {
      body: {
        action: "update-company-access",
        tenant_id: tenant.id,
        name: accessForm.name.trim(),
        email: accessForm.email.trim(),
        password: accessForm.password,
      },
    });
    setSavingAccess(false);
    if (error || data?.error || !data?.account) {
      setMessage(data?.error ?? error?.message ?? "Não foi possível atualizar o acesso da empresa.");
      return;
    }
    setAccessForm({ name: data.account.name, email: data.account.email, password: "" });
    setMessage("Acesso atualizado. A empresa já pode entrar com as novas credenciais.");
  }

  async function deleteCompany() {
    if (!supabase || !tenant || deletingCompany || deleteConfirmation.trim() !== tenant.name) return;
    const deletedTenantId = tenant.id;
    const deletedTenantName = tenant.name;
    setDeletingCompany(true);
    setMessage("");
    const { data, error } = await supabase.functions.invoke("create-store-user", {
      body: {
        action: "delete-company",
        tenant_id: deletedTenantId,
        confirmation: deleteConfirmation.trim(),
      },
    });
    setDeletingCompany(false);
    if (error || data?.error || !data?.deleted) {
      setMessage(data?.error ?? error?.message ?? "Não foi possível excluir a empresa.");
      return;
    }

    setAdminTenants((current) => current.filter((item) => item.id !== deletedTenantId));
    setAdminBranches((current) => current.filter((branch) => branch.tenant_id !== deletedTenantId));
    setTenant(null);
    setBranches([]);
    setActiveBranchId("");
    setShowDeleteCompany(false);
    setDeleteConfirmation("");
    setAdminSection("companies");
    setMessage(data.warning ?? `Empresa ${deletedTenantName} e todos os seus dados foram excluídos.`);
  }

  async function createBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !tenant || savingBranch) return;

    const phone = branchForm.phone.replace(/\D/g, "");
    if (phone.length < 10) {
      setMessage("Informe um WhatsApp válido para a filial.");
      return;
    }

    setSavingBranch(true);
    setMessage("");
    const { data: sourceBranch } = await supabase
      .from("stores")
      .select("segment")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const { data, error } = await supabase
      .from("stores")
      .insert({
        tenant_id: tenant.id,
        name: branchForm.name.trim(),
        slug: slugify(branchForm.name),
        segment: sourceBranch?.segment ?? "retail",
        whatsapp_phone: phone,
        address: branchForm.address.trim(),
        is_active: true,
      })
      .select("id, name, slug, tenant_id")
      .single();

    setSavingBranch(false);
    if (error || !data) {
      setMessage(error?.code === "23505" ? "Já existe uma filial com esse nome nesta empresa." : error?.message ?? "Não foi possível criar a filial.");
      return;
    }

    const branchRow = data as Branch;
    setBranches((current) => [...current, branchRow]);
    setAdminBranches((current) => [...current, branchRow]);
    setActiveBranchId(branchRow.id);
    setBranchForm({ name: "", phone: "", address: "" });
    setShowBranchForm(false);
    setMessage("Nova filial criada. Ela já está disponível no Portal da empresa.");
  }

  async function downloadCatalogTemplate() {
    setMessage("");
    try {
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Catálogo Fácil";
      workbook.created = new Date();

      const productsSheet = workbook.addWorksheet("Produtos", {
        views: [{ state: "frozen", ySplit: 1 }],
      });
      productsSheet.addRow([...IMPORT_HEADERS]);
      productsSheet.columns = [
        { width: 24 },
        { width: 32 },
        { width: 48 },
        { width: 14 },
        { width: 16 },
        { width: 14 },
        { width: 48 },
        { width: 20 },
        { width: 20 },
      ];
      productsSheet.autoFilter = { from: "A1", to: "I1" };
      productsSheet.getRow(1).height = 25;
      productsSheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF176B52" } };
        cell.alignment = { vertical: "middle" };
      });
      productsSheet.getColumn(4).numFmt = 'R$ #,##0.00';
      productsSheet.getColumn(6).numFmt = "0.000";
      productsSheet.getColumn(9).numFmt = "@";

      const instructionsSheet = workbook.addWorksheet("Instruções");
      instructionsSheet.columns = [{ width: 24 }, { width: 88 }];
      instructionsSheet.addRows([
        ["Campo", "Preenchimento"],
        ["Categoria", "Obrigatório. Se ainda não existir na filial, será criada automaticamente."],
        ["Produto", "Obrigatório. Nome exibido no catálogo."],
        ["Descrição", "Opcional."],
        ["Preço", "Obrigatório. Aceita 12,50 ou 12.50."],
        ["Unidade", "Opcional. Exemplos: unidade, caixa, kg, metro."],
        ["Estoque", "Opcional. Aceita números inteiros ou decimais."],
        ["URL da imagem", "Opcional. Endereço público da imagem do produto."],
        ["Selo", "Opcional. Exemplo: Mais vendido."],
        ["Código/SKU", "Opcional e recomendado. Ao importar novamente o mesmo código, o produto será atualizado."],
        ["Importação", "Somente a aba Produtos é importada. Não altere o nome dessa aba nem os títulos das colunas."],
      ]);
      instructionsSheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF176B52" } };
      });
      instructionsSheet.eachRow((row) => {
        row.alignment = { vertical: "top", wrapText: true };
      });

      const exampleSheet = workbook.addWorksheet("Exemplo", {
        views: [{ state: "frozen", ySplit: 1 }],
      });
      exampleSheet.addRows([
        [...IMPORT_HEADERS],
        ["Pizzas", "Pizza Calabresa", "Molho, queijo, calabresa e cebola", 49.9, "unidade", 20, "https://exemplo.com/pizza.jpg", "Mais vendido", "PIZ-001"],
        ["Bebidas", "Refrigerante 2 L", "Garrafa retornável", 12, "unidade", 35, "", "", "BEB-001"],
      ]);
      exampleSheet.columns = productsSheet.columns.map((column) => ({ width: column.width }));
      exampleSheet.autoFilter = { from: "A1", to: "I1" };
      exampleSheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF176B52" } };
      });
      exampleSheet.getColumn(4).numFmt = 'R$ #,##0.00';

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `modelo-catalogo-${slugify(activeBranch?.name ?? "filial")}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage("Modelo Excel baixado.");
    } catch (error) {
      setMessage(error instanceof Error ? `Não foi possível gerar o modelo: ${error.message}` : "Não foi possível gerar o modelo Excel.");
    }
  }

  async function importCatalog(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !supabase || !activeBranchId || importingCatalog) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setMessage("Selecione uma planilha no formato .xlsx.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setMessage("A planilha deve ter no máximo 10 MB.");
      return;
    }

    const branchId = activeBranchId;
    setImportingCatalog(true);
    setMessage("Validando a planilha...");
    try {
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const sheet = workbook.getWorksheet("Produtos");
      if (!sheet) throw new Error('A planilha precisa ter uma aba chamada "Produtos".');

      const headerColumns = new Map<string, number>();
      sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, columnNumber) => {
        const header = normalizeText(excelValueToText(cell.value));
        if (header) headerColumns.set(header, columnNumber);
      });
      const missingHeaders = REQUIRED_IMPORT_HEADERS.filter((header) => !headerColumns.has(normalizeText(header)));
      if (missingHeaders.length) throw new Error(`Colunas obrigatórias ausentes: ${missingHeaders.join(", ")}.`);

      const columnValue = (rowNumber: number, header: (typeof IMPORT_HEADERS)[number]) => {
        const columnNumber = headerColumns.get(normalizeText(header));
        return columnNumber ? sheet.getRow(rowNumber).getCell(columnNumber).value : null;
      };
      const importedRows: CatalogImportRow[] = [];
      const validationErrors: string[] = [];
      const usedSkus = new Set<string>();

      for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
        const values = IMPORT_HEADERS.map((header) => columnValue(rowNumber, header));
        if (values.every((value) => !excelValueToText(value))) continue;

        const category = excelValueToText(columnValue(rowNumber, "Categoria"));
        const name = excelValueToText(columnValue(rowNumber, "Produto"));
        const price = parseBrazilianNumber(columnValue(rowNumber, "Preço"));
        const stockText = excelValueToText(columnValue(rowNumber, "Estoque"));
        const stock = stockText ? parseBrazilianNumber(columnValue(rowNumber, "Estoque")) : null;
        const skuText = excelValueToText(columnValue(rowNumber, "Código/SKU"));
        const sku = skuText ? skuText.toUpperCase() : null;

        if (!category) validationErrors.push(`linha ${rowNumber}: categoria vazia`);
        if (!name) validationErrors.push(`linha ${rowNumber}: produto vazio`);
        if (!Number.isFinite(price) || price < 0) validationErrors.push(`linha ${rowNumber}: preço inválido`);
        if (stock !== null && (!Number.isFinite(stock) || stock < 0)) validationErrors.push(`linha ${rowNumber}: estoque inválido`);
        if (sku && usedSkus.has(normalizeText(sku))) validationErrors.push(`linha ${rowNumber}: Código/SKU repetido (${sku})`);
        if (sku) usedSkus.add(normalizeText(sku));

        importedRows.push({
          rowNumber,
          category,
          name,
          description: excelValueToText(columnValue(rowNumber, "Descrição")) || null,
          price,
          unit: excelValueToText(columnValue(rowNumber, "Unidade")) || null,
          stock,
          imageUrl: excelValueToText(columnValue(rowNumber, "URL da imagem")) || null,
          badge: excelValueToText(columnValue(rowNumber, "Selo")) || null,
          sku,
        });
      }

      if (!importedRows.length) throw new Error("A aba Produtos não possui produtos preenchidos.");
      if (validationErrors.length) {
        const details = validationErrors.slice(0, 6).join("; ");
        const remaining = validationErrors.length > 6 ? `; e mais ${validationErrors.length - 6} erro(s)` : "";
        throw new Error(`Corrija a planilha antes de importar: ${details}${remaining}.`);
      }

      setMessage(`Importando ${importedRows.length} produto(s)...`);
      const { data: existingCategories, error: categoryLoadError } = await supabase
        .from("categories")
        .select("id, name, sort_order, is_active")
        .eq("store_id", branchId)
        .order("sort_order", { ascending: true });
      if (categoryLoadError) throw categoryLoadError;

      const categoryByName = new Map<string, { id: string; is_active: boolean }>();
      for (const category of existingCategories ?? []) {
        const key = normalizeText(category.name);
        if (!categoryByName.has(key)) categoryByName.set(key, { id: category.id, is_active: category.is_active });
      }

      const missingCategoryNames = new Map<string, string>();
      for (const row of importedRows) {
        const key = normalizeText(row.category);
        if (!categoryByName.has(key) && !missingCategoryNames.has(key)) missingCategoryNames.set(key, row.category);
      }
      if (missingCategoryNames.size) {
        const nextSortOrder = (existingCategories ?? []).reduce((highest, category) => Math.max(highest, category.sort_order), -1) + 1;
        const { data: createdCategories, error: categoryCreateError } = await supabase
          .from("categories")
          .insert([...missingCategoryNames.values()].map((name, index) => ({
            store_id: branchId,
            name,
            sort_order: nextSortOrder + index,
            is_active: true,
          })))
          .select("id, name, is_active");
        if (categoryCreateError) throw categoryCreateError;
        for (const category of createdCategories ?? []) categoryByName.set(normalizeText(category.name), { id: category.id, is_active: true });
      }

      const usedCategoryKeys = new Set(importedRows.map((row) => normalizeText(row.category)));
      const categoriesToReactivate = [...usedCategoryKeys]
        .map((key) => categoryByName.get(key))
        .filter((category): category is { id: string; is_active: boolean } => Boolean(category && !category.is_active))
        .map((category) => category.id);
      if (categoriesToReactivate.length) {
        const { error: reactivateError } = await supabase.from("categories").update({ is_active: true }).in("id", categoriesToReactivate);
        if (reactivateError) throw reactivateError;
      }

      const productRows = importedRows.map((row) => ({
        store_id: branchId,
        category_id: categoryByName.get(normalizeText(row.category))?.id ?? null,
        external_id: row.sku,
        name: row.name,
        description: row.description,
        price: row.price,
        unit: row.unit,
        stock_quantity: row.stock,
        image_url: row.imageUrl,
        badge: row.badge,
        is_active: true,
        updated_at: new Date().toISOString(),
      }));
      const rowsWithSku = productRows.filter((row) => row.external_id);
      const rowsWithoutSku = productRows.filter((row) => !row.external_id).map(({ external_id: _externalId, ...row }) => row);

      for (const rows of chunkRows(rowsWithSku)) {
        const { error } = await supabase.from("products").upsert(rows, { onConflict: "store_id,external_id" });
        if (error) throw error;
      }
      for (const rows of chunkRows(rowsWithoutSku)) {
        const { error } = await supabase.from("products").insert(rows);
        if (error) throw error;
      }

      await refreshBranchCatalog(branchId);
      setMessage(`${importedRows.length} produto(s) importado(s) para ${activeBranch?.name ?? "a filial"}. Categorias novas foram criadas automaticamente.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível importar a planilha.");
    } finally {
      setImportingCatalog(false);
    }
  }

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !activeBranchId) return;
    const { error } = await supabase.from("products").insert({
      store_id: activeBranchId,
      category_id: productForm.categoryId || null,
      name: productForm.name.trim(),
      description: productForm.description.trim() || null,
      price: Number(productForm.price.replace(",", ".")),
      unit: productForm.unit.trim() || null,
      stock_quantity: productForm.stock ? Number(productForm.stock.replace(",", ".")) : null,
      image_url: productForm.image.trim() || null,
      badge: productForm.badge.trim() || null,
      is_active: true,
    });
    setMessage(error?.message ?? "Produto adicionado ao catálogo.");
    if (!error) {
      setProductForm({ name: "", description: "", price: "", unit: "unidade", stock: "", image: "", badge: "", categoryId: "" });
      await refreshBranchCatalog(activeBranchId);
    }
  }

  async function deleteProduct(productId: string) {
    if (!supabase || !window.confirm("Remover este produto do catálogo?")) return;
    const { error } = await supabase.from("products").update({ is_active: false }).eq("id", productId);
    if (!error) setProducts((current) => current.filter((product) => product.id !== productId));
    setMessage(error?.message ?? "Produto removido.");
  }

  const activeBranch = useMemo(() => branches.find((branch) => branch.id === activeBranchId), [branches, activeBranchId]);

  if (loading) return <main className="admin-page"><p>Carregando painel...</p></main>;
  if (accessDenied) return <AdminDenied />;
  if (!session) return <AdminLogin />;

  return (
    <main className="admin-page">
      <header className="admin-topbar">
        <a href="/" className="admin-back"><ArrowLeft size={17} /> Catálogo público</a>
        <div className="admin-user"><span>{session.user.email}</span><button onClick={() => supabase?.auth.signOut()}><LogOut size={16} /> Sair</button></div>
      </header>
      <section className="admin-page-inner">
        <div className="admin-page-heading"><span>{isCompanyPortal ? tenant?.name ?? "Portal da empresa" : "Central dos administradores"}</span><h1>{isCompanyPortal ? "Gerencie os catálogos da sua empresa" : "Gestão do catálogo"}</h1><p>{isCompanyPortal ? "Escolha uma filial e cadastre as categorias e os produtos que serão exibidos aos clientes." : "Cadastre empresas, filiais, usuários e catálogos em um só lugar."}</p></div>

        {!isCompanyPortal ? <nav className="admin-tabs"><button className={adminSection === "companies" ? "active" : ""} onClick={() => setAdminSection("companies")}>Empresas</button><button className={adminSection === "new" ? "active" : ""} onClick={() => setAdminSection("new")}>Nova empresa</button>{adminSection === "catalog" ? <button className="active" onClick={() => setAdminSection("catalog")}>Catálogo selecionado</button> : null}{adminSection === "settings" ? <button className="active" onClick={() => setAdminSection("settings")}>Configurações</button> : null}</nav> : null}
        {!isCompanyPortal && adminSection === "companies" ? (
          <AdminCompanies tenants={adminTenants} branches={adminBranches} onNew={() => setAdminSection("new")} onOpenCatalog={openAdminCatalog} onOpenSettings={openCompanySettings} />
        ) : !tenant && isCompanyPortal ? (
          <section className="admin-form-panel access-denied-panel"><h2>Acesso da empresa não vinculado</h2><p>O login foi aceito, mas não foi encontrado o vínculo deste e-mail com uma empresa cadastrada.</p><button className="admin-primary" onClick={() => supabase?.auth.signOut()}>Sair e entrar novamente</button></section>
        ) : adminSection === "new" || !tenant ? (
          <form className="admin-form-panel" onSubmit={createCompany}>
            <h2>Nenhuma empresa vinculada a este acesso</h2>
            <p>Este e-mail é de administrador do sistema. Crie uma empresa somente se ela ainda não existir. Para editar uma empresa já criada, entre com o e-mail usado no cadastro.</p>
            <div className="admin-form-grid">
              <label>Empresa<input value={companyForm.name} onChange={(event) => setCompanyForm({ ...companyForm, name: event.target.value })} placeholder="Ex.: Material Forte" required /></label>
              <label>Primeira filial<input value={companyForm.branch} onChange={(event) => setCompanyForm({ ...companyForm, branch: event.target.value })} placeholder="Ex.: Filial Centro" required /></label>
              <label>WhatsApp<input value={companyForm.phone} onChange={(event) => setCompanyForm({ ...companyForm, phone: formatWhatsapp(event.target.value) })} placeholder="(63) 99999-9999" inputMode="tel" required /></label>
              <label>Nome do responsável<input value={companyForm.userName} onChange={(event) => setCompanyForm({ ...companyForm, userName: event.target.value })} placeholder="Nome do cliente" required /></label>
              <label>E-mail de acesso<input type="email" value={companyForm.userEmail} onChange={(event) => setCompanyForm({ ...companyForm, userEmail: event.target.value })} placeholder="cliente@empresa.com" required /></label>
              <label>Senha de acesso<input type="password" minLength={6} value={companyForm.userPassword} onChange={(event) => setCompanyForm({ ...companyForm, userPassword: event.target.value })} placeholder="Mínimo de 6 caracteres" required /></label>
              <label>Endereço<input value={companyForm.address} onChange={(event) => setCompanyForm({ ...companyForm, address: event.target.value })} placeholder="Rua e número" required /></label>
            </div>
            <button className="admin-primary" type="submit"><Plus size={17} /> Criar empresa, filial e acesso</button>
          </form>
        ) : !isCompanyPortal && adminSection === "settings" ? (
          <section className="company-settings-view"><div className="admin-list-heading"><div><span>Configurações da empresa</span><h2>{tenant.name}</h2><p>{branches.length} filial(is) vinculada(s)</p></div></div><form className="admin-form-panel company-settings-panel" onSubmit={saveCompanyAccess}><div className="branch-form-heading"><div><span>Acesso principal</span><h2>E-mail e senha da empresa</h2></div><Settings size={21} /></div>{loadingSettings ? <p className="admin-muted">Carregando configurações...</p> : <><label>Nome do responsável<input value={accessForm.name} onChange={(event) => setAccessForm({ ...accessForm, name: event.target.value })} required /></label><label>E-mail de acesso<input type="email" value={accessForm.email} onChange={(event) => setAccessForm({ ...accessForm, email: event.target.value })} required /></label><label>Nova senha<input type="password" minLength={6} value={accessForm.password} onChange={(event) => setAccessForm({ ...accessForm, password: event.target.value })} placeholder="Deixe em branco para manter a senha atual" /></label><div className="admin-form-actions"><button className="admin-primary" type="submit" disabled={savingAccess}><Save size={16} /> {savingAccess ? "Salvando..." : "Salvar acesso"}</button></div></>}</form><section className="admin-form-panel company-settings-panel danger-zone"><div><span>Zona de exclusão</span><h2>Excluir empresa</h2><p>Remove definitivamente a empresa, todas as filiais, produtos, integrações, pedidos e o acesso principal.</p></div>{showDeleteCompany ? <><label>Digite <strong>{tenant.name}</strong> para confirmar<input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} autoComplete="off" /></label><div className="admin-form-actions"><button className="admin-secondary" type="button" onClick={() => { setShowDeleteCompany(false); setDeleteConfirmation(""); }}>Cancelar</button><button className="admin-danger" type="button" disabled={deletingCompany || deleteConfirmation.trim() !== tenant.name} onClick={deleteCompany}><Trash2 size={16} /> {deletingCompany ? "Excluindo..." : "Excluir definitivamente"}</button></div></> : <button className="admin-danger" type="button" onClick={() => setShowDeleteCompany(true)}><Trash2 size={16} /> Excluir empresa</button>}</section></section>
        ) : (
          <>
            <section className="workspace-bar"><div><span>Empresa</span><strong><Building2 size={18} /> {tenant.name}</strong></div><label>Filial<select value={activeBranchId} onChange={(event) => setActiveBranchId(event.target.value)}>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><div className="workspace-actions">{!isCompanyPortal ? <button className="admin-primary" onClick={() => setShowBranchForm((current) => !current)}><Plus size={16} /> Nova filial</button> : null}<button className="admin-secondary" onClick={() => session.user.id && loadWorkspace(session.user.id, isCompanyPortal ? undefined : tenant.id)}><RefreshCw size={16} /> Atualizar</button></div></section>
            {!isCompanyPortal && showBranchForm ? <form className="admin-form-panel branch-create-panel" onSubmit={createBranch}><div className="branch-form-heading"><div><span>Nova filial</span><h2>Adicionar unidade à {tenant.name}</h2></div><button className="icon-button" type="button" title="Fechar" onClick={() => setShowBranchForm(false)}><X size={18} /></button></div><div className="admin-form-grid"><label>Nome da filial<input value={branchForm.name} onChange={(event) => setBranchForm({ ...branchForm, name: event.target.value })} placeholder="Ex.: Unidade Centro" required /></label><label>WhatsApp<input value={branchForm.phone} onChange={(event) => setBranchForm({ ...branchForm, phone: formatWhatsapp(event.target.value) })} placeholder="(63) 99999-9999" inputMode="tel" required /></label></div><label>Endereço<input value={branchForm.address} onChange={(event) => setBranchForm({ ...branchForm, address: event.target.value })} placeholder="Rua, número e bairro" required /></label><div className="admin-form-actions"><button className="admin-secondary" type="button" onClick={() => setShowBranchForm(false)}>Cancelar</button><button className="admin-primary" type="submit" disabled={savingBranch}><Plus size={16} /> {savingBranch ? "Criando..." : "Criar filial"}</button></div></form> : null}
            {activeBranch ? <p className="branch-note"><Store size={16} /> Editando: <strong>{activeBranch.name}</strong></p> : null}
            <section className="catalog-import-panel">
              <div className="catalog-import-heading"><FileSpreadsheet size={22} /><div><span>Importação por Excel</span><strong>{activeBranch?.name ?? "Selecione uma filial"}</strong></div></div>
              <div className="catalog-import-actions">
                <button className="admin-secondary" type="button" onClick={downloadCatalogTemplate} disabled={!activeBranchId || importingCatalog}><Download size={16} /> Baixar modelo</button>
                <button className="admin-primary" type="button" onClick={() => importInputRef.current?.click()} disabled={!activeBranchId || importingCatalog}><Upload size={16} /> {importingCatalog ? "Importando..." : "Importar Excel"}</button>
                <input ref={importInputRef} className="catalog-import-input" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={importCatalog} />
              </div>
            </section>
            <div className="admin-columns">
              <section className="admin-form-panel">
                <h2>Categorias</h2>
                <form className="inline-form" onSubmit={createCategory}><input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="Ex.: Material de construção" required /><button className="admin-primary" type="submit"><Plus size={16} /> Adicionar</button></form>
                <div className="admin-list">{categories.map((category) => <div className="admin-list-row" key={category.id}><span>{category.name}</span><small>{products.filter((product) => product.category_id === category.id).length} produtos</small></div>)}{!categories.length ? <p className="admin-muted">Nenhuma categoria cadastrada.</p> : null}</div>
              </section>
              <section className="admin-form-panel">
                <h2>Novo produto</h2>
                <form className="admin-product-form" onSubmit={createProduct}>
                  <label>Nome<input value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} required /></label>
                  <label>Descrição<textarea value={productForm.description} onChange={(event) => setProductForm({ ...productForm, description: event.target.value })} /></label>
                  <div className="admin-form-grid"><label>Preço<input value={productForm.price} onChange={(event) => setProductForm({ ...productForm, price: event.target.value })} placeholder="0,00" inputMode="decimal" required /></label><label>Unidade<input value={productForm.unit} onChange={(event) => setProductForm({ ...productForm, unit: event.target.value })} placeholder="unidade, caixa, kg" /></label></div>
                  <div className="admin-form-grid"><label>Estoque<input value={productForm.stock} onChange={(event) => setProductForm({ ...productForm, stock: event.target.value })} inputMode="decimal" /></label><label>Categoria<select value={productForm.categoryId} onChange={(event) => setProductForm({ ...productForm, categoryId: event.target.value })}><option value="">Sem categoria</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label></div>
                  <label>Imagem (URL)<input value={productForm.image} onChange={(event) => setProductForm({ ...productForm, image: event.target.value })} placeholder="https://..." /></label>
                  <label>Selo opcional<input value={productForm.badge} onChange={(event) => setProductForm({ ...productForm, badge: event.target.value })} placeholder="Mais vendido" /></label>
                  <button className="admin-primary" type="submit"><Plus size={16} /> Adicionar produto</button>
                </form>
              </section>
            </div>
            <section className="admin-form-panel"><h2>Produtos da filial <span className="count-badge">{products.length}</span></h2><div className="product-admin-list">{products.map((product) => <div className="product-admin-row" key={product.id}><div><strong>{product.name}</strong><small>{product.unit ?? "unidade"} · R$ {Number(product.price).toFixed(2).replace(".", ",")}</small></div><button title="Remover produto" onClick={() => deleteProduct(product.id)}><Trash2 size={17} /></button></div>)}{!products.length ? <p className="admin-muted">Nenhum produto ainda. Use o formulário acima para começar.</p> : null}</div></section>
          </>
        )}
        {message ? <p className="admin-message">{message}</p> : null}
      </section>
    </main>
  );
}

function AdminCompanies({
  tenants,
  branches,
  onNew,
  onOpenCatalog,
  onOpenSettings,
}: {
  tenants: Tenant[];
  branches: Branch[];
  onNew: () => void;
  onOpenCatalog: (tenantId: string) => void;
  onOpenSettings: (tenantId: string) => void;
}) {
  return <section className="admin-company-list"><div className="admin-list-heading"><div><span>Empresas cadastradas</span><h2>Escolha uma empresa para administrar</h2></div><button className="admin-primary" onClick={onNew}><Plus size={16} /> Nova empresa</button></div>{tenants.map((item) => <article className="company-admin-card" key={item.id}><div className="company-admin-info"><strong>{item.name}</strong><small>{branches.filter((branch) => branch.tenant_id === item.id).length} filial(is)</small></div><div className="company-card-actions"><button className="icon-button" title={`Configurações de ${item.name}`} aria-label={`Configurações de ${item.name}`} onClick={() => onOpenSettings(item.id)}><Settings size={18} /></button><button className="admin-primary" onClick={() => onOpenCatalog(item.id)}>Abrir catálogo</button></div></article>)}{!tenants.length ? <div className="admin-form-panel"><p className="admin-muted">Nenhuma empresa cadastrada ainda.</p><button className="admin-primary" onClick={onNew}><Plus size={16} /> Cadastrar primeira empresa</button></div> : null}</section>;
}

function AdminLogin() {
  const isCompanyPortal = typeof window !== "undefined" && window.location.pathname === "/empresa";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) setMessage(result.error.message);
  }

  return <main className="admin-page"><section className="admin-login-card"><Building2 size={28} /><span>{isCompanyPortal ? "Portal da empresa" : "Central dos administradores"}</span><h1>Entrar</h1><form onSubmit={submit}><label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Senha<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} required /></label>{message ? <p className="admin-message">{message}</p> : null}<button className="admin-primary" type="submit">Entrar</button></form><a className="admin-link" href="/empresa">Entrar como empresa</a><a className="admin-link" href="/acesso">Voltar às opções de acesso</a></section></main>;
}

function AdminDenied() {
  return <main className="admin-page"><section className="admin-login-card"><Building2 size={28} /><span>Central dos administradores</span><h1>Acesso não autorizado</h1><p className="admin-message">Este usuário pertence a uma empresa e não pode acessar a Central dos administradores.</p><a className="admin-primary" href="/empresa">Ir para o portal da empresa</a><a className="admin-link" href="/acesso">Voltar às opções de acesso</a></section></main>;
}

export default AdminPage;

function formatWhatsapp(value: string) {
  const digits = value.replace(/\D/g, "").replace(/^55/, "").slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : "";
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}
