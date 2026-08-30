"use client";

import { useState } from "react";

type Scores = {
  recitation: number;
  tajwid: number;
  makharij: number;
  fluency: number;
};

function StarRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="mb-4">
      <label className="field-label !mt-0">{label}</label>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`text-xl leading-none ${n <= value ? "text-gold-500" : "text-[#d8d3c4]"}`}
            aria-label={`${n} estrelas`}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}

export default function FeedbackForm({
  onSubmit,
  submitting,
}: {
  submitting: boolean;
  onSubmit: (data: {
    scores: Scores;
    strengths: string;
    pointsToReview: string;
    recommendation: string;
  }) => void;
}) {
  const [scores, setScores] = useState<Scores>({ recitation: 0, tajwid: 0, makharij: 0, fluency: 0 });
  const [strengths, setStrengths] = useState("");
  const [pointsToReview, setPointsToReview] = useState("");
  const [recommendation, setRecommendation] = useState("");

  return (
    <div className="card">
      <div className="eyebrow">
        <span className="dot" /> Feedback da sessão
      </div>
      <h2 className="mb-4">Como correu a recitação?</h2>

      <StarRow label="Recitação" value={scores.recitation} onChange={(v) => setScores((s) => ({ ...s, recitation: v }))} />
      <StarRow label="Tajwid" value={scores.tajwid} onChange={(v) => setScores((s) => ({ ...s, tajwid: v }))} />
      <StarRow label="Makharij" value={scores.makharij} onChange={(v) => setScores((s) => ({ ...s, makharij: v }))} />
      <StarRow label="Fluência" value={scores.fluency} onChange={(v) => setScores((s) => ({ ...s, fluency: v }))} />

      <label className="field-label">Pontos fortes</label>
      <input className="input-field" value={strengths} onChange={(e) => setStrengths(e.target.value)} />

      <label className="field-label">Erros / pontos a rever</label>
      <input className="input-field" value={pointsToReview} onChange={(e) => setPointsToReview(e.target.value)} />

      <label className="field-label">Recomendação</label>
      <input className="input-field" value={recommendation} onChange={(e) => setRecommendation(e.target.value)} />

      <button
        className="btn btn-primary"
        disabled={submitting}
        onClick={() => onSubmit({ scores, strengths, pointsToReview, recommendation })}
      >
        {submitting ? "A guardar…" : "Guardar feedback"}
      </button>
    </div>
  );
}
