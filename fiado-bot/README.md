# Fiado 🧾

Bot de WhatsApp para donos de mercadinho, padaria e bar controlarem quem deve o quê — sem app, sem planilha, sem caderno.

## Status do MVP

Implementado nesta fase (item 1 do escopo — o coração do produto):

- [x] Webhook do WhatsApp Business Cloud API (verificação + recebimento de mensagens)
- [x] Cadastro de dívida por linguagem natural ("Zé Carlos, 45 reais, o almoço de hoje")
- [x] Criação automática de comerciante (na primeira mensagem) e cliente (na primeira dívida)
- [x] Soma ao saldo existente do cliente quando ele já existe
- [x] Confirmação no tom de voz do Fiado, com saldo total atualizado

Ainda não implementado (próximas fases, schema já preparado pra isso):
- [ ] Consulta de saldo ("Quanto o Zé me deve?", "Quem tá devendo mais de 100?", "Resumo da semana")
- [ ] Baixa de pagamento ("Zé pagou 20 reais")
- [ ] Lembrete semanal automático (job agendado, com aprovação do comerciante antes de enviar)
- [ ] Resumo semanal proativo
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

| Método | Rota        | Descrição                                                        |
|--------|-------------|--------------------------------------------------------------------|
| GET    | `/health`   | Healthcheck                                                       |
| GET    | `/webhook`  | Verificação do webhook do Meta (`hub.challenge`)                  |
| POST   | `/webhook`  | Recebe mensagens do WhatsApp — o coração do sistema               |

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

## Deploy

Qualquer um destes serve bem para o MVP (barato, deploy simples a partir do `Dockerfile`):
Railway, Render ou Fly.io. Configure as mesmas variáveis de ambiente do `.env.example` no painel
do provedor escolhido.
