"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/auth/useUser";
import { createClient } from "@/lib/supabase/client";
import { useWebRTCCall } from "@/lib/webrtc/useWebRTCCall";
import AudioCall from "@/components/AudioCall";
import FeedbackForm from "@/components/FeedbackForm";
import { acceptSession, rejectSession, endSession } from "@/lib/sessions/api";
import { createNotification } from "@/lib/notifications/api";
import { fmtMoney } from "@/lib/payments/constants";

type SessionRow = {
  id: string;
  student_id: string;
  qari_id: string;
  status: string;
  rate_per_minute: number;
  payment_method: "emola" | "mpesa" | null;
  payment_estimated_amount: number | null;
  payment_reported: boolean;
  student: { name: string };
  qari: { name: string };
};

export default function SessionPage({ params }: { params: { id: string } }) {
  const { profile } = useUser();
  const router = useRouter();
  const supabase = createClient();
  const [session, setSession] = useState<SessionRow | null>(null);
  const [incomingCall, setIncomingCall] = useState<any>(null);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [savingFeedback, setSavingFeedback] = useState(false);

  const webrtc = useWebRTCCall(profile?.id ?? null);

  const loadSession = useCallback(async () => {
    const { data } = await supabase
      .from("recitation_sessions")
      .select("*, student:profiles!recitation_sessions_student_id_fkey(name), qari:profiles!recitation_sessions_qari_id_fkey(name)")
      .eq("id", params.id)
      .single();
    if (data) setSession(data as unknown as SessionRow);
  }, [params.id]);

  useEffect(() => {
    loadSession();
    const channel = supabase
      .channel("session-" + params.id)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "recitation_sessions", filter: "id=eq." + params.id },
        (payload) => setSession((s) => (s ? { ...s, ...(payload.new as any) } : s))
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  // O aluno inicia a chamada assim que o Qari aceita o pedido.
  useEffect(() => {
    if (!profile || !session) return;
    const isStudent = profile.id === session.student_id;
    if (isStudent && session.status === "accepted" && !activeCallId && webrtc.status === "idle") {
      webrtc.startCall({ calleeId: session.qari_id, sessionId: session.id }).then((id) => {
        if (id) setActiveCallId(id);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, session, activeCallId, webrtc.status]);

  // O Qari escuta chamadas a chegar para esta sessão específica.
  useEffect(() => {
    if (!profile || !session) return;
    const isQari = profile.id === session.qari_id;
    if (!isQari) return;

    // Se a chamada já existir (ex.: o CallListener global já trouxe o
    // utilizador até aqui depois de detetar o INSERT), a subscrição
    // abaixo não a vai apanhar — só reage a inserções futuras.
    supabase
      .from("calls")
      .select("*")
      .eq("session_id", session.id)
      .eq("callee_id", profile.id)
      .eq("status", "ringing")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setIncomingCall(data);
      });

    const channel = supabase
      .channel("incoming-for-session-" + session.id)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "calls", filter: "callee_id=eq." + profile.id },
        (payload) => {
          const row = payload.new as any;
          if (row.session_id === session.id && row.status === "ringing") {
            setIncomingCall(row);
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, session]);

  if (!profile || !session) return <div className="card text-center text-[#8a8a7d]">A carregar…</div>;

  const isStudent = profile.id === session.student_id;
  const peerName = isStudent ? session.qari.name : session.student.name;

  function PaymentBanner() {
    if (isStudent || !session!.payment_reported) return null;
    const methodLabel = session!.payment_method === "emola" ? "eMola" : "M-Pesa";
    return (
      <div className="border border-gold-500/30 bg-stone-50 p-3 text-left mb-4 -mt-1">
        <div className="text-[0.72rem] uppercase tracking-wide text-[#8a8a7d] mb-1">Pagamento reportado pelo aluno</div>
        <div className="text-[0.85rem] text-emerald-950">
          {session!.payment_estimated_amount != null ? fmtMoney(session!.payment_estimated_amount) : "valor não indicado"}{" "}
          via {methodLabel}
        </div>
        <div className="text-[0.72rem] text-[#8a8a7d] mt-1">
          Não verificado automaticamente — confirme no seu extrato antes de atender.
        </div>
      </div>
    );
  }

  async function handleAcceptSessionRequest() {
    await acceptSession(session!.id);
  }
  async function handleRejectSessionRequest() {
    await rejectSession(session!.id);
    router.push("/dashboard");
  }

  async function handleAcceptIncomingCall() {
    const ok = await webrtc.acceptCall({ id: incomingCall.id, offer: incomingCall.offer });
    if (ok) setActiveCallId(incomingCall.id);
    setIncomingCall(null);
  }
  async function handleRejectIncomingCall() {
    await webrtc.rejectCall(incomingCall.id);
    await rejectSession(session!.id);
    setIncomingCall(null);
  }

  async function handleEndCall(durationSeconds: number) {
    if (activeCallId) await webrtc.endCall(activeCallId);
    await endSession(session!.id, durationSeconds, session!.rate_per_minute);
    setActiveCallId(null);
    if (!isStudent) {
      setShowFeedback(true);
    } else {
      router.push("/history");
    }
  }

  async function submitFeedback(data: {
    scores: { recitation: number; tajwid: number; makharij: number; fluency: number };
    strengths: string;
    pointsToReview: string;
    recommendation: string;
  }) {
    setSavingFeedback(true);
    await supabase.from("session_feedback").insert({
      session_id: session!.id,
      recitation_score: data.scores.recitation,
      tajwid_score: data.scores.tajwid,
      makharij_score: data.scores.makharij,
      fluency_score: data.scores.fluency,
      strengths: data.strengths,
      points_to_review: data.pointsToReview,
      recommendation: data.recommendation,
    });
    setSavingFeedback(false);
    await createNotification(session!.student_id, "feedback_received", "Recebeu feedback da sua recitação.", session!.id);
    router.push("/history");
  }

  if (showFeedback) {
    return <FeedbackForm submitting={savingFeedback} onSubmit={submitFeedback} />;
  }

  if (incomingCall) {
    return (
      <div className="flex flex-col items-center gap-3 w-full">
        {!isStudent && (
          <div className="card !p-0 overflow-hidden w-full">
            <div className="p-4">
              <PaymentBanner />
            </div>
          </div>
        )}
        <AudioCall
          mode="incoming"
          peerName={peerName}
          ratePerMinute={session.rate_per_minute}
          status="ringing"
          remoteStream={null}
          errorMessage={null}
          onAccept={handleAcceptIncomingCall}
          onReject={handleRejectIncomingCall}
          onEnd={() => {}}
        />
      </div>
    );
  }

  if (activeCallId) {
    return (
      <AudioCall
        mode={webrtc.status === "connected" ? "in-call" : isStudent ? "outgoing" : "in-call"}
        peerName={peerName}
        ratePerMinute={session.rate_per_minute}
        status={webrtc.status}
        remoteStream={webrtc.remoteStream}
        errorMessage={webrtc.errorMessage}
        onCancel={() => handleEndCall(0)}
        onEnd={handleEndCall}
      />
    );
  }

  if (session.status === "requested") {
    if (isStudent) {
      return (
        <div className="card text-center">
          <div className="eyebrow justify-center">
            <span className="dot" /> Pedido enviado
          </div>
          <h2 className="mb-2">A aguardar {session.qari.name}</h2>
          <p className="text-[#54544a] text-[0.9rem]">O Qari foi notificado do seu pedido de recitação.</p>
        </div>
      );
    }
    return (
      <div className="card text-center">
        <div className="eyebrow justify-center">
          <span className="dot" /> Novo pedido
        </div>
        <h2 className="mb-4">{session.student.name} quer recitar consigo</h2>
        <PaymentBanner />
        <div className="flex gap-3 mt-1">
          <button className="btn btn-danger !mt-0" onClick={handleRejectSessionRequest}>
            Recusar
          </button>
          <button className="btn btn-gold !mt-0" onClick={handleAcceptSessionRequest}>
            Aceitar
          </button>
        </div>
      </div>
    );
  }

  if (session.status === "accepted") {
    return <div className="card text-center text-[#8a8a7d]">A ligar a chamada…</div>;
  }

  return (
    <div className="card text-center">
      <h2>Sessão {session.status === "completed" ? "concluída" : session.status}</h2>
      <button className="btn btn-primary" onClick={() => router.push("/history")}>
        Ver histórico
      </button>
    </div>
  );
}
