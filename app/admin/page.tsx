"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/lib/auth/useUser";
import { createClient } from "@/lib/supabase/client";
import Navigation from "@/components/Navigation";
import { fmtMoney } from "@/lib/payments/constants";

type Tab = "users" | "sessions" | "reports";

type UserRow = { id: string; name: string; role: string; created_at: string };
type SessionRow = {
  id: string;
  status: string;
  rate_per_minute: number | null;
  total_cost: number | null;
  payment_method: string | null;
  payment_estimated_amount: number | null;
  created_at: string;
  student: { name: string } | null;
  qari: { name: string } | null;
};
type ReportRow = {
  id: string;
  reason: string;
  resolved: boolean;
  created_at: string;
  reporter: { name: string } | null;
  target_session_id: string | null;
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function AdminPage() {
  const { profile, loading } = useUser();
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("users");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!profile || profile.role !== "admin") return;

    async function loadAll() {
      const [{ data: u }, { data: s }, { data: r }] = await Promise.all([
        supabase.from("profiles").select("id, name, role, created_at").order("created_at", { ascending: false }),
        supabase
          .from("recitation_sessions")
          .select(
            "id, status, rate_per_minute, total_cost, payment_method, payment_estimated_amount, created_at, student:profiles!recitation_sessions_student_id_fkey(name), qari:profiles!recitation_sessions_qari_id_fkey(name)"
          )
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("reports")
          .select("id, reason, resolved, created_at, target_session_id, reporter:profiles!reports_reporter_id_fkey(name)")
          .order("created_at", { ascending: false }),
      ]);
      setUsers((u as any) ?? []);
      setSessions((s as any) ?? []);
      setReports((r as any) ?? []);
      setLoadingData(false);
    }
    loadAll();
  }, [profile]);

  async function resolveReport(id: string) {
    setReports((cur) => cur.map((r) => (r.id === id ? { ...r, resolved: true } : r)));
    await supabase.from("reports").update({ resolved: true }).eq("id", id);
  }

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

  const pendingReports = reports.filter((r) => !r.resolved).length;

  return (
    <div className="card">
      <Navigation profile={profile} />
      <h2 className="mb-4">Painel de administração</h2>

      <div className="flex gap-2 mb-4 border-b border-gold-500/20 pb-3">
        <button
          className={`py-1.5 px-3 text-[0.8rem] border ${tab === "users" ? "bg-emerald-950 text-stone-50 border-emerald-950" : "border-gold-500/30 text-emerald-900"}`}
          onClick={() => setTab("users")}
        >
          Utilizadores ({users.length})
        </button>
        <button
          className={`py-1.5 px-3 text-[0.8rem] border ${tab === "sessions" ? "bg-emerald-950 text-stone-50 border-emerald-950" : "border-gold-500/30 text-emerald-900"}`}
          onClick={() => setTab("sessions")}
        >
          Sessões ({sessions.length})
        </button>
        <button
          className={`py-1.5 px-3 text-[0.8rem] border ${tab === "reports" ? "bg-emerald-950 text-stone-50 border-emerald-950" : "border-gold-500/30 text-emerald-900"}`}
          onClick={() => setTab("reports")}
        >
          Denúncias {pendingReports > 0 ? `(${pendingReports} por rever)` : ""}
        </button>
      </div>

      {loadingData ? (
        <div className="text-center py-10 text-[#8a8a7d] text-[0.88rem]">A carregar dados…</div>
      ) : (
        <>
          {tab === "users" && (
            <div className="flex flex-col">
              {users.map((u) => (
                <div key={u.id} className="flex justify-between items-center py-2.5 border-b border-gold-500/15 last:border-b-0">
                  <div>
                    <div className="text-[0.88rem] font-semibold text-emerald-950">{u.name}</div>
                    <div className="text-[0.72rem] text-[#8a8a7d]">{fmtDate(u.created_at)}</div>
                  </div>
                  <span className="text-[0.72rem] uppercase tracking-wide text-maroon-600 font-semibold">{u.role}</span>
                </div>
              ))}
              {users.length === 0 && <div className="text-[0.85rem] text-[#8a8a7d]">Sem utilizadores.</div>}
            </div>
          )}

          {tab === "sessions" && (
            <div className="flex flex-col">
              {sessions.map((s) => (
                <div key={s.id} className="py-2.5 border-b border-gold-500/15 last:border-b-0">
                  <div className="flex justify-between items-baseline">
                    <div className="text-[0.85rem] font-semibold text-emerald-950">
                      {s.student?.name ?? "?"} → {s.qari?.name ?? "?"}
                    </div>
                    <span className="text-[0.72rem] uppercase text-[#8a8a7d]">{s.status}</span>
                  </div>
                  <div className="text-[0.72rem] text-[#8a8a7d] mt-0.5">
                    {fmtDate(s.created_at)}
                    {s.total_cost != null ? ` · custo: ${fmtMoney(s.total_cost)}` : ""}
                    {s.payment_method ? ` · pagamento reportado: ${fmtMoney(s.payment_estimated_amount ?? 0)} via ${s.payment_method}` : ""}
                  </div>
                </div>
              ))}
              {sessions.length === 0 && <div className="text-[0.85rem] text-[#8a8a7d]">Sem sessões ainda.</div>}
            </div>
          )}

          {tab === "reports" && (
            <div className="flex flex-col">
              {reports.map((r) => (
                <div key={r.id} className="py-3 border-b border-gold-500/15 last:border-b-0">
                  <div className="flex justify-between items-start gap-3">
                    <div>
                      <div className="text-[0.85rem] text-emerald-950">
                        <span className="font-semibold">{r.reporter?.name ?? "Anónimo"}</span>: {r.reason}
                      </div>
                      <div className="text-[0.72rem] text-[#8a8a7d] mt-0.5">{fmtDate(r.created_at)}</div>
                    </div>
                    {!r.resolved && (
                      <button
                        className="btn btn-ghost !w-auto !mt-0 py-1.5 px-3 text-[0.72rem] flex-shrink-0"
                        onClick={() => resolveReport(r.id)}
                      >
                        Marcar resolvida
                      </button>
                    )}
                    {r.resolved && <span className="text-[0.72rem] text-okgreen flex-shrink-0">Resolvida ✓</span>}
                  </div>
                </div>
              ))}
              {reports.length === 0 && <div className="text-[0.85rem] text-[#8a8a7d]">Sem denúncias.</div>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
