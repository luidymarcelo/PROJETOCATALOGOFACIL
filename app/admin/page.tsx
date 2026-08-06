"use client";

import {
  ArrowLeft,
  Building2,
  LogOut,
  Plus,
  RefreshCw,
  Store,
  Trash2,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabase";

type Tenant = { id: string; name: string; slug: string };
type Branch = { id: string; name: string; slug: string; tenant_id: string };
type Category = { id: string; name: string; sort_order: number };
type Product = {
  id: string;
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

const ADMIN_EMAILS = ["luidy123neres@gmail.com"];

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
  const [adminSection, setAdminSection] = useState<"companies" | "new" | "catalog">("companies");
  const [activeBranchId, setActiveBranchId] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [message, setMessage] = useState("");
  const [companyForm, setCompanyForm] = useState({ name: "", branch: "", phone: "", address: "", userName: "", userEmail: "", userPassword: "" });
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
        setMessage(membershipError?.message ?? tenantError?.message ?? branchError?.message ?? workspace?.error ?? "Este login não está vinculado a uma empresa.");
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

  useEffect(() => {
    async function loadBranchCatalog() {
      if (!supabase || !activeBranchId) {
        setCategories([]);
        setProducts([]);
        return;
      }

      const [{ data: categoryRows }, { data: productRows }] = await Promise.all([
        supabase
          .from("categories")
          .select("id, name, sort_order")
          .eq("store_id", activeBranchId)
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        supabase
          .from("products")
          .select("id, name, description, price, unit, stock_quantity, image_url, badge, category_id, is_active")
          .eq("store_id", activeBranchId)
          .eq("is_active", true)
          .order("name", { ascending: true }),
      ]);

      setCategories((categoryRows ?? []) as Category[]);
      setProducts((productRows ?? []) as Product[]);
    }

    void loadBranchCatalog();
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
      const { data } = await supabase.from("categories").select("id, name, sort_order").eq("store_id", activeBranchId).eq("is_active", true).order("sort_order");
      setCategories((data ?? []) as Category[]);
    }
  }

  function openAdminCatalog(tenantId: string) {
    const selectedTenant = adminTenants.find((item) => item.id === tenantId) ?? null;
    const selectedBranches = adminBranches.filter((branch) => branch.tenant_id === tenantId);
    setTenant(selectedTenant);
    setBranches(selectedBranches);
    setActiveBranchId(selectedBranches[0]?.id ?? "");
    setAdminSection("catalog");
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
      const { data } = await supabase.from("products").select("id, name, description, price, unit, stock_quantity, image_url, badge, category_id, is_active").eq("store_id", activeBranchId).eq("is_active", true).order("name");
      setProducts((data ?? []) as Product[]);
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

        {!isCompanyPortal ? <nav className="admin-tabs"><button className={adminSection === "companies" ? "active" : ""} onClick={() => setAdminSection("companies")}>Empresas</button><button className={adminSection === "new" ? "active" : ""} onClick={() => setAdminSection("new")}>Nova empresa</button>{adminSection === "catalog" ? <button className="active" onClick={() => setAdminSection("catalog")}>Catálogo selecionado</button> : null}</nav> : null}
        {!isCompanyPortal && adminSection === "companies" ? (
          <AdminCompanies tenants={adminTenants} branches={adminBranches} onNew={() => setAdminSection("new")} onOpenCatalog={openAdminCatalog} />
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
        ) : (
          <>
            <section className="workspace-bar"><div><span>Empresa</span><strong><Building2 size={18} /> {tenant.name}</strong></div><label>Filial<select value={activeBranchId} onChange={(event) => setActiveBranchId(event.target.value)}>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><button onClick={() => session.user.id && loadWorkspace(session.user.id)}><RefreshCw size={16} /> Atualizar</button></section>
            {activeBranch ? <p className="branch-note"><Store size={16} /> Editando: <strong>{activeBranch.name}</strong></p> : null}
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
}: {
  tenants: Tenant[];
  branches: Branch[];
  onNew: () => void;
  onOpenCatalog: (tenantId: string) => void;
}) {
  return <section className="admin-company-list"><div className="admin-list-heading"><div><span>Empresas cadastradas</span><h2>Escolha uma empresa para administrar</h2></div><button className="admin-primary" onClick={onNew}><Plus size={16} /> Nova empresa</button></div>{tenants.map((item) => <article className="company-admin-card" key={item.id}><div><strong>{item.name}</strong><small>{branches.filter((branch) => branch.tenant_id === item.id).length} filial(is)</small></div><button className="admin-primary" onClick={() => onOpenCatalog(item.id)}>Abrir catálogo</button></article>)}{!tenants.length ? <div className="admin-form-panel"><p className="admin-muted">Nenhuma empresa cadastrada ainda.</p><button className="admin-primary" onClick={onNew}><Plus size={16} /> Cadastrar primeira empresa</button></div> : null}</section>;
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
