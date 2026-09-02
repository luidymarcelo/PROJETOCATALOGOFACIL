"use client";

import {
  ArrowRight,
  ChefHat,
  ClipboardList,
  CreditCard,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Store,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabase";

type OperationalRole = "owner" | "branch_manager" | "waiter" | "cashier" | "kitchen" | "supervisor";
type OperationalWorkspace = {
  tenant: { id: string; name: string; slug: string };
  branches: Array<{ id: string; name: string; slug: string; cnpj?: string | null }>;
  access: { role: OperationalRole; name: string };
  operation: {
    entry_mode: "table" | "staff" | "both";
    customer_name_mode: "hidden" | "optional" | "required";
    require_open_table_session: boolean;
  };
};
type RestaurantTable = {
  id: string;
  code: string;
  name: string | null;
  is_active: boolean;
  session_id: string | null;
  session_status: "open" | "awaiting_payment" | null;
};

const roleLabels: Record<OperationalRole, string> = {
  owner: "Proprietário",
  branch_manager: "Gerente de filial",
  waiter: "Garçom",
  cashier: "Caixa",
  kitchen: "Cozinha",
  supervisor: "Supervisor",
};

function formatCnpj(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function operationalError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String((error as { message?: string } | null)?.message ?? "");
  if (/get_operational_workspace|schema cache/i.test(message)) return "A estrutura operacional ainda não foi aplicada no Supabase. Execute a migration 021_branch_access_tables_and_audit.sql.";
  return message || fallback;
}

export default function OperationPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [workspace, setWorkspace] = useState<OperationalWorkspace | null>(null);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [cnpj, setCnpj] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [openingTableId, setOpeningTableId] = useState("");
  const [message, setMessage] = useState("");

  async function loadWorkspace(currentSession: Session, selectedCnpj = cnpj || window.localStorage.getItem("catalogo-facil-operation-cnpj") || "") {
    if (!supabase) return;
    const normalizedCnpj = selectedCnpj.replace(/\D/g, "");
    if (normalizedCnpj.length !== 14) {
      setSession(currentSession);
      setWorkspace(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setMessage("");
    const { data, error } = await supabase.rpc("get_operational_workspace", { p_cnpj: normalizedCnpj });
    if (error || data?.error || !data?.tenant || !data?.branches?.length) {
      setWorkspace(null);
      setMessage(data?.error ?? operationalError(error, "Este usuário não possui acesso à filial informada."));
      setLoading(false);
      return;
    }
    const nextWorkspace = {
      ...data,
      operation: {
        entry_mode: data.operation?.entry_mode === "table" || data.operation?.entry_mode === "both" ? data.operation.entry_mode : "staff",
        customer_name_mode: data.operation?.customer_name_mode === "hidden" || data.operation?.customer_name_mode === "required" ? data.operation.customer_name_mode : "optional",
        require_open_table_session: data.operation?.require_open_table_session === true,
      },
    } as OperationalWorkspace;
    setWorkspace(nextWorkspace);
    setCnpj(formatCnpj(normalizedCnpj));
    window.localStorage.setItem("catalogo-facil-operation-cnpj", normalizedCnpj);
    const branch = nextWorkspace.branches[0];
    const [tableResult, sessionResult] = await Promise.all([
      supabase.from("restaurant_tables").select("id, code, name, is_active").eq("store_id", branch.id).eq("is_active", true).order("sort_order").order("code"),
      supabase.from("table_sessions").select("id, table_id, status").eq("store_id", branch.id).in("status", ["open", "awaiting_payment"]),
    ]);
    if (tableResult.error) {
      setTables([]);
      setMessage(operationalError(tableResult.error, "Não foi possível carregar as mesas."));
      setLoading(false);
      return;
    }
    const sessions = new Map((sessionResult.data ?? []).map((item) => [item.table_id, item]));
    setTables((tableResult.data ?? []).map((table) => {
      const activeSession = sessions.get(table.id);
      return {
        ...table,
        session_id: activeSession?.id ?? null,
        session_status: activeSession?.status === "open" || activeSession?.status === "awaiting_payment" ? activeSession.status : null,
      } as RestaurantTable;
    }));
    setLoading(false);
  }

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      setMessage("Supabase não está configurado neste ambiente.");
      return;
    }
    setCnpj(formatCnpj(window.localStorage.getItem("catalogo-facil-operation-cnpj") ?? ""));
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session) void loadWorkspace(data.session);
      else setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      if (!nextSession) {
        setWorkspace(null);
        setTables([]);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || submitting) return;
    const normalizedCnpj = cnpj.replace(/\D/g, "");
    if (normalizedCnpj.length !== 14) {
      setMessage("Informe o CNPJ da filial.");
      return;
    }
    setSubmitting(true);
    setMessage("");
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.session) {
      setSubmitting(false);
      setMessage(error?.message ?? "Não foi possível entrar.");
      return;
    }
    setSession(data.session);
    await loadWorkspace(data.session, normalizedCnpj);
    setSubmitting(false);
  }

  async function changeBranchContext(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    await loadWorkspace(session, cnpj);
  }

  async function signOut() {
    await supabase?.auth.signOut();
    setWorkspace(null);
  }

  async function openTable(table: RestaurantTable) {
    if (!supabase || openingTableId) return;
    setOpeningTableId(table.id);
    setMessage("");
    const { data, error } = await supabase.rpc("open_table_session", { p_table_id: table.id });
    setOpeningTableId("");
    if (error || !data?.session_id) {
      setMessage(operationalError(error, "Não foi possível abrir a mesa."));
      return;
    }
    setTables((current) => current.map((item) => item.id === table.id
      ? { ...item, session_id: String(data.session_id), session_status: data.status === "awaiting_payment" ? "awaiting_payment" : "open" }
      : item));
    setMessage(`${table.name?.trim() || `Mesa ${table.code}`} aberta para atendimento.`);
  }

  const canCreateOrders = workspace && ["owner", "branch_manager", "waiter", "supervisor"].includes(workspace.access.role);
  const canSeeProduction = workspace && ["owner", "branch_manager", "kitchen", "supervisor"].includes(workspace.access.role);
  const canSeeCashier = workspace && ["owner", "branch_manager", "cashier", "supervisor"].includes(workspace.access.role);
  const branch = workspace?.branches[0];
  const staffOrderingEnabled = workspace?.operation.entry_mode === "staff" || workspace?.operation.entry_mode === "both";
  const tableOrderingEnabled = workspace?.operation.entry_mode === "table" || workspace?.operation.entry_mode === "both";
  const operatorInitials = useMemo(() => (workspace?.access.name ?? "U").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(), [workspace?.access.name]);

  if (loading) return <main className="operation-page"><div className="operation-loading"><RefreshCw className="spinning" size={24} /><span>Carregando operação...</span></div></main>;

  if (!session || !workspace) {
    return (
      <main className="operation-page operation-login-page">
        <section className="operation-login-card">
          <span className="operation-login-mark"><ClipboardList size={25} /></span>
          <div><span>Portal operacional</span><h1>Entrar na filial</h1></div>
          <form onSubmit={session ? changeBranchContext : signIn}>
            <label>CNPJ da filial<input value={cnpj} onChange={(event) => setCnpj(formatCnpj(event.target.value))} placeholder="00.000.000/0001-00" inputMode="numeric" maxLength={18} required /></label>
            {!session ? <><label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label><label>Senha<input type="password" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label></> : null}
            {message ? <p className="operation-login-error" role="alert">{message}</p> : null}
            <button className="operation-primary" type="submit" disabled={submitting}>{submitting ? "Entrando..." : session ? "Acessar filial" : "Entrar"} <ArrowRight size={17} /></button>
          </form>
          {session ? <button className="operation-link-button" type="button" onClick={() => void signOut()}>Entrar com outro usuário</button> : null}
          <a href="/acesso">Voltar às opções de acesso</a>
        </section>
      </main>
    );
  }

  return (
    <main className="operation-page">
      <header className="operation-topbar">
        <div className="operation-brand"><span><Store size={18} /></span><div><strong>{workspace.tenant.name}</strong><small>{branch?.name}</small></div></div>
        <div className="operation-user"><span>{operatorInitials}</span><div><strong>{workspace.access.name}</strong><small>{roleLabels[workspace.access.role]}</small></div><button type="button" title="Sair" aria-label="Sair" onClick={() => void signOut()}><LogOut size={17} /></button></div>
      </header>
      <div className="operation-shell">
        <header className="operation-heading"><div><span>Turno atual</span><h1>Operação da filial</h1><p>{branch?.name}</p></div><button className="operation-secondary" type="button" onClick={() => session && void loadWorkspace(session)}><RefreshCw size={16} /> Atualizar</button></header>

        <section className="operation-role-actions">
          {canCreateOrders && staffOrderingEnabled ? <article><span><ClipboardList size={20} /></span><div><strong>Nova comanda</strong><small>{tables.length ? "Selecione uma mesa abaixo" : "Atendimento sem mesas cadastradas"}</small></div>{!tables.length && branch ? <a href={`/comanda?loja=${encodeURIComponent(branch.slug)}&filial=${encodeURIComponent(branch.id)}`}>Abrir <ArrowRight size={15} /></a> : null}</article> : null}
          {canSeeProduction ? <article><span><ChefHat size={20} /></span><div><strong>Produção</strong><small>Pedidos novos, em preparo e prontos</small></div><a href="/pedidos?visao=cozinha">Abrir <ArrowRight size={15} /></a></article> : null}
          {canSeeCashier ? <article><span><CreditCard size={20} /></span><div><strong>Caixa</strong><small>Contas abertas, pagamentos e fechamento</small></div><a href="/pedidos?visao=caixa">Abrir <ArrowRight size={15} /></a></article> : null}
        </section>

        {canCreateOrders && tables.length && (staffOrderingEnabled || tableOrderingEnabled) ? (
          <section className="operation-tables">
            <header><div><span>Atendimentos</span><h2>Mesas da filial</h2></div><strong>{tables.filter((table) => table.session_id).length} em atendimento</strong></header>
            <div className="operation-table-grid">{tables.map((table) => {
              const tableName = table.name?.trim() || `Mesa ${table.code}`;
              const requiresOpening = Boolean(tableOrderingEnabled && workspace.operation.require_open_table_session && !table.session_id);
              return (
                <article className={table.session_id ? "operation-table-card active" : "operation-table-card"} key={table.id}>
                  <div className="operation-table-card-heading"><span>{table.code}</span><div><strong>{tableName}</strong><small>{table.session_status === "awaiting_payment" ? "Aguardando pagamento" : table.session_id ? "Em atendimento" : requiresOpening ? "Tablet aguardando abertura" : "Disponível"}</small></div></div>
                  <footer>
                    {!table.session_id && tableOrderingEnabled ? <button type="button" className="operation-secondary" disabled={Boolean(openingTableId)} onClick={() => void openTable(table)}>{openingTableId === table.id ? <RefreshCw className="spinning" size={15} /> : <Store size={15} />} Abrir mesa</button> : null}
                    {staffOrderingEnabled ? <a className="operation-primary compact" href={`/comanda?loja=${encodeURIComponent(branch?.slug ?? "")}&filial=${encodeURIComponent(branch?.id ?? "")}&mesa=${encodeURIComponent(table.id)}`}>{table.session_id ? "Adicionar pedido" : "Nova comanda"} <ArrowRight size={15} /></a> : null}
                    {!staffOrderingEnabled && table.session_id ? <span className="operation-table-ready">Tablet liberado</span> : null}
                  </footer>
                </article>
              );
            })}</div>
          </section>
        ) : null}

        {message ? <p className="operation-dashboard-feedback" role="status">{message}</p> : null}

        <footer className="operation-security"><ShieldCheck size={16} /><span>As ações desta sessão serão registradas em nome de {workspace.access.name}.</span></footer>
      </div>
    </main>
  );
}
