import Fastify from "fastify";
import { registerWebhookRoutes } from "./routes/webhook.js";
import { registerInternalRoutes } from "./routes/internal.js";
import { logger } from "./utils/logger.js";

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

export function buildServer() {
  const app = Fastify({ logger: false });

  // Guarda o corpo cru da requisicao para validar a assinatura do webhook da Meta.
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (req, body, done) => {
    req.rawBody = body as Buffer;
    try {
      const json = body.length ? JSON.parse(body.toString("utf8")) : {};
      done(null, json);
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  app.get("/health", async () => ({ status: "ok" }));

  app.register(registerWebhookRoutes);
  app.register(registerInternalRoutes);

  app.setErrorHandler((error: Error, _request, reply) => {
    logger.error("Erro nao tratado na requisicao", { error: error.message });
    reply.status(500).send({ error: "internal_error" });
  });

  return app;
}
