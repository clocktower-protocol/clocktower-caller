import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EmailService } from '../../src/services/email.js';

// Mock Resend
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

describe('EmailService', () => {
  let service;

  beforeEach(() => {
    // Clear email env vars before each test
    delete process.env.RESEND_API_KEY;
    delete process.env.NOTIFICATION_EMAIL;
    delete process.env.SENDER_ADDRESS;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete process.env.RESEND_API_KEY;
    delete process.env.NOTIFICATION_EMAIL;
    delete process.env.SENDER_ADDRESS;
  });

  it('should initialize without email configuration', () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.NOTIFICATION_EMAIL;
    service = new EmailService();
    expect(service.isEmailConfigured()).toBe(false);
  });

  it('should initialize with email configuration', () => {
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.NOTIFICATION_EMAIL = 'test@example.com';
    
    service = new EmailService();
    expect(service.isEmailConfigured()).toBe(true);
  });

  it('should use default sender address if not provided', () => {
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.NOTIFICATION_EMAIL = 'test@example.com';
    
    service = new EmailService();
    expect(service.isEmailConfigured()).toBe(true);
  });

  describe('sendSuccessEmail', () => {
    it('should skip sending if not configured', async () => {
      delete process.env.RESEND_API_KEY;
      delete process.env.NOTIFICATION_EMAIL;
      service = new EmailService();
      const result = await service.sendSuccessEmail(
        'Base',
        '0x1234',
        '1.0',
        '0.9',
        [{ symbol: 'USDC', balanceBefore: '100.0', balanceAfter: '200.0' }],
        0
      );
      expect(result).toBeNull();
    });

    it('should send success email when configured', async () => {
      process.env.RESEND_API_KEY = 're_test_key';
      process.env.NOTIFICATION_EMAIL = 'test@example.com';
      
      service = new EmailService();
      const result = await service.sendSuccessEmail(
        'Base',
        '0x1234567890123456789012345678901234567890123456789012345678901234',
        '1.0',
        '0.9',
        [{ symbol: 'USDC', balanceBefore: '100.0', balanceAfter: '200.0' }],
        0
      );
      
      expect(result).toBeDefined();
      expect(result.id).toBe('test-email-id');
    });
  });

  describe('sendNoSubscriptionsEmail', () => {
    it('should skip sending if not configured', async () => {
      delete process.env.RESEND_API_KEY;
      delete process.env.NOTIFICATION_EMAIL;
      service = new EmailService();
      const result = await service.sendNoSubscriptionsEmail('Base', 20000, 20001);
      expect(result).toBeNull();
    });

    it('should send no subscriptions email when configured', async () => {
      process.env.RESEND_API_KEY = 're_test_key';
      process.env.NOTIFICATION_EMAIL = 'test@example.com';
      
      service = new EmailService();
      const result = await service.sendNoSubscriptionsEmail('Base', 20000, 20001);
      
      expect(result).toBeDefined();
    });
  });

  describe('sendSummaryEmail', () => {
    it('should skip sending if not configured', async () => {
      delete process.env.RESEND_API_KEY;
      delete process.env.NOTIFICATION_EMAIL;
      service = new EmailService();
      const results = [
        { chain: 'base', success: true, txCount: 1 },
        { chain: 'sepolia-base', success: false, error: 'Test error' }
      ];
      const result = await service.sendSummaryEmail(results);
      expect(result).toBeNull();
    });

    it('should send summary email when configured', async () => {
      process.env.RESEND_API_KEY = 're_test_key';
      process.env.NOTIFICATION_EMAIL = 'test@example.com';
      
      service = new EmailService();
      const results = [
        { chain: 'base', success: true, txCount: 1, status: 'executed' },
        { chain: 'sepolia-base', success: false, error: 'Test error', status: 'failed' }
      ];
      const result = await service.sendSummaryEmail(results);
      
      expect(result).toBeDefined();
    });
  });

  describe('getExplorerUrl', () => {
    it('should return correct explorer URL for Base', () => {
      process.env.RESEND_API_KEY = 're_test_key';
      process.env.NOTIFICATION_EMAIL = 'test@example.com';
      
      service = new EmailService();
      const url = service.getExplorerUrl('Base', '0x1234567890123456789012345678901234567890123456789012345678901234');
      expect(url).toContain('basescan.org');
    });

    it('should return correct explorer URL for Base Sepolia', () => {
      process.env.RESEND_API_KEY = 're_test_key';
      process.env.NOTIFICATION_EMAIL = 'test@example.com';
      
      service = new EmailService();
      const url = service.getExplorerUrl('Base Sepolia', '0x1234');
      expect(url).toContain('sepolia.basescan.org');
    });

    it('should return default explorer URL for unknown chain', () => {
      process.env.RESEND_API_KEY = 're_test_key';
      process.env.NOTIFICATION_EMAIL = 'test@example.com';
      
      service = new EmailService();
      const url = service.getExplorerUrl('Unknown Chain', '0x1234');
      expect(url).toContain('etherscan.io');
    });
  });

  describe('testEmailConfiguration', () => {
    it('should return false if not configured', async () => {
      delete process.env.RESEND_API_KEY;
      delete process.env.NOTIFICATION_EMAIL;
      service = new EmailService();
      const result = await service.testEmailConfiguration();
      expect(result).toBe(false);
    });

    it('should send test email when configured', async () => {
      process.env.RESEND_API_KEY = 're_test_key';
      process.env.NOTIFICATION_EMAIL = 'test@example.com';
      
      service = new EmailService();
      const result = await service.testEmailConfiguration();
      expect(result).toBe(true);
    });
  });
});

