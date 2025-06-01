import { createPublicClient, createWalletClient, http, formatEther, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// Inline ABI (only includes remit function)
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
    const logEntry = {
      timestamp: new Date().toISOString(),
      balanceBeforeEth: null,
      balanceAfterEth: null,
      balanceBeforeUsdc: null,
      balanceAfterUsdc: null,
      txHash: null,
      txStatus: null,
      revertReason: null,
      recursionDepth: 0
    };

    async function desmond(recursionDepth = 0) {
      //checks if script has already been called for the day
      try {
        const url = `${env.ALCHEMY_URL_SEPOLIA_BASE}${env.ALCHEMY_API_KEY}`;
        const chainId = parseInt(env.CHAIN_ID, 10);

        const publicClient = createPublicClient({
          chain: { id: chainId },
          transport: http(url),
        });

        // Get current day
        const currentTime = Math.floor(Date.now() / 1000); // Convert to seconds
        const currentDay = currentTime / 86400;
        console.log(`Current UTC time: ${currentTime}`);
        console.log(`Current day: ${currentDay}`);

        // Check nextUncheckedDay
        const nextUncheckedDay = await publicClient.readContract({
          address: env.CLOCKTOWER_ADDRESS_SEPOLIA_BASE,
          abi,
          functionName: 'nextUncheckedDay',
        });
        console.log(`Next unchecked day: ${nextUncheckedDay}`);

        // If the script has already been called for the day, return
        if(currentDay < nextUncheckedDay) {
          console.log(`Script has already been called for the day`);
          return;
        }

        // If the script has reached the maximum recursion depth, return
        if (recursionDepth >= MAX_RECURSION_DEPTH) {
          logEntry.revertReason = `Max recursion depth (${MAX_RECURSION_DEPTH}) reached`;
          return;
        }

        logEntry.recursionDepth = recursionDepth + 1;
        console.log(`Recursion depth: ${logEntry.recursionDepth}`);

        const walletClient = createWalletClient({
          account: privateKeyToAccount(env.CALLER_PRIVATE_KEY),
          chain: { id: chainId },
          transport: http(url),
        });

        // Get initial ETH balance
        const balance = await publicClient.getBalance({ address: env.CALLER_ADDRESS });
        logEntry.balanceBeforeEth = formatEther(balance);
        console.log(`ETH Balance Before: ${logEntry.balanceBeforeEth}`);

        // Get initial USDC balance
        const usdcBalance = await publicClient.readContract({
          address: env.USDC_ADDRESS,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [env.CALLER_ADDRESS],
        });
        logEntry.balanceBeforeUsdc = formatUnits(usdcBalance, 6); // Hardcoded USDC decimals
        console.log(`USDC Balance Before: ${logEntry.balanceBeforeUsdc}`);

        // Execute transaction
        const txHash = await walletClient.writeContract({
          address: env.CLOCKTOWER_ADDRESS_SEPOLIA_BASE,
          abi,
          functionName: 'remit',
          gas: 1000000,
        });
        logEntry.txHash = txHash;
        console.log(`Transaction sent: ${txHash}`);

        // Wait for confirmation
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        logEntry.txStatus = receipt.status === 'success' ? 1 : 0;
        console.log(`Transaction status: ${logEntry.txStatus}`);

        // Handle failure
        if (logEntry.txStatus === 0) {
          try {
            const tx = await publicClient.getTransaction({ hash: txHash });
            const result = await publicClient.call({
              account: env.CALLER_ADDRESS,
              to: env.CLOCKTOWER_ADDRESS_SEPOLIA_BASE,
              data: tx.input,
            });
            logEntry.revertReason = result.error?.message || 'Transaction failed';
          } catch (error) {
            logEntry.revertReason = error.message || 'Failed to get revert reason';
          }
          console.log(`Failed: ${logEntry.revertReason}`);
        }

        // Get final ETH balance
        const balance2 = await publicClient.getBalance({ address: env.CALLER_ADDRESS });
        logEntry.balanceAfterEth = formatEther(balance2);
        console.log(`ETH Balance After: ${logEntry.balanceAfterEth}`);

        // Get final USDC balance
        const usdcBalance2 = await publicClient.readContract({
          address: env.USDC_ADDRESS,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [env.CALLER_ADDRESS],
        });
        logEntry.balanceAfterUsdc = formatUnits(usdcBalance2, 6); // Hardcoded USDC decimals
        console.log(`USDC Balance After: ${logEntry.balanceAfterUsdc}`);

        // Log to Analytics
        env.ANALYTICS.writeDataPoint({
          blobs: [
            'remit_execution',
            logEntry.txStatus === 1 ? 'success' : 'failure',
            logEntry.txHash,
            logEntry.revertReason
          ],
          doubles: [
            parseFloat(logEntry.balanceBeforeEth),
            parseFloat(logEntry.balanceAfterEth),
            parseFloat(logEntry.balanceBeforeUsdc),
            parseFloat(logEntry.balanceAfterUsdc),
            logEntry.recursionDepth
          ],
          indexes: ['remit_execution_status']
        });

        // Recursive call on success
        if (logEntry.txStatus === 1) {
          await desmond(recursionDepth + 1);
        }

      } catch (error) {
        console.error('Error:', error.message);
        logEntry.revertReason = error.cause?.reason || error.cause?.data || error.message;
        
        env.ANALYTICS.writeDataPoint({
          blobs: ['remit_execution', 'error', error.message],
          doubles: [0],
          indexes: ['remit_execution_status']
        });
      }
    }

    await desmond();
  },

  async fetch(request, env, ctx) {
    return new Response('Worker is running.');
  },
};