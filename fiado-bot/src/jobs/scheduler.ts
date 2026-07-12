import cron from "node-cron";
import { runWeeklyCollectionCheck } from "./weeklyCollectionReminder.js";
import { logger } from "../utils/logger.js";

export function startScheduler(): void {
  // Toda segunda as 9h, horario de Brasilia.
  cron.schedule(
    "0 9 * * 1",
    () => {
      runWeeklyCollectionCheck().catch((err) => {
        logger.error("Erro no job semanal de cobranca", {
          error: err instanceof Error ? err.message : err,
        });
      });
    },
    { timezone: "America/Sao_Paulo" }
  );

  logger.info("Scheduler iniciado: cobranca semanal toda segunda as 9h (America/Sao_Paulo)");
}
