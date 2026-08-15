"use client";

import {
  ArrowLeft,
  Building2,
  ChevronRight,
  Download,
  FileSpreadsheet,
  ImagePlus,
  Images,
  KeyRound,
  LayoutDashboard,
  LocateFixed,
  LogOut,
  MapPin,
  Package,
  Palette,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Save,
  Search,
  Settings,
  SlidersHorizontal,
  Store,
  Trash2,
  TriangleAlert,
  Truck,
  Upload,
  X,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent } from "react";
import { supabase } from "../../lib/supabase";

type Tenant = { id: string; name: string; slug: string; is_active?: boolean; theme_color?: string; profile_image_url?: string | null };
type Branch = { id: string; name: string; slug: string; tenant_id: string; address?: string | null; cover_image_url?: string | null; latitude?: number | null; longitude?: number | null; delivery_fee?: number | null };
type ProductImage = { id: string; image_url: string; sort_order: number };
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
  product_images?: ProductImage[];
};

type CatalogImportRow = {
  rowNumber: number;
  category: string;
  name: string;
  description: string | null;
  price: number;
  unit: string | null;
  stock: number | null;
  badge: string | null;
  sku: string | null;
};

type CatalogImportCategory = {
  name: string;
  sortOrder: number | null;
};

type CatalogEditorMode = "product" | "category";
type FreightParameterMode = "inherit" | "enabled" | "disabled";
type CatalogLayout = "horizontal" | "showcase";
type BranchCatalogLayoutMode = "inherit" | CatalogLayout;
type ProductImageLimitMode = "inherit" | number;
type CompanySettingsSection = "overview" | "identity" | "access" | "parameters" | "danger";
type ParameterScope = "company" | "branch";
type BranchLocationTarget = "company" | "branch" | "existing";
type LocationIssue = { target: BranchLocationTarget; message: string };

const FREIGHT_PARAMETER_KEY = "calculate_delivery_fee";
const CATALOG_LAYOUT_PARAMETER_KEY = "catalog_layout";
const PRODUCT_IMAGE_LIMIT_PARAMETER_KEY = "product_image_limit";
const PRODUCT_IMAGE_LIMIT_MIN = 1;
const PRODUCT_IMAGE_LIMIT_MAX = 10;

const EMPTY_PRODUCT_FORM = {
  name: "",
  description: "",
  price: "",
  unit: "unidade",
  stock: "",
  badge: "",
  categoryId: "",
};

const CATALOG_IMAGE_BUCKET = "catalog-images";
const CATALOG_IMAGE_MAX_SIZE = 5 * 1024 * 1024;
const CATALOG_IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const IMPORT_HEADERS = ["Categoria", "Produto", "Descrição", "Preço", "Unidade", "Estoque", "Selo", "Código/SKU"] as const;
const REQUIRED_IMPORT_HEADERS = ["Categoria", "Produto", "Preço"] as const;
const CATEGORY_IMPORT_HEADERS = ["Categoria", "Ordem"] as const;

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

function validateCatalogImage(file: File) {
  if (!CATALOG_IMAGE_EXTENSIONS[file.type]) return "Escolha uma imagem JPG, PNG ou WebP.";
  if (file.size > CATALOG_IMAGE_MAX_SIZE) return "A imagem deve ter no máximo 5 MB.";
  return "";
}

