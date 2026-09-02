"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/auth/useUser";
import { createClient } from "@/lib/supabase/client";
import Navigation from "@/components/Navigation";

// Esta página é, de propósito, o único sítio onde dizemos ao Qari para
// ficar parado à espera de uma chamada. O CallListener global (montado
// em app/layout.tsx) continua a funcionar como rede de segurança se o
// Qari navegar para outro sítio — mas a fiabilidade real vem de estar
// aqui, com a página em primeiro plano, onde tanto o tempo real como o
// polling de reserva correm sem interrupção.
const POLL_INTERVAL_MS = 8000;

type PendingRequest = {
  id: string;
  student: { name: string } | null;
  surah_number: number | null;
  created_at: string;
};

export default function SalaDeEsperaPage() {
  const { profile, loading } = useUser();
  const router = useRouter();
  const supabase = createClient();

  const [isAvailable, setIsAvailable] = useState(false);
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (!profile || profile.role !== "qari") return;
    supabase
      .from("qari_presence")
      .select("is_available")
      .eq("qari_id", profile.id)
      .single()
      .then(({ data }) => setIsAvailable(!!data?.is_available));
  }, [profile]);

  async function toggleAvailable() {
    if (!profile) return;
    setSavingAvailability(true);
    const next = !isAvailable;
    await supabase
      .from("qari_presence")
      .upsert({ qari_id: profile.id, is_available: next, last_seen: new Date().toISOString() });
    setIsAvailable(next);
    setSavingAvailability(false);
  }

  const checkForIncomingCall = useCallback(async () => {
    if (!profile || redirectedRef.current) return;
    const { data } = await supabase
      .from("calls")
      .select("session_id")
      .eq("callee_id", profile.id)
      .eq("status", "ringing")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.session_id) {
      redirectedRef.current = true;
      router.push(`/session/${data.session_id}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const loadPending = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from("recitation_sessions")
      .select("id, surah_number, created_at, student:profiles!recitation_sessions_student_id_fkey(name)")
      .eq("qari_id", profile.id)
      .eq("status", "requested")
      .order("created_at", { ascending: false });
    setPending((data as any) ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  useEffect(() => {
    if (!profile || profile.role !== "qari") return;

    checkForIncomingCall();
    loadPending();

    // Tempo real: apanha chamadas e pedidos assim que acontecem.
    const channel = supabase
      .channel("sala-de-espera-" + profile.id)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "calls", filter: "callee_id=eq." + profile.id },
        (payload) => {
          const row = payload.new as any;
          if (row.status === "ringing" && row.session_id && !redirectedRef.current) {
            redirectedRef.current = true;
            router.push(`/session/${row.session_id}`);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "recitation_sessions", filter: "qari_id=eq." + profile.id },
        loadPending
      )
      .subscribe();

    // Rede de segurança: se o WebSocket cair sem avisar (comum em
    // telemóveis quando o ecrã bloqueia), o polling continua a apanhar
    // chamadas mesmo sem o evento em tempo real ter chegado.
    const pollHandle = setInterval(checkForIncomingCall, POLL_INTERVAL_MS);

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        checkForIncomingCall();
        loadPending();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollHandle);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  if (loading) return <div className="card text-center text-[#8a8a7d]">A carregar…</div>;
  if (!profile) return null;

  if (profile.role !== "qari") {
    return (
      <div className="card text-center">
        <h2>Esta página é só para Qaris</h2>
        <p className="text-[#54544a] text-[0.9rem]">Alunos ligam a partir de "Encontrar Qari".</p>
      </div>
    );
  }

  return (
    <div className="card">
      <Navigation profile={profile} />

      <div className="text-center py-6">
        <div
          className={`relative w-24 h-24 mx-auto mb-5 rounded-full flex items-center justify-center text-3xl ${
            isAvailable ? "bg-gold-500/20" : "bg-stone-100"
          }`}
        >
          {isAvailable && <span className="absolute inset-[-8px] border border-gold-500 rounded-full animate-ping opacity-40" />}
          🎧
        </div>

        <h2 className="mb-2">{isAvailable ? "A aguardar chamadas…" : "Está indisponível"}</h2>
        <p className="text-[#54544a] text-[0.88rem] mb-5">
          {isAvailable
            ? "Fique nesta página. Assim que um aluno ligar, vai ser levado diretamente para a chamada."
            : "Ative a disponibilidade para começar a receber chamadas de alunos."}
        </p>

        <button className={`btn ${isAvailable ? "btn-ghost" : "btn-gold"}`} disabled={savingAvailability} onClick={toggleAvailable}>
          {savingAvailability ? "A atualizar…" : isAvailable ? "Ficar indisponível" : "Ficar disponível"}
        </button>
      </div>

      {pending.length > 0 && (
        <div className="mt-2 pt-6 border-t border-gold-500/20">
          <div className="text-[0.78rem] uppercase tracking-wide text-[#8a8a7d] mb-3">
            Pedidos por aceitar ({pending.length})
          </div>
          <div className="flex flex-col gap-2">
            {pending.map((p) => (
              <Link
                key={p.id}
                href={`/session/${p.id}`}
                className="flex items-center justify-between border border-gold-500/30 p-3 hover:bg-stone-50"
              >
                <div>
                  <div className="text-[0.9rem] font-semibold text-emerald-950">{p.student?.name ?? "Aluno"}</div>
                  <div className="text-[0.72rem] text-[#8a8a7d]">
                    {p.surah_number ? `Surah ${p.surah_number}` : "Surah a combinar"}
                  </div>
                </div>
                <span className="text-[0.78rem] font-semibold text-maroon-600">Ver pedido →</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
