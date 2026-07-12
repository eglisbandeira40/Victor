import { env } from "./config/env.js";
import { buildServer } from "./server.js";
import { startScheduler } from "./jobs/scheduler.js";
import { logger } from "./utils/logger.js";

const app = buildServer();

app
  .listen({ port: env.PORT, host: "0.0.0.0" })
  .then((address) => {
    logger.info(`Fiado bot no ar em ${address}`);
    startScheduler();
  })
  .catch((err) => {
    logger.error("Falha ao iniciar o servidor", { error: err instanceof Error ? err.message : err });
    process.exit(1);
  });
