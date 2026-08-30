"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/lib/auth/useUser";
import Navigation from "@/components/Navigation";
import { listMyHistory } from "@/lib/sessions/api";

function fmtMoney(v: number | null) {
  if (!v) return "—";
  return "€" + v.toFixed(2).replace(".", ",");
}

export default function HistoryPage() {
  const { profile, loading } = useUser();
  const [sessions, setSessions] = useState<any[]>([]);

  useEffect(() => {
    listMyHistory().then(({ data }) => setSessions(data ?? []));
  }, []);

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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
