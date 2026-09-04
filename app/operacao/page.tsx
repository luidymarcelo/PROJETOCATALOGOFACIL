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
  access: { role: OperationalRole; roles?: OperationalRole[]; name: string };
  operation: {
    entry_mode: "table" | "staff" | "both";
    customer_name_mode: "hidden" | "optional" | "required";
    require_open_table_session: boolean;
    flow: "simplified" | "complete";
    production_release_mode: "whole_order" | "per_item";
  };
};
type RestaurantTable = {
  id: string;
  code: string;
  name: string | null;
  is_active: boolean;
  session_id: string | null;
  session_status: "open" | "awaiting_payment" | null;
  session_payment_status: "pending" | "paid" | "refunded" | null;
  opened_at: string | null;
  order_count: number;
  total: number;
  ready_items: number;
  undelivered_items: number;
};

const roleLabels: Record<OperationalRole, string> = {
  owner: "Proprietário",
  branch_manager: "Gerente de filial",
  waiter: "Garçom",
  cashier: "Caixa",
  kitchen: "Cozinha",
  supervisor: "Supervisor",
};

function accessRoles(access: OperationalWorkspace["access"] | undefined) {
  const roles = Array.isArray(access?.roles) ? access.roles.filter((role) => role in roleLabels) : [];
  return roles.length ? roles : access?.role ? [access.role] : [];
}

function hasOperationalRole(workspace: OperationalWorkspace | null, allowed: OperationalRole[]) {
  return accessRoles(workspace?.access).some((role) => allowed.includes(role));
}

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
  if (/run_internal_workflow_action|production_status|payment_confirmed_at/i.test(message)) return "O fluxo operacional ainda não foi aplicado no Supabase. Execute a migration 023_operational_workflow.sql.";
  if (/get_operational_workspace|schema cache/i.test(message)) return "A estrutura operacional ainda não foi aplicada no Supabase. Execute a migration 021_branch_access_tables_and_audit.sql.";
  if (/awaiting payment/i.test(message)) return "A mesa está em fechamento e não aceita novos pedidos.";
  return message || fallback;
}

const operationCurrency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const OPERATION_CNPJ_STORAGE_KEY = "liist-operation-cnpj";
const LEGACY_OPERATION_CNPJ_STORAGE_KEY = "catalogo-facil-operation-cnpj";

