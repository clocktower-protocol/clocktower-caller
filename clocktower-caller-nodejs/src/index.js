#!/usr/bin/env node

/**
 * Clocktower Caller Node.js - Main Entry Point
 * 
 * One-shot execution application designed for system cron scheduling.
 * Executes remit transactions across all configured chains.
 */

import { config } from 'dotenv';
import { ClocktowerService } from './services/clocktower.js';
import { DatabaseService } from './services/database.js';
import { EmailService } from './services/email.js';
import { Logger } from './utils/logger.js';
import { getRequiredEnv } from './utils/helpers.js';
import { ChainConfigService } from './config/chainConfig.js';
import { DatabaseConfigService } from './config/database.js';

// Load environment variables
config();

class ClocktowerCaller {
  constructor() {
    this.logger = new Logger('ClocktowerCaller');
    this.database = new DatabaseService();
    this.clocktower = new ClocktowerService(this.database);
    this.email = new EmailService();
    this.isInitialized = false;
  }

  /**
   * Initialize all services
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      this.logger.info('Initializing Clocktower Caller...');

      // Validate required environment variables
      this.validateEnvironment();

      // Initialize database
      await this.database.initialize();

      // Test email configuration
      if (this.email.isEmailConfigured()) {
        this.logger.info('Email service configured');
      } else {
        this.logger.warn('Email service not configured - notifications will be disabled');
      }

      this.isInitialized = true;
      this.logger.info('Clocktower Caller initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Clocktower Caller', error);
      throw error;
    }
  }

  /**
   * Validate required environment variables
   * @throws {Error} If required variables are missing
   */
  validateEnvironment() {
    const errors = [];

    // Base required environment variables
    const required = [
      'CALLER_ADDRESS',
      'CALLER_PRIVATE_KEY',
      'ALCHEMY_API_KEY'
    ];

    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      errors.push(`Missing required environment variables: ${missing.join(', ')}`);
    }

    // Validate wallet configuration format
    if (process.env.CALLER_ADDRESS && !process.env.CALLER_ADDRESS.match(/^0x[a-fA-F0-9]{40}$/)) {
      errors.push('Invalid CALLER_ADDRESS format (must be a valid 40-character hex address starting with 0x)');
    }

    if (process.env.CALLER_PRIVATE_KEY && !process.env.CALLER_PRIVATE_KEY.match(/^0x[a-fA-F0-9]{64}$/)) {
      errors.push('Invalid CALLER_PRIVATE_KEY format (must be a valid 64-character hex private key starting with 0x)');
    }

    // Validate chain configurations
    try {
      const chainConfig = new ChainConfigService();
      const activeChains = process.env.ACTIVE_CHAINS?.split(',').map(chain => chain.trim()) || ['base'];
      
      for (const chainName of activeChains) {
        const normalizedName = chainName.toUpperCase().replace('-', '_');
        const chainRequired = [
          `ALCHEMY_URL_${normalizedName}`,
          `CLOCKTOWER_ADDRESS_${normalizedName}`,
          `CHAIN_ID_${normalizedName}`,
          `USDC_ADDRESS_${normalizedName}`
        ];

        const chainMissing = chainRequired.filter(key => !process.env[key]);
        
        if (chainMissing.length > 0) {
          errors.push(`Missing required environment variables for chain '${chainName}': ${chainMissing.join(', ')}`);
        }

        // Validate chain ID format if provided
        const chainId = process.env[`CHAIN_ID_${normalizedName}`];
        if (chainId && (isNaN(parseInt(chainId, 10)) || parseInt(chainId, 10) <= 0)) {
          errors.push(`Invalid CHAIN_ID_${normalizedName} format (must be a positive integer)`);
        }

        // Validate contract address formats if provided
        const clocktowerAddr = process.env[`CLOCKTOWER_ADDRESS_${normalizedName}`];
        if (clocktowerAddr && !clocktowerAddr.match(/^0x[a-fA-F0-9]{40}$/)) {
          errors.push(`Invalid CLOCKTOWER_ADDRESS_${normalizedName} format (must be a valid 40-character hex address)`);
        }

        const usdcAddr = process.env[`USDC_ADDRESS_${normalizedName}`];
        if (usdcAddr && !usdcAddr.match(/^0x[a-fA-F0-9]{40}$/)) {
          errors.push(`Invalid USDC_ADDRESS_${normalizedName} format (must be a valid 40-character hex address)`);
        }
      }

      // Check if any valid chains are configured
      const validChains = chainConfig.getAllActiveChains();
      if (validChains.length === 0) {
        errors.push('No valid chain configurations found. At least one chain must be properly configured.');
      }
    } catch (error) {
      errors.push(`Failed to validate chain configurations: ${error.message}`);
    }

