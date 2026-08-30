"use client";

import { useUser } from "@/lib/auth/useUser";
import Navigation from "@/components/Navigation";

export default function AdminPage() {
  const { profile, loading } = useUser();

  if (loading) return <div className="card text-center text-[#8a8a7d]">A carregar…</div>;
  if (!profile) return null;

  if (profile.role !== "admin") {
    return (
      <div className="card text-center">
        <h2>Acesso restrito</h2>
        <p className="text-[#54544a] text-[0.9rem]">Esta área é apenas para administradores.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <Navigation profile={profile} />
      <h2 className="mb-2">Painel de administração</h2>
      <p className="text-[#54544a] text-[0.9rem]">
        Fase 8 do roadmap — gestão de utilizadores, Qaris, sessões, pagamentos e moderação.
        Esta página é um ponto de partida: as tabelas <code>profiles</code>, <code>recitation_sessions</code>,{" "}
        <code>reports</code> e <code>transactions</code> já existem no schema para suportar as próximas listagens.
      </p>
    </div>
  );
}
