# Tilawah — pacote combinado (baseline + fase 7 + fase 8 + fase 9)

## Ordem de merge aplicada

baseline → fase7 → fase8 → fase9. Para cada caminho, usei a versão da fase
mais avançada que o tocava (confirmei por diff que cada fase é um superset
puro da anterior nos ficheiros partilhados — sem conflitos a resolver
manualmente).

| Ficheiro                              | Versão usada | Motivo |
|----------------------------------------|--------------|--------|
| `database/schema.sql`                  | fase9        | Superset completo (baseline+7+8+9) |
| `app/admin/page.tsx`                   | fase9        | Superset da fase8 (acrescenta aba Diagnóstico) |
| `lib/webrtc/useWebRTCCall.ts`          | fase9        | Só existe na fase9 |
| `app/history/page.tsx`                 | fase8        | Acrescenta denúncias; a fase9 não voltou a tocar neste ficheiro |
| `components/AudioCall.tsx`             | fase7        | Só existe na fase7 |
| `components/PaymentInstructions.tsx`   | fase7        | Só existe na fase7 |
| `components/SessionRequest.tsx`        | fase7        | Só existe na fase7 |
| `components/QariCard.tsx`              | fase7        | Superset do baseline (MT em vez de €, botão "Ligar agora") |
| `app/qaris/page.tsx`                   | fase7        | Superset do baseline (fluxo de pagamento) |
| `app/profile/page.tsx`, `app/login/page.tsx`, `app/session/[id]/page.tsx` | fase7 | Só existem na fase7 |
| `lib/sessions/api.ts`, `lib/payments/constants.ts` | fase7 | Só existem na fase7 |
| `components/Navigation.tsx`, `components/NotificationBell.tsx`, `app/globals.css`, `app/layout.tsx` | baseline | Nenhuma fase posterior os alterou |

## Não incluído neste pacote (referenciado mas não fornecido em nenhum dos 4 zips)

Estes ficheiros são importados pelo código acima mas não vieram em nenhum dos
zips analisados — presumo que já existem no resto do teu projeto:

- `components/CallListener.tsx`
- `components/FeedbackForm.tsx`
- `lib/auth/useUser.ts`
- `lib/notifications/api.ts`
- `lib/supabase/client.ts`

Se algum destes também tiver mudado numa das fases, envia-o à parte para eu
incluir na mesma lógica de merge.

## Passo extra: correção do "design apertado" no Admin

Depois do merge, reescrevi `app/admin/page.tsx` e ajustei `app/globals.css`
para resolver o motivo técnico do aperto: a página reutilizava a classe
`.card`, que tem `max-w-[480px]` — pensada para os ecrãs de formulário
(login, pagamento), não para tabelas/dashboards.

O que mudou:
- Nova classe `.shell` / `.shell-panel` em `globals.css`: contentor largo
  (até 1180px) só para o Admin, sem tocar no `.card` usado pelos outros
  ecrãs (login, qaris, pagamento continuam iguais, de propósito).
- Tira de KPIs no topo (Utilizadores, Qaris, Sessões, Denúncias por rever),
  calculada a partir dos dados já carregados — sem pedir nada novo ao Supabase.
- Separadores (tabs) viraram pills com mais respiro, em vez de botões
  quadrados coladas.
- Linhas de Utilizadores/Sessões/Denúncias com mais padding (`.row`),
  avatar circular nos utilizadores, e estado/papel como badges coloridas
  em vez de texto maiúsculo.
- Diagnóstico: o JSON técnico de cada evento ficou atrás de um
  "Mostrar detalhes técnicos" (`<details>`), e cada chamada mostra logo
  um badge "Via TURN (relay)" / "Ligação direta/STUN" com base no evento
  `candidate_pair_selected` que já existia — não inventei métricas de
  latência/perda de pacotes que não estão na base de dados.
- Border-radius subtil (`rounded-[10px]`/`rounded-2xl`) em `.btn`,
  `.input-field` e `.card`, aplicado globalmente — afeta também os
  formulários, de forma consistente com a identidade existente.

Não fiz a sidebar lateral nem o redesign de Aluno/Qari/Chamada sugeridos
na análise visual anterior — isso é uma mudança de arquitetura maior
(routing, layout global) e ainda não tenho o código dessas páginas.

## Pontos em aberto identificados durante a análise (não corrigidos aqui — juntar apenas os ficheiros foi o que pediste)

1. `total_cost`/`duration_seconds` em `lib/sessions/api.ts` (`endSession`) continuam calculados e escritos pelo cliente — sem validação no servidor.
2. `useWebRTCCall.ts` não expõe `toggleMic()`/estado de mute.
3. `reports` não tem coluna de prioridade/severidade.
4. TURN via Open Relay Project (público, sem SLA) — trocar antes de produção.