function storagePathFromPublicUrl(url?: string | null) {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${CATALOG_IMAGE_BUCKET}/`;
  const markerIndex = url.indexOf(marker);
  return markerIndex >= 0 ? decodeURIComponent(url.slice(markerIndex + marker.length)) : null;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function validCoordinate(value: string, min: number, max: number) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function parameterBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function catalogLayoutValue(value: unknown, fallback: CatalogLayout = "horizontal"): CatalogLayout {
  return value === "horizontal" || value === "showcase" ? value : fallback;
}

function productImageLimitValue(value: unknown, fallback = 1) {
  const parsed = Number(value);
  return Number.isInteger(parsed)
    ? Math.min(PRODUCT_IMAGE_LIMIT_MAX, Math.max(PRODUCT_IMAGE_LIMIT_MIN, parsed))
    : fallback;
}

function companyThemeColor(value: unknown) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : "#176b52";
}

function requestBrowserLocation(options: PositionOptions) {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

function locationErrorMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) return "O Chrome bloqueou a localização. Clique no cadeado ao lado do endereço, permita Localização e recarregue a página.";
  if (error.code === error.POSITION_UNAVAILABLE) return "O dispositivo não informou a posição. Ative a localização do aparelho e tente novamente.";
  if (error.code === error.TIMEOUT) return "A localização demorou para responder. Verifique o GPS ou Wi-Fi e tente novamente.";
  return "Não foi possível obter a localização da filial.";
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
  const [companySettingsSection, setCompanySettingsSection] = useState<CompanySettingsSection>("overview");
  const [parameterScope, setParameterScope] = useState<ParameterScope>("company");
  const [activeBranchId, setActiveBranchId] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [message, setMessage] = useState("");
  const [companyForm, setCompanyForm] = useState({ name: "", branch: "", phone: "", address: "", latitude: "", longitude: "", userName: "", userEmail: "", userPassword: "" });
  const [branchForm, setBranchForm] = useState({ name: "", phone: "", address: "", latitude: "", longitude: "" });
  const [branchLocationForm, setBranchLocationForm] = useState({ address: "", latitude: "", longitude: "" });
  const [locatingBranchForm, setLocatingBranchForm] = useState<BranchLocationTarget | "">("");
  const [locationIssue, setLocationIssue] = useState<LocationIssue | null>(null);
  const [savingBranchLocation, setSavingBranchLocation] = useState(false);
  const [showBranchForm, setShowBranchForm] = useState(false);
  const [savingBranch, setSavingBranch] = useState(false);
  const [accessForm, setAccessForm] = useState({ name: "", email: "", password: "" });
  const [companyIdentity, setCompanyIdentity] = useState({ isActive: true, themeColor: "#176b52", profileImageUrl: "" });
  const [companyProfileFile, setCompanyProfileFile] = useState<File | null>(null);
  const [companyProfilePreview, setCompanyProfilePreview] = useState("");
  const [savingCompanyIdentity, setSavingCompanyIdentity] = useState(false);
  const companyProfileInputRef = useRef<HTMLInputElement>(null);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [savingAccess, setSavingAccess] = useState(false);
  const [companyCalculatesDeliveryFee, setCompanyCalculatesDeliveryFee] = useState(true);
  const [branchFreightModes, setBranchFreightModes] = useState<Record<string, FreightParameterMode>>({});
  const [branchDeliveryFees, setBranchDeliveryFees] = useState<Record<string, string>>({});
  const [companyCatalogLayout, setCompanyCatalogLayout] = useState<CatalogLayout>("horizontal");
  const [branchCatalogLayouts, setBranchCatalogLayouts] = useState<Record<string, BranchCatalogLayoutMode>>({});
  const [companyProductImageLimit, setCompanyProductImageLimit] = useState(1);
  const [branchProductImageLimits, setBranchProductImageLimits] = useState<Record<string, ProductImageLimitMode>>({});
  const [activeProductImageLimit, setActiveProductImageLimit] = useState(1);
  const [savingParameters, setSavingParameters] = useState(false);
  const [showDeleteCompany, setShowDeleteCompany] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletingCompany, setDeletingCompany] = useState(false);
  const [importingCatalog, setImportingCatalog] = useState(false);
  const [exportingCatalog, setExportingCatalog] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);
  const [coverImagePreview, setCoverImagePreview] = useState("");
  const [uploadingCover, setUploadingCover] = useState(false);
  const coverImageInputRef = useRef<HTMLInputElement>(null);
  const [categoryName, setCategoryName] = useState("");
  const [productImageFiles, setProductImageFiles] = useState<File[]>([]);
  const [productImagePreviews, setProductImagePreviews] = useState<string[]>([]);
  const [savingProduct, setSavingProduct] = useState(false);
  const [catalogEditorMode, setCatalogEditorMode] = useState<CatalogEditorMode | null>(null);
  const [editingProductId, setEditingProductId] = useState("");
  const productImageInputRef = useRef<HTMLInputElement>(null);
  const quickProductImageInputRef = useRef<HTMLInputElement>(null);
  const quickProductImageTargetRef = useRef("");
  const [uploadingProductImageId, setUploadingProductImageId] = useState("");
  const [productForm, setProductForm] = useState({ ...EMPTY_PRODUCT_FORM });
  const [accessDenied, setAccessDenied] = useState(false);

  function resetProductEditor() {
    setEditingProductId("");
    setProductForm({ ...EMPTY_PRODUCT_FORM });
    setProductImageFiles([]);
    setProductImagePreviews([]);
    if (productImageInputRef.current) productImageInputRef.current.value = "";
  }

  function closeCatalogEditor() {
    setCatalogEditorMode(null);
    setCategoryName("");
    resetProductEditor();
  }

  function openNewProductEditor() {
    setCategoryName("");
    resetProductEditor();
    setCatalogEditorMode("product");
  }

  function openCategoryEditor() {
    resetProductEditor();
    setCatalogEditorMode("category");
  }

  function editProduct(product: Product) {
    setEditingProductId(product.id);
    setProductForm({
      name: product.name,
      description: product.description ?? "",
      price: Number(product.price).toFixed(2).replace(".", ","),
      unit: product.unit ?? "",
      stock: product.stock_quantity === null ? "" : String(product.stock_quantity).replace(".", ","),
      badge: product.badge ?? "",
      categoryId: product.category_id ?? "",
    });
    setProductImageFiles([]);
    setProductImagePreviews([]);
    if (productImageInputRef.current) productImageInputRef.current.value = "";
    setCatalogEditorMode("product");
    setMessage("");
    requestAnimationFrame(() => {
      document.querySelector(".catalog-editor-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

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
            supabase.from("stores").select("id, name, slug, tenant_id, address, cover_image_url, latitude, longitude, delivery_fee").eq("tenant_id", tenantId).order("created_at", { ascending: true }),
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
    const [{ data: tenantRows, error: tenantError }, { data: allBranchRows, error: branchError }, identityResult] = await Promise.all([
      supabase.from("tenants").select("id, name, slug").order("created_at", { ascending: true }),
      supabase
        .from("stores")
        .select("id, name, slug, tenant_id, address, cover_image_url, latitude, longitude, delivery_fee")
        .order("created_at", { ascending: true }),
      supabase.rpc("get_admin_company_identities"),
    ]);

    if (tenantError || branchError) {
      setTenant(null);
      setBranches([]);
      setAdminTenants([]);
      setAdminBranches([]);
      setMessage(tenantError?.message ?? branchError?.message ?? "Não foi possível carregar as empresas.");
      setLoading(false);
      return;
    }

    const identityByTenant = new Map(
      (identityResult.data ?? []).map((row) => [row.tenant_id, row]),
    );
    const nextTenants = (tenantRows ?? []).map((row) => {
      const identity = identityByTenant.get(row.id);
      return {
        ...row,
        is_active: identity?.is_active ?? true,
        theme_color: companyThemeColor(identity?.theme_color),
        profile_image_url: identity?.profile_image_url ?? null,
      };
    }) as Tenant[];
    const allBranches = (allBranchRows ?? []) as Branch[];
    setAdminTenants(nextTenants);
    setAdminBranches(allBranches);
    const tenantId = preferredTenantId && nextTenants.some((item) => item.id === preferredTenantId)
      ? preferredTenantId
      : "";
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

  async function authorizeSession(nextSession: Session | null) {
    if (!supabase) return;
    if (!nextSession) {
      setSession(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    if (!isCompanyPortal) {
      const { data: isAdmin, error } = await supabase.rpc("is_platform_admin");
      if (error || !isAdmin) {
        setSession(null);
        setAccessDenied(true);
        setLoading(false);
        await supabase.auth.signOut();
        return;
      }
    }

    setAccessDenied(false);
    setSession(nextSession);
    await loadWorkspace(nextSession.user.id);
  }

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    void supabase.auth.getSession().then(({ data }) => authorizeSession(data.session));

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      window.setTimeout(() => void authorizeSession(nextSession), 0);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  async function refreshBranchCatalog(branchId: string) {
    if (!supabase || !branchId) {
      setCategories([]);
      setProducts([]);
      return;
    }

    const [categoryResult, initialProductResult, branchResult] = await Promise.all([
      supabase
        .from("categories")
        .select("id, name, sort_order")
        .eq("store_id", branchId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("products")
        .select("id, external_id, name, description, price, unit, stock_quantity, image_url, badge, category_id, is_active, product_images(id, image_url, sort_order)")
        .eq("store_id", branchId)
        .eq("is_active", true)
        .order("name", { ascending: true }),
      supabase
        .from("stores")
        .select("cover_image_url")
        .eq("id", branchId)
        .maybeSingle(),
    ]);
    let productResult = initialProductResult;
    if (productResult.error && /product_images|relationship|schema cache/i.test(productResult.error.message)) {
      productResult = await supabase
        .from("products")
        .select("id, external_id, name, description, price, unit, stock_quantity, image_url, badge, category_id, is_active")
        .eq("store_id", branchId)
        .eq("is_active", true)
        .order("name", { ascending: true });
    }
    const categoryRows = categoryResult.data;
    const branchRow = branchResult.data;
    const productRows = (productResult.data ?? []).map((product) => ({
      ...product,
      product_images: product.product_images?.length
        ? [...product.product_images].sort((left, right) => left.sort_order - right.sort_order)
        : product.image_url
          ? [{ id: "legacy", image_url: product.image_url, sort_order: 0 }]
          : [],
    }));

    setCategories((categoryRows ?? []) as Category[]);
    setProducts((productRows ?? []) as Product[]);
    if (branchRow) {
      setBranches((current) => current.map((branch) => branch.id === branchId ? { ...branch, cover_image_url: branchRow.cover_image_url } : branch));
      setAdminBranches((current) => current.map((branch) => branch.id === branchId ? { ...branch, cover_image_url: branchRow.cover_image_url } : branch));
    }
  }

  async function refreshProductImageLimit(branchId: string) {
    if (!supabase || !branchId) {
      setActiveProductImageLimit(1);
      return;
    }
    const { data: branch } = await supabase.from("stores").select("tenant_id").eq("id", branchId).maybeSingle();
    if (!branch?.tenant_id) return;
    const [tenantParameter, storeParameter] = await Promise.all([
      supabase.from("tenant_parameters").select("parameter_value").eq("tenant_id", branch.tenant_id).eq("parameter_key", PRODUCT_IMAGE_LIMIT_PARAMETER_KEY).maybeSingle(),
      supabase.from("store_parameters").select("parameter_value").eq("store_id", branchId).eq("parameter_key", PRODUCT_IMAGE_LIMIT_PARAMETER_KEY).maybeSingle(),
    ]);
    setActiveProductImageLimit(productImageLimitValue(
      storeParameter.data?.parameter_value ?? tenantParameter.data?.parameter_value,
      1,
    ));
  }

  useEffect(() => {
    void refreshBranchCatalog(activeBranchId);
    void refreshProductImageLimit(activeBranchId);
  }, [activeBranchId]);

  useEffect(() => {
    setCoverImageFile(null);
    setCoverImagePreview("");
    setProductImageFiles([]);
    setProductImagePreviews([]);
    setEditingProductId("");
    setProductForm({ ...EMPTY_PRODUCT_FORM });
    setCatalogEditorMode(null);
    setUploadingProductImageId("");
    quickProductImageTargetRef.current = "";
    if (coverImageInputRef.current) coverImageInputRef.current.value = "";
    if (productImageInputRef.current) productImageInputRef.current.value = "";
    if (quickProductImageInputRef.current) quickProductImageInputRef.current.value = "";
  }, [activeBranchId]);

  useEffect(() => {
    const selectedBranch = branches.find((branch) => branch.id === activeBranchId);
    setBranchLocationForm({
      address: selectedBranch?.address ?? "",
      latitude: selectedBranch?.latitude == null ? "" : String(selectedBranch.latitude).replace(".", ","),
      longitude: selectedBranch?.longitude == null ? "" : String(selectedBranch.longitude).replace(".", ","),
    });
  }, [activeBranchId, branches]);

  useEffect(() => () => {
    if (coverImagePreview.startsWith("blob:")) URL.revokeObjectURL(coverImagePreview);
  }, [coverImagePreview]);

  useEffect(() => () => {
    productImagePreviews.forEach((preview) => {
      if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    });
  }, [productImagePreviews]);

  useEffect(() => () => {
    if (companyProfilePreview.startsWith("blob:")) URL.revokeObjectURL(companyProfilePreview);
  }, [companyProfilePreview]);

  async function captureBranchLocation(target: BranchLocationTarget) {
    if (!navigator.geolocation) {
      const issue = "A localização não está disponível neste navegador.";
      setMessage(issue);
      setLocationIssue({ target, message: issue });
      return;
    }

    if (window.self !== window.top) {
      const opened = window.open(window.location.href, "_blank", "noopener,noreferrer");
      const issue = opened
        ? "O painel foi aberto em uma nova aba. Use o botão de localização novamente nessa aba."
        : "Abra o painel em uma nova aba para o Chrome permitir a localização.";
      setMessage(issue);
      setLocationIssue({ target, message: issue });
      return;
    }

    if (!window.isSecureContext) {
      const issue = "O Chrome só libera localização em uma conexão HTTPS segura.";
      setMessage(issue);
      setLocationIssue({ target, message: issue });
      return;
    }

    setLocatingBranchForm(target);
    setMessage("Obtendo a localização da filial...");
    setLocationIssue(null);

    try {
      if (navigator.permissions) {
        try {
          const permission = await navigator.permissions.query({ name: "geolocation" });
          if (permission.state === "denied") {
            const issue = "A localização está bloqueada no Chrome. Clique no cadeado ao lado do endereço, altere Localização para Permitir e recarregue a página.";
            setMessage(issue);
            setLocationIssue({ target, message: issue });
            setLocatingBranchForm("");
            return;
          }
        } catch {
          // Some browsers expose geolocation but not the related Permissions API entry.
        }
      }

      let position: GeolocationPosition;
      try {
        position = await requestBrowserLocation({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
      } catch (firstError) {
        const geolocationError = firstError as GeolocationPositionError;
        if (geolocationError.code === geolocationError.PERMISSION_DENIED) throw geolocationError;
        position = await requestBrowserLocation({ enableHighAccuracy: false, timeout: 20000, maximumAge: 120000 });
      }

      const location = { latitude: position.coords.latitude.toFixed(6), longitude: position.coords.longitude.toFixed(6) };
      if (target === "company") setCompanyForm((current) => ({ ...current, ...location }));
      else if (target === "branch") setBranchForm((current) => ({ ...current, ...location }));
      else setBranchLocationForm((current) => ({ ...current, ...location }));
      setMessage("Localização da filial preenchida.");
      setLocationIssue(null);
    } catch (error) {
      const issue = locationErrorMessage(error as GeolocationPositionError);
      setMessage(issue);
      setLocationIssue({ target, message: issue });
    } finally {
      setLocatingBranchForm("");
    }
  }

  async function createCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setMessage("");
    const latitude = validCoordinate(companyForm.latitude, -90, 90);
    const longitude = validCoordinate(companyForm.longitude, -180, 180);
    if (latitude === null || longitude === null) {
      setMessage("Informe uma localização válida para a primeira filial.");
      return;
    }
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
          latitude,
          longitude,
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
    setTenant(null);
    setBranches([]);
    setActiveBranchId("");
    setAdminTenants((current) => [...current, tenantRow]);
    setAdminBranches((current) => [...current, branchRow]);
    setAdminSection("companies");
    setCompanyForm({ name: "", branch: "", phone: "", address: "", latitude: "", longitude: "", userName: "", userEmail: "", userPassword: "" });
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
      closeCatalogEditor();
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

  function showCompanies() {
    setAdminSection("companies");
    setTenant(null);
    setBranches([]);
    setActiveBranchId("");
    setShowBranchForm(false);
    setMessage("");
  }

  async function openCompanySettings(tenantId: string, section: CompanySettingsSection = "overview") {
    if (!supabase) return;
    const selectedTenant = adminTenants.find((item) => item.id === tenantId) ?? null;
    const selectedBranches = adminBranches.filter((branch) => branch.tenant_id === tenantId);
    setTenant(selectedTenant);
    setBranches(selectedBranches);
    setActiveBranchId(selectedBranches[0]?.id ?? "");
    setAccessForm({ name: "", email: "", password: "" });
    setCompanyIdentity({
      isActive: selectedTenant?.is_active ?? true,
      themeColor: companyThemeColor(selectedTenant?.theme_color),
      profileImageUrl: selectedTenant?.profile_image_url ?? "",
    });
    setCompanyProfileFile(null);
    setCompanyProfilePreview("");
    if (companyProfileInputRef.current) companyProfileInputRef.current.value = "";
    setCompanyCalculatesDeliveryFee(true);
    setBranchFreightModes({});
    setCompanyCatalogLayout("horizontal");
    setBranchCatalogLayouts({});
    setCompanyProductImageLimit(1);
    setBranchProductImageLimits({});
    setBranchDeliveryFees(Object.fromEntries(selectedBranches.map((branch) => [
      branch.id,
      Number(branch.delivery_fee ?? 0).toFixed(2).replace(".", ","),
    ])));
    setShowDeleteCompany(false);
    setDeleteConfirmation("");
    setAdminSection("settings");
    setCompanySettingsSection(section);
    setParameterScope("company");
    setLoadingSettings(true);
    setMessage("");

    const branchParameterRequest = selectedBranches.length
      ? supabase
          .from("store_parameters")
          .select("store_id, parameter_key, parameter_value")
          .in("parameter_key", [FREIGHT_PARAMETER_KEY, CATALOG_LAYOUT_PARAMETER_KEY, PRODUCT_IMAGE_LIMIT_PARAMETER_KEY])
          .in("store_id", selectedBranches.map((branch) => branch.id))
      : Promise.resolve({ data: [], error: null });
    const [settingsResult, tenantParameterResult, branchParameterResult] = await Promise.all([
      supabase.functions.invoke("create-store-user", {
        body: { action: "get-company-settings", tenant_id: tenantId },
      }),
      supabase
        .from("tenant_parameters")
        .select("parameter_key, parameter_value")
        .eq("tenant_id", tenantId)
        .in("parameter_key", [FREIGHT_PARAMETER_KEY, CATALOG_LAYOUT_PARAMETER_KEY, PRODUCT_IMAGE_LIMIT_PARAMETER_KEY]),
      branchParameterRequest,
    ]);
    setLoadingSettings(false);
    const { data, error } = settingsResult;
    if (error || data?.error || tenantParameterResult.error || branchParameterResult.error) {
      setMessage(data?.error ?? error?.message ?? tenantParameterResult.error?.message ?? branchParameterResult.error?.message ?? "Não foi possível carregar as configurações da empresa.");
      return;
    }
    setAccessForm({
      name: data?.account?.name ?? "",
      email: data?.account?.email ?? "",
      password: "",
    });
    const tenantParameters = new Map(
      (tenantParameterResult.data ?? []).map((row) => [row.parameter_key, row.parameter_value]),
    );
    setCompanyCalculatesDeliveryFee(parameterBoolean(tenantParameters.get(FREIGHT_PARAMETER_KEY), true));
    setCompanyCatalogLayout(catalogLayoutValue(tenantParameters.get(CATALOG_LAYOUT_PARAMETER_KEY)));
    setCompanyProductImageLimit(productImageLimitValue(tenantParameters.get(PRODUCT_IMAGE_LIMIT_PARAMETER_KEY), 1));
    const freightParameterByStore = new Map(
      (branchParameterResult.data ?? [])
        .filter((row) => row.parameter_key === FREIGHT_PARAMETER_KEY)
        .map((row) => [row.store_id, parameterBoolean(row.parameter_value, true)]),
    );
    const layoutParameterByStore = new Map(
      (branchParameterResult.data ?? [])
        .filter((row) => row.parameter_key === CATALOG_LAYOUT_PARAMETER_KEY)
        .map((row) => [row.store_id, catalogLayoutValue(row.parameter_value)]),
    );
    const imageLimitParameterByStore = new Map(
      (branchParameterResult.data ?? [])
        .filter((row) => row.parameter_key === PRODUCT_IMAGE_LIMIT_PARAMETER_KEY)
        .map((row) => [row.store_id, productImageLimitValue(row.parameter_value)]),
    );
    setBranchFreightModes(Object.fromEntries(selectedBranches.map((branch) => [
      branch.id,
      freightParameterByStore.has(branch.id)
        ? freightParameterByStore.get(branch.id) ? "enabled" : "disabled"
        : "inherit",
    ])));
    setBranchCatalogLayouts(Object.fromEntries(selectedBranches.map((branch) => [
      branch.id,
      layoutParameterByStore.get(branch.id) ?? "inherit",
    ])));
    setBranchProductImageLimits(Object.fromEntries(selectedBranches.map((branch) => [
      branch.id,
      imageLimitParameterByStore.get(branch.id) ?? "inherit",
    ])));
  }

  async function saveCompanyParameters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !tenant || savingParameters) return;
    setSavingParameters(true);
    setMessage("");
    const updatedAt = new Date().toISOString();
    const { error: tenantParameterError } = await supabase.from("tenant_parameters").upsert([
      {
        tenant_id: tenant.id,
        parameter_key: FREIGHT_PARAMETER_KEY,
        parameter_value: companyCalculatesDeliveryFee,
        is_public: true,
        updated_at: updatedAt,
      },
      {
        tenant_id: tenant.id,
        parameter_key: CATALOG_LAYOUT_PARAMETER_KEY,
        parameter_value: companyCatalogLayout,
        is_public: true,
        updated_at: updatedAt,
      },
      {
        tenant_id: tenant.id,
        parameter_key: PRODUCT_IMAGE_LIMIT_PARAMETER_KEY,
        parameter_value: productImageLimitValue(companyProductImageLimit),
        is_public: true,
        updated_at: updatedAt,
      },
    ], { onConflict: "tenant_id,parameter_key" });

    if (tenantParameterError) {
      setSavingParameters(false);
      setMessage(tenantParameterError.message);
      return;
    }

    setSavingParameters(false);
    if (activeBranchId) void refreshProductImageLimit(activeBranchId);
    setMessage(`Parâmetros padrão de ${tenant.name} atualizados.`);
  }

  async function saveBranchParameters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !tenant || !activeBranchId || savingParameters) return;

    const branch = branches.find((item) => item.id === activeBranchId);
    if (!branch) return;

    const fee = parseBrazilianNumber(branchDeliveryFees[branch.id] ?? "0");
    if (!Number.isFinite(fee) || fee < 0) {
      setMessage(`Informe uma taxa de entrega válida para ${branch.name}.`);
      return;
    }

    setSavingParameters(true);
    setMessage("");
    const freightMode = branchFreightModes[branch.id] ?? "inherit";
    const layoutMode = branchCatalogLayouts[branch.id] ?? "inherit";
    const imageLimitMode = branchProductImageLimits[branch.id] ?? "inherit";
    const freightParameterRequest = freightMode === "inherit"
      ? await supabase
          .from("store_parameters")
          .delete()
          .eq("store_id", branch.id)
          .eq("parameter_key", FREIGHT_PARAMETER_KEY)
      : await supabase.from("store_parameters").upsert({
          store_id: branch.id,
          parameter_key: FREIGHT_PARAMETER_KEY,
          parameter_value: freightMode === "enabled",
          is_public: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: "store_id,parameter_key" });
    const layoutParameterRequest = layoutMode === "inherit"
      ? await supabase
          .from("store_parameters")
          .delete()
          .eq("store_id", branch.id)
          .eq("parameter_key", CATALOG_LAYOUT_PARAMETER_KEY)
      : await supabase.from("store_parameters").upsert({
          store_id: branch.id,
          parameter_key: CATALOG_LAYOUT_PARAMETER_KEY,
          parameter_value: layoutMode,
          is_public: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: "store_id,parameter_key" });
    const imageLimitParameterRequest = imageLimitMode === "inherit"
      ? await supabase
          .from("store_parameters")
          .delete()
          .eq("store_id", branch.id)
          .eq("parameter_key", PRODUCT_IMAGE_LIMIT_PARAMETER_KEY)
      : await supabase.from("store_parameters").upsert({
          store_id: branch.id,
          parameter_key: PRODUCT_IMAGE_LIMIT_PARAMETER_KEY,
          parameter_value: productImageLimitValue(imageLimitMode),
          is_public: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: "store_id,parameter_key" });

    const parameterError = freightParameterRequest.error ?? layoutParameterRequest.error ?? imageLimitParameterRequest.error;
    if (parameterError) {
      setSavingParameters(false);
      setMessage(parameterError.message);
      return;
    }

    const { error: feeError } = await supabase
      .from("stores")
      .update({ delivery_fee: fee })
      .eq("id", branch.id);
    if (feeError) {
      setSavingParameters(false);
      setMessage(feeError.message);
      return;
    }

    const updateFee = (item: Branch) => item.id === branch.id ? { ...item, delivery_fee: fee } : item;
    setBranches((current) => current.map(updateFee));
    setAdminBranches((current) => current.map(updateFee));
    setSavingParameters(false);
    void refreshProductImageLimit(branch.id);
    setMessage(`Parâmetros da filial ${branch.name} atualizados.`);
  }

  async function saveCompanyIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !tenant || savingCompanyIdentity) return;
    const uploadBranchId = branches[0]?.id;
    if (companyProfileFile && !uploadBranchId) {
      setMessage("Cadastre uma filial antes de enviar a foto da empresa.");
      return;
    }

    setSavingCompanyIdentity(true);
    setMessage("");
    const uploadedPaths: string[] = [];
    try {
      let profileImageUrl = companyIdentity.profileImageUrl || null;
      if (companyProfileFile && uploadBranchId) {
        const uploaded = await uploadCatalogImage(companyProfileFile, "company-profile", uploadBranchId);
        uploadedPath = uploaded.path;
        profileImageUrl = uploaded.url;
      }

      const identityData = {
        is_active: companyIdentity.isActive,
        theme_color: companyThemeColor(companyIdentity.themeColor),
        profile_image_url: profileImageUrl,
      };
      const { error } = await supabase.from("tenants").update(identityData).eq("id", tenant.id);
      if (error) throw error;

      const previousImagePath = storagePathFromPublicUrl(companyIdentity.profileImageUrl);
      if (uploadedPath && previousImagePath && previousImagePath !== uploadedPath) {
        await supabase.storage.from(CATALOG_IMAGE_BUCKET).remove([previousImagePath]);
      }
      const updateTenant = (item: Tenant) => item.id === tenant.id ? { ...item, ...identityData } : item;
      setTenant((current) => current ? updateTenant(current) : current);
      setAdminTenants((current) => current.map(updateTenant));
      setCompanyIdentity((current) => ({ ...current, themeColor: identityData.theme_color, profileImageUrl: profileImageUrl ?? "" }));
      setCompanyProfileFile(null);
      setCompanyProfilePreview("");
      if (companyProfileInputRef.current) companyProfileInputRef.current.value = "";
      setMessage(`Identidade de ${tenant.name} atualizada.`);
    } catch (error) {
      if (uploadedPath) await supabase.storage.from(CATALOG_IMAGE_BUCKET).remove([uploadedPath]);
      setMessage(error instanceof Error ? error.message : "Não foi possível atualizar a identidade da empresa.");
    } finally {
      setSavingCompanyIdentity(false);
    }
  }

  async function removeCompanyProfileImage() {
    if (!supabase || !tenant || savingCompanyIdentity || !companyIdentity.profileImageUrl) return;
    setSavingCompanyIdentity(true);
    setMessage("");
    const previousPath = storagePathFromPublicUrl(companyIdentity.profileImageUrl);
    const { error } = await supabase.from("tenants").update({ profile_image_url: null }).eq("id", tenant.id);
    if (error) {
      setMessage(error.message);
      setSavingCompanyIdentity(false);
      return;
    }
    if (previousPath) await supabase.storage.from(CATALOG_IMAGE_BUCKET).remove([previousPath]);
    const updateTenant = (item: Tenant) => item.id === tenant.id ? { ...item, profile_image_url: null } : item;
    setTenant((current) => current ? updateTenant(current) : current);
    setAdminTenants((current) => current.map(updateTenant));
    setCompanyIdentity((current) => ({ ...current, profileImageUrl: "" }));
    setCompanyProfileFile(null);
    setCompanyProfilePreview("");
    setSavingCompanyIdentity(false);
    setMessage("Foto da empresa removida.");
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
    const latitude = validCoordinate(branchForm.latitude, -90, 90);
    const longitude = validCoordinate(branchForm.longitude, -180, 180);
    if (latitude === null || longitude === null) {
      setMessage("Informe uma localização válida para a filial.");
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
        latitude,
        longitude,
        is_active: true,
      })
      .select("id, name, slug, tenant_id, address, latitude, longitude, delivery_fee")
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
    setBranchFreightModes((current) => ({ ...current, [branchRow.id]: "inherit" }));
    setBranchCatalogLayouts((current) => ({ ...current, [branchRow.id]: "inherit" }));
    setBranchProductImageLimits((current) => ({ ...current, [branchRow.id]: "inherit" }));
    setBranchDeliveryFees((current) => ({ ...current, [branchRow.id]: Number(branchRow.delivery_fee ?? 0).toFixed(2).replace(".", ",") }));
    setBranchForm({ name: "", phone: "", address: "", latitude: "", longitude: "" });
    setShowBranchForm(false);
    setMessage("Nova filial criada. Ela já está disponível no Portal da empresa.");
  }

  async function saveExistingBranchLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !activeBranchId || savingBranchLocation) return;
    const latitude = validCoordinate(branchLocationForm.latitude, -90, 90);
    const longitude = validCoordinate(branchLocationForm.longitude, -180, 180);
    if (branchLocationForm.address.trim().length < 5 || latitude === null || longitude === null) {
      setMessage("Informe o endereço e uma localização válida para a filial.");
      return;
    }

    setSavingBranchLocation(true);
    setMessage("");
    const { error } = await supabase
      .from("stores")
      .update({ address: branchLocationForm.address.trim(), latitude, longitude })
      .eq("id", activeBranchId);
    setSavingBranchLocation(false);
    if (error) {
      setMessage(error.message);
      return;
    }

    const updateBranch = (branch: Branch) => branch.id === activeBranchId
      ? { ...branch, address: branchLocationForm.address.trim(), latitude, longitude }
      : branch;
    setBranches((current) => current.map(updateBranch));
    setAdminBranches((current) => current.map(updateBranch));
    setMessage("Endereço e localização da filial atualizados.");
  }

  function selectCoverImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    const validationMessage = validateCatalogImage(file);
    if (validationMessage) {
      event.target.value = "";
      setMessage(validationMessage);
      return;
    }
    setCoverImageFile(file);
    setCoverImagePreview(URL.createObjectURL(file));
    setMessage("");
  }

  function selectProductImage(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);
    if (!selectedFiles.length) return;
    const invalidFile = selectedFiles.find((file) => validateCatalogImage(file));
    if (invalidFile) {
      event.target.value = "";
      setMessage(validateCatalogImage(invalidFile));
      return;
    }
    const editingProduct = editingProductId ? products.find((product) => product.id === editingProductId) : null;
    const existingCount = editingProduct?.product_images?.length ?? 0;
    const remaining = Math.max(0, activeProductImageLimit - existingCount);
    if (!remaining) {
      event.target.value = "";
      setMessage(`Este produto já atingiu o limite de ${activeProductImageLimit} foto(s).`);
      return;
    }
    const acceptedFiles = selectedFiles.slice(0, remaining);
    setProductImageFiles(acceptedFiles);
    setProductImagePreviews(acceptedFiles.map((file) => URL.createObjectURL(file)));
    if (selectedFiles.length > remaining) {
      setMessage(`Foram selecionadas somente ${remaining} foto(s), conforme o limite desta filial.`);
      return;
    }
    setMessage("");
  }

  function selectCompanyProfileImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    const validationMessage = validateCatalogImage(file);
    if (validationMessage) {
      event.target.value = "";
      setMessage(validationMessage);
      return;
    }
    setCompanyProfileFile(file);
    setCompanyProfilePreview(URL.createObjectURL(file));
    setMessage("");
  }

  async function uploadCatalogImage(file: File, folder: "covers" | "products" | "company-profile", storeId = activeBranchId) {
    if (!supabase || !storeId) throw new Error("Selecione uma filial antes de enviar a imagem.");
    const extension = CATALOG_IMAGE_EXTENSIONS[file.type];
    const path = `${storeId}/${folder}/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from(CATALOG_IMAGE_BUCKET).upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });
    if (error) {
      const isMissingBucket = /bucket|not found/i.test(error.message);
      throw new Error(isMissingBucket ? "O armazenamento de imagens ainda não foi configurado no Supabase." : error.message);
    }
    const { data } = supabase.storage.from(CATALOG_IMAGE_BUCKET).getPublicUrl(path);
    return { path, url: data.publicUrl };
  }

  async function saveBranchCover() {
    if (!supabase || !activeBranchId || !coverImageFile || uploadingCover) return;
    setUploadingCover(true);
    setMessage("Enviando capa da filial...");
    let uploadedPath = "";
    try {
      let uploaded;
      try {
        uploaded = await uploadCatalogImage(coverImageFile, "covers");
      } catch (error) {
        throw new Error(`Falha no envio da imagem: ${error instanceof Error ? error.message : "erro desconhecido"}`);
      }
      uploadedPath = uploaded.path;
      const previousCover = branches.find((branch) => branch.id === activeBranchId)?.cover_image_url;
      const { error } = await supabase.rpc("set_store_cover", {
        target_store_id: activeBranchId,
        new_cover_image_url: uploaded.url,
      });
      if (error) throw new Error(`Falha ao gravar a capa: ${error.message}`);

      setBranches((current) => current.map((branch) => branch.id === activeBranchId ? { ...branch, cover_image_url: uploaded.url } : branch));
      setAdminBranches((current) => current.map((branch) => branch.id === activeBranchId ? { ...branch, cover_image_url: uploaded.url } : branch));
      setCoverImageFile(null);
      setCoverImagePreview("");
      if (coverImageInputRef.current) coverImageInputRef.current.value = "";
      const previousPath = storagePathFromPublicUrl(previousCover);
      if (previousPath) await supabase.storage.from(CATALOG_IMAGE_BUCKET).remove([previousPath]);
      setMessage("Capa da filial atualizada.");
    } catch (error) {
      if (uploadedPath) await supabase.storage.from(CATALOG_IMAGE_BUCKET).remove([uploadedPath]);
      setMessage(error instanceof Error ? error.message : "Não foi possível atualizar a capa.");
    } finally {
      setUploadingCover(false);
    }
  }

  async function removeBranchCover() {
    if (!supabase || !activeBranchId || uploadingCover) return;
    const previousCover = branches.find((branch) => branch.id === activeBranchId)?.cover_image_url;
    if (!previousCover) return;
    setUploadingCover(true);
    setMessage("");
    const { error } = await supabase.rpc("set_store_cover", {
      target_store_id: activeBranchId,
      new_cover_image_url: "",
    });
    if (error) {
      setMessage(error.message);
      setUploadingCover(false);
      return;
    }
    setBranches((current) => current.map((branch) => branch.id === activeBranchId ? { ...branch, cover_image_url: null } : branch));
    setAdminBranches((current) => current.map((branch) => branch.id === activeBranchId ? { ...branch, cover_image_url: null } : branch));
    const previousPath = storagePathFromPublicUrl(previousCover);
    if (previousPath) await supabase.storage.from(CATALOG_IMAGE_BUCKET).remove([previousPath]);
    setUploadingCover(false);
    setMessage("Capa removida. O catálogo usará a apresentação neutra.");
  }

  async function downloadCatalogTemplate() {
    if (!supabase || !activeBranchId || exportingCatalog) return;
    setExportingCatalog(true);
    setMessage("");
    try {
      const [categoryResult, productResult] = await Promise.all([
        supabase
          .from("categories")
          .select("id, name, sort_order")
          .eq("store_id", activeBranchId)
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        supabase
          .from("products")
          .select("id, external_id, name, description, price, unit, stock_quantity, image_url, badge, category_id, is_active")
          .eq("store_id", activeBranchId)
          .eq("is_active", true)
          .order("name", { ascending: true }),
      ]);
      if (categoryResult.error) throw categoryResult.error;
      if (productResult.error) throw productResult.error;
      const exportCategories = (categoryResult.data ?? []) as Category[];
      const exportProducts = (productResult.data ?? []) as Product[];
      setCategories(exportCategories);
      setProducts(exportProducts);

      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Catálogo Fácil";
      workbook.created = new Date();
      workbook.subject = `Catálogo de ${activeBranch?.name ?? "filial"}`;

      const productsSheet = workbook.addWorksheet("Produtos", {
        views: [{ state: "frozen", ySplit: 1 }],
      });
      productsSheet.addRow([...IMPORT_HEADERS]);
      const categoryNameById = new Map(exportCategories.map((category) => [category.id, category.name]));
      productsSheet.addRows(exportProducts.map((product) => [
        product.category_id ? categoryNameById.get(product.category_id) ?? "" : "",
        product.name,
        product.description ?? "",
        Number(product.price),
        product.unit ?? "",
        product.stock_quantity ?? "",
        product.badge ?? "",
        product.external_id ?? `CAT-${product.id}`,
      ]));
      productsSheet.columns = [
        { width: 24 },
        { width: 32 },
        { width: 48 },
        { width: 14 },
        { width: 16 },
        { width: 14 },
        { width: 20 },
        { width: 20 },
      ];
      productsSheet.autoFilter = { from: "A1", to: "H1" };
      productsSheet.getRow(1).height = 25;
      productsSheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF176B52" } };
        cell.alignment = { vertical: "middle" };
      });
      productsSheet.getColumn(4).numFmt = 'R$ #,##0.00';
      productsSheet.getColumn(6).numFmt = "0.000";
      productsSheet.getColumn(8).numFmt = "@";

      const categoriesSheet = workbook.addWorksheet("Categorias", {
        views: [{ state: "frozen", ySplit: 1 }],
      });
      categoriesSheet.addRow([...CATEGORY_IMPORT_HEADERS]);
      categoriesSheet.addRows(exportCategories.map((category) => [category.name, category.sort_order]));
      categoriesSheet.columns = [{ width: 36 }, { width: 12 }];
      categoriesSheet.autoFilter = { from: "A1", to: "B1" };
      categoriesSheet.getRow(1).height = 25;
      categoriesSheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF176B52" } };
        cell.alignment = { vertical: "middle" };
      });

      const instructionsSheet = workbook.addWorksheet("Instruções");
      instructionsSheet.columns = [{ width: 24 }, { width: 88 }];
      instructionsSheet.addRows([
        ["Campo", "Preenchimento"],
        ["Produtos", "A aba Produtos já contém o catálogo atual. Você pode editar as linhas ou acrescentar produtos."],
        ["Categorias", "A aba Categorias contém todas as categorias, inclusive as que ainda não possuem produtos."],
        ["Categoria", "Opcional no produto. Se preenchida e ainda não existir, será criada automaticamente."],
        ["Produto", "Obrigatório. Nome exibido no catálogo."],
        ["Descrição", "Opcional."],
        ["Preço", "Obrigatório. Aceita 12,50 ou 12.50."],
        ["Unidade", "Opcional. Exemplos: unidade, caixa, kg, metro."],
        ["Estoque", "Opcional. Aceita números inteiros ou decimais."],
        ["Fotos", "Envie as fotos pelo botão de imagem de cada produto no Portal da empresa."],
        ["Selo", "Opcional. Exemplo: Mais vendido."],
        ["Código/SKU", "Não altere os códigos já exportados. Em produtos novos, informe um código próprio para permitir futuras atualizações."],
        ["Importação", "As abas Produtos e Categorias são importadas. Não altere os nomes das abas nem os títulos das colunas."],
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
        ["Bebidas", "Refrigerante Cola 2 L", "Garrafa gelada", 12, "unidade", 35, "Mais vendido", "BEB-001"],
        ["Mercearia", "Arroz 5 kg", "Pacote tipo 1", 27.9, "pacote", 20, "", "MER-001"],
      ]);
      exampleSheet.columns = productsSheet.columns.map((column) => ({ width: column.width }));
      exampleSheet.autoFilter = { from: "A1", to: "H1" };
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
      link.download = `catalogo-${slugify(activeBranch?.name ?? "filial")}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage(`${exportProducts.length} produto(s) e ${exportCategories.length} categoria(s) exportados para o Excel.`);
    } catch (error) {
      setMessage(error instanceof Error ? `Não foi possível exportar o catálogo: ${error.message}` : "Não foi possível exportar o catálogo para o Excel.");
    } finally {
      setExportingCatalog(false);
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
      const categoriesSheet = workbook.getWorksheet("Categorias");
      const importedCategories: CatalogImportCategory[] = [];

      if (categoriesSheet) {
        const categoryHeaderColumns = new Map<string, number>();
        categoriesSheet.getRow(1).eachCell({ includeEmpty: true }, (cell, columnNumber) => {
          const header = normalizeText(excelValueToText(cell.value));
          if (header) categoryHeaderColumns.set(header, columnNumber);
        });
        const categoryNameColumn = categoryHeaderColumns.get(normalizeText("Categoria"));
        const categoryOrderColumn = categoryHeaderColumns.get(normalizeText("Ordem"));
        if (!categoryNameColumn) throw new Error('A aba "Categorias" precisa ter a coluna "Categoria".');

        const importedCategoryKeys = new Set<string>();
        for (let rowNumber = 2; rowNumber <= categoriesSheet.rowCount; rowNumber += 1) {
          const name = excelValueToText(categoriesSheet.getRow(rowNumber).getCell(categoryNameColumn).value);
          const orderValue = categoryOrderColumn
            ? parseBrazilianNumber(categoriesSheet.getRow(rowNumber).getCell(categoryOrderColumn).value)
            : Number.NaN;
          if (!name) continue;
          const key = normalizeText(name);
          if (importedCategoryKeys.has(key)) continue;
          importedCategoryKeys.add(key);
          importedCategories.push({
            name,
            sortOrder: Number.isFinite(orderValue) && orderValue >= 0 ? orderValue : null,
          });
        }
      }

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
      const usedProductsWithoutSku = new Set<string>();

      for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
        const values = IMPORT_HEADERS.map((header) => columnValue(rowNumber, header));
        if (values.every((value) => !excelValueToText(value))) continue;

        const category = excelValueToText(columnValue(rowNumber, "Categoria"));
        const name = excelValueToText(columnValue(rowNumber, "Produto"));
        const price = parseBrazilianNumber(columnValue(rowNumber, "Preço"));
        const stockText = excelValueToText(columnValue(rowNumber, "Estoque"));
        const stock = stockText ? parseBrazilianNumber(columnValue(rowNumber, "Estoque")) : null;
        const skuText = excelValueToText(columnValue(rowNumber, "Código/SKU"));
        const sku = skuText || null;

        if (!name) validationErrors.push(`linha ${rowNumber}: produto vazio`);
        if (!Number.isFinite(price) || price < 0) validationErrors.push(`linha ${rowNumber}: preço inválido`);
        if (stock !== null && (!Number.isFinite(stock) || stock < 0)) validationErrors.push(`linha ${rowNumber}: estoque inválido`);
        if (sku && usedSkus.has(normalizeText(sku))) validationErrors.push(`linha ${rowNumber}: Código/SKU repetido (${sku})`);
        if (sku) usedSkus.add(normalizeText(sku));
        if (!sku && name) {
          const productKey = `${normalizeText(name)}::${normalizeText(category)}`;
          if (usedProductsWithoutSku.has(productKey)) validationErrors.push(`linha ${rowNumber}: produto repetido sem Código/SKU (${name})`);
          usedProductsWithoutSku.add(productKey);
        }

        importedRows.push({
          rowNumber,
          category,
          name,
          description: excelValueToText(columnValue(rowNumber, "Descrição")) || null,
          price,
          unit: excelValueToText(columnValue(rowNumber, "Unidade")) || null,
          stock,
          badge: excelValueToText(columnValue(rowNumber, "Selo")) || null,
          sku,
        });
      }

      if (!importedRows.length && !importedCategories.length) {
        throw new Error("A planilha não possui produtos nem categorias preenchidos.");
      }
      if (validationErrors.length) {
        const details = validationErrors.slice(0, 6).join("; ");
        const remaining = validationErrors.length > 6 ? `; e mais ${validationErrors.length - 6} erro(s)` : "";
        throw new Error(`Corrija a planilha antes de importar: ${details}${remaining}.`);
      }

      setMessage(`Importando ${importedRows.length} produto(s) e sincronizando categorias...`);
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

      const requestedCategories = new Map<string, CatalogImportCategory>();
      for (const category of importedCategories) {
        requestedCategories.set(normalizeText(category.name), category);
      }
      for (const row of importedRows) {
        if (!row.category) continue;
        const key = normalizeText(row.category);
        if (!requestedCategories.has(key)) requestedCategories.set(key, { name: row.category, sortOrder: null });
      }
      const missingCategories = [...requestedCategories.entries()]
        .filter(([key]) => !categoryByName.has(key))
        .map(([, category]) => category);
      if (missingCategories.length) {
        const nextSortOrder = (existingCategories ?? []).reduce((highest, category) => Math.max(highest, category.sort_order), -1) + 1;
        const { data: createdCategories, error: categoryCreateError } = await supabase
          .from("categories")
          .insert(missingCategories.map((category, index) => ({
            store_id: branchId,
            name: category.name,
            sort_order: category.sortOrder ?? nextSortOrder + index,
            is_active: true,
          })))
          .select("id, name, is_active");
        if (categoryCreateError) throw categoryCreateError;
        for (const category of createdCategories ?? []) categoryByName.set(normalizeText(category.name), { id: category.id, is_active: true });
      }

      const categoriesToReactivate = [...requestedCategories.keys()]
        .map((key) => categoryByName.get(key))
        .filter((category): category is { id: string; is_active: boolean } => Boolean(category && !category.is_active))
        .map((category) => category.id);
      if (categoriesToReactivate.length) {
        const { error: reactivateError } = await supabase.from("categories").update({ is_active: true }).in("id", categoriesToReactivate);
        if (reactivateError) throw reactivateError;
      }

      const currentCategoryNameById = new Map(categories.map((category) => [category.id, category.name]));
      const existingProductIdByName = new Map<string, string>();
      for (const product of products) {
        const categoryName = product.category_id ? currentCategoryNameById.get(product.category_id) ?? "" : "";
        const key = `${normalizeText(product.name)}::${normalizeText(categoryName)}`;
        if (!existingProductIdByName.has(key)) existingProductIdByName.set(key, product.id);
      }
      const knownProductIds = new Set(products.map((product) => product.id));
      const productRows = importedRows.map((row) => {
        const catalogIdMatch = row.sku?.match(/^CAT-([0-9a-f-]{36})$/i);
        const catalogId = catalogIdMatch?.[1].toLowerCase() ?? null;
        const catalogProductId = catalogId && knownProductIds.has(catalogId) ? catalogId : null;
        const nameMatchKey = `${normalizeText(row.name)}::${normalizeText(row.category)}`;
        const matchedProductId = catalogProductId ?? (!row.sku ? existingProductIdByName.get(nameMatchKey) ?? null : null);

        return {
          id: matchedProductId,
          store_id: branchId,
          category_id: row.category ? categoryByName.get(normalizeText(row.category))?.id ?? null : null,
          external_id: row.sku ?? (matchedProductId ? `CAT-${matchedProductId}` : null),
          name: row.name,
          description: row.description,
          price: row.price,
          unit: row.unit,
          stock_quantity: row.stock,
          badge: row.badge,
          is_active: true,
          updated_at: new Date().toISOString(),
        };
      });
      const rowsWithId = productRows.filter((row) => row.id);
      const rowsWithSku = productRows
        .filter((row) => !row.id && row.external_id)
        .map(({ id: _id, ...row }) => row);
      const rowsWithoutSku = productRows
        .filter((row) => !row.id && !row.external_id)
        .map(({ id: _id, external_id: _externalId, ...row }) => row);

      for (const rows of chunkRows(rowsWithId)) {
        const { error } = await supabase.from("products").upsert(rows, { onConflict: "id" });
        if (error) throw error;
      }
      for (const rows of chunkRows(rowsWithSku)) {
        const { error } = await supabase.from("products").upsert(rows, { onConflict: "store_id,external_id" });
        if (error) throw error;
      }
      for (const rows of chunkRows(rowsWithoutSku)) {
        const { error } = await supabase.from("products").insert(rows);
        if (error) throw error;
      }

      await refreshBranchCatalog(branchId);
      setMessage(`${importedRows.length} produto(s) e ${requestedCategories.size} categoria(s) sincronizados em ${activeBranch?.name ?? "a filial"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível importar a planilha.");
    } finally {
      setImportingCatalog(false);
    }
  }

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !activeBranchId || savingProduct) return;
    setSavingProduct(true);
    setMessage("");
    let uploadedPath = "";
    try {
      const editingProduct = editingProductId ? products.find((product) => product.id === editingProductId) : null;
      if (editingProductId && !editingProduct) throw new Error("O produto selecionado não está mais disponível.");
      const uploadedImages: Array<{ path: string; url: string }> = [];
      for (const file of productImageFiles) {
        const uploaded = await uploadCatalogImage(file, "products");
        uploadedPaths.push(uploaded.path);
        uploadedImages.push(uploaded);
      }
      const productId = editingProduct?.id ?? crypto.randomUUID();
      const imageUrl = editingProduct?.image_url ?? uploadedImages[0]?.url ?? null;
      const productData = {
        category_id: productForm.categoryId || null,
        name: productForm.name.trim(),
        description: productForm.description.trim() || null,
        price: Number(productForm.price.replace(",", ".")),
        unit: productForm.unit.trim() || null,
        stock_quantity: productForm.stock ? Number(productForm.stock.replace(",", ".")) : null,
        image_url: imageUrl,
        badge: productForm.badge.trim() || null,
        is_active: true,
        updated_at: new Date().toISOString(),
      };
      let error;
      if (editingProduct) {
        ({ error } = await supabase
          .from("products")
          .update(productData)
          .eq("id", editingProduct.id)
          .eq("store_id", activeBranchId));
      } else {
        ({ error } = await supabase.from("products").insert({
          id: productId,
          store_id: activeBranchId,
          external_id: `CAT-${productId}`,
          ...productData,
        }));
      }
      if (error) throw error;

      const existingImages = editingProduct?.product_images ?? [];
      const hasLegacyImage = existingImages.some((image) => image.id === "legacy");
      if (editingProduct?.image_url && hasLegacyImage) {
        const { error: legacyError } = await supabase.from("product_images").insert({ product_id: productId, store_id: activeBranchId, image_url: editingProduct.image_url, sort_order: 0 });
        if (legacyError) throw legacyError;
      }
      const nextImageSortOrder = hasLegacyImage
        ? 1
        : existingImages.reduce((highest, image) => Math.max(highest, image.sort_order), -1) + 1;
      if (uploadedImages.length) {
        const { error: galleryError } = await supabase.from("product_images").insert(uploadedImages.map((image, index) => ({ product_id: productId, store_id: activeBranchId, image_url: image.url, sort_order: nextImageSortOrder + index })));
        if (galleryError) throw galleryError;
      }

      const wasEditing = Boolean(editingProduct);
      resetProductEditor();
      await refreshBranchCatalog(activeBranchId);
      setCatalogEditorMode(null);
      setMessage(wasEditing ? "Produto atualizado no catálogo e pronto para a próxima exportação." : "Produto adicionado ao catálogo.");
    } catch (error) {
      if (uploadedPaths.length) await supabase.storage.from(CATALOG_IMAGE_BUCKET).remove(uploadedPaths);
      setMessage(error instanceof Error ? error.message : `Não foi possível ${editingProductId ? "atualizar" : "adicionar"} o produto.`);
    } finally {
      setSavingProduct(false);
    }
  }

  function openQuickProductImage(productId: string) {
    if (uploadingProductImageId) return;
    quickProductImageTargetRef.current = productId;
    if (quickProductImageInputRef.current) {
      quickProductImageInputRef.current.value = "";
      quickProductImageInputRef.current.click();
    }
  }

  async function updateQuickProductImage(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = "";
    const productId = quickProductImageTargetRef.current;
    const product = products.find((item) => item.id === productId);
    if (!selectedFiles.length || !product || !supabase || !activeBranchId || uploadingProductImageId) return;

    const invalidFile = selectedFiles.find((file) => validateCatalogImage(file));
    if (invalidFile) {
      setMessage(validateCatalogImage(invalidFile));
      return;
    }
    const existingImages = product.product_images ?? [];
    const remaining = Math.max(0, activeProductImageLimit - existingImages.length);
    if (!remaining) {
      setMessage(`${product.name} já possui o limite de ${activeProductImageLimit} foto(s). Edite o produto para remover uma foto.`);
      return;
    }
    const files = selectedFiles.slice(0, remaining);

    setUploadingProductImageId(productId);
    setMessage(`Enviando ${files.length} foto(s) de ${product.name}...`);
    const uploadedPaths: string[] = [];
    try {
      const uploadedImages: Array<{ path: string; url: string }> = [];
      for (const file of files) {
        const uploaded = await uploadCatalogImage(file, "products");
        uploadedPaths.push(uploaded.path);
        uploadedImages.push(uploaded);
      }
      const hasLegacyImage = existingImages.some((image) => image.id === "legacy");
      if (product.image_url && hasLegacyImage) {
        const { error } = await supabase.from("product_images").insert({ product_id: productId, store_id: activeBranchId, image_url: product.image_url, sort_order: 0 });
        if (error) throw error;
      }
      const nextSortOrder = hasLegacyImage ? 1 : existingImages.reduce((highest, image) => Math.max(highest, image.sort_order), -1) + 1;
      const { error: galleryError } = await supabase.from("product_images").insert(uploadedImages.map((image, index) => ({ product_id: productId, store_id: activeBranchId, image_url: image.url, sort_order: nextSortOrder + index })));
      if (galleryError) throw galleryError;
      if (!product.image_url) {
        const { error } = await supabase.from("products").update({ image_url: uploadedImages[0].url, updated_at: new Date().toISOString() }).eq("id", productId).eq("store_id", activeBranchId);
        if (error) throw error;
      }
      await refreshBranchCatalog(activeBranchId);
      setMessage(`${uploadedImages.length} foto(s) adicionada(s) a ${product.name}.${selectedFiles.length > remaining ? ` O limite da filial é ${activeProductImageLimit}.` : ""}`);
    } catch (error) {
      if (uploadedPaths.length) await supabase.storage.from(CATALOG_IMAGE_BUCKET).remove(uploadedPaths);
      setMessage(error instanceof Error ? `Não foi possível atualizar a foto: ${error.message}` : "Não foi possível atualizar a foto do produto.");
    } finally {
      setUploadingProductImageId("");
      quickProductImageTargetRef.current = "";
    }
  }

  function removeSelectedProductImage(index: number) {
    setProductImageFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setProductImagePreviews((current) => current.filter((_, itemIndex) => itemIndex !== index));
    if (productImageInputRef.current) productImageInputRef.current.value = "";
  }

  async function removeExistingProductImage(product: Product, image: ProductImage) {
    if (!supabase || !activeBranchId || !window.confirm("Remover esta foto do produto?")) return;
    setSavingProduct(true);
    setMessage("");
    const remainingImages = (product.product_images ?? []).filter((item) => item.id !== image.id);
    const nextPrimaryImage = remainingImages[0]?.image_url ?? null;
    const result = image.id === "legacy"
      ? await supabase.from("products").update({ image_url: nextPrimaryImage, updated_at: new Date().toISOString() }).eq("id", product.id).eq("store_id", activeBranchId)
      : await supabase.from("product_images").delete().eq("id", image.id).eq("store_id", activeBranchId);
    if (result.error) {
      setMessage(result.error.message);
      setSavingProduct(false);
      return;
    }
    if (image.id !== "legacy" && product.image_url === image.image_url) {
      const { error } = await supabase.from("products").update({ image_url: nextPrimaryImage, updated_at: new Date().toISOString() }).eq("id", product.id).eq("store_id", activeBranchId);
      if (error) {
        setMessage(error.message);
        setSavingProduct(false);
        return;
      }
    }
    const imagePath = storagePathFromPublicUrl(image.image_url);
    if (imagePath) await supabase.storage.from(CATALOG_IMAGE_BUCKET).remove([imagePath]);
    await refreshBranchCatalog(activeBranchId);
    setSavingProduct(false);
    setMessage("Foto removida do produto.");
  }

  async function deleteProduct(productId: string) {
    if (!supabase || !window.confirm("Remover este produto do catálogo?")) return;
    const { error } = await supabase.from("products").update({ is_active: false }).eq("id", productId);
    if (!error) setProducts((current) => current.filter((product) => product.id !== productId));
    setMessage(error?.message ?? "Produto removido.");
  }

  const activeBranch = useMemo(() => branches.find((branch) => branch.id === activeBranchId), [branches, activeBranchId]);
  const editingProduct = useMemo(() => products.find((product) => product.id === editingProductId) ?? null, [products, editingProductId]);
  const editingProductImages = editingProduct?.product_images ?? [];
  const productEditorImageCount = editingProductImages.length + productImageFiles.length;

  if (loading) return <main className="admin-page"><p>Carregando painel...</p></main>;
  if (accessDenied) return <AdminDenied />;
  if (!session) return <AdminLogin />;

  return (
    <main className="admin-page">
      <header className="admin-topbar">
        <a href="/" className="admin-back"><ArrowLeft size={17} /> Catálogo público</a>
        <div className="admin-user"><span>{session.user.email}</span><button onClick={() => supabase?.auth.signOut()}><LogOut size={16} /> Sair</button></div>
      </header>
      <section className={isCompanyPortal ? "admin-page-inner" : "admin-page-inner admin-page-inner-platform"}>
        <div className={isCompanyPortal ? "company-portal-workspace" : "admin-console-layout"}>
          {!isCompanyPortal ? (
            <PlatformAdminSidebar
              section={adminSection}
              companyCount={adminTenants.length}
              onCompanies={showCompanies}
              onNew={() => { setTenant(null); setBranches([]); setActiveBranchId(""); setAdminSection("new"); setMessage(""); }}
            />
          ) : null}
          <div className={isCompanyPortal ? "company-portal-content" : "admin-console-content"}>
        {isCompanyPortal || adminSection === "companies" || adminSection === "new" ? <div className="admin-page-heading"><span>{isCompanyPortal ? tenant?.name ?? "Portal da empresa" : "Central dos administradores"}</span><h1>{isCompanyPortal ? "Gerencie os catálogos da sua empresa" : adminSection === "new" ? "Nova empresa" : "Empresas"}</h1><p>{isCompanyPortal ? "Escolha uma filial e cadastre as categorias e os produtos que serão exibidos aos clientes." : adminSection === "new" ? "Crie a empresa, a primeira filial e o acesso do cliente." : "Selecione uma empresa para gerenciar."}</p></div> : null}

        {!isCompanyPortal && adminSection === "companies" ? (
          <AdminCompanies tenants={adminTenants} branches={adminBranches} onNew={() => { setTenant(null); setBranches([]); setActiveBranchId(""); setAdminSection("new"); }} onOpenCatalog={openAdminCatalog} onOpenSettings={openCompanySettings} />
        ) : !tenant && isCompanyPortal ? (
          <section className="admin-form-panel access-denied-panel"><h2>Acesso da empresa não vinculado</h2><p>O login foi aceito, mas não foi encontrado o vínculo deste e-mail com uma empresa cadastrada.</p><button className="admin-primary" onClick={() => supabase?.auth.signOut()}>Sair e entrar novamente</button></section>
        ) : adminSection === "new" || !tenant ? (
          <form className="admin-form-panel new-company-form" onSubmit={createCompany}>
            <div className="branch-form-heading"><div><span>Novo cliente</span><h2>Cadastrar empresa</h2><p>Crie a empresa, a primeira filial e o acesso principal que será entregue ao responsável.</p></div><Building2 size={22} /></div>
            <div className="admin-form-grid">
              <label>Empresa<input value={companyForm.name} onChange={(event) => setCompanyForm({ ...companyForm, name: event.target.value })} placeholder="Ex.: Material Forte" required /></label>
              <label>Primeira filial<input value={companyForm.branch} onChange={(event) => setCompanyForm({ ...companyForm, branch: event.target.value })} placeholder="Ex.: Filial Centro" required /></label>
              <label>WhatsApp<input value={companyForm.phone} onChange={(event) => setCompanyForm({ ...companyForm, phone: formatWhatsapp(event.target.value) })} placeholder="(63) 99999-9999" inputMode="tel" required /></label>
              <label>Nome do responsável<input value={companyForm.userName} onChange={(event) => setCompanyForm({ ...companyForm, userName: event.target.value })} placeholder="Nome do cliente" required /></label>
              <label>E-mail de acesso<input type="email" value={companyForm.userEmail} onChange={(event) => setCompanyForm({ ...companyForm, userEmail: event.target.value })} placeholder="cliente@empresa.com" required /></label>
              <label>Senha de acesso<input type="password" minLength={6} value={companyForm.userPassword} onChange={(event) => setCompanyForm({ ...companyForm, userPassword: event.target.value })} placeholder="Mínimo de 6 caracteres" required /></label>
              <label>Endereço<input value={companyForm.address} onChange={(event) => setCompanyForm({ ...companyForm, address: event.target.value })} placeholder="Rua e número" required /></label>
              <label>Latitude<input value={companyForm.latitude} onChange={(event) => setCompanyForm({ ...companyForm, latitude: event.target.value })} placeholder="-7,190800" inputMode="decimal" required /></label>
              <label>Longitude<input value={companyForm.longitude} onChange={(event) => setCompanyForm({ ...companyForm, longitude: event.target.value })} placeholder="-48,207300" inputMode="decimal" required /></label>
            </div>
            <button className="admin-secondary branch-location-button" type="button" onClick={() => captureBranchLocation("company")} disabled={Boolean(locatingBranchForm)}><LocateFixed size={16} /> {locatingBranchForm === "company" ? "Obtendo localização..." : "Usar localização atual da filial"}</button>
            {locationIssue?.target === "company" ? <LocationHelp issue={locationIssue.message} onRetry={() => captureBranchLocation("company")} /> : null}
            <button className="admin-primary" type="submit"><Plus size={17} /> Criar empresa, filial e acesso</button>
          </form>
        ) : !isCompanyPortal && adminSection === "settings" ? (
          <section className="company-settings-view">
            <header className="company-settings-header">
              <div className="company-settings-title"><button className="icon-button" type="button" title="Voltar para empresas" aria-label="Voltar para empresas" onClick={showCompanies}><ArrowLeft size={18} /></button><span className="company-settings-logo" style={{ "--company-color": companyIdentity.themeColor } as CSSProperties}>{companyProfilePreview || companyIdentity.profileImageUrl ? <img src={companyProfilePreview || companyIdentity.profileImageUrl} alt="" /> : tenant.name.trim().slice(0, 2).toUpperCase()}</span><div><span>Gerenciar empresa</span><h2>{tenant.name}</h2><p>{branches.length} {branches.length === 1 ? "filial vinculada" : "filiais vinculadas"} · {companyIdentity.isActive ? "Empresa ativa" : "Empresa inativa"}</p></div></div>
              <div className="company-settings-actions"><button className="admin-secondary" type="button" onClick={() => { setAdminSection("catalog"); setShowBranchForm(true); }}><Plus size={16} /> Nova filial</button><button className="admin-secondary" type="button" onClick={() => openAdminCatalog(tenant.id)}><Package size={16} /> Abrir catálogo</button></div>
            </header>
            <div className="company-settings-layout">
              <CompanySettingsNav section={companySettingsSection} onChange={(section) => { setCompanySettingsSection(section); if (section === "parameters") setParameterScope("company"); }} />
              <div className="company-settings-content">
                {companySettingsSection === "overview" ? (
                  <div className="settings-overview">
                    <section className="company-overview-banner">
                      <div className="company-overview-icon" style={{ background: companyIdentity.themeColor }}>{companyIdentity.profileImageUrl ? <img src={companyIdentity.profileImageUrl} alt="" /> : <Building2 size={24} />}</div>
                      <div><span>Visão geral</span><h2>{tenant.name}</h2><p>Informações centrais da empresa e das unidades vinculadas.</p></div>
                    </section>
                    <div className="settings-metric-grid">
                      <div className="settings-metric"><Store size={19} /><span>Filiais</span><strong>{branches.length}</strong></div>
                      <div className="settings-metric"><KeyRound size={19} /><span>Acesso principal</span><strong>{loadingSettings ? "Carregando" : accessForm.email || "Não configurado"}</strong></div>
                      <div className="settings-metric"><Truck size={19} /><span>Regra de frete</span><strong>{companyCalculatesDeliveryFee ? "Calculado" : "A combinar"}</strong></div>
                      <div className="settings-metric"><Power size={19} /><span>Status público</span><strong>{companyIdentity.isActive ? "Ativa" : "Inativa"}</strong></div>
                    </div>
                    <section className="admin-form-panel settings-branch-panel">
                      <div className="branch-form-heading"><div><span>Estrutura</span><h2>Filiais da empresa</h2></div><Store size={21} /></div>
                      <div className="settings-branch-list">
                        {branches.map((branch) => (
                          <button className="settings-branch-row" type="button" key={branch.id} onClick={() => { setActiveBranchId(branch.id); setParameterScope("branch"); setCompanySettingsSection("parameters"); }}>
                            <div className="settings-branch-avatar"><Store size={17} /></div>
                            <div><strong>{branch.name}</strong><small>{branch.address || "Endereço ainda não informado"}</small></div>
                            <span>{branch.latitude != null && branch.longitude != null ? "Localização configurada" : "Sem localização"}<ChevronRight size={15} /></span>
                          </button>
                        ))}
                        {!branches.length ? <p className="admin-muted">Nenhuma filial vinculada.</p> : null}
                      </div>
                    </section>
                  </div>
                ) : null}
                {companySettingsSection === "identity" ? (
                  <form className="admin-form-panel company-settings-panel company-identity-panel" onSubmit={saveCompanyIdentity}>
                    <div className="branch-form-heading"><div><span>Identidade da empresa</span><h2>Marca e disponibilidade</h2><p>Essas informações personalizam todos os catálogos e filiais da empresa.</p></div><Palette size={21} /></div>
                    <div className="company-profile-field">
                      <div className="company-profile-preview" style={{ "--company-color": companyIdentity.themeColor } as CSSProperties}>{companyProfilePreview || companyIdentity.profileImageUrl ? <img src={companyProfilePreview || companyIdentity.profileImageUrl} alt={`Foto de ${tenant.name}`} /> : <Building2 size={30} />}</div>
                      <div><strong>Foto de perfil</strong><small>JPG, PNG ou WebP · máximo 5 MB</small><div className="company-profile-actions"><button className="admin-secondary" type="button" onClick={() => companyProfileInputRef.current?.click()} disabled={savingCompanyIdentity}><ImagePlus size={16} /> Escolher foto</button>{!companyProfileFile && companyIdentity.profileImageUrl ? <button className="icon-button" type="button" title="Remover foto" aria-label="Remover foto da empresa" onClick={removeCompanyProfileImage} disabled={savingCompanyIdentity}><Trash2 size={17} /></button> : null}</div><input ref={companyProfileInputRef} className="catalog-import-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={selectCompanyProfileImage} /></div>
                    </div>
                    <label className="company-color-field"><span>Cor principal do tema</span><div><input type="color" value={companyIdentity.themeColor} onChange={(event) => setCompanyIdentity({ ...companyIdentity, themeColor: event.target.value })} aria-label="Cor principal do tema" /><strong>{companyIdentity.themeColor.toUpperCase()}</strong><span className="company-color-sample" style={{ background: companyIdentity.themeColor }}>Marca</span></div><small>Aplicada no cabeçalho, botões e destaques do catálogo.</small></label>
                    <ParameterToggle checked={companyIdentity.isActive} title="Empresa ativa no catálogo público" description={companyIdentity.isActive ? "As filiais estão disponíveis para os clientes." : "A empresa e todas as filiais ficam ocultas do catálogo público."} onChange={(isActive) => setCompanyIdentity({ ...companyIdentity, isActive })} />
                    <div className="admin-form-actions"><button className="admin-primary" type="submit" disabled={savingCompanyIdentity}><Save size={16} /> {savingCompanyIdentity ? "Salvando..." : "Salvar identidade"}</button></div>
                  </form>
                ) : null}
                {companySettingsSection === "access" ? (
                  <form className="admin-form-panel company-settings-panel" onSubmit={saveCompanyAccess}>
                    <div className="branch-form-heading"><div><span>Acesso principal</span><h2>E-mail e senha da empresa</h2><p>Este é o único acesso usado pela empresa para administrar todas as filiais.</p></div><KeyRound size={21} /></div>
                    {loadingSettings ? <p className="admin-muted">Carregando configurações...</p> : <>
                      <label>Nome do responsável<input value={accessForm.name} onChange={(event) => setAccessForm({ ...accessForm, name: event.target.value })} required /></label>
                      <label>E-mail de acesso<input type="email" value={accessForm.email} onChange={(event) => setAccessForm({ ...accessForm, email: event.target.value })} required /></label>
                      <label>Nova senha<input type="password" minLength={6} value={accessForm.password} onChange={(event) => setAccessForm({ ...accessForm, password: event.target.value })} placeholder="Deixe em branco para manter a senha atual" /></label>
                      <div className="admin-form-actions"><button className="admin-primary" type="submit" disabled={savingAccess}><Save size={16} /> {savingAccess ? "Salvando..." : "Salvar acesso"}</button></div>
                    </>}
                  </form>
                ) : null}
                {companySettingsSection === "parameters" ? (
                  <ParameterWorkspace
                    tenant={tenant}
                    branches={branches}
                    activeBranchId={activeBranchId}
                    scope={parameterScope}
                    companyEnabled={companyCalculatesDeliveryFee}
                    branchModes={branchFreightModes}
                    branchFees={branchDeliveryFees}
                    companyCatalogLayout={companyCatalogLayout}
                    branchCatalogLayouts={branchCatalogLayouts}
                    companyProductImageLimit={companyProductImageLimit}
                    branchProductImageLimits={branchProductImageLimits}
                    loading={loadingSettings}
                    saving={savingParameters}
                    onScopeChange={setParameterScope}
                    onBranchChange={(branchId) => { setActiveBranchId(branchId); setParameterScope("branch"); setMessage(""); }}
                    onCompanyEnabledChange={setCompanyCalculatesDeliveryFee}
                    onBranchModeChange={(branchId, mode) => setBranchFreightModes((current) => ({ ...current, [branchId]: mode }))}
                    onBranchFeeChange={(branchId, fee) => setBranchDeliveryFees((current) => ({ ...current, [branchId]: fee }))}
                    onCompanyCatalogLayoutChange={setCompanyCatalogLayout}
                    onBranchCatalogLayoutChange={(branchId, mode) => setBranchCatalogLayouts((current) => ({ ...current, [branchId]: mode }))}
                    onCompanyProductImageLimitChange={setCompanyProductImageLimit}
                    onBranchProductImageLimitChange={(branchId, mode) => setBranchProductImageLimits((current) => ({ ...current, [branchId]: mode }))}
                    onSaveCompany={saveCompanyParameters}
                    onSaveBranch={saveBranchParameters}
                  />
                ) : null}
                {companySettingsSection === "danger" ? (
                  <section className="admin-form-panel company-settings-panel danger-zone">
                    <div className="branch-form-heading"><div><span>Zona de exclusão</span><h2>Excluir empresa</h2><p>Remove definitivamente a empresa, todas as filiais, produtos, integrações, pedidos e o acesso principal.</p></div><TriangleAlert size={22} /></div>
                    {showDeleteCompany ? <>
                      <label>Digite <strong>{tenant.name}</strong> para confirmar<input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} autoComplete="off" /></label>
                      <div className="admin-form-actions"><button className="admin-secondary" type="button" onClick={() => { setShowDeleteCompany(false); setDeleteConfirmation(""); }}>Cancelar</button><button className="admin-danger" type="button" disabled={deletingCompany || deleteConfirmation.trim() !== tenant.name} onClick={deleteCompany}><Trash2 size={16} /> {deletingCompany ? "Excluindo..." : "Excluir definitivamente"}</button></div>
                    </> : <button className="admin-danger" type="button" onClick={() => setShowDeleteCompany(true)}><Trash2 size={16} /> Excluir empresa</button>}
                  </section>
                ) : null}
              </div>
            </div>
          </section>
        ) : (
          <>
            <section className="workspace-bar"><div><span>Empresa</span><strong><Building2 size={18} /> {tenant.name}</strong></div><label>Filial<select value={activeBranchId} onChange={(event) => setActiveBranchId(event.target.value)}>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><div className="workspace-actions">{!isCompanyPortal ? <button className="admin-primary" onClick={() => setShowBranchForm((current) => !current)}><Plus size={16} /> Nova filial</button> : null}<button className="admin-secondary" onClick={() => session.user.id && loadWorkspace(session.user.id, isCompanyPortal ? undefined : tenant.id)}><RefreshCw size={16} /> Atualizar</button></div></section>
            {!isCompanyPortal && showBranchForm ? <form className="admin-form-panel branch-create-panel" onSubmit={createBranch}><div className="branch-form-heading"><div><span>Nova filial</span><h2>Adicionar unidade à {tenant.name}</h2></div><button className="icon-button" type="button" title="Fechar" onClick={() => setShowBranchForm(false)}><X size={18} /></button></div><div className="admin-form-grid"><label>Nome da filial<input value={branchForm.name} onChange={(event) => setBranchForm({ ...branchForm, name: event.target.value })} placeholder="Ex.: Unidade Centro" required /></label><label>WhatsApp<input value={branchForm.phone} onChange={(event) => setBranchForm({ ...branchForm, phone: formatWhatsapp(event.target.value) })} placeholder="(63) 99999-9999" inputMode="tel" required /></label><label>Latitude<input value={branchForm.latitude} onChange={(event) => setBranchForm({ ...branchForm, latitude: event.target.value })} placeholder="-7,190800" inputMode="decimal" required /></label><label>Longitude<input value={branchForm.longitude} onChange={(event) => setBranchForm({ ...branchForm, longitude: event.target.value })} placeholder="-48,207300" inputMode="decimal" required /></label></div><label>Endereço<input value={branchForm.address} onChange={(event) => setBranchForm({ ...branchForm, address: event.target.value })} placeholder="Rua, número e bairro" required /></label><button className="admin-secondary branch-location-button" type="button" onClick={() => captureBranchLocation("branch")} disabled={Boolean(locatingBranchForm)}><LocateFixed size={16} /> {locatingBranchForm === "branch" ? "Obtendo localização..." : "Usar localização atual da filial"}</button>{locationIssue?.target === "branch" ? <LocationHelp issue={locationIssue.message} onRetry={() => captureBranchLocation("branch")} /> : null}<div className="admin-form-actions"><button className="admin-secondary" type="button" onClick={() => setShowBranchForm(false)}>Cancelar</button><button className="admin-primary" type="submit" disabled={savingBranch}><Plus size={16} /> {savingBranch ? "Criando..." : "Criar filial"}</button></div></form> : null}
            {activeBranch ? <p className="branch-note"><Store size={16} /> Editando: <strong>{activeBranch.name}</strong></p> : null}
            {!isCompanyPortal && activeBranch ? <form className="admin-form-panel branch-location-panel" onSubmit={saveExistingBranchLocation}><div className="branch-form-heading"><div><span>Localização da filial</span><h2>Endereço e ponto no mapa</h2></div><MapPin size={21} /></div><label>Endereço<input value={branchLocationForm.address} onChange={(event) => setBranchLocationForm({ ...branchLocationForm, address: event.target.value })} placeholder="Rua, número e bairro" required /></label><div className="admin-form-grid"><label>Latitude<input value={branchLocationForm.latitude} onChange={(event) => setBranchLocationForm({ ...branchLocationForm, latitude: event.target.value })} inputMode="decimal" required /></label><label>Longitude<input value={branchLocationForm.longitude} onChange={(event) => setBranchLocationForm({ ...branchLocationForm, longitude: event.target.value })} inputMode="decimal" required /></label></div>{locationIssue?.target === "existing" ? <LocationHelp issue={locationIssue.message} onRetry={() => captureBranchLocation("existing")} /> : null}<div className="admin-form-actions"><button className="admin-secondary" type="button" onClick={() => captureBranchLocation("existing")} disabled={Boolean(locatingBranchForm)}><LocateFixed size={16} /> {locatingBranchForm === "existing" ? "Obtendo..." : "Usar localização atual"}</button><button className="admin-primary" type="submit" disabled={savingBranchLocation}><Save size={16} /> {savingBranchLocation ? "Salvando..." : "Salvar localização"}</button></div></form> : null}
            <section className="catalog-media-panel">
              <div className="branch-cover-preview">
                {coverImagePreview || activeBranch?.cover_image_url ? <img src={coverImagePreview || activeBranch?.cover_image_url || ""} alt={`Capa de ${activeBranch?.name ?? "filial"}`} /> : <Package size={30} />}
              </div>
              <div className="catalog-media-copy"><span>Capa da filial</span><strong>{activeBranch?.name ?? "Selecione uma filial"}</strong><small>JPG, PNG ou WebP · máximo 5 MB</small></div>
              <div className="catalog-media-actions">
                <button className="admin-secondary" type="button" onClick={() => coverImageInputRef.current?.click()} disabled={!activeBranchId || uploadingCover}><ImagePlus size={16} /> Escolher foto</button>
                {coverImageFile ? <button className="admin-primary" type="button" onClick={saveBranchCover} disabled={uploadingCover}><Save size={16} /> {uploadingCover ? "Enviando..." : "Salvar capa"}</button> : null}
                {!coverImageFile && activeBranch?.cover_image_url ? <button className="icon-button cover-remove-button" type="button" title="Remover capa" aria-label="Remover capa" onClick={removeBranchCover} disabled={uploadingCover}><Trash2 size={17} /></button> : null}
                <input ref={coverImageInputRef} className="catalog-import-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={selectCoverImage} />
              </div>
            </section>
            <section className="catalog-import-panel">
              <div className="catalog-import-heading"><FileSpreadsheet size={22} /><div><span>Planilha do catálogo</span><strong>{activeBranch?.name ?? "Selecione uma filial"}</strong><small>{products.length} produto(s) · {categories.length} categoria(s)</small></div></div>
              <div className="catalog-import-actions">
                <button className="admin-secondary" type="button" onClick={downloadCatalogTemplate} disabled={!activeBranchId || importingCatalog || exportingCatalog}><Download size={16} /> {exportingCatalog ? "Exportando..." : "Exportar catálogo"}</button>
                <button className="admin-primary" type="button" onClick={() => importInputRef.current?.click()} disabled={!activeBranchId || importingCatalog || exportingCatalog}><Upload size={16} /> {importingCatalog ? "Importando..." : "Importar Excel"}</button>
                <input ref={importInputRef} className="catalog-import-input" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={importCatalog} />
              </div>
            </section>
            <section className="catalog-management-bar">
              <div className="catalog-management-copy"><span>Cadastro manual</span><strong>Produtos e categorias</strong></div>
              <button className={catalogEditorMode ? "admin-secondary" : "admin-primary"} type="button" onClick={() => catalogEditorMode ? closeCatalogEditor() : openNewProductEditor()}>
                {catalogEditorMode ? <X size={16} /> : <Plus size={16} />}
                {catalogEditorMode ? "Fechar cadastro" : "Adicionar ao catálogo"}
              </button>
            </section>
            {catalogEditorMode ? (
              <section className="admin-form-panel catalog-editor-panel">
                <div className="branch-form-heading"><div><span>Cadastro manual</span><h2>{catalogEditorMode === "product" ? (editingProductId ? "Editar produto" : "Novo produto") : "Nova categoria"}</h2></div><button className="icon-button" type="button" title="Fechar" aria-label="Fechar cadastro" onClick={closeCatalogEditor}><X size={18} /></button></div>
                <div className="catalog-editor-tabs" role="tablist" aria-label="Tipo de cadastro">
                  <button className={catalogEditorMode === "product" ? "active" : ""} type="button" role="tab" aria-selected={catalogEditorMode === "product"} onClick={() => { if (catalogEditorMode !== "product") openNewProductEditor(); }}>Produto</button>
                  <button className={catalogEditorMode === "category" ? "active" : ""} type="button" role="tab" aria-selected={catalogEditorMode === "category"} onClick={openCategoryEditor}>Categoria</button>
                </div>
                {catalogEditorMode === "category" ? (
                  <form className="inline-form" onSubmit={createCategory}><input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="Ex.: Material de construção" required /><button className="admin-primary" type="submit"><Plus size={16} /> Adicionar categoria</button></form>
                ) : (
                <form className="admin-product-form" onSubmit={createProduct}>
                  <label>Nome<input value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} required /></label>
                  <label>Descrição<textarea value={productForm.description} onChange={(event) => setProductForm({ ...productForm, description: event.target.value })} /></label>
                  <div className="admin-form-grid"><label>Preço<input value={productForm.price} onChange={(event) => setProductForm({ ...productForm, price: event.target.value })} placeholder="0,00" inputMode="decimal" required /></label><label>Unidade<input value={productForm.unit} onChange={(event) => setProductForm({ ...productForm, unit: event.target.value })} placeholder="unidade, caixa, kg" /></label></div>
                  <div className="admin-form-grid"><label>Estoque<input value={productForm.stock} onChange={(event) => setProductForm({ ...productForm, stock: event.target.value })} inputMode="decimal" /></label><label>Categoria<select value={productForm.categoryId} onChange={(event) => setProductForm({ ...productForm, categoryId: event.target.value })}><option value="">Sem categoria</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label></div>
                  <div className="product-gallery-editor">
                    <div className="product-gallery-editor-heading"><div><strong>Fotos do produto</strong><small>{productEditorImageCount} de {activeProductImageLimit} foto(s) utilizadas</small></div><button className="admin-secondary" type="button" onClick={() => productImageInputRef.current?.click()} disabled={savingProduct || productEditorImageCount >= activeProductImageLimit}><ImagePlus size={16} /> Adicionar fotos</button></div>
                    <div className="product-gallery-editor-grid">
                      {editingProductImages.map((image, index) => <div className="product-gallery-editor-item" key={image.id}><img src={image.image_url} alt={`Foto ${index + 1} de ${editingProduct?.name ?? "produto"}`} /><button type="button" title="Remover foto" aria-label={`Remover foto ${index + 1}`} onClick={() => editingProduct && removeExistingProductImage(editingProduct, image)} disabled={savingProduct}><Trash2 size={15} /></button>{index === 0 ? <span>Capa</span> : null}</div>)}
                      {productImagePreviews.map((preview, index) => <div className="product-gallery-editor-item pending" key={preview}><img src={preview} alt={`Nova foto ${index + 1}`} /><button type="button" title="Retirar seleção" aria-label={`Retirar nova foto ${index + 1}`} onClick={() => removeSelectedProductImage(index)} disabled={savingProduct}><X size={15} /></button><span>Nova</span></div>)}
                      {!productEditorImageCount ? <div className="product-gallery-editor-empty"><Package size={25} /><span>Sem fotos</span></div> : null}
                    </div>
                    <small className="product-gallery-editor-help">JPG, PNG ou WebP · máximo 5 MB por arquivo. A primeira foto será a capa.</small>
                    <input ref={productImageInputRef} className="catalog-import-input" type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={selectProductImage} />
                  </div>
                  <label>Selo opcional<input value={productForm.badge} onChange={(event) => setProductForm({ ...productForm, badge: event.target.value })} placeholder="Mais vendido" /></label>
                  <button className="admin-primary" type="submit" disabled={savingProduct}>{editingProductId ? <Save size={16} /> : <Plus size={16} />} {savingProduct ? "Salvando..." : editingProductId ? "Salvar alterações" : "Adicionar produto"}</button>
                </form>
                )}
              </section>
            ) : null}
            <div className="admin-columns catalog-overview">
              <section className="admin-form-panel">
                <h2>Categorias <span className="count-badge">{categories.length}</span></h2>
                <div className="admin-list">{categories.map((category) => <div className="admin-list-row" key={category.id}><span>{category.name}</span><small>{products.filter((product) => product.category_id === category.id).length} produtos</small></div>)}{!categories.length ? <p className="admin-muted">Nenhuma categoria cadastrada.</p> : null}</div>
              </section>
              <section className="admin-form-panel">
                <h2>Produtos da filial <span className="count-badge">{products.length}</span></h2>
                <div className="product-admin-list">{products.map((product) => <div className="product-admin-row" key={product.id}><div className="product-admin-info"><strong>{product.name}</strong><small>{product.unit ?? "unidade"} · R$ {Number(product.price).toFixed(2).replace(".", ",")} · {product.product_images?.length ?? 0}/{activeProductImageLimit} foto(s)</small></div><div className="product-admin-actions"><button className="product-photo-button" type="button" title="Adicionar fotos" aria-label={`Adicionar fotos de ${product.name}`} disabled={Boolean(uploadingProductImageId) || (product.product_images?.length ?? 0) >= activeProductImageLimit} onClick={() => openQuickProductImage(product.id)}>{uploadingProductImageId === product.id ? <RefreshCw size={17} /> : <ImagePlus size={17} />}</button><button className="product-edit-button" type="button" title="Editar produto e fotos" aria-label={`Editar ${product.name}`} disabled={Boolean(uploadingProductImageId)} onClick={() => editProduct(product)}><Pencil size={17} /></button><button className="product-delete-button" type="button" title="Remover produto" aria-label={`Remover ${product.name}`} disabled={Boolean(uploadingProductImageId)} onClick={() => deleteProduct(product.id)}><Trash2 size={17} /></button></div></div>)}{!products.length ? <p className="admin-muted">Nenhum produto cadastrado.</p> : null}</div>
                <input ref={quickProductImageInputRef} className="catalog-import-input" type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={updateQuickProductImage} />
              </section>
            </div>
          </>
        )}
        {message ? <p className="admin-message admin-console-message">{message}</p> : null}
          </div>
        </div>
      </section>
    </main>
  );
}

