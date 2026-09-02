"use client";

import { Building2, ClipboardList, ShieldCheck, Store } from "lucide-react";
import Link from "next/link";

export default function AccessPage() {
  return (
    <main className="access-page">
      <section className="access-shell">
        <span className="access-kicker">Catálogo Fácil</span>
        <h1>Como você deseja entrar?</h1>
        <p>Escolha o acesso correspondente ao seu perfil.</p>
        <div className="access-options">
          <Link className="access-option admin-option" href="/admin">
            <ShieldCheck size={28} />
            <strong>Entrar como administrador</strong>
            <span>Gerenciar empresas, filiais e acessos.</span>
          </Link>
          <Link className="access-option company-option" href="/empresa">
            <Building2 size={28} />
            <strong>Proprietário</strong>
            <span>Empresa, equipe, mesas e filiais.</span>
          </Link>
          <Link className="access-option branch-option" href="/filial">
            <Store size={28} />
            <strong>Gerente de filial</strong>
            <span>Catálogo e dados das filiais permitidas.</span>
          </Link>
          <Link className="access-option operation-option" href="/operacao">
            <ClipboardList size={28} />
            <strong>Operação</strong>
            <span>Mesas, comandas, cozinha e caixa.</span>
          </Link>
        </div>
        <Link className="admin-link" href="/">Voltar ao catálogo público</Link>
      </section>
    </main>
  );
}
