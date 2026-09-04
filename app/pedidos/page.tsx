"use client";

import {
  ArrowLeft,
  BellRing,
  Check,
  CheckCircle2,
  ChefHat,
  Clock3,
  CreditCard,
  LogOut,
  RefreshCw,
  RotateCcw,
  Store,
  UtensilsCrossed,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type Branch = { id: string; name: string; slug: string; tenant_id: string };
type Tenant = { id: string; name: string };
type OperationalRole = "owner" | "branch_manager" | "waiter" | "cashier" | "kitchen" | "supervisor";
type OperationalView = "atendimento" | "cozinha" | "caixa";
type OperationFlow = "simplified" | "complete";
type ProductionReleaseMode = "whole_order" | "per_item";
type OrderStatus = "draft" | "sent_whatsapp" | "accepted" | "preparing" | "ready" | "completed" | "cancelled";
type ItemProductionStatus = "pending" | "preparing" | "ready" | "cancelled";
type ItemDeliveryStatus = "pending" | "delivered" | "cancelled";

type OrderItem = {
  id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  total: number;
  selected_options?: Array<{ group_name?: string; item_name?: string; price_delta?: number }>;
  production_status: ItemProductionStatus;
  delivery_status: ItemDeliveryStatus;
  ready_at?: string | null;
  delivered_at?: string | null;
};

type InternalOrder = {
  id: string;
  store_id: string;
  order_code: string;
  status: OrderStatus;
  customer_name: string | null;
  table_id: string | null;
  table_session_id: string | null;
  order_source: "table_device" | "staff" | "customer";
  created_by_name: string | null;
  created_by_role: string | null;
  restaurant_tables?: { code?: string; name?: string | null } | null;
  payment_method: string | null;
  payment_status: "pending" | "paid" | "refunded";
  billing_status: "pending" | "billed" | "cancelled";
  notes: string | null;
  total: number;
  created_at: string;
  order_items: OrderItem[];
};

type TableSession = {
  id: string;
  store_id: string;
  table_id: string;
  status: "open" | "awaiting_payment" | "closed" | "cancelled";
  payment_status: "pending" | "paid" | "refunded";
  payment_method: string | null;
  closing_requested_at: string | null;
  payment_confirmed_at: string | null;
  opened_at: string;
  restaurant_tables?: { code?: string; name?: string | null } | null;
};

type WorkspaceResponse = {
  tenant?: Tenant;
  branches?: Branch[];
  access?: { role?: OperationalRole; roles?: OperationalRole[] };
  operation?: { flow?: OperationFlow; production_release_mode?: ProductionReleaseMode };
  error?: string;
};

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const viewLabels: Record<OperationalView, string> = { atendimento: "Atendimento", cozinha: "Cozinha", caixa: "Caixa" };
const paymentMethods = ["Pix", "Dinheiro", "Cartão de crédito", "Cartão de débito"];
const OPERATION_CNPJ_STORAGE_KEY = "liist-operation-cnpj";
const BRANCH_CNPJ_STORAGE_KEY = "liist-branch-cnpj";

function workspaceRoles(access: WorkspaceResponse["access"]) {
  const roles = Array.isArray(access?.roles) ? access.roles.filter(Boolean) : [];
  return roles.length ? roles : access?.role ? [access.role] : [];
}

function allowedViews(roles: OperationalRole[]) {
  const elevated = roles.some((role) => ["owner", "branch_manager", "supervisor"].includes(role));
  return ([
    (elevated || roles.includes("waiter")) && "atendimento",
    (elevated || roles.includes("kitchen")) && "cozinha",
    (elevated || roles.includes("cashier")) && "caixa",
  ].filter(Boolean) as OperationalView[]);
}

function tableLabel(value: { restaurant_tables?: { code?: string; name?: string | null } | null }) {
  const table = value.restaurant_tables;
  return table?.name?.trim() || (table?.code ? `Mesa ${table.code}` : "Sem mesa");
}

function optionLabel(item: OrderItem) {
  return (item.selected_options ?? [])
    .map((option) => option.item_name ? `${option.group_name ? `${option.group_name}: ` : ""}${option.item_name}` : "")
    .filter(Boolean)
    .join(" · ");
}

function elapsedLabel(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
}

function normalizeOrders(rows: unknown[]) {
  return rows.map((raw) => {
    const order = raw as InternalOrder;
    const items = (order.order_items ?? []).map((item) => ({
      ...item,
      production_status: item.production_status ?? (["ready", "completed"].includes(order.status) ? "ready" : order.status === "preparing" ? "preparing" : "pending"),
      delivery_status: item.delivery_status ?? (order.status === "completed" ? "delivered" : "pending"),
    }));
    return { ...order, order_items: items };
  });
}

function workflowError(message: string) {
  if (/run_internal_workflow_action|schema cache|production_status|payment_confirmed_at/i.test(message)) return "O fluxo operacional ainda não foi aplicado no Supabase. Execute a migration 023_operational_workflow.sql.";
  if (/awaiting payment/i.test(message)) return "A mesa está em fechamento e não aceita novos pedidos.";
  if (/no items are ready/i.test(message)) return "Ainda não há item liberado para entrega.";
  if (/confirm delivery of all items/i.test(message)) return "Confirme a entrega de todos os itens antes de liberar a mesa.";
  if (/confirm payment/i.test(message)) return "Confirme o pagamento antes de liberar a mesa.";
  if (/request table closing/i.test(message)) return "Solicite o fechamento antes de confirmar o pagamento.";
  if (/paid table cannot be reopened/i.test(message)) return "Esta conta já foi paga e deve ser liberada.";
  return message;
}

export default function InternalOrdersPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [roles, setRoles] = useState<OperationalRole[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [view, setView] = useState<OperationalView>("atendimento");
  const [flow, setFlow] = useState<OperationFlow>("complete");
  const [releaseMode, setReleaseMode] = useState<ProductionReleaseMode>("whole_order");
  const [orders, setOrders] = useState<InternalOrder[]>([]);
  const [tableSessions, setTableSessions] = useState<TableSession[]>([]);
  const [paymentBySession, setPaymentBySession] = useState<Record<string, string>>({});
  const [kitchenFilter, setKitchenFilter] = useState<"active" | "ready" | "all">("active");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingKey, setSavingKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadWorkspace() {
    if (!supabase || !session) return;
    let workspace: WorkspaceResponse | null = null;
    const { data: ownerWorkspace } = await supabase.functions.invoke("create-store-user", { body: { action: "get-company-workspace" } });
    if (ownerWorkspace?.tenant && ownerWorkspace?.branches?.length) workspace = ownerWorkspace as WorkspaceResponse;

    if (!workspace) {
      const { data: databaseWorkspace } = await supabase.rpc("get_company_workspace");
      if (databaseWorkspace?.tenant && databaseWorkspace?.branches?.length) workspace = databaseWorkspace as WorkspaceResponse;
    }

    if (!workspace) {
      const cnpj = window.localStorage.getItem(OPERATION_CNPJ_STORAGE_KEY)
        ?? window.localStorage.getItem(BRANCH_CNPJ_STORAGE_KEY)
        ?? window.localStorage.getItem("catalogo-facil-operation-cnpj")
        ?? window.localStorage.getItem("catalogo-facil-branch-cnpj")
        ?? "";
      if (cnpj) {
        const { data: operationalWorkspace, error: operationalError } = await supabase.rpc("get_operational_workspace", { p_cnpj: cnpj });
        if (operationalWorkspace?.tenant && operationalWorkspace?.branches?.length) workspace = operationalWorkspace as WorkspaceResponse;
        else if (operationalError) setError(workflowError(operationalError.message));
      }
    }

    if (!workspace?.tenant || !workspace.branches?.length) {
      setLoading(false);
      setError(workspace?.error ?? "Este login não está vinculado a uma empresa ou filial.");
      return;
    }

    const nextRoles = workspaceRoles(workspace.access);
    setTenant(workspace.tenant);
    setRoles(nextRoles);
    setBranches(workspace.branches);
    setSelectedBranchId((current) => current && workspace!.branches!.some((branch) => branch.id === current) ? current : workspace!.branches![0].id);
    if (workspace.operation?.flow) setFlow(workspace.operation.flow);
    if (workspace.operation?.production_release_mode) setReleaseMode(workspace.operation.production_release_mode);
    const permitted = allowedViews(nextRoles);
    const requested = new URLSearchParams(window.location.search).get("visao") as OperationalView | null;
    setView(requested && permitted.includes(requested) ? requested : permitted[0] ?? "atendimento");
    setLoading(false);
  }

  async function loadOperationData(branchId = selectedBranchId, silent = false) {
    if (!supabase || !branchId) return;
    if (!silent) setRefreshing(true);
    const modernOrderSelect = "id, store_id, order_code, status, customer_name, table_id, table_session_id, order_source, created_by_name, created_by_role, payment_method, payment_status, billing_status, notes, total, created_at, restaurant_tables(code, name), order_items(id, product_name, unit_price, quantity, total, selected_options, production_status, delivery_status, ready_at, delivered_at)";
    const legacyOrderSelect = "id, store_id, order_code, status, customer_name, table_id, table_session_id, order_source, created_by_name, created_by_role, payment_method, payment_status, billing_status, notes, total, created_at, restaurant_tables(code, name), order_items(id, product_name, unit_price, quantity, total, selected_options)";
    const modernSessionSelect = "id, store_id, table_id, status, payment_status, payment_method, closing_requested_at, payment_confirmed_at, opened_at, restaurant_tables(code, name)";
    const legacySessionSelect = "id, store_id, table_id, status, opened_at, restaurant_tables(code, name)";

    const modernOrderResult = await supabase.from("orders").select(modernOrderSelect).eq("store_id", branchId).eq("order_channel", "internal").order("created_at", { ascending: false });
    const modernSessionResult = await supabase.from("table_sessions").select(modernSessionSelect).eq("store_id", branchId).in("status", ["open", "awaiting_payment"]).order("opened_at", { ascending: true });
    const orderResult = modernOrderResult.error && /production_status|delivery_status|schema cache/i.test(modernOrderResult.error.message)
      ? await supabase.from("orders").select(legacyOrderSelect).eq("store_id", branchId).eq("order_channel", "internal").order("created_at", { ascending: false })
      : modernOrderResult;
    const sessionResult = modernSessionResult.error && /payment_status|closing_requested_at|schema cache/i.test(modernSessionResult.error.message)
      ? await supabase.from("table_sessions").select(legacySessionSelect).eq("store_id", branchId).in("status", ["open", "awaiting_payment"]).order("opened_at", { ascending: true })
      : modernSessionResult;

    const parameterResult = await supabase.from("store_parameters").select("parameter_key, parameter_value").eq("store_id", branchId).in("parameter_key", ["operation_flow", "production_release_mode"]);
    setRefreshing(false);
    if (orderResult.error || sessionResult.error) {
      setError(workflowError(orderResult.error?.message ?? sessionResult.error?.message ?? "Não foi possível carregar a operação."));
      return;
    }

    const nextOrders = normalizeOrders((orderResult.data ?? []) as unknown[]);
    const nextSessions = ((sessionResult.data ?? []) as unknown[]).map((raw) => {
      const value = raw as TableSession;
      const accountOrders = nextOrders.filter((order) => order.table_session_id === value.id && order.status !== "cancelled");
      const inferredPaid = accountOrders.length > 0 && accountOrders.every((order) => order.payment_status === "paid");
      return { ...value, payment_status: value.payment_status ?? (inferredPaid ? "paid" : "pending"), payment_method: value.payment_method ?? null, closing_requested_at: value.closing_requested_at ?? null, payment_confirmed_at: value.payment_confirmed_at ?? null };
    });
    setOrders(nextOrders);
    setTableSessions(nextSessions);
    setError("");
    if (!parameterResult.error) {
      const parameters = new Map((parameterResult.data ?? []).map((item) => [item.parameter_key, item.parameter_value]));
      setFlow(parameters.get("operation_flow") === "simplified" ? "simplified" : "complete");
      setReleaseMode(parameters.get("production_release_mode") === "per_item" ? "per_item" : "whole_order");
    }
  }

  useEffect(() => {
    if (!supabase) { setLoading(false); setError("Supabase não está configurado neste ambiente."); return; }
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => { if (mounted) { setSession(data.session); if (!data.session) setLoading(false); } });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => { if (mounted) { setSession(nextSession); if (!nextSession) setLoading(false); } });
    return () => { mounted = false; data.subscription.unsubscribe(); };
  }, []);

  useEffect(() => { if (session) void loadWorkspace(); }, [session]);
  useEffect(() => { if (selectedBranchId) void loadOperationData(selectedBranchId); }, [selectedBranchId]);

  function signalOperator(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => current === message ? "" : current), 5500);
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
      // The visual notification remains available when autoplay is blocked.
    }
  }

  useEffect(() => {
    const client = supabase;
    if (!client || !selectedBranchId) return;
    let reloadTimer = 0;
    const queueReload = () => { window.clearTimeout(reloadTimer); reloadTimer = window.setTimeout(() => void loadOperationData(selectedBranchId, true), 220); };
    const channel = client.channel(`operation-${selectedBranchId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders", filter: `store_id=eq.${selectedBranchId}` }, () => { if (view === "cozinha") signalOperator("Nova comanda recebida na cozinha."); queueReload(); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "order_items" }, (payload) => {
        void payload;
        queueReload();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "table_sessions", filter: `store_id=eq.${selectedBranchId}` }, queueReload)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "order_events", filter: `store_id=eq.${selectedBranchId}` }, (payload) => {
        const eventType = (payload.new as { event_type?: string }).event_type;
        if (view === "atendimento" && eventType === "mark_ready") signalOperator("A cozinha liberou um pedido para entrega.");
        if (view === "caixa" && eventType === "request_closing") signalOperator("Uma mesa solicitou fechamento.");
        queueReload();
      })
      .subscribe();
    return () => { window.clearTimeout(reloadTimer); void client.removeChannel(channel); };
  }, [selectedBranchId, view]);

  async function runWorkflow(action: string, options: { orderId?: string; itemId?: string; sessionId?: string; paymentMethod?: string } = {}) {
    if (!supabase || savingKey) return false;
    const key = options.itemId ?? options.orderId ?? options.sessionId ?? action;
    setSavingKey(key);
    setError("");
    const { error: actionError } = await supabase.rpc("run_internal_workflow_action", { p_action: action, p_order_id: options.orderId ?? null, p_item_id: options.itemId ?? null, p_session_id: options.sessionId ?? null, p_payment_method: options.paymentMethod ?? null });
    setSavingKey("");
    if (actionError) { setError(workflowError(actionError.message)); return false; }
    await loadOperationData(selectedBranchId, true);
    return true;
  }

  async function deliverSession(sessionId: string) {
    if (!supabase || savingKey) return;
    const eligible = orders.filter((order) => order.table_session_id === sessionId && order.status !== "cancelled" && order.order_items.some((item) => item.delivery_status === "pending" && (flow === "simplified" || item.production_status === "ready")));
    if (!eligible.length) { setError("Ainda não há item disponível para confirmar a entrega."); return; }
    setSavingKey(sessionId);
    setError("");
    for (const order of eligible) {
      const { error: actionError } = await supabase.rpc("run_internal_workflow_action", { p_action: "mark_delivered", p_order_id: order.id, p_item_id: null, p_session_id: sessionId, p_payment_method: null });
      if (actionError) { setSavingKey(""); setError(workflowError(actionError.message)); return; }
    }
    setSavingKey("");
    await loadOperationData(selectedBranchId, true);
  }

  async function settleStandalone(order: InternalOrder) {
    if (!supabase || savingKey) return;
    setSavingKey(order.id);
    const { error: updateError } = await supabase.rpc("update_internal_order", { p_order_id: order.id, p_status: order.status === "completed" ? null : "completed", p_payment_status: "paid", p_billing_status: "billed" });
    setSavingKey("");
    if (updateError) setError(workflowError(updateError.message)); else await loadOperationData(selectedBranchId, true);
  }

  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId);
  const views = useMemo(() => allowedViews(roles), [roles]);
  const sessionsByPriority = useMemo(() => [...tableSessions].sort((a, b) => a.status !== b.status ? a.status === "awaiting_payment" ? -1 : 1 : new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime()), [tableSessions]);
  const branchOrders = orders.filter((order) => order.status !== "cancelled");
  const standaloneOrders = branchOrders.filter((order) => !order.table_session_id);

  function changeView(nextView: OperationalView) {
    const params = new URLSearchParams(window.location.search);
    params.set("visao", nextView);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    setView(nextView);
    setError("");
  }

  if (loading) return <main className="workflow-page"><div className="operation-loading"><RefreshCw className="spinning" size={22} /><span>Preparando a operação...</span></div></main>;
  if (!session) return <main className="workflow-page"><section className="workflow-empty"><UtensilsCrossed size={27} /><h1>Entre no portal operacional</h1><p>Use o acesso criado pela empresa para abrir sua área de trabalho.</p><a className="operation-primary" href="/operacao">Entrar</a></section></main>;
  if (!tenant || !branches.length) return <main className="workflow-page"><section className="workflow-empty"><UtensilsCrossed size={27} /><h1>Acesso não encontrado</h1><p>{error || "Este usuário não está vinculado a uma filial."}</p><a className="operation-secondary" href="/operacao">Voltar</a></section></main>;

  return (
    <main className="workflow-page">
      <header className="workflow-topbar"><a href="/operacao"><ArrowLeft size={17} /> Mesas</a><div className="workflow-identity"><span><Store size={16} /></span><div><b>{tenant.name}</b><small>{selectedBranch?.name}</small></div></div><button type="button" title="Sair" aria-label="Sair" onClick={() => void supabase?.auth.signOut()}><LogOut size={17} /></button></header>
      <section className="workflow-shell">
        <header className="workflow-heading"><div><span>Operação em tempo real</span><h1>{viewLabels[view]}</h1><p>{view === "cozinha" ? flow === "complete" ? "Prepare e libere os pedidos na sequência." : "Acompanhe os pedidos; a baixa será feita pelo atendimento." : view === "caixa" ? "Receba, confirme e libere cada mesa." : "Acompanhe as mesas e confirme as entregas."}</p></div><button className="operation-secondary" type="button" onClick={() => void loadOperationData()} disabled={refreshing}><RefreshCw className={refreshing ? "spinning" : ""} size={16} /> Atualizar</button></header>
        {views.length > 1 ? <nav className="workflow-view-switcher" aria-label="Área operacional">{views.map((item) => <button aria-current={view === item ? "page" : undefined} className={view === item ? "active" : ""} type="button" onClick={() => changeView(item)} key={item}>{item === "atendimento" ? <UtensilsCrossed size={16} /> : item === "cozinha" ? <ChefHat size={16} /> : <CreditCard size={16} />}{viewLabels[item]}</button>)}</nav> : null}
        <div className="workflow-context-bar"><label><span>Filial</span><select value={selectedBranchId} onChange={(event) => setSelectedBranchId(event.target.value)}>{branches.map((branch) => <option value={branch.id} key={branch.id}>{branch.name}</option>)}</select></label><span className="workflow-live"><i /> Atualização automática</span><small>{flow === "complete" ? `Fluxo completo · ${releaseMode === "per_item" ? "liberação por item" : "pedido inteiro"}` : "Fluxo simplificado"}</small></div>
        {notice ? <div className="workflow-notice" role="status"><BellRing size={17} /> {notice}</div> : null}
        {error ? <div className="workflow-error" role="alert">{error}</div> : null}
        {view === "atendimento" ? <WaiterView sessions={sessionsByPriority} orders={branchOrders} branch={selectedBranch} flow={flow} savingKey={savingKey} onDeliverItem={(orderId, itemId) => void runWorkflow("mark_delivered", { orderId, itemId })} onDeliverOrder={(orderId) => void runWorkflow("mark_delivered", { orderId })} onDeliverSession={(sessionId) => void deliverSession(sessionId)} onRequestClosing={(sessionId) => void runWorkflow("request_closing", { sessionId })} /> : null}
        {view === "cozinha" ? <KitchenView orders={branchOrders} flow={flow} releaseMode={releaseMode} filter={kitchenFilter} onFilter={setKitchenFilter} savingKey={savingKey} onStart={(orderId) => void runWorkflow("start_preparation", { orderId })} onReady={(orderId, itemId) => void runWorkflow("mark_ready", { orderId, itemId })} /> : null}
        {view === "caixa" ? <CashierView sessions={sessionsByPriority} orders={branchOrders} standaloneOrders={standaloneOrders} paymentBySession={paymentBySession} onPaymentChange={(sessionId, method) => setPaymentBySession((current) => ({ ...current, [sessionId]: method }))} savingKey={savingKey} onRequestClosing={(sessionId) => void runWorkflow("request_closing", { sessionId })} onReopen={(sessionId) => void runWorkflow("reopen_table", { sessionId })} onConfirmPayment={(sessionId, method) => void runWorkflow("confirm_payment", { sessionId, paymentMethod: method })} onRelease={(sessionId) => void runWorkflow("release_table", { sessionId })} onSettleStandalone={(order) => void settleStandalone(order)} /> : null}
        <footer className="workflow-audit"><CheckCircle2 size={15} /> Todas as ações ficam registradas no histórico da comanda.</footer>
      </section>
    </main>
  );
}

function WaiterView({ sessions, orders, branch, flow, savingKey, onDeliverItem, onDeliverOrder, onDeliverSession, onRequestClosing }: { sessions: TableSession[]; orders: InternalOrder[]; branch: Branch | undefined; flow: OperationFlow; savingKey: string; onDeliverItem: (orderId: string, itemId: string) => void; onDeliverOrder: (orderId: string) => void; onDeliverSession: (sessionId: string) => void; onRequestClosing: (sessionId: string) => void }) {
  return <section className="workflow-board"><header className="workflow-section-heading"><div><span>Salão</span><h2>Mesas em atendimento</h2></div><b>{sessions.length}</b></header><div className="waiter-session-grid">{sessions.map((tableSession) => {
    const sessionOrders = orders.filter((order) => order.table_session_id === tableSession.id);
    const items = sessionOrders.flatMap((order) => order.order_items.map((item) => ({ ...item, orderId: order.id })));
    const available = items.filter((item) => item.delivery_status === "pending" && (flow === "simplified" || item.production_status === "ready"));
    const delivered = items.filter((item) => item.delivery_status === "delivered").length;
    const total = sessionOrders.reduce((sum, order) => sum + Number(order.total), 0);
    const isClosing = tableSession.status === "awaiting_payment";
    return <article className={`waiter-session-card ${isClosing ? "closing" : available.length ? "has-ready" : ""}`} key={tableSession.id}><header><div><span>{tableSession.restaurant_tables?.code ?? "–"}</span><div><h3>{tableLabel(tableSession)}</h3><small>Aberta há {elapsedLabel(tableSession.opened_at)}</small></div></div><em>{isClosing ? tableSession.payment_status === "paid" ? "Pago" : "Fechamento" : available.length ? `${available.length} para entregar` : "Em atendimento"}</em></header><div className="waiter-account-summary"><span>{sessionOrders.length} comanda(s)</span><span>{delivered}/{items.length} itens entregues</span><b>{currency.format(total)}</b></div><div className="waiter-order-list">{sessionOrders.map((order) => <article key={order.id}><header><span>{order.order_code}</span><small>{time.format(new Date(order.created_at))}</small></header><ul>{order.order_items.map((item) => {
      const canDeliver = item.delivery_status === "pending" && (flow === "simplified" || item.production_status === "ready");
      return <li className={item.delivery_status === "delivered" ? "delivered" : canDeliver ? "ready" : ""} key={item.id}><div><span>{item.quantity}x {item.product_name}</span>{optionLabel(item) ? <small>{optionLabel(item)}</small> : null}</div>{item.delivery_status === "delivered" ? <em><Check size={14} /> Entregue</em> : canDeliver ? <button type="button" onClick={() => onDeliverItem(order.id, item.id)} disabled={Boolean(savingKey)}>Entregar</button> : <em>{flow === "complete" ? "Na cozinha" : "Pendente"}</em>}</li>;
    })}</ul>{order.notes ? <p>Observação: {order.notes}</p> : null}{order.order_items.some((item) => item.delivery_status === "pending" && (flow === "simplified" || item.production_status === "ready")) ? <button className="workflow-text-action" type="button" onClick={() => onDeliverOrder(order.id)} disabled={Boolean(savingKey)}>Confirmar itens disponíveis desta comanda</button> : null}</article>)}</div><footer>{!isClosing && branch ? <a className="operation-secondary" href={`/comanda?loja=${encodeURIComponent(branch.slug)}&filial=${encodeURIComponent(branch.id)}&mesa=${encodeURIComponent(tableSession.table_id)}`}>Adicionar pedido</a> : null}{!isClosing && available.length ? <button className="operation-primary" type="button" onClick={() => onDeliverSession(tableSession.id)} disabled={Boolean(savingKey)}>{savingKey === tableSession.id ? "Confirmando..." : `Entregar ${available.length} item(ns)`}</button> : null}{!isClosing && sessionOrders.length ? <button className="workflow-close-action" type="button" onClick={() => onRequestClosing(tableSession.id)} disabled={Boolean(savingKey)}>Solicitar fechamento</button> : isClosing ? <span className="workflow-waiting-label"><Clock3 size={15} /> Aguardando o caixa</span> : null}</footer></article>;
  })}{!sessions.length ? <div className="workflow-empty"><UtensilsCrossed size={25} /><h2>Nenhuma mesa ocupada</h2><p>As mesas aparecem aqui assim que o primeiro pedido é enviado.</p></div> : null}</div></section>;
}

function KitchenView({ orders, flow, releaseMode, filter, onFilter, savingKey, onStart, onReady }: { orders: InternalOrder[]; flow: OperationFlow; releaseMode: ProductionReleaseMode; filter: "active" | "ready" | "all"; onFilter: (filter: "active" | "ready" | "all") => void; savingKey: string; onStart: (orderId: string) => void; onReady: (orderId: string, itemId?: string) => void }) {
  const visible = [...orders].filter((order) => filter === "active" ? ["accepted", "preparing"].includes(order.status) : filter === "ready" ? order.status === "ready" : order.status !== "cancelled").sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  return <section className="workflow-board">{flow === "simplified" ? <div className="workflow-mode-note"><ChefHat size={18} /><div><b>Cozinha em modo de visualização</b><span>Prepare os pedidos na sequência. A equipe de atendimento fará as baixas.</span></div></div> : null}<header className="workflow-section-heading kitchen-heading"><div><span>Fila de produção</span><h2>Comandas</h2></div><nav>{([['active', 'Produção'], ['ready', 'Prontos'], ['all', 'Todos']] as const).map(([value, label]) => <button aria-current={filter === value ? "page" : undefined} className={filter === value ? "active" : ""} type="button" onClick={() => onFilter(value)} key={value}>{label}</button>)}</nav></header><div className="kitchen-order-grid">{visible.map((order) => {
    const readyCount = order.order_items.filter((item) => item.production_status === "ready").length;
    const allReady = readyCount === order.order_items.length;
    return <article className={`kitchen-ticket status-${order.status}`} key={order.id}><header><div><span>{tableLabel(order)}</span><small>{order.order_code} · {time.format(new Date(order.created_at))}</small></div><em>{allReady ? "Pronto" : readyCount ? `${readyCount}/${order.order_items.length} prontos` : order.status === "preparing" ? "Em preparo" : `há ${elapsedLabel(order.created_at)}`}</em></header><ol>{order.order_items.map((item) => <li className={item.production_status === "ready" ? "ready" : ""} key={item.id}><div><span><b>{item.quantity}x</b> {item.product_name}</span>{optionLabel(item) ? <small>{optionLabel(item)}</small> : null}</div>{item.production_status === "ready" ? <em><Check size={14} /> Pronto</em> : flow === "complete" && releaseMode === "per_item" ? <button type="button" onClick={() => onReady(order.id, item.id)} disabled={Boolean(savingKey)}>Pronto</button> : null}</li>)}</ol>{order.notes ? <p><b>Observação</b>{order.notes}</p> : null}{flow === "complete" && !allReady ? <footer>{order.status === "accepted" ? <button className="operation-secondary" type="button" onClick={() => onStart(order.id)} disabled={Boolean(savingKey)}>Iniciar preparo</button> : null}<button className="operation-primary" type="button" onClick={() => onReady(order.id)} disabled={Boolean(savingKey)}>{releaseMode === "per_item" ? "Marcar tudo pronto" : "Pedido pronto"}</button></footer> : null}</article>;
  })}{!visible.length ? <div className="workflow-empty"><ChefHat size={25} /><h2>Fila vazia</h2><p>Novas comandas aparecerão automaticamente nesta tela.</p></div> : null}</div></section>;
}

function CashierView({ sessions, orders, standaloneOrders, paymentBySession, onPaymentChange, savingKey, onRequestClosing, onReopen, onConfirmPayment, onRelease, onSettleStandalone }: { sessions: TableSession[]; orders: InternalOrder[]; standaloneOrders: InternalOrder[]; paymentBySession: Record<string, string>; onPaymentChange: (sessionId: string, method: string) => void; savingKey: string; onRequestClosing: (sessionId: string) => void; onReopen: (sessionId: string) => void; onConfirmPayment: (sessionId: string, method: string) => void; onRelease: (sessionId: string) => void; onSettleStandalone: (order: InternalOrder) => void }) {
  return <section className="workflow-board"><header className="workflow-section-heading"><div><span>Contas abertas</span><h2>Fechamento de mesas</h2></div><b>{sessions.filter((item) => item.status === "awaiting_payment").length} aguardando</b></header><div className="cashier-account-list">{sessions.map((tableSession) => {
    const accountOrders = orders.filter((order) => order.table_session_id === tableSession.id);
    const items = accountOrders.flatMap((order) => order.order_items);
    const total = accountOrders.reduce((sum, order) => sum + Number(order.total), 0);
    const undelivered = items.filter((item) => item.delivery_status === "pending").length;
    const method = paymentBySession[tableSession.id] ?? tableSession.payment_method ?? accountOrders[0]?.payment_method ?? "Pix";
    const waiting = tableSession.status === "awaiting_payment";
    const paid = tableSession.payment_status === "paid";
    return <article className={`cashier-account ${waiting ? "waiting" : ""} ${paid ? "paid" : ""}`} key={tableSession.id}><header><div><span>{tableSession.restaurant_tables?.code ?? "–"}</span><div><h3>{tableLabel(tableSession)}</h3><small>{accountOrders.length} comanda(s) · aberta há {elapsedLabel(tableSession.opened_at)}</small></div></div><em>{paid ? "Pagamento confirmado" : waiting ? "Aguardando pagamento" : "Em atendimento"}</em></header><div className="cashier-account-body"><div>{accountOrders.map((order) => <p key={order.id}><span>{order.order_code} · {order.order_items.length} item(ns)</span><b>{currency.format(Number(order.total))}</b></p>)}<small>{items.length - undelivered}/{items.length} itens entregues</small></div><strong>{currency.format(total)}</strong></div><footer>{!waiting ? accountOrders.length ? <button className="operation-primary" type="button" onClick={() => onRequestClosing(tableSession.id)} disabled={Boolean(savingKey)}>Iniciar fechamento</button> : <span className="cashier-release-status">Mesa aberta sem pedidos</span> : !paid ? <><label><span>Forma de pagamento</span><select value={method} onChange={(event) => onPaymentChange(tableSession.id, event.target.value)}>{paymentMethods.map((item) => <option value={item} key={item}>{item}</option>)}</select></label><button className="operation-primary" type="button" onClick={() => onConfirmPayment(tableSession.id, method)} disabled={Boolean(savingKey)}>Confirmar pagamento</button><button className="workflow-icon-action" type="button" title="Reabrir atendimento" aria-label="Reabrir atendimento" onClick={() => onReopen(tableSession.id)} disabled={Boolean(savingKey)}><RotateCcw size={17} /></button></> : <><div className="cashier-release-status">{undelivered ? `${undelivered} item(ns) aguardando entrega` : "Conta pronta para liberação"}</div><button className="operation-primary" type="button" onClick={() => onRelease(tableSession.id)} disabled={Boolean(savingKey) || undelivered > 0}>Liberar mesa</button></>}</footer></article>;
  })}{!sessions.length ? <div className="workflow-empty"><CreditCard size={25} /><h2>Nenhuma conta aberta</h2><p>Contas solicitadas pelo atendimento serão priorizadas aqui.</p></div> : null}</div>{standaloneOrders.length ? <section className="standalone-accounts"><header><span>Sem mesa</span><h3>Comandas avulsas</h3></header>{standaloneOrders.map((order) => <article key={order.id}><div><b>{order.order_code}</b><span>{order.customer_name || "Atendimento avulso"}</span></div><strong>{currency.format(Number(order.total))}</strong><button className="operation-primary" type="button" disabled={Boolean(savingKey) || order.payment_status === "paid"} onClick={() => onSettleStandalone(order)}>{order.payment_status === "paid" ? "Recebido" : "Receber e concluir"}</button></article>)}</section> : null}</section>;
}
