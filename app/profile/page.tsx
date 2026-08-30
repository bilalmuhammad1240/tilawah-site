"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/lib/auth/useUser";
import { createClient } from "@/lib/supabase/client";
import Navigation from "@/components/Navigation";

export default function ProfilePage() {
  const { profile, loading } = useUser();
  const supabase = createClient();

  const [rate, setRate] = useState("");
  const [specialties, setSpecialties] = useState("");
  const [isAvailable, setIsAvailable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!profile || profile.role !== "qari") return;
    supabase
      .from("qari_profiles")
      .select("rate_per_minute, specialties")
      .eq("id", profile.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setRate(String(data.rate_per_minute));
          setSpecialties((data.specialties ?? []).join(", "));
        }
      });
    supabase
      .from("qari_presence")
      .select("is_available")
      .eq("qari_id", profile.id)
      .single()
      .then(({ data }) => setIsAvailable(!!data?.is_available));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  async function save() {
    if (!profile) return;
    setSaving(true);
    const parsedRate = parseFloat(rate.replace(",", "."));
    await supabase
      .from("qari_profiles")
      .update({
        rate_per_minute: isNaN(parsedRate) ? 0 : parsedRate,
        specialties: specialties.split(",").map((s) => s.trim()).filter(Boolean),
      })
      .eq("id", profile.id);
    await supabase
      .from("qari_presence")
      .upsert({ qari_id: profile.id, is_available: isAvailable, last_seen: new Date().toISOString() });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading) return <div className="card text-center text-[#8a8a7d]">A carregar…</div>;
  if (!profile) return null;

  return (
    <div className="card">
      <Navigation profile={profile} />
      <h2 className="mb-4">O seu perfil</h2>

      <label className="field-label !mt-0">Nome</label>
      <div className="text-[0.95rem] text-emerald-950 font-semibold">{profile.name}</div>

      {profile.role === "qari" && (
        <>
          <label className="field-label">Disponibilidade</label>
          <button
            className={`btn !mt-0 ${isAvailable ? "btn-gold" : "btn-ghost"}`}
            onClick={() => setIsAvailable((v) => !v)}
            type="button"
          >
            {isAvailable ? "Disponível agora" : "Indisponível"}
          </button>

          <label className="field-label">Tarifa por minuto (€)</label>
          <input className="input-field" value={rate} onChange={(e) => setRate(e.target.value)} />

          <label className="field-label">Especialidades (separadas por vírgula)</label>
          <input
            className="input-field"
            value={specialties}
            onChange={(e) => setSpecialties(e.target.value)}
            placeholder="Tajwid, Hifdh, Recitação"
          />

          <button className="btn btn-primary" disabled={saving} onClick={save}>
            {saving ? "A guardar…" : saved ? "Guardado ✓" : "Guardar alterações"}
          </button>
        </>
      )}
    </div>
  );
}
