/**
 * Environment Configuration and Validation
 */

const fs = require('fs');
const path = require('path');

class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

// Required environment variables schema
const CONFIG_SCHEMA = {
  // Core application
  NODE_ENV: { default: 'development', validate: (v) => ['development', 'production'].includes(v) },
  PORT: { default: 3000, validate: (v) => /^\d+$/.test(v) && parseInt(v) > 0 },
  
  // Security
  ADMIN_TOKEN: { required: true, validate: (v) => v && v.length >= 16 },
  SESSION_SECRET: { required: true, validate: (v) => v && v.length >= 16 },
  
  // CORS
  CORS_ORIGIN: { 
    default: (env) => env.NODE_ENV === 'production' ? false : true,
    validate: (v) => typeof v === 'string' || typeof v === 'boolean'
  },
  
  // Database
  DB_PATH: { default: './database/reeloram.db' },
  UPLOAD_DIR: { default: './uploads' },
  
  // Payment (optional)
  PAYMENT_LINK_URL: { required: false },
  PAYMENT_PROVIDER: { default: 'iyzico' },
  
  // Product configuration
  SINGLE_PRODUCT_NAME: { default: 'Kadrio Tek Ürün' },
  SINGLE_PRODUCT_PRICE: { default: 99, validate: (v) => /^\d+$/.test(v) && parseInt(v) > 0 },
  
  // Third-party services (optional)
  IYZICO_API_KEY: { required: false },
  IYZICO_SECRET_KEY: { required: false },
  STRIPE_SECRET_KEY: { required: false },
  CLOUDINARY_CLOUD_NAME: { required: false },
  
  // Logging
  LOG_LEVEL: { default: 'INFO', validate: (v) => ['ERROR', 'WARN', 'INFO', 'DEBUG'].includes(v) },
  LOG_DIR: { default: './logs' },
  
  // Performance
  REQUEST_TIMEOUT_MS: { default: 30000, validate: (v) => /^\d+$/.test(v) && parseInt(v) > 0 },
  RATE_LIMIT_WINDOW_MS: { default: 60000, validate: (v) => /^\d+$/.test(v) && parseInt(v) > 0 },
  RATE_LIMIT_MAX_REQUESTS: { default: 120, validate: (v) => /^\d+$/.test(v) && parseInt(v) > 0 }
};

class Config {
  constructor() {
    this.config = {};
    this.errors = [];
    this.warnings = [];
  }

  load() {
    // Load from environment variables
    for (const [key, schema] of Object.entries(CONFIG_SCHEMA)) {
      let value = process.env[key];

      // Use default if not provided
      if (value === undefined) {
        if (typeof schema.default === 'function') {
          value = schema.default(this.config);
        } else if (schema.default !== undefined) {
          value = schema.default;
        } else if (schema.required) {
          this.errors.push(`Missing required environment variable: ${key}`);
          continue;
        }
      }

      if (key === 'CORS_ORIGIN' && typeof value === 'string') {
        if (value.toLowerCase() === 'false') value = false;
        else if (value.toLowerCase() === 'true') value = true;
      }

      // Validate
      if (schema.validate && !schema.validate(value)) {
        this.errors.push(`Invalid value for ${key}: ${value}`);
        continue;
      }

      // Convert types
      if (typeof schema.default === 'number' && typeof value === 'string') {
        value = parseInt(value, 10);
      }

      this.config[key] = value;
    }

    // Production security checks
    if (this.config.NODE_ENV === 'production') {
      if (this.config.ADMIN_TOKEN === this.config.SESSION_SECRET) {
        this.errors.push('ADMIN_TOKEN and SESSION_SECRET must be different in production');
      }
      if (this.config.LOG_LEVEL !== 'ERROR' && this.config.LOG_LEVEL !== 'WARN') {
        this.warnings.push('Log level should be ERROR or WARN in production for better performance');
      }
    }

    // Throw if there are errors
    if (this.errors.length > 0) {
      throw new ConfigError(`Configuration errors:\n${this.errors.join('\n')}`);
    }

    return this.config;
  }

  get(key, defaultValue = undefined) {
    return this.config[key] !== undefined ? this.config[key] : defaultValue;
  }

  getOrThrow(key) {
    if (this.config[key] === undefined) {
      throw new ConfigError(`Configuration key not found: ${key}`);
    }
    return this.config[key];
  }

  isProduction() {
    return this.config.NODE_ENV === 'production';
  }

  isDevelopment() {
    return this.config.NODE_ENV === 'development';
  }

  validate() {
    if (this.errors.length > 0) {
      throw new ConfigError(`Configuration validation failed:\n${this.errors.join('\n')}`);
    }
    return true;
  }

  summary() {
    return {
      environment: this.config.NODE_ENV,
      port: this.config.PORT,
      database: this.config.DB_PATH,
      uploads: this.config.UPLOAD_DIR,
      corsOrigin: this.config.CORS_ORIGIN,
      logLevel: this.config.LOG_LEVEL,
      warnings: this.warnings
    };
  }
}

// Singleton instance
let configInstance = null;

function getConfig() {
  if (!configInstance) {
    configInstance = new Config();
    configInstance.load();
  }
  return configInstance;
}

module.exports = {
  getConfig,
  Config,
  ConfigError,
  CONFIG_SCHEMA
};
