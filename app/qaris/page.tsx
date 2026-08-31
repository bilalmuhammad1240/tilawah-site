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
    <div className="app-shell min-h-screen">
      <div className="top-hero">
        <div className="page-wrap">
      <Navigation profile={profile} />
      <div className="pt-4 pb-10">
        <div className="mb-2 text-sm font-medium text-white/80"><span className="mr-2 inline-block h-2 w-2 rounded-full bg-[#83ad63]" />{qaris.filter((q) => q.isAvailable).length} Qaris disponíveis agora</div>
        <h1 className="font-[var(--font-newsreader)] text-4xl tracking-tight">Encontre quem vai ouvir a sua recitação.</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-white/75">Escolha um Qari disponível e comece uma sessão quando tiver tempo. Recite, receba correções e melhore sempre.</p>
      </div>
    </div></div>
    <main className="page-wrap -mt-5 relative z-20 pb-28 md:pb-10">
      <section className="content-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#ece9df] px-5 py-4">
          <div><h2 className="section-title">Qaris disponíveis</h2><p className="mt-1 text-xs text-[#858c86]">Escolha um profissional para ouvir a sua recitação.</p></div>
          <div className="rounded-full bg-[#edf4ec] px-3 py-1.5 text-xs font-semibold text-[#286256]">{qaris.filter((q) => q.isAvailable).length} online</div>
        </div>
        {error && <div className="mx-5 mt-4 rounded-xl bg-[#fff1ef] px-4 py-3 text-sm text-[#a44b43]">{error}</div>}
        {qaris.length === 0 ? <div className="p-10 text-center text-sm text-[#8a8a7d]">Ainda não há Qaris registados. Volte mais tarde.</div> : <div>{qaris.map((q) => <QariCard key={q.id} qari={q} onRequest={setSelected} onCallNow={handleCallNow} />)}</div>}
      </section>
    </main>
    </div>
  );
}
