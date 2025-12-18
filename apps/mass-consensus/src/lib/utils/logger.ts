/**
 * Logger utility that adds timestamps to console output
 */

function getTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace('T', ' ').substring(0, 23);
}

export const logger = {
  info: (message: string, ...args: unknown[]) => {
    console.info(`[${getTimestamp()}] ${message}`, ...args);
  },
  error: (message: string, ...args: unknown[]) => {
    console.error(`[${getTimestamp()}] ${message}`, ...args);
  },
  warn: (message: string, ...args: unknown[]) => {
    console.warn(`[${getTimestamp()}] ${message}`, ...args);
  },
  debug: (message: string, ...args: unknown[]) => {
    console.info(`[${getTimestamp()}] [DEBUG] ${message}`, ...args);
  },
};

export default logger;
