// checkWalletBalance.js
import { config } from 'dotenv';
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

// Load environment variables from .dev.vars
config({ path: '.dev.vars' });

async function checkWalletBalance() {
  try {
    const client = createPublicClient({
      chain: mainnet,
      transport: http(`https://base-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`)
    });
    const balance = await client.getBalance({ address: process.env.CALLER_ADDRESS });
    const balanceInEth = Number(balance) / 1e18;

    console.log(`Wallet Balance for ${process.env.CALLER_ADDRESS}:`);
    console.log(`Balance: ${balanceInEth.toFixed(6)} ETH`);

    return balanceInEth;
  } catch (error) {
    console.error('Error fetching wallet balance:', error.message);
    throw error;
  }
} 

checkWalletBalance();