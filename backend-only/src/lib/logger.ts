const isProduction = process.env.NODE_ENV === "production";

export const loggerOptions = isProduction
  ? { level: process.env.LOG_LEVEL ?? "info" }
  : {
      level: process.env.LOG_LEVEL ?? "info",
      transport: {
        target: "pino-pretty",
        options: { translateTime: "HH:MM:ss Z", ignore: "pid,hostname" },
      },
    };
