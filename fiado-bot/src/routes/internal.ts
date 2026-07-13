import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { env } from "../config/env.js";
import { runWeeklyJobs } from "../jobs/scheduler.js";
import { logger } from "../utils/logger.js";

/**
 * Rota interna pra disparar os jobs semanais manualmente (teste/depuracao), sem esperar o cron.
 * Protegida pelo mesmo token de verificacao do webhook - nao e pra uso publico.
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
}
