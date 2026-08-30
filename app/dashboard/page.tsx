"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/auth/useUser";
import Navigation from "@/components/Navigation";
import { listMyHistory, type RecitationSession } from "@/lib/sessions/api";

export default function DashboardPage() {
  const { profile, loading } = useUser();
  const router = useRouter();
  const [lastSession, setLastSession] = useState<RecitationSession | null>(null);

  useEffect(() => {
    listMyHistory().then(({ data }) => {
      if (data && data.length > 0) setLastSession(data[0] as unknown as RecitationSession);
    });
  }, []);

  if (loading) return <div className="card text-center text-[#8a8a7d]">A carregar…</div>;
  if (!profile) return null;

  return (
    <div className="card">
      <Navigation profile={profile} />
      <div className="eyebrow">
        <span className="dot" /> Olá, {profile.name.split(" ")[0]}
      </div>
      <h1 className="text-[1.7rem] mb-2">
        {profile.role === "qari" ? "Pronto para ouvir alguém?" : "Pronto para recitar?"}
      </h1>
      <p className="text-[#54544a] text-[0.9rem] mb-6">
        {profile.role === "qari"
          ? "Fique disponível para receber pedidos de sessão de recitação."
          : "Uma ação principal: encontre um Qari disponível agora."}
      </p>

      <button
        className="btn btn-gold !mt-0 text-[1.05rem] py-4"
        onClick={() => router.push(profile.role === "qari" ? "/profile" : "/qaris")}
      >
        {profile.role === "qari" ? "IR PARA DISPONIBILIDADE" : "RECITAR AGORA"}
      </button>

      {lastSession && (
        <div className="mt-8 pt-6 border-t border-gold-500/20">
          <div className="text-[0.78rem] uppercase tracking-wide text-[#8a8a7d] mb-2">Última sessão</div>
          <div className="text-[0.9rem] text-emerald-950">
            Estado: {lastSession.status} {lastSession.duration_seconds ? `· ${Math.round(lastSession.duration_seconds / 60)} min` : ""}
          </div>
        </div>
      )}
    </div>
  );
}
