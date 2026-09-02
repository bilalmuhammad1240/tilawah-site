"use client";

import { useCallback, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// STUN sozinho só diz a cada lado o seu próprio endereço público — não
// ajuda quando não é possível estabelecer ligação direta (NAT simétrico,
// certas redes móveis, firewalls corporativas). O TURN faz o relay do
// áudio nesse caso. Estas credenciais do Open Relay Project são uma pool
// pública partilhada: gratuita, sem registo, mas sem garantias. Para
// produção, substituir por um serviço TURN dedicado (Metered, ExpressTURN,
// Xirsys), conforme a secção 12 do plano.
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
// Rede de segurança: já vimos o tempo real do Supabase falhar em
// entregar eventos (chamadas perdidas, e agora possivelmente a
// resposta SDP também). Isto verifica diretamente na base de dados,
// em paralelo à subscrição em tempo real, para nunca depender só do
// WebSocket para a parte crítica da ligação.
const POLL_INTERVAL_MS = 3000;

export type CallStatus = "idle" | "ringing" | "connecting" | "connected" | "failed" | "ended";

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
  const pollHandleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appliedCandidateIdsRef = useRef<Set<string>>(new Set());
  const answerAppliedRef = useRef(false);

  // Nunca regista áudio nem conteúdo — só metadados técnicos da ligação
  // (secção 12 do plano: "guardar eventos de conexão para diagnóstico,
  // sem gravar áudio por padrão"). Útil para perceber, depois de um
  // teste em redes diferentes, se a chamada usou ligação direta, STUN
  // ou teve de cair para o relay TURN.
  function logDiagnostic(callId: string, role: "caller" | "callee", event: string, detail: Record<string, any> = {}) {
    if (!myUserId) return;
    supabase.from("call_diagnostics").insert({ call_id: callId, user_id: myUserId, role, event, detail }).then(
      () => {},
      () => {}
    );
  }

  async function logSelectedCandidateType(pc: RTCPeerConnection, callId: string, role: "caller" | "callee") {
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
      logDiagnostic(callId, role, "candidate_pair_selected", {
        localType,
        remoteType,
        usedRelay: localType === "relay" || remoteType === "relay",
      });
    } catch {
      // getStats pode falhar em navegadores mais antigos — não é crítico
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
    if (pollHandleRef.current) clearInterval(pollHandleRef.current);
    pollHandleRef.current = null;
    appliedCandidateIdsRef.current = new Set();
    answerAppliedRef.current = false;
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

  function attachConnectionWatchers(pc: RTCPeerConnection, callId: string, role: "caller" | "callee") {
    pc.oniceconnectionstatechange = () => {
      logDiagnostic(callId, role, "ice_connection_state", { state: pc.iceConnectionState });
    };

    pc.onconnectionstatechange = () => {
      logDiagnostic(callId, role, "connection_state", { state: pc.connectionState });
      if (pc.connectionState === "connected") {
        if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
        setStatus("connected");
        logSelectedCandidateType(pc, callId, role);
      } else if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
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
          setErrorMessage(
            "A chamada demorou demasiado tempo a ligar. Verifique a rede e tente novamente."
          );
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

      let callId: string | null = null;
      const pending: RTCIceCandidateInit[] = [];
      let localCandidateCount = 0;
      pc.onicecandidate = (ev) => {
        if (!ev.candidate) {
          if (callId) logDiagnostic(callId, "caller", "ice_gathering_complete", { localCandidateCount });
          return;
        }
        localCandidateCount++;
        const json = ev.candidate.toJSON();
        if (callId) {
          supabase
            .from("ice_candidates")
            .insert({ call_id: callId, role: "caller", candidate: json })
            .then(({ error }) => {
              if (error) logDiagnostic(callId as string, "caller", "ice_insert_failed", { message: error.message });
            });
        } else {
          pending.push(json);
        }
      };

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

      callId = row.id;
      // `callId` acima fica com o tipo string|null aos olhos do TypeScript
      // a partir daqui, porque é capturado pelos closures abaixo (o
      // compilador não consegue provar que não é reatribuído entretanto).
      // `confirmedCallId` fixa o tipo string para o resto da função.
      const confirmedCallId: string = row.id;

      for (const cand of pending) {
        await supabase
          .from("ice_candidates")
          .insert({ call_id: confirmedCallId, role: "caller", candidate: cand });
      }

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

      iceChannelRef.current = supabase
        .channel("ice-" + confirmedCallId + "-caller")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "ice_candidates", filter: "call_id=eq." + confirmedCallId },
          (payload) => {
            const cand = payload.new as any;
            if (cand.role === "callee" && !appliedCandidateIdsRef.current.has(cand.id)) {
              appliedCandidateIdsRef.current.add(cand.id);
              pc.addIceCandidate(new RTCIceCandidate(cand.candidate)).catch(() => {});
            }
          }
        )
        .subscribe();

      // Rede de segurança: se o UPDATE com a resposta do Qari nunca
      // chegar por tempo real (já vimos isto falhar noutros eventos),
      // vai buscá-la diretamente à base de dados a cada poucos segundos.
      // O mesmo para candidatos ICE que possam ter ficado por entregar.
      pollHandleRef.current = setInterval(async () => {
        if (!answerAppliedRef.current) {
          const { data } = await supabase.from("calls").select("*").eq("id", confirmedCallId).maybeSingle();
          if (data) await applyAnswerIfPresent(data, "polling");
        }
        const { data: candidates, error: pollError } = await supabase
          .from("ice_candidates")
          .select("*")
          .eq("call_id", confirmedCallId)
          .eq("role", "callee");
        if (pollError) {
          logDiagnostic(confirmedCallId, "caller", "ice_poll_failed", { message: pollError.message });
        }
        (candidates ?? []).forEach((cand: any) => {
          if (!appliedCandidateIdsRef.current.has(cand.id)) {
            appliedCandidateIdsRef.current.add(cand.id);
            pc.addIceCandidate(new RTCIceCandidate(cand.candidate)).catch(() => {});
          }
        });
      }, POLL_INTERVAL_MS);

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

      let calleeLocalCandidateCount = 0;
      pc.onicecandidate = (ev) => {
        if (!ev.candidate) {
          logDiagnostic(call.id, "callee", "ice_gathering_complete", { localCandidateCount: calleeLocalCandidateCount });
          return;
        }
        calleeLocalCandidateCount++;
        supabase
          .from("ice_candidates")
          .insert({ call_id: call.id, role: "callee", candidate: ev.candidate.toJSON() })
          .then(({ error }) => {
            if (error) logDiagnostic(call.id, "callee", "ice_insert_failed", { message: error.message });
          });
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

      iceChannelRef.current = supabase
        .channel("ice-" + call.id + "-callee")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "ice_candidates", filter: "call_id=eq." + call.id },
          (payload) => {
            const cand = payload.new as any;
            if (cand.role === "caller" && !appliedCandidateIdsRef.current.has(cand.id)) {
              appliedCandidateIdsRef.current.add(cand.id);
              pc.addIceCandidate(new RTCIceCandidate(cand.candidate)).catch(() => {});
            }
          }
        )
        .subscribe();

      // Rede de segurança: candidatos ICE do chamador que o tempo real
      // não tenha entregue.
      pollHandleRef.current = setInterval(async () => {
        const { data: candidates, error: pollError } = await supabase
          .from("ice_candidates")
          .select("*")
          .eq("call_id", call.id)
          .eq("role", "caller");
        if (pollError) {
          logDiagnostic(call.id, "callee", "ice_poll_failed", { message: pollError.message });
        }
        (candidates ?? []).forEach((cand: any) => {
          if (!appliedCandidateIdsRef.current.has(cand.id)) {
            appliedCandidateIdsRef.current.add(cand.id);
            pc.addIceCandidate(new RTCIceCandidate(cand.candidate)).catch(() => {});
          }
        });
      }, POLL_INTERVAL_MS);

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
