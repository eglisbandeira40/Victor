type LogFields = Record<string, unknown>;

function line(level: string, msg: string, fields?: LogFields) {
  const base = { level, msg, time: new Date().toISOString(), ...fields };
  console.log(JSON.stringify(base));
}

export const logger = {
  info: (msg: string, fields?: LogFields) => line("info", msg, fields),
  warn: (msg: string, fields?: LogFields) => line("warn", msg, fields),
  error: (msg: string, fields?: LogFields) => line("error", msg, fields),
};
