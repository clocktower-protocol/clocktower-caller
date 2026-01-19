import { createPublicClient, createWalletClient, http, formatEther, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { Resend } from 'resend';
dayjs.extend(utc);

// Inline ABI (only includes remit function and nextUncheckedDay function)  
const abi = [
  {
    name: 'remit',
    type: 'function',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'nextUncheckedDay',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'getIdByTime',
    type: 'function',
    inputs: [
      { name: 'frequency', type: 'uint256' },
      { name: 'dueDay', type: 'uint16' }
    ],
    outputs: [{ type: 'bytes32[]' }],
    stateMutability: 'view',
  },
  {
    name: 'maxRemits',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
];

// ERC20 ABI for USDC balance checks
const erc20Abi = [
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  }
];

// Maximum recursion depth per cron invocation
const MAX_RECURSION_DEPTH = 5;

// Email rate limiter - ensures we don't exceed Resend's 2 requests/second limit
let lastEmailTimestamp = 0;
const MIN_EMAIL_INTERVAL_MS = 500; // 500ms = max 2 emails per second

async function waitForEmailRateLimit() {
  const now = Date.now();
  const timeSinceLastEmail = now - lastEmailTimestamp;
  
  if (timeSinceLastEmail < MIN_EMAIL_INTERVAL_MS) {
    const waitTime = MIN_EMAIL_INTERVAL_MS - timeSinceLastEmail;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  lastEmailTimestamp = Date.now();
}

// Helper function to send error emails from outside processChain scope
async function sendChainErrorEmail(chainConfig, errorMessage, errorType, env, additionalDetails = {}) {
  try {
    // Only send email if email configuration is available
    if (!env.RESEND_API_KEY || !env.NOTIFICATION_EMAIL) {
      console.log(`[${chainConfig.chainName}] Email configuration not available, skipping error email notification`);
      return;
    }

    // Wait for rate limit before sending
    await waitForEmailRateLimit();

    const resend = new Resend(env.RESEND_API_KEY);
    const subject = `❌ Clocktower Error - ${chainConfig.displayName}`;
    
    // Build additional details HTML
    let additionalDetailsHtml = '';
    if (Object.keys(additionalDetails).length > 0) {
      additionalDetailsHtml = `
        <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #0369a1; margin-top: 0;">Additional Details</h3>
          ${Object.entries(additionalDetails).map(([key, value]) => 
            `<p><strong>${key}:</strong> ${value !== null && value !== undefined ? value : 'N/A'}</p>`
          ).join('')}
        </div>
      `;
    }

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">❌ Clocktower Execution Error</h2>
        
        <div style="background-color: #fee2e2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
          <h3 style="color: #991b1b; margin-top: 0;">Error Information</h3>
          <p><strong>Chain:</strong> ${chainConfig.displayName}</p>
          <p><strong>Error Type:</strong> ${errorType}</p>
          <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
        </div>
        
        <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #991b1b; margin-top: 0;">Error Message</h3>
          <pre style="background-color: #ffffff; padding: 15px; border-radius: 4px; overflow-x: auto; color: #7f1d1d; white-space: pre-wrap; word-wrap: break-word;">${errorMessage}</pre>
        </div>
        
        ${additionalDetailsHtml}
        
        <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0; color: #92400e;"><strong>⚠️ Action Required:</strong> Please investigate this error and ensure the Clocktower caller is functioning correctly.</p>
        </div>
        
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        <p style="color: #6b7280; font-size: 14px; text-align: center;">
          Clocktower Caller - ${chainConfig.displayName} Chain Monitoring
        </p>
      </div>
    `;

    const { data, error } = await resend.emails.send({
      from: env.SENDER_ADDRESS || 'onboarding@resend.dev',
      to: [env.NOTIFICATION_EMAIL],
      subject: subject,
      html: htmlContent,
    });

    if (error) {
      console.error(`[${chainConfig.chainName}] Error email send failed:`, error);
      throw new Error(`Email error: ${error.message}`);
    }

    console.log(`[${chainConfig.chainName}] Error email sent:`, data.id);
    return data;
  } catch (error) {
    console.error(`[${chainConfig.chainName}] Failed to send error email:`, error);
    // Don't throw here - we don't want email failures to break the error handling flow
  }
}

// Chain configuration system
function getChainConfigs(env) {
  return [
    {
      chainId: parseInt(env.CHAIN_ID_BASE || '8453', 10),
      chainName: 'base',
      displayName: 'Base',
      alchemyUrl: env.ALCHEMY_URL_BASE || 'https://base-mainnet.g.alchemy.com/v2/',
      clocktowerAddress: env.CLOCKTOWER_ADDRESS_BASE,
      usdcAddress: env.USDC_ADDRESS_BASE,
      explorerUrl: 'https://basescan.org',
      enabled: env.CLOCKTOWER_ADDRESS_BASE !== undefined && env.USDC_ADDRESS_BASE !== undefined
    },
    {
      chainId: parseInt(env.CHAIN_ID_SEPOLIA_BASE || '84532', 10),
      chainName: 'sepolia-base',
      displayName: 'Base Sepolia',
      alchemyUrl: env.ALCHEMY_URL_SEPOLIA_BASE || 'https://base-sepolia.g.alchemy.com/v2/',
      clocktowerAddress: env.CLOCKTOWER_ADDRESS_SEPOLIA_BASE,
      usdcAddress: env.USDC_ADDRESS_SEPOLIA_BASE,
      explorerUrl: 'https://sepolia.basescan.org',
      enabled: env.CLOCKTOWER_ADDRESS_SEPOLIA_BASE !== undefined && env.USDC_ADDRESS_SEPOLIA_BASE !== undefined
    }
  ].filter(config => config.enabled);
}

export default {
  async scheduled(event, env, ctx) {
    const globalExecutionId = `exec_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    const chainConfigs = getChainConfigs(env);

    if (chainConfigs.length === 0) {
      console.error('No enabled chains configured');
      return;
    }

    console.log(`Processing ${chainConfigs.length} chain(s) in parallel`);

    // Process all chains in parallel with graceful error handling
    const chainPromises = chainConfigs.map(chainConfig => 
      processChain(chainConfig, env, globalExecutionId)
        .catch(async error => {
          console.error(`Error processing chain ${chainConfig.chainName}:`, error);
          // Try to send error email (non-blocking)
          try {
            await sendChainErrorEmail(chainConfig, error.message, 'Chain Processing Error', env);
          } catch (emailError) {
            console.error(`Failed to send error email for chain ${chainConfig.chainName}:`, emailError);
          }
          // Log error to database if possible
          return { chain: chainConfig.chainName, error: error.message };
        })
    );

    const results = await Promise.allSettled(chainPromises);
    
    // Log summary
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    console.log(`Execution complete: ${successful} successful, ${failed} failed`);
  },

  async fetch(request, env, ctx) {
    return new Response('Unified Clocktower Caller Worker is running.');
  },
};

// Main chain processing function
async function processChain(chainConfig, env, globalExecutionId) {
  const executionId = `${globalExecutionId}_${chainConfig.chainName}`;
  const startTime = Date.now();
  
  console.log(`[${chainConfig.chainName}] Starting execution`);

  // Database logging functions
  async function logToDatabase(data) {
    try {
      const result = await env.DB.prepare(`
        INSERT INTO execution_logs (
          execution_id, timestamp, chain_name, precheck_passed, current_day, 
          next_unchecked_day, should_proceed, tx_hash, tx_status, revert_reason,
          balance_before_eth, balance_after_eth, recursion_depth, 
          error_message, execution_time_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        data.execution_id,
        data.timestamp,
        data.chain_name,
        data.precheck_passed,
        data.current_day,
        data.next_unchecked_day,
        data.should_proceed,
        data.tx_hash,
        data.tx_status,
        data.revert_reason,
        data.balance_before_eth,
        data.balance_after_eth,
        data.recursion_depth,
        data.error_message,
        data.execution_time_ms
      ).run();
      
      return result.meta.last_row_id;
    } catch (error) {
      console.error(`[${chainConfig.chainName}] Database logging error:`, error);
    }
  }

  async function logTokenBalance(executionLogId, tokenAddress, balanceBefore, balanceAfter) {
    try {
      // Get or create token record using INSERT OR IGNORE to handle race conditions
      // First try to insert, then query to get the ID
      await env.DB.prepare(`
        INSERT OR IGNORE INTO tokens (token_address, token_symbol, token_name, decimals, chain_name)
        VALUES (?, ?, ?, ?, ?)
      `).bind(tokenAddress, 'USDC', 'USD Coin', 6, chainConfig.chainName).run();
      
      // Query to get the token ID (works whether insert happened or token already existed)
      const token = await env.DB.prepare(`
        SELECT id FROM tokens WHERE token_address = ? AND chain_name = ?
      `).bind(tokenAddress, chainConfig.chainName).first();
      
      if (!token) {
        console.error(`[${chainConfig.chainName}] Failed to get or create token record for ${tokenAddress}`);
        return;
      }
      
      // Insert token balance
      await env.DB.prepare(`
        INSERT INTO token_balances (execution_log_id, token_id, balance_before, balance_after)
        VALUES (?, ?, ?, ?)
      `).bind(executionLogId, token.id, balanceBefore, balanceAfter).run();
    } catch (error) {
      console.error(`[${chainConfig.chainName}] Token balance logging error:`, error);
    }
  }

  async function sendSuccessEmail(txHash, balanceBeforeEth, balanceAfterEth, balanceBeforeUsdc, balanceAfterUsdc, recursionDepth) {
    try {
      // Only send email if email configuration is available
      if (!env.RESEND_API_KEY || !env.NOTIFICATION_EMAIL) {
        console.log(`[${chainConfig.chainName}] Email configuration not available, skipping email notification`);
        return;
      }

      // Wait for rate limit before sending
      await waitForEmailRateLimit();

      const resend = new Resend(env.RESEND_API_KEY);
      const subject = `✅ Clocktower Remit Success - ${chainConfig.displayName}`;
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #22c55e;">🎉 Clocktower Remit Transaction Successful!</h2>
          
          <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #0369a1; margin-top: 0;">Transaction Details</h3>
            <p><strong>Chain:</strong> ${chainConfig.displayName}</p>
            <p><strong>Transaction Hash:</strong> <a href="${chainConfig.explorerUrl}/tx/${txHash}" target="_blank" style="color: #0369a1;">${txHash}</a></p>
            <p><strong>Recursion Depth:</strong> ${recursionDepth}</p>
            <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
          </div>
          
          <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #166534; margin-top: 0;">Balance Changes</h3>
            <p><strong>ETH Balance:</strong> ${balanceBeforeEth} → ${balanceAfterEth}</p>
            <p><strong>USDC Balance:</strong> ${balanceBeforeUsdc} → ${balanceAfterUsdc}</p>
          </div>
          
          <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #92400e;"><strong>Note:</strong> This email was sent automatically when the remit transaction succeeded and was not reverted.</p>
          </div>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          <p style="color: #6b7280; font-size: 14px; text-align: center;">
            Clocktower Caller - ${chainConfig.displayName} Chain Monitoring
          </p>
        </div>
      `;

      const { data, error } = await resend.emails.send({
        from: env.SENDER_ADDRESS || 'onboarding@resend.dev',
        to: [env.NOTIFICATION_EMAIL],
        subject: subject,
        html: htmlContent,
      });

      if (error) {
        console.error(`[${chainConfig.chainName}] Email error:`, error);
        throw new Error(`Email error: ${error.message}`);
      }

      console.log(`[${chainConfig.chainName}] Success email sent:`, data.id);
      return data;
    } catch (error) {
      console.error(`[${chainConfig.chainName}] Failed to send success email:`, error);
      throw error;
    }
  }

  async function sendNoSubscriptionsEmail(currentDay, nextUncheckedDay) {
    try {
      // Only send email if email configuration is available
      if (!env.RESEND_API_KEY || !env.NOTIFICATION_EMAIL) {
        console.log(`[${chainConfig.chainName}] Email configuration not available, skipping no subscriptions email notification`);
        return;
      }

      // Wait for rate limit before sending
      await waitForEmailRateLimit();

      const resend = new Resend(env.RESEND_API_KEY);
      const subject = `📭 Clocktower No Subscriptions - ${chainConfig.displayName}`;
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #f59e0b;">📭 No Subscriptions Found for Today</h2>
          
          <div style="background-color: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #92400e; margin-top: 0;">Daily Check Results</h3>
            <p><strong>Chain:</strong> ${chainConfig.displayName}</p>
            <p><strong>Current Day:</strong> ${currentDay}</p>
            <p><strong>Next Unchecked Day:</strong> ${nextUncheckedDay}</p>
            <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
          </div>
          
          <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #0369a1; margin-top: 0;">What This Means</h3>
            <p>No active subscriptions were found for the current day. This could mean:</p>
            <ul style="color: #0369a1;">
              <li>No subscriptions are due today</li>
              <li>All subscriptions for today have already been processed</li>
              <li>The system is up to date</li>
            </ul>
          </div>
          
          <div style="background-color: #f0fdf4; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #166534;"><strong>Status:</strong> No remit transaction was needed or executed.</p>
          </div>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          <p style="color: #6b7280; font-size: 14px; text-align: center;">
            Clocktower Caller - ${chainConfig.displayName} Chain Monitoring
          </p>
        </div>
      `;

      const { data, error } = await resend.emails.send({
        from: env.SENDER_ADDRESS || 'onboarding@resend.dev',
        to: [env.NOTIFICATION_EMAIL],
        subject: subject,
        html: htmlContent,
      });

      if (error) {
        console.error(`[${chainConfig.chainName}] No subscriptions email error:`, error);
        throw new Error(`Email error: ${error.message}`);
      }

      console.log(`[${chainConfig.chainName}] No subscriptions email sent:`, data.id);
      return data;
    } catch (error) {
      console.error(`[${chainConfig.chainName}] Failed to send no subscriptions email:`, error);
      throw error;
    }
  }

  async function sendErrorEmail(errorMessage, errorType, additionalDetails = {}) {
    try {
      // Only send email if email configuration is available
      if (!env.RESEND_API_KEY || !env.NOTIFICATION_EMAIL) {
        console.log(`[${chainConfig.chainName}] Email configuration not available, skipping error email notification`);
        return;
      }

      // Wait for rate limit before sending
      await waitForEmailRateLimit();

      const resend = new Resend(env.RESEND_API_KEY);
      const subject = `❌ Clocktower Error - ${chainConfig.displayName}`;
      
      // Build additional details HTML
      let additionalDetailsHtml = '';
      if (Object.keys(additionalDetails).length > 0) {
        additionalDetailsHtml = `
          <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #0369a1; margin-top: 0;">Additional Details</h3>
            ${Object.entries(additionalDetails).map(([key, value]) => 
              `<p><strong>${key}:</strong> ${value !== null && value !== undefined ? value : 'N/A'}</p>`
            ).join('')}
          </div>
        `;
      }

      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #dc2626;">❌ Clocktower Execution Error</h2>
          
          <div style="background-color: #fee2e2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
            <h3 style="color: #991b1b; margin-top: 0;">Error Information</h3>
            <p><strong>Chain:</strong> ${chainConfig.displayName}</p>
            <p><strong>Error Type:</strong> ${errorType}</p>
            <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
          </div>
          
          <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #991b1b; margin-top: 0;">Error Message</h3>
            <pre style="background-color: #ffffff; padding: 15px; border-radius: 4px; overflow-x: auto; color: #7f1d1d; white-space: pre-wrap; word-wrap: break-word;">${errorMessage}</pre>
          </div>
          
          ${additionalDetailsHtml}
          
          <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #92400e;"><strong>⚠️ Action Required:</strong> Please investigate this error and ensure the Clocktower caller is functioning correctly.</p>
          </div>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          <p style="color: #6b7280; font-size: 14px; text-align: center;">
            Clocktower Caller - ${chainConfig.displayName} Chain Monitoring
          </p>
        </div>
      `;

      const { data, error } = await resend.emails.send({
        from: env.SENDER_ADDRESS || 'onboarding@resend.dev',
        to: [env.NOTIFICATION_EMAIL],
        subject: subject,
        html: htmlContent,
      });

      if (error) {
        console.error(`[${chainConfig.chainName}] Error email send failed:`, error);
        throw new Error(`Email error: ${error.message}`);
      }

      console.log(`[${chainConfig.chainName}] Error email sent:`, data.id);
      return data;
    } catch (error) {
      console.error(`[${chainConfig.chainName}] Failed to send error email:`, error);
      // Don't throw here - we don't want email failures to break the error handling flow
    }
  }

  async function preCheck(recursiveExecutionId = null, recursionDepth = 0) {
    try {
      const url = `${chainConfig.alchemyUrl}${env.ALCHEMY_API_KEY}`;

      const publicClient = createPublicClient({
        chain: { id: chainConfig.chainId },
        transport: http(url),
      });

      // Get current day
      const currentTime = Math.floor(Date.now() / 1000); // Convert to seconds
      const currentDay = Math.floor(currentTime / 86400);
      console.log(`[${chainConfig.chainName}] PreCheck - Current UTC time: ${currentTime}`);
      console.log(`[${chainConfig.chainName}] PreCheck - Current day: ${currentDay}`);
      console.log(`[${chainConfig.chainName}] PreCheck - Current UTC date: ${new Date().toISOString()}`);

      // Check nextUncheckedDay
      const nextUncheckedDay = await publicClient.readContract({
        address: chainConfig.clocktowerAddress,
        abi,
        functionName: 'nextUncheckedDay',
      });
      console.log(`[${chainConfig.chainName}] PreCheck - Next unchecked day: ${nextUncheckedDay}`);

      // If current day is less than next unchecked day, we're up to date and don't need to proceed
      if(currentDay < nextUncheckedDay) {
        console.log(`[${chainConfig.chainName}] PreCheck - Up to date: current day (${currentDay}) < next unchecked day (${nextUncheckedDay})`);
        return { shouldProceed: false, currentDay, nextUncheckedDay: Number(nextUncheckedDay) };
      }
      
      // Additional validation: if nextUncheckedDay is significantly in the future, something might be wrong
      if(nextUncheckedDay > currentDay + 1) {
        console.log(`[${chainConfig.chainName}] PreCheck - Warning: nextUncheckedDay (${nextUncheckedDay}) is more than 1 day ahead of current day (${currentDay})`);
      }
      
      console.log(`[${chainConfig.chainName}] PreCheck - Need to check days from ${nextUncheckedDay} to ${currentDay}`);
      
      const shouldProceed = await checksubs(nextUncheckedDay, currentDay);
      console.log(`[${chainConfig.chainName}] PreCheck - Should proceed: ${shouldProceed}`);
      
      // Log precheck results to database
      await logToDatabase({
        execution_id: recursiveExecutionId || executionId,
        timestamp: new Date().toISOString(),
        chain_name: chainConfig.chainName,
        precheck_passed: true,
        current_day: currentDay,
        next_unchecked_day: Number(nextUncheckedDay),
        should_proceed: shouldProceed,
        tx_hash: null,
        tx_status: null,
        revert_reason: null,
        balance_before_eth: null,
        balance_after_eth: null,
        recursion_depth: recursionDepth,
        error_message: null,
        execution_time_ms: Date.now() - startTime
      });
      
      return { shouldProceed, currentDay, nextUncheckedDay: Number(nextUncheckedDay) };
    } catch (error) {
      // Log precheck error to database
      await logToDatabase({
        execution_id: recursiveExecutionId || executionId,
        timestamp: new Date().toISOString(),
        chain_name: chainConfig.chainName,
        precheck_passed: false,
        current_day: null,
        next_unchecked_day: null,
        should_proceed: false,
        tx_hash: null,
        tx_status: null,
        revert_reason: null,
        balance_before_eth: null,
        balance_after_eth: null,
        recursion_depth: recursionDepth,
        error_message: error.message,
        execution_time_ms: Date.now() - startTime
      });
      
      // Send error email
      await sendErrorEmail(
        error.message,
        'PreCheck Error',
        {
          'Execution ID': recursiveExecutionId || executionId,
          'Recursion Depth': recursionDepth.toString(),
          'Execution Time (ms)': (Date.now() - startTime).toString()
        }
      );
      
      return { shouldProceed: false, currentDay: null, nextUncheckedDay: null };
    }
  }

  async function checksubs(nextUncheckedDay, currentDay) {
    try {
      const url = `${chainConfig.alchemyUrl}${env.ALCHEMY_API_KEY}`;

      const publicClient = createPublicClient({
        chain: { id: chainConfig.chainId },
        transport: http(url),
      });

      console.log(`[${chainConfig.chainName}] Checksubs - Using current day: ${currentDay}`);
      
      // Convert BigInt to number for comparison
      const nextUncheckedDayNum = Number(nextUncheckedDay);

      for (let i = nextUncheckedDayNum; i <= currentDay; i++) {
        const iUnix = i * 86400; // Convert to Unix epoch time
        const checkDay = dayjs.utc(iUnix * 1000); // Convert to dayjs UTC object (multiply by 1000 for milliseconds)

        //converts day to dueDay by frequency
        const dayOfWeek = checkDay.day() === 0 ? 7 : checkDay.day(); // Convert Sunday from 0 to 7
        const dayOfMonth = checkDay.date(); // 1-31
        
        // Calculate day of quarter (1-92) - manually find quarter start
        const month = checkDay.month(); // 0-11
        const quarter = Math.floor(month / 3); // 0, 1, 2, 3
        const quarterStartMonth = quarter * 3; // 0, 3, 6, 9
        const quarterStart = dayjs.utc().year(checkDay.year()).month(quarterStartMonth).date(1);
        const dayOfQuarter = checkDay.diff(quarterStart, 'day') + 1;
        
        const dayOfYear = checkDay.diff(checkDay.startOf('year'), 'day') + 1; // 1-366
        
        console.log(`[${chainConfig.chainName}] Day ${i}: ${checkDay.format('YYYY-MM-DD')}, Day of quarter: ${dayOfQuarter}`);

        // Loop through frequencies 0-3
        for (let frequency = 0; frequency <= 3; frequency++) {
          let dueDay;
          let shouldSkipFrequency = false;
          
          // Map frequency to appropriate day type and validate
          switch (frequency) {
            case 0: // Weekly
              dueDay = dayOfWeek;
              break;
            case 1: // Monthly
              if (dayOfMonth > 28) {
                console.log(`[${chainConfig.chainName}] Day of month (${dayOfMonth}) exceeds limit of 28, skipping monthly frequency`);
                shouldSkipFrequency = true;
              } else {
                dueDay = dayOfMonth;
              }
              break;
            case 2: // Quarterly
              if (dayOfQuarter <= 0 || dayOfQuarter > 90) {
                console.log(`[${chainConfig.chainName}] Day of quarter (${dayOfQuarter}) is invalid or exceeds limit of 90, skipping quarterly frequency`);
                shouldSkipFrequency = true;
              } else {
                dueDay = dayOfQuarter;
              }
              break;
            case 3: // Yearly
              if (dayOfYear <= 0 || dayOfYear > 365) {
                console.log(`[${chainConfig.chainName}] Day of year (${dayOfYear}) is invalid or exceeds limit of 365, skipping yearly frequency`);
                shouldSkipFrequency = true;
              } else {
                dueDay = dayOfYear;
              }
              break;
          }
          
          // Skip this frequency if validation failed
          if (shouldSkipFrequency) {
            continue;
          }
          
          console.log(`[${chainConfig.chainName}] Checking frequency ${frequency} (${frequency === 0 ? 'weekly' : frequency === 1 ? 'monthly' : frequency === 2 ? 'quarterly' : 'yearly'}) for dueDay ${dueDay}`);
          
          // Call getIdByTime function
          const idArray = await publicClient.readContract({
            address: chainConfig.clocktowerAddress,
            abi,
            functionName: 'getIdByTime',
            args: [frequency, dueDay],
          });
          
          console.log(`[${chainConfig.chainName}] Frequency ${frequency} returned ${idArray.length} IDs:`, idArray);
          
          // Check if any ID in the array is non-zero
          for (const id of idArray) {
            if (id !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
              console.log(`[${chainConfig.chainName}] Found non-zero ID: ${id} at frequency ${frequency}`);
              return true;
            }
          }
        }
        
        console.log(`[${chainConfig.chainName}] No non-zero IDs found for day ${i}`);
      }
      
      console.log(`[${chainConfig.chainName}] No non-zero IDs found for checked range`);
      return false;
    } catch (error) {
      console.error(`[${chainConfig.chainName}] Checksubs Error:`, error.message);
      return false;
    }
  }

  async function countTotalSubscriptions(nextUncheckedDay, currentDay) {
    try {
      const url = `${chainConfig.alchemyUrl}${env.ALCHEMY_API_KEY}`;

      const publicClient = createPublicClient({
        chain: { id: chainConfig.chainId },
        transport: http(url),
      });

      console.log(`[${chainConfig.chainName}] CountTotalSubscriptions - Using current day: ${currentDay}`);

      let totalCount = 0;
      const nextUncheckedDayNum = Number(nextUncheckedDay);

      for (let i = nextUncheckedDayNum; i <= currentDay; i++) {
        const iUnix = i * 86400; // Convert to Unix epoch time
        const checkDay = dayjs.utc(iUnix * 1000); // Convert to dayjs UTC object (multiply by 1000 for milliseconds)

        //converts day to dueDay by frequency
        const dayOfWeek = checkDay.day() === 0 ? 7 : checkDay.day(); // Convert Sunday from 0 to 7
        const dayOfMonth = checkDay.date(); // 1-31
        
        // Calculate day of quarter (1-92) - manually find quarter start
        const month = checkDay.month(); // 0-11
        const quarter = Math.floor(month / 3); // 0, 1, 2, 3
        const quarterStartMonth = quarter * 3; // 0, 3, 6, 9
        const quarterStart = dayjs.utc().year(checkDay.year()).month(quarterStartMonth).date(1);
        const dayOfQuarter = checkDay.diff(quarterStart, 'day') + 1;
        
        const dayOfYear = checkDay.diff(checkDay.startOf('year'), 'day') + 1; // 1-366
        
        console.log(`[${chainConfig.chainName}] Day ${i}: ${checkDay.format('YYYY-MM-DD')}, Day of quarter: ${dayOfQuarter}`);

        // Loop through frequencies 0-3
        for (let frequency = 0; frequency <= 3; frequency++) {
          let dueDay;
          let shouldSkipFrequency = false;
          
          // Map frequency to appropriate day type and validate
          switch (frequency) {
            case 0: // Weekly
              dueDay = dayOfWeek;
              break;
            case 1: // Monthly
              if (dayOfMonth > 28) {
                shouldSkipFrequency = true;
              } else {
                dueDay = dayOfMonth;
              }
              break;
            case 2: // Quarterly
              if (dayOfQuarter <= 0 || dayOfQuarter > 90) {
                shouldSkipFrequency = true;
              } else {
                dueDay = dayOfQuarter;
              }
              break;
            case 3: // Yearly
              if (dayOfYear <= 0 || dayOfYear > 365) {
                shouldSkipFrequency = true;
              } else {
                dueDay = dayOfYear;
              }
              break;
          }
          
          // Skip this frequency if validation failed
          if (shouldSkipFrequency) {
            continue;
          }
          
          // Call getIdByTime function
          const idArray = await publicClient.readContract({
            address: chainConfig.clocktowerAddress,
            abi,
            functionName: 'getIdByTime',
            args: [frequency, dueDay],
          });
          
          // Count non-zero IDs (active subscriptions)
          for (const id of idArray) {
            if (id !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
              totalCount++;
            }
          }
        }
      }
      
      console.log(`[${chainConfig.chainName}] Total subscriptions found: ${totalCount}`);
      return totalCount;
    } catch (error) {
      console.error(`[${chainConfig.chainName}] CountTotalSubscriptions Error:`, error.message);
      return 0;
    }
  }

  async function desmond(recursionDepth = 0, maxAllowedRecursions = MAX_RECURSION_DEPTH) {
    // Generate unique execution ID for each recursive call
    const recursiveExecutionId = `${executionId}_recursion_${recursionDepth}`;
    
    try {
      const url = `${chainConfig.alchemyUrl}${env.ALCHEMY_API_KEY}`;

      const publicClient = createPublicClient({
        chain: { id: chainConfig.chainId },
        transport: http(url),
      });

      // Note: maxAllowedRecursions already accounts for MAX_RECURSION_DEPTH limit

      console.log(`[${chainConfig.chainName}] Recursion depth: ${recursionDepth + 1}`);

      const walletClient = createWalletClient({
        account: privateKeyToAccount(env.CALLER_PRIVATE_KEY),
        chain: { id: chainConfig.chainId },
        transport: http(url),
      });

      // Get initial ETH balance
      const balance = await publicClient.getBalance({ address: env.CALLER_ADDRESS });
      const balanceBeforeEth = formatEther(balance);
      console.log(`[${chainConfig.chainName}] ETH Balance Before: ${balanceBeforeEth}`);

      // Get initial USDC balance
      const usdcBalance = await publicClient.readContract({
        address: chainConfig.usdcAddress,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [env.CALLER_ADDRESS],
      });
      const balanceBeforeUsdc = formatUnits(usdcBalance, 6);
      console.log(`[${chainConfig.chainName}] USDC Balance Before: ${balanceBeforeUsdc}`);

      // Execute transaction
      const txHash = await walletClient.writeContract({
        address: chainConfig.clocktowerAddress,
        abi,
        functionName: 'remit',
        gas: 1000000,
      });
      console.log(`[${chainConfig.chainName}] Transaction sent: ${txHash}`);

      // Wait for confirmation
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const txStatus = receipt.status === 'success' ? 1 : 0;
      console.log(`[${chainConfig.chainName}] Transaction status: ${txStatus}`);
      let revertReason = null;

      // Handle failure
      if (txStatus === 0) {
        try {
          const tx = await publicClient.getTransaction({ hash: txHash });
          const result = await publicClient.call({
            account: env.CALLER_ADDRESS,
            to: chainConfig.clocktowerAddress,
            data: tx.input,
          });
          revertReason = result.error?.message || 'Transaction failed';
        } catch (error) {
          revertReason = error.message || 'Failed to get revert reason';
        }
        console.log(`[${chainConfig.chainName}] Failed: ${revertReason}`);
        
        // Send error email for failed transaction
        await sendErrorEmail(
          `Transaction failed: ${revertReason}`,
          'Transaction Failure',
          {
            'Transaction Hash': txHash,
            'Transaction Link': `${chainConfig.explorerUrl}/tx/${txHash}`,
            'Recursion Depth': recursionDepth.toString(),
            'ETH Balance Before': balanceBeforeEth,
            'ETH Balance After': balanceAfterEth,
            'USDC Balance Before': balanceBeforeUsdc,
            'USDC Balance After': balanceAfterUsdc
          }
        );
      }

      // Get final ETH balance
      const balance2 = await publicClient.getBalance({ address: env.CALLER_ADDRESS });
      const balanceAfterEth = formatEther(balance2);
      console.log(`[${chainConfig.chainName}] ETH Balance After: ${balanceAfterEth}`);

      // Get final USDC balance
      const usdcBalance2 = await publicClient.readContract({
        address: chainConfig.usdcAddress,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [env.CALLER_ADDRESS],
      });
      const balanceAfterUsdc = formatUnits(usdcBalance2, 6);
      console.log(`[${chainConfig.chainName}] USDC Balance After: ${balanceAfterUsdc}`);

      // Log to database
      const executionLogId = await logToDatabase({
        execution_id: recursiveExecutionId,
        timestamp: new Date().toISOString(),
        chain_name: chainConfig.chainName,
        precheck_passed: true,
        current_day: null,
        next_unchecked_day: null,
        should_proceed: true,
        tx_hash: txHash,
        tx_status: txStatus,
        revert_reason: revertReason,
        balance_before_eth: parseFloat(balanceBeforeEth),
        balance_after_eth: parseFloat(balanceAfterEth),
        recursion_depth: recursionDepth,
        error_message: null,
        execution_time_ms: Date.now() - startTime
      });

      // Log token balances
      if (executionLogId) {
        await logTokenBalance(executionLogId, chainConfig.usdcAddress, parseFloat(balanceBeforeUsdc), parseFloat(balanceAfterUsdc));
      }

      // Send success email notification
      if (txStatus === 1) {
        await sendSuccessEmail(txHash, balanceBeforeEth, balanceAfterEth, balanceBeforeUsdc, balanceAfterUsdc, recursionDepth);
      }

      // Recursive call on success - use pre-calculated max allowed recursions
      if (txStatus === 1) {
        if (recursionDepth + 1 < maxAllowedRecursions) {
          console.log(`[${chainConfig.chainName}] Recursion ${recursionDepth + 1}/${maxAllowedRecursions}, recursing...`);
          await desmond(recursionDepth + 1, maxAllowedRecursions);
        } else {
          console.log(`[${chainConfig.chainName}] Reached expected recursion limit (${maxAllowedRecursions}), stopping`);
        }
      }

    } catch (error) {
      console.error(`[${chainConfig.chainName}] Error:`, error.message);
      await logToDatabase({
        execution_id: recursiveExecutionId,
        timestamp: new Date().toISOString(),
        chain_name: chainConfig.chainName,
        precheck_passed: true,
        current_day: null,
        next_unchecked_day: null,
        should_proceed: true,
        tx_hash: null,
        tx_status: null,
        revert_reason: null,
        balance_before_eth: null,
        balance_after_eth: null,
        recursion_depth: recursionDepth,
        error_message: error.message,
        execution_time_ms: Date.now() - startTime
      });
      
      // Send error email
      await sendErrorEmail(
        error.message,
        'Transaction Execution Error',
        {
          'Execution ID': recursiveExecutionId,
          'Recursion Depth': recursionDepth.toString(),
          'Execution Time (ms)': (Date.now() - startTime).toString()
        }
      );
    }
  }

  // Run preCheck first, then desmond if preCheck passes
  const preCheckResult = await preCheck();
  console.log(`[${chainConfig.chainName}] shouldProceed: ${preCheckResult.shouldProceed}`);
  if (preCheckResult.shouldProceed) {
    // Count total subscriptions once at the beginning
    const totalSubscriptions = await countTotalSubscriptions(
      preCheckResult.nextUncheckedDay, 
      preCheckResult.currentDay
    );
    
    // Get maxRemits limit
    const url = `${chainConfig.alchemyUrl}${env.ALCHEMY_API_KEY}`;
    const publicClient = createPublicClient({
      chain: { id: chainConfig.chainId },
      transport: http(url),
    });
    
    const maxRemits = await publicClient.readContract({
      address: chainConfig.clocktowerAddress,
      abi,
      functionName: 'maxRemits',
    });
    
    // Calculate expected recursions
    const expectedRecursions = Math.ceil(totalSubscriptions / Number(maxRemits));
    const maxAllowedRecursions = Math.min(expectedRecursions, MAX_RECURSION_DEPTH);
    
    console.log(`[${chainConfig.chainName}] Starting with ${totalSubscriptions} subscriptions, maxRemits: ${maxRemits}`);
    console.log(`[${chainConfig.chainName}] Expected recursions: ${expectedRecursions}, max allowed: ${maxAllowedRecursions}`);
    
    // Pass the max allowed recursions to desmond
    await desmond(0, maxAllowedRecursions);
    console.log(`[${chainConfig.chainName}] PreCheck passed, executing desmond`);
  } else {
    console.log(`[${chainConfig.chainName}] PreCheck failed, skipping desmond execution`);
    
    // Send email notification when no subscriptions are found
    // Use data already retrieved from preCheck to avoid redundant contract call
    if (preCheckResult.currentDay !== null && preCheckResult.nextUncheckedDay !== null) {
      await sendNoSubscriptionsEmail(preCheckResult.currentDay, preCheckResult.nextUncheckedDay);
    } else {
      // Fallback: calculate current day and use 'Unknown' for nextUncheckedDay
      const currentTime = Math.floor(Date.now() / 1000);
      const currentDay = Math.floor(currentTime / 86400);
      await sendNoSubscriptionsEmail(currentDay, 'Unknown');
    }
  }
}

