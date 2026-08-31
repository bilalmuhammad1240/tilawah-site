"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/auth/useUser";
import { createClient } from "@/lib/supabase/client";
import Navigation from "@/components/Navigation";
import QariCard, { type QariListItem } from "@/components/QariCard";
import SessionRequest from "@/components/SessionRequest";
import { requestSession, startDirectCall } from "@/lib/sessions/api";

export default function QarisPage() {
  const { profile, loading } = useUser();
  const router = useRouter();
  const supabase = createClient();

  const [qaris, setQaris] = useState<QariListItem[]>([]);
  const [selected, setSelected] = useState<QariListItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function loadQaris() {
    const { data } = await supabase
      .from("qari_profiles")
      .select("id, rate_per_minute, specialties, profiles(name), qari_presence(is_available)");
    if (!data) return;
    setQaris(
      data.map((q: any) => ({
        id: q.id,
        name: q.profiles?.name ?? "Qari",
        ratePerMinute: q.rate_per_minute,
        specialties: q.specialties ?? [],
        isAvailable: !!q.qari_presence?.is_available,
      }))
    );
  }

  useEffect(() => {
    loadQaris();
    const channel = supabase
      .channel("qari-presence-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "qari_presence" }, loadQaris)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCallNow(qari: QariListItem) {
    setError("");
    const { data: session, error: callError } = await startDirectCall({
      qariId: qari.id,
      ratePerMinute: qari.ratePerMinute,
    });
    if (callError || !session) {
      setError("Não foi possível ligar agora. Tente novamente.");
      return;
    }
    router.push(`/session/${session.id}`);
  }

  async function handleRequest(data: { surahNumber?: number; ayahStart?: number; ayahEnd?: number }) {
    if (!selected) return;
    setSubmitting(true);
    setError("");
    const { data: session, error: reqError } = await requestSession({
      qariId: selected.id,
      ratePerMinute: selected.ratePerMinute,
      ...data,
    });
    setSubmitting(false);
    if (reqError || !session) {
      setError("Não foi possível enviar o pedido. Tente novamente.");
      return;
    }
    router.push(`/session/${session.id}`);
  }

  if (loading) return <div className="card text-center text-[#8a8a7d]">A carregar…</div>;
  if (!profile) return null;

  if (selected) {
    return (
      <SessionRequest
        qari={selected}
        submitting={submitting}
        onSubmit={handleRequest}
        onCancel={() => setSelected(null)}
      />
    );
  }

  return (
    <div className="card">
      <Navigation profile={profile} />
      <div className="eyebrow">
        <span className="dot" /> {qaris.filter((q) => q.isAvailable).length} disponíveis agora
      </div>
      <h2 className="mb-2">Quem está disponível</h2>
      <p className="text-[#54544a] text-[0.9rem] mb-4">
        Escolha um Qari e envie um pedido de sessão. A chamada só começa quando ele aceitar.
      </p>
      {error && <div className="err">{error}</div>}

      {qaris.length === 0 ? (
        <div className="text-center py-10 text-[#8a8a7d] text-[0.88rem]">
          Ainda não há Qaris registados. Volte mais tarde.
        </div>
      ) : (
        <div className="border border-gold-500/20">
          {qaris.map((q) => (
            <QariCard key={q.id} qari={q} onRequest={setSelected} onCallNow={handleCallNow} />
          ))}
        </div>
      )}
    </div>
  );
}
