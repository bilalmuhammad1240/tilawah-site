"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUser } from "@/lib/auth/useUser";
import { createClient } from "@/lib/supabase/client";
import Navigation from "@/components/Navigation";
import { listMyHistory, type RecitationSession } from "@/lib/sessions/api";

type PendingRequest = {
  id: string;
  student: { name: string } | null;
  surah_number: number | null;
  created_at: string;
};

export default function DashboardPage() {
  const { profile, loading } = useUser();
  const router = useRouter();
  const supabase = createClient();
  const [lastSession, setLastSession] = useState<RecitationSession | null>(null);
  const [pending, setPending] = useState<PendingRequest[]>([]);

  useEffect(() => {
    listMyHistory().then(({ data }) => {
      if (data && data.length > 0) setLastSession(data[0] as unknown as RecitationSession);
    });
  }, []);

  useEffect(() => {
    if (!profile || profile.role !== "qari") return;

    async function loadPending() {
      const { data } = await supabase
        .from("recitation_sessions")
        .select("id, surah_number, created_at, student:profiles!recitation_sessions_student_id_fkey(name)")
        .eq("qari_id", profile!.id)
        .eq("status", "requested")
        .order("created_at", { ascending: false });
      setPending((data as any) ?? []);
    }

    loadPending();

    // Novos pedidos aparecem aqui sem precisar de recarregar a página.
    const channel = supabase
      .channel("pending-requests-" + profile.id)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "recitation_sessions", filter: "qari_id=eq." + profile.id },
        loadPending
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

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

      {profile.role === "qari" && (
        <div className="mt-8 pt-6 border-t border-gold-500/20">
          <div className="text-[0.78rem] uppercase tracking-wide text-[#8a8a7d] mb-3">
            Pedidos pendentes {pending.length > 0 ? `(${pending.length})` : ""}
          </div>
          {pending.length === 0 ? (
            <div className="text-[0.85rem] text-[#8a8a7d]">Sem pedidos por aceitar neste momento.</div>
          ) : (
            <div className="flex flex-col gap-2">
              {pending.map((p) => (
                <Link
                  key={p.id}
                  href={`/session/${p.id}`}
                  className="flex items-center justify-between border border-gold-500/30 p-3 hover:bg-stone-50"
                >
                  <div>
                    <div className="text-[0.9rem] font-semibold text-emerald-950">
                      {p.student?.name ?? "Aluno"}
                    </div>
                    <div className="text-[0.72rem] text-[#8a8a7d]">
                      {p.surah_number ? `Surah ${p.surah_number}` : "Surah a combinar"}
                    </div>
                  </div>
                  <span className="text-[0.78rem] font-semibold text-maroon-600">Ver pedido →</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

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
