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
    <div className="login-card card">
      <section className="login-brand-panel">
        <div>
          <div className="t-brand" style={{ color: "#fffaf0" }}>
            <span className="t-brand-mark">ت</span><span>Tilawah</span>
          </div>
          <h1 className="mt-12 mb-5">A tua recitação,<br />ouvida com atenção.</h1>
          <p>Encontra Qaris disponíveis, pratica por voz e recebe orientação personalizada — quando tiveres tempo.</p>
        </div>
        <div className="login-note text-[0.72rem] tracking-wide uppercase opacity-60">Recitação · Tajwid · Acompanhamento</div>
      </section>

      <section className="login-form-panel">
        <div className="eyebrow"><span className="dot" /> {mode === "login" ? "Bem-vindo de volta" : "Começar no Tilawah"}</div>
        <h2 className="mb-2">{mode === "login" ? "Entrar na sua conta" : "Criar a sua conta"}</h2>
        <p className="text-[#6d756e] text-[0.86rem] leading-relaxed mb-5">
          {mode === "login" ? "Continue de onde ficou." : "Escolha como quer usar o Tilawah."}
        </p>

        {mode === "signup" && (
          <>
            <label className="field-label !mt-0">O seu nome</label>
            <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex.: Yusuf Rahman" />
            <label className="field-label">Entra como</label>
            <div className="flex gap-2.5">
              <button className={`flex-1 py-3 text-center border rounded-xl text-[0.82rem] ${role === "aluno" ? "bg-emerald-950 text-stone-50 border-emerald-950" : "border-gold-500/30 text-emerald-900 bg-stone-50"}`} onClick={() => setRole("aluno")} type="button">Aluno / Recitador</button>
              <button className={`flex-1 py-3 text-center border rounded-xl text-[0.82rem] ${role === "qari" ? "bg-emerald-950 text-stone-50 border-emerald-950" : "border-gold-500/30 text-emerald-900 bg-stone-50"}`} onClick={() => setRole("qari")} type="button">Qari / Professor</button>
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
        <input className="input-field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@email.com" />
        <label className="field-label">Palavra-passe</label>
        <input className="input-field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />

        <div className="err">{error}</div>
        <button className="btn btn-primary" disabled={loading} onClick={mode === "login" ? handleLogin : handleSignup}>
          {loading ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}
        </button>
        <button className="btn btn-ghost" type="button" onClick={() => { setError(""); setMode(mode === "login" ? "signup" : "login"); }}>
          {mode === "login" ? "Ainda não tenho conta" : "Já tenho conta"}
        </button>
      </section>
    </div>
  );
}
