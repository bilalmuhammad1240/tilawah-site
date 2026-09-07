"use client";

import { useState, useRef } from "react";
import AgoraRTC, { IAgoraRTCClient, IMicrophoneAudioTrack } from "agora-rtc-sdk-ng";

// Página de teste isolada — sem Supabase, sem sessões, sem lógica de
// negócio nenhuma. Só entra num canal fixo e fala. Serve só para
// isolar se o eco/som metálico é físico (hardware dos telemóveis,
// acontece aqui também) ou está mesmo ligado ao resto do código da
// Tilawah (não acontece aqui, mas acontece lá).
//
// Os dois telemóveis de teste devem abrir este ecrã e usar o MESMO
// texto no campo "Canal" (ex.: "teste123"), depois carregar em Entrar.

const APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID as string;

export default function TesteAudioPage() {
  const [channel, setChannel] = useState("teste123");
  const [joined, setJoined] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [muted, setMuted] = useState(false);

  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const micRef = useRef<IMicrophoneAudioTrack | null>(null);

  function addLog(msg: string) {
    setLog((cur) => [new Date().toLocaleTimeString() + " — " + msg, ...cur].slice(0, 20));
  }

  async function join() {
    addLog("A pedir token…");
    const uid = Math.floor(Math.random() * 1_000_000_000);
    const res = await fetch("/api/agora-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelName: channel, uid }),
    });
    const data = await res.json();
    if (!data.token) {
      addLog("ERRO a obter token: " + JSON.stringify(data));
      return;
    }
    addLog("Token obtido. A entrar no canal '" + channel + "' com uid " + uid);

    const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
    clientRef.current = client;

    AgoraRTC.onAudioAutoplayFailed = () => addLog("⚠️ Autoplay bloqueado — toque no ecrã.");

    client.on("user-published", async (user, mediaType) => {
      addLog("Outro utilizador publicou: " + mediaType + " (uid " + user.uid + ")");
      await client.subscribe(user, mediaType);
      if (mediaType === "audio" && user.audioTrack) {
        user.audioTrack.play();
        addLog("A tocar áudio remoto de uid " + user.uid);
      }
    });

    client.on("user-left", (user) => addLog("Utilizador saiu: uid " + user.uid));
    client.on("connection-state-change", (s) => addLog("Estado de ligação: " + s));

    await client.join(APP_ID, channel, data.token, uid);
    addLog("Entrou no canal.");

    const mic = await AgoraRTC.createMicrophoneAudioTrack({
      AEC: true,
      AGC: true,
      ANS: true,
      encoderConfig: "high_quality",
    });
    micRef.current = mic;
    await client.publish([mic]);
    addLog("Microfone publicado.");
    setJoined(true);
  }

  async function leave() {
    if (micRef.current) {
      micRef.current.close();
      micRef.current = null;
    }
    if (clientRef.current) {
      await clientRef.current.leave();
      clientRef.current = null;
    }
    setJoined(false);
    addLog("Saiu do canal.");
  }

  async function toggleMute() {
    if (!micRef.current) return;
    const next = !muted;
    await micRef.current.setMuted(next);
    setMuted(next);
    addLog(next ? "Microfone silenciado." : "Microfone ativado.");
  }

  return (
    <div className="card">
      <h2 className="mb-2">Teste isolado de áudio (Agora puro)</h2>
      <p className="hint !mt-0 mb-4">
        Sem Supabase, sem sessões — só Agora. Os dois telemóveis devem usar o mesmo nome de canal.
      </p>

      {!joined ? (
        <>
          <label className="field-label !mt-0">Nome do canal</label>
          <input className="input-field" value={channel} onChange={(e) => setChannel(e.target.value)} />
          <button className="btn btn-primary" onClick={join}>
            Entrar
          </button>
        </>
      ) : (
        <>
          <div className="text-center py-4">
            <div className="text-[0.9rem] text-emerald-950 font-semibold mb-3">
              Dentro do canal &quot;{channel}&quot;
            </div>
            <div className="flex gap-2 justify-center">
              <button className={`btn !mt-0 !w-auto px-4 ${muted ? "btn-gold" : "btn-ghost"}`} onClick={toggleMute}>
                {muted ? "🔇 Silenciado" : "🎙️ Silenciar"}
              </button>
              <button className="btn btn-danger !mt-0 !w-auto px-4" onClick={leave}>
                Sair
              </button>
            </div>
          </div>
        </>
      )}

      <div className="mt-6 pt-4 border-t border-gold-500/20">
        <div className="text-[0.72rem] uppercase tracking-wide text-[#8a8a7d] mb-2">Registo</div>
        <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
          {log.map((l, i) => (
            <div key={i} className="text-[0.72rem] font-mono text-[#54544a]">
              {l}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
