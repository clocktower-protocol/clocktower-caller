/**
 * Clocktower Service
 * 
 * Core business logic for executing remit transactions across multiple chains.
 * Ported and adapted from Cloudflare Worker implementation.
 */

import { createPublicClient, createWalletClient, http, formatEther, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import { ChainConfigService } from '../config/chainConfig.js';
import { DatabaseService } from './database.js';
import { EmailService } from './email.js';
import { Logger } from '../utils/logger.js';
import { 
  CLOCKTOWER_ABI, 
  ERC20_ABI, 
  getCurrentDay, 
  getCurrentTimestamp,
  dayNumberToDayjs,
  getDueDay,
  FREQUENCY_TYPES,
  getFrequencyName,
  generateExecutionId,
  MAX_RECURSION_DEPTH,
  GAS_LIMIT,
  ZERO_HASH
} from '../utils/helpers.js';

dayjs.extend(utc);

export class ClocktowerService {
  constructor(databaseService = null) {
    this.chainConfig = new ChainConfigService();
    this.database = databaseService || new DatabaseService();
    this.email = new EmailService();
    this.logger = new Logger('ClocktowerService');
    this.maxRecursionDepth = parseInt(process.env.MAX_RECURSION_DEPTH, 10) || MAX_RECURSION_DEPTH;
    this.gasLimit = parseInt(process.env.GAS_LIMIT, 10) || GAS_LIMIT;
  }

  /**
   * Execute remit for all active chains
   * @returns {Promise<Array>} Array of execution results
   */
  async executeRemitForAllChains() {
    const activeChains = this.chainConfig.getAllActiveChains();
    const results = [];

    this.logger.info(`Starting multi-chain execution for ${activeChains.length} chains`);

    // Execute chains sequentially to avoid overwhelming the system
    for (const chain of activeChains) {
      try {
        this.logger.chain(chain.name, `Starting execution for ${chain.displayName}`);
        const result = await this.executeRemitForChain(chain);
        results.push({ 
          chain: chain.name, 
          success: result.success, 
          status: result.status || (result.success ? 'unknown' : 'failed'),
          txCount: result.txCount || 0,
          error: result.error
        });
        this.logger.chain(chain.name, `Completed execution for ${chain.displayName}`);
      } catch (error) {
        this.logger.chain(chain.name, `Failed execution for ${chain.displayName}`, error);
        results.push({ chain: chain.name, success: false, error: error.message });
        
        // Send error email (non-blocking)
        try {
          await this.email.sendErrorEmail(
            chain.displayName,
            error.message,
            'Chain Processing Error',
            {
              'Chain Name': chain.name,
              'Error Stack': error.stack || 'N/A'
            }
          );
        } catch (emailError) {
          this.logger.chain(chain.name, 'Failed to send error email', emailError);
        }
      }
    }

    // Send summary email
    try {
      await this.email.sendSummaryEmail(results);
    } catch (error) {
      this.logger.error('Failed to send summary email', error);
    }

    return results;
  }

  /**
   * Execute remit for a specific chain
   * @param {Object} chainConfig - Chain configuration
   * @returns {Promise<Object>} Execution result
   */
  async executeRemitForChain(chainConfig) {
    const executionId = generateExecutionId(`exec_${chainConfig.name}`);
    const startTime = Date.now();

    try {
      this.logger.chain(chainConfig.name, `Starting execution: ${executionId}`);

      // Pre-check for this specific chain
      const preCheckResult = await this.preCheck(chainConfig, executionId, startTime);
      
      if (!preCheckResult.shouldProceed) {
        this.logger.chain(chainConfig.name, 'No subscriptions found, skipping execution');

        // Best-effort notification; do NOT fail the chain if email fails
        try {
          await this.email.sendNoSubscriptionsEmail(
            chainConfig.displayName,
            preCheckResult.currentDay,
            preCheckResult.nextUncheckedDay
          );
        } catch (notifyError) {
          this.logger.chain(chainConfig.name, 'No-subscriptions email failed', notifyError);
        }

        return { success: true, status: 'no_subscriptions', txCount: 0 };
      }

      // Count total subscriptions
      const totalSubscriptions = await this.countTotalSubscriptions(
        chainConfig,
        preCheckResult.nextUncheckedDay, 
        preCheckResult.currentDay
      );

      // Get maxRemits limit
      const maxRemits = await this.getMaxRemits(chainConfig);
      
      // Calculate expected recursions
      const expectedRecursions = Math.ceil(totalSubscriptions / Number(maxRemits));
      const maxAllowedRecursions = Math.min(expectedRecursions, this.maxRecursionDepth);
      
      this.logger.chain(chainConfig.name, `Starting with ${totalSubscriptions} subscriptions, maxRemits: ${maxRemits}`);
      this.logger.chain(chainConfig.name, `Expected recursions: ${expectedRecursions}, max allowed: ${maxAllowedRecursions}`);

      // Execute remit transactions
      const txCount = await this.desmond(chainConfig, executionId, startTime, 0, maxAllowedRecursions);
      
      this.logger.chain(chainConfig.name, `Execution completed successfully: ${executionId}`);
      return { success: true, status: txCount > 0 ? 'executed' : 'no_subscriptions', txCount };
    } catch (error) {
      this.logger.chain(chainConfig.name, `Execution failed: ${executionId}`, error);
      return { success: false, error: error.message, status: 'failed', txCount: 0 };
    }
  }

  /**
   * Pre-check to determine if remit should proceed
   * @param {Object} chainConfig - Chain configuration
   * @param {string} executionId - Execution ID
   * @param {number} startTime - Start time
   * @returns {Promise<Object>} Pre-check result
   */
  async preCheck(chainConfig, executionId, startTime) {
    try {
      const url = `${chainConfig.alchemyUrl}${process.env.ALCHEMY_API_KEY}`;
      
      const publicClient = createPublicClient({
        chain: { id: chainConfig.chainId },
        transport: http(url),
      });

      // Get current day
      const currentTime = getCurrentTimestamp();
      const currentDay = getCurrentDay();
      
      this.logger.chain(chainConfig.name, `PreCheck - Current UTC time: ${currentTime}`);
      this.logger.chain(chainConfig.name, `PreCheck - Current day: ${currentDay}`);
      this.logger.chain(chainConfig.name, `PreCheck - Current UTC date: ${new Date().toISOString()}`);

      // Check nextUncheckedDay
      const nextUncheckedDay = await publicClient.readContract({
        address: chainConfig.clocktowerAddress,
        abi: CLOCKTOWER_ABI,
        functionName: 'nextUncheckedDay',
      });
      
      this.logger.chain(chainConfig.name, `PreCheck - Next unchecked day: ${nextUncheckedDay}`);

      // If current day is less than next unchecked day, we're up to date
      if (currentDay < nextUncheckedDay) {
        this.logger.chain(chainConfig.name, `PreCheck - Up to date: current day (${currentDay}) < next unchecked day (${nextUncheckedDay})`);
        return { shouldProceed: false, currentDay, nextUncheckedDay: Number(nextUncheckedDay) };
      }
      
      // Additional validation: if nextUncheckedDay is significantly in the future
      if (nextUncheckedDay > currentDay + 1) {
        this.logger.chain(chainConfig.name, `PreCheck - Warning: nextUncheckedDay (${nextUncheckedDay}) is more than 1 day ahead of current day (${currentDay})`);
      }
      
      this.logger.chain(chainConfig.name, `PreCheck - Need to check days from ${nextUncheckedDay} to ${currentDay}`);
      
      const shouldProceed = await this.checksubs(chainConfig, nextUncheckedDay, currentDay);
      this.logger.chain(chainConfig.name, `PreCheck - Should proceed: ${shouldProceed}`);
      
      // Log precheck results to database (best-effort)
      try {
        await this.database.logExecution({
        execution_id: executionId,
        timestamp: new Date().toISOString(),
        chain_name: chainConfig.name,
        chain_display_name: chainConfig.displayName,
        precheck_passed: true,
        current_day: currentDay,
        next_unchecked_day: Number(nextUncheckedDay),
        should_proceed: shouldProceed,
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
        execution_time_ms: Date.now() - startTime
        });
      } catch (logError) {
        this.logger.chain(chainConfig.name, 'PreCheck logging skipped (DB not ready or insert failed)', logError);
      }
      
      return { shouldProceed, currentDay, nextUncheckedDay: Number(nextUncheckedDay) };
    } catch (error) {
      this.logger.chain(chainConfig.name, 'PreCheck failed', error);
      
      // Log precheck error to database (best-effort)
      try {
        await this.database.logExecution({
        execution_id: executionId,
        timestamp: new Date().toISOString(),
        chain_name: chainConfig.name,
        chain_display_name: chainConfig.displayName,
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
        error_message: error.message,
        error_stack: error.stack,
        execution_time_ms: Date.now() - startTime
        });
      } catch (logError) {
        this.logger.chain(chainConfig.name, 'PreCheck error logging skipped (DB not ready or insert failed)', logError);
      }
      
      // Send error email (non-blocking)
      try {
        await this.email.sendErrorEmail(
          chainConfig.displayName,
          error.message,
          'PreCheck Error',
          {
            'Execution ID': executionId,
            'Execution Time (ms)': (Date.now() - startTime).toString(),
            'Error Stack': error.stack || 'N/A'
          }
        );
      } catch (emailError) {
        this.logger.chain(chainConfig.name, 'Failed to send error email', emailError);
      }
      
      return { shouldProceed: false, currentDay: null, nextUncheckedDay: null };
    }
  }

  /**
   * Check for active subscriptions
   * @param {Object} chainConfig - Chain configuration
   * @param {number} nextUncheckedDay - Next unchecked day
   * @param {number} currentDay - Current day
   * @returns {Promise<boolean>} True if subscriptions found
   */
  async checksubs(chainConfig, nextUncheckedDay, currentDay) {
    try {
      const url = `${chainConfig.alchemyUrl}${process.env.ALCHEMY_API_KEY}`;
      
      const publicClient = createPublicClient({
        chain: { id: chainConfig.chainId },
        transport: http(url),
      });

      this.logger.chain(chainConfig.name, `Checksubs - Using current day: ${currentDay}`);
      
      const nextUncheckedDayNum = Number(nextUncheckedDay);

      for (let i = nextUncheckedDayNum; i <= currentDay; i++) {
        const checkDay = dayNumberToDayjs(i);
        
        this.logger.chain(chainConfig.name, `Day ${i}: ${checkDay.format('YYYY-MM-DD')}`);

        // Loop through frequencies 0-3
        for (let frequency = 0; frequency <= 3; frequency++) {
          const dueDayInfo = getDueDay(frequency, checkDay);
          
          if (dueDayInfo.shouldSkip) {
            this.logger.chain(chainConfig.name, `Skipping frequency ${getFrequencyName(frequency)}: ${dueDayInfo.skipReason}`);
            continue;
          }
          
          this.logger.chain(chainConfig.name, `Checking frequency ${getFrequencyName(frequency)} for dueDay ${dueDayInfo.dueDay}`);
          
          // Call getIdByTime function
          const idArray = await publicClient.readContract({
            address: chainConfig.clocktowerAddress,
            abi: CLOCKTOWER_ABI,
            functionName: 'getIdByTime',
            args: [frequency, dueDayInfo.dueDay],
          });
          
          this.logger.chain(chainConfig.name, `Frequency ${getFrequencyName(frequency)} returned ${idArray.length} IDs`);
          
          // Check if any ID in the array is non-zero
          for (const id of idArray) {
            if (id !== ZERO_HASH) {
              this.logger.chain(chainConfig.name, `Found non-zero ID: ${id} at frequency ${getFrequencyName(frequency)}`);
              return true;
            }
          }
        }
        
        this.logger.chain(chainConfig.name, `No non-zero IDs found for day ${i}`);
      }
      
      this.logger.chain(chainConfig.name, 'No non-zero IDs found for checked range');
      return false;
    } catch (error) {
      this.logger.chain(chainConfig.name, 'Checksubs Error', error);
      return false;
    }
  }

  /**
   * Count total subscriptions for a day range
   * @param {Object} chainConfig - Chain configuration
   * @param {number} nextUncheckedDay - Next unchecked day
   * @param {number} currentDay - Current day
   * @returns {Promise<number>} Total subscription count
   */
  async countTotalSubscriptions(chainConfig, nextUncheckedDay, currentDay) {
    try {
      const url = `${chainConfig.alchemyUrl}${process.env.ALCHEMY_API_KEY}`;
      
      const publicClient = createPublicClient({
        chain: { id: chainConfig.chainId },
        transport: http(url),
      });

      this.logger.chain(chainConfig.name, `CountTotalSubscriptions - Using current day: ${currentDay}`);

      let totalCount = 0;
      const nextUncheckedDayNum = Number(nextUncheckedDay);

      for (let i = nextUncheckedDayNum; i <= currentDay; i++) {
        const checkDay = dayNumberToDayjs(i);

        // Loop through frequencies 0-3
        for (let frequency = 0; frequency <= 3; frequency++) {
          const dueDayInfo = getDueDay(frequency, checkDay);
          
          if (dueDayInfo.shouldSkip) {
            continue;
          }
          
          // Call getIdByTime function
          const idArray = await publicClient.readContract({
            address: chainConfig.clocktowerAddress,
            abi: CLOCKTOWER_ABI,
            functionName: 'getIdByTime',
            args: [frequency, dueDayInfo.dueDay],
          });
          
          // Count non-zero IDs (active subscriptions)
          for (const id of idArray) {
            if (id !== ZERO_HASH) {
              totalCount++;
            }
          }
        }
      }
      
      this.logger.chain(chainConfig.name, `Total subscriptions found: ${totalCount}`);
      return totalCount;
    } catch (error) {
      this.logger.chain(chainConfig.name, 'CountTotalSubscriptions Error', error);
      return 0;
    }
  }

  /**
   * Get maxRemits limit from contract
   * @param {Object} chainConfig - Chain configuration
   * @returns {Promise<number>} Max remits limit
   */
  async getMaxRemits(chainConfig) {
    const url = `${chainConfig.alchemyUrl}${process.env.ALCHEMY_API_KEY}`;
    
    const publicClient = createPublicClient({
      chain: { id: chainConfig.chainId },
      transport: http(url),
    });
    
    return await publicClient.readContract({
      address: chainConfig.clocktowerAddress,
      abi: CLOCKTOWER_ABI,
      functionName: 'maxRemits',
    });
  }

  /**
   * Execute remit transaction (desmond function)
   * @param {Object} chainConfig - Chain configuration
   * @param {string} executionId - Execution ID
   * @param {number} startTime - Start time
   * @param {number} recursionDepth - Current recursion depth
   * @param {number} maxAllowedRecursions - Maximum allowed recursions
   * @returns {Promise<void>}
   */
  async desmond(chainConfig, executionId, startTime, recursionDepth = 0, maxAllowedRecursions = this.maxRecursionDepth) {
    try {
      const recursiveExecutionId = `${executionId}_recursion_${recursionDepth}`;
      const url = `${chainConfig.alchemyUrl}${process.env.ALCHEMY_API_KEY}`;

      const publicClient = createPublicClient({
        chain: { id: chainConfig.chainId },
        transport: http(url),
      });

      this.logger.chain(chainConfig.name, `Recursion depth: ${recursionDepth + 1}`);

      const walletClient = createWalletClient({
        account: privateKeyToAccount(process.env.CALLER_PRIVATE_KEY),
        chain: { id: chainConfig.chainId },
        transport: http(url),
      });

      // Get initial ETH balance
      const balance = await publicClient.getBalance({ address: process.env.CALLER_ADDRESS });
      const balanceBeforeEth = formatEther(balance);
      this.logger.balance(process.env.CALLER_ADDRESS, `ETH Balance Before: ${balanceBeforeEth}`);

      // Get initial token balances
      const balancesBefore = [];
      for (const token of chainConfig.tokens) {
        const raw = await publicClient.readContract({
          address: token.address,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [process.env.CALLER_ADDRESS],
        });
        const formatted = formatUnits(raw, token.decimals);
        balancesBefore.push({ ...token, balanceBefore: formatted });
        this.logger.balance(process.env.CALLER_ADDRESS, `${token.symbol} Balance Before: ${formatted}`);
      }

      // Execute transaction
      const txHash = await walletClient.writeContract({
        address: chainConfig.clocktowerAddress,
        abi: CLOCKTOWER_ABI,
        functionName: 'remit',
        gas: this.gasLimit,
      });
      this.logger.transaction(txHash, `Transaction sent: ${txHash}`);

      // Wait for confirmation
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const txStatus = receipt.status === 'success' ? 1 : 0;
      this.logger.transaction(txHash, `Transaction status: ${txStatus}`);
      
      let revertReason = null;

      // Handle failure
      if (txStatus === 0) {
        try {
          const tx = await publicClient.getTransaction({ hash: txHash });
          const result = await publicClient.call({
            account: process.env.CALLER_ADDRESS,
            to: chainConfig.clocktowerAddress,
            data: tx.input,
          });
          revertReason = result.error?.message || 'Transaction failed';
        } catch (error) {
          revertReason = error.message || 'Failed to get revert reason';
        }
        this.logger.transaction(txHash, `Failed: ${revertReason}`);
      }

      // Get final ETH balance
      const balance2 = await publicClient.getBalance({ address: process.env.CALLER_ADDRESS });
      const balanceAfterEth = formatEther(balance2);
      this.logger.balance(process.env.CALLER_ADDRESS, `ETH Balance After: ${balanceAfterEth}`);

      // Get final token balances and build tokenBalances for emails/logging
      const tokenBalances = [];
      for (let i = 0; i < chainConfig.tokens.length; i++) {
        const token = chainConfig.tokens[i];
        const raw2 = await publicClient.readContract({
          address: token.address,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [process.env.CALLER_ADDRESS],
        });
        const balanceAfter = formatUnits(raw2, token.decimals);
        const balanceBefore = balancesBefore[i]?.balanceBefore ?? '0';
        tokenBalances.push({ symbol: token.symbol, balanceBefore, balanceAfter });
        this.logger.balance(process.env.CALLER_ADDRESS, `${token.symbol} Balance After: ${balanceAfter}`);
      }

      if (txStatus === 0) {
        try {
          const errorDetails = {
            'Transaction Hash': txHash,
            'Transaction Link': this.getExplorerUrl(chainConfig.displayName, txHash),
            'Recursion Depth': recursionDepth.toString(),
            'ETH Balance Before': balanceBeforeEth,
            'ETH Balance After': balanceAfterEth,
          };
          tokenBalances.forEach(t => {
            errorDetails[`${t.symbol} Balance Before`] = t.balanceBefore;
            errorDetails[`${t.symbol} Balance After`] = t.balanceAfter;
          });
          await this.email.sendErrorEmail(
            chainConfig.displayName,
            `Transaction failed: ${revertReason}`,
            'Transaction Failure',
            errorDetails
          );
        } catch (emailError) {
          this.logger.chain(chainConfig.name, 'Failed to send error email', emailError);
        }
      }

      // Log to database (best-effort)
      let executionLogId = null;
      try {
        executionLogId = await this.database.logExecution({
        execution_id: recursiveExecutionId,
        timestamp: new Date().toISOString(),
        chain_name: chainConfig.name,
        chain_display_name: chainConfig.displayName,
        precheck_passed: true,
        current_day: null,
        next_unchecked_day: null,
        should_proceed: true,
        tx_hash: txHash,
        tx_status: txStatus,
        revert_reason: revertReason,
        gas_used: receipt.gasUsed ? Number(receipt.gasUsed) : null,
        balance_before_eth: parseFloat(balanceBeforeEth),
        balance_after_eth: parseFloat(balanceAfterEth),
        recursion_depth: recursionDepth,
        max_recursion_reached: recursionDepth >= maxAllowedRecursions - 1,
        error_message: null,
        error_stack: null,
        execution_time_ms: Date.now() - startTime
        });
      } catch (logError) {
        this.logger.chain(chainConfig.name, 'Desmond logging skipped (DB not ready or insert failed)', logError);
      }

      // Log token balances
      if (executionLogId) {
        for (let i = 0; i < chainConfig.tokens.length; i++) {
          const token = chainConfig.tokens[i];
          const tb = tokenBalances[i];
          await this.database.logTokenBalance(
            executionLogId,
            token.address,
            parseFloat(tb.balanceBefore),
            parseFloat(tb.balanceAfter),
            chainConfig.name,
            { symbol: token.symbol, name: token.name, decimals: token.decimals }
          );
        }
      }

      // Send success email notification
      if (txStatus === 1) {
        await this.email.sendSuccessEmail(
          chainConfig.displayName,
          txHash,
          balanceBeforeEth,
          balanceAfterEth,
          tokenBalances,
          recursionDepth
        );
      }

      let successfulTxs = txStatus === 1 ? 1 : 0;

      // Recursive call on success
      if (txStatus === 1) {
        if (recursionDepth + 1 < maxAllowedRecursions) {
          this.logger.chain(chainConfig.name, `Recursion ${recursionDepth + 1}/${maxAllowedRecursions}, recursing...`);
          const more = await this.desmond(chainConfig, executionId, startTime, recursionDepth + 1, maxAllowedRecursions);
          successfulTxs += more;
        } else {
          this.logger.chain(chainConfig.name, `Reached expected recursion limit (${maxAllowedRecursions}), stopping`);
        }
      }

      return successfulTxs;

    } catch (error) {
      this.logger.chain(chainConfig.name, 'Desmond Error', error);
      
      try {
        await this.database.logExecution({
        execution_id: `${executionId}_recursion_${recursionDepth}`,
        timestamp: new Date().toISOString(),
        chain_name: chainConfig.name,
        chain_display_name: chainConfig.displayName,
        precheck_passed: true,
        current_day: null,
        next_unchecked_day: null,
        should_proceed: true,
        tx_hash: null,
        tx_status: null,
        revert_reason: null,
        gas_used: null,
        balance_before_eth: null,
        balance_after_eth: null,
        recursion_depth: recursionDepth,
        max_recursion_reached: false,
        error_message: error.message,
        error_stack: error.stack,
        execution_time_ms: Date.now() - startTime
        });
      } catch (logError) {
        this.logger.chain(chainConfig.name, 'Desmond error logging skipped (DB not ready or insert failed)', logError);
      }
      
      // Send error email (non-blocking)
      try {
        await this.email.sendErrorEmail(
          chainConfig.displayName,
          error.message,
          'Transaction Execution Error',
          {
            'Execution ID': `${executionId}_recursion_${recursionDepth}`,
            'Recursion Depth': recursionDepth.toString(),
            'Execution Time (ms)': (Date.now() - startTime).toString(),
            'Error Stack': error.stack || 'N/A'
          }
        );
      } catch (emailError) {
        this.logger.chain(chainConfig.name, 'Failed to send error email', emailError);
      }
      
      return 0;
    }
  }

  /**
   * Get blockchain explorer URL for a transaction
   * @param {string} chainDisplayName - Chain display name
   * @param {string} txHash - Transaction hash
   * @returns {string} Explorer URL
   */
  getExplorerUrl(chainDisplayName, txHash) {
    const explorerUrls = {
      'Base': `https://basescan.org/tx/${txHash}`,
      'Base Sepolia': `https://sepolia.basescan.org/tx/${txHash}`,
      'Ethereum': `https://etherscan.io/tx/${txHash}`,
      'Arbitrum': `https://arbiscan.io/tx/${txHash}`,
      'Polygon': `https://polygonscan.com/tx/${txHash}`
    };

    return explorerUrls[chainDisplayName] || `https://etherscan.io/tx/${txHash}`;
  }
}
