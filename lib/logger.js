/**
 * Professional Logger System
 * Supports file and console output with levels
 */

const fs = require('fs');
const path = require('path');

const LOG_LEVELS = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG'
};

const LOG_LEVEL_VALUES = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

class Logger {
  constructor(options = {}) {
    this.logDir = options.logDir || path.join(__dirname, '..', 'logs');
    this.currentLevel = LOG_LEVEL_VALUES[options.level || 'INFO'];
    this.isProduction = options.isProduction || process.env.NODE_ENV === 'production';
    this.enableConsole = options.enableConsole !== false;
    this.enableFile = options.enableFile !== false;

    // Create logs directory if it doesn't exist
    if (this.enableFile && !fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  getLogFile(type) {
    const date = new Date().toISOString().split('T')[0];
    return path.join(this.logDir, `${type}-${date}.log`);
  }

  format(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const metaStr = Object.keys(meta).length > 0 ? ` | ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level}] ${message}${metaStr}`;
  }

  write(level, message, meta = {}) {
    if (LOG_LEVEL_VALUES[level] > this.currentLevel) return;

    const formatted = this.format(level, message, meta);

    // Console output
    if (this.enableConsole) {
      const colorMap = {
        ERROR: '\x1b[31m', // Red
        WARN: '\x1b[33m',  // Yellow
        INFO: '\x1b[36m',  // Cyan
        DEBUG: '\x1b[35m'  // Magenta
      };
      const reset = '\x1b[0m';
      console.log(`${colorMap[level]}${formatted}${reset}`);
    }

    // File output (production or when enabled)
    if (this.enableFile) {
      const logFile = this.getLogFile(level);
      fs.appendFile(logFile, formatted + '\n', (err) => {
        if (err) console.error(`Failed to write to log file: ${err.message}`);
      });
    }
  }

  error(message, meta = {}) {
    this.write(LOG_LEVELS.ERROR, message, meta);
  }

  warn(message, meta = {}) {
    this.write(LOG_LEVELS.WARN, message, meta);
  }

  info(message, meta = {}) {
    this.write(LOG_LEVELS.INFO, message, meta);
  }

  debug(message, meta = {}) {
    this.write(LOG_LEVELS.DEBUG, message, meta);
  }

  request(method, path, statusCode, duration, meta = {}) {
    const logMeta = { method, path, statusCode, durationMs: duration, ...meta };
    if (statusCode >= 500) {
      this.error(`Request failed: ${method} ${path}`, logMeta);
    } else if (statusCode >= 400) {
      this.warn(`Request error: ${method} ${path}`, logMeta);
    } else {
      this.info(`${method} ${path} ${statusCode}`, logMeta);
    }
  }

  database(operation, duration, error = null, meta = {}) {
    const logMeta = { operation, durationMs: duration, ...meta };
    if (error) {
      this.error(`Database error in ${operation}`, { ...logMeta, error: error.message });
    } else {
      this.debug(`Database ${operation}`, logMeta);
    }
  }
}

module.exports = Logger;
