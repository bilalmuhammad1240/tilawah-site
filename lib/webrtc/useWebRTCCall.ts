"use client";

import { useCallback, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// STUN sozinho só diz a cada lado o seu próprio endereço público — não
// ajuda quando não é possível estabelecer ligação direta (NAT simétrico,
// certas redes móveis, firewalls corporativas). O TURN faz o relay do
// áudio nesse caso. Estas credenciais do Open Relay Project são uma pool
// pública partilhada: gratuita, sem registo, mas sem garantias. Para
// produção, substituir por um serviço TURN dedicado (Xirsys, Twilio,
// Metered), conforme a secção 12 do plano.
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
};

const CONNECT_TIMEOUT_MS = 25000;
// Rede de segurança para a resposta SDP (guardada em `calls`, já
// comprovada a funcionar em testes reais): se o UPDATE em tempo real
// não chegar, vai buscá-la diretamente à base de dados.
const ANSWER_POLL_INTERVAL_MS = 3000;
// Rede de segurança para os candidatos ICE (agora só por Broadcast, sem
// tabela): reenviar os candidatos locais periodicamente cobre o caso de
// o outro lado ainda não ter entrado no canal quando o primeiro envio
// aconteceu.
const CANDIDATE_RESEND_INTERVAL_MS = 3000;

export type CallStatus = "idle" | "ringing" | "connecting" | "connected" | "failed" | "ended";

type IceRole = "caller" | "callee";

