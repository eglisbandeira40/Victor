# HubFinance

Gestão financeira e cobrança: contas a pagar e a receber, emissão e régua de
cobrança organizadas e sob controle.

MVP multi-empresa (multi-tenant) construído com Next.js 16 (App Router),
PostgreSQL (Prisma 7) e NextAuth v5.

## Funcionalidades

- **Autenticação e multiempresa**: cadastro cria uma Empresa + usuário ADMIN;
  todos os dados são isolados por `empresaId`.
- **Contas a pagar**: cadastro, categorização, fornecedor, status
  (pendente/pago/atrasado), marcação de pagamento.
- **Clientes**: cadastro básico (nome, documento, e-mail, telefone).
- **Contas a receber**: vinculadas a um cliente, com opção de emitir cobrança
  (boleto/PIX) no ato através do **Gateway HubFinance**.
- **Gateway de Pagamento HubFinance**: cada empresa faz um onboarding (KYC)
  único e passa a emitir boleto/PIX com a marca HubFinance — a empresa e os
  clientes dela nunca veem o nome do processador por trás. Página pública de
  pagamento própria (`/cobranca/[token]`), sem redirecionar para o site do
  processador.
- **Régua de cobrança**: réguas configuráveis com etapas (dias antes/depois do
  vencimento, canal, assunto e mensagem com variáveis), disparadas por um job
  agendado que envia e-mails e marca contas vencidas automaticamente.
- **Dashboard**: totais em aberto, recebíveis atrasados, saldo projetado e
  próximos vencimentos.

## Stack

Next.js 16 (App Router, Server Actions) · TypeScript · Tailwind CSS ·
PostgreSQL · Prisma 7 (driver adapter `@prisma/adapter-pg`) · NextAuth v5
(credentials + JWT) · Resend (e-mail) · Asaas (boleto/PIX).

## Rodando localmente

1. Banco de dados: suba um Postgres local. Se tiver Docker:

   ```bash
   docker compose up -d
   ```

   Sem Docker, use um Postgres já instalado e crie um banco `hubfinance`.

2. Copie `.env.example` para `.env` e ajuste `DATABASE_URL` e `AUTH_SECRET`
   (gere um valor aleatório, ex: `openssl rand -base64 32`).

3. Instale dependências e rode as migrations:

   ```bash
   npm install
   npx prisma migrate dev
   ```

4. Suba o servidor:

   ```bash
   npm run dev
   ```

5. Acesse `http://localhost:3000/cadastro` para criar a primeira empresa e
   usuário.

## Gateway de Pagamento HubFinance (white-label)

O HubFinance não é uma instituição de pagamento licenciada — "ser o próprio
Asaas" aqui significa uma camada de marca própria (UI, onboarding, página de
pagamento) por cima de um processador parceiro já licenciado, que de fato
movimenta o dinheiro. Hoje o parceiro é o **Asaas**, através do programa de
sub-contas (White Label / contas conectadas):

- A HubFinance tem uma **conta plataforma** no Asaas (`ASAAS_MASTER_API_KEY`),
  usada exclusivamente para criar sub-contas.
- Cada **Empresa** cliente do HubFinance faz um onboarding único em
  `Configurações > Gateway de Pagamento` (dados de KYC exigidos pelo
  processador: razão social, CPF/CNPJ, endereço, faturamento). Isso provisiona
  automaticamente uma sub-conta própria (`gatewayAccountId`/`gatewayApiKey`/
  `gatewayWalletId`, salvos em `Empresa`).
- Todas as cobranças da Empresa são emitidas nessa sub-conta — nunca na conta
  master. A Empresa e os clientes dela só veem "HubFinance": a página de
  pagamento pública (`/cobranca/[publicToken]`) tem a marca do HubFinance, sem
  mencionar o processador.
- **Limitação conhecida do MVP**: o link "baixar boleto (PDF)" na página
  pública ainda aponta para a URL do processador (`bankSlipUrl`) — quem
  inspecionar o link vê o domínio dele. Para branding 100% completo, seria
  necessário um endpoint próprio fazendo proxy do PDF.