function PlatformAdminSidebar({
  section,
  companyCount,
  onCompanies,
  onNew,
}: {
  section: "companies" | "new" | "catalog" | "settings";
  companyCount: number;
  onCompanies: () => void;
  onNew: () => void;
}) {
  return (
    <aside className="admin-console-sidebar">
      <div className="admin-sidebar-brand"><span className="admin-sidebar-mark"><Building2 size={19} /></span><div><strong>Catálogo Fácil</strong><small>Administração</small></div></div>
      <nav className="admin-sidebar-nav" aria-label="Navegação administrativa">
        <button className={section !== "new" ? "active" : ""} type="button" onClick={onCompanies}><Building2 size={18} /><span><strong>Empresas</strong><small>{companyCount} cadastrada(s)</small></span><ChevronRight size={16} /></button>
        <button className={section === "new" ? "active" : ""} type="button" onClick={onNew}><Plus size={18} /><span><strong>Nova empresa</strong><small>Criar acesso e filial</small></span><ChevronRight size={16} /></button>
      </nav>
    </aside>
  );
}

function CompanySettingsNav({ section, onChange }: { section: CompanySettingsSection; onChange: (section: CompanySettingsSection) => void }) {
  const options: Array<{ id: CompanySettingsSection; label: string; icon: typeof Settings }> = [
    { id: "overview", label: "Resumo", icon: LayoutDashboard },
    { id: "identity", label: "Identidade", icon: Palette },
    { id: "access", label: "Acesso", icon: KeyRound },
    { id: "parameters", label: "Parâmetros", icon: SlidersHorizontal },
    { id: "danger", label: "Exclusão", icon: TriangleAlert },
  ];

  return (
    <nav className="company-settings-nav" aria-label="Configurações da empresa">
      {options.map((option) => {
        const Icon = option.icon;
        return <button className={section === option.id ? "active" : ""} type="button" key={option.id} onClick={() => onChange(option.id)}><Icon size={17} /><span>{option.label}</span></button>;
      })}
    </nav>
  );
}

