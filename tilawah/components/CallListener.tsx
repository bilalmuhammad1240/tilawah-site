"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/lib/auth/useUser";

export default function CallListener() {
  const { profile } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  useEffect(() => {
    if (!profile) return;

    // Se já houver uma chamada a tocar quando a app abre (ex.: recarregou
    // a página com uma chamada pendente), apanha-a aqui — a subscrição
    // abaixo só vê chamadas criadas *depois* de subscrever.
    async function checkExistingRingingCall() {
      const { data } = await supabase
        .from("calls")
        .select("session_id")
        .eq("callee_id", profile!.id)
        .eq("status", "ringing")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.session_id && !pathname.startsWith(`/session/${data.session_id}`)) {
        router.push(`/session/${data.session_id}`);
      }
    }
    checkExistingRingingCall();

    // O telemóvel pode suspender a ligação em tempo real quando o ecrã
    // bloqueia ou o browser vai para segundo plano — isso faz perder o
    // evento de "chamada a chegar" nesse intervalo. Ao voltar a ficar
    // visível, verifica outra vez diretamente na base de dados (não
    // depende de o websocket ainda estar vivo).
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        checkExistingRingingCall();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    // Rede de segurança adicional: mesmo com o tempo real e o aviso de
    // mudança de visibilidade, um WebSocket pode cair sem disparar
    // nenhum dos dois eventos. Este intervalo garante que, no máximo,
    // uma chamada perdida é apanhada 10 segundos depois — em qualquer
    // página da app, não só na sala de espera.
    const pollHandle = setInterval(checkExistingRingingCall, 10000);

    const channel = supabase
      .channel("global-incoming-calls-" + profile.id)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "calls", filter: "callee_id=eq." + profile.id },
        (payload) => {
          const row = payload.new as any;
          if (row.status !== "ringing") return;
          if (row.session_id && !pathname.startsWith(`/session/${row.session_id}`)) {
            router.push(`/session/${row.session_id}`);
          }
        }
      )
      .subscribe();

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearInterval(pollHandle);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  return null;
}
