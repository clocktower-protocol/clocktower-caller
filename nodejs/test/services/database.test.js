import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DatabaseService } from '../../src/services/database.js';

vi.mock('pg', () => {
  const mockClient = {
    query: vi.fn(() => Promise.resolve({ rows: [{ id: 1 }] })),
    release: vi.fn()
  };
  
  const mockPool = {
    connect: vi.fn(() => Promise.resolve(mockClient)),
    end: vi.fn(() => Promise.resolve()),
    query: vi.fn(() => Promise.resolve({ rows: [{ id: 1 }] }))
  };
  
  return {
    Pool: vi.fn(() => mockPool)
  };
});

async function seedExecution(service, overrides = {}) {
  return service.logExecution({
    execution_id: overrides.execution_id ?? `test_exec_${Date.now()}_${Math.random()}`,
    timestamp: '2024-01-01T00:00:00Z',
    chain_name: 'base',
    chain_display_name: 'Base',
    precheck_passed: true,
    current_day: 20000,
    next_unchecked_day: 20001,
    should_proceed: true,
    tx_hash: null,
    tx_status: null,
    revert_reason: null,
    gas_used: null,
    balance_before_eth: null,
    balance_after_eth: null,
    recursion_depth: 0,
    max_recursion_reached: false,
    error_message: null,
    error_stack: null,
    execution_time_ms: 100,
    ...overrides
  });
}

describe('DatabaseService', () => {
  let service;

  beforeEach(() => {
    vi.stubEnv('DATABASE_TYPE', 'sqlite');
    vi.stubEnv('DATABASE_PATH', ':memory:');
    service = new DatabaseService();
  });

  afterEach(async () => {
    if (service && service.isReady()) {
      await service.close();
    }
  });

  describe('logExecution', () => {
    it('should convert undefined values to null for SQLite', async () => {
      await service.initialize();
      
      const executionData = {
        execution_id: 'test_exec_undefined',
        timestamp: '2024-01-01T00:00:00Z',
        chain_name: 'base',
        chain_display_name: 'Base',
        precheck_passed: true,
        current_day: undefined, // Should be converted to null
        next_unchecked_day: null,
        should_proceed: true,
        tx_hash: undefined,
        tx_status: undefined,
        revert_reason: undefined,
        gas_used: undefined,
        balance_before_eth: undefined,
        balance_after_eth: undefined,
        recursion_depth: 0,
        max_recursion_reached: false,
        error_message: undefined,
        error_stack: undefined,
        execution_time_ms: 100
      };

      const logId = await service.logExecution(executionData);
      expect(logId).toEqual(expect.any(Number));

      const recent = await service.getRecentExecutions(1);
      expect(recent[0].current_day).toBeNull();
      expect(recent[0].tx_hash).toBeNull();
    });

    it('should handle all required fields', async () => {
      await service.initialize();
      
      const executionData = {
        execution_id: 'test_exec_required',
        timestamp: '2024-01-01T00:00:00Z',
        chain_name: 'base',
        chain_display_name: 'Base',
        precheck_passed: true,
        current_day: 20000,
        next_unchecked_day: 20001,
        should_proceed: true,
        tx_hash: '0x1234567890123456789012345678901234567890123456789012345678901234',
        tx_status: 1,
        revert_reason: null,
        gas_used: 100000,
        balance_before_eth: 1.5,
        balance_after_eth: 1.4,
        recursion_depth: 0,
        max_recursion_reached: false,
        error_message: null,
        error_stack: null,
        execution_time_ms: 100
      };

      const result = await service.logExecution(executionData);
      expect(result).toEqual(expect.any(Number));

      const recent = await service.getRecentExecutions(1);
      expect(recent[0].execution_id).toBe('test_exec_required');
      expect(recent[0].tx_hash).toBe(executionData.tx_hash);
    });

    it('should throw if database not initialized', async () => {
      const executionData = {
        execution_id: 'test_exec_123',
        timestamp: '2024-01-01T00:00:00Z',
        chain_name: 'base',
        chain_display_name: 'Base',
        precheck_passed: true
      };

      await expect(service.logExecution(executionData)).rejects.toThrow('Database not initialized');
    });
  });

  describe('logTokenBalance', () => {
    it('should handle undefined values', async () => {
      await service.initialize();
      const logId = await seedExecution(service, { execution_id: 'test_token_undefined' });
      
      await expect(
        service.logTokenBalance(logId, '0x1234', undefined, undefined, 'base')
      ).resolves.toBeUndefined();
    });

    it('should create token if not exists', async () => {
      await service.initialize();
      const logId = await seedExecution(service, { execution_id: 'test_token_create' });
      const tokenAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

      await service.logTokenBalance(logId, tokenAddress, 100, 200, 'base');

      const token = await service.getTokenByAddress(tokenAddress, 'base');
      expect(token).toBeDefined();
      expect(token.token_address).toBe(tokenAddress);
      expect(token.token_symbol).toBe('UNKNOWN');
    });

    it('should throw if database not initialized', async () => {
      await expect(
        service.logTokenBalance(1, '0x1234', 100, 200, 'base')
      ).rejects.toThrow('Database not initialized');
    });
  });

  describe('getRecentExecutions', () => {
    it('should get recent executions', async () => {
      await service.initialize();
      await seedExecution(service, { execution_id: 'test_recent' });
      
      const result = await service.getRecentExecutions(10);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.some((row) => row.execution_id === 'test_recent')).toBe(true);
    });

    it('should filter by chain name', async () => {
      await service.initialize();
      await seedExecution(service, { execution_id: 'test_filter_base', chain_name: 'base' });
      await seedExecution(service, {
        execution_id: 'test_filter_sepolia',
        chain_name: 'sepolia-base',
        chain_display_name: 'Base Sepolia'
      });
      
      const result = await service.getRecentExecutions(10, 'base');
      expect(result.length).toBeGreaterThan(0);
      result.forEach((row) => {
        expect(row.chain_name).toBe('base');
      });
    });
  });

  describe('getExecutionStats', () => {
    it('should get execution statistics', async () => {
      await service.initialize();
      await seedExecution(service, { execution_id: 'test_stats', tx_status: 1 });
      
      const result = await service.getExecutionStats();
      expect(result).toBeDefined();
      expect(result.total_executions).toBeGreaterThanOrEqual(1);
    });

    it('should filter statistics by chain', async () => {
      await service.initialize();
      await seedExecution(service, { execution_id: 'test_stats_chain' });
      
      const result = await service.getExecutionStats('base');
      expect(result).toBeDefined();
      expect(result.total_executions).toBeGreaterThanOrEqual(1);
    });
  });

  describe('isReady', () => {
    it('should return false when not initialized', () => {
      expect(service.isReady()).toBe(false);
    });

    it('should return true when initialized', async () => {
      await service.initialize();
      expect(service.isReady()).toBe(true);
    });
  });

  describe('close', () => {
    it('should close SQLite connection', async () => {
      await service.initialize();
      await service.close();
      expect(service.isReady()).toBe(false);
    });
  });
});
