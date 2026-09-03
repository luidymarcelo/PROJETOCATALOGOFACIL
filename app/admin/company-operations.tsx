"use client";

import {
  Check,
  ClipboardList,
  Copy,
  ExternalLink,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  RotateCw,
  Search,
  ShieldCheck,
  Store,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabase";

export type CompanyPortalSection = "catalog" | "team" | "tables";

export type OperationsTenant = { id: string; name: string };
export type OperationsBranch = {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  cnpj?: string | null;
};

type CompanyUserRole = "branch_manager" | "waiter" | "cashier" | "kitchen" | "supervisor";
type CompanyUser = {
  user_id: string;
  name: string;
  phone: string;
  email: string;
  role: CompanyUserRole;
  roles?: CompanyUserRole[];
  is_active: boolean;
  branch_ids: string[];
  branch_names: string[];
};
type RestaurantTable = {
  id: string;
  store_id: string;
  code: string;
  name: string | null;
  access_token: string;
  sort_order: number;
  is_active: boolean;
};
type EntryMode = "table" | "staff" | "both";
type CustomerNameMode = "hidden" | "optional" | "required";

const roleLabels: Record<CompanyUserRole, string> = {
  branch_manager: "Gerente de filial",
  waiter: "Garçom",
  cashier: "Caixa",
  kitchen: "Cozinha",
  supervisor: "Supervisor",
};

const roleDescriptions: Record<CompanyUserRole, string> = {
  branch_manager: "Administra o catálogo e os dados das filiais permitidas.",
  waiter: "Abre mesas e cria comandas para atendimento.",
  cashier: "Controla pagamentos, faturamento e fechamento de mesas.",
  kitchen: "Acompanha e atualiza o andamento dos pedidos.",
  supervisor: "Acessa toda a operação, sem alterar as configurações da empresa.",
};

const selectableRoles = Object.keys(roleLabels) as CompanyUserRole[];

const emptyUserForm = {
  userId: "",
  name: "",
  phone: "",
  email: "",
  password: "",
  roles: ["waiter"] as CompanyUserRole[],
  branchIds: [] as string[],
  isActive: true,
};

function formatCnpj(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : "";
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function operationError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String((error as { message?: string } | null)?.message ?? "");
  if (/somente o administrador da plataforma pode gerenciar empresas/i.test(message)) {
    return "A função create-store-user está desatualizada no Supabase. Republice a função para liberar a gestão da equipe pelo proprietário.";
  }
  if (/company_users.*roles|roles.*company_users|company_users_roles_check|multi_role/i.test(message)) {
    return "As funções múltiplas ainda não foram aplicadas no Supabase. Execute a migration 022_multi_role_company_users.sql e republique a função create-store-user.";
  }
  if (/company_users|restaurant_tables|internal_order_entry_mode|schema cache/i.test(message)) {
    return "A estrutura de operação ainda não foi aplicada no Supabase. Execute a migration 021_branch_access_tables_and_audit.sql.";
  }
  return message || fallback;
}

function normalizedUserRoles(user: Pick<CompanyUser, "role" | "roles">) {
  const assigned = Array.isArray(user.roles) ? user.roles.filter((role) => selectableRoles.includes(role)) : [];
  return assigned.length ? assigned : [user.role];
}

function orderedRoles(roles: CompanyUserRole[]) {
  const selected = new Set(roles);
  return selectableRoles.filter((role) => selected.has(role));
}

export function CompanyPortalNav({ section, onChange }: { section: CompanyPortalSection; onChange: (section: CompanyPortalSection) => void }) {
  return (
    <nav className="company-portal-nav" aria-label="Áreas da empresa">
      <button className={section === "catalog" ? "active" : ""} type="button" onClick={() => onChange("catalog")}><Store size={17} /><span>Catálogo</span></button>
      <button className={section === "team" ? "active" : ""} type="button" onClick={() => onChange("team")}><UsersRound size={17} /><span>Equipe</span></button>
      <button className={section === "tables" ? "active" : ""} type="button" onClick={() => onChange("tables")}><QrCode size={17} /><span>Mesas</span></button>
    </nav>
  );
}

export function CompanyOperations({
  section,
  tenant,
  branches,
  activeBranchId,
  onBranchChange,
}: {
  section: Exclude<CompanyPortalSection, "catalog">;
  tenant: OperationsTenant;
  branches: OperationsBranch[];
  activeBranchId: string;
  onBranchChange: (branchId: string) => void;
}) {
  return section === "team"
    ? <CompanyTeam tenant={tenant} branches={branches} />
    : <CompanyTables branches={branches} activeBranchId={activeBranchId} onBranchChange={onBranchChange} />;
}

function CompanyTeam({ tenant, branches }: { tenant: OperationsTenant; branches: OperationsBranch[] }) {
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [form, setForm] = useState({ ...emptyUserForm });
  const [feedback, setFeedback] = useState("");

  async function loadUsers() {
    if (!supabase) return;
    setLoading(true);
    setFeedback("");
    const { data, error } = await supabase.functions.invoke("create-store-user", {
      body: { action: "list-company-users", tenant_id: tenant.id },
    });
    setLoading(false);
    if (error || data?.error) {
      setFeedback(operationError(error ?? new Error(data?.error), "Não foi possível carregar a equipe."));
      return;
    }
    setUsers((data?.users ?? []) as CompanyUser[]);
  }

  useEffect(() => {
    void loadUsers();
  }, [tenant.id]);

  function openNewUser() {
    setForm({ ...emptyUserForm, branchIds: branches[0] ? [branches[0].id] : [] });
    setShowEditor(true);
    setFeedback("");
  }

  function editUser(user: CompanyUser) {
    setForm({
      userId: user.user_id,
      name: user.name,
      phone: formatPhone(user.phone),
      email: user.email,
      password: "",
      roles: normalizedUserRoles(user),
      branchIds: user.branch_ids,
      isActive: user.is_active,
    });
    setShowEditor(true);
    setFeedback("");
  }

  async function saveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || saving) return;
    if (!form.branchIds.length) {
      setFeedback("Selecione pelo menos uma filial.");
      return;
    }
    if (!form.roles.length) {
      setFeedback("Selecione pelo menos uma função.");
      return;
    }
    const roles = orderedRoles(form.roles);
    setSaving(true);
    setFeedback("");
    const { data, error } = await supabase.functions.invoke("create-store-user", {
      body: {
        action: "save-company-user",
        tenant_id: tenant.id,
        user_id: form.userId || undefined,
        name: form.name.trim(),
        phone: form.phone.replace(/\D/g, ""),
        email: form.email.trim(),
        password: form.password,
        role: roles[0],
        roles,
        branch_ids: form.branchIds,
        is_active: form.isActive,
      },
    });
    setSaving(false);
    if (error || data?.error) {
      setFeedback(operationError(error ?? new Error(data?.error), "Não foi possível salvar o usuário."));
      return;
    }
    const savedRoles = orderedRoles(normalizedUserRoles(data.user as CompanyUser));
    if (savedRoles.join("|") !== roles.join("|")) {
      await loadUsers();
      setFeedback("O Supabase salvou apenas uma função. Execute a migration 022 e republique a função create-store-user antes de continuar.");
      return;
    }
    setShowEditor(false);
    setFeedback(form.userId ? "Acesso atualizado." : "Usuário criado e pronto para entrar.");
    await loadUsers();
  }

  async function toggleUser(user: CompanyUser) {
    if (!supabase) return;
    setSaving(true);
    setFeedback("");
    const { data, error } = await supabase.functions.invoke("create-store-user", {
      body: {
        action: "save-company-user",
        tenant_id: tenant.id,
        user_id: user.user_id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        password: "",
        role: normalizedUserRoles(user)[0],
        roles: normalizedUserRoles(user),
        branch_ids: user.branch_ids,
        is_active: !user.is_active,
      },
    });
    setSaving(false);
    if (error || data?.error) {
      setFeedback(operationError(error ?? new Error(data?.error), "Não foi possível alterar o acesso."));
      return;
    }
    setUsers((current) => current.map((item) => item.user_id === user.user_id ? { ...item, is_active: !item.is_active } : item));
  }

  const visibleUsers = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    if (!normalized) return users;
    return users.filter((user) => [user.name, user.email, ...normalizedUserRoles(user).map((role) => roleLabels[role]), ...user.branch_names].join(" ").toLocaleLowerCase("pt-BR").includes(normalized));
  }, [query, users]);

  return (
    <section className="company-operation-page">
      <header className="company-operation-heading">
        <div><span>Controle de acesso</span><h2>Equipe</h2><p>{users.filter((user) => user.is_active).length} usuário(s) ativo(s)</p></div>
        <button className="admin-primary" type="button" onClick={openNewUser}><Plus size={16} /> Novo usuário</button>
      </header>
      <div className="operation-toolbar">
        <label><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nome, função ou filial" /></label>
        <button className="icon-button" type="button" title="Atualizar equipe" aria-label="Atualizar equipe" onClick={() => void loadUsers()} disabled={loading}><RefreshCw className={loading ? "spinning" : ""} size={17} /></button>
      </div>
      {feedback ? <p className="operation-feedback" role="status">{feedback}</p> : null}
      <div className="company-user-list" aria-live="polite">
        {loading ? <div className="operation-empty"><RefreshCw className="spinning" size={22} /><span>Carregando equipe...</span></div> : visibleUsers.map((user) => (
          <article className={user.is_active ? "company-user-row" : "company-user-row inactive"} key={user.user_id}>
            <span className="company-user-avatar"><UserRound size={18} /></span>
            <div className="company-user-main"><strong>{user.name}</strong><span>{user.email}</span><small>{user.branch_names.join(" · ")}</small></div>
            <span className="company-user-roles">{normalizedUserRoles(user).map((role) => <span className="company-user-role" key={role}>{roleLabels[role]}</span>)}</span>
            <span className={user.is_active ? "operation-status active" : "operation-status"}>{user.is_active ? "Ativo" : "Desativado"}</span>
            <div className="company-user-actions">
              <button className="icon-button" type="button" title="Editar acesso" aria-label={`Editar ${user.name}`} onClick={() => editUser(user)}><Pencil size={16} /></button>
              <button className={user.is_active ? "icon-button user-disable" : "icon-button user-enable"} type="button" title={user.is_active ? "Desativar usuário" : "Reativar usuário"} aria-label={`${user.is_active ? "Desativar" : "Reativar"} ${user.name}`} onClick={() => void toggleUser(user)} disabled={saving}>{user.is_active ? <X size={16} /> : <Check size={16} />}</button>
            </div>
          </article>
        ))}
        {!loading && !visibleUsers.length ? <div className="operation-empty"><UsersRound size={23} /><strong>Nenhum usuário encontrado</strong></div> : null}
      </div>

      {showEditor ? (
        <div className="catalog-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowEditor(false); }}>
          <section className="admin-form-panel catalog-modal company-user-editor" role="dialog" aria-modal="true" aria-labelledby="company-user-title">
            <header className="operation-modal-heading"><div><span>{form.userId ? "Editar acesso" : "Novo acesso"}</span><h2 id="company-user-title">Usuário da empresa</h2></div><button className="icon-button" type="button" title="Fechar" aria-label="Fechar" onClick={() => setShowEditor(false)}><X size={18} /></button></header>
            <form onSubmit={saveUser}>
              <div className="admin-form-grid"><label>Nome<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label><label>WhatsApp opcional<input value={form.phone} onChange={(event) => setForm({ ...form, phone: formatPhone(event.target.value) })} inputMode="tel" /></label></div>
              <div className="admin-form-grid"><label>E-mail<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label><label>{form.userId ? "Nova senha opcional" : "Senha inicial"}<input type="password" minLength={6} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required={!form.userId} /></label></div>
              <fieldset className="operation-role-selector"><legend>Funções permitidas</legend><p>Selecione uma ou mais áreas para este mesmo login.</p><div>{selectableRoles.map((role) => <label className={form.roles.includes(role) ? "selected" : ""} key={role}><input type="checkbox" checked={form.roles.includes(role)} onChange={(event) => setForm((current) => ({ ...current, roles: event.target.checked ? orderedRoles([...current.roles, role]) : current.roles.filter((item) => item !== role) }))} /><span><strong>{roleLabels[role]}</strong><small>{roleDescriptions[role]}</small></span></label>)}</div></fieldset>
              <fieldset className="operation-branch-selector"><legend>Filiais permitidas</legend>{branches.map((branch) => <label key={branch.id}><input type="checkbox" checked={form.branchIds.includes(branch.id)} onChange={(event) => setForm((current) => ({ ...current, branchIds: event.target.checked ? [...current.branchIds, branch.id] : current.branchIds.filter((id) => id !== branch.id) }))} /><span><strong>{branch.name}</strong><small>{formatCnpj(branch.cnpj) || "CNPJ não informado"}</small></span></label>)}</fieldset>
              {form.userId ? <label className="operation-active-check"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} /><span>Usuário ativo</span></label> : null}
              {feedback ? <p className="operation-feedback" role="alert">{feedback}</p> : null}
              <footer className="admin-form-actions"><button className="admin-secondary" type="button" onClick={() => setShowEditor(false)}>Cancelar</button><button className="admin-primary" type="submit" disabled={saving}><ShieldCheck size={16} /> {saving ? "Salvando..." : "Salvar acesso"}</button></footer>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function CompanyTables({ branches, activeBranchId, onBranchChange }: { branches: OperationsBranch[]; activeBranchId: string; onBranchChange: (branchId: string) => void }) {
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [entryMode, setEntryMode] = useState<EntryMode>("staff");
  const [customerNameMode, setCustomerNameMode] = useState<CustomerNameMode>("optional");
  const [requireOpenSession, setRequireOpenSession] = useState(false);
  const [internalOrdersEnabled, setInternalOrdersEnabled] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [tableForm, setTableForm] = useState({ code: "", name: "" });
  const [feedback, setFeedback] = useState("");
  const [qr, setQr] = useState<{ title: string; url: string; image: string } | null>(null);
  const branch = branches.find((item) => item.id === activeBranchId) ?? branches[0];

  async function loadTables() {
    if (!supabase || !branch) return;
    setLoading(true);
    setFeedback("");
    const [tableResult, parameterResult, tenantParameterResult] = await Promise.all([
      supabase.from("restaurant_tables").select("id, store_id, code, name, access_token, sort_order, is_active").eq("store_id", branch.id).order("sort_order").order("code"),
      supabase.from("store_parameters").select("parameter_key, parameter_value").eq("store_id", branch.id).in("parameter_key", ["internal_order_entry_mode", "table_customer_name_mode", "require_open_table_session", "order_mode"]),
      supabase.from("tenant_parameters").select("parameter_value").eq("tenant_id", branch.tenant_id).eq("parameter_key", "order_mode").maybeSingle(),
    ]);
    setLoading(false);
    if (tableResult.error || parameterResult.error) {
      setTables([]);
      setFeedback(operationError(tableResult.error ?? parameterResult.error, "Não foi possível carregar as mesas."));
      return;
    }
    setTables((tableResult.data ?? []) as RestaurantTable[]);
    const parameters = new Map((parameterResult.data ?? []).map((item) => [item.parameter_key, item.parameter_value]));
    const savedEntryMode = parameters.get("internal_order_entry_mode");
    const savedNameMode = parameters.get("table_customer_name_mode");
    setEntryMode(savedEntryMode === "table" || savedEntryMode === "both" ? savedEntryMode : "staff");
    setCustomerNameMode(savedNameMode === "hidden" || savedNameMode === "required" ? savedNameMode : "optional");
    setRequireOpenSession(parameters.get("require_open_table_session") === true);
    const effectiveOrderMode = parameters.get("order_mode") ?? tenantParameterResult.data?.parameter_value ?? "whatsapp";
    setInternalOrdersEnabled(effectiveOrderMode === "internal" || effectiveOrderMode === "both");
  }

  useEffect(() => {
    void loadTables();
  }, [branch?.id]);

  async function saveParameters() {
    if (!supabase || !branch || saving) return;
    setSaving(true);
    setFeedback("");
    const updatedAt = new Date().toISOString();
    const { error } = await supabase.from("store_parameters").upsert([
      { store_id: branch.id, parameter_key: "internal_order_entry_mode", parameter_value: entryMode, is_public: false, updated_at: updatedAt },
      { store_id: branch.id, parameter_key: "table_customer_name_mode", parameter_value: customerNameMode, is_public: false, updated_at: updatedAt },
      { store_id: branch.id, parameter_key: "require_open_table_session", parameter_value: requireOpenSession, is_public: false, updated_at: updatedAt },
    ]);
    setSaving(false);
    setFeedback(error ? operationError(error, "Não foi possível salvar a operação.") : "Configuração da filial salva.");
  }

  async function createTable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !branch || saving) return;
    const code = tableForm.code.trim().toUpperCase();
    if (!code) return;
    setSaving(true);
    setFeedback("");
    const { data, error } = await supabase.from("restaurant_tables").insert({
      store_id: branch.id,
      code,
      name: tableForm.name.trim() || null,
      sort_order: tables.length,
      is_active: true,
    }).select("id, store_id, code, name, access_token, sort_order, is_active").single();
    setSaving(false);
    if (error) {
      setFeedback(operationError(error, "Não foi possível cadastrar a mesa."));
      return;
    }
    setTables((current) => [...current, data as RestaurantTable]);
    setTableForm({ code: "", name: "" });
    setShowEditor(false);
    setFeedback(`Mesa ${code} cadastrada.`);
  }

  async function toggleTable(table: RestaurantTable) {
    if (!supabase || saving) return;
    setSaving(true);
    const { error } = await supabase.from("restaurant_tables").update({ is_active: !table.is_active, updated_at: new Date().toISOString() }).eq("id", table.id);
    setSaving(false);
    if (error) {
      setFeedback(operationError(error, "Não foi possível alterar a mesa."));
      return;
    }
    setTables((current) => current.map((item) => item.id === table.id ? { ...item, is_active: !item.is_active } : item));
  }

  async function deleteTable(table: RestaurantTable) {
    if (!supabase || saving || !window.confirm(`Excluir a mesa ${table.code}?`)) return;
    setSaving(true);
    const { error } = await supabase.from("restaurant_tables").delete().eq("id", table.id);
    setSaving(false);
    if (error) {
      setFeedback(/foreign key|violates/i.test(error.message) ? "A mesa possui atendimentos e não pode ser excluída. Desative-a para preservar o histórico." : operationError(error, "Não foi possível excluir a mesa."));
      return;
    }
    setTables((current) => current.filter((item) => item.id !== table.id));
  }

  function tableUrl(table: RestaurantTable) {
    return `${window.location.origin}/mesa?token=${encodeURIComponent(table.access_token)}`;
  }

  function staffUrl() {
    return branch ? `${window.location.origin}/comanda?loja=${encodeURIComponent(branch.slug)}&filial=${encodeURIComponent(branch.id)}` : "";
  }

  async function copyLink(url: string, label: string) {
    await navigator.clipboard.writeText(url);
    setFeedback(`${label} copiado.`);
  }

  async function showQr(table: RestaurantTable) {
    const url = tableUrl(table);
    const image = await QRCode.toDataURL(url, { width: 320, margin: 2, color: { dark: "#18201d", light: "#ffffff" } });
    setQr({ title: table.name?.trim() || `Mesa ${table.code}`, url, image });
  }

  async function rotateToken(table: RestaurantTable) {
    if (!supabase || saving || !window.confirm(`Gerar um novo link para a mesa ${table.code}? O link anterior deixará de funcionar.`)) return;
    setSaving(true);
    const { data, error } = await supabase.rpc("rotate_restaurant_table_token", { p_table_id: table.id });
    setSaving(false);
    if (error || !data) {
      setFeedback(operationError(error, "Não foi possível renovar o link."));
      return;
    }
    setTables((current) => current.map((item) => item.id === table.id ? { ...item, access_token: String(data) } : item));
    setFeedback("Novo link gerado. Atualize o tablet desta mesa.");
  }

  const visibleTables = tables.filter((table) => `${table.code} ${table.name ?? ""}`.toLocaleLowerCase("pt-BR").includes(query.trim().toLocaleLowerCase("pt-BR")));

  if (!branch) return <section className="company-operation-page"><div className="operation-empty"><Store size={22} /><strong>Cadastre uma filial primeiro</strong></div></section>;

  return (
    <section className="company-operation-page">
      <header className="company-operation-heading">
        <div><span>Atendimento interno</span><h2>Mesas</h2><p>{branch.name} · {formatCnpj(branch.cnpj) || "CNPJ não informado"}</p></div>
        <label className="operation-branch-select"><span>Filial</span><select value={branch.id} onChange={(event) => onBranchChange(event.target.value)}>{branches.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      </header>

      <section className="table-operation-settings">
        {!internalOrdersEnabled ? <p className="table-operation-prerequisite"><ClipboardList size={17} /><span><strong>Comanda interna desativada</strong><small>Ative “Comanda interna” ou “Ambos” nos parâmetros da filial. Mesas e acessos configurados aqui serão preservados.</small></span></p> : null}
        <div className="table-setting-row">
          <div><strong>Origem da comanda</strong><small>Define os caminhos permitidos nesta filial.</small></div>
          <div className="table-mode-control" role="radiogroup" aria-label="Origem da comanda">
            <button className={entryMode === "table" ? "active" : ""} type="button" onClick={() => setEntryMode("table")}>Mesa</button>
            <button className={entryMode === "staff" ? "active" : ""} type="button" onClick={() => setEntryMode("staff")}>Funcionário</button>
            <button className={entryMode === "both" ? "active" : ""} type="button" onClick={() => setEntryMode("both")}>Ambos</button>
          </div>
        </div>
        <div className="table-setting-row">
          <div><strong>Nome do cliente na mesa</strong><small>Aplicado somente ao dispositivo da mesa.</small></div>
          <select value={customerNameMode} onChange={(event) => setCustomerNameMode(event.target.value as CustomerNameMode)} disabled={entryMode === "staff"}><option value="hidden">Não solicitar</option><option value="optional">Opcional</option><option value="required">Obrigatório</option></select>
        </div>
        <label className="table-setting-row table-setting-toggle"><span><strong>Exigir mesa aberta</strong><small>Bloqueia pedidos do tablet até um funcionário abrir o atendimento.</small></span><input type="checkbox" checked={requireOpenSession} onChange={(event) => setRequireOpenSession(event.target.checked)} disabled={entryMode === "staff"} /><i aria-hidden="true"><b /></i></label>
        <footer><button className="admin-primary" type="button" onClick={() => void saveParameters()} disabled={saving}>{saving ? <RefreshCw className="spinning" size={16} /> : <Check size={16} />} Salvar operação</button></footer>
      </section>

      {internalOrdersEnabled && (entryMode === "staff" || entryMode === "both") ? (
        <section className="staff-operation-link">
          <span className="operation-link-icon"><ClipboardList size={19} /></span>
          <div><strong>Link da equipe</strong><small>Funcionários autenticados escolhem uma mesa antes de montar a comanda.</small></div>
          <button className="admin-secondary" type="button" onClick={() => void copyLink(staffUrl(), "Link da equipe")}><Copy size={16} /> Copiar</button>
          <a className="icon-button" href={staffUrl()} target="_blank" rel="noreferrer" title="Abrir link da equipe" aria-label="Abrir link da equipe"><ExternalLink size={16} /></a>
        </section>
      ) : null}

      <div className="table-list-heading"><div><strong>Mesas cadastradas</strong><span>{tables.filter((table) => table.is_active).length} ativa(s)</span></div><button className="admin-primary" type="button" onClick={() => { setTableForm({ code: "", name: "" }); setShowEditor(true); }}><Plus size={16} /> Nova mesa</button></div>
      <div className="operation-toolbar"><label><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar mesa" /></label><button className="icon-button" type="button" title="Atualizar mesas" aria-label="Atualizar mesas" onClick={() => void loadTables()} disabled={loading}><RefreshCw className={loading ? "spinning" : ""} size={17} /></button></div>
      {feedback ? <p className="operation-feedback" role="status">{feedback}</p> : null}
      <div className="restaurant-table-grid">
        {loading ? <div className="operation-empty"><RefreshCw className="spinning" size={22} /><span>Carregando mesas...</span></div> : visibleTables.map((table) => (
          <article className={table.is_active ? "restaurant-table-card" : "restaurant-table-card inactive"} key={table.id}>
            <header><span>{table.code}</span><div><strong>{table.name?.trim() || `Mesa ${table.code}`}</strong><small>{table.is_active ? "Ativa" : "Desativada"}</small></div></header>
            {internalOrdersEnabled && (entryMode === "table" || entryMode === "both") ? <div className="restaurant-table-link"><code>{tableUrl(table).replace(window.location.origin, "")}</code><button type="button" title="Copiar link" aria-label={`Copiar link da mesa ${table.code}`} onClick={() => void copyLink(tableUrl(table), `Link da mesa ${table.code}`)}><Copy size={15} /></button></div> : <p className="restaurant-table-staff-only">{internalOrdersEnabled ? "Disponível para seleção da equipe." : "Disponível quando a comanda interna for ativada."}</p>}
            <footer>
              {internalOrdersEnabled && (entryMode === "table" || entryMode === "both") && table.is_active ? <button className="icon-button" type="button" title="Exibir QR Code" aria-label={`Exibir QR Code da mesa ${table.code}`} onClick={() => void showQr(table)}><QrCode size={16} /></button> : null}
              {internalOrdersEnabled && (entryMode === "table" || entryMode === "both") ? <button className="icon-button" type="button" title="Renovar link" aria-label={`Renovar link da mesa ${table.code}`} onClick={() => void rotateToken(table)} disabled={saving}><RotateCw size={16} /></button> : null}
              <button className={table.is_active ? "admin-secondary" : "admin-primary"} type="button" onClick={() => void toggleTable(table)} disabled={saving}>{table.is_active ? "Desativar" : "Ativar"}</button>
              <button className="icon-button table-delete" type="button" title="Excluir mesa" aria-label={`Excluir mesa ${table.code}`} onClick={() => void deleteTable(table)} disabled={saving}><Trash2 size={16} /></button>
            </footer>
          </article>
        ))}
        {!loading && !visibleTables.length ? <div className="operation-empty"><QrCode size={23} /><strong>Nenhuma mesa encontrada</strong></div> : null}
      </div>

      {showEditor ? (
        <div className="catalog-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowEditor(false); }}>
          <section className="admin-form-panel catalog-modal table-editor" role="dialog" aria-modal="true" aria-labelledby="table-editor-title">
            <header className="operation-modal-heading"><div><span>{branch.name}</span><h2 id="table-editor-title">Nova mesa</h2></div><button className="icon-button" type="button" title="Fechar" aria-label="Fechar" onClick={() => setShowEditor(false)}><X size={18} /></button></header>
            <form onSubmit={createTable}><label>Código<input value={tableForm.code} onChange={(event) => setTableForm({ ...tableForm, code: event.target.value.toUpperCase() })} placeholder="Ex.: 01" maxLength={30} required /></label><label>Nome opcional<input value={tableForm.name} onChange={(event) => setTableForm({ ...tableForm, name: event.target.value })} placeholder="Ex.: Varanda 01" /></label><footer className="admin-form-actions"><button className="admin-secondary" type="button" onClick={() => setShowEditor(false)}>Cancelar</button><button className="admin-primary" type="submit" disabled={saving}><Plus size={16} /> {saving ? "Salvando..." : "Cadastrar mesa"}</button></footer></form>
          </section>
        </div>
      ) : null}

      {qr ? (
        <div className="catalog-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setQr(null); }}>
          <section className="admin-form-panel catalog-modal table-qr-modal" role="dialog" aria-modal="true" aria-labelledby="table-qr-title"><header className="operation-modal-heading"><div><span>Acesso do dispositivo</span><h2 id="table-qr-title">{qr.title}</h2></div><button className="icon-button" type="button" title="Fechar" aria-label="Fechar" onClick={() => setQr(null)}><X size={18} /></button></header><img src={qr.image} alt={`QR Code de ${qr.title}`} /><code>{qr.url}</code><button className="admin-primary" type="button" onClick={() => void copyLink(qr.url, "Link da mesa")}><Copy size={16} /> Copiar link</button></section>
        </div>
      ) : null}
    </section>
  );
}
