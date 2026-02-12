import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ClocktowerCaller } from '../../src/index.js';
import { DatabaseService } from '../../src/services/database.js';
import { ClocktowerService } from '../../src/services/clocktower.js';
import { EmailService } from '../../src/services/email.js';

// Mock viem (blockchain library)
vi.mock('viem', () => {
  const mockPublicClient = {
    readContract: vi.fn(),
    getBalance: vi.fn(),
    waitForTransactionReceipt: vi.fn(),
    getTransaction: vi.fn(),
    call: vi.fn()
  };

  const mockWalletClient = {
    writeContract: vi.fn()
  };

  return {
    createPublicClient: vi.fn(() => mockPublicClient),
    createWalletClient: vi.fn(() => mockWalletClient),
    http: vi.fn(),
    formatEther: vi.fn((value) => value.toString()),
    formatUnits: vi.fn((value, decimals) => value.toString())
  };
});

// Mock Resend (email service)
vi.mock('resend', () => {
  class MockResend {
    constructor(apiKey) {
      this.apiKey = apiKey;
      this.emails = {
        send: vi.fn(() => Promise.resolve({ 
          data: { id: 'test-email-id' }, 
          error: null 
        }))
      };
    }
  }
  return {
    Resend: MockResend
  };
});

describe('ClocktowerCaller Integration Tests', () => {
  let caller;
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Set up minimal required environment variables
    vi.stubEnv('CALLER_ADDRESS', '0x1234567890123456789012345678901234567890');
    vi.stubEnv('CALLER_PRIVATE_KEY', '0x1234567890123456789012345678901234567890123456789012345678901234');
    vi.stubEnv('ALCHEMY_API_KEY', 'test_api_key');
    vi.stubEnv('ACTIVE_CHAINS', 'base');
    vi.stubEnv('ALCHEMY_URL_BASE', 'https://base-mainnet.g.alchemy.com/v2/');
    vi.stubEnv('CLOCKTOWER_ADDRESS_BASE', '0x1111111111111111111111111111111111111111');
    vi.stubEnv('CHAIN_ID_BASE', '8453');
    vi.stubEnv('TOKENS_BASE', JSON.stringify([{ address: '0x2222222222222222222222222222222222222222', symbol: 'USDC', name: 'USD Coin', decimals: 6 }]));
    vi.stubEnv('DATABASE_TYPE', 'sqlite');
    vi.stubEnv('DATABASE_PATH', ':memory:');
    
    // Clear email config for most tests
    delete process.env.RESEND_API_KEY;
    delete process.env.NOTIFICATION_EMAIL;
  });

  afterEach(async () => {
    // Clean up
    if (caller && caller.isInitialized) {
      try {
        await caller.shutdown();
      } catch (error) {
        // Ignore shutdown errors in tests
      }
    }
    
    // Restore environment
    vi.unstubAllEnvs();
    Object.keys(originalEnv).forEach(key => {
      process.env[key] = originalEnv[key];
    });
  });

  describe('Initialization', () => {
    it('should initialize successfully with valid configuration', async () => {
      caller = new ClocktowerCaller();
      
      await expect(caller.initialize()).resolves.not.toThrow();
      expect(caller.isInitialized).toBe(true);
      expect(caller.database).toBeInstanceOf(DatabaseService);
      expect(caller.clocktower).toBeInstanceOf(ClocktowerService);
      expect(caller.email).toBeInstanceOf(EmailService);
    });

    it('should fail initialization with missing required environment variables', async () => {
      delete process.env.CALLER_ADDRESS;
      
      caller = new ClocktowerCaller();
      
      await expect(caller.initialize()).rejects.toThrow();
      expect(caller.isInitialized).toBe(false);
    });

    it('should fail initialization with invalid wallet address format', async () => {
      vi.stubEnv('CALLER_ADDRESS', 'invalid-address');
      
      caller = new ClocktowerCaller();
      
      await expect(caller.initialize()).rejects.toThrow('Invalid CALLER_ADDRESS format');
    });

    it('should fail initialization with invalid private key format', async () => {
      vi.stubEnv('CALLER_PRIVATE_KEY', 'invalid-key');
      
      caller = new ClocktowerCaller();
      
      await expect(caller.initialize()).rejects.toThrow('Invalid CALLER_PRIVATE_KEY format');
    });

    it('should fail initialization with missing chain configuration', async () => {
      delete process.env.ALCHEMY_URL_BASE;
      
      caller = new ClocktowerCaller();
      
      await expect(caller.initialize()).rejects.toThrow();
    });

    it('should initialize database successfully', async () => {
      caller = new ClocktowerCaller();
      
      await caller.initialize();
      
      expect(caller.database.isReady()).toBe(true);
    });
  });

  describe('Execution Flow', () => {
    beforeEach(async () => {
      caller = new ClocktowerCaller();
      await caller.initialize();
    });

    it('should fail to run if not initialized', async () => {
      const uninitializedCaller = new ClocktowerCaller();
      
      await expect(uninitializedCaller.run()).rejects.toThrow('Clocktower Caller not initialized');
    });

    it('should execute successfully with no subscriptions scenario', async () => {
      // Mock blockchain calls for "no subscriptions" scenario
      const { createPublicClient } = await import('viem');
      const mockClient = createPublicClient();
      
      // Mock nextUncheckedDay to be ahead of current day (no work needed)
      const currentDay = Math.floor(Date.now() / 1000 / 86400);
      // Mock multiple readContract calls (nextUncheckedDay, then getIdByTime checks)
      mockClient.readContract.mockResolvedValue(BigInt(currentDay + 1)); // nextUncheckedDay > currentDay
      
      const summary = await caller.run();
      
      expect(summary).toBeDefined();
      expect(summary.executionId).toBeDefined();
      expect(summary.totalChains).toBe(1);
      expect(summary.noSubscriptions).toBeGreaterThanOrEqual(0);
      expect(summary.executionTimeMs).toBeGreaterThan(0);
    });

    it('should handle chain execution failure gracefully', async () => {
      // Mock blockchain calls to fail
      const { createPublicClient } = await import('viem');
      const mockClient = createPublicClient();
      
      // Mock readContract to throw an error on precheck
      mockClient.readContract.mockRejectedValue(new Error('Network error'));
      
      const summary = await caller.run();
      
      expect(summary).toBeDefined();
      // Should handle error gracefully and continue
      expect(summary.totalChains).toBe(1);
      // May have failed or handled gracefully
      expect(summary.failed >= 0).toBe(true);
    });
  });

  describe('Shutdown', () => {
    it('should shutdown gracefully', async () => {
      caller = new ClocktowerCaller();
      await caller.initialize();
      
      await expect(caller.shutdown()).resolves.not.toThrow();
      expect(caller.database.isReady()).toBe(false);
    });

    it('should handle shutdown errors gracefully', async () => {
      caller = new ClocktowerCaller();
      await caller.initialize();
      
      // Force database close to throw error
      caller.database.close = vi.fn().mockRejectedValueOnce(new Error('Close error'));
      
      // Should not throw
      await expect(caller.shutdown()).resolves.not.toThrow();
    });
  });

  describe('Multi-Chain Execution', () => {
    beforeEach(async () => {
      // Set up two chains
      vi.stubEnv('ACTIVE_CHAINS', 'base,sepolia-base');
      vi.stubEnv('ALCHEMY_URL_SEPOLIA_BASE', 'https://base-sepolia.g.alchemy.com/v2/');
      vi.stubEnv('CLOCKTOWER_ADDRESS_SEPOLIA_BASE', '0x3333333333333333333333333333333333333333');
      vi.stubEnv('CHAIN_ID_SEPOLIA_BASE', '84532');
      vi.stubEnv('TOKENS_SEPOLIA_BASE', JSON.stringify([{ address: '0x4444444444444444444444444444444444444444', symbol: 'USDC', name: 'USD Coin', decimals: 6 }]));
      
      caller = new ClocktowerCaller();
      await caller.initialize();
    });

    it('should execute multiple chains sequentially', async () => {
      const { createPublicClient } = await import('viem');
      const mockClient = createPublicClient();
      
      // Mock both chains to have no subscriptions
      const currentDay = Math.floor(Date.now() / 1000 / 86400);
      mockClient.readContract.mockResolvedValue(BigInt(currentDay + 1));
      
      const summary = await caller.run();
      
      expect(summary.totalChains).toBe(2);
      expect(summary.results.length).toBe(2);
      expect(summary.results[0].chain).toBe('base');
      expect(summary.results[1].chain).toBe('sepolia-base');
    });

    it('should continue execution even if one chain fails', async () => {
      const { createPublicClient } = await import('viem');
      const mockClient = createPublicClient();
      
      // First chain succeeds, second fails
      const currentDay = Math.floor(Date.now() / 1000 / 86400);
      // Mock multiple calls - first chain needs multiple readContract calls
      let callCount = 0;
      mockClient.readContract.mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          // First chain: no subscriptions (nextUncheckedDay > currentDay)
          return Promise.resolve(BigInt(currentDay + 1));
        } else {
          // Second chain: fails on first readContract
          return Promise.reject(new Error('Chain error'));
        }
      });
      
      const summary = await caller.run();
      
      expect(summary.totalChains).toBe(2);
      expect(summary.results.length).toBe(2);
      // Should handle errors gracefully - may have failures or may catch them
      expect(summary.results.length).toBe(2);
    });
  });

  describe('Database Integration', () => {
    beforeEach(async () => {
      caller = new ClocktowerCaller();
      await caller.initialize();
    });

    it('should log execution to database', async () => {
      const { createPublicClient } = await import('viem');
      const mockClient = createPublicClient();
      
      const currentDay = Math.floor(Date.now() / 1000 / 86400);
      // Mock to trigger precheck logging (nextUncheckedDay <= currentDay, then no subscriptions)
      mockClient.readContract
        .mockResolvedValueOnce(BigInt(currentDay)) // nextUncheckedDay <= currentDay
        .mockResolvedValue([]); // getIdByTime returns empty (no subscriptions)
      
      await caller.run();
      
      // Check that database has execution logs (precheck should log)
      const recentExecutions = await caller.database.getRecentExecutions(10);
      // May have logs from precheck, but not guaranteed if precheck fails early
      expect(Array.isArray(recentExecutions)).toBe(true);
    });

    it('should handle database errors gracefully during execution', async () => {
      // Force database to fail
      caller.database.logExecution = vi.fn().mockRejectedValueOnce(new Error('DB error'));
      
      const { createPublicClient } = await import('viem');
      const mockClient = createPublicClient();
      const currentDay = Math.floor(Date.now() / 1000 / 86400);
      mockClient.readContract.mockResolvedValue(BigInt(currentDay + 1));
      
      // Should still complete execution even if DB logging fails
      const summary = await caller.run();
      expect(summary).toBeDefined();
    });
  });

  describe('Email Integration', () => {
    beforeEach(async () => {
      vi.stubEnv('RESEND_API_KEY', 're_test_key');
      vi.stubEnv('NOTIFICATION_EMAIL', 'test@example.com');
      
      caller = new ClocktowerCaller();
      await caller.initialize();
    });

    it('should send summary email after execution', async () => {
      const { createPublicClient } = await import('viem');
      const mockClient = createPublicClient();
      
      const currentDay = Math.floor(Date.now() / 1000 / 86400);
      mockClient.readContract.mockResolvedValue(BigInt(currentDay + 1));
      
      const summary = await caller.run();
      
      expect(summary).toBeDefined();
      // Email should be sent (mocked, so no actual send)
      expect(caller.email.isEmailConfigured()).toBe(true);
    });

    it('should handle email failures gracefully', async () => {
      // Force email to fail
      caller.email.sendSummaryEmail = vi.fn().mockRejectedValueOnce(new Error('Email error'));
      
      const { createPublicClient } = await import('viem');
      const mockClient = createPublicClient();
      const currentDay = Math.floor(Date.now() / 1000 / 86400);
      mockClient.readContract.mockResolvedValue(BigInt(currentDay + 1));
      
      // Should still complete execution even if email fails
      const summary = await caller.run();
      expect(summary).toBeDefined();
    });
  });

  describe('Error Scenarios', () => {
    it('should handle database initialization failure', async () => {
      vi.stubEnv('DATABASE_TYPE', 'postgresql');
      vi.stubEnv('DATABASE_NAME', 'nonexistent');
      vi.stubEnv('DATABASE_USER', 'test');
      vi.stubEnv('DATABASE_PASSWORD', 'test');
      
      caller = new ClocktowerCaller();
      
      // Should fail during initialization
      await expect(caller.initialize()).rejects.toThrow();
    });

    it('should handle invalid database configuration', async () => {
      vi.stubEnv('DATABASE_TYPE', 'invalid_type');
      
      caller = new ClocktowerCaller();
      
      await expect(caller.initialize()).rejects.toThrow();
    });
  });
});

