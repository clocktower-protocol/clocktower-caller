#!/usr/bin/env node

/**
 * Create Wallet Script
 * 
 * CLI tool for creating new Ethereum wallets.
 * Can be run standalone or imported as a module.
 */

import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { randomBytes } from 'crypto';
import { writeFileSync, existsSync } from 'fs';
import { Logger } from '../utils/logger.js';
import { isValidPrivateKey, isValidAddress } from '../utils/helpers.js';

class WalletCreator {
  constructor() {
    this.logger = new Logger('WalletCreator');
  }

  /**
   * Generate a new random private key
   * @returns {string} Private key with 0x prefix
   */
  generatePrivateKey() {
    const privateKey = `0x${randomBytes(32).toString('hex')}`;
    return privateKey;
  }

  /**
   * Create a new wallet from private key
   * @param {string} privateKey - Private key (optional, will generate if not provided)
   * @returns {Object} Wallet object with address and private key
   */
  createWallet(privateKey = null) {
    try {
      const key = privateKey || this.generatePrivateKey();
      
      if (!isValidPrivateKey(key)) {
        throw new Error('Invalid private key format');
      }

      const account = privateKeyToAccount(key);
      
      // Create wallet client for demonstration (optional)
      const walletClient = createWalletClient({
        account,
        chain: { id: 1 }, // Ethereum mainnet for demonstration
        transport: http()
      });

      return {
        address: account.address,
        privateKey: key,
        walletClient
      };
    } catch (error) {
      this.logger.error('Failed to create wallet', error);
      throw error;
    }
  }

  /**
   * Validate wallet creation
   * @param {Object} wallet - Wallet object
   * @returns {boolean} True if valid
   */
  validateWallet(wallet) {
    return isValidAddress(wallet.address) && isValidPrivateKey(wallet.privateKey);
  }

  /**
   * Save wallet to .env format
   * @param {Object} wallet - Wallet object
   * @param {string} filePath - File path to save to
   * @returns {boolean} True if saved successfully
   */
  saveToEnv(wallet, filePath = '.env.wallet') {
    try {
      const envContent = `# Generated wallet - ${new Date().toISOString()}
# SECURITY WARNING: This file contains a private key!
# - Copy these values to your main .env file
# - Delete this file after copying
# - Never commit this file to version control
CALLER_ADDRESS=${wallet.address}
CALLER_PRIVATE_KEY=${wallet.privateKey}

# Add these to your main .env file
`;

      writeFileSync(filePath, envContent);
      this.logger.info(`Wallet saved to ${filePath}`);
      this.logger.warn(`⚠️  SECURITY: Copy values to .env and delete ${filePath} after use`);
      return true;
    } catch (error) {
      this.logger.error('Failed to save wallet to file', error);
      return false;
    }
  }

  /**
   * Display wallet information
   * @param {Object} wallet - Wallet object
   * @param {boolean} showPrivateKey - Whether to show private key
   */
  displayWallet(wallet, showPrivateKey = true) {
    console.log('\n' + '='.repeat(60));
    console.log('NEW ETHEREUM WALLET CREATED');
    console.log('='.repeat(60));
    console.log(`Address: ${wallet.address}`);
    
    if (showPrivateKey) {
      console.log(`Private Key: ${wallet.privateKey}`);
    } else {
      console.log(`Private Key: [HIDDEN]`);
    }
    
    console.log(`Created: ${new Date().toISOString()}`);
    console.log('='.repeat(60));
    
    if (showPrivateKey) {
      console.log('\n⚠️  WARNING: Keep your private key secure!');
      console.log('   - Never share it with anyone');
      console.log('   - Store it in a secure location');
      console.log('   - Never commit it to version control');
      console.log('   - If saved to .env.wallet, copy to .env and delete .env.wallet');
      console.log('   - Consider using a secrets management service in production');
      console.log('   - Consider using a hardware wallet for production');
    }
  }

  /**
   * Create and display wallet
   * @param {Object} options - Options for wallet creation
   * @returns {Object} Created wallet
   */
  async createAndDisplay(options = {}) {
    const {
      privateKey = null,
      showPrivateKey = true,
      saveToFile = false,
      filePath = '.env.wallet'
    } = options;

    try {
      // Create wallet
      const wallet = this.createWallet(privateKey);
      
      // Validate wallet
      if (!this.validateWallet(wallet)) {
        throw new Error('Generated wallet is invalid');
      }

      // Display wallet
      this.displayWallet(wallet, showPrivateKey);

      // Save to file if requested
      if (saveToFile) {
        this.saveToEnv(wallet, filePath);
      }

      return wallet;
    } catch (error) {
      this.logger.error('Failed to create and display wallet', error);
      throw error;
    }
  }
}

// CLI execution
async function main() {
  const args = process.argv.slice(2);
  const options = {};

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--hide-key':
        options.showPrivateKey = false;
        break;
      case '--save':
        options.saveToFile = true;
        break;
      case '--file':
        if (i + 1 < args.length) {
          options.filePath = args[i + 1];
          i++; // Skip next argument
        }
        break;
      case '--private-key':
        if (i + 1 < args.length) {
          options.privateKey = args[i + 1];
          i++; // Skip next argument
        }
        break;
      case '--help':
        console.log(`
Usage: node createWallet.js [options]

Options:
  --hide-key              Hide private key in output
  --save                  Save wallet to .env file
  --file <path>           Specify file path for saving (default: .env.wallet)
  --private-key <key>     Use specific private key instead of generating
  --help                  Show this help message

Examples:
  node createWallet.js
  node createWallet.js --save
  node createWallet.js --hide-key --save --file my-wallet.env
  node createWallet.js --private-key 0x1234...
        `);
        process.exit(0);
        break;
    }
  }

  const creator = new WalletCreator();

  try {
    await creator.createAndDisplay(options);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { WalletCreator };
