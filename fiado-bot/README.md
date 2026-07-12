# Fiado 🧾

Bot de WhatsApp para donos de mercadinho, padaria e bar controlarem quem deve o quê — sem app, sem planilha, sem caderno.

## Status do MVP

Implementado até agora:

- [x] Webhook do WhatsApp Business Cloud API (verificação + recebimento de mensagens)
- [x] Cadastro de dívida por linguagem natural ("Zé Carlos, 45 reais, o almoço de hoje")
- [x] Criação automática de comerciante (na primeira mensagem) e cliente (na primeira dívida)
- [x] Soma ao saldo existente do cliente quando ele já existe
- [x] Confirmação no tom de voz do Fiado, com saldo total atualizado
- [x] Cadastro de telefone do cliente ("telefone do Zé Carlos, 11987654321")
- [x] Alerta semanal de cobrança (job agendado) — lista clientes com 7+ dias de dívida em aberto e
      manda um link `wa.me` pronto por cliente, com a mensagem de cobrança já escrita; o comerciante
      revisa e decide se envia — nunca cobra automaticamente

Ainda não implementado (próximas fases, schema já preparado pra isso):
- [ ] Consulta de saldo ("Quanto o Zé me deve?", "Quem tá devendo mais de 100?", "Resumo da semana")
- [ ] Baixa de pagamento ("Zé pagou 20 reais")
- [ ] Resumo semanal proativo (total em aberto, quantos clientes devendo, quanto foi recebido)
- [ ] Export CSV / endpoint de visualização de dados

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
- **Claude com tool use**: em vez de regex/NLP caseiro pra interpretar "Zé Carlos, 45 reais, almoço",
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

Ver [`src/db/schema.ts`](./src/db/schema.ts) (Drizzle) e [`src/db/migrations/0001_init.sql`](./src/db/migrations/0001_init.sql) (SQL puro, pronto pra colar no SQL editor do Supabase).

- `merchants` — dono do comércio: `whatsapp_phone` (único), `business_name`, `plan`
- `customers` — cliente do comerciante: `name`, `phone` opcional, `merchant_id`; único por `(merchant_id, lower(name))`
- `debts` — dívida: `customer_id`, `merchant_id`, `amount_cents`, `description`, `created_at`
- `payments` — pagamento: `customer_id`, `merchant_id`, `amount_cents`, `note`, `created_at`
- `processed_messages` — dedup de retries do webhook (`wa_message_id`)

## Endpoints

| Método | Rota                          | Descrição                                                          |
|--------|-------------------------------|----------------------------------------------------------------------|
| GET    | `/health`                     | Healthcheck                                                         |
| GET    | `/webhook`                    | Verificação do webhook do Meta (`hub.challenge`)                    |
| POST   | `/webhook`                    | Recebe mensagens do WhatsApp — o coração do sistema                 |
| POST   | `/internal/run-weekly-check`  | Dispara o job semanal de cobrança na hora (`?token=WHATSAPP_VERIFY_TOKEN`), pra teste/depuração |

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

### Banco de dados

Rode o SQL de [`src/db/migrations/0001_init.sql`](./src/db/migrations/0001_init.sql) no SQL editor
do Supabase. Assim que houver uma `DATABASE_URL` acessível localmente, `npm run db:generate` /
`npm run db:migrate` (drizzle-kit) assumem esse papel a partir da próxima migration.

## Fluxo implementado (cadastro de dívida)

1. Comerciante manda: `"Zé Carlos, 45 reais, o almoço de hoje"`
2. Webhook recebe, valida assinatura, checa idempotência
3. Resolve (ou cria) o `merchant` pelo telefone de quem mandou a mensagem
4. Claude decide se é um registro de dívida e extrai `customer_name`, `amount`, `description`
   - Se não for um registro de dívida reconhecível, o bot responde pedindo o formato certo
5. Resolve (ou cria) o `customer` pelo nome, dentro do escopo do merchant
6. Insere a `debt`
7. Calcula o saldo total do cliente (soma de dívidas − soma de pagamentos)
8. Responde: `"Anotado ✅ Zé Carlos deve R$ 45,00 (almoço de hoje). No total Zé te deve R$ 45,00"`

## Alerta de cobrança (job semanal)

Toda segunda às 9h (`America/Sao_Paulo`), o Fiado varre todos os merchants e, pra cada um, calcula quais
clientes têm saldo em aberto com a dívida mais antiga passando de `OVERDUE_THRESHOLD_DAYS` (7 dias, ver
[`src/jobs/weeklyCollectionReminder.ts`](./src/jobs/weeklyCollectionReminder.ts)). Se houver algum, manda
pro comerciante um resumo assim:

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

Pra testar sem esperar segunda-feira: `POST /internal/run-weekly-check?token=SEU_WHATSAPP_VERIFY_TOKEN`.

## Deploy

Qualquer um destes serve bem para o MVP (barato, deploy simples a partir do `Dockerfile`):
Railway, Render ou Fly.io. Configure as mesmas variáveis de ambiente do `.env.example` no painel
do provedor escolhido.
