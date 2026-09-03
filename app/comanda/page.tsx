"use client";

import { ArrowLeft, ArrowRight, ClipboardList, LogOut, RefreshCw, UserRound } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabase";
import { CatalogApplication, type InternalOrderContext } from "../page";

type OperationalContext = {
  tenant: { id: string; name: string };
  branches: Array<{ id: string; name: string; slug: string }>;
  access: { role: string; roles?: string[]; name: string };
  operation?: { entry_mode?: "table" | "staff" | "both"; customer_name_mode?: "hidden" | "optional" | "required" };
  error?: string;
};
type RestaurantTable = { id: string; code: string; name: string | null; is_active: boolean; session_status?: "open" | "awaiting_payment" | null };

function commandError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String((error as { message?: string } | null)?.message ?? "");
  if (/get_operational_workspace_by_store|schema cache/i.test(message)) return "A estrutura operacional ainda não foi aplicada no Supabase.";
  return message || fallback;
}

export default function InternalCommandCatalogPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [workspace, setWorkspace] = useState<OperationalContext | null>(null);
  const [storeId, setStoreId] = useState("");
  const [storeSlug, setStoreSlug] = useState("");
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function resolveStore() {
    if (!supabase) return null;
    const params = new URLSearchParams(window.location.search);
    const requestedStoreId = params.get("filial")?.trim() ?? "";
    const requestedSlug = params.get("loja")?.trim() ?? "";
    const query = supabase.from("stores").select("id, slug, name").eq("is_active", true);
    const { data, error: storeError } = requestedStoreId
      ? await query.eq("id", requestedStoreId).maybeSingle()
      : requestedSlug
        ? await query.eq("slug", requestedSlug).limit(1).maybeSingle()
        : { data: null, error: null };
    if (storeError || !data) {
      setError(storeError?.message ?? "Filial não identificada neste link.");
      setLoading(false);
      return null;
    }
    setStoreId(data.id);
    setStoreSlug(data.slug);
    return data as { id: string; slug: string; name: string };
  }

  async function authorize(currentSession: Session, resolvedStoreId = storeId) {
    if (!supabase || !resolvedStoreId) return;
    setLoading(true);
    setError("");
    const { data, error: workspaceError } = await supabase.rpc("get_operational_workspace_by_store", { p_store_id: resolvedStoreId });
    if (workspaceError || data?.error || !data?.tenant) {
      setWorkspace(null);
      setError(data?.error ?? commandError(workspaceError, "Este usuário não possui acesso para criar comandas nesta filial."));
      setLoading(false);
      return;
    }
    const roles: string[] = Array.isArray(data.access?.roles) && data.access.roles.length
      ? data.access.roles.map((role: unknown) => String(role))
      : [String(data.access?.role ?? "")];
    if (!roles.some((role) => ["owner", "branch_manager", "waiter", "supervisor"].includes(role))) {
      setWorkspace(null);
      setError("Sua função não possui permissão para criar comandas.");
      setLoading(false);
      return;
    }
    const entryMode = data.operation?.entry_mode ?? "staff";
    if (entryMode !== "staff" && entryMode !== "both") {
      setWorkspace(null);
      setError("Esta filial aceita comandas internas somente pelos dispositivos das mesas.");
      setLoading(false);
      return;
    }
    setWorkspace(data as OperationalContext);
    const requestedTableId = new URLSearchParams(window.location.search).get("mesa")?.trim() ?? "";
    const { data: tableRows, error: tableError } = await supabase.from("restaurant_tables").select("id, code, name, is_active").eq("store_id", resolvedStoreId).eq("is_active", true).order("sort_order").order("code");
    if (tableError) {
      setError(commandError(tableError, "Não foi possível carregar as mesas."));
      setLoading(false);
      return;
    }
    const { data: activeSessions } = await supabase.from("table_sessions").select("table_id, status").eq("store_id", resolvedStoreId).in("status", ["open", "awaiting_payment"]);
    const sessionByTable = new Map((activeSessions ?? []).map((item) => [item.table_id, item.status]));
    const nextTables = ((tableRows ?? []) as RestaurantTable[]).map((table) => ({ ...table, session_status: sessionByTable.get(table.id) as RestaurantTable["session_status"] ?? null }));
    setTables(nextTables);
    setSelectedTable(nextTables.find((table) => table.id === requestedTableId && table.session_status !== "awaiting_payment") ?? null);
    setSession(currentSession);
    setLoading(false);
  }

  useEffect(() => {
    if (!supabase) {
      setError("Supabase não está configurado neste ambiente.");
      setLoading(false);
      return;
    }
    let mounted = true;
    void (async () => {
      const store = await resolveStore();
      if (!store || !mounted) return;
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      if (data.session) await authorize(data.session, store.id);
      else setLoading(false);
    })();
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      if (!nextSession) setWorkspace(null);
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || submitting || !storeId) return;
    setSubmitting(true);
    setError("");
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (authError || !data.session) {
      setError(authError?.message ?? "Não foi possível entrar.");
      setSubmitting(false);
      return;
    }
    await authorize(data.session, storeId);
    setSubmitting(false);
  }

  function chooseTable(table: RestaurantTable) {
    const params = new URLSearchParams(window.location.search);
    params.set("mesa", table.id);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    setSelectedTable(table);
  }

  if (loading) return <main className="command-access-state"><RefreshCw className="spinning" size={24} /><span>Preparando a comanda...</span></main>;

  if (!session || !workspace) {
    return (
      <main className="command-access-page">
        <section className="command-login-card">
          <span className="command-login-icon"><ClipboardList size={25} /></span>
          <div><span>Comanda da equipe</span><h1>Identifique-se</h1><p>O responsável ficará registrado na comanda.</p></div>
          <form onSubmit={signIn}><label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Senha<input type="password" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{error ? <p role="alert">{error}</p> : null}<button className="operation-primary" type="submit" disabled={submitting || !storeId}>{submitting ? "Entrando..." : "Entrar"} <ArrowRight size={17} /></button></form>
          {session ? <button className="operation-link-button" type="button" onClick={() => void supabase?.auth.signOut()}>Entrar com outro usuário</button> : null}
          <a href="/operacao"><ArrowLeft size={15} /> Portal operacional</a>
        </section>
      </main>
    );
  }

  if (tables.length && !selectedTable) {
    return (
      <main className="command-table-page">
        <header><a href="/operacao"><ArrowLeft size={16} /> Operação</a><div><span><UserRound size={16} /></span><strong>{workspace.access.name}</strong><button type="button" title="Sair" aria-label="Sair" onClick={() => void supabase?.auth.signOut()}><LogOut size={16} /></button></div></header>
        <section><div className="command-table-heading"><span>{workspace.tenant.name}</span><h1>Escolha a mesa</h1><p>A comanda será vinculada à conta aberta da mesa.</p></div><div className="command-table-grid">{tables.map((table) => <button className={table.session_status === "awaiting_payment" ? "closing" : ""} type="button" key={table.id} onClick={() => chooseTable(table)} disabled={table.session_status === "awaiting_payment"}><span>{table.code}</span><strong>{table.name?.trim() || `Mesa ${table.code}`}</strong>{table.session_status === "awaiting_payment" ? <small>Em fechamento</small> : <ArrowRight size={17} />}</button>)}</div></section>
      </main>
    );
  }

  const internalOrderContext: InternalOrderContext = {
    source: "staff",
    storeId,
    storeSlug,
    tableId: selectedTable?.id ?? null,
    tableLabel: selectedTable ? selectedTable.name?.trim() || `Mesa ${selectedTable.code}` : null,
    actorName: workspace.access.name,
    actorRole: workspace.access.roles?.find((role) => ["waiter", "branch_manager", "supervisor", "owner"].includes(role)) ?? workspace.access.role,
    customerNameMode: workspace.operation?.customer_name_mode ?? "optional",
  };

  return <CatalogApplication orderChannel="internal" internalOrderContext={internalOrderContext} />;
}
