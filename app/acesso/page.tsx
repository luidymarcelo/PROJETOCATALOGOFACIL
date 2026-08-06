"use client";

import { Building2, ShieldCheck } from "lucide-react";

export default function AccessPage() {
  return (
    <main className="access-page">
      <section className="access-shell">
        <span className="access-kicker">Catálogo Fácil</span>
        <h1>Como você deseja entrar?</h1>
        <p>Escolha o acesso correspondente ao seu perfil.</p>
        <div className="access-options">
          <a className="access-option admin-option" href="/admin">
            <ShieldCheck size={28} />
            <strong>Entrar como administrador</strong>
            <span>Gerenciar empresas, filiais e acessos.</span>
          </a>
          <a className="access-option company-option" href="/empresa">
            <Building2 size={28} />
            <strong>Entrar como empresa</strong>
            <span>Gerenciar produtos e catálogo da sua filial.</span>
          </a>
        </div>
        <a className="admin-link" href="/">Voltar ao catálogo público</a>
      </section>
    </main>
  );
}
