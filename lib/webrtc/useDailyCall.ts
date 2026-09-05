"use client";

import { useCallback, useRef, useState } from "react";
import DailyIframe, { DailyCall } from "@daily-co/daily-js";
import { createClient } from "@/lib/supabase/client";

export type CallStatus = "idle" | "ringing" | "connecting" | "connected" | "failed" | "ended";

// Toda a sinalização, TURN/ICE e reconexão passam a ser tratados pelo
// SDK da Daily.co — este hook só faz a ponte entre isso e o resto da
// app (que continua a usar a tabela `calls` do Supabase só para saber
// quem está a ligar a quem e em que estado, não para trocar SDP).
export function useDailyCall(myUserId: string | null) {
  const supabase = createClient();
  const [status, setStatus] = useState<CallStatus>("idle");
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const callObjectRef = useRef<DailyCall | null>(null);
  const callChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function logDiagnostic(callId: string, role: "caller" | "callee", event: string, detail: Record<string, any> = {}) {
    if (!myUserId) return;
    supabase.from("call_diagnostics").insert({ call_id: callId, user_id: myUserId, role, event, detail }).then(
      () => {},
      () => {}
    );
  }

  function micErrorMessage(e: any): string {
    const name = e?.errorMsg || e?.name || "";
    if (String(name).toLowerCase().includes("permission")) {
      return "A permissão do microfone foi recusada. Ative-a nas definições do navegador para este site e tente novamente.";
    }
    return "O navegador não conseguiu aceder ao microfone (" + (e?.errorMsg || e?.message || name) + ").";
  }

  const cleanup = useCallback(() => {
    if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
    connectTimeoutRef.current = null;
    if (callChannelRef.current) {
      supabase.removeChannel(callChannelRef.current);
      callChannelRef.current = null;
    }
    if (callObjectRef.current) {
      try {
        callObjectRef.current.leave();
        callObjectRef.current.destroy();
      } catch {}
      callObjectRef.current = null;
    }
    setRemoteStream(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function attachDailyEvents(call: DailyCall, callId: string, role: "caller" | "callee") {
    call.on("joined-meeting", () => {
      logDiagnostic(callId, role, "joined_room", {});
    });

    call.on("track-started", (ev: any) => {
      if (ev?.participant && !ev.participant.local && ev.track?.kind === "audio") {
        if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
        setRemoteStream(new MediaStream([ev.track]));
        setStatus("connected");
        logDiagnostic(callId, role, "remote_audio_started", {});
      }
    });

    call.on("network-quality-change", (ev: any) => {
      logDiagnostic(callId, role, "network_quality", { quality: ev?.threshold });
    });

    call.on("participant-left", (ev: any) => {
      if (ev?.participant && !ev.participant.local) {
        logDiagnostic(callId, role, "remote_left", {});
        setStatus("ended");
        cleanup();
      }
    });

    call.on("error", (ev: any) => {
      logDiagnostic(callId, role, "daily_error", { message: ev?.errorMsg });
      setErrorMessage(
        "Não foi possível estabelecer a ligação de áudio. Verifique a rede e tente novamente. (" +
          (ev?.errorMsg || "erro desconhecido") +
          ")"
      );
      setStatus("failed");
    });

    connectTimeoutRef.current = setTimeout(() => {
      setStatus((current) => {
        if (current !== "connected") {
          logDiagnostic(callId, role, "connect_timeout", { afterMs: 25000 });
          setErrorMessage("A chamada demorou demasiado tempo a ligar. Verifique a rede e tente novamente.");
          return "failed";
        }
        return current;
      });
    }, 25000);
  }

  // ---- Chamador ----
  const startCall = useCallback(
    async (params: { calleeId: string; sessionId?: string }) => {
      if (!myUserId) return null;
      setStatus("ringing");
      setErrorMessage(null);

      const roomRes = await fetch("/api/daily-room", { method: "POST" });
      if (!roomRes.ok) {
        const body = await roomRes.json().catch(() => ({}));
        setStatus("failed");
        setErrorMessage(body?.error || "Não foi possível criar a sala de chamada. Tente novamente.");
        return null;
      }
      const room = await roomRes.json();

      const { data: row, error } = await supabase
        .from("calls")
        .insert({
          caller_id: myUserId,
          callee_id: params.calleeId,
          session_id: params.sessionId ?? null,
          daily_room_url: room.url,
          daily_room_name: room.name,
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

      const call = DailyIframe.createCallObject({ audioSource: true, videoSource: false });
      callObjectRef.current = call;
      attachDailyEvents(call, confirmedCallId, "caller");

      try {
        setStatus("connecting");
        await call.join({ url: room.url, startVideoOff: true });
      } catch (e) {
        setErrorMessage(micErrorMessage(e));
        setStatus("failed");
        return null;
      }

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
    async (call: { id: string; dailyRoomUrl: string }) => {
      setStatus("connecting");
      setErrorMessage(null);

      const dailyCall = DailyIframe.createCallObject({ audioSource: true, videoSource: false });
      callObjectRef.current = dailyCall;
      attachDailyEvents(dailyCall, call.id, "callee");

      try {
        await dailyCall.join({ url: call.dailyRoomUrl, startVideoOff: true });
      } catch (e) {
        setErrorMessage(micErrorMessage(e));
        setStatus("failed");
        return false;
      }

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

  return { status, remoteStream, errorMessage, startCall, acceptCall, endCall, rejectCall, cleanup };
}
