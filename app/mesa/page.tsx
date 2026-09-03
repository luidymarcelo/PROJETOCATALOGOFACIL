"use client";

import { ClipboardList, RefreshCw, Store } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { CatalogApplication, type InternalOrderContext } from "../page";

type TableCatalogContext = {
  table_id: string;
  table_code: string;
  table_name: string;
  store_id: string;
  store_slug: string;
  store_name: string;
  company_name: string;
  customer_name_mode: "hidden" | "optional" | "required";
  require_open_session: boolean;
  session_open: boolean;
  session_closing?: boolean;
  error?: string;
};

export default function TableCatalogPage() {
  const [context, setContext] = useState<TableCatalogContext | null>(null);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    async function loadTable() {
      if (!supabase) {
        setError("Supabase não está configurado neste ambiente.");
        setLoading(false);
        return;
      }
      const accessToken = new URLSearchParams(window.location.search).get("token")?.trim() ?? "";
      setToken(accessToken);
      if (!/^[0-9a-f-]{36}$/i.test(accessToken)) {
        setError("O link desta mesa é inválido.");
        setLoading(false);
        return;
      }
      const { data, error: requestError } = await supabase.rpc("get_table_catalog_context", { p_access_token: accessToken });
      if (requestError || data?.error || !data?.store_id) {
        setContext(null);
        setError(data?.error ?? (/schema cache/i.test(requestError?.message ?? "") ? "A estrutura de mesas ainda não foi aplicada no Supabase." : requestError?.message) ?? "Não foi possível abrir esta mesa.");
        setLoading(false);
        return;
      }
      setContext(data as TableCatalogContext);
      setLoading(false);
    }
    void loadTable();
  }, [reloadKey]);

  if (loading) return <main className="table-access-state"><RefreshCw className="spinning" size={25} /><span>Preparando a mesa...</span></main>;
  if (!context) return <main className="table-access-state error"><Store size={28} /><h1>Mesa indisponível</h1><p>{error}</p></main>;
  if (context.session_closing) {
    return <main className="table-access-state waiting"><ClipboardList size={28} /><h1>Conta em fechamento</h1><p>{context.table_name} está aguardando pagamento. Novos pedidos serão liberados se o caixa reabrir o atendimento.</p><button type="button" onClick={() => { setLoading(true); setReloadKey((current) => current + 1); }}><RefreshCw size={16} /> Verificar novamente</button></main>;
  }
  if (context.require_open_session && !context.session_open) {
    return <main className="table-access-state waiting"><ClipboardList size={28} /><h1>Aguardando abertura</h1><p>Um funcionário precisa abrir {context.table_name} antes do primeiro pedido.</p><button type="button" onClick={() => { setLoading(true); setReloadKey((current) => current + 1); }}><RefreshCw size={16} /> Verificar novamente</button></main>;
  }

  const internalOrderContext: InternalOrderContext = {
    source: "table_device",
    storeId: context.store_id,
    storeSlug: context.store_slug,
    tableId: context.table_id,
    tableToken: token,
    tableLabel: context.table_name,
    actorName: "Dispositivo da mesa",
    actorRole: "table_device",
    customerNameMode: context.customer_name_mode,
  };

  return (
    <div className="table-catalog-shell">
      <div className="table-device-badge"><ClipboardList size={15} /><span>{context.table_name}</span></div>
      <CatalogApplication orderChannel="internal" internalOrderContext={internalOrderContext} />
    </div>
  );
}
