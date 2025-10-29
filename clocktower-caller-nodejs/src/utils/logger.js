/**
 * Logger Utility
 * 
 * Winston-based logging configuration with file rotation and multiple transports.
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Create Winston logger instance
 * @returns {winston.Logger} Configured logger
 */
export function createLogger() {
  const logLevel = process.env.LOG_LEVEL || 'info';
  const logDir = process.env.LOG_DIR || './logs';
  const maxSize = process.env.LOG_MAX_SIZE || '20m';
  const maxFiles = process.env.LOG_MAX_FILES || '14d';

  // Custom format for console output
  const consoleFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
      let log = `${timestamp} [${level}]: ${message}`;
      
      if (Object.keys(meta).length > 0) {
        log += ` ${JSON.stringify(meta)}`;
      }
      
      if (stack) {
        log += `\n${stack}`;
      }
      
      return log;
    })
  );

  // Custom format for file output
  const fileFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  );

  // Create transports array
  const transports = [
    // Console transport
    new winston.transports.Console({
      level: logLevel,
      format: consoleFormat,
      handleExceptions: true,
      handleRejections: true
    })
  ];

  // Add file transports if not in test environment
  if (process.env.NODE_ENV !== 'test') {
    // General log file with rotation
    transports.push(
      new DailyRotateFile({
        filename: join(logDir, 'clocktower-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        maxSize: maxSize,
        maxFiles: maxFiles,
        level: logLevel,
        format: fileFormat,
        handleExceptions: true,
        handleRejections: true
      })
    );

    // Error log file with rotation
    transports.push(
      new DailyRotateFile({
        filename: join(logDir, 'clocktower-error-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        maxSize: maxSize,
        maxFiles: maxFiles,
        level: 'error',
        format: fileFormat,
        handleExceptions: true,
        handleRejections: true
      })
    );
  }

  // Create logger
  const logger = winston.createLogger({
    level: logLevel,
    format: fileFormat,
    transports,
    exitOnError: false
  });

  // Add custom methods
  logger.execution = (executionId, message, meta = {}) => {
    logger.info(message, { executionId, ...meta });
  };

  logger.chain = (chainName, message, meta = {}) => {
    logger.info(message, { chain: chainName, ...meta });
  };

  logger.transaction = (txHash, message, meta = {}) => {
    logger.info(message, { txHash, ...meta });
  };

  logger.balance = (address, message, meta = {}) => {
    logger.info(message, { address, ...meta });
  };

  return logger;
}

// Create default logger instance
export const logger = createLogger();

/**
 * Logger class for structured logging
 */
export class Logger {
  constructor(context = '') {
    this.context = context;
    this.logger = logger;
  }

  /**
   * Log info message
   * @param {string} message - Log message
   * @param {Object} meta - Additional metadata
   */
  info(message, meta = {}) {
    this.logger.info(message, { context: this.context, ...meta });
  }

  /**
   * Log error message
   * @param {string} message - Log message
   * @param {Error|Object} error - Error object or metadata
   */
  error(message, error = {}) {
    if (error instanceof Error) {
      this.logger.error(message, { 
        context: this.context, 
        error: error.message, 
        stack: error.stack 
      });
    } else {
      this.logger.error(message, { context: this.context, ...error });
    }
  }

  /**
   * Log warning message
   * @param {string} message - Log message
   * @param {Object} meta - Additional metadata
   */
  warn(message, meta = {}) {
    this.logger.warn(message, { context: this.context, ...meta });
  }

  /**
   * Log debug message
   * @param {string} message - Log message
   * @param {Object} meta - Additional metadata
   */
  debug(message, meta = {}) {
    this.logger.debug(message, { context: this.context, ...meta });
  }

  /**
   * Log execution-specific message
   * @param {string} executionId - Execution ID
   * @param {string} message - Log message
   * @param {Object} meta - Additional metadata
   */
  execution(executionId, message, meta = {}) {
    this.logger.execution(executionId, message, { context: this.context, ...meta });
  }

  /**
   * Log chain-specific message
   * @param {string} chainName - Chain name
   * @param {string} message - Log message
   * @param {Object} meta - Additional metadata
   */
  chain(chainName, message, meta = {}) {
    this.logger.chain(chainName, message, { context: this.context, ...meta });
  }

  /**
   * Log transaction-specific message
   * @param {string} txHash - Transaction hash
   * @param {string} message - Log message
   * @param {Object} meta - Additional metadata
   */
  transaction(txHash, message, meta = {}) {
    this.logger.transaction(txHash, message, { context: this.context, ...meta });
  }

  /**
   * Log balance-specific message
   * @param {string} address - Wallet address
   * @param {string} message - Log message
   * @param {Object} meta - Additional metadata
   */
  balance(address, message, meta = {}) {
    this.logger.balance(address, message, { context: this.context, ...meta });
  }
}
