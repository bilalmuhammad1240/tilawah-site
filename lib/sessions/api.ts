import { createClient } from "@/lib/supabase/client";

export type RecitationSession = {
  id: string;
  student_id: string;
  qari_id: string;
  surah_number: number | null;
  ayah_start: number | null;
  ayah_end: number | null;
  status: "requested" | "accepted" | "rejected" | "in_progress" | "completed" | "cancelled";
  rate_per_minute: number | null;
  duration_seconds: number | null;
  total_cost: number | null;
};

// O aluno pede uma sessão a um Qari (etapa 5 do fluxo do aluno).
export async function requestSession(params: {
  qariId: string;
  surahNumber?: number;
  ayahStart?: number;
  ayahEnd?: number;
  ratePerMinute: number;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Precisa de iniciar sessão para pedir uma recitação.");

  return supabase
    .from("recitation_sessions")
    .insert({
      student_id: user.id,
      qari_id: params.qariId,
      surah_number: params.surahNumber ?? null,
      ayah_start: params.ayahStart ?? null,
      ayah_end: params.ayahEnd ?? null,
      rate_per_minute: params.ratePerMinute,
      status: "requested",
    })
    .select()
    .single();
}

export async function acceptSession(sessionId: string) {
  const supabase = createClient();
  return supabase
    .from("recitation_sessions")
    .update({ status: "accepted", started_at: new Date().toISOString() })
    .eq("id", sessionId);
}

export async function rejectSession(sessionId: string) {
  const supabase = createClient();
  return supabase.from("recitation_sessions").update({ status: "rejected" }).eq("id", sessionId);
}

// O custo final é apenas indicativo aqui — o plano (secção 11) exige
// validar preço/duração/total no servidor antes de o considerar cobrável.
export async function endSession(sessionId: string, durationSeconds: number, ratePerMinute: number) {
  const supabase = createClient();
  const totalCost = Math.round(((durationSeconds / 60) * ratePerMinute) * 100) / 100;
  return supabase
    .from("recitation_sessions")
    .update({
      status: "completed",
      ended_at: new Date().toISOString(),
      duration_seconds: durationSeconds,
      total_cost: totalCost,
    })
    .eq("id", sessionId);
}

export async function listMyHistory() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: [], error: null };

  return supabase
    .from("recitation_sessions")
    .select("*, session_feedback(*)")
    .or(`student_id.eq.${user.id},qari_id.eq.${user.id}`)
    .order("created_at", { ascending: false });
}
