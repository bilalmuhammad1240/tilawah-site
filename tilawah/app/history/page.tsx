"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/lib/auth/useUser";
import { createClient } from "@/lib/supabase/client";
import Navigation from "@/components/Navigation";
import { listMyHistory } from "@/lib/sessions/api";

function fmtMoney(v: number | null) {
  if (!v) return "—";
  return v.toFixed(2).replace(".", ",") + " MT";
}

export default function HistoryPage() {
  const { profile, loading } = useUser();
  const supabase = createClient();
  const [sessions, setSessions] = useState<any[]>([]);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    listMyHistory().then(({ data }) => setSessions(data ?? []));
  }, []);

  async function submitReport(sessionId: string) {
    if (!reason.trim()) return;
    setSubmitting(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("reports").insert({
        reporter_id: user.id,
        target_session_id: sessionId,
        reason: reason.trim(),
      });
      setReportedIds((cur) => new Set(cur).add(sessionId));
    }
    setSubmitting(false);
    setReportingId(null);
    setReason("");
  }

  if (loading) return <div className="card text-center text-[#8a8a7d]">A carregar…</div>;
  if (!profile) return null;

  return (
    <div className="card">
      <Navigation profile={profile} />
      <h2 className="mb-4">Histórico de sessões</h2>

      {sessions.length === 0 ? (
        <div className="text-center py-10 text-[#8a8a7d] text-[0.88rem]">
          Ainda não tem sessões. Quando recitar pela primeira vez, aparece aqui.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {sessions.map((s) => (
            <div key={s.id} className="border border-gold-500/20 p-3.5">
              <div className="flex justify-between text-[0.85rem] text-emerald-950 font-semibold mb-1">
                <span>{s.status}</span>
                <span className="font-mono">{fmtMoney(s.total_cost)}</span>
              </div>
              <div className="text-[0.78rem] text-[#8a8a7d]">
                {s.duration_seconds ? `${Math.round(s.duration_seconds / 60)} min` : "sem duração registada"}
                {s.session_feedback?.[0]?.recommendation ? ` · ${s.session_feedback[0].recommendation}` : ""}
              </div>

              {reportedIds.has(s.id) ? (
                <div className="text-[0.72rem] text-okgreen mt-2">Denúncia enviada — a equipa vai rever.</div>
              ) : reportingId === s.id ? (
                <div className="mt-2.5">
                  <textarea
                    className="input-field !mt-0 min-h-[70px]"
                    placeholder="Descreva o que correu mal nesta sessão…"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <div className="flex gap-2 mt-1.5">
                    <button
                      className="btn btn-danger !w-auto !mt-0 py-1.5 px-3 text-[0.72rem]"
                      disabled={submitting || !reason.trim()}
                      onClick={() => submitReport(s.id)}
                    >
                      {submitting ? "A enviar…" : "Enviar denúncia"}
                    </button>
                    <button
                      className="btn btn-ghost !w-auto !mt-0 py-1.5 px-3 text-[0.72rem]"
                      onClick={() => {
                        setReportingId(null);
                        setReason("");
                      }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="text-[0.72rem] text-maroon-600 underline mt-2"
                  onClick={() => setReportingId(s.id)}
                >
                  Denunciar esta sessão
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
