import { createBrowserClient } from "@supabase/ssr";

// Chave pública "anon": aceitável no cliente APENAS porque todas as tabelas
// sensíveis têm RLS ativo (ver database/schema.sql e plano secção 11).
// Nunca colocar aqui a service_role key.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
