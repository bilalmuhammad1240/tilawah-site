"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/lib/auth/useUser";
import { createClient } from "@/lib/supabase/client";
import Navigation from "@/components/Navigation";
import { fmtMoney } from "@/lib/payments/constants";

type Tab = "users" | "sessions" | "reports" | "diagnostics";

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
type DiagnosticRow = {
  id: string;
  call_id: string;
  role: string;
  event: string;
  detail: any;
  created_at: string;
  user: { name: string } | null;
};

const TABS: { id: Tab; label: string }[] = [
  { id: "users", label: "Utilizadores" },
  { id: "sessions", label: "Sessões" },
  { id: "reports", label: "Denúncias" },
  { id: "diagnostics", label: "Diagnóstico de chamadas" },
];

const ROLE_BADGE: Record<string, string> = {
  admin: "badge-danger",
  qari: "badge-gold",
  aluno: "badge-neutral",
};

const SESSION_STATUS_LABEL: Record<string, string> = {
  requested: "Pendente",
  accepted: "Aceite",
  in_progress: "Em curso",
  completed: "Concluída",
  rejected: "Recusada",
  cancelled: "Cancelada",
};
const SESSION_STATUS_BADGE: Record<string, string> = {
  requested: "badge-neutral",
  accepted: "badge-gold",
  in_progress: "badge-gold",
  completed: "badge-ok",
  rejected: "badge-danger",
  cancelled: "badge-danger",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function initials(name: string) {
  return (name || "?").trim().slice(0, 1).toUpperCase();
}

export default function AdminPage() {
  const { profile, loading } = useUser();
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("users");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [diagnostics, setDiagnostics] = useState<DiagnosticRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!profile || profile.role !== "admin") return;

    async function loadAll() {
      const [{ data: u }, { data: s }, { data: r }, { data: d }] = await Promise.all([
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
        supabase
          .from("call_diagnostics")
          .select("id, call_id, role, event, detail, created_at, user:profiles!call_diagnostics_user_id_fkey(name)")
          .order("created_at", { ascending: false })
          .limit(100),
      ]);
      setUsers((u as any) ?? []);
      setSessions((s as any) ?? []);
      setReports((r as any) ?? []);
      setDiagnostics((d as any) ?? []);
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
  const qariCount = users.filter((u) => u.role === "qari").length;
  const callsMonitored = new Set(diagnostics.map((d) => d.call_id)).size;

  return (
    <div className="shell mx-auto">
      <Navigation profile={profile} />

      <div className="mb-8">
        <h2 className="text-[1.6rem] mb-1.5">Painel de administração</h2>
        <p className="text-[#6b6b5f] text-[0.92rem]">Visão geral da plataforma Tilawah.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <div className="stat-card">
          <span className="stat-value">{users.length}</span>
          <span className="stat-label">Utilizadores</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{qariCount}</span>
          <span className="stat-label">Qaris</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{sessions.length}</span>
          <span className="stat-label">Sessões recentes</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{pendingReports}</span>
          <span className="stat-label">Denúncias por rever</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`py-2 px-4 text-[0.82rem] font-semibold rounded-full border transition-colors ${
              tab === t.id
                ? "bg-emerald-950 text-stone-50 border-emerald-950"
                : "border-gold-500/30 text-emerald-900 hover:bg-gold-500/10"
            }`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === "users" && ` (${users.length})`}
            {t.id === "sessions" && ` (${sessions.length})`}
            {t.id === "reports" && pendingReports > 0 && ` (${pendingReports} por rever)`}
          </button>
        ))}
      </div>

      <div className="shell-panel">
        {loadingData ? (
          <div className="text-center py-14 text-[#8a8a7d] text-[0.88rem]">A carregar dados…</div>
        ) : (
          <>
            {tab === "users" && (
              <div className="flex flex-col">
                {users.map((u) => (
                  <div key={u.id} className="row">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="avatar flex-shrink-0">{initials(u.name)}</div>
                      <div className="min-w-0">
                        <div className="text-[0.92rem] font-semibold text-emerald-950 truncate">{u.name}</div>
                        <div className="text-[0.74rem] text-[#8a8a7d]">Registado em {fmtDate(u.created_at)}</div>
                      </div>
                    </div>
                    <span className={`badge ${ROLE_BADGE[u.role] ?? "badge-neutral"} flex-shrink-0`}>{u.role}</span>
                  </div>
                ))}
                {users.length === 0 && <div className="text-[0.85rem] text-[#8a8a7d] py-6">Sem utilizadores.</div>}
              </div>
            )}

            {tab === "sessions" && (
              <div className="flex flex-col">
                {sessions.map((s) => (
                  <div key={s.id} className="row items-start">
                    <div className="min-w-0">
                      <div className="text-[0.9rem] font-semibold text-emerald-950">
                        {s.student?.name ?? "?"} <span className="text-[#8a8a7d] font-normal">→</span> {s.qari?.name ?? "?"}
                      </div>
                      <div className="text-[0.74rem] text-[#8a8a7d] mt-1 leading-relaxed">
                        {fmtDate(s.created_at)}
                        {s.payment_method && (
                          <>
                            {" · "}
                            {fmtMoney(s.payment_estimated_amount ?? 0)} via {s.payment_method === "emola" ? "eMola" : "M-Pesa"}
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <span className={`badge ${SESSION_STATUS_BADGE[s.status] ?? "badge-neutral"}`}>
                        {SESSION_STATUS_LABEL[s.status] ?? s.status}
                      </span>
                      {s.total_cost != null && (
                        <span className="font-mono text-[0.85rem] text-emerald-950">{fmtMoney(s.total_cost)}</span>
                      )}
                    </div>
                  </div>
                ))}
                {sessions.length === 0 && <div className="text-[0.85rem] text-[#8a8a7d] py-6">Sem sessões ainda.</div>}
              </div>
            )}

            {tab === "reports" && (
              <div className="flex flex-col">
                {pendingReports > 0 && (
                  <div className="badge badge-danger mb-5">{pendingReports} por rever</div>
                )}
                {reports.map((r) => (
                  <div key={r.id} className="row items-start">
                    <div className="min-w-0">
                      <div className="text-[0.88rem] text-ink-900 leading-relaxed">
                        <span className="font-semibold text-emerald-950">{r.reporter?.name ?? "Anónimo"}</span>
                        {": "}
                        {r.reason}
                      </div>
                      <div className="text-[0.74rem] text-[#8a8a7d] mt-1">{fmtDate(r.created_at)}</div>
                    </div>
                    {!r.resolved ? (
                      <button
                        className="btn btn-ghost !w-auto !mt-0 py-1.5 px-3.5 text-[0.74rem] flex-shrink-0"
                        onClick={() => resolveReport(r.id)}
                      >
                        Marcar resolvida
                      </button>
                    ) : (
                      <span className="badge badge-ok flex-shrink-0">Resolvida</span>
                    )}
                  </div>
                ))}
                {reports.length === 0 && <div className="text-[0.85rem] text-[#8a8a7d] py-6">Sem denúncias.</div>}
              </div>
            )}

            {tab === "diagnostics" && (
              <div className="flex flex-col gap-5">
                <p className="hint !mt-0">
                  Nunca inclui áudio — só estados de ligação técnica. Depois de um teste (ex.: um telemóvel em Wi-Fi e
                  outro em dados móveis), procura o evento <code>candidate_pair_selected</code>: se{" "}
                  <code>usedRelay</code> for <code>true</code>, a chamada precisou do servidor TURN para ligar.
                </p>
                {Object.entries(
                  diagnostics.reduce((groups: Record<string, DiagnosticRow[]>, d) => {
                    (groups[d.call_id] ??= []).push(d);
                    return groups;
                  }, {})
                ).map(([callId, events]) => {
                  const ordered = events.slice().reverse();
                  const lastEvent = ordered[ordered.length - 1];
                  const relay = ordered.find((e) => e.event === "candidate_pair_selected")?.detail?.usedRelay;
                  return (
                    <div key={callId} className="border border-gold-500/20 rounded-xl p-4">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="text-[0.78rem] font-mono text-[#8a8a7d]">Chamada {callId.slice(0, 8)}…</div>
                        {relay !== undefined && (
                          <span className={`badge ${relay ? "badge-warn" : "badge-ok"}`}>
                            {relay ? "Via TURN (relay)" : "Ligação direta/STUN"}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col gap-1.5 mb-2">
                        {ordered.map((e) => (
                          <div key={e.id} className="text-[0.78rem] text-ink-900 flex gap-2.5">
                            <span className="text-[#8a8a7d] flex-shrink-0 font-mono">{fmtDate(e.created_at)}</span>
                            <span className="font-semibold flex-shrink-0">[{e.role}]</span>
                            <span>{e.event}</span>
                          </div>
                        ))}
                      </div>
                      {ordered.some((e) => Object.keys(e.detail ?? {}).length > 0) && (
                        <details className="mt-2">
                          <summary className="text-[0.74rem] text-emerald-900 cursor-pointer select-none">
                            Mostrar detalhes técnicos
                          </summary>
                          <div className="mt-2 flex flex-col gap-1">
                            {ordered
                              .filter((e) => Object.keys(e.detail ?? {}).length > 0)
                              .map((e) => (
                                <div key={e.id} className="text-[0.72rem] font-mono text-[#8a8a7d] break-all">
                                  {fmtDate(e.created_at)} [{e.role}] {e.event} — {JSON.stringify(e.detail)}
                                </div>
                              ))}
                          </div>
                        </details>
                      )}
                    </div>
                  );
                })}
                {diagnostics.length === 0 && (
                  <div className="text-[0.85rem] text-[#8a8a7d] py-6">
                    Sem dados ainda — faz uma chamada de teste e volta aqui.
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