export function useWebRTCCall(myUserId: string | null) {
  const supabase = createClient();
  const [status, setStatus] = useState<CallStatus>("idle");
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const callChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const iceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answerPollHandleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const candidateResendHandleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const answerAppliedRef = useRef(false);
  const localCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const appliedRemoteCandidatesRef = useRef<Set<string>>(new Set());

  // Nunca regista áudio nem conteúdo — só metadados técnicos da ligação
  // (secção 12 do plano: "guardar eventos de conexão para diagnóstico,
  // sem gravar áudio por padrão").
  function logDiagnostic(callId: string, role: IceRole, event: string, detail: Record<string, any> = {}) {
    if (!myUserId) return;
    supabase.from("call_diagnostics").insert({ call_id: callId, user_id: myUserId, role, event, detail }).then(
      () => {},
      () => {}
    );
  }

  async function logSelectedCandidateType(pc: RTCPeerConnection, callId: string, role: IceRole) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const stats = await pc.getStats();
        let localType: string | null = null;
        let remoteType: string | null = null;
        stats.forEach((report: any) => {
          if (report.type === "candidate-pair" && report.state === "succeeded" && report.nominated) {
            const local = stats.get(report.localCandidateId);
            const remote = stats.get(report.remoteCandidateId);
            if (local) localType = local.candidateType;
            if (remote) remoteType = remote.candidateType;
          }
        });
        if (localType || remoteType || attempt === 2) {
          logDiagnostic(callId, role, "candidate_pair_selected", {
            localType,
            remoteType,
            usedRelay: localType === "relay" || remoteType === "relay",
          });
          return;
        }
      } catch {
        return;
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  function micErrorMessage(e: any): string {
    const name = e && e.name;
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return "A permissão do microfone foi recusada. Ative-a nas definições do navegador para este site e tente novamente.";
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return "Não foi encontrado nenhum microfone neste dispositivo.";
    }
    if (name === "NotReadableError") {
      return "O microfone está a ser usado por outra aplicação neste momento.";
    }
    return "O navegador não conseguiu aceder ao microfone (" + (e?.message || name) + ").";
  }

  async function getMic(): Promise<MediaStream | null> {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (e) {
      setErrorMessage(micErrorMessage(e));
      setStatus("failed");
      return null;
    }
  }

  const cleanup = useCallback(() => {
    if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
    connectTimeoutRef.current = null;
    if (answerPollHandleRef.current) clearInterval(answerPollHandleRef.current);
    answerPollHandleRef.current = null;
    if (candidateResendHandleRef.current) clearInterval(candidateResendHandleRef.current);
    candidateResendHandleRef.current = null;
    answerAppliedRef.current = false;
    localCandidatesRef.current = [];
    appliedRemoteCandidatesRef.current = new Set();
    if (callChannelRef.current) {
      supabase.removeChannel(callChannelRef.current);
      callChannelRef.current = null;
    }
    if (iceChannelRef.current) {
      supabase.removeChannel(iceChannelRef.current);
      iceChannelRef.current = null;
    }
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch {}
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    setRemoteStream(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Canal de sinalização por WebSocket (Supabase Realtime Broadcast) só
  // para candidatos ICE — mensagens diretas entre os dois participantes,
  // sem passar pela base de dados. A oferta/resposta SDP continua a usar
  // a tabela `calls` (já comprovada fiável nos testes) porque só precisa
  // de ser entregue uma vez, ao contrário dos candidatos que podem ser
  // vários e chegar em qualquer ordem.
  function setupIceBroadcastChannel(
    callId: string,
    myRole: IceRole,
    onRemoteCandidate: (candidate: RTCIceCandidateInit) => void
  ) {
    const channel = supabase.channel("ice-broadcast-" + callId, { config: { broadcast: { self: false } } });
    channel
      .on("broadcast", { event: "ice-candidate" }, (payload) => {
        const msg = payload.payload as { role: IceRole; candidate: RTCIceCandidateInit };
        if (msg.role === myRole) return; // eco do próprio lado, ignorar
        const key = JSON.stringify(msg.candidate);
        if (appliedRemoteCandidatesRef.current.has(key)) return;
        appliedRemoteCandidatesRef.current.add(key);
        onRemoteCandidate(msg.candidate);
      })
      .subscribe();
    iceChannelRef.current = channel;

    function sendCandidate(candidate: RTCIceCandidateInit) {
      channel.send({ type: "broadcast", event: "ice-candidate", payload: { role: myRole, candidate } });
    }

    // Reenvia periodicamente os candidatos locais já gerados — cobre o
    // caso de o outro lado ainda não ter entrado no canal no momento do
    // primeiro envio (Broadcast só entrega a quem já está subscrito).
    candidateResendHandleRef.current = setInterval(() => {
      localCandidatesRef.current.forEach(sendCandidate);
    }, CANDIDATE_RESEND_INTERVAL_MS);

    return sendCandidate;
  }

  function attachConnectionWatchers(pc: RTCPeerConnection, callId: string, role: IceRole) {
    let disconnectGraceTimer: ReturnType<typeof setTimeout> | null = null;
    const DISCONNECT_GRACE_MS = 8000;

    pc.oniceconnectionstatechange = () => {
      logDiagnostic(callId, role, "ice_connection_state", { state: pc.iceConnectionState });
    };

    pc.onconnectionstatechange = () => {
      logDiagnostic(callId, role, "connection_state", { state: pc.connectionState });

      if (pc.connectionState === "connected") {
        if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
        if (disconnectGraceTimer) {
          clearTimeout(disconnectGraceTimer);
          disconnectGraceTimer = null;
        }
        setStatus("connected");
        logSelectedCandidateType(pc, callId, role);
      } else if (pc.connectionState === "disconnected") {
        // "disconnected" é muitas vezes temporário — redes móveis e
        // hotspots caem e voltam sozinhos em poucos segundos. Só se
        // não recuperar dentro deste prazo é que tratamos como falha
        // real.
        logDiagnostic(callId, role, "disconnected_grace_period_started", { graceMs: DISCONNECT_GRACE_MS });
        disconnectGraceTimer = setTimeout(() => {
          if (pc.connectionState === "disconnected") {
            setErrorMessage(
              "A ligação de áudio caiu e não recuperou. Isto costuma acontecer com hotspots móveis ou redes instáveis. Tente novamente."
            );
            setStatus("failed");
          }
        }, DISCONNECT_GRACE_MS);
      } else if (["failed", "closed"].includes(pc.connectionState)) {
        if (disconnectGraceTimer) {
          clearTimeout(disconnectGraceTimer);
          disconnectGraceTimer = null;
        }
        setErrorMessage(
          "Não foi possível estabelecer a ligação de áudio. Isto costuma acontecer quando as duas redes não conseguem falar diretamente uma com a outra. Tente novamente, idealmente com os dois em Wi-Fi."
        );
        setStatus("failed");
      }
    };

    connectTimeoutRef.current = setTimeout(() => {
      setStatus((current) => {
        if (current !== "connected") {
          logDiagnostic(callId, role, "connect_timeout", { afterMs: CONNECT_TIMEOUT_MS });
          setErrorMessage("A chamada demorou demasiado tempo a ligar. Verifique a rede e tente novamente.");
          return "failed";
        }
        return current;
      });
    }, CONNECT_TIMEOUT_MS);
  }

  // ---- Chamador ----
  const startCall = useCallback(
    async (params: { calleeId: string; sessionId?: string }) => {
      if (!myUserId) return null;
      const stream = await getMic();
      if (!stream) return null;
      localStreamRef.current = stream;
      setStatus("ringing");
      setErrorMessage(null);

      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      pc.ontrack = (ev) => setRemoteStream(ev.streams[0]);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const { data: row, error } = await supabase
        .from("calls")
        .insert({
          caller_id: myUserId,
          callee_id: params.calleeId,
          session_id: params.sessionId ?? null,
          offer,
          status: "ringing",
        })
        .select()
        .single();

      if (error || !row) {
        cleanup();
        setStatus("failed");
        setErrorMessage("Não foi possível iniciar a chamada. Tente novamente.");
        return null;
      }

      const confirmedCallId: string = row.id;

      const sendCandidate = setupIceBroadcastChannel(confirmedCallId, "caller", (candidate) => {
        pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      });

      pc.onicecandidate = (ev) => {
        if (!ev.candidate) {
          logDiagnostic(confirmedCallId, "caller", "ice_gathering_complete", {
            localCandidateCount: localCandidatesRef.current.length,
          });
          return;
        }
        const json = ev.candidate.toJSON();
        localCandidatesRef.current.push(json);
        sendCandidate(json);
      };

      async function applyAnswerIfPresent(updated: any, via: "realtime" | "polling") {
        if (answerAppliedRef.current) return;
        if (updated?.status === "rejected") {
          setStatus("ended");
          cleanup();
          return;
        }
        if (updated?.status === "ended" && updated.ended_by !== myUserId) {
          setStatus("ended");
          cleanup();
          return;
        }
        if (updated?.answer && pc.signalingState === "have-local-offer") {
          answerAppliedRef.current = true;
          logDiagnostic(confirmedCallId, "caller", "answer_applied", { via });
          await pc.setRemoteDescription(new RTCSessionDescription(updated.answer));
          setStatus("connecting");
        }
      }

      callChannelRef.current = supabase
        .channel("call-" + confirmedCallId)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "calls", filter: "id=eq." + confirmedCallId },
          (payload) => applyAnswerIfPresent(payload.new, "realtime")
        )
        .subscribe();

      // Rede de segurança: se o UPDATE com a resposta do Qari nunca
      // chegar por tempo real, vai buscá-la diretamente à base de dados.
      answerPollHandleRef.current = setInterval(async () => {
        if (answerAppliedRef.current) return;
        const { data } = await supabase.from("calls").select("*").eq("id", confirmedCallId).maybeSingle();
        if (data) await applyAnswerIfPresent(data, "polling");
      }, ANSWER_POLL_INTERVAL_MS);

      logDiagnostic(confirmedCallId, "caller", "call_started", {});
      attachConnectionWatchers(pc, confirmedCallId, "caller");
      return confirmedCallId;
    },
    [myUserId, cleanup]
  );

  // ---- Destinatário ----
  const acceptCall = useCallback(
    async (call: { id: string; offer: RTCSessionDescriptionInit }) => {
      const stream = await getMic();
      if (!stream) return false;
      localStreamRef.current = stream;
      setStatus("connecting");
      setErrorMessage(null);

      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      pc.ontrack = (ev) => setRemoteStream(ev.streams[0]);

      const sendCandidate = setupIceBroadcastChannel(call.id, "callee", (candidate) => {
        pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      });

      pc.onicecandidate = (ev) => {
        if (!ev.candidate) {
          logDiagnostic(call.id, "callee", "ice_gathering_complete", {
            localCandidateCount: localCandidatesRef.current.length,
          });
          return;
        }
        const json = ev.candidate.toJSON();
        localCandidatesRef.current.push(json);
        sendCandidate(json);
      };

      await pc.setRemoteDescription(new RTCSessionDescription(call.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      const { error: updateError } = await supabase
        .from("calls")
        .update({ answer, status: "accepted" })
        .eq("id", call.id);

      if (updateError) {
        logDiagnostic(call.id, "callee", "answer_write_failed", { message: updateError.message });
      } else {
        logDiagnostic(call.id, "callee", "answer_write_succeeded", {});
      }

      callChannelRef.current = supabase
        .channel("call-" + call.id)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "calls", filter: "id=eq." + call.id },
          (payload) => {
            const updated = payload.new as any;
            if (updated.status === "ended" && updated.ended_by !== myUserId) {
              setStatus("ended");
              cleanup();
            }
          }
        )
        .subscribe();

      logDiagnostic(call.id, "callee", "call_accepted", {});
      attachConnectionWatchers(pc, call.id, "callee");
      return true;
    },
    [myUserId, cleanup]
  );

  const endCall = useCallback(
    async (callId: string) => {
      if (myUserId) {
        await supabase
          .from("calls")
          .update({ status: "ended", ended_by: myUserId, ended_at: new Date().toISOString() })
          .eq("id", callId);
      }
      setStatus("ended");
      cleanup();
    },
    [myUserId, cleanup]
  );

  const rejectCall = useCallback(async (callId: string) => {
    await supabase.from("calls").update({ status: "rejected" }).eq("id", callId);
  }, []);

  return { status, remoteStream, errorMessage, startCall, acceptCall, endCall, rejectCall, cleanup };
}
