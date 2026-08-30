# Tilawah — Next.js (V2)

Migração do protótipo HTML monolítico (`tilawah-index.html`) para a arquitetura
recomendada no plano (secção 9): Next.js (App Router) + Supabase + WebRTC como
módulo especializado.

## O que já está feito (Fases 0–5 do roadmap, versão inicial)

- **Fase 0 — Arquitetura**: estrutura `app/ components/ lib/ database/`, Tailwind
  configurado com a identidade visual já existente (verde profundo, dourado,
  tons de pedra, Newsreader/Work Sans/IBM Plex Mono).
- **Fase 1 — Auth e perfis**: login/signup real via Supabase Auth
  (`app/login`), tabela `profiles` com papéis `aluno / qari / admin`,
  RLS ativo.
- **Fase 2 — Qaris**: `qari_profiles`, `qari_presence`, listagem em
  `app/qaris` com presença em tempo real.
- **Fase 3 — Sessões**: `recitation_sessions`, pedido/aceitação/recusa em
  `app/session/[id]`.
- **Fase 4 — WebRTC**: `lib/webrtc/useWebRTCCall.ts` reaproveita a lógica
  já validada no protótipo (offer/answer, ICE buffering, STUN+TURN fallback,
  timeout de ligação, tratamento de falhas), agora ligada à tabela `calls`
  com RLS baseado em `auth.uid()`.
- **Fase 5 — Feedback**: `session_feedback` + `components/FeedbackForm.tsx`
  segundo os campos da secção 8 do plano.
- **Fase 6 — Dashboard**: `app/dashboard` com a ação principal "Recitar agora".

## O que falta (continuar pelo roadmap)

- **Fase 7 — Pagamentos**: `wallets`/`transactions` já existem no schema mas
  sem lógica de cobrança real; o custo em `endSession()` é apenas indicativo
  e **tem de ser recalculado no servidor** (Edge Function) antes de produção,
  conforme a secção 11.
- **Fase 8 — Admin**: `app/admin` é só um esqueleto.
- **Fase 9 — Testes**: testar em Android/Chrome, Wi-Fi↔dados móveis, duas
  redes móveis diferentes (secção 12).
- Confirmação de email no signup (o fluxo assume que pode estar desativada
  no projeto Supabase para o MVP; ajustar `app/login/page.tsx` se não).
- Substituir a pool TURN pública (Open Relay) por um serviço dedicado antes
  do lançamento.

## Como correr localmente

```bash
npm install
cp .env.local.example .env.local   # preencher com as chaves do projeto Supabase
```

No painel do Supabase (SQL Editor), correr `database/schema.sql` para criar
todas as tabelas e políticas RLS. Depois, em Database → Replication, ativar
Realtime nas tabelas `calls`, `ice_candidates`, `qari_presence` e
`recitation_sessions`.

```bash
npm run dev
```

Este ambiente de desenvolvimento não tem acesso à rede, por isso o
`npm install` e o `npm run dev` não foram corridos aqui — o projeto está
pronto para isso ser feito na sua máquina ou na Vercel.
