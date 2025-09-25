import { createPublicClient, createWalletClient, http, formatEther, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
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

export default {
  async scheduled(event, env, ctx) {
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    const startTime = Date.now();
    
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
        console.error('Database logging error:', error);
      }
    }

    async function logTokenBalance(executionLogId, tokenAddress, balanceBefore, balanceAfter) {
      try {
        // Get or create token record
        let token = await env.DB.prepare(`
          SELECT id FROM tokens WHERE token_address = ? AND chain_name = ?
        `).bind(tokenAddress, 'sepolia').first();
        
        if (!token) {
          // Insert new token if not exists
          const tokenResult = await env.DB.prepare(`
            INSERT INTO tokens (token_address, token_symbol, token_name, decimals, chain_name)
            VALUES (?, ?, ?, ?, ?)
          `).bind(tokenAddress, 'USDC', 'USD Coin', 6, 'sepolia').run();
          token = { id: tokenResult.meta.last_row_id };
        }
        
        // Insert token balance
        await env.DB.prepare(`
          INSERT INTO token_balances (execution_log_id, token_id, balance_before, balance_after)
          VALUES (?, ?, ?, ?)
        `).bind(executionLogId, token.id, balanceBefore, balanceAfter).run();
      } catch (error) {
        console.error('Token balance logging error:', error);
      }
    }

    async function sendSuccessEmail(txHash, balanceBeforeEth, balanceAfterEth, balanceBeforeUsdc, balanceAfterUsdc, recursionDepth) {
      try {
        // Only send email if email configuration is available
        if (!env.RESEND_API_KEY || !env.NOTIFICATION_EMAIL) {
          console.log('Email configuration not available, skipping email notification');
          return;
        }

        const subject = `✅ Clocktower Remit Success - Sepolia Base Chain`;
        const htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #22c55e;">🎉 Clocktower Remit Transaction Successful!</h2>
            
            <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #0369a1; margin-top: 0;">Transaction Details</h3>
              <p><strong>Chain:</strong> Sepolia Base</p>
              <p><strong>Transaction Hash:</strong> <a href="https://sepolia.basescan.org/tx/${txHash}" target="_blank" style="color: #0369a1;">${txHash}</a></p>
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
              Clocktower Caller - Sepolia Base Chain Monitoring
            </p>
          </div>
        `;

        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: env.FROM_EMAIL || 'onboarding@resend.dev',
            to: [env.NOTIFICATION_EMAIL],
            subject: subject,
            html: htmlContent,
          }),
        });

        const result = await response.json();
        console.log('Email response status:', response.status);
        console.log('Email response:', result);
        console.log('Success email sent:', result.id);
      } catch (error) {
        console.error('Failed to send success email:', error);
      }
    }

    async function preCheck() {
      try {
        const url = `${env.ALCHEMY_URL_SEPOLIA_BASE}${env.ALCHEMY_API_KEY}`;
        const chainId = parseInt(env.CHAIN_ID, 10);

        const publicClient = createPublicClient({
          chain: { id: chainId },
          transport: http(url),
        });

        // Get current day
        const currentTime = Math.floor(Date.now() / 1000); // Convert to seconds
        const currentDay = Math.floor(currentTime / 86400);
        console.log(`PreCheck - Current UTC time: ${currentTime}`);
        console.log(`PreCheck - Current day: ${currentDay}`);
        console.log(`PreCheck - Current UTC date: ${new Date().toISOString()}`);

        // Check nextUncheckedDay
        const nextUncheckedDay = await publicClient.readContract({
          address: env.CLOCKTOWER_ADDRESS_SEPOLIA_BASE,
          abi,
          functionName: 'nextUncheckedDay',
        });
        console.log(`PreCheck - Next unchecked day: ${nextUncheckedDay}`);

        // If current day is less than next unchecked day, we're up to date and don't need to proceed
        if(currentDay < nextUncheckedDay) {
          console.log(`PreCheck - Up to date: current day (${currentDay}) < next unchecked day (${nextUncheckedDay})`);
          return false;
        }
        
        console.log(`PreCheck - Need to check days from ${nextUncheckedDay} to ${currentDay}`);
        
        const shouldProceed = await checksubs(nextUncheckedDay);
        console.log(`PreCheck - Should proceed: ${shouldProceed}`);
        
        // Log precheck results to database
        await logToDatabase({
          execution_id: executionId,
          timestamp: new Date().toISOString(),
          chain_name: 'sepolia',
          precheck_passed: true,
          current_day: currentDay,
          next_unchecked_day: Number(nextUncheckedDay),
          should_proceed: shouldProceed,
          tx_hash: null,
          tx_status: null,
          revert_reason: null,
          balance_before_eth: null,
          balance_after_eth: null,
          recursion_depth: 0,
          error_message: null,
          execution_time_ms: Date.now() - startTime
        });
        
        return shouldProceed;
      } catch (error) {
        // Log precheck error to database
        await logToDatabase({
          execution_id: executionId,
          timestamp: new Date().toISOString(),
          chain_name: 'sepolia',
          precheck_passed: false,
          current_day: null,
          next_unchecked_day: null,
          should_proceed: false,
          tx_hash: null,
          tx_status: null,
          revert_reason: null,
          balance_before_eth: null,
          balance_after_eth: null,
          recursion_depth: 0,
          error_message: error.message,
          execution_time_ms: Date.now() - startTime
        });
        return false;
      }
    }

    async function checksubs(nextUncheckedDay) {
      try {
        const url = `${env.ALCHEMY_URL_SEPOLIA_BASE}${env.ALCHEMY_API_KEY}`;
        const chainId = parseInt(env.CHAIN_ID, 10);

        const publicClient = createPublicClient({
          chain: { id: chainId },
          transport: http(url),
        });

        const currentTime = Math.floor(Date.now() / 1000);
        const currentDay = Math.floor(currentTime / 86400);
        console.log(`Checksubs - Current UTC time: ${currentTime}`);
        console.log(`Checksubs - Current day: ${currentDay}`);
        
        // Convert BigInt to number for comparison
        const nextUncheckedDayNum = Number(nextUncheckedDay);

        for (let i = nextUncheckedDayNum; i <= currentDay; i++) {
          const iUnix = i * 86400; // Convert to Unix epoch time
          const checkDay = dayjs.utc(iUnix * 1000); // Convert to dayjs UTC object (multiply by 1000 for milliseconds)

                     //converts day to dueDay by frequency
           //const now = dayjs.utc();
           const dayOfWeek = checkDay.day() === 0 ? 7 : checkDay.day(); // Convert Sunday from 0 to 7
           const dayOfMonth = checkDay.date(); // 1-31
          
          // Calculate day of quarter (1-92) - manually find quarter start
          const month = checkDay.month(); // 0-11
          const quarter = Math.floor(month / 3); // 0, 1, 2, 3
          const quarterStartMonth = quarter * 3; // 0, 3, 6, 9
          const quarterStart = dayjs.utc([checkDay.year(), quarterStartMonth, 1]);
          const dayOfQuarter = checkDay.diff(quarterStart, 'day') + 1;
          
          const dayOfYear = checkDay.diff(checkDay.startOf('year'), 'day') + 1; // 1-366
          
          console.log(`Day ${i}: ${checkDay.format('YYYY-MM-DD')}, Day of quarter: ${dayOfQuarter}`);

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
                  console.log(`Day of month (${dayOfMonth}) exceeds limit of 28, skipping monthly frequency`);
                  shouldSkipFrequency = true;
                } else {
                  dueDay = dayOfMonth;
                }
                break;
              case 2: // Quarterly
                if (dayOfQuarter <= 0 || dayOfQuarter > 90) {
                  console.log(`Day of quarter (${dayOfQuarter}) is invalid or exceeds limit of 90, skipping quarterly frequency`);
                  shouldSkipFrequency = true;
                } else {
                  dueDay = dayOfQuarter;
                }
                break;
              case 3: // Yearly
                if (dayOfYear <= 0 || dayOfYear > 365) {
                  console.log(`Day of year (${dayOfYear}) is invalid or exceeds limit of 365, skipping yearly frequency`);
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
            
            console.log(`Checking frequency ${frequency} (${frequency === 0 ? 'weekly' : frequency === 1 ? 'monthly' : frequency === 2 ? 'quarterly' : 'yearly'}) for dueDay ${dueDay}`);
            
            // Call getIdByTime function
            const idArray = await publicClient.readContract({
              address: env.CLOCKTOWER_ADDRESS_SEPOLIA_BASE,
              abi,
              functionName: 'getIdByTime',
              args: [frequency, dueDay],
            });
            
            console.log(`Frequency ${frequency} returned ${idArray.length} IDs:`, idArray);
            
            // Check if any ID in the array is non-zero
            for (const id of idArray) {
              if (id !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
                console.log(`Found non-zero ID: ${id} at frequency ${frequency}`);
                return true;
              }
            }
          }
          
          console.log(`No non-zero IDs found for day ${i}`);
        }
        
        console.log(`No non-zero IDs found for checked range`);
        return false;
      } catch (error) {
        console.error('Checksubs Error:', error.message);
        return false;
      }
    }

    async function desmond(recursionDepth = 0) {
      try {
        // Generate unique execution ID for each recursive call
        const recursiveExecutionId = `${executionId}_recursion_${recursionDepth}`;
        
        const url = `${env.ALCHEMY_URL_SEPOLIA_BASE}${env.ALCHEMY_API_KEY}`;
        const chainId = parseInt(env.CHAIN_ID, 10);

        const publicClient = createPublicClient({
          chain: { id: chainId },
          transport: http(url),
        });

        // If the script has reached the maximum recursion depth, return
        if (recursionDepth >= MAX_RECURSION_DEPTH) {
          console.log(`Max recursion depth (${MAX_RECURSION_DEPTH}) reached`);
          await logToDatabase({
            execution_id: recursiveExecutionId,
            timestamp: new Date().toISOString(),
            chain_name: 'sepolia',
            precheck_passed: true,
            current_day: null,
            next_unchecked_day: null,
            should_proceed: true,
            tx_hash: null,
            tx_status: null,
            revert_reason: `Max recursion depth (${MAX_RECURSION_DEPTH}) reached`,
            balance_before_eth: null,
            balance_after_eth: null,
            recursion_depth: recursionDepth,
            error_message: null,
            execution_time_ms: Date.now() - startTime
          });
          return;
        }

        console.log(`Recursion depth: ${recursionDepth + 1}`);

        const walletClient = createWalletClient({
          account: privateKeyToAccount(env.CALLER_PRIVATE_KEY),
          chain: { id: chainId },
          transport: http(url),
        });

        // Get initial ETH balance
        const balance = await publicClient.getBalance({ address: env.CALLER_ADDRESS });
        const balanceBeforeEth = formatEther(balance);
        console.log(`ETH Balance Before: ${balanceBeforeEth}`);

        // Get initial USDC balance
        const usdcBalance = await publicClient.readContract({
          address: env.USDC_ADDRESS,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [env.CALLER_ADDRESS],
        });
        const balanceBeforeUsdc = formatUnits(usdcBalance, 6);
        console.log(`USDC Balance Before: ${balanceBeforeUsdc}`);

        // Execute transaction
        const txHash = await walletClient.writeContract({
          address: env.CLOCKTOWER_ADDRESS_SEPOLIA_BASE,
          abi,
          functionName: 'remit',
          gas: 1000000,
        });
        console.log(`Transaction sent: ${txHash}`);

        // Wait for confirmation
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        const txStatus = receipt.status === 'success' ? 1 : 0;
        console.log(`Transaction status: ${txStatus}`);
        let revertReason = null;

        // Handle failure
        if (txStatus === 0) {
          try {
            const tx = await publicClient.getTransaction({ hash: txHash });
            const result = await publicClient.call({
              account: env.CALLER_ADDRESS,
              to: env.CLOCKTOWER_ADDRESS_SEPOLIA_BASE,
              data: tx.input,
            });
            revertReason = result.error?.message || 'Transaction failed';
          } catch (error) {
            revertReason = error.message || 'Failed to get revert reason';
          }
          console.log(`Failed: ${revertReason}`);
        }

        // Get final ETH balance
        const balance2 = await publicClient.getBalance({ address: env.CALLER_ADDRESS });
        const balanceAfterEth = formatEther(balance2);
        console.log(`ETH Balance After: ${balanceAfterEth}`);

        // Get final USDC balance
        const usdcBalance2 = await publicClient.readContract({
          address: env.USDC_ADDRESS,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [env.CALLER_ADDRESS],
        });
        const balanceAfterUsdc = formatUnits(usdcBalance2, 6);
        console.log(`USDC Balance After: ${balanceAfterUsdc}`);

        // Log to database
        const executionLogId = await logToDatabase({
          execution_id: recursiveExecutionId,
          timestamp: new Date().toISOString(),
          chain_name: 'sepolia',
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
          await logTokenBalance(executionLogId, env.USDC_ADDRESS, parseFloat(balanceBeforeUsdc), parseFloat(balanceAfterUsdc));
        }

        // Send success email notification
        if (txStatus === 1) {
          await sendSuccessEmail(txHash, balanceBeforeEth, balanceAfterEth, balanceBeforeUsdc, balanceAfterUsdc, recursionDepth);
        }

        // Recursive call on success
        if (txStatus === 1) {
          await desmond(recursionDepth + 1);
        }

      } catch (error) {
        console.error('Error:', error.message);
        await logToDatabase({
          execution_id: recursiveExecutionId,
          timestamp: new Date().toISOString(),
          chain_name: 'sepolia',
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
      }
    }

    // Run preCheck first, then desmond if preCheck passes
    // TEMPORARILY DISABLED: const shouldProceed = await preCheck();
    const shouldProceed = true; // Bypass preCheck temporarily
    console.log(`shouldProceed: ${shouldProceed} (preCheck bypassed)`);
    if (shouldProceed) {
      await desmond();
      console.log('PreCheck bypassed, executing desmond');
    } else {
      console.log('PreCheck failed, skipping desmond execution');
    }
  },

  async fetch(request, env, ctx) {
    return new Response('Worker is running.');
  },
};