function storedOperationCnpj() {
  return window.localStorage.getItem(OPERATION_CNPJ_STORAGE_KEY)
    ?? window.localStorage.getItem(LEGACY_OPERATION_CNPJ_STORAGE_KEY)
    ?? "";
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
  const [notification, setNotification] = useState("");

  function notifyReadyOrder() {
    const text = "A cozinha liberou um pedido para entrega.";
    setNotification(text);
    window.setTimeout(() => setNotification((current) => current === text ? "" : current), 5500);
    navigator.vibrate?.([120, 60, 120]);
    try {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 740;
      gain.gain.setValueAtTime(0.06, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.18);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.18);
    } catch {
      // The in-app alert remains visible when browser audio is unavailable.
    }
  }

  async function loadWorkspace(currentSession: Session, selectedCnpj = cnpj || storedOperationCnpj(), silent = false) {
    if (!supabase) return;
    const normalizedCnpj = selectedCnpj.replace(/\D/g, "");
    if (normalizedCnpj.length !== 14) {
      setSession(currentSession);
      setWorkspace(null);
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    if (!silent) setMessage("");
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
        flow: data.operation?.flow === "simplified" ? "simplified" : "complete",
        production_release_mode: data.operation?.production_release_mode === "per_item" ? "per_item" : "whole_order",
      },
    } as OperationalWorkspace;
    setWorkspace(nextWorkspace);
    setCnpj(formatCnpj(normalizedCnpj));
    window.localStorage.setItem(OPERATION_CNPJ_STORAGE_KEY, normalizedCnpj);
    const branch = nextWorkspace.branches[0];
    const tableResult = await supabase.from("restaurant_tables").select("id, code, name, is_active").eq("store_id", branch.id).eq("is_active", true).order("sort_order").order("code");
    const modernSessionResult = await supabase.from("table_sessions").select("id, table_id, status, payment_status, opened_at").eq("store_id", branch.id).in("status", ["open", "awaiting_payment"]);
    const sessionResult = modernSessionResult.error && /payment_status|schema cache/i.test(modernSessionResult.error.message)
      ? await supabase.from("table_sessions").select("id, table_id, status, opened_at").eq("store_id", branch.id).in("status", ["open", "awaiting_payment"])
      : modernSessionResult;
    if (tableResult.error) {
      setTables([]);
      setMessage(operationalError(tableResult.error, "Não foi possível carregar as mesas."));
      setLoading(false);
      return;
    }
    const activeSessions = sessionResult.data ?? [];
    const sessionIds = activeSessions.map((item) => item.id);
    let orderRows: Array<{ table_session_id: string | null; total: number; status: string; order_items?: Array<{ production_status?: string; delivery_status?: string }> }> = [];
    if (sessionIds.length) {
      const modernOrderResult = await supabase.from("orders").select("table_session_id, total, status, order_items(production_status, delivery_status)").in("table_session_id", sessionIds).neq("status", "cancelled");
      const orderResult = modernOrderResult.error && /production_status|delivery_status|schema cache/i.test(modernOrderResult.error.message)
        ? await supabase.from("orders").select("table_session_id, total, status, order_items(id)").in("table_session_id", sessionIds).neq("status", "cancelled")
        : modernOrderResult;
      orderRows = (orderResult.data ?? []) as unknown as typeof orderRows;
    }
    const sessions = new Map(activeSessions.map((item) => [item.table_id, item]));
    setTables((tableResult.data ?? []).map((table) => {
      const activeSession = sessions.get(table.id);
      const sessionOrders = orderRows.filter((order) => order.table_session_id === activeSession?.id);
      const sessionItems = sessionOrders.flatMap((order) => (order.order_items ?? []).map((item) => ({
        production_status: item.production_status ?? (["ready", "completed"].includes(order.status) ? "ready" : "pending"),
        delivery_status: item.delivery_status ?? (order.status === "completed" ? "delivered" : "pending"),
      })));
      return {
        ...table,
        session_id: activeSession?.id ?? null,
        session_status: activeSession?.status === "open" || activeSession?.status === "awaiting_payment" ? activeSession.status : null,
        session_payment_status: activeSession && "payment_status" in activeSession ? (activeSession.payment_status as RestaurantTable["session_payment_status"]) : null,
        opened_at: activeSession?.opened_at ?? null,
        order_count: sessionOrders.length,
        total: sessionOrders.reduce((sum, order) => sum + Number(order.total), 0),
        ready_items: sessionItems.filter((item) => item.production_status === "ready" && item.delivery_status === "pending").length,
        undelivered_items: sessionItems.filter((item) => item.delivery_status === "pending").length,
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
    setCnpj(formatCnpj(storedOperationCnpj()));
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

  useEffect(() => {
    const branchId = workspace?.branches[0]?.id;
    const client = supabase;
    if (!client || !session || !branchId) return;
    let reloadTimer = 0;
    const refresh = () => {
      window.clearTimeout(reloadTimer);
      reloadTimer = window.setTimeout(() => void loadWorkspace(session, storedOperationCnpj(), true), 220);
    };
    const channel = client.channel(`table-map-${branchId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `store_id=eq.${branchId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "table_sessions", filter: `store_id=eq.${branchId}` }, refresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "order_events", filter: `store_id=eq.${branchId}` }, (payload) => {
        if ((payload.new as { event_type?: string }).event_type === "mark_ready" && hasOperationalRole(workspace, ["owner", "branch_manager", "waiter", "supervisor"])) notifyReadyOrder();
        refresh();
      })
      .subscribe();
    return () => {
      window.clearTimeout(reloadTimer);
      void client.removeChannel(channel);
    };
  }, [session, workspace?.branches[0]?.id]);

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

  async function requestClosing(table: RestaurantTable) {
    if (!supabase || !table.session_id || openingTableId) return;
    setOpeningTableId(table.id);
    setMessage("");
    const { error } = await supabase.rpc("run_internal_workflow_action", {
      p_action: "request_closing",
      p_order_id: null,
      p_item_id: null,
      p_session_id: table.session_id,
      p_payment_method: null,
    });
    setOpeningTableId("");
    if (error) {
      setMessage(operationalError(error, "Não foi possível solicitar o fechamento."));
      return;
    }
    if (session) await loadWorkspace(session, storedOperationCnpj(), true);
    setMessage(`${table.name?.trim() || `Mesa ${table.code}`} enviada ao caixa.`);
  }

  const canCreateOrders = hasOperationalRole(workspace, ["owner", "branch_manager", "waiter", "supervisor"]);
  const canSeeProduction = hasOperationalRole(workspace, ["owner", "branch_manager", "kitchen", "supervisor"]);
  const canSeeCashier = hasOperationalRole(workspace, ["owner", "branch_manager", "cashier", "supervisor"]);
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
        <div className="operation-user"><span>{operatorInitials}</span><div><strong>{workspace.access.name}</strong><small>{accessRoles(workspace.access).map((role) => roleLabels[role]).join(" · ")}</small></div><button type="button" title="Sair" aria-label="Sair" onClick={() => void signOut()}><LogOut size={17} /></button></div>
      </header>
      <div className="operation-shell">
        <header className="operation-heading"><div><span>Turno atual</span><h1>Operação da filial</h1><p>{branch?.name}</p></div><button className="operation-secondary" type="button" onClick={() => session && void loadWorkspace(session)}><RefreshCw size={16} /> Atualizar</button></header>

        {notification ? <div className="workflow-notice operation-ready-notice" role="status"><ChefHat size={17} /> {notification}<a href="/pedidos?visao=atendimento">Ver pedido</a></div> : null}

        <section className="operation-role-actions">
          {canCreateOrders ? <article><span><ClipboardList size={20} /></span><div><strong>Atendimento</strong><small>Mesas, entregas e solicitações de fechamento</small></div><a href={tables.length ? "/pedidos?visao=atendimento" : branch ? `/comanda?loja=${encodeURIComponent(branch.slug)}&filial=${encodeURIComponent(branch.id)}` : "/pedidos?visao=atendimento"}>Abrir <ArrowRight size={15} /></a></article> : null}
          {canSeeProduction ? <article><span><ChefHat size={20} /></span><div><strong>Produção</strong><small>Pedidos novos, em preparo e prontos</small></div><a href="/pedidos?visao=cozinha">Abrir <ArrowRight size={15} /></a></article> : null}
          {canSeeCashier ? <article><span><CreditCard size={20} /></span><div><strong>Caixa</strong><small>Contas abertas, pagamentos e fechamento</small></div><a href="/pedidos?visao=caixa">Abrir <ArrowRight size={15} /></a></article> : null}
        </section>

        {canCreateOrders && tables.length && (staffOrderingEnabled || tableOrderingEnabled) ? (
          <section className="operation-tables">
            <header><div><span>Atendimentos</span><h2>Mesas da filial</h2></div><strong>{tables.filter((table) => table.session_id).length} em atendimento</strong></header>
            <div className="operation-table-grid">{tables.map((table) => {
              const tableName = table.name?.trim() || `Mesa ${table.code}`;
              const requiresOpening = Boolean(tableOrderingEnabled && workspace.operation.require_open_table_session && !table.session_id);
              const isClosing = table.session_status === "awaiting_payment";
              const isPaid = table.session_payment_status === "paid";
              const tableStateClass = isPaid ? "paid" : isClosing ? "closing" : table.ready_items ? "ready" : table.session_id ? "active" : "";
              const tableStateLabel = isPaid
                ? "Pagamento confirmado"
                : isClosing
                  ? "Aguardando pagamento"
                  : table.ready_items
                    ? `${table.ready_items} item(ns) para entregar`
                    : table.session_id
                      ? "Em atendimento"
                      : requiresOpening
                        ? "Tablet aguardando abertura"
                        : "Disponível";
              return (
                <article className={`operation-table-card ${tableStateClass}`} key={table.id}>
                  <div className="operation-table-card-heading"><span>{table.code}</span><div><strong>{tableName}</strong><small>{tableStateLabel}</small></div></div>
                  {table.session_id ? <div className="operation-table-summary"><span>{table.order_count} comanda(s)</span><b>{operationCurrency.format(table.total)}</b></div> : null}
                  <footer>
                    {!table.session_id && tableOrderingEnabled ? <button type="button" className="operation-secondary" disabled={Boolean(openingTableId)} onClick={() => void openTable(table)}>{openingTableId === table.id ? <RefreshCw className="spinning" size={15} /> : <Store size={15} />} Abrir mesa</button> : null}
                    {staffOrderingEnabled && !isClosing ? <a className="operation-primary compact" href={`/comanda?loja=${encodeURIComponent(branch?.slug ?? "")}&filial=${encodeURIComponent(branch?.id ?? "")}&mesa=${encodeURIComponent(table.id)}`}>{table.session_id ? "Adicionar" : "Nova comanda"} <ArrowRight size={15} /></a> : null}
                    {table.session_id && !isClosing && table.ready_items ? <a className="operation-secondary" href="/pedidos?visao=atendimento">Entregar</a> : null}
                    {table.session_id && !isClosing && table.order_count ? <button type="button" className="operation-secondary" disabled={Boolean(openingTableId)} onClick={() => void requestClosing(table)}>Fechar conta</button> : null}
                    {isClosing ? <a className="operation-secondary" href={canSeeCashier ? "/pedidos?visao=caixa" : "/pedidos?visao=atendimento"}>{isPaid && canSeeCashier ? "Liberar" : "Ver conta"}</a> : null}
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
