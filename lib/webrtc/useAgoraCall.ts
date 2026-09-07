"use client";

import { useCallback, useRef, useState } from "react";
import AgoraRTC, { IAgoraRTCClient, IMicrophoneAudioTrack } from "agora-rtc-sdk-ng";
import { createClient } from "@/lib/supabase/client";

export type CallStatus = "idle" | "ringing" | "connecting" | "connected" | "failed" | "ended";

const APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID as string;
const CONNECT_TIMEOUT_MS = 25000;

function randomUid() {
  return Math.floor(Math.random() * 1_000_000_000);
}

function randomChannelName() {
  return "tilawah-" + Math.random().toString(36).slice(2, 12);
}

async function fetchToken(channelName: string, uid: number): Promise<string | null> {
  try {
    const res = await fetch("/api/agora-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelName, uid }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.token ?? null;
  } catch {
    return null;
  }
}

// Sinalização, atravessamento de NAT/firewall (TURN interno da Agora)
// e reconexão de rede são todos tratados pelo SDK — este hook só faz a
// ponte entre isso e a tabela `calls` do Supabase, que continua a
// servir só para saber quem está a ligar a quem e em que estado
// (pedido, aceite, recusado, terminado), não para trocar media.
export function useAgoraCall(myUserId: string | null) {
  const supabase = createClient();
  const [status, setStatus] = useState<CallStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);

  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const micTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const remoteAudioTrackRef = useRef<any>(null);
  const callChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function logDiagnostic(callId: string, role: "caller" | "callee", event: string, detail: Record<string, any> = {}) {
    if (!myUserId) return;
    supabase.from("call_diagnostics").insert({ call_id: callId, user_id: myUserId, role, event, detail }).then(
      () => {},
      () => {}
    );
  }

  function joinErrorMessage(e: any): string {
    const raw = String(e?.message || e?.code || "");
    const lower = raw.toLowerCase();
    if (lower.includes("permission") || lower.includes("notallowed")) {
      return "A permissão do microfone foi recusada. Ative-a nas definições do navegador para este site e tente novamente.";
    }
    if (lower.includes("token") || lower.includes("invalid_params") || lower.includes("dynamic_key")) {
      return "Não foi possível autenticar a chamada (problema com a configuração da Agora no servidor). Avise o administrador da plataforma.";
    }
    return "Não foi possível entrar na chamada (" + (raw || "erro desconhecido") + ").";
  }

  const cleanup = useCallback(() => {
    if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
    connectTimeoutRef.current = null;
    if (callChannelRef.current) {
      supabase.removeChannel(callChannelRef.current);
      callChannelRef.current = null;
    }
    if (micTrackRef.current) {
      try {
        micTrackRef.current.close();
      } catch {}
      micTrackRef.current = null;
    }
    remoteAudioTrackRef.current = null;
    if (clientRef.current) {
      try {
        clientRef.current.leave();
      } catch {}
      clientRef.current = null;
    }
    setIsMuted(false);
    setAudioBlocked(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retryAudio = useCallback(() => {
    if (remoteAudioTrackRef.current) {
      try {
        remoteAudioTrackRef.current.play();
        setAudioBlocked(false);
      } catch {
        setAudioBlocked(true);
      }
    }
  }, []);

  const toggleMute = useCallback(async () => {
    if (!micTrackRef.current) return;
    const next = !isMuted;
    await micTrackRef.current.setMuted(next);
    setIsMuted(next);
  }, [isMuted]);

  async function joinChannel(channelName: string, callId: string, role: "caller" | "callee") {
    const uid = randomUid();
    const token = await fetchToken(channelName, uid);
    if (!token) {
      setErrorMessage("Não foi possível autenticar a chamada. Verifique a configuração da Agora no servidor.");
      setStatus("failed");
      return false;
    }

    const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
    clientRef.current = client;

    // A Agora gere o próprio elemento de áudio internamente quando se
    // chama track.play() — isto é o caminho oficial e é o que garante
    // que o cancelamento de eco do microfone sabe corretamente o que
    // está a ser reproduzido. Construir manualmente um <audio> a partir
    // do MediaStreamTrack (como fazíamos antes) contorna essa peça,
    // o que pode ter contribuído para o eco/som metálico reportado.
    AgoraRTC.onAudioAutoplayFailed = () => {
      setAudioBlocked(true);
    };

    client.on("user-published", async (user, mediaType) => {
      await client.subscribe(user, mediaType);
      if (mediaType === "audio" && user.audioTrack) {
        if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
        remoteAudioTrackRef.current = user.audioTrack;
        user.audioTrack.play();
        setStatus("connected");
        logDiagnostic(callId, role, "remote_audio_started", {});
      }
    });

    client.on("user-left", () => {
      logDiagnostic(callId, role, "remote_left", {});
      setStatus("ended");
      cleanup();
    });

    client.on("connection-state-change", (curState) => {
      logDiagnostic(callId, role, "connection_state", { state: curState });
    });

    try {
      await client.join(APP_ID, channelName, token, uid);
      const micTrack = await AgoraRTC.createMicrophoneAudioTrack({
        AEC: true, // cancelamento de eco acústico
        AGC: true, // controlo automático de ganho
        ANS: true, // supressão automática de ruído
        // Por omissão a Agora usa "music_standard" (32 Kbps) — baixo
        // demais para se perceber bem nuances de pronúncia (makharij).
        // "high_quality" sobe para 128 Kbps mono (~4x mais dados usados
        // por minuto, mas ainda assim muito mais leve que vídeo).
        encoderConfig: "high_quality",
      });
      micTrackRef.current = micTrack;
      await client.publish([micTrack]);
      logDiagnostic(callId, role, "joined_channel", { uid });
    } catch (e) {
      setErrorMessage(joinErrorMessage(e));
      setStatus("failed");
      return false;
    }

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

    return true;
  }

  // ---- Chamador ----
  const startCall = useCallback(
    async (params: { calleeId: string; sessionId?: string }) => {
      if (!myUserId) return null;
      setStatus("ringing");
      setErrorMessage(null);

      const channelName = randomChannelName();

      const { data: row, error } = await supabase
        .from("calls")
        .insert({
          caller_id: myUserId,
          callee_id: params.calleeId,
          session_id: params.sessionId ?? null,
          agora_channel_name: channelName,
          status: "ringing",
        })
        .select()
        .single();

      if (error || !row) {
        setStatus("failed");
        setErrorMessage("Não foi possível iniciar a chamada. Tente novamente.");
        return null;
      }

      const confirmedCallId: string = row.id;
      setStatus("connecting");
      const ok = await joinChannel(channelName, confirmedCallId, "caller");
      if (!ok) return null;

      // A app continua a usar `calls` só para saber quando o Qari
      // recusa ou termina — a ligação de áudio em si já não depende
      // desta tabela.
      callChannelRef.current = supabase
        .channel("call-" + confirmedCallId)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "calls", filter: "id=eq." + confirmedCallId },
          (payload) => {
            const updated = payload.new as any;
            if (updated.status === "rejected") {
              setStatus("ended");
              cleanup();
            } else if (updated.status === "ended" && updated.ended_by !== myUserId) {
              setStatus("ended");
              cleanup();
            }
          }
        )
        .subscribe();

      logDiagnostic(confirmedCallId, "caller", "call_started", {});
      return confirmedCallId;
    },
    [myUserId, cleanup]
  );

  // ---- Destinatário ----
  const acceptCall = useCallback(
    async (call: { id: string; agoraChannelName: string }) => {
      setStatus("connecting");
      setErrorMessage(null);

      const ok = await joinChannel(call.agoraChannelName, call.id, "callee");
      if (!ok) return false;

      await supabase.from("calls").update({ status: "accepted" }).eq("id", call.id);

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

  return {
    status,
    errorMessage,
    isMuted,
    toggleMute,
    audioBlocked,
    retryAudio,
    startCall,
    acceptCall,
    endCall,
    rejectCall,
    cleanup,
  };
}
