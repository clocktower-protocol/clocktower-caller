/**
 * Helper Utilities
 * 
 * Common helper functions, ABI definitions, and utilities for the Clocktower Caller.
 */

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(utc);

// =============================================================================
// ABI DEFINITIONS
// =============================================================================

/**
 * Clocktower contract ABI (only includes required functions)
 */
export const CLOCKTOWER_ABI = [
  {
    name: 'remit',
    type: 'function',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'nextUncheckedDay',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'getIdByTime',
    type: 'function',
    inputs: [
      { name: 'frequency', type: 'uint256' },
      { name: 'dueDay', type: 'uint16' }
    ],
    outputs: [{ type: 'bytes32[]' }],
    stateMutability: 'view',
  },
  {
    name: 'maxRemits',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
];

/**
 * ERC20 ABI for token balance checks
 */
export const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'decimals',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    name: 'symbol',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'string' }],
    stateMutability: 'view',
  },
  {
    name: 'name',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'string' }],
    stateMutability: 'view',
  },
];

// =============================================================================
// DATE/TIME UTILITIES
// =============================================================================

/**
 * Get current day number (days since Unix epoch)
 * @returns {number} Current day number
 */
export function getCurrentDay() {
  const currentTime = Math.floor(Date.now() / 1000); // Convert to seconds
  return Math.floor(currentTime / 86400);
}

/**
 * Get current UTC timestamp
 * @returns {number} Current UTC timestamp in seconds
 */
export function getCurrentTimestamp() {
  return Math.floor(Date.now() / 1000);
}

/**
 * Convert day number to dayjs UTC object
 * @param {number} dayNumber - Day number
 * @returns {dayjs.Dayjs} Dayjs UTC object
 */
export function dayNumberToDayjs(dayNumber) {
  const unixTime = dayNumber * 86400; // Convert to Unix epoch time
  return dayjs.utc(unixTime * 1000); // Convert to dayjs UTC object (multiply by 1000 for milliseconds)
}

/**
 * Get day of week (1-7, where Sunday = 7)
 * @param {dayjs.Dayjs} day - Dayjs object
 * @returns {number} Day of week (1-7)
 */
export function getDayOfWeek(day) {
  return day.day() === 0 ? 7 : day.day();
}

/**
 * Get day of month (1-31)
 * @param {dayjs.Dayjs} day - Dayjs object
 * @returns {number} Day of month
 */
export function getDayOfMonth(day) {
  return day.date();
}

/**
 * Get day of quarter (1-92)
 * @param {dayjs.Dayjs} day - Dayjs object
 * @returns {number} Day of quarter
 */
export function getDayOfQuarter(day) {
  const month = day.month(); // 0-11
  const quarter = Math.floor(month / 3); // 0, 1, 2, 3
  const quarterStartMonth = quarter * 3; // 0, 3, 6, 9
  const quarterStart = dayjs.utc().year(day.year()).month(quarterStartMonth).date(1);
  return day.diff(quarterStart, 'day') + 1;
}

/**
 * Get day of year (1-366)
 * @param {dayjs.Dayjs} day - Dayjs object
 * @returns {number} Day of year
 */
export function getDayOfYear(day) {
  return day.diff(day.startOf('year'), 'day') + 1;
}

// =============================================================================
// FREQUENCY UTILITIES
// =============================================================================

/**
 * Frequency types
 */
export const FREQUENCY_TYPES = {
  WEEKLY: 0,
  MONTHLY: 1,
  QUARTERLY: 2,
  YEARLY: 3
};

/**
 * Get frequency name
 * @param {number} frequency - Frequency number
 * @returns {string} Frequency name
 */
export function getFrequencyName(frequency) {
  const names = {
    [FREQUENCY_TYPES.WEEKLY]: 'weekly',
    [FREQUENCY_TYPES.MONTHLY]: 'monthly',
    [FREQUENCY_TYPES.QUARTERLY]: 'quarterly',
    [FREQUENCY_TYPES.YEARLY]: 'yearly'
  };
  return names[frequency] || 'unknown';
}

/**
 * Get due day for a specific frequency and day
 * @param {number} frequency - Frequency type
 * @param {dayjs.Dayjs} day - Dayjs object
 * @returns {Object} Due day info
 */
