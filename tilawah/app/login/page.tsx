"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Role = "aluno" | "qari";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("aluno");
  const [rate, setRate] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignup() {
    if (!name.trim() || !email.trim() || !password) {
      setError("Preencha nome, email e palavra-passe.");
      return;
    }
    let parsedRate = 0;
    if (role === "qari") {
      parsedRate = parseFloat(rate.replace(",", "."));
      if (isNaN(parsedRate) || parsedRate < 0) {
        setError("Indique uma tarifa válida, ex.: 0.45");
        return;
      }
    }

    setLoading(true);
    setError("");

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name: name.trim(), role, rate: parsedRate },
      },
    });
    if (signUpError || !data.user) {
      setError(signUpError?.message || "Não foi possível criar a conta.");
      setLoading(false);
      return;
    }

    // O perfil (e qari_profiles/qari_presence, se aplicável) é criado
    // automaticamente no servidor por um trigger em auth.users — ver
    // database/schema.sql. Isto evita depender de uma sessão de cliente
    // que pode não existir ainda se a confirmação de email estiver ativa.

    setLoading(false);
    // Nota: se a confirmação de email estiver ativa no projeto Supabase,
    // data.session pode vir null aqui — nesse caso mostrar aviso para
    // confirmar o email antes de continuar, em vez de redirecionar.
    if (data.session) {
      router.push("/dashboard");
    } else {
      setError("Conta criada. Verifique o seu email para confirmar antes de entrar.");
    }
  }

  async function handleLogin() {
    if (!email.trim() || !password) {
      setError("Preencha email e palavra-passe.");
      return;
    }
    setLoading(true);
    setError("");
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      setError("Email ou palavra-passe incorretos.");
      return;
    }
    router.push("/dashboard");
  }

  return (
    <div className="card">
      <div className="eyebrow">
        <span className="dot" /> {mode === "login" ? "Entrar" : "Criar conta"}
      </div>
      <h1 className="text-[1.9rem] mb-2">Tilawah</h1>
      <p className="text-[#54544a] text-[0.92rem] leading-relaxed mb-6">
        Quando tiveres tempo, encontra alguém para ouvir a tua recitação.
      </p>

      {mode === "signup" && (
        <>
          <label className="field-label !mt-0">O seu nome</label>
          <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex.: Yusuf Rahman" />

          <label className="field-label">Entra como</label>
          <div className="flex gap-2.5">
            <button
              className={`flex-1 py-3 text-center border text-[0.85rem] ${
                role === "aluno" ? "bg-emerald-950 text-stone-50 border-emerald-950" : "border-gold-500/30 text-emerald-900 bg-stone-50"
              }`}
              onClick={() => setRole("aluno")}
              type="button"
            >
              Aluno / Recitador
            </button>
            <button
              className={`flex-1 py-3 text-center border text-[0.85rem] ${
                role === "qari" ? "bg-emerald-950 text-stone-50 border-emerald-950" : "border-gold-500/30 text-emerald-900 bg-stone-50"
              }`}
              onClick={() => setRole("qari")}
              type="button"
            >
              Qari / Professor
            </button>
          </div>

          {role === "qari" && (
            <>
              <label className="field-label">A sua tarifa por minuto (MT)</label>
              <input className="input-field" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="ex.: 0.45" />
            </>
          )}
        </>
      )}

      <label className="field-label !mt-0">Email</label>
      <input className="input-field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />

      <label className="field-label">Palavra-passe</label>
      <input className="input-field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />

      <div className="err">{error}</div>

      <button
        className="btn btn-primary"
        disabled={loading}
        onClick={mode === "login" ? handleLogin : handleSignup}
      >
        {loading ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}
      </button>

      <button
        className="btn btn-ghost"
        type="button"
        onClick={() => {
          setError("");
          setMode(mode === "login" ? "signup" : "login");
        }}
      >
        {mode === "login" ? "Ainda não tenho conta" : "Já tenho conta"}
      </button>
    </div>
  );
}