function ParameterWorkspace({
  tenant,
  branches,
  activeBranchId,
  scope,
  companyEnabled,
  branchModes,
  branchFees,
  companyCatalogLayout,
  branchCatalogLayouts,
  companyProductImageLimit,
  branchProductImageLimits,
  loading,
  saving,
  onScopeChange,
  onBranchChange,
  onCompanyEnabledChange,
  onBranchModeChange,
  onBranchFeeChange,
  onCompanyCatalogLayoutChange,
  onBranchCatalogLayoutChange,
  onCompanyProductImageLimitChange,
  onBranchProductImageLimitChange,
  onSaveCompany,
  onSaveBranch,
}: {
  tenant: Tenant;
  branches: Branch[];
  activeBranchId: string;
  scope: ParameterScope;
  companyEnabled: boolean;
  branchModes: Record<string, FreightParameterMode>;
  branchFees: Record<string, string>;
  companyCatalogLayout: CatalogLayout;
  branchCatalogLayouts: Record<string, BranchCatalogLayoutMode>;
  companyProductImageLimit: number;
  branchProductImageLimits: Record<string, ProductImageLimitMode>;
  loading: boolean;
  saving: boolean;
  onScopeChange: (scope: ParameterScope) => void;
  onBranchChange: (branchId: string) => void;
  onCompanyEnabledChange: (enabled: boolean) => void;
  onBranchModeChange: (branchId: string, mode: FreightParameterMode) => void;
  onBranchFeeChange: (branchId: string, fee: string) => void;
  onCompanyCatalogLayoutChange: (layout: CatalogLayout) => void;
  onBranchCatalogLayoutChange: (branchId: string, mode: BranchCatalogLayoutMode) => void;
  onCompanyProductImageLimitChange: (limit: number) => void;
  onBranchProductImageLimitChange: (branchId: string, mode: ProductImageLimitMode) => void;
  onSaveCompany: (event: FormEvent<HTMLFormElement>) => void;
  onSaveBranch: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const activeBranch = branches.find((branch) => branch.id === activeBranchId) ?? branches[0] ?? null;
  const activeMode = activeBranch ? branchModes[activeBranch.id] ?? "inherit" : "inherit";
  const activeEnabled = activeMode === "inherit" ? companyEnabled : activeMode === "enabled";
  const activeLayoutMode = activeBranch ? branchCatalogLayouts[activeBranch.id] ?? "inherit" : "inherit";
  const activeCatalogLayout = activeLayoutMode === "inherit" ? companyCatalogLayout : activeLayoutMode;
  const activeImageLimitMode = activeBranch ? branchProductImageLimits[activeBranch.id] ?? "inherit" : "inherit";
  const activeImageLimit = activeImageLimitMode === "inherit" ? companyProductImageLimit : activeImageLimitMode;
  const inheritedBranchCount = branches.filter((branch) => (branchModes[branch.id] ?? "inherit") === "inherit").length;
  const inheritedLayoutBranchCount = branches.filter((branch) => (branchCatalogLayouts[branch.id] ?? "inherit") === "inherit").length;
  const inheritedImageLimitBranchCount = branches.filter((branch) => (branchProductImageLimits[branch.id] ?? "inherit") === "inherit").length;
  const scopeName = scope === "company" ? tenant.name : activeBranch?.name ?? "Filial";

  return (
    <section className="parameter-workspace">
      <div className="parameter-scope-control">
        <div className="parameter-scope-copy">
          <span className={scope === "company" ? "parameter-scope-icon company" : "parameter-scope-icon branch"}>{scope === "company" ? <Building2 size={20} /> : <Store size={20} />}</span>
          <span><small>{scope === "company" ? "Padrão da empresa" : "Configuração da filial"}</small><strong>{scopeName}</strong></span>
        </div>
        <label><span>Aplicar parâmetros em</span><select aria-label="Aplicar parâmetros em" value={scope === "company" ? "company" : activeBranch?.id ?? "company"} onChange={(event) => event.target.value === "company" ? onScopeChange("company") : onBranchChange(event.target.value)}><option value="company">Empresa: {tenant.name}</option><optgroup label="Filiais">{branches.map((branch) => <option value={branch.id} key={branch.id}>Filial: {branch.name}</option>)}</optgroup></select></label>
      </div>
      <div className="parameter-editor">
        {loading ? <section className="admin-form-panel"><p className="admin-muted">Carregando parâmetros...</p></section> : (
          <section className="parameter-list-panel">
            <header className="parameter-list-heading"><div><strong>Parâmetros disponíveis</strong><small>{scope === "company" ? `Padrão de ${tenant.name}` : `Configurações de ${activeBranch?.name ?? "filial"}`}</small></div><span>3 parâmetros</span></header>
            {scope === "company" ? (
              <>
              <form className="parameter-compact-form" onSubmit={onSaveCompany}>
                <details className="parameter-compact-item">
                  <summary><span className="parameter-item-icon"><Truck size={19} /></span><span className="parameter-item-name"><strong>Taxa de entrega</strong><small>Entrega · Padrão da empresa</small></span><strong className={companyEnabled ? "parameter-state-badge active" : "parameter-state-badge inactive"}>{companyEnabled ? "Ativo" : "Desativado"}</strong><ChevronRight className="parameter-item-arrow" size={18} /></summary>
                  <div className="parameter-compact-body">
                    <ParameterToggle checked={companyEnabled} title="Calcular taxa de entrega" description="As filiais que herdam o padrão seguirão esta escolha." onChange={onCompanyEnabledChange} />
                    <div className="parameter-compact-meta"><Building2 size={17} /><span><strong>{inheritedBranchCount} {inheritedBranchCount === 1 ? "filial segue" : "filiais seguem"} este padrão</strong><small>{branches.length - inheritedBranchCount > 0 ? `${branches.length - inheritedBranchCount} com configuração própria.` : "Nenhuma filial possui exceção."}</small></span></div>
                    <footer className="parameter-form-footer"><span>Afeta somente filiais configuradas para herdar.</span><button className="admin-primary" type="submit" disabled={saving}><Save size={16} /> {saving ? "Salvando..." : "Salvar"}</button></footer>
                  </div>
                </details>
              </form>
              <form className="parameter-compact-form" onSubmit={onSaveCompany}>
                <details className="parameter-compact-item">
                  <summary><span className="parameter-item-icon layout"><LayoutDashboard size={19} /></span><span className="parameter-item-name"><strong>Layout do catálogo</strong><small>Visual · Padrão da empresa</small></span><strong className="parameter-value-badge">{companyCatalogLayout === "horizontal" ? "Horizontal" : "Vitrine"}</strong><ChevronRight className="parameter-item-arrow" size={18} /></summary>
                  <div className="parameter-compact-body">
                    <fieldset className="parameter-mode-fieldset parameter-layout-fieldset">
                      <legend>Apresentação dos produtos</legend>
                      <div className="parameter-mode-options parameter-layout-options two">
                        <label className={companyCatalogLayout === "horizontal" ? "selected" : ""}><input type="radio" name="company-catalog-layout" value="horizontal" checked={companyCatalogLayout === "horizontal"} onChange={() => onCompanyCatalogLayoutChange("horizontal")} /><LayoutDashboard size={18} /><span><strong>Horizontal</strong><small>Foto ao lado das informações</small></span></label>
                        <label className={companyCatalogLayout === "showcase" ? "selected" : ""}><input type="radio" name="company-catalog-layout" value="showcase" checked={companyCatalogLayout === "showcase"} onChange={() => onCompanyCatalogLayoutChange("showcase")} /><ImagePlus size={18} /><span><strong>Vitrine</strong><small>Foto acima do nome do produto</small></span></label>
                      </div>
                    </fieldset>
                    <div className="parameter-compact-meta"><Building2 size={17} /><span><strong>{inheritedLayoutBranchCount} {inheritedLayoutBranchCount === 1 ? "filial segue" : "filiais seguem"} este layout</strong><small>{branches.length - inheritedLayoutBranchCount > 0 ? `${branches.length - inheritedLayoutBranchCount} com layout próprio.` : "Nenhuma filial possui exceção."}</small></span></div>
                    <footer className="parameter-form-footer"><span>Define o visual padrão dos catálogos.</span><button className="admin-primary" type="submit" disabled={saving}><Save size={16} /> {saving ? "Salvando..." : "Salvar"}</button></footer>
                  </div>
                </details>
              </form>
              <form className="parameter-compact-form" onSubmit={onSaveCompany}>
                <details className="parameter-compact-item">
                  <summary><span className="parameter-item-icon photos"><Images size={19} /></span><span className="parameter-item-name"><strong>Fotos por produto</strong><small>Galeria · Padrão da empresa</small></span><strong className="parameter-value-badge">{companyProductImageLimit}</strong><ChevronRight className="parameter-item-arrow" size={18} /></summary>
                  <div className="parameter-compact-body">
                    <label className="parameter-number-field"><span>Quantidade máxima</span><div><button type="button" aria-label="Diminuir quantidade" onClick={() => onCompanyProductImageLimitChange(Math.max(PRODUCT_IMAGE_LIMIT_MIN, companyProductImageLimit - 1))}>−</button><input type="number" min={PRODUCT_IMAGE_LIMIT_MIN} max={PRODUCT_IMAGE_LIMIT_MAX} value={companyProductImageLimit} onChange={(event) => onCompanyProductImageLimitChange(productImageLimitValue(event.target.value))} /><button type="button" aria-label="Aumentar quantidade" onClick={() => onCompanyProductImageLimitChange(Math.min(PRODUCT_IMAGE_LIMIT_MAX, companyProductImageLimit + 1))}>+</button></div><small>Entre {PRODUCT_IMAGE_LIMIT_MIN} e {PRODUCT_IMAGE_LIMIT_MAX} fotos por produto.</small></label>
                    <div className="parameter-compact-meta"><Building2 size={17} /><span><strong>{inheritedImageLimitBranchCount} {inheritedImageLimitBranchCount === 1 ? "filial segue" : "filiais seguem"} este limite</strong><small>{branches.length - inheritedImageLimitBranchCount > 0 ? `${branches.length - inheritedImageLimitBranchCount} com limite próprio.` : "Nenhuma filial possui exceção."}</small></span></div>
                    <footer className="parameter-form-footer"><span>Controla a galeria de fotos dos produtos.</span><button className="admin-primary" type="submit" disabled={saving}><Save size={16} /> {saving ? "Salvando..." : "Salvar"}</button></footer>
                  </div>
                </details>
              </form>
              </>
            ) : activeBranch ? (
              <>
              <form className="parameter-compact-form" onSubmit={onSaveBranch}>
                <details className="parameter-compact-item">
                  <summary><span className="parameter-item-icon"><Truck size={19} /></span><span className="parameter-item-name"><strong>Taxa de entrega</strong><small>Entrega · {activeMode === "inherit" ? `Herdando ${tenant.name}` : "Configuração própria"}</small></span><strong className={activeEnabled ? "parameter-state-badge active" : "parameter-state-badge inactive"}>{activeEnabled ? "Ativo" : "Desativado"}</strong><ChevronRight className="parameter-item-arrow" size={18} /></summary>
                  <div className="parameter-compact-body branch">
                    <fieldset className="parameter-mode-fieldset">
                      <legend>Comportamento nesta filial</legend>
                      <div className="parameter-mode-options">
                        <label className={activeMode === "inherit" ? "selected" : ""}><input type="radio" name="branch-parameter-mode" value="inherit" checked={activeMode === "inherit"} onChange={() => onBranchModeChange(activeBranch.id, "inherit")} /><Building2 size={17} /><span><strong>Herdar</strong><small>Segue a empresa</small></span></label>
                        <label className={activeMode === "enabled" ? "selected" : ""}><input type="radio" name="branch-parameter-mode" value="enabled" checked={activeMode === "enabled"} onChange={() => onBranchModeChange(activeBranch.id, "enabled")} /><Truck size={17} /><span><strong>Ativar</strong><small>Sempre ativo</small></span></label>
                        <label className={activeMode === "disabled" ? "selected" : ""}><input type="radio" name="branch-parameter-mode" value="disabled" checked={activeMode === "disabled"} onChange={() => onBranchModeChange(activeBranch.id, "disabled")} /><X size={17} /><span><strong>Desativar</strong><small>Não utilizar</small></span></label>
                      </div>
                    </fieldset>
                    <div className="parameter-money-field"><label htmlFor="branch-delivery-fee">Taxa fixa</label><div><b>R$</b><input id="branch-delivery-fee" value={branchFees[activeBranch.id] ?? "0,00"} onChange={(event) => onBranchFeeChange(activeBranch.id, event.target.value)} placeholder="0,00" inputMode="decimal" disabled={!activeEnabled} /></div><small>{activeEnabled ? "Incluída no total do pedido." : "Disponível quando o parâmetro estiver ativo."}</small></div>
                    <footer className="parameter-form-footer"><span>Afeta somente {activeBranch.name}.</span><button className="admin-primary" type="submit" disabled={saving}><Save size={16} /> {saving ? "Salvando..." : "Salvar"}</button></footer>
                  </div>
                </details>
              </form>
              <form className="parameter-compact-form" onSubmit={onSaveBranch}>
                <details className="parameter-compact-item">
                  <summary><span className="parameter-item-icon layout"><LayoutDashboard size={19} /></span><span className="parameter-item-name"><strong>Layout do catálogo</strong><small>Visual · {activeLayoutMode === "inherit" ? `Herdando ${tenant.name}` : "Configuração própria"}</small></span><strong className="parameter-value-badge">{activeCatalogLayout === "horizontal" ? "Horizontal" : "Vitrine"}</strong><ChevronRight className="parameter-item-arrow" size={18} /></summary>
                  <div className="parameter-compact-body">
                    <fieldset className="parameter-mode-fieldset parameter-layout-fieldset">
                      <legend>Apresentação nesta filial</legend>
                      <div className="parameter-mode-options parameter-layout-options">
                        <label className={activeLayoutMode === "inherit" ? "selected" : ""}><input type="radio" name="branch-catalog-layout" value="inherit" checked={activeLayoutMode === "inherit"} onChange={() => onBranchCatalogLayoutChange(activeBranch.id, "inherit")} /><Building2 size={17} /><span><strong>Herdar</strong><small>Segue a empresa</small></span></label>
                        <label className={activeLayoutMode === "horizontal" ? "selected" : ""}><input type="radio" name="branch-catalog-layout" value="horizontal" checked={activeLayoutMode === "horizontal"} onChange={() => onBranchCatalogLayoutChange(activeBranch.id, "horizontal")} /><LayoutDashboard size={17} /><span><strong>Horizontal</strong><small>Foto ao lado</small></span></label>
                        <label className={activeLayoutMode === "showcase" ? "selected" : ""}><input type="radio" name="branch-catalog-layout" value="showcase" checked={activeLayoutMode === "showcase"} onChange={() => onBranchCatalogLayoutChange(activeBranch.id, "showcase")} /><ImagePlus size={17} /><span><strong>Vitrine</strong><small>Foto acima</small></span></label>
                      </div>
                    </fieldset>
                    <footer className="parameter-form-footer"><span>Afeta somente {activeBranch.name}.</span><button className="admin-primary" type="submit" disabled={saving}><Save size={16} /> {saving ? "Salvando..." : "Salvar"}</button></footer>
                  </div>
                </details>
              </form>
              <form className="parameter-compact-form" onSubmit={onSaveBranch}>
                <details className="parameter-compact-item">
                  <summary><span className="parameter-item-icon photos"><Images size={19} /></span><span className="parameter-item-name"><strong>Fotos por produto</strong><small>Galeria · {activeImageLimitMode === "inherit" ? `Herdando ${tenant.name}` : "Configuração própria"}</small></span><strong className="parameter-value-badge">{activeImageLimit}</strong><ChevronRight className="parameter-item-arrow" size={18} /></summary>
                  <div className="parameter-compact-body branch">
                    <fieldset className="parameter-mode-fieldset">
                      <legend>Comportamento nesta filial</legend>
                      <div className="parameter-mode-options parameter-image-limit-options">
                        <label className={activeImageLimitMode === "inherit" ? "selected" : ""}><input type="radio" name="branch-image-limit-mode" value="inherit" checked={activeImageLimitMode === "inherit"} onChange={() => onBranchProductImageLimitChange(activeBranch.id, "inherit")} /><Building2 size={17} /><span><strong>Herdar</strong><small>Usar {companyProductImageLimit} foto(s)</small></span></label>
                        <label className={activeImageLimitMode !== "inherit" ? "selected" : ""}><input type="radio" name="branch-image-limit-mode" value="custom" checked={activeImageLimitMode !== "inherit"} onChange={() => onBranchProductImageLimitChange(activeBranch.id, companyProductImageLimit)} /><Images size={17} /><span><strong>Personalizar</strong><small>Limite próprio</small></span></label>
                      </div>
                    </fieldset>
                    <label className="parameter-number-field"><span>Quantidade máxima nesta filial</span><div><button type="button" aria-label="Diminuir quantidade" disabled={activeImageLimitMode === "inherit"} onClick={() => onBranchProductImageLimitChange(activeBranch.id, Math.max(PRODUCT_IMAGE_LIMIT_MIN, activeImageLimit - 1))}>−</button><input type="number" min={PRODUCT_IMAGE_LIMIT_MIN} max={PRODUCT_IMAGE_LIMIT_MAX} value={activeImageLimit} disabled={activeImageLimitMode === "inherit"} onChange={(event) => onBranchProductImageLimitChange(activeBranch.id, productImageLimitValue(event.target.value))} /><button type="button" aria-label="Aumentar quantidade" disabled={activeImageLimitMode === "inherit"} onClick={() => onBranchProductImageLimitChange(activeBranch.id, Math.min(PRODUCT_IMAGE_LIMIT_MAX, activeImageLimit + 1))}>+</button></div><small>{activeImageLimitMode === "inherit" ? `Herdando ${companyProductImageLimit} da empresa.` : `Entre ${PRODUCT_IMAGE_LIMIT_MIN} e ${PRODUCT_IMAGE_LIMIT_MAX} fotos.`}</small></label>
                    <footer className="parameter-form-footer"><span>Afeta somente {activeBranch.name}.</span><button className="admin-primary" type="submit" disabled={saving}><Save size={16} /> {saving ? "Salvando..." : "Salvar"}</button></footer>
                  </div>
                </details>
              </form>
              </>
            ) : <p className="parameter-empty">Cadastre uma filial para configurar parâmetros específicos.</p>}
          </section>
        )}
      </div>
    </section>
  );
}

function ParameterToggle({ checked, title, description, onChange }: { checked: boolean; title: string; description: string; onChange: (checked: boolean) => void }) {
  return <label className="parameter-toggle-row"><span><strong>{title}</strong><small>{description}</small></span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i aria-hidden="true"><b /></i></label>;
}

function LocationHelp({ issue, onRetry }: { issue: string; onRetry: () => void }) {
  return <div className="location-help" role="alert"><MapPin size={18} /><span><strong>Localização não liberada</strong><small>{issue}</small></span><button className="admin-secondary" type="button" onClick={onRetry}>Tentar novamente</button></div>;
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
  const [query, setQuery] = useState("");
  const visibleTenants = tenants.filter((item) => {
    const companyBranches = branches.filter((branch) => branch.tenant_id === item.id);
    const searchable = [item.name, item.slug, ...companyBranches.map((branch) => branch.name)].join(" ");
    return normalizeText(searchable).includes(normalizeText(query));
  });
  const companiesWithMultipleBranches = tenants.filter((item) => branches.filter((branch) => branch.tenant_id === item.id).length > 1).length;

  return (
    <section className="admin-company-list">
      <div className="admin-company-summary" aria-label="Resumo das empresas">
        <div><Building2 size={20} /><span>Empresas</span><strong>{tenants.length}</strong></div>
        <div><Store size={20} /><span>Filiais</span><strong>{branches.length}</strong></div>
        <div><LayoutDashboard size={20} /><span>Com várias filiais</span><strong>{companiesWithMultipleBranches}</strong></div>
      </div>
      <div className="admin-company-toolbar">
        <div><span>Empresas cadastradas</span><h2>Gestão de clientes</h2><p>Pesquise uma empresa e escolha a área que deseja administrar.</p></div>
        <button className="admin-primary" type="button" onClick={onNew}><Plus size={16} /> Nova empresa</button>
      </div>
      {tenants.length ? (
        <>
          <label className="admin-company-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por empresa ou filial" /></label>
          <div className="admin-company-table">
            <div className="company-table-head"><span>Empresa</span><span>Filiais</span><span>Ações</span></div>
            {visibleTenants.map((item) => {
              const companyBranches = branches.filter((branch) => branch.tenant_id === item.id);
              return (
                <article className="company-admin-card" key={item.id}>
                  <div className="company-admin-info">
                    <span className="company-admin-avatar" style={{ "--company-color": companyThemeColor(item.theme_color) } as CSSProperties}>{item.profile_image_url ? <img src={item.profile_image_url} alt="" /> : item.name.trim().slice(0, 2).toUpperCase()}</span>
                    <span><strong>{item.name}</strong><small>Identificador: {item.slug}</small><b className={item.is_active === false ? "company-status-badge inactive" : "company-status-badge active"}>{item.is_active === false ? "Inativa" : "Ativa"}</b></span>
                  </div>
                  <div className="company-branch-preview">
                    <strong>{companyBranches.length} {companyBranches.length === 1 ? "filial" : "filiais"}</strong>
                    <small>{companyBranches.slice(0, 2).map((branch) => branch.name).join(" · ") || "Nenhuma filial vinculada"}{companyBranches.length > 2 ? ` · +${companyBranches.length - 2}` : ""}</small>
                  </div>
                  <div className="company-card-actions">
                    <button className="admin-secondary" type="button" onClick={() => onOpenSettings(item.id)}><Settings size={16} /> Gerenciar</button>
                    <button className="admin-primary" type="button" onClick={() => onOpenCatalog(item.id)}><Package size={16} /> Catálogo</button>
                  </div>
                </article>
              );
            })}
            {!visibleTenants.length ? <div className="admin-company-empty"><Search size={22} /><strong>Nenhuma empresa encontrada</strong><span>Revise o termo pesquisado.</span></div> : null}
          </div>
        </>
      ) : (
        <div className="admin-form-panel admin-company-empty"><Building2 size={24} /><strong>Nenhuma empresa cadastrada</strong><span>Cadastre a primeira empresa para começar.</span><button className="admin-primary" type="button" onClick={onNew}><Plus size={16} /> Cadastrar empresa</button></div>
      )}
    </section>
  );
}

function AdminLogin() {
  const isCompanyPortal = typeof window !== "undefined" && window.location.pathname === "/empresa";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setMessage("Supabase não configurado neste computador. Configure o arquivo .env.local e reinicie o servidor.");
      return;
    }
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
