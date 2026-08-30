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

  function attachConnectionWatchers(pc: RTCPeerConnection, callId: string) {
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
        setStatus("connected");
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
      pc.onicecandidate = (ev) => {
        if (!ev.candidate) return;
        const json = ev.candidate.toJSON();
        if (callId) {
          supabase.from("ice_candidates").insert({ call_id: callId, role: "caller", candidate: json });
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

      callChannelRef.current = supabase
        .channel("call-" + confirmedCallId)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "calls", filter: "id=eq." + confirmedCallId },
          async (payload) => {
            const updated = payload.new as any;
            if (updated.status === "rejected") {
              setStatus("ended");
              cleanup();
              return;
            }
            if (updated.status === "ended" && updated.ended_by !== myUserId) {
              setStatus("ended");
              cleanup();
              return;
            }
            if (updated.answer && pc.signalingState === "have-local-offer") {
              await pc.setRemoteDescription(new RTCSessionDescription(updated.answer));
              setStatus("connecting");
            }
          }
        )
        .subscribe();

      iceChannelRef.current = supabase
        .channel("ice-" + confirmedCallId + "-caller")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "ice_candidates", filter: "call_id=eq." + confirmedCallId },
          (payload) => {
            const cand = payload.new as any;
            if (cand.role === "callee") {
              pc.addIceCandidate(new RTCIceCandidate(cand.candidate)).catch(() => {});
            }
          }
        )
        .subscribe();

      attachConnectionWatchers(pc, confirmedCallId);
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

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          supabase
            .from("ice_candidates")
            .insert({ call_id: call.id, role: "callee", candidate: ev.candidate.toJSON() });
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(call.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await supabase.from("calls").update({ answer, status: "accepted" }).eq("id", call.id);

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
            if (cand.role === "caller") {
              pc.addIceCandidate(new RTCIceCandidate(cand.candidate)).catch(() => {});
            }
          }
        )
        .subscribe();

      attachConnectionWatchers(pc, call.id);
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
