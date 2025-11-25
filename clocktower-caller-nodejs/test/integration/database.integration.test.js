import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseService } from '../../src/services/database.js';
import { ClocktowerService } from '../../src/services/clocktower.js';

describe('Database Integration Tests', () => {
  let database;
  let clocktower;

  beforeEach(async () => {
    vi.stubEnv('DATABASE_TYPE', 'sqlite');
    vi.stubEnv('DATABASE_PATH', ':memory:');
    
    database = new DatabaseService();
    await database.initialize();
    
    clocktower = new ClocktowerService(database);
  });

  afterEach(async () => {
    if (database && database.isReady()) {
      await database.close();
    }
  });

  describe('Execution Logging Flow', () => {
    it('should log complete execution flow from precheck to transaction', async () => {
      const executionData = {
        execution_id: 'test_exec_123',
        timestamp: new Date().toISOString(),
        chain_name: 'base',
        chain_display_name: 'Base',
        precheck_passed: true,
        current_day: 20000,
        next_unchecked_day: 20001,
        should_proceed: false,
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
        execution_time_ms: 100
      };

      const logId = await database.logExecution(executionData);
      expect(logId).toBeDefined();
      expect(typeof logId).toBe('number');

      // Verify it was logged
      const recent = await database.getRecentExecutions(10);
      expect(recent.length).toBeGreaterThan(0);
      expect(recent[0].execution_id).toBe('test_exec_123');
    });

    it('should log execution with transaction details', async () => {
      const executionData = {
        execution_id: 'test_exec_with_tx',
        timestamp: new Date().toISOString(),
        chain_name: 'base',
        chain_display_name: 'Base',
        precheck_passed: true,
        current_day: null,
        next_unchecked_day: null,
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
        execution_time_ms: 500
      };

      const logId = await database.logExecution(executionData);
      expect(logId).toBeDefined();

      // Verify transaction details
      const recent = await database.getRecentExecutions(1);
      expect(recent[0].tx_hash).toBe(executionData.tx_hash);
      expect(recent[0].tx_status).toBe(1);
      expect(recent[0].gas_used).toBe(100000);
    });

    it('should log failed execution with error details', async () => {
      const executionData = {
        execution_id: 'test_exec_failed',
        timestamp: new Date().toISOString(),
        chain_name: 'base',
        chain_display_name: 'Base',
        precheck_passed: false,
        current_day: null,
        next_unchecked_day: null,
        should_proceed: false,
        tx_hash: null,
        tx_status: null,
        revert_reason: null,
        gas_used: null,
        balance_before_eth: null,
        balance_after_eth: null,
        recursion_depth: 0,
        max_recursion_reached: false,
        error_message: 'Network connection failed',
        error_stack: 'Error: Network connection failed\n    at ...',
        execution_time_ms: 50
      };

      const logId = await database.logExecution(executionData);
      expect(logId).toBeDefined();

      // Verify error was logged
      const recent = await database.getRecentExecutions(1);
      expect(recent[0].error_message).toBe('Network connection failed');
      expect(recent[0].precheck_passed).toBe(0); // SQLite boolean
    });
  });

  describe('Token Balance Logging', () => {
    it('should log token balance changes', async () => {
      // First, create an execution log
      const executionData = {
        execution_id: 'test_token_balance',
        timestamp: new Date().toISOString(),
        chain_name: 'base',
        chain_display_name: 'Base',
        precheck_passed: true,
        current_day: null,
        next_unchecked_day: null,
        should_proceed: true,
        tx_hash: '0x1234',
        tx_status: 1,
        revert_reason: null,
        gas_used: 100000,
        balance_before_eth: 1.0,
        balance_after_eth: 0.9,
        recursion_depth: 0,
        max_recursion_reached: false,
        error_message: null,
        error_stack: null,
        execution_time_ms: 200
      };

      const logId = await database.logExecution(executionData);

      // Log token balance
      await database.logTokenBalance(
        logId,
        '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
        100.0,
        200.0,
        'base'
      );

      // Verify token was created
      const token = await database.getTokenByAddress(
        '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        'base'
      );
      expect(token).toBeDefined();
    });

    it('should handle undefined token balance values', async () => {
      const executionData = {
        execution_id: 'test_undefined_balance',
        timestamp: new Date().toISOString(),
        chain_name: 'base',
        chain_display_name: 'Base',
        precheck_passed: true,
        current_day: null,
        next_unchecked_day: null,
        should_proceed: true,
        tx_hash: '0x1234',
        tx_status: 1,
        revert_reason: null,
        gas_used: 100000,
        balance_before_eth: 1.0,
        balance_after_eth: 0.9,
        recursion_depth: 0,
        max_recursion_reached: false,
        error_message: null,
        error_stack: null,
        execution_time_ms: 200
      };

      const logId = await database.logExecution(executionData);

      // Should not throw with undefined values
      await expect(
        database.logTokenBalance(logId, '0x1234', undefined, undefined, 'base')
      ).resolves.not.toThrow();
    });
  });

  describe('Query Operations', () => {
    beforeEach(async () => {
      // Create some test data
      const executions = [
        {
          execution_id: 'exec_1',
          timestamp: new Date(Date.now() - 10000).toISOString(),
          chain_name: 'base',
          chain_display_name: 'Base',
          precheck_passed: true,
          current_day: 20000,
          next_unchecked_day: 20001,
          should_proceed: false,
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
          execution_time_ms: 100
        },
        {
          execution_id: 'exec_2',
          timestamp: new Date(Date.now() - 5000).toISOString(),
          chain_name: 'base',
          chain_display_name: 'Base',
          precheck_passed: true,
          current_day: null,
          next_unchecked_day: null,
          should_proceed: true,
          tx_hash: '0x1234',
          tx_status: 1,
          revert_reason: null,
          gas_used: 100000,
          balance_before_eth: 1.0,
          balance_after_eth: 0.9,
          recursion_depth: 0,
          max_recursion_reached: false,
          error_message: null,
          error_stack: null,
          execution_time_ms: 200
        },
        {
          execution_id: 'exec_3',
          timestamp: new Date().toISOString(),
          chain_name: 'sepolia-base',
          chain_display_name: 'Base Sepolia',
          precheck_passed: true,
          current_day: null,
          next_unchecked_day: null,
          should_proceed: true,
          tx_hash: '0x5678',
          tx_status: 0,
          revert_reason: 'Insufficient gas',
          gas_used: 50000,
          balance_before_eth: 0.5,
          balance_after_eth: 0.5,
          recursion_depth: 0,
          max_recursion_reached: false,
          error_message: null,
          error_stack: null,
          execution_time_ms: 150
        }
      ];

      for (const exec of executions) {
        await database.logExecution(exec);
      }
    });

    it('should retrieve recent executions', async () => {
      const recent = await database.getRecentExecutions(10);
      
      expect(recent.length).toBe(3);
      // Should be ordered by timestamp DESC
      expect(recent[0].execution_id).toBe('exec_3');
      expect(recent[1].execution_id).toBe('exec_2');
      expect(recent[2].execution_id).toBe('exec_1');
    });

    it('should filter executions by chain', async () => {
      const baseExecutions = await database.getRecentExecutions(10, 'base');
      
      expect(baseExecutions.length).toBe(2);
      baseExecutions.forEach(exec => {
        expect(exec.chain_name).toBe('base');
      });
    });

    it('should get execution statistics', async () => {
      const stats = await database.getExecutionStats();
      
      expect(stats).toBeDefined();
      expect(stats.total_executions).toBe(3);
      expect(stats.successful_txs).toBe(1); // Only exec_2 has tx_status = 1
      expect(stats.avg_execution_time).toBeGreaterThan(0);
    });

    it('should get execution statistics for specific chain', async () => {
      const stats = await database.getExecutionStats('base');
      
      expect(stats).toBeDefined();
      expect(stats.total_executions).toBe(2);
    });
  });

  describe('Recursive Execution Logging', () => {
    it('should log multiple recursive executions', async () => {
      const baseExecutionId = 'test_recursive_base';
      
      // Log base execution
      const baseLogId = await database.logExecution({
        execution_id: baseExecutionId,
        timestamp: new Date().toISOString(),
        chain_name: 'base',
        chain_display_name: 'Base',
        precheck_passed: true,
        current_day: null,
        next_unchecked_day: null,
        should_proceed: true,
        tx_hash: '0x1111',
        tx_status: 1,
        revert_reason: null,
        gas_used: 100000,
        balance_before_eth: 1.0,
        balance_after_eth: 0.9,
        recursion_depth: 0,
        max_recursion_reached: false,
        error_message: null,
        error_stack: null,
        execution_time_ms: 100
      });

      // Log recursive execution
      const recursiveLogId = await database.logExecution({
        execution_id: `${baseExecutionId}_recursion_1`,
        timestamp: new Date().toISOString(),
        chain_name: 'base',
        chain_display_name: 'Base',
        precheck_passed: true,
        current_day: null,
        next_unchecked_day: null,
        should_proceed: true,
        tx_hash: '0x2222',
        tx_status: 1,
        revert_reason: null,
        gas_used: 100000,
        balance_before_eth: 0.9,
        balance_after_eth: 0.8,
        recursion_depth: 1,
        max_recursion_reached: false,
        error_message: null,
        error_stack: null,
        execution_time_ms: 100
      });

      expect(baseLogId).toBeDefined();
      expect(recursiveLogId).toBeDefined();
      expect(recursiveLogId).not.toBe(baseLogId);

      // Verify both are logged
      const recent = await database.getRecentExecutions(10);
      const recursiveExecs = recent.filter(e => e.execution_id.includes('test_recursive'));
      expect(recursiveExecs.length).toBeGreaterThanOrEqual(2);
    });
  });
});

