import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { env } from "../config/env.js";
import { runWeeklyJobs } from "../jobs/scheduler.js";
import { runDueDateReminders } from "../jobs/dueDateReminderJob.js";
import { runAdminTrialAlert } from "../jobs/adminTrialAlertJob.js";
import { runPlanRenewalWarnings, runPlanExpirations } from "../jobs/planRenewalJob.js";
import { findMerchantByPhone, setMerchantPlan, setPendingAction } from "../domain/merchants.js";
import { getAllMerchantsOrdered } from "../domain/adminStats.js";
import { PLAN_RENEWAL_DAYS } from "../domain/planRenewal.js";
import { sendWhatsAppText } from "../whatsapp/client.js";
import { logger } from "../utils/logger.js";

const VALID_PLANS = new Set(["trial", "active", "lifetime", "blocked"]);

/**
 * Rotas internas pra disparar os jobs agendados manualmente (teste/depuracao), sem esperar o cron.
 * Protegidas pelo mesmo token de verificacao do webhook - nao sao pra uso publico.
 */
export async function registerInternalRoutes(app: FastifyInstance) {
  app.post("/internal/run-weekly-check", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string>;

    if (query.token !== env.WHATSAPP_VERIFY_TOKEN) {
      return reply.status(403).send("Forbidden");
    }

    try {
      await runWeeklyJobs();
      return reply.send({ ok: true });
    } catch (err) {
      logger.error("Erro ao rodar jobs semanais manualmente", {
        error: err instanceof Error ? err.message : err,
      });
      return reply.status(500).send({ ok: false });
    }
  });

  app.post("/internal/run-due-check", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string>;

    if (query.token !== env.WHATSAPP_VERIFY_TOKEN) {
      return reply.status(403).send("Forbidden");
    }

    try {
      await runDueDateReminders();
      return reply.send({ ok: true });
    } catch (err) {
      logger.error("Erro ao rodar lembrete de vencimento manualmente", {
        error: err instanceof Error ? err.message : err,
      });
      return reply.status(500).send({ ok: false });
    }
  });

  app.post("/internal/run-admin-check", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string>;

    if (query.token !== env.WHATSAPP_VERIFY_TOKEN) {
      return reply.status(403).send("Forbidden");
    }

    try {
      await runAdminTrialAlert();
      return reply.send({ ok: true });
    } catch (err) {
      logger.error("Erro ao rodar alerta de trials pro admin manualmente", {
        error: err instanceof Error ? err.message : err,
      });
      return reply.status(500).send({ ok: false });
    }
  });

  app.post("/internal/run-plan-renewal-check", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string>;

    if (query.token !== env.WHATSAPP_VERIFY_TOKEN) {
      return reply.status(403).send("Forbidden");
    }

    try {
      await runPlanRenewalWarnings();
      await runPlanExpirations();
      return reply.send({ ok: true });
    } catch (err) {
      logger.error("Erro ao rodar renovacao de plano manualmente", {
        error: err instanceof Error ? err.message : err,
      });
      return reply.status(500).send({ ok: false });
    }
  });

  // Lista todos os comerciantes com plano/trial - consulta pontual pra acompanhar fora do WhatsApp.
  app.get("/internal/merchants", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string>;

    if (query.token !== env.WHATSAPP_VERIFY_TOKEN) {
      return reply.status(403).send("Forbidden");
    }

    try {
      const rows = await getAllMerchantsOrdered();
      return reply.send({
        ok: true,
        merchants: rows.map((m) => ({
          id: m.id,
          businessName: m.businessName,
          whatsappPhone: m.whatsappPhone,
          plan: m.plan,
          trialEndsAt: m.trialEndsAt,
          planActivatedAt: m.planActivatedAt,
          createdAt: m.createdAt,
        })),
      });
    } catch (err) {
      logger.error("Erro ao listar comerciantes", { error: err instanceof Error ? err.message : err });
      return reply.status(500).send({ ok: false });
    }
  });

  // Libera/bloqueia um comerciante manualmente (ex: depois de confirmar um Pix, ou plano vitalicio).
  // phone no formato que o WhatsApp manda (ex: 5511987654321, sem "+"). plan: trial | active | lifetime | blocked.
  app.post("/internal/set-plan", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string>;

    if (query.token !== env.WHATSAPP_VERIFY_TOKEN) {
      return reply.status(403).send("Forbidden");
    }

    if (!query.phone || !query.plan || !VALID_PLANS.has(query.plan)) {
      return reply.status(400).send({ ok: false, error: "informe ?phone=...&plan=trial|active|lifetime|blocked" });
    }

    try {
      const merchant = await findMerchantByPhone(query.phone);
      if (!merchant) {
        return reply.status(404).send({ ok: false, error: "merchant nao encontrado" });
      }

      await setMerchantPlan(merchant.id, query.plan);

      if (query.plan === "active" || query.plan === "lifetime") {
        const message =
          query.plan === "lifetime"
            ? "🎉 Seu plano do Fiado agora é *vitalício* — nunca mais vence. Obrigado por fazer parte disso com a gente! 🧾"
            : (() => {
                const renewsAt = new Date(Date.now() + PLAN_RENEWAL_DAYS * 24 * 60 * 60 * 1000);
                const renewsAtLabel = renewsAt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
                return `✅ Pagamento confirmado! Seu acesso ao Fiado foi renovado e é válido até *${renewsAtLabel}*. Obrigado por continuar com a gente 🧾`;
              })();

        await sendWhatsAppText(merchant.whatsappPhone, message).catch((err) =>
          logger.error("Erro ao notificar comerciante sobre liberacao manual do plano", {
            merchantId: merchant.id,
            error: err instanceof Error ? err.message : err,
          })
        );
      }

      return reply.send({ ok: true, merchantId: merchant.id, plan: query.plan });
    } catch (err) {
      logger.error("Erro ao definir plano manualmente", { error: err instanceof Error ? err.message : err });
      return reply.status(500).send({ ok: false });
    }
  });

  // Manda uma mensagem avulsa de texto pra um numero (ex: avisar sobre plano vitalicio, suporte pontual).
  // phone no formato que o WhatsApp manda (ex: 5511987654321, sem "+"). Texto vai no body (JSON: {"text": "..."}).
  app.post("/internal/send-message", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string>;

    if (query.token !== env.WHATSAPP_VERIFY_TOKEN) {
      return reply.status(403).send("Forbidden");
    }

    const body = request.body as { text?: string } | undefined;

    if (!query.phone || !body?.text) {
      return reply.status(400).send({ ok: false, error: "informe ?phone=... e body JSON {\"text\": \"...\"}" });
    }

    try {
      await sendWhatsAppText(query.phone, body.text);
      return reply.send({ ok: true });
    } catch (err) {
      logger.error("Erro ao mandar mensagem avulsa", { error: err instanceof Error ? err.message : err });
      return reply.status(500).send({ ok: false });
    }
  });

  // Pergunta o nome pro comerciante (fica aguardando a resposta) - pra preencher business_name de quem
  // ja tem conta mas ainda ta "(sem nome)". phone no formato que o WhatsApp manda (sem "+").
  app.post("/internal/ask-business-name", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string>;

    if (query.token !== env.WHATSAPP_VERIFY_TOKEN) {
      return reply.status(403).send("Forbidden");
    }

    if (!query.phone) {
      return reply.status(400).send({ ok: false, error: "informe ?phone=..." });
    }

    try {
      const merchant = await findMerchantByPhone(query.phone);
      if (!merchant) {
        return reply.status(404).send({ ok: false, error: "merchant nao encontrado" });
      }

      await setPendingAction(merchant.id, { type: "awaiting_business_name" });
      await sendWhatsAppText(
        query.phone,
        "Oi! 👋 Só uma perguntinha rápida pra eu te atender melhor: qual o seu nome ou o nome do seu comércio?"
      );
      return reply.send({ ok: true });
    } catch (err) {
      logger.error("Erro ao perguntar nome do comerciante", { error: err instanceof Error ? err.message : err });
      return reply.status(500).send({ ok: false });
    }
  });
}
