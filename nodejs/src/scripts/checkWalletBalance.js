#!/usr/bin/env node

/**
 * Check Wallet Balance Script
 * 
 * CLI tool for checking wallet balances across multiple chains.
 * Can be run standalone or imported as a module.
 */

import { config } from 'dotenv';
import { createPublicClient, http, formatEther, formatUnits } from 'viem';
import { ChainConfigService } from '../config/chainConfig.js';
import { Logger } from '../utils/logger.js';
import { isValidAddress } from '../utils/helpers.js';

// Load environment variables
config();

class WalletBalanceChecker {
  constructor() {
    this.chainConfig = new ChainConfigService();
    this.logger = new Logger('WalletBalanceChecker');
  }

  /**
   * Check balance for a specific chain
   * @param {Object} chain - Chain configuration
   * @param {string} address - Wallet address
   * @returns {Promise<Object>} Balance information
   */
  async checkChainBalance(chain, address) {
    try {
      const url = `${chain.alchemyUrl}${process.env.ALCHEMY_API_KEY}`;
      
      const publicClient = createPublicClient({
        chain: { id: chain.chainId },
        transport: http(url),
      });

      // Get ETH balance
      const ethBalance = await publicClient.getBalance({ address });
      const ethBalanceFormatted = formatEther(ethBalance);

      const erc20Abi = [{
        name: 'balanceOf',
        type: 'function',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ type: 'uint256' }],
        stateMutability: 'view',
      }];

      const tokenBalances = [];
      for (const token of chain.tokens) {
        try {
          const raw = await publicClient.readContract({
            address: token.address,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [address],
          });
          tokenBalances.push({ symbol: token.symbol, balance: formatUnits(raw, token.decimals) });
        } catch (error) {
          this.logger.warn(`Failed to get ${token.symbol} balance for ${chain.name}: ${error.message}`);
          tokenBalances.push({ symbol: token.symbol, balance: '0' });
        }
      }

      return {
        chain: chain.name,
        chainDisplayName: chain.displayName,
        address,
        ethBalance: ethBalanceFormatted,
        tokenBalances,
        usdcBalance: tokenBalances[0]?.balance ?? '0',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error(`Failed to check balance for ${chain.name}`, error);
      return {
        chain: chain.name,
        chainDisplayName: chain.displayName,
        address,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Check balance across all active chains
   * @param {string} address - Wallet address
   * @returns {Promise<Array>} Array of balance results
   */
  async checkAllChains(address) {
    const activeChains = this.chainConfig.getAllActiveChains();
    const results = [];

    this.logger.info(`Checking balance for ${address} across ${activeChains.length} chains`);

    for (const chain of activeChains) {
      const result = await this.checkChainBalance(chain, address);
      results.push(result);
    }

    return results;
  }

  /**
   * Format and display results
   * @param {Array} results - Balance results
   */
  displayResults(results) {
    console.log('\n' + '='.repeat(80));
    console.log('WALLET BALANCE CHECK RESULTS');
    console.log('='.repeat(80));

    results.forEach(result => {
      console.log(`\nChain: ${result.chainDisplayName} (${result.chain})`);
      console.log(`Address: ${result.address}`);
      
      if (result.error) {
        console.log(`❌ Error: ${result.error}`);
      } else {
        console.log(`💰 ETH Balance: ${result.ethBalance} ETH`);
        (result.tokenBalances || []).forEach(t => {
          console.log(`💵 ${t.symbol} Balance: ${t.balance}`);
        });
      }
      
      console.log(`⏰ Checked: ${result.timestamp}`);
    });

    console.log('\n' + '='.repeat(80));
  }

  /**
   * Get total balances across all chains
   * @param {Array} results - Balance results
   * @returns {Object} Total balances
   */
  getTotalBalances(results) {
    let totalEth = 0;
    let totalUsdc = 0;
    let errorCount = 0;

    results.forEach(result => {
      if (result.error) {
        errorCount++;
      } else {
        totalEth += parseFloat(result.ethBalance);
        totalUsdc += parseFloat(result.usdcBalance);
      }
    });

    return {
      totalEth: totalEth.toFixed(6),
      totalUsdc: totalUsdc.toFixed(6),
      errorCount,
      successCount: results.length - errorCount
    };
  }
}

// CLI execution
async function main() {
  const args = process.argv.slice(2);
  const address = args[0] || process.env.CALLER_ADDRESS;

  if (!address) {
    console.error('Error: Wallet address required');
    console.error('Usage: node checkWalletBalance.js [address]');
    console.error('Or set CALLER_ADDRESS environment variable');
    process.exit(1);
  }

  if (!isValidAddress(address)) {
    console.error('Error: Invalid wallet address format');
    process.exit(1);
  }

  const checker = new WalletBalanceChecker();

  try {
    const results = await checker.checkAllChains(address);
    checker.displayResults(results);

    const totals = checker.getTotalBalances(results);
    console.log(`\n📊 SUMMARY:`);
    console.log(`Total ETH: ${totals.totalEth} ETH`);
    console.log(`Total USDC: ${totals.totalUsdc} USDC`);
    console.log(`Successful checks: ${totals.successCount}`);
    console.log(`Failed checks: ${totals.errorCount}`);

    process.exit(totals.errorCount > 0 ? 1 : 0);
  } catch (error) {
    console.error('Fatal error:', error.message);
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

export { WalletBalanceChecker };