    // Validate database configuration
    try {
      const dbConfig = new DatabaseConfigService();
      const validation = dbConfig.validateConfig();
      
      if (!validation.valid) {
        errors.push(...validation.errors);
      }
    } catch (error) {
      errors.push(`Failed to validate database configuration: ${error.message}`);
    }

    // If any errors found, throw comprehensive error message
    if (errors.length > 0) {
      const errorMessage = [
        'Environment validation failed:',
        ...errors.map(err => `  - ${err}`),
        '',
        'Please check your .env file and ensure all required variables are set correctly.',
        'See README.md for detailed configuration instructions.'
      ].join('\n');
      
      this.logger.error(errorMessage);
      throw new Error(errorMessage);
    }

    this.logger.info('Environment validation passed');
  }

  /**
   * Execute remit for all chains
   * @returns {Promise<Object>} Execution summary
   */
  async run() {
    if (!this.isInitialized) {
      throw new Error('Clocktower Caller not initialized');
    }

    const startTime = Date.now();
    const executionId = `main_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    try {
      this.logger.info(`Starting multi-chain execution: ${executionId}`);

      // Execute remit for all active chains
      const results = await this.clocktower.executeRemitForAllChains();

      // Calculate summary using detailed statuses
      const executed = results.filter(r => r.status === 'executed' && (r.txCount || 0) > 0).length;
      const noSubs = results.filter(r => r.status === 'no_subscriptions').length;
      const failed = results.filter(r => r.status === 'failed' || (!r.success && r.status !== 'no_subscriptions')).length;
      const total = results.length;
      const executionTime = Date.now() - startTime;

      const summary = {
        executionId,
        totalChains: total,
        successful: executed,
        failed,
        noSubscriptions: noSubs,
        successRate: total > 0 ? Math.round((executed / total) * 100) : 0,
        executionTimeMs: executionTime,
        results
      };

      this.logger.info(`Execution completed: ${executed}/${total} executed, ${noSubs} none, ${failed} failed`);
      this.logger.info(`Total execution time: ${executionTime}ms`);

      // Log failed chains
      if (failed > 0) {
        const failedChains = results.filter(r => r.status === 'failed' || (!r.success && r.status !== 'no_subscriptions')).map(r => r.chain);
        this.logger.warn(`Failed chains: ${failedChains.join(', ')}`);
      }

      return summary;
    } catch (error) {
      this.logger.error(`Multi-chain execution failed: ${executionId}`, error);
      throw error;
    }
  }

  /**
   * Graceful shutdown
   * @returns {Promise<void>}
   */
  async shutdown() {
    try {
      this.logger.info('Shutting down Clocktower Caller...');
      
      if (this.database.isReady()) {
        await this.database.close();
      }
      
      this.logger.info('Clocktower Caller shutdown complete');
    } catch (error) {
      this.logger.error('Error during shutdown', error);
    }
  }
}

// Main execution function
async function main() {
  const app = new ClocktowerCaller();
  
  // Handle process signals for graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT, shutting down gracefully...');
    await app.shutdown();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nReceived SIGTERM, shutting down gracefully...');
    await app.shutdown();
    process.exit(0);
  });

  process.on('uncaughtException', async (error) => {
    console.error('Uncaught Exception:', error);
    await app.shutdown();
    process.exit(1);
  });

  process.on('unhandledRejection', async (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    await app.shutdown();
    process.exit(1);
  });

  try {
    // Initialize application
    await app.initialize();

    // Run execution
    const summary = await app.run();

    // Log final summary
    console.log('\n' + '='.repeat(60));
    console.log('CLOCKTOWER CALLER EXECUTION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Execution ID: ${summary.executionId}`);
    console.log(`Total Chains: ${summary.totalChains}`);
    console.log(`Successful (executed): ${summary.successful} ✅`);
    console.log(`No Subscriptions: ${summary.noSubscriptions}`);
    console.log(`Failed: ${summary.failed} ❌`);
    console.log(`Success Rate: ${summary.successRate}%`);
    console.log(`Execution Time: ${summary.executionTimeMs}ms`);
    console.log('='.repeat(60));

    // Shutdown gracefully
    await app.shutdown();
    
    // Exit with appropriate code
    process.exit(summary.failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('Fatal error:', error.message);
    await app.shutdown();
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Unhandled error in main:', error);
    process.exit(1);
  });
}

export { ClocktowerCaller };
