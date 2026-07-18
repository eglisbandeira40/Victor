# Fiado 🧾

Bot de WhatsApp para donos de mercadinho, padaria e bar controlarem quem deve o quê — sem app, sem planilha, sem caderno.

## Status do MVP

Implementado até agora:

- [x] Webhook do WhatsApp Business Cloud API (verificação + recebimento de mensagens)
- [x] Cadastro de dívida por linguagem natural ("Zé Carlos, 45,00, o almoço de hoje")
- [x] Criação automática de comerciante (na primeira mensagem) e cliente (na primeira dívida), com
      mensagem de boas-vindas explicando o básico só na primeira vez. O nome do comerciante é
      preenchido sozinho a partir do nome de exibição do WhatsApp (`contacts[].profile.name` do
      webhook) — sem precisar cadastrar nada; comerciante antigo sem nome é preenchido na próxima
      mensagem que mandar
- [x] Soma ao saldo existente do cliente quando ele já existe
- [x] Confirmação no tom de voz do Fiado, com saldo total atualizado
- [x] Cadastro/atualização de telefone do cliente ("cadastrar Zé Carlos, telefone 11987654321")
- [x] Reconhecimento de contato compartilhado do WhatsApp — o comerciante compartilha o cartão de
      contato do cliente direto na conversa, o Fiado lê nome+telefone e **pergunta antes de salvar**
      (evita salvar o telefone errado quando há homônimos na lista de contatos)
- [x] Baixa de pagamento ("Zé Carlos pagou 20,00")
- [x] Fechar conta ("fechar a conta do Zé Carlos") — pergunta em quantas vezes vai pagar (informativo;
      cada parcela é dada baixa normalmente com "Zé pagou X")
- [x] Excluir/arquivar conta antiga ("excluir a conta do Zé Carlos") — só libera depois de quitada;
      nada é apagado de verdade, só para de contar pro saldo atual, e o cliente fica pronto pra uma
      conta nova
- [x] Histórico de compras ("histórico do Zé Carlos") — lista as últimas dívidas e pagamentos em ordem,
      com o saldo atual no final
- [x] Alerta semanal de cobrança (job agendado) — lista clientes com 7+ dias de dívida em aberto e
      manda um link `wa.me` pronto por cliente, com a mensagem de cobrança já escrita; o comerciante
      revisa e decide se envia — nunca cobra automaticamente
- [x] Consulta de saldo — "quanto o Zé me deve?" (saldo de um cliente), "quem tá devendo mais de 100
      reais?" ou "quem tá devendo?" (lista geral, do maior devedor pro menor)
- [x] Resumo geral — "resumo da semana" ou "como está o caixa" (total em aberto, clientes devendo,
      recebido nos últimos 7 dias), sob demanda **e** proativo toda segunda de manhã
- [x] Extrato mensal — "extrato do mês" (quanto cada cliente pagou nesse mês e quanto ainda falta, com
      totais no final)
- [x] Lista de inadimplentes sob demanda — "quem está inadimplente?" (mesma lista com link `wa.me` de
      cobrança pronta do alerta semanal, mas disparada na hora, quando o comerciante quiser)
- [x] Cobrança de um cliente específico — "cobrar Zé Carlos" gera o link `wa.me` de cobrança pronto só
      pra esse cliente, sem precisar esperar ele entrar na lista de inadimplentes
