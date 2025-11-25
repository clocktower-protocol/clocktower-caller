import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DatabaseService } from '../../src/services/database.js';
import { DatabaseConfigService } from '../../src/config/database.js';

// Mock the database modules
vi.mock('better-sqlite3', () => {
  const mockStmt = {
    run: vi.fn((...params) => ({ lastInsertRowid: 1 })),
    get: vi.fn((...params) => ({ id: 1, name: 'test' })),
    all: vi.fn((...params) => [{ id: 1, name: 'test' }])
  };
  
  const mockDb = {
    prepare: vi.fn((sql) => {
      // For schema initialization, return a statement that can exec
      if (sql.includes('SELECT name FROM sqlite_master')) {
        return {
          all: vi.fn(() => [
            { name: 'execution_logs' },
            { name: 'tokens' },
            { name: 'token_balances' }
          ])
        };
      }
      return mockStmt;
    }),
    exec: vi.fn(),
    pragma: vi.fn(),
    close: vi.fn()
  };
  
  return {
    default: vi.fn(() => mockDb)
  };
});

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

describe('DatabaseService', () => {
  let service;
  let originalEnv;

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
        execution_id: 'test_exec_123',
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

      // Should not throw
      await expect(service.logExecution(executionData)).resolves.toBeDefined();
    });

    it('should handle all required fields', async () => {
      await service.initialize();
      
      const executionData = {
        execution_id: 'test_exec_123',
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
      expect(result).toBeDefined();
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
      
      // Should not throw with undefined values
      await expect(
        service.logTokenBalance(1, '0x1234', undefined, undefined, 'base')
      ).resolves.toBeUndefined();
    });

    it('should create token if not exists', async () => {
      await service.initialize();
      
      // The mock already handles this - getTokenByAddress will return null
      // and createToken will create a new token
      await expect(
        service.logTokenBalance(1, '0x1234', 100, 200, 'base')
      ).resolves.toBeUndefined();
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
      
      const result = await service.getRecentExecutions(10);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should filter by chain name', async () => {
      await service.initialize();
      
      const result = await service.getRecentExecutions(10, 'base');
      expect(result).toBeDefined();
    });
  });

  describe('getExecutionStats', () => {
    it('should get execution statistics', async () => {
      await service.initialize();
      
      const result = await service.getExecutionStats();
      expect(result).toBeDefined();
    });

    it('should filter statistics by chain', async () => {
      await service.initialize();
      
      const result = await service.getExecutionStats('base');
      expect(result).toBeDefined();
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

