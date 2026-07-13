import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { env } from "../config/env.js";
import { runWeeklyJobs } from "../jobs/scheduler.js";
import { runDueDateReminders } from "../jobs/dueDateReminderJob.js";
import { findMerchantByPhone, setMerchantPlan } from "../domain/merchants.js";
import { logger } from "../utils/logger.js";

const VALID_PLANS = new Set(["trial", "active", "blocked"]);

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

  // Libera/bloqueia um comerciante manualmente (ex: depois de confirmar um Pix). phone no formato
  // que o WhatsApp manda (ex: 5511987654321, sem "+"). plan: trial | active | blocked.
  app.post("/internal/set-plan", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string>;

    if (query.token !== env.WHATSAPP_VERIFY_TOKEN) {
      return reply.status(403).send("Forbidden");
    }

    if (!query.phone || !query.plan || !VALID_PLANS.has(query.plan)) {
      return reply.status(400).send({ ok: false, error: "informe ?phone=...&plan=trial|active|blocked" });
    }

    try {
      const merchant = await findMerchantByPhone(query.phone);
      if (!merchant) {
        return reply.status(404).send({ ok: false, error: "merchant nao encontrado" });
      }

      await setMerchantPlan(merchant.id, query.plan);
      return reply.send({ ok: true, merchantId: merchant.id, plan: query.plan });
    } catch (err) {
      logger.error("Erro ao definir plano manualmente", { error: err instanceof Error ? err.message : err });
      return reply.status(500).send({ ok: false });
    }
  });
}
