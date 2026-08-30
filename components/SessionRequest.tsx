"use client";

import { useState } from "react";
import type { QariListItem } from "./QariCard";

export default function SessionRequest({
  qari,
  submitting,
  onSubmit,
  onCancel,
}: {
  qari: QariListItem;
  submitting: boolean;
  onSubmit: (data: { surahNumber?: number; ayahStart?: number; ayahEnd?: number }) => void;
  onCancel: () => void;
}) {
  const [decideNow, setDecideNow] = useState(true);
  const [surah, setSurah] = useState("");
  const [ayahStart, setAyahStart] = useState("");
  const [ayahEnd, setAyahEnd] = useState("");

  function submit() {
    if (!decideNow) {
      onSubmit({});
      return;
    }
    onSubmit({
      surahNumber: surah ? parseInt(surah, 10) : undefined,
      ayahStart: ayahStart ? parseInt(ayahStart, 10) : undefined,
      ayahEnd: ayahEnd ? parseInt(ayahEnd, 10) : undefined,
    });
  }

  return (
    <div className="card">
      <div className="eyebrow">
        <span className="dot" /> Preparar sessão
      </div>
      <h2 className="text-[1.5rem] mb-2">Recitar com {qari.name}</h2>
      <p className="text-[#54544a] text-[0.9rem] mb-4">
        Escolha a Surah/Ayahs agora, ou indique que decide durante a chamada.
      </p>

      <div className="flex gap-2 mb-4">
        <button
          className={`flex-1 py-2 text-[0.82rem] border ${
            decideNow ? "bg-emerald-950 text-stone-50 border-emerald-950" : "border-gold-500/30 text-emerald-900"
          }`}
          onClick={() => setDecideNow(true)}
        >
          Escolher agora
        </button>
        <button
          className={`flex-1 py-2 text-[0.82rem] border ${
            !decideNow ? "bg-emerald-950 text-stone-50 border-emerald-950" : "border-gold-500/30 text-emerald-900"
          }`}
          onClick={() => setDecideNow(false)}
        >
          Decidir na sessão
        </button>
      </div>

      {decideNow && (
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="field-label">Surah (nº)</label>
            <input className="input-field" value={surah} onChange={(e) => setSurah(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Ayah início</label>
            <input className="input-field" value={ayahStart} onChange={(e) => setAyahStart(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Ayah fim</label>
            <input className="input-field" value={ayahEnd} onChange={(e) => setAyahEnd(e.target.value)} />
          </div>
        </div>
      )}

      <button className="btn btn-primary" disabled={submitting} onClick={submit}>
        {submitting ? "A enviar pedido…" : "Enviar pedido ao Qari"}
      </button>
      <button className="btn btn-ghost" onClick={onCancel}>
        Cancelar
      </button>
    </div>
  );
}
