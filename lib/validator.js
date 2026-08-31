/**
 * Input Validation and Sanitization
 */

class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

const validators = {
  // Check if value is non-empty string
  required: (value, fieldName = 'Field') => {
    if (!value || typeof value !== 'string' || !value.trim()) {
      throw new ValidationError(`${fieldName} is required`, fieldName);
    }
    return value.trim();
  },

  // Email validation
  email: (value) => {
    const email = validators.required(value, 'Email');
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new ValidationError('Invalid email format', 'email');
    }
    return email.toLowerCase();
  },

  // Username validation (3-30 alphanumeric, dots, underscores, hyphens)
  username: (value) => {
    const username = validators.required(value, 'Username');
    if (username.length < 3 || username.length > 30) {
      throw new ValidationError('Username must be 3-30 characters', 'username');
    }
    if (!/^[a-z0-9._-]+$/i.test(username)) {
      throw new ValidationError('Username can only contain letters, numbers, dots, underscores, and hyphens', 'username');
    }
    return username.toLowerCase();
  },

  // Password validation (minimum 6 characters)
  password: (value) => {
    const password = validators.required(value, 'Password');
    if (password.length < 6) {
      throw new ValidationError('Password must be at least 6 characters', 'password');
    }
    if (password.length > 128) {
      throw new ValidationError('Password is too long', 'password');
    }
    return password;
  },

  // String with length constraints
  string: (value, { minLength = 0, maxLength = 1000, fieldName = 'String' } = {}) => {
    if (typeof value !== 'string') {
      throw new ValidationError(`${fieldName} must be a string`, fieldName);
    }
    const trimmed = value.trim();
    if (minLength > 0 && trimmed.length < minLength) {
      throw new ValidationError(`${fieldName} must be at least ${minLength} characters`, fieldName);
    }
    if (trimmed.length > maxLength) {
      throw new ValidationError(`${fieldName} must not exceed ${maxLength} characters`, fieldName);
    }
    return trimmed;
  },

  // URL validation
  url: (value, fieldName = 'URL') => {
    const urlStr = validators.required(value, fieldName);
    try {
      const parsed = new URL(urlStr);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new ValidationError(`${fieldName} must use HTTP or HTTPS`, fieldName);
      }
      if (urlStr.length > 2048) {
        throw new ValidationError(`${fieldName} is too long`, fieldName);
      }
      return urlStr;
    } catch (err) {
      throw new ValidationError(`Invalid ${fieldName} format`, fieldName);
    }
  },

  // Integer validation
  integer: (value, { min, max, fieldName = 'Number' } = {}) => {
    const num = parseInt(value, 10);
    if (!Number.isInteger(num)) {
      throw new ValidationError(`${fieldName} must be an integer`, fieldName);
    }
    if (typeof min === 'number' && num < min) {
      throw new ValidationError(`${fieldName} must be at least ${min}`, fieldName);
    }
    if (typeof max === 'number' && num > max) {
      throw new ValidationError(`${fieldName} must not exceed ${max}`, fieldName);
    }
    return num;
  },

  // Positive integer
  positiveInteger: (value, fieldName = 'Number') => {
    return validators.integer(value, { min: 1, fieldName });
  },

  // Array validation
  array: (value, { minLength = 0, maxLength = 100, fieldName = 'Array' } = {}) => {
    if (!Array.isArray(value)) {
      throw new ValidationError(`${fieldName} must be an array`, fieldName);
    }
    if (value.length < minLength) {
      throw new ValidationError(`${fieldName} must have at least ${minLength} items`, fieldName);
    }
    if (value.length > maxLength) {
      throw new ValidationError(`${fieldName} must not exceed ${maxLength} items`, fieldName);
    }
    return value;
  },

  // Enum validation
  enum: (value, options, fieldName = 'Value') => {
    if (!options.includes(value)) {
      throw new ValidationError(`${fieldName} must be one of: ${options.join(', ')}`, fieldName);
    }
    return value;
  },

  // Boolean validation
  boolean: (value, fieldName = 'Boolean') => {
    if (typeof value !== 'boolean') {
      throw new ValidationError(`${fieldName} must be true or false`, fieldName);
    }
    return value;
  },

  // ISO date validation
  date: (value, fieldName = 'Date') => {
    const dateStr = validators.required(value, fieldName);
    if (isNaN(Date.parse(dateStr))) {
      throw new ValidationError(`${fieldName} must be a valid ISO date`, fieldName);
    }
    return new Date(dateStr).toISOString();
  }
};

// Sanitization helpers
const sanitizers = {
  // Remove HTML tags and escape dangerous characters
  sanitizeHtml: (text) => {
    if (typeof text !== 'string') return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  // Trim and normalize whitespace
  normalizeText: (text) => {
    if (typeof text !== 'string') return '';
    return text.trim().replace(/\s+/g, ' ');
  },

  // Remove dangerous characters from filenames
  sanitizeFilename: (filename) => {
    if (typeof filename !== 'string') return 'file';
    return filename
      .replace(/[^a-z0-9._-]/gi, '_')
      .replace(/\.{2,}/g, '.')
      .slice(0, 255);
  }
};

module.exports = {
  ValidationError,
  validators,
  sanitizers
};
