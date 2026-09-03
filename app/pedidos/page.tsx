"use client";

import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Clock3,
  DollarSign,
  LogOut,
  ReceiptText,
  RefreshCw,
  Search,
  Store,
  UserRound,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type Branch = { id: string; name: string; slug: string; tenant_id: string };
type Tenant = { id: string; name: string };
type OrderStatus = "draft" | "sent_whatsapp" | "accepted" | "preparing" | "ready" | "completed" | "cancelled";
type PaymentStatus = "pending" | "paid" | "refunded";
type BillingStatus = "pending" | "billed" | "cancelled";
type OrderItem = {
  id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  total: number;
  selected_options?: Array<{ group_name?: string; item_name?: string; price_delta?: number }>;
};
type InternalOrder = {
  id: string;
  store_id: string;
  order_code: string;
  status: OrderStatus;
  order_channel: string;
  fulfillment_mode: "delivery" | "pickup";
  customer_name: string | null;
  delivery_address: string | null;
  customer_reference: string | null;
  service_location: string | null;
  table_id: string | null;
  table_session_id: string | null;
  order_source: "table_device" | "staff" | "customer";
  created_by_name: string | null;
  created_by_role: string | null;
  restaurant_tables?: { code?: string; name?: string | null } | null;
  payment_method: string | null;
  payment_status: PaymentStatus;
  billing_status: BillingStatus;
  notes: string | null;
  subtotal: number;
  delivery_fee: number;
  total: number;
  created_at: string;
  order_items?: OrderItem[];
};
type TableSession = {
  id: string;
  status: "open" | "awaiting_payment" | "closed" | "cancelled";
  opened_at: string;
  restaurant_tables?: { code?: string; name?: string | null } | null;
};

