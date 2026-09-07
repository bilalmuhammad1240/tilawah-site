"use client";

import { useEffect, useState } from "react";
import type { CallStatus } from "@/lib/webrtc/useAgoraCall";

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
  errorMessage: string | null;
  mode: "outgoing" | "incoming" | "in-call";
  isMuted?: boolean;
  onToggleMute?: () => void;
  audioBlocked?: boolean;
  onRetryAudio?: () => void;
  onAccept?: () => void;
  onReject?: () => void;
  onCancel?: () => void;
  onEnd: (durationSeconds: number) => void;
};

// A reprodução do áudio remoto já não é gerida aqui — é feita pela
// própria SDK da Agora (via track.play(), chamado no hook), que trata
// corretamente da integração com o cancelamento de eco. Este
// componente só mostra o aviso quando essa reprodução é bloqueada pela
// política de autoplay do browser.
export default function AudioCall({
  peerName,
  ratePerMinute,
  status,
  errorMessage,
  mode,
  isMuted,
  onToggleMute,
  audioBlocked,
  onRetryAudio,
  onAccept,
  onReject,
  onCancel,
  onEnd,
}: Props) {
  const [seconds, setSeconds] = useState(0);
  const [startTs, setStartTs] = useState<number | null>(null);

  // Enquanto o som estiver bloqueado, qualquer toque no ecrã (não só no
  // botão) conta como gesto do utilizador para o navegador — por isso
  // aproveitamos o primeiro toque em qualquer lado para tentar destravar
  // sozinho, sem obrigar a pessoa a encontrar o botão certo.
  useEffect(() => {
    if (!audioBlocked || !onRetryAudio) return;
    function onFirstTouch() {
      onRetryAudio!();
    }
    document.addEventListener("pointerdown", onFirstTouch, { once: true });
    return () => document.removeEventListener("pointerdown", onFirstTouch);
  }, [audioBlocked, onRetryAudio]);

  useEffect(() => {
    if (status === "connected" && startTs === null) {
      const now = Date.now();
      setStartTs(now);
      const interval = setInterval(() => {
        setSeconds(Math.floor((Date.now() - now) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          onClick={onRetryAudio}
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
      <div className="flex gap-3">
        {onToggleMute && (
          <button className={`btn !mt-0 ${isMuted ? "btn-gold" : "btn-ghost"}`} onClick={onToggleMute} type="button">
            {isMuted ? "🔇 Silenciado" : "🎙️ Silenciar"}
          </button>
        )}
        <button className="btn btn-danger !mt-0" onClick={() => onEnd(seconds)}>
          Encerrar chamada
        </button>
      </div>
    </div>
  );
}
