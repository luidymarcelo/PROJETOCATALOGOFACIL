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

type StoreUserForm = { name: string; email: string; password: string; role: "manager" | "staff" };

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
  const [activeBranchId, setActiveBranchId] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [message, setMessage] = useState("");
  const [companyForm, setCompanyForm] = useState({ name: "", branch: "", phone: "", address: "" });
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
  const [storeUserForm, setStoreUserForm] = useState<StoreUserForm>({ name: "", email: "", password: "", role: "manager" });

  async function loadWorkspace(userId: string, preferredTenantId?: string) {
    if (!supabase) return;
    if (isCompanyPortal) {
      const { data: memberships } = await supabase
        .from("store_members")
        .select("store_id, role")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });
      const { data: branch } = memberships?.[0]
        ? await supabase.from("stores").select("id, name, slug, tenant_id").eq("id", memberships[0].store_id).single()
        : { data: null };
      if (!branch) {
        setTenant(null);
        setBranches([]);
        setLoading(false);
        return;
      }
      setTenant({ id: branch.tenant_id, name: "Portal da filial", slug: branch.slug });
      setBranches([branch as Branch]);
      setActiveBranchId(branch.id);
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

    const tenantId = (preferredTenantId ?? memberships[0].tenant_id) as string;
    if (!memberships.some((membership) => membership.tenant_id === tenantId)) {
      setTenant(null);
      setBranches([]);
      setMessage("Esta empresa foi criada por outro usuário. Entre com o e-mail que a criou ou peça para um administrador vincular seu acesso.");
      setLoading(false);
      return;
    }
    const [{ data: tenantRow }, { data: branchRows }] = await Promise.all([
      supabase.from("tenants").select("id, name, slug").eq("id", tenantId).single(),
      supabase
        .from("stores")
        .select("id, name, slug, tenant_id")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true }),
    ]);

    setTenant(tenantRow as Tenant | null);
    const nextBranches = (branchRows ?? []) as Branch[];
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
      if (data.session?.user.id) void loadWorkspace(data.session.user.id);
      else setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
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
    const { data: tenantId, error } = await supabase.rpc("create_tenant_with_owner", {
      tenant_name: companyForm.name,
      tenant_slug: slugify(companyForm.name),
      owner_name: null,
      owner_phone: null,
    });
    if (error || !tenantId) {
      setMessage(error?.message ?? "Não foi possível criar a empresa.");
      return;
    }

    const { error: branchError } = await supabase.from("stores").insert({
      tenant_id: tenantId,
      name: companyForm.branch,
      slug: slugify(companyForm.branch),
      segment: "retail",
      whatsapp_phone: companyForm.phone.replace(/\D/g, ""),
      address: companyForm.address,
      is_active: true,
    });
    if (branchError) setMessage(branchError.message);
    else if (session?.user.id) {
      setMessage("Empresa criada. O catálogo da filial está pronto para receber produtos.");
      await loadWorkspace(session.user.id, tenantId as string);
    }
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

  async function createStoreUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !activeBranchId) return;
    const { data: currentAuth } = await supabase.auth.getSession();
    const { data, error } = await supabase.auth.signUp({
      email: storeUserForm.email.trim(),
      password: storeUserForm.password,
      options: { data: { full_name: storeUserForm.name.trim() } },
    });
    if (error || !data.user) {
      setMessage(error?.message ?? "Não foi possível criar o usuário da filial.");
      return;
    }
    if (currentAuth.session) {
      await supabase.auth.setSession({
        access_token: currentAuth.session.access_token,
        refresh_token: currentAuth.session.refresh_token,
      });
    }
    const { error: memberError } = await supabase.from("store_members").upsert({
      store_id: activeBranchId,
      user_id: data.user.id,
      role: storeUserForm.role,
    });
    setMessage(memberError?.message ?? "Usuário criado. Ele deve entrar em /empresa com este e-mail e senha.");
    if (!memberError) setStoreUserForm({ name: "", email: "", password: "", role: "manager" });
  }

  const activeBranch = useMemo(() => branches.find((branch) => branch.id === activeBranchId), [branches, activeBranchId]);

  if (loading) return <main className="admin-page"><p>Carregando painel...</p></main>;
  if (!session) return <AdminLogin />;

  return (
    <main className="admin-page">
      <header className="admin-topbar">
        <a href="/" className="admin-back"><ArrowLeft size={17} /> Catálogo público</a>
        <div className="admin-user"><span>{session.user.email}</span><button onClick={() => supabase?.auth.signOut()}><LogOut size={16} /> Sair</button></div>
      </header>
      <section className="admin-page-inner">
        <div className="admin-page-heading"><span>{isCompanyPortal ? "Portal da empresa" : "Central dos administradores"}</span><h1>{isCompanyPortal ? "Edite o catálogo da sua filial" : "Gestão do catálogo"}</h1><p>{isCompanyPortal ? "Altere somente os produtos e categorias da filial vinculada ao seu usuário." : "Cadastre empresas, filiais, usuários e catálogos em um só lugar."}</p></div>

        {!tenant && isCompanyPortal ? (
          <section className="admin-form-panel access-denied-panel"><h2>Acesso da filial ainda não configurado</h2><p>Este e-mail não está vinculado a nenhuma filial. Solicite ao administrador um usuário de filial e entre novamente por este portal.</p><a className="admin-primary" href="/admin">Ir para a Central dos administradores</a></section>
        ) : !tenant ? (
          <form className="admin-form-panel" onSubmit={createCompany}>
            <h2>Nenhuma empresa vinculada a este acesso</h2>
            <p>Este e-mail é de administrador do sistema. Crie uma empresa somente se ela ainda não existir. Para editar uma empresa já criada, entre com o e-mail usado no cadastro.</p>
            <div className="admin-form-grid">
              <label>Empresa<input value={companyForm.name} onChange={(event) => setCompanyForm({ ...companyForm, name: event.target.value })} placeholder="Ex.: Material Forte" required /></label>
              <label>Primeira filial<input value={companyForm.branch} onChange={(event) => setCompanyForm({ ...companyForm, branch: event.target.value })} placeholder="Ex.: Filial Centro" required /></label>
              <label>WhatsApp<input value={companyForm.phone} onChange={(event) => setCompanyForm({ ...companyForm, phone: formatWhatsapp(event.target.value) })} placeholder="(63) 99999-9999" inputMode="tel" required /></label>
              <label>Endereço<input value={companyForm.address} onChange={(event) => setCompanyForm({ ...companyForm, address: event.target.value })} placeholder="Rua e número" required /></label>
            </div>
            <button className="admin-primary" type="submit"><Plus size={17} /> Criar empresa e filial</button>
          </form>
        ) : (
          <>
            <section className="workspace-bar"><div><span>Empresa</span><strong><Building2 size={18} /> {tenant.name}</strong></div><label>Filial<select value={activeBranchId} onChange={(event) => setActiveBranchId(event.target.value)}>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><button onClick={() => session.user.id && loadWorkspace(session.user.id)}><RefreshCw size={16} /> Atualizar</button></section>
            {activeBranch ? <p className="branch-note"><Store size={16} /> Editando: <strong>{activeBranch.name}</strong></p> : null}
            {!isCompanyPortal ? <section className="admin-form-panel user-access-panel"><h2>Acesso da filial</h2><p>Crie o login que você entregará ao responsável. Ele usará <strong>/empresa</strong> e não verá outras filiais.</p><form className="admin-form-grid" onSubmit={createStoreUser}><label>Nome<input value={storeUserForm.name} onChange={(event) => setStoreUserForm({ ...storeUserForm, name: event.target.value })} required /></label><label>E-mail<input type="email" value={storeUserForm.email} onChange={(event) => setStoreUserForm({ ...storeUserForm, email: event.target.value })} required /></label><label>Senha inicial<input type="password" minLength={6} value={storeUserForm.password} onChange={(event) => setStoreUserForm({ ...storeUserForm, password: event.target.value })} required /></label><label>Permissão<select value={storeUserForm.role} onChange={(event) => setStoreUserForm({ ...storeUserForm, role: event.target.value as StoreUserForm["role"] })}><option value="manager">Gerente</option><option value="staff">Operador</option></select></label><button className="admin-primary" type="submit"><Plus size={16} /> Criar acesso da filial</button></form></section> : null}
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

function AdminLogin() {
  const isCompanyPortal = typeof window !== "undefined" && window.location.pathname === "/empresa";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [signup, setSignup] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const result = signup
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    if (result.error) setMessage(result.error.message);
    else if (signup && !result.data.session) setMessage("Conta criada. Confirme seu e-mail antes de entrar.");
  }

  return <main className="admin-page"><section className="admin-login-card"><Building2 size={28} /><span>{isCompanyPortal ? "Portal da empresa" : "Central dos administradores"}</span><h1>{signup ? "Criar conta" : "Entrar"}</h1><form onSubmit={submit}><label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Senha<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} required /></label>{message ? <p className="admin-message">{message}</p> : null}<button className="admin-primary" type="submit">{signup ? "Criar conta" : "Entrar"}</button></form>{!isCompanyPortal ? <button className="admin-link" onClick={() => setSignup(!signup)}>{signup ? "Já tenho uma conta" : "Ainda não tenho acesso"}</button> : null}<a className="admin-link" href="/">Voltar ao catálogo</a></section></main>;
}

export default AdminPage;

function formatWhatsapp(value: string) {
  const digits = value.replace(/\D/g, "").replace(/^55/, "").slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : "";
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}