const STATUS_OPTIONS: Array<{ value: OrderStatus; label: string }> = [
  { value: "accepted", label: "Recebido" },
  { value: "preparing", label: "Em preparo" },
  { value: "ready", label: "Pronto" },
  { value: "completed", label: "Finalizado" },
  { value: "cancelled", label: "Cancelado" },
];

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function statusLabel(status: OrderStatus) {
  return STATUS_OPTIONS.find((item) => item.value === status)?.label ?? status;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function optionLabel(item: OrderItem) {
  return (item.selected_options ?? [])
    .map((option) => option.item_name ? `${option.group_name ? `${option.group_name}: ` : ""}${option.item_name}` : "")
    .filter(Boolean)
    .join(", ");
}

function actorRoleLabel(role: string | null) {
  return ({ owner: "Proprietário", branch_manager: "Gerente", waiter: "Garçom", cashier: "Caixa", kitchen: "Cozinha", supervisor: "Supervisor", table_device: "Mesa" } as Record<string, string>)[role ?? ""] ?? role;
}

function workspaceAccessRoles(access: { role?: string; roles?: unknown } | null | undefined) {
  const roles = Array.isArray(access?.roles) ? access.roles.map(String).filter(Boolean) : [];
  return roles.length ? roles : access?.role ? [access.role] : [];
}

export default function InternalOrdersPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [accessRoles, setAccessRoles] = useState<string[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [orders, setOrders] = useState<InternalOrder[]>([]);
  const [tableSessions, setTableSessions] = useState<TableSession[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | OrderStatus>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [savingOrderId, setSavingOrderId] = useState("");
  const [error, setError] = useState("");

  async function loadWorkspace() {
    if (!supabase || !session) return;
    const { data: workspace } = await supabase.functions.invoke("create-store-user", {
      body: { action: "get-company-workspace" },
    });
    if (workspace?.tenant && workspace?.branches?.length) {
      setTenant(workspace.tenant as Tenant);
      const nextBranches = workspace.branches as Branch[];
      setBranches(nextBranches);
      setAccessRoles(workspaceAccessRoles(workspace.access ?? { role: "owner" }));
      setSelectedBranchId((current) => current && nextBranches.some((branch) => branch.id === current) ? current : nextBranches[0].id);
      setLoading(false);
      return;
    }

    const { data: databaseWorkspace } = await supabase.rpc("get_company_workspace");
    if (databaseWorkspace?.tenant && databaseWorkspace?.branches?.length) {
      setTenant(databaseWorkspace.tenant as Tenant);
      const nextBranches = databaseWorkspace.branches as Branch[];
      setBranches(nextBranches);
      setAccessRoles(workspaceAccessRoles(databaseWorkspace.access ?? { role: "owner" }));
      setSelectedBranchId((current) => current && nextBranches.some((branch) => branch.id === current) ? current : nextBranches[0].id);
      setLoading(false);
      return;
    }

    const operationalCnpj = window.localStorage.getItem("catalogo-facil-operation-cnpj")
      ?? window.localStorage.getItem("catalogo-facil-branch-cnpj")
      ?? "";
    if (operationalCnpj) {
      const { data: operationalWorkspace, error: operationalError } = await supabase.rpc("get_operational_workspace", { p_cnpj: operationalCnpj });
      if (operationalWorkspace?.tenant && operationalWorkspace?.branches?.length) {
        setTenant(operationalWorkspace.tenant as Tenant);
        const nextBranches = operationalWorkspace.branches as Branch[];
        setBranches(nextBranches);
        setAccessRoles(workspaceAccessRoles(operationalWorkspace.access));
        setSelectedBranchId(nextBranches[0].id);
        setLoading(false);
        return;
      }
      if (operationalError) setError(operationalError.message);
    }
    setError(databaseWorkspace?.error ?? workspace?.error ?? "Este login não está vinculado a uma empresa ou filial.");
    setLoading(false);
  }

  async function loadOrders(branchId = selectedBranchId) {
    if (!supabase || !branchId) return;
    setLoadingOrders(true);
    const [orderResult, sessionResult] = await Promise.all([
      supabase
        .from("orders")
        .select("id, store_id, order_code, status, order_channel, fulfillment_mode, customer_name, delivery_address, customer_reference, service_location, table_id, table_session_id, order_source, created_by_name, created_by_role, payment_method, payment_status, billing_status, notes, subtotal, delivery_fee, total, created_at, restaurant_tables(code, name), order_items(id, product_name, unit_price, quantity, total, selected_options)")
        .eq("store_id", branchId)
        .eq("order_channel", "internal")
        .order("created_at", { ascending: false }),
      supabase
        .from("table_sessions")
        .select("id, status, opened_at, restaurant_tables(code, name)")
        .eq("store_id", branchId)
        .in("status", ["open", "awaiting_payment"])
        .order("opened_at", { ascending: true }),
    ]);
    setLoadingOrders(false);
    if (orderResult.error) {
      setError(orderResult.error.message);
      return;
    }
    setOrders((orderResult.data ?? []) as InternalOrder[]);
    setTableSessions(sessionResult.error ? [] : (sessionResult.data ?? []) as TableSession[]);
  }

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      setError("Supabase não está configurado neste ambiente.");
      return;
    }
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (!data.session) setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      if (!nextSession) setLoading(false);
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (session) void loadWorkspace();
  }, [session]);

  useEffect(() => {
    if (selectedBranchId) void loadOrders(selectedBranchId);
  }, [selectedBranchId]);

  async function updateOrder(orderId: string, changes: Partial<Pick<InternalOrder, "status" | "payment_status" | "billing_status">>) {
    if (!supabase) return;
    setSavingOrderId(orderId);
    setError("");
    const { error: updateError } = await supabase.rpc("update_internal_order", {
      p_order_id: orderId,
      p_status: changes.status ?? null,
      p_payment_status: changes.payment_status ?? null,
      p_billing_status: changes.billing_status ?? null,
    });
    setSavingOrderId("");
    if (updateError) {
      setError(/cannot update payment or billing/i.test(updateError.message)
        ? "Sua função não possui permissão para alterar pagamento ou faturamento."
        : /cannot update order status/i.test(updateError.message)
          ? "Sua função não possui permissão para alterar o andamento."
          : updateError.message);
      return;
    }
    setOrders((current) => current.map((order) => order.id === orderId ? { ...order, ...changes } : order));
  }

  async function updateTableSession(sessionId: string, status: TableSession["status"]) {
    if (!supabase) return;
    setSavingOrderId(sessionId);
    setError("");
    const { error: sessionError } = await supabase.rpc("update_table_session_status", { p_session_id: sessionId, p_status: status });
    setSavingOrderId("");
    if (sessionError) {
      setError(/cannot close table sessions/i.test(sessionError.message) ? "Sua função não possui permissão para fechar mesas." : sessionError.message);
      return;
    }
    setTableSessions((current) => status === "closed" || status === "cancelled" ? current.filter((item) => item.id !== sessionId) : current.map((item) => item.id === sessionId ? { ...item, status } : item));
  }

  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId);
  const canUpdateStatus = accessRoles.some((role) => ["owner", "branch_manager", "waiter", "kitchen", "supervisor"].includes(role));
  const canUpdateFinancial = accessRoles.some((role) => ["owner", "branch_manager", "cashier", "supervisor"].includes(role));
  const canCloseTables = accessRoles.some((role) => ["owner", "branch_manager", "cashier", "supervisor"].includes(role));
  const visibleOrders = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    return orders.filter((order) => {
      if (statusFilter !== "all" && order.status !== statusFilter) return false;
      if (!normalized) return true;
      return [order.order_code, order.customer_name, order.service_location, order.created_by_name, order.restaurant_tables?.code, order.delivery_address]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(normalized);
    });
  }, [orders, query, statusFilter]);

  const metrics = {
    open: orders.filter((order) => ["accepted", "preparing", "ready"].includes(order.status)).length,
    preparing: orders.filter((order) => order.status === "preparing").length,
    ready: orders.filter((order) => order.status === "ready").length,
    paid: orders.filter((order) => order.payment_status === "paid").length,
  };
  const sessionTotals = new Map(tableSessions.map((tableSession) => [
    tableSession.id,
    orders.filter((order) => order.table_session_id === tableSession.id).reduce((sum, order) => sum + Number(order.total), 0),
  ]));

  if (loading) return <main className="orders-page"><p>Carregando painel de pedidos...</p></main>;
  if (!session) return <main className="orders-page"><section className="orders-empty"><ClipboardList size={30} /><h1>Entre no portal da empresa</h1><p>Faça login para acompanhar as comandas da sua empresa.</p><a className="admin-primary" href="/acesso">Ir para acesso</a></section></main>;
  if (!tenant || !branches.length) return <main className="orders-page"><section className="orders-empty"><ClipboardList size={30} /><h1>Painel sem empresa vinculada</h1><p>{error || "Solicite ao administrador o acesso de uma empresa."}</p><a className="admin-secondary" href="/empresa">Voltar ao portal</a></section></main>;

  return (
    <main className="orders-page">
      <header className="orders-topbar">
        <a href={accessRoles.includes("owner") ? "/empresa" : accessRoles.includes("branch_manager") ? "/filial" : "/operacao"} className="admin-back"><ArrowLeft size={17} /> Voltar ao portal</a>
        <div className="admin-user"><span>{session.user.email}</span><button onClick={() => supabase?.auth.signOut()}><LogOut size={16} /> Sair</button></div>
      </header>
      <section className="orders-page-inner">
        <header className="orders-heading">
          <div><span>Painel operacional</span><h1>Pedidos e comandas</h1><p>Acompanhe os pedidos enviados pelo catálogo e atualize cada etapa.</p></div>
          <div className="orders-heading-actions"><a className="admin-secondary" href={selectedBranch ? `/?loja=${encodeURIComponent(selectedBranch.slug)}` : "/"}><Store size={16} /> Ver catálogo</a><button className="admin-secondary" type="button" onClick={() => void loadOrders()} disabled={loadingOrders}><RefreshCw className={loadingOrders ? "spinning" : ""} size={16} /> Atualizar</button></div>
        </header>

        <section className="orders-toolbar">
          <label><Store size={16} /><span>Filial</span><select value={selectedBranchId} onChange={(event) => setSelectedBranchId(event.target.value)}>{branches.map((branch) => <option value={branch.id} key={branch.id}>{branch.name}</option>)}</select></label>
          <label className="orders-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar comanda ou cliente" /></label>
          <label><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | OrderStatus)}><option value="all">Todos os pedidos</option>{STATUS_OPTIONS.map((status) => <option value={status.value} key={status.value}>{status.label}</option>)}</select></label>
        </section>

        <div className="orders-metrics"><div><ClipboardList size={18} /><span>Em aberto</span><strong>{metrics.open}</strong></div><div><Clock3 size={18} /><span>Em preparo</span><strong>{metrics.preparing}</strong></div><div><CheckCircle2 size={18} /><span>Prontos</span><strong>{metrics.ready}</strong></div><div><DollarSign size={18} /><span>Pagos</span><strong>{metrics.paid}</strong></div></div>
        {error ? <p className="orders-error" role="alert">{error}</p> : null}

        {tableSessions.length ? <section className="open-table-sessions"><header><div><span>Contas em andamento</span><h2>Mesas abertas</h2></div><strong>{tableSessions.length}</strong></header><div>{tableSessions.map((tableSession) => <article key={tableSession.id}><span className="open-table-code">{tableSession.restaurant_tables?.code ?? "—"}</span><div><strong>{tableSession.restaurant_tables?.name?.trim() || `Mesa ${tableSession.restaurant_tables?.code ?? ""}`}</strong><small>Aberta em {dateLabel(tableSession.opened_at)}</small></div><b>{currency.format(sessionTotals.get(tableSession.id) ?? 0)}</b><select value={tableSession.status} disabled={savingOrderId === tableSession.id || !canCloseTables} title={canCloseTables ? "Alterar situação da mesa" : "Disponível para caixa, gerente ou supervisor"} onChange={(event) => void updateTableSession(tableSession.id, event.target.value as TableSession["status"])}><option value="open">Em atendimento</option><option value="awaiting_payment">Aguardando pagamento</option><option value="closed">Fechar mesa</option><option value="cancelled">Cancelar atendimento</option></select></article>)}</div></section> : null}

        <section className="orders-list" aria-live="polite">
          {loadingOrders ? <div className="orders-empty"><RefreshCw className="spinning" size={25} /><p>Atualizando pedidos...</p></div> : visibleOrders.length ? visibleOrders.map((order) => (
            <article className="order-card" key={order.id}>
              <header className="order-card-header"><div><span className="order-code">{order.order_code}</span><small>{dateLabel(order.created_at)}</small></div><span className={`order-status status-${order.status}`}>{statusLabel(order.status)}</span></header>
              <div className="order-card-main">
                <div className="order-customer"><UserRound size={17} /><div><strong>{order.restaurant_tables?.name?.trim() || (order.restaurant_tables?.code ? `Mesa ${order.restaurant_tables.code}` : order.customer_name || "Atendimento interno")}</strong><span>{order.created_by_name ? `Criada por ${order.created_by_name}${order.created_by_role ? ` · ${actorRoleLabel(order.created_by_role)}` : ""}` : order.order_source === "table_device" ? "Enviada pelo dispositivo da mesa" : "Responsável não identificado"}{order.customer_name ? ` · Cliente: ${order.customer_name}` : ""}</span></div></div>
                <ul className="order-items">{(order.order_items ?? []).map((item) => <li key={item.id}><span><strong>{item.quantity}x</strong> {item.product_name}{optionLabel(item) ? <small>{optionLabel(item)}</small> : null}</span><b>{currency.format(Number(item.total))}</b></li>)}</ul>
                <div className="order-summary"><span>Subtotal <b>{currency.format(Number(order.subtotal))}</b></span><span>Entrega <b>{Number(order.delivery_fee) ? currency.format(Number(order.delivery_fee)) : "Grátis"}</b></span><strong>Total <b>{currency.format(Number(order.total))}</b></strong></div>
                <div className="order-details"><span><ReceiptText size={15} /> {order.billing_status === "billed" ? "Faturado" : "A faturar"}</span><span><DollarSign size={15} /> {order.payment_method || "Pagamento não informado"} · {order.payment_status === "paid" ? "Pago" : "Pendente"}</span>{order.delivery_address ? <span><Store size={15} /> {order.delivery_address}{order.customer_reference ? ` · ${order.customer_reference}` : ""}</span> : null}{order.notes ? <span>Observação: {order.notes}</span> : null}</div>
              </div>
              <footer className="order-card-actions"><label><span>Andamento</span><select value={order.status} disabled={savingOrderId === order.id || !canUpdateStatus} title={canUpdateStatus ? "Alterar andamento" : "Sua função possui acesso somente financeiro"} onChange={(event) => void updateOrder(order.id, { status: event.target.value as OrderStatus })}>{STATUS_OPTIONS.map((status) => <option value={status.value} key={status.value}>{status.label}</option>)}</select></label><label><span>Pagamento</span><select value={order.payment_status} disabled={savingOrderId === order.id || !canUpdateFinancial} title={canUpdateFinancial ? "Alterar pagamento" : "Disponível para caixa, gerente ou supervisor"} onChange={(event) => void updateOrder(order.id, { payment_status: event.target.value as PaymentStatus })}><option value="pending">Pendente</option><option value="paid">Pago</option><option value="refunded">Estornado</option></select></label><label><span>Faturamento</span><select value={order.billing_status} disabled={savingOrderId === order.id || !canUpdateFinancial} title={canUpdateFinancial ? "Alterar faturamento" : "Disponível para caixa, gerente ou supervisor"} onChange={(event) => void updateOrder(order.id, { billing_status: event.target.value as BillingStatus })}><option value="pending">A faturar</option><option value="billed">Faturado</option><option value="cancelled">Cancelado</option></select></label></footer>
            </article>
          )) : <div className="orders-empty"><ClipboardList size={28} /><h2>Nenhuma comanda encontrada</h2><p>Quando o modo Comanda interna ou Ambos estiver ativo, os pedidos enviados ao painel aparecerão aqui.</p></div>}
        </section>
      </section>
    </main>
  );
}
