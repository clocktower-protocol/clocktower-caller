import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getCurrentDay,
  getCurrentTimestamp,
  dayNumberToDayjs,
  getDayOfWeek,
  getDayOfMonth,
  getDayOfQuarter,
  getDayOfYear,
  FREQUENCY_TYPES,
  getFrequencyName,
  getDueDay,
  isValidAddress,
  isValidPrivateKey,
  isValidChainId,
  generateExecutionId,
  formatAddress,
  formatTxHash,
  createError,
  isRevertError,
  getEnv,
  getRequiredEnv,
  MAX_RECURSION_DEPTH,
  GAS_LIMIT,
  ZERO_ADDRESS,
  ZERO_HASH,
  SECONDS_IN_DAY
} from '../../src/utils/helpers.js';
import dayjs from 'dayjs';

describe('Helper Utilities', () => {
  describe('Date/Time Utilities', () => {
    it('should get current day number', () => {
      const day = getCurrentDay();
      expect(day).toBeTypeOf('number');
      expect(day).toBeGreaterThan(19000); // Should be a reasonable day number
    });

    it('should get current timestamp', () => {
      const timestamp = getCurrentTimestamp();
      expect(timestamp).toBeTypeOf('number');
      expect(timestamp).toBeGreaterThan(1600000000); // Should be a reasonable timestamp
    });

    it('should convert day number to dayjs UTC object', () => {
      const dayNumber = 20000;
      const dayjsObj = dayNumberToDayjs(dayNumber);
      expect(dayjsObj).toBeDefined();
      expect(dayjsObj.isValid()).toBe(true);
    });

    it('should get day of week (Sunday = 7)', () => {
      // Test with a known date: 2024-01-07 is a Sunday
      const sunday = dayjs.utc('2024-01-07');
      expect(getDayOfWeek(sunday)).toBe(7);
      
      // Test with a Monday: 2024-01-08
      const monday = dayjs.utc('2024-01-08');
      expect(getDayOfWeek(monday)).toBe(1);
    });

    it('should get day of month', () => {
      const day = dayjs.utc('2024-01-15');
      expect(getDayOfMonth(day)).toBe(15);
    });

    it('should get day of quarter', () => {
      // January 1st should be day 1 of quarter
      const jan1 = dayjs.utc('2024-01-01');
      const jan1Day = getDayOfQuarter(jan1);
      expect(jan1Day).toBeGreaterThan(0);
      expect(jan1Day).toBeLessThanOrEqual(92);
      
      // April 1st should be day 1 of Q2
      const apr1 = dayjs.utc('2024-04-01');
      const apr1Day = getDayOfQuarter(apr1);
      expect(apr1Day).toBeGreaterThan(0);
      expect(apr1Day).toBeLessThanOrEqual(92);
    });

    it('should get day of year', () => {
      // January 1st should be day 1
      const jan1 = dayjs.utc('2024-01-01');
      expect(getDayOfYear(jan1)).toBe(1);
      
      // December 31st should be day 366 (leap year) or 365
      const dec31 = dayjs.utc('2024-12-31');
      expect(getDayOfYear(dec31)).toBeGreaterThan(360);
    });
  });

  describe('Frequency Utilities', () => {
    it('should have correct frequency type constants', () => {
      expect(FREQUENCY_TYPES.WEEKLY).toBe(0);
      expect(FREQUENCY_TYPES.MONTHLY).toBe(1);
      expect(FREQUENCY_TYPES.QUARTERLY).toBe(2);
      expect(FREQUENCY_TYPES.YEARLY).toBe(3);
    });

    it('should get frequency name', () => {
      expect(getFrequencyName(0)).toBe('weekly');
      expect(getFrequencyName(1)).toBe('monthly');
      expect(getFrequencyName(2)).toBe('quarterly');
      expect(getFrequencyName(3)).toBe('yearly');
      expect(getFrequencyName(99)).toBe('unknown');
    });

    it('should get due day for weekly frequency', () => {
      const day = dayjs.utc('2024-01-07'); // Sunday
      const result = getDueDay(FREQUENCY_TYPES.WEEKLY, day);
      expect(result.dueDay).toBe(7);
      expect(result.shouldSkip).toBe(false);
    });

    it('should get due day for monthly frequency', () => {
      const day = dayjs.utc('2024-01-15');
      const result = getDueDay(FREQUENCY_TYPES.MONTHLY, day);
      expect(result.dueDay).toBe(15);
      expect(result.shouldSkip).toBe(false);
    });

    it('should skip monthly frequency if day > 28', () => {
      const day = dayjs.utc('2024-01-29');
      const result = getDueDay(FREQUENCY_TYPES.MONTHLY, day);
      expect(result.shouldSkip).toBe(true);
      expect(result.skipReason).toContain('exceeds limit of 28');
    });

    it('should get due day for quarterly frequency', () => {
      const day = dayjs.utc('2024-01-15');
      const result = getDueDay(FREQUENCY_TYPES.QUARTERLY, day);
      // Day 15 of January should be a valid day in Q1 (between 1 and 90)
      expect(result.dueDay).toBeGreaterThan(0);
      expect(result.dueDay).toBeLessThanOrEqual(90);
      expect(result.shouldSkip).toBe(false);
    });

    it('should get due day for yearly frequency', () => {
      const day = dayjs.utc('2024-06-15');
      const result = getDueDay(FREQUENCY_TYPES.YEARLY, day);
      expect(result.dueDay).toBeGreaterThan(0);
      expect(result.dueDay).toBeLessThanOrEqual(365);
      expect(result.shouldSkip).toBe(false);
    });

    it('should skip unknown frequency', () => {
      const day = dayjs.utc('2024-01-15');
      const result = getDueDay(99, day);
      expect(result.shouldSkip).toBe(true);
      expect(result.skipReason).toContain('Unknown frequency');
    });
  });

  describe('Validation Utilities', () => {
    it('should validate Ethereum address', () => {
      expect(isValidAddress('0x1234567890123456789012345678901234567890')).toBe(true);
      expect(isValidAddress('0x0000000000000000000000000000000000000000')).toBe(true);
      expect(isValidAddress('0x123456789012345678901234567890123456789')).toBe(false); // Too short
      expect(isValidAddress('1234567890123456789012345678901234567890')).toBe(false); // No 0x
      expect(isValidAddress('0x123456789012345678901234567890123456789g')).toBe(false); // Invalid char
    });

    it('should validate private key', () => {
      expect(isValidPrivateKey('0x1234567890123456789012345678901234567890123456789012345678901234')).toBe(true);
      expect(isValidPrivateKey('0x0000000000000000000000000000000000000000000000000000000000000000')).toBe(true);
      expect(isValidPrivateKey('0x123456789012345678901234567890123456789012345678901234567890123')).toBe(false); // Too short
      expect(isValidPrivateKey('1234567890123456789012345678901234567890123456789012345678901234')).toBe(false); // No 0x
    });

    it('should validate chain ID', () => {
      expect(isValidChainId(1)).toBe(true);
      expect(isValidChainId(8453)).toBe(true);
      expect(isValidChainId(0)).toBe(false);
      expect(isValidChainId(-1)).toBe(false);
      expect(isValidChainId(1.5)).toBe(false);
      expect(isValidChainId('1')).toBe(false);
    });
  });

  describe('String Utilities', () => {
    it('should generate execution ID', () => {
      const id = generateExecutionId('test');
      expect(id).toMatch(/^test_\d+_[a-z0-9]+$/);
    });

    it('should generate execution ID with default prefix', () => {
      const id = generateExecutionId();
      expect(id).toMatch(/^exec_\d+_[a-z0-9]+$/);
    });

    it('should format address', () => {
      const address = '0x1234567890123456789012345678901234567890';
      const formatted = formatAddress(address);
      expect(formatted).toBe('0x1234...7890');
    });

    it('should format short address', () => {
      const address = '0x1234';
      const formatted = formatAddress(address);
      expect(formatted).toBe(address);
    });

    it('should format transaction hash', () => {
      const txHash = '0x1234567890123456789012345678901234567890123456789012345678901234';
      const formatted = formatTxHash(txHash);
      // formatTxHash uses slice(0, 8) and slice(-6)
      // So: first 8 chars + "..." + last 6 chars
      expect(formatted).toBe('0x123456...901234');
    });

    it('should format short transaction hash', () => {
      const txHash = '0x1234';
      const formatted = formatTxHash(txHash);
      expect(formatted).toBe(txHash);
    });
  });

  describe('Error Utilities', () => {
    it('should create standardized error', () => {
      const error = createError('Test error', 'TEST_ERROR', { detail: 'test' });
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.details).toEqual({ detail: 'test' });
      expect(error.timestamp).toBeDefined();
    });

    it('should create error with defaults', () => {
      const error = createError('Test error');
      expect(error.code).toBe('UNKNOWN_ERROR');
      expect(error.details).toEqual({});
    });

    it('should detect revert error', () => {
      const revertError1 = { message: 'execution reverted' };
      expect(isRevertError(revertError1)).toBe(true);

      const revertError2 = { message: 'revert' };
      expect(isRevertError(revertError2)).toBe(true);

      const revertError3 = { code: 'CALL_EXCEPTION' };
      expect(isRevertError(revertError3)).toBe(true);

      const normalError = { message: 'Some other error' };
      expect(isRevertError(normalError)).toBe(false);
    });
  });

  describe('Environment Utilities', () => {
    beforeEach(() => {
      vi.stubEnv('TEST_VAR', 'test_value');
    });

    it('should get environment variable', () => {
      expect(getEnv('TEST_VAR')).toBe('test_value');
    });

    it('should return default for missing env var', () => {
      expect(getEnv('MISSING_VAR', 'default')).toBe('default');
    });

    it('should get required environment variable', () => {
      expect(getRequiredEnv('TEST_VAR')).toBe('test_value');
    });

    it('should throw for missing required env var', () => {
      expect(() => getRequiredEnv('MISSING_REQUIRED_VAR')).toThrow();
    });
  });

  describe('Constants', () => {
    it('should have correct constants', () => {
      expect(MAX_RECURSION_DEPTH).toBeTypeOf('number');
      expect(GAS_LIMIT).toBeTypeOf('number');
      expect(SECONDS_IN_DAY).toBe(86400);
      expect(ZERO_ADDRESS).toBe('0x0000000000000000000000000000000000000000');
      expect(ZERO_HASH).toBe('0x0000000000000000000000000000000000000000000000000000000000000000');
    });
  });
});

