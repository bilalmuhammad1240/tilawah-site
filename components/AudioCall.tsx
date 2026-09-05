"use client";

import { useEffect, useRef, useState } from "react";
import type { CallStatus } from "@/lib/webrtc/useDailyCall";

function initials(name: string) {
  return (name || "?").trim().slice(0, 1).toUpperCase();
}
function fmtTime(sec: number) {
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}
function fmtMoney(v: number) {
  return v.toFixed(2).replace(".", ",") + " MT";
}

type Props = {
  peerName: string;
  ratePerMinute: number;
  status: CallStatus;
  remoteStream: MediaStream | null;
  errorMessage: string | null;
  mode: "outgoing" | "incoming" | "in-call";
  onAccept?: () => void;
  onReject?: () => void;
  onCancel?: () => void;
  onEnd: (durationSeconds: number) => void;
};

export default function AudioCall({
  peerName,
  ratePerMinute,
  status,
  remoteStream,
  errorMessage,
  mode,
  onAccept,
  onReject,
  onCancel,
  onEnd,
}: Props) {
  const [seconds, setSeconds] = useState(0);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (audioRef.current && remoteStream) {
      audioRef.current.srcObject = remoteStream;
      // Alguns navegadores móveis bloqueiam o autoplay de áudio se a
      // ligação demorar a negociar (o "gesto do utilizador" que
      // autorizou o autoplay já expirou). Sem isto, o áudio falha em
      // silêncio — a pessoa não ouve nada e não há nenhum aviso.
      const playPromise = audioRef.current.play();
      if (playPromise) {
        playPromise.catch(() => setAudioBlocked(true));
      }
    }
  }, [remoteStream]);

  function retryPlay() {
    if (audioRef.current) {
      audioRef.current.play().then(
        () => setAudioBlocked(false),
        () => setAudioBlocked(true)
      );
    }
  }

  // Enquanto o som estiver bloqueado, qualquer toque no ecrã (não só no
  // botão) conta como gesto do utilizador para o navegador — por isso
  // aproveitamos o primeiro toque em qualquer lado para tentar destravar
  // sozinho, sem obrigar a pessoa a encontrar o botão certo.
  useEffect(() => {
    if (!audioBlocked) return;
    function onFirstTouch() {
      retryPlay();
    }
    document.addEventListener("pointerdown", onFirstTouch, { once: true });
    return () => document.removeEventListener("pointerdown", onFirstTouch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioBlocked]);

  useEffect(() => {
    if (status === "connected" && startRef.current === null) {
      startRef.current = Date.now();
      const interval = setInterval(() => {
        setSeconds(Math.floor((Date.now() - (startRef.current as number)) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [status]);

  if (status === "failed" && errorMessage) {
    return (
      <div className="card call-card call-surface">
        <h2 className="mb-2.5">Não foi possível ligar</h2>
        <p className="text-[#54544a] text-[0.9rem] mb-5">{errorMessage}</p>
        <button className="btn btn-primary" onClick={() => onEnd(seconds)}>
          Voltar
        </button>
      </div>
    );
  }

  if (mode === "incoming") {
    return (
      <div className="card call-card call-surface">
        <div className="avatar call-avatar">{initials(peerName)}</div>
        <div className="font-mono text-[0.78rem] uppercase tracking-[0.1em] text-maroon-600 mb-1.5">
          Chamada a receber
        </div>
        <h2>{peerName || "Alguém"}</h2>
        <p className="text-[#54544a] text-[0.9rem] mb-5">Quer recitar consigo agora, por voz.</p>
        <div className="flex gap-3">
          <button className="btn btn-danger !mt-0" onClick={onReject}>
            Recusar
          </button>
          <button className="btn btn-gold !mt-0" onClick={onAccept}>
            Atender
          </button>
        </div>
      </div>
    );
  }

  if (mode === "outgoing") {
    return (
      <div className="card call-card call-surface">
        <div className="avatar call-avatar">{initials(peerName)}</div>
        <div className="font-mono text-[0.78rem] uppercase tracking-[0.1em] text-maroon-600 mb-1.5">
          A chamar…
        </div>
        <h2>{peerName}</h2>
        <p className="text-[#54544a] text-[0.9rem] mb-5">
          {ratePerMinute > 0
            ? `Tarifa: ${fmtMoney(ratePerMinute)}/min · o relógio só começa quando atender`
            : "Chamada gratuita entre alunos"}
        </p>
        <button className="btn btn-danger" onClick={onCancel}>
          Cancelar chamada
        </button>
      </div>
    );
  }

  // in-call
  const statusOk = status === "connected";
  const cost = (seconds / 60) * ratePerMinute;
  return (
    <div className="card call-card call-surface">
      {audioBlocked && (
        <button
          onClick={retryPlay}
          type="button"
          className="w-full mb-4 py-3 px-4 bg-maroon-600 text-white text-[0.85rem] font-semibold animate-pulse text-center"
        >
          🔊 Sem som — toque aqui (ou em qualquer lado do ecrã) para ativar
        </button>
      )}
      <div className="avatar call-avatar">{initials(peerName)}</div>
      <div className={`font-mono text-[0.78rem] uppercase tracking-[0.1em] mb-1.5 ${statusOk ? "text-okgreen" : "text-maroon-600"}`}>
        {statusOk ? "Em chamada" : "A ligar áudio…"}
      </div>
      <h2>{peerName}</h2>
      <div className="font-mono call-timer text-emerald-950 my-4">{fmtTime(seconds)}</div>
      <div className="text-[0.88rem] text-[#54544a] mb-6">
        {ratePerMinute > 0 ? (
          <>
            <span className="call-cost">Custo acumulado: <b className="font-mono text-emerald-950">{fmtMoney(cost)}</b> · {fmtMoney(ratePerMinute)}/min</span>
          </>
        ) : (
          "Chamada gratuita entre alunos"
        )}
      </div>
      <button className="btn btn-danger" onClick={() => onEnd(seconds)}>
        Encerrar chamada
      </button>
      <audio ref={audioRef} autoPlay className="hidden" />
    </div>
  );
}