export function getDueDay(frequency, day) {
  let dueDay;
  let shouldSkip = false;
  let skipReason = null;

  switch (frequency) {
    case FREQUENCY_TYPES.WEEKLY:
      dueDay = getDayOfWeek(day);
      break;
    
    case FREQUENCY_TYPES.MONTHLY:
      const dayOfMonth = getDayOfMonth(day);
      if (dayOfMonth > 28) {
        shouldSkip = true;
        skipReason = `Day of month (${dayOfMonth}) exceeds limit of 28`;
      } else {
        dueDay = dayOfMonth;
      }
      break;
    
    case FREQUENCY_TYPES.QUARTERLY:
      const dayOfQuarter = getDayOfQuarter(day);
      if (dayOfQuarter <= 0 || dayOfQuarter > 90) {
        shouldSkip = true;
        skipReason = `Day of quarter (${dayOfQuarter}) is invalid or exceeds limit of 90`;
      } else {
        dueDay = dayOfQuarter;
      }
      break;
    
    case FREQUENCY_TYPES.YEARLY:
      const dayOfYear = getDayOfYear(day);
      if (dayOfYear <= 0 || dayOfYear > 365) {
        shouldSkip = true;
        skipReason = `Day of year (${dayOfYear}) is invalid or exceeds limit of 365`;
      } else {
        dueDay = dayOfYear;
      }
      break;
    
    default:
      shouldSkip = true;
      const frequencyName = getFrequencyName(frequency);
      skipReason = `Unknown frequency: ${frequencyName} (${frequency})`;
  }

  return {
    dueDay,
    shouldSkip,
    skipReason
  };
}

// =============================================================================
// VALIDATION UTILITIES
// =============================================================================

/**
 * Validate Ethereum address
 * @param {string} address - Address to validate
 * @returns {boolean} True if valid
 */
export function isValidAddress(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Validate private key
 * @param {string} privateKey - Private key to validate
 * @returns {boolean} True if valid
 */
export function isValidPrivateKey(privateKey) {
  return /^0x[a-fA-F0-9]{64}$/.test(privateKey);
}

/**
 * Validate chain ID
 * @param {number} chainId - Chain ID to validate
 * @returns {boolean} True if valid
 */
export function isValidChainId(chainId) {
  return Number.isInteger(chainId) && chainId > 0;
}

// =============================================================================
// STRING UTILITIES
// =============================================================================

/**
 * Generate random execution ID
 * @param {string} prefix - Prefix for the ID
 * @returns {string} Random execution ID
 */
export function generateExecutionId(prefix = 'exec') {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 11);
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Format address for display (first 6 + last 4 characters)
 * @param {string} address - Full address
 * @returns {string} Formatted address
 */
export function formatAddress(address) {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Format transaction hash for display
 * @param {string} txHash - Transaction hash
 * @returns {string} Formatted transaction hash
 */
export function formatTxHash(txHash) {
  if (!txHash || txHash.length < 10) return txHash;
  return `${txHash.slice(0, 8)}...${txHash.slice(-6)}`;
}

// =============================================================================
// ERROR UTILITIES
// =============================================================================

/**
 * Create standardized error object
 * @param {string} message - Error message
 * @param {string} code - Error code
 * @param {Object} details - Additional error details
 * @returns {Error} Standardized error
 */
export function createError(message, code = 'UNKNOWN_ERROR', details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  error.timestamp = new Date().toISOString();
  return error;
}

/**
 * Check if error is a revert error
 * @param {Error} error - Error to check
 * @returns {boolean} True if revert error
 */
export function isRevertError(error) {
  return error.message?.includes('revert') || 
         error.message?.includes('execution reverted') ||
         error.code === 'CALL_EXCEPTION';
}

// =============================================================================
// CONFIGURATION UTILITIES
// =============================================================================

/**
 * Get environment variable with default
 * @param {string} key - Environment variable key
 * @param {*} defaultValue - Default value
 * @returns {*} Environment variable value or default
 */
export function getEnv(key, defaultValue = null) {
  return process.env[key] || defaultValue;
}

/**
 * Get required environment variable
 * @param {string} key - Environment variable key
 * @returns {string} Environment variable value
 * @throws {Error} If variable is not set
 */
export function getRequiredEnv(key) {
  const value = process.env[key];
  if (!value) {
    throw createError(`Required environment variable ${key} is not set`, 'MISSING_ENV_VAR');
  }
  return value;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Maximum recursion depth
 */
export const MAX_RECURSION_DEPTH = parseInt(process.env.MAX_RECURSION_DEPTH, 10) || 5;

/**
 * Gas limit for remit transactions
 */
export const GAS_LIMIT = parseInt(process.env.GAS_LIMIT, 10) || 1000000;

/**
 * Seconds in a day
 */
export const SECONDS_IN_DAY = 86400;

/**
 * Zero address
 */
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Zero hash
 */
export const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';

/** Multicall3 contract address (same on all supported chains) */
export const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';
