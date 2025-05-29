// createWallet.js
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mainnet } from 'viem/chains';
import { randomBytes } from 'crypto';

// Function to create a new Ethereum wallet
async function createNewWallet() {
  try {
    // Generate a random private key (32 bytes)
    const privateKey = `0x${randomBytes(32).toString('hex')}`;
    
    // Create account from private key
    const account = privateKeyToAccount(privateKey);
    
    // Create wallet client (optional, for demonstration)
    const walletClient = createWalletClient({
      account,
      chain: mainnet,
      transport: http()
    });

    // Log wallet details
    console.log('New Ethereum Wallet Created:');
    console.log('Address:', account.address);
    console.log('Private Key:', privateKey);
    console.log('WARNING: Store the private key securely! Do not share it.');

    return {
      address: account.address,
      privateKey
    };
  } catch (error) {
    console.error('Error creating wallet:', error.message);
    throw error;
  }
}

// Execute the wallet creation
createNewWallet();