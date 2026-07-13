import cron from "node-cron";
import { runWeeklySummaryBroadcast } from "./weeklySummaryJob.js";
import { runWeeklyCollectionCheck } from "./weeklyCollectionReminder.js";
import { runDueDateReminders } from "./dueDateReminderJob.js";
import { logger } from "../utils/logger.js";

export async function runWeeklyJobs(): Promise<void> {
  await runWeeklySummaryBroadcast();
  await runWeeklyCollectionCheck();
}

export function startScheduler(): void {
  // Toda segunda as 9h, horario de Brasilia.
  cron.schedule(
    "0 9 * * 1",
    () => {
      runWeeklyJobs().catch((err) => {
        logger.error("Erro nos jobs semanais (resumo/cobranca)", {
          error: err instanceof Error ? err.message : err,
        });
      });
    },
    { timezone: "America/Sao_Paulo" }
  );

  // Todo dia as 8h, horario de Brasilia - antes do job semanal das 9h.
  cron.schedule(
    "0 8 * * *",
    () => {
      runDueDateReminders().catch((err) => {
        logger.error("Erro no job diario de lembrete de vencimento", {
          error: err instanceof Error ? err.message : err,
        });
      });
    },
    { timezone: "America/Sao_Paulo" }
  );

  logger.info(
    "Scheduler iniciado: lembrete de vencimento todo dia as 8h, resumo + cobranca semanal toda segunda as 9h (America/Sao_Paulo)"
  );
}
