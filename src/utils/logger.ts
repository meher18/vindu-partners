/**
 * Centralized logging and error tracking utility
 * Helps with debugging and monitoring app behavior
 */

enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL',
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  data?: any;
  stack?: string;
}

class Logger {
  private static logs: LogEntry[] = [];
  private static MAX_LOGS = 500; // Keep last 500 logs
  private static isDevelopment = __DEV__;

  private static formatTime(): string {
    return new Date().toISOString().split('T')[1].split('.')[0];
  }

  private static addLog(entry: LogEntry) {
    Logger.logs.push(entry);
    if (Logger.logs.length > Logger.MAX_LOGS) {
      Logger.logs.shift(); // Remove oldest log
    }
  }

  static debug(message: string, data?: any) {
    const entry: LogEntry = {
      level: LogLevel.DEBUG,
      message,
      timestamp: Logger.formatTime(),
      data,
    };
    Logger.addLog(entry);
    if (Logger.isDevelopment) {
      console.debug(`[${entry.timestamp}] ${message}`, data);
    }
  }

  static info(message: string, data?: any) {
    const entry: LogEntry = {
      level: LogLevel.INFO,
      message,
      timestamp: Logger.formatTime(),
      data,
    };
    Logger.addLog(entry);
    console.log(`[${entry.timestamp}] ${message}`, data);
  }

  static warn(message: string, data?: any) {
    const entry: LogEntry = {
      level: LogLevel.WARN,
      message,
      timestamp: Logger.formatTime(),
      data,
    };
    Logger.addLog(entry);
    console.warn(`[${entry.timestamp}] ${message}`, data);
  }

  static error(message: string, error?: any) {
    const entry: LogEntry = {
      level: LogLevel.ERROR,
      message,
      timestamp: Logger.formatTime(),
      data: error?.data || error?.message || error,
      stack: error?.stack,
    };
    Logger.addLog(entry);
    console.error(`[${entry.timestamp}] ${message}`, error);
  }

  static critical(message: string, error?: any) {
    const entry: LogEntry = {
      level: LogLevel.CRITICAL,
      message,
      timestamp: Logger.formatTime(),
      data: error?.data || error?.message || error,
      stack: error?.stack,
    };
    Logger.addLog(entry);
    console.error(`[${entry.timestamp}] CRITICAL: ${message}`, error);
    
    // Could send to error tracking service (Sentry, Firebase, etc.)
    // trackErrorRemote(entry);
  }

  /**
   * Get all logs (for debugging/export)
   */
  static getLogs(): LogEntry[] {
    return [...Logger.logs];
  }

  /**
   * Clear logs
   */
  static clear() {
    Logger.logs = [];
  }

  /**
   * Export logs as JSON string
   */
  static export(): string {
    return JSON.stringify(Logger.logs, null, 2);
  }
}

export default Logger;
