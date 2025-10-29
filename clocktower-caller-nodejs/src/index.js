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

// Load environment variables
config();

class ClocktowerCaller {
  constructor() {
    this.logger = new Logger('ClocktowerCaller');
    this.database = new DatabaseService();
    this.clocktower = new ClocktowerService();
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
    const required = [
      'CALLER_ADDRESS',
      'CALLER_PRIVATE_KEY',
      'ALCHEMY_API_KEY'
    ];

    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    // Validate wallet configuration
    if (!process.env.CALLER_ADDRESS.match(/^0x[a-fA-F0-9]{40}$/)) {
      throw new Error('Invalid CALLER_ADDRESS format');
    }

    if (!process.env.CALLER_PRIVATE_KEY.match(/^0x[a-fA-F0-9]{64}$/)) {
      throw new Error('Invalid CALLER_PRIVATE_KEY format');
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

      // Calculate summary
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      const total = results.length;
      const executionTime = Date.now() - startTime;

      const summary = {
        executionId,
        totalChains: total,
        successful,
        failed,
        successRate: total > 0 ? Math.round((successful / total) * 100) : 0,
        executionTimeMs: executionTime,
        results
      };

      this.logger.info(`Execution completed: ${successful}/${total} successful (${summary.successRate}%)`);
      this.logger.info(`Total execution time: ${executionTime}ms`);

      // Log failed chains
      if (failed > 0) {
        const failedChains = results.filter(r => !r.success).map(r => r.chain);
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
    console.log(`Successful: ${summary.successful} ✅`);
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
