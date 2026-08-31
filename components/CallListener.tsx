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
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  return null;
}