- [x] Data de vencimento por dívida — "Zé Carlos, 45,00, almoço, vence dia 20" (ou "vence em 10
      dias", "vence sexta") salva o vencimento junto com a dívida
- [x] Lembrete diário de vencimento (job agendado, 8h) — no dia em que uma dívida vence, o Fiado avisa
      o comerciante com o valor e o link `wa.me` de cobrança pronto, uma única vez por dívida
- [x] Trial de 7 dias + bloqueio — comerciante novo ganha 7 dias grátis (`trial_ends_at`); depois disso,
      se ninguém tiver liberado o acesso (`plan = active`), o Fiado para de processar comandos e explica
      como continuar. Liberação hoje é manual, via `/internal/set-plan` (Pix fora do Fiado, você libera)
- [x] Menu admin (`ADMIN_WHATSAPP_PHONE`) — o dono do Fiado acompanha comerciantes novos, trials
      vencendo e o resumo geral direto pelo próprio WhatsApp, e recebe aviso automático de cada
      cadastro novo e de trial acabando
- [x] Corrigir valor do último lançamento — "errei, o certo do Zé Carlos é 30" ajusta o valor da
      dívida/pagamento mais recente desse cliente, sem precisar excluir e lançar de novo
- [x] Comando por voz (**desativado por padrão**, ver `OPENAI_API_KEY` em "Variáveis de ambiente") —
      manda um áudio, o Fiado transcreve (OpenAI), mostra o que entendeu e só executa depois de você
      confirmar com *sim*. Sem a key configurada, o bot avisa pra mandar por texto; preenchendo a key
      no ambiente e reiniciando o app, ativa sozinho, sem precisar mexer em código

Ainda não implementado (próximas fases, schema já preparado pra isso):
- [ ] Export CSV / endpoint de visualização de dados
- [ ] Visão de longo prazo: evoluir o Fiado de "controle de fiado" pra uma plataforma mais completa pro
      comerciante, incluindo controle de estoque (escopo ainda em aberto)

## Arquitetura

```
Cliente do comerciante              Comerciante (dono do mercadinho)
  (nunca fala com o bot)                    │ conversa no WhatsApp
                                             ▼
                              WhatsApp Business Cloud API (Meta)
                                             │ webhook POST /webhook
                                             ▼
                                Fiado Backend (Node + TS + Fastify)
                                   ├─ valida assinatura (X-Hub-Signature-256)
                                   ├─ idempotência (wa_message_id)
                                   ├─ resolve/cria merchant pelo telefone
                                   ├─ Claude (tool use) → extrai intenção/dados
                                   ├─ regra de negócio (customers/debts)
                                   └─ responde via Graph API (POST message)
                                             ▼
                                    PostgreSQL (Supabase)
```

Um único número de WhatsApp Business atende todos os comerciantes (multi-tenant). Cada comerciante
é identificado pelo próprio número de telefone (campo `from` do webhook).

### Por que Fastify + Drizzle + Supabase?

- **Fastify**: mais leve e rápido que Express, schema validation nativo, fácil de manter sozinho.
- **Drizzle ORM**: type-safe, sem "magia" de ORM pesado, migrations em SQL puro por baixo — bom pra
  quem vai manter o projeto sozinho e quer entender exatamente o que roda no banco.
- **Supabase (Postgres gerenciado)**: grátis pra começar, sem precisar operar banco.
- **Claude com tool use**: em vez de regex/NLP caseiro pra interpretar "Zé Carlos, 45,00, almoço",
  a IA extrai os campos estruturados (nome, valor, descrição) com uma única chamada de ferramenta.
  Modelo default é `claude-haiku-4-5` (rápido e barato) — dá pra trocar via `ANTHROPIC_MODEL`.

### Ajuste no modelo de dados

Em vez de marcar cada dívida como `aberto`/`pago` (o que exigiria decidir *qual* dívida um pagamento
está quitando), `debts` e `payments` funcionam como um livro-razão:

```
saldo_do_cliente = soma(debts.amount_cents) - soma(payments.amount_cents)
```

É assim que o caderninho de fiado funciona na prática: o dono não amarra um pagamento a uma venda
específica, só acompanha o total.

## Schema

Ver [`src/db/schema.ts`](./src/db/schema.ts) (Drizzle) e as migrations em [`src/db/migrations/`](./src/db/migrations/)
(SQL puro, prontas pra colar no console do banco).

- `merchants` — dono do comércio: `whatsapp_phone` (único), `business_name`, `plan`
  (`trial` | `active` | `lifetime` | `blocked` — `lifetime` nunca bloqueia e fica fora do cálculo de MRR/faturamento,
  mas conta na carteira de clientes), `trial_ends_at` (7 dias após o cadastro), `plan_activated_at`
  (quando virou pagante/vitalício pela última vez — carteira de clientes / faturamento), `pending_action`
  (jsonb; guarda uma pergunta em aberto do bot pro comerciante, ex: "quantas parcelas?")
- `merchant_members` — funcionário autorizado a lançar fiado na conta do comerciante: `merchant_id`, `phone`
  (único — não pode ser o mesmo número de outra conta própria nem de outro funcionário), `name`
- `customers` — cliente do comerciante: `name`, `phone`, `installments`, `balance_reset_at`
  (corte de "conta arquivada" — dívidas/pagamentos antes disso não contam mais pro saldo), `merchant_id`;
  único por `(merchant_id, lower(name))`
- `debts` — dívida: `customer_id`, `merchant_id`, `amount_cents`, `description`, `due_date` (opcional),
  `due_reminder_sent_at` (controla o lembrete diário pra não repetir), `created_by_phone` (quem lançou —
  dono ou funcionário), `created_at`
- `payments` — pagamento: `customer_id`, `merchant_id`, `amount_cents`, `note`, `created_by_phone`,
  `created_at`
- `processed_messages` — dedup de retries do webhook (`wa_message_id`)

## Endpoints

| Método | Rota                          | Descrição                                                          |
|--------|-------------------------------|----------------------------------------------------------------------|
| GET    | `/health`                     | Healthcheck                                                         |
| GET    | `/webhook`                    | Verificação do webhook do Meta (`hub.challenge`)                    |
| POST   | `/webhook`                    | Recebe mensagens do WhatsApp — o coração do sistema                 |
| POST   | `/internal/run-weekly-check`  | Dispara os jobs semanais (resumo + cobrança) na hora (`?token=WHATSAPP_VERIFY_TOKEN`), pra teste/depuração |
| POST   | `/internal/run-due-check`     | Dispara o lembrete diário de vencimento na hora (`?token=WHATSAPP_VERIFY_TOKEN`), pra teste/depuração |
| POST   | `/internal/run-admin-check`   | Dispara o alerta diário de trials vencendo pro admin na hora (`?token=WHATSAPP_VERIFY_TOKEN`), pra teste/depuração |
| GET    | `/internal/merchants`         | Lista todos os comerciantes com plano/trial em JSON (`?token=WHATSAPP_VERIFY_TOKEN`), consulta pontual fora do WhatsApp |
| POST   | `/internal/set-plan`          | Libera/bloqueia/marca vitalício um comerciante manualmente (`?token=...&phone=5511999998888&plan=trial\|active\|lifetime\|blocked`) |
| POST   | `/internal/send-message`      | Manda uma mensagem de texto avulsa pra um número (`?token=...&phone=5511999998888`, body JSON `{"text":"..."}`) |
| POST   | `/internal/ask-business-name` | Pergunta o nome pro comerciante e aguarda a resposta (`?token=...&phone=5511999998888`) — pra preencher quem ainda tá "(sem nome)" |

## Rodando localmente

```bash
cp .env.example .env   # preencha com suas credenciais
npm install
npm run dev
```

Para testar o webhook localmente, exponha a porta com ngrok/cloudflared e configure a URL pública
no painel do WhatsApp Business (Meta for Developers) como callback do webhook, usando o mesmo valor
de `WHATSAPP_VERIFY_TOKEN` do seu `.env`.

### Variáveis de ambiente

Ver [`.env.example`](./.env.example). Resumo:

- `DATABASE_URL` — connection string do Postgres (Supabase: Settings → Database → Connection string)
- `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN` — Meta for Developers → WhatsApp → API Setup
- `WHATSAPP_APP_SECRET` — opcional, mas recomendado em produção (valida a assinatura do webhook)
- `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` — console.anthropic.com
- `ADMIN_WHATSAPP_PHONE` — número do dono do Fiado (só dígitos, com código do país). Ver seção "Menu admin"
- `OPENAI_API_KEY` — opcional. Ativa o comando por voz (ver seção "Comando por voz"). Sem ela, áudio fica desativado

### Comando por voz

Desativado por padrão. Pra ativar: cria uma key em platform.openai.com/api-keys e preenche
`OPENAI_API_KEY` no ambiente — não precisa mudar nada no código, o recurso liga sozinho no próximo
restart do app (`isVoiceTranscriptionEnabled()` em [`src/ai/transcribe.ts`](./src/ai/transcribe.ts)).

Fluxo quando ativo:

1. Comerciante manda um áudio (nota de voz do WhatsApp)
2. [`downloadWhatsAppMedia`](./src/whatsapp/media.ts) baixa o arquivo via Graph API
3. [`transcribeAudio`](./src/ai/transcribe.ts) transcreve usando `gpt-4o-mini-transcribe` da OpenAI
   (custo ~R$0,015/minuto — irrelevante pro tamanho normal de um áudio de fiado)
4. O texto transcrito passa pelo mesmo `extractIntent()` usado pra mensagem digitada
5. O Fiado **não executa direto** — mostra a transcrição e o que entendeu, e pede confirmação
   (*sim*/*não*), reaproveitando o padrão de `pendingAction` já usado noutras confirmações
6. Só executa o comando depois do *sim*

Sem a key configurada, o Fiado responde a qualquer áudio pedindo pra mandar por texto, sem tentar
transcrever nada.

### Banco de dados

Rode as migrations de [`src/db/migrations/`](./src/db/migrations/), em ordem (`0001_init.sql` até
`0009_plan_activated_at.sql`, e o que vier depois), no console/SQL editor do seu Postgres. Assim que houver
uma `DATABASE_URL` acessível localmente, `npm run db:generate` / `npm run db:migrate` (drizzle-kit)
assumem esse papel a partir da próxima migration.

### Comandos que o comerciante pode mandar hoje

| Mensagem (exemplo)                                     | O que faz |
|----------------------------------------------------------|-----------|
| `Zé Carlos, 45,00, o almoço de hoje`                      | Registra dívida, soma ao saldo do cliente (aceita `2`, `45`, `45,00` ou `45.50`) |
| `Zé Carlos, 45,00, almoço, vence dia 20`                  | Igual acima, mas guarda a data de vencimento dessa dívida |
| `cadastrar Zé Carlos, telefone 11987654321`               | Cadastra/atualiza o telefone |
| `telefone do Zé Carlos, 11987654321`                      | Mesma coisa, forma curta |
| *(compartilhar um contato do WhatsApp)*                   | Fiado lê nome+telefone do cartão e pergunta antes de salvar |
| `Zé Carlos pagou 20,00`                                   | Dá baixa no pagamento |
| `errei, o certo do Zé Carlos é 30`                        | Corrige o valor do lançamento (dívida ou pagamento) mais recente desse cliente |
| `fechar a conta do Zé Carlos`                             | Pergunta em quantas vezes vai pagar (fica aguardando a resposta) |
| `excluir a conta do Zé Carlos`                            | Arquiva o histórico antigo (só depois de quitado) |
| `histórico do Zé Carlos`                                  | Lista as últimas dívidas/pagamentos dele e o saldo atual |
| `quanto o Zé Carlos me deve?`                              | Saldo desse cliente específico |
| `quem tá devendo mais de 100 reais?` / `quem tá devendo?`  | Lista geral de devedores, do maior pro menor |
| `resumo da semana` / `como está o caixa`                   | Total em aberto, clientes devendo, recebido nos últimos 7 dias |
| `extrato do mês` / `extrato mensal`                        | Quanto cada cliente pagou esse mês e quanto ainda falta, com totais |
| `quem está inadimplente?` / `clientes inadimplentes`       | Lista de inadimplentes (7+ dias) com link de cobrança pronto — igual ao alerta semanal, mas sob demanda |
| `cobrar Zé Carlos`                                         | Link de cobrança pronto só pra esse cliente (não precisa esperar entrar na lista de inadimplentes) |
| `meu funcionário Carlos vai lançar fiado também, número 11988887777` | Autoriza esse número a lançar fiado direto na conta do comerciante (ver seção "Funcionários autorizados") |
| `lançamentos do Carlos`                                    | Lista tudo que esse funcionário lançou (dívidas e pagamentos), em qualquer cliente, mais recente primeiro |
| `menu` / `ajuda` / `comandos` / `o que você faz`           | Abre o menu interativo (ver seção "Menu de ajuda") |

### Menu de ajuda

Pra quem não lembra o que dá pra pedir, `menu` (ou `ajuda`, `comandos`, `o que você faz`) dispara uma
**lista interativa nativa do WhatsApp** (`sendWhatsAppList` em [`src/whatsapp/client.ts`](./src/whatsapp/client.ts))
— um botão que abre um menu de toque, sem digitar nada. É diferente de mandar um texto explicativo: o
comerciante literalmente toca na opção.

- Nas **consultas** (quem tá devendo, resumo da semana, extrato do mês, inadimplentes), tocar já executa
  a ação na hora — mesmo código dos comandos por texto (`sendDebtorsList`, `sendWeeklySummary`,
  `sendMonthlyStatement`, `sendDefaultersList` em `messageHandler.ts`).
- Nas ações que **precisam de mais dados** (anotar dívida, registrar pagamento, cobrar cliente, autorizar
  funcionário, ver lançamentos de alguém), tocar mostra o exemplo de frase pra digitar — o Fiado continua
  100% baseado em linguagem natural, o menu é só uma porta de entrada pra quem não sabe por onde começar.

A resposta do toque chega no webhook como `type: "interactive"` com `interactive.list_reply.id` — ver
`handleMenuSelection` em `messageHandler.ts`.

### Funcionários autorizados

Um comerciante pode autorizar o número de WhatsApp de um funcionário a lançar fiado na mesma conta —
sem precisar de grupo (a API do WhatsApp Business não suporta bem automação em grupo pra esse caso de uso).
Cada funcionário manda mensagem individualmente, do próprio número, e o Fiado reconhece que ele está
autorizado e aplica tudo na conta do dono (mesmos clientes, mesmo saldo, mesmo trial/plano).

Limitações da v1 (de propósito, pra manter simples):
- Um número só pode ser funcionário de **uma** conta por vez.
- Um número que já tem conta própria no Fiado não pode virar funcionário de outra conta.
- Qualquer pessoa autorizada (dono ou funcionário) pode adicionar outro funcionário — não tem hierarquia
  de permissão ainda.
- Não tem comando pra remover funcionário ainda (fazer direto no banco, tabela `merchant_members`).

Toda dívida e pagamento guarda `created_by_phone` (o número de quem mandou a mensagem). Quando não é o
número do dono, a confirmação e o histórico (`histórico do Zé Carlos`) mostram *"lançado por Fulano"*
usando o nome salvo em `merchant_members`. Lançamentos antigos (antes dessa migration) não têm essa
informação e aparecem sem atribuição, como se fossem do dono.

## Fluxo implementado (cadastro de dívida)

1. Comerciante manda: `"Zé Carlos, 45,00, o almoço de hoje"`
2. Webhook recebe, valida assinatura, checa idempotência
3. Resolve (ou cria) o `merchant` pelo telefone de quem mandou a mensagem
4. Claude decide se é um registro de dívida e extrai `customer_name`, `amount`, `description`
   - Se não for um registro de dívida reconhecível, o bot responde pedindo o formato certo
5. Resolve (ou cria) o `customer` pelo nome, dentro do escopo do merchant
6. Insere a `debt`
7. Calcula o saldo total do cliente (soma de dívidas − soma de pagamentos)
8. Responde: `"Anotado ✅ Zé Carlos deve R$ 45,00 (almoço de hoje). No total Zé te deve R$ 45,00"`

## Contato compartilhado

O WhatsApp Business Cloud API não dá acesso à agenda de contatos do comerciante (não existe essa permissão
na API oficial da Meta) — mas o comerciante pode **compartilhar o cartão de contato** de um cliente direto
na conversa (anexo → Contato). O Fiado reconhece mensagens do tipo `contacts`, lê nome e telefone do cartão,
tenta casar com um cliente já cadastrado pelo nome e **sempre pergunta antes de salvar**:

```
📇 Peguei o contato: Zé Carlos — +5511987654321
É o telefone do seu cliente Zé Carlos? Responde sim pra eu salvar.
```

Essa confirmação existe de propósito: o comerciante pode ter mais de um contato com nome parecido na
agenda pessoal, e a confirmação evita salvar o telefone errado num cliente do Fiado.

## Menu admin

O número definido em `ADMIN_WHATSAPP_PHONE` tem um fluxo completamente separado do fluxo de
comerciante — não passa por trial, plano nem cria registro em `merchants`. Qualquer mensagem vinda
desse número abre o menu admin (`sendAdminMenu` em [`src/handlers/adminHandler.ts`](./src/handlers/adminHandler.ts)):

- **Novos comerciantes** — cadastrados nos últimos 7 dias
- **Trials vencendo** — vencem nos próximos 2 dias
- **Todos os comerciantes** — lista completa, com plano e desde quando
- **Resumo geral** — quantos em trial, ativo e bloqueado
- **Carteira de clientes** — comerciantes pagantes (plano ativo) e desde quando pagam
- **Faturamento do mês** — MRR (ativos × R$29,90) e quantos viraram pagantes nesse mês

O faturamento é calculado em cima do plano único e fixo (não tem controle de pagamento avulso — o Pix
acontece fora do Fiado, e `/internal/set-plan` grava `plan_activated_at` quando alguém vira `active`).
"Novos pagantes esse mês" conta quem tem `plan_activated_at` dentro do mês calendário atual.

Além do menu sob demanda, o admin recebe dois avisos automáticos:

1. **Comerciante novo** — assim que alguém manda a primeira mensagem pro Fiado (`notifyAdminOfNewMerchant`)
2. **Trials vencendo** — todo dia às 8h, junto do lembrete de vencimento, se houver algum trial
   vencendo nos próximos 2 dias ([`adminTrialAlertJob.ts`](./src/jobs/adminTrialAlertJob.ts))

Pra consulta pontual fora do WhatsApp (ex: script, planilha), tem o endpoint
`GET /internal/merchants?token=...` retornando a mesma lista em JSON.

## Jobs agendados

Ver [`src/jobs/scheduler.ts`](./src/jobs/scheduler.ts). Dois horários, sempre em `America/Sao_Paulo`:

**Todo dia às 8h** — [`dueDateReminderJob.ts`](./src/jobs/dueDateReminderJob.ts): varre as dívidas cujo
`due_date` é hoje e ainda não tiveram lembrete enviado, e avisa o comerciante com o link `wa.me` de
cobrança pronto (uma única vez por dívida, controlado por `due_reminder_sent_at`). Só vale pra dívidas
que tiveram data de vencimento informada na hora do cadastro — sem isso, não tem o que lembrar.
Teste manual: `POST /internal/run-due-check?token=SEU_WHATSAPP_VERIFY_TOKEN`.

**Toda segunda às 9h** — dois jobs em sequência pra cada merchant:

1. **Resumo geral** ([`weeklySummaryJob.ts`](./src/jobs/weeklySummaryJob.ts)) — manda sempre, pra todo
   mundo, o mesmo resumo que "resumo da semana" mostra sob demanda (total em aberto, clientes devendo,
   recebido nos últimos 7 dias)
2. **Alerta de cobrança** ([`weeklyCollectionReminder.ts`](./src/jobs/weeklyCollectionReminder.ts)) — só
   manda se houver cliente com dívida em aberto há mais de `OVERDUE_THRESHOLD_DAYS` (7 dias), independente
   de ter data de vencimento marcada ou não

Teste manual: `POST /internal/run-weekly-check?token=SEU_WHATSAPP_VERIFY_TOKEN` dispara os dois jobs
semanais na hora.

## Mensagens proativas (Message Templates)

Os 3 jobs acima mandam mensagem **iniciada pela empresa** (o comerciante não escreveu nada antes). O
WhatsApp só permite isso com texto livre se o comerciante mandou alguma mensagem pro Fiado nas últimas
24h — fora dessa janela, a mensagem é **rejeitada** a menos que seja um **Message Template aprovado**
pela Meta.

Pra não quebrar nada, o código tenta usar o template configurado e, se a variável de ambiente
correspondente estiver vazia, cai pro texto livre (funciona em teste, mas vai falhar em produção fora
da janela de 24h). Ver [`sendProactiveMessage`](./src/whatsapp/client.ts).

### Como criar os templates na Meta

Business Manager → **WhatsApp Manager → Message Templates → Create Template**. Categoria **Utility**
(são avisos de conta/serviço, não marketing) e idioma **Portuguese (BR)**. Depois de aprovado (geralmente
minutos a poucas horas), coloca o nome exato do template nas variáveis de ambiente correspondentes.

Os 3 templates abaixo já foram submetidos via API (`POST /message_templates`) e estão com assinatura
padronizada "— Fiado 🧾" no final — a Meta não deixa variável `{{n}}` no início nem no fim do texto, e
exige uma proporção mínima de texto por variável (por isso o `due_reminder` tem mais texto ao redor).

**`fiado_weekly_summary`** → `WHATSAPP_TEMPLATE_WEEKLY_SUMMARY`
```
📊 Resumo do Fiado

Total em aberto: {{1}}
Clientes devendo: {{2}}
Recebido essa semana: {{3}}

— Fiado 🧾
```

**`fiado_collection_alert`** → `WHATSAPP_TEMPLATE_COLLECTION_ALERT`
```
📋 Clientes inadimplentes

{{1}}

Total parado: {{2}}

— Fiado 🧾
```

**`fiado_due_reminder`** → `WHATSAPP_TEMPLATE_DUE_REMINDER`
```
🔔 Lembrete de vencimento

A dívida de {{1}} vence hoje, no valor de {{2}}.
Link pronto pra cobrar: {{3}}

— Fiado 🧾
```

Nos exemplos de teste que a Meta pede na hora de criar o template, pode usar valores fictícios (ex:
"R$ 150,00", "3", "R$ 45,00") — o conteúdo real varia a cada envio, isso é normal e esperado pra
template com variáveis.

### Alerta de cobrança

Calcula quais clientes têm saldo em aberto com a dívida mais antiga passando do prazo. Se houver algum,
manda pro comerciante um resumo assim:

```
📋 Cobranças da semana

Esses clientes estão devendo há mais de 7 dias:

1) Zé Carlos — R$ 45,00 (9 dias)
👉 https://wa.me/5511987654321?text=Oi%20Ze...

2) Maria Souza — R$ 120,00 (15 dias)
❓ Sem telefone salvo. Manda assim: telefone da Maria Souza, DDD e número

Total parado: R$ 165,00 com 2 cliente(s)
```

Cada link `wa.me` já abre o WhatsApp do cliente com a mensagem de cobrança pronta — o comerciante só
revisa e aperta enviar. O Fiado **nunca manda a cobrança direto pro cliente final**; isso evita precisar
de número de destinatário aprovado ou mensagem-template paga, e mantém o comerciante no controle.

Pra clientes sem telefone salvo, o comerciante ensina com `telefone do Zé Carlos, 11987654321`.

## Deploy

Qualquer um destes serve bem para o MVP (barato, deploy simples a partir do `Dockerfile`):
Railway, Render ou Fly.io. Configure as mesmas variáveis de ambiente do `.env.example` no painel
do provedor escolhido.