Isso é bem diferente de processar pagamentos de verdade (like o Asaas faz):
não requer autorização do Banco Central nem compliance PCI, porque quem
efetivamente move o dinheiro e assume o risco regulatório é o parceiro.

## Integrações externas (opcionais para rodar, obrigatórias para produção)

Sem essas chaves configuradas o app funciona normalmente (contas, clientes,
dashboard), mas os recursos abaixo ficam desativados/no-op:

- **`RESEND_API_KEY`** — necessária para o envio real dos e-mails da régua de
  cobrança ([resend.com](https://resend.com)).
- **`ASAAS_MASTER_API_KEY`** — chave da conta plataforma do HubFinance no
  Asaas ([asaas.com](https://www.asaas.com); use a URL sandbox para testes),
  usada só para provisionar sub-contas no onboarding das empresas. Sem ela, o
  onboarding falha com uma mensagem de erro clara e a empresa continua sem
  poder emitir cobranças (mas o resto do app funciona normalmente).
- **`ASAAS_WEBHOOK_TOKEN`** — configure o mesmo valor no webhook do Asaas
  apontando para `/api/cobranca/webhook`, para atualizar o status das
  cobranças (pago/vencido) automaticamente. Sub-contas precisam ter o webhook
  configurado individualmente (ou usar o webhook escopado da conta master, se
  o plano contratado no Asaas suportar).

## Régua de cobrança (job agendado)

O motor da régua roda via `GET /api/cron/regua-cobranca`, protegido por
`Authorization: Bearer <CRON_SECRET>`. Ele:

1. Marca como `ATRASADO` as contas a receber pendentes vencidas.
2. Para cada conta com régua vinculada (ou a régua padrão da empresa), envia
   por e-mail as etapas cujo offset de dias bate com a data de hoje.
3. Registra cada envio (sucesso ou falha) — idempotente, não reenvia a mesma
   etapa duas vezes para a mesma conta.

Agende esse endpoint para rodar 1x/dia (ex: Vercel Cron, GitHub Actions
schedule, ou `cron` do sistema operacional apontando para um `curl`).

## Deploy

- `trustHost: true` já está configurado para funcionar atrás de qualquer
  host/proxy — se for expor publicamente, garanta que o proxy/CDN na frente
  do app só encaminha tráfego confiável (o `trustHost` faz o NextAuth confiar
  no header `Host` recebido).
- O client do Prisma usa o driver adapter `@prisma/adapter-pg`, compatível com
  qualquer Postgres (Neon, Supabase, RDS, etc.) — basta apontar
  `DATABASE_URL`.

### Docker (EasyPanel, etc.)

Há um `Dockerfile` multi-stage (deps → build → runtime) na raiz do projeto.
No start do container, `docker-entrypoint.sh` roda `prisma migrate deploy`
automaticamente antes de subir o servidor (`prisma migrate deploy` é seguro
de rodar toda vez — idempotente, não reaplica migrations já aplicadas).

Variáveis de ambiente obrigatórias no serviço (as mesmas do `.env.example`):
`DATABASE_URL`, `AUTH_SECRET`. As demais (`RESEND_API_KEY`,
`ASAAS_MASTER_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `CRON_SECRET`) são opcionais
para o app subir, mas necessárias para e-mail de cobrança / gateway de
pagamento / cron da régua funcionarem de verdade.

Nota: o build da imagem Docker não pôde ser testado neste ambiente de
desenvolvimento (o proxy de rede da sandbox bloqueia pulls do Docker Hub) —
o Dockerfile segue um padrão multi-stage padrão do ecossistema Next.js, mas
vale rodar o primeiro build no próprio EasyPanel e observar o log.

## O que falta para produção

- Envio de WhatsApp/SMS na régua de cobrança (hoje só e-mail está
  implementado; o schema já suporta os outros canais).
- `gatewayApiKey` da sub-conta de cada empresa está salva em texto puro no
  banco — antes de produção, criptografar esse campo (ex: `pgcrypto` ou
  cifra na aplicação).
- Proxy próprio para o PDF do boleto (ver limitação acima).
- Emissão de cobrança usa apenas Asaas como processador por trás; trocar de
  parceiro exige um novo adapter em `src/lib/gateway.ts`.
- Testes automatizados (unitários/e2e) ainda não foram escritos.
