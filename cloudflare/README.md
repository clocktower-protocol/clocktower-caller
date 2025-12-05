# Clocktower Protocol Unified Multi-Chain Caller

This is a unified Cloudflare Worker script that executes the `remit` function on the Clocktower Protocol contract across multiple blockchain networks simultaneously.

## Overview

The script is designed to run as a scheduled Cloudflare Worker that performs the following key functions:

- Processes multiple chains in parallel with graceful error handling
- Checks if the `remit` function has already been called for the current day on each chain
- Executes the `remit` function on the Clocktower Protocol contract for each chain
- Tracks ETH and USDC balances before and after execution
- Handles transaction failures and provides detailed error reporting
- Implements recursive execution with a maximum depth limit per chain
- Logs execution data to analytics
- Sends email notifications for both successful transactions and no-subscription scenarios

## Features

- **Multi-Chain Support**: Process multiple chains in parallel
- **Graceful Error Handling**: Failures on one chain don't affect others
- **Configuration-Driven**: Easy to add new chains without code changes
- **Automated daily execution checks** per chain
- **Balance tracking** for both ETH and USDC per chain
- **Detailed transaction logging** and error handling
- **Recursive execution capability** per chain
- **Analytics integration** for monitoring
- **Email notifications** for successful transactions
- **Email notifications** for no-subscription scenarios

## Architecture

### Chain Configuration System

The worker uses a configuration-driven architecture where each chain is defined with the following properties:

- `chainId`: Network chain ID (e.g., 8453, 84532)
- `chainName`: Internal name for logging ('base', 'sepolia-base')
- `displayName`: Display name for emails ('Base', 'Base Sepolia')
- `alchemyUrl`: Alchemy RPC URL template
- `clocktowerAddress`: Contract address
- `usdcAddress`: USDC token address
- `explorerUrl`: Block explorer base URL (for email links)
- `enabled`: Boolean to enable/disable chains (automatically set based on env vars)

### Parallel Execution

Chains are processed in parallel using `Promise.allSettled()`, ensuring that:
- All enabled chains execute simultaneously
- Failures on one chain don't stop processing of other chains
- Each chain maintains its own execution context and recursion depth
- Errors are logged per chain without affecting others

## Environment Variables

The script requires the following environment variables:

### Blockchain Configuration (Per Chain)

#### Base Mainnet:
- `ALCHEMY_URL_BASE`: Alchemy API URL for Base network (default: `https://base-mainnet.g.alchemy.com/v2/`)
- `CLOCKTOWER_ADDRESS_BASE`: Clocktower Protocol contract address on Base
- `CHAIN_ID_BASE`: Network chain ID (default: `8453`)
- `USDC_ADDRESS_BASE`: USDC token contract address on Base

#### Base Sepolia Testnet:
- `ALCHEMY_URL_SEPOLIA_BASE`: Alchemy API URL for Base Sepolia network (default: `https://base-sepolia.g.alchemy.com/v2/`)
- `CLOCKTOWER_ADDRESS_SEPOLIA_BASE`: Clocktower Protocol contract address on Base Sepolia
- `CHAIN_ID_SEPOLIA_BASE`: Network chain ID (default: `84532`)
- `USDC_ADDRESS_SEPOLIA_BASE`: USDC token contract address on Base Sepolia

### Shared Configuration

- `CALLER_PRIVATE_KEY`: Private key for the caller account (set as secret)
- `CALLER_ADDRESS`: Address of the caller account (set as secret)
- `ALCHEMY_API_KEY`: Alchemy API key (set as secret)

### Database Configuration

- `DB`: Cloudflare D1 database binding for execution logging

### Email Notifications (Optional)

- `RESEND_API_KEY`: Resend API key for sending email notifications (set as secret)
- `NOTIFICATION_EMAIL`: Email address to receive notifications (set as secret)
- `SENDER_ADDRESS`: Sender email address (defaults to 'onboarding@resend.dev' if not provided)

## Adding New Chains

To add a new chain, follow these steps:

1. **Add environment variables** to `wrangler.jsonc`:
   ```jsonc
   "ALCHEMY_URL_NEW_CHAIN": "https://new-chain.g.alchemy.com/v2/",
   "CLOCKTOWER_ADDRESS_NEW_CHAIN": "0x...",
   "CHAIN_ID_NEW_CHAIN": "12345",
   "USDC_ADDRESS_NEW_CHAIN": "0x..."
   ```

2. **Update `getChainConfigs()` function** in `remit_script.js`:
   ```javascript
   {
     chainId: parseInt(env.CHAIN_ID_NEW_CHAIN || '12345', 10),
     chainName: 'new-chain',
     displayName: 'New Chain',
     alchemyUrl: env.ALCHEMY_URL_NEW_CHAIN || 'https://new-chain.g.alchemy.com/v2/',
     clocktowerAddress: env.CLOCKTOWER_ADDRESS_NEW_CHAIN,
     usdcAddress: env.USDC_ADDRESS_NEW_CHAIN,
     explorerUrl: 'https://explorer.newchain.com',
     enabled: env.CLOCKTOWER_ADDRESS_NEW_CHAIN !== undefined && env.USDC_ADDRESS_NEW_CHAIN !== undefined
   }
   ```

3. **No code changes needed** for core logic - the configuration system handles everything automatically!

## Usage

The script is designed to run as a scheduled Cloudflare Worker. It can be triggered either through the scheduler or via HTTP requests.

### Scheduled Execution

The worker runs automatically via cron schedule: `30 0 * * *` (daily at 00:30 UTC).

### Manual Execution

You can also trigger the worker via HTTP request:
```bash
curl https://your-worker.workers.dev/
```

### Development

```bash
# Install dependencies
npm install

# Run locally
npm run dev

# Deploy to Cloudflare
npm run deploy
```

## Error Handling

The worker implements graceful error handling:

- **Per-Chain Isolation**: Errors on one chain don't affect others
- **Database Logging**: All errors are logged to the database with chain context
- **Console Logging**: Errors are prefixed with `[chain-name]` for easy identification
- **Email Notifications**: Success and no-subscription emails are sent per chain

## Database Schema

The worker uses Cloudflare D1 database with the following schema:

- `execution_logs`: Main execution log table with chain-specific tracking
- `tokens`: Token registry table
- `token_balances`: Token balance tracking per execution

See `schema.sql` for the complete schema definition.

## Migration from Separate Workers

This unified worker replaces the separate `clocktower-base-caller` and `clocktower-sepolia-base-caller` workers. The old workers are preserved for reference but should not be used in production.

### Migration Steps

1. Update environment variables in Cloudflare dashboard to use the new naming convention (e.g., `CLOCKTOWER_ADDRESS_BASE` instead of `CLOCKTOWER_ADDRESS_BASE`)
2. Deploy the unified worker
3. Verify both chains are processing correctly
4. Monitor logs to ensure parallel execution is working

## Monitoring

Each chain execution is logged with a unique execution ID format:
- Global execution: `exec_{timestamp}_{random}`
- Per-chain execution: `exec_{timestamp}_{random}_{chain-name}`
- Recursive calls: `exec_{timestamp}_{random}_{chain-name}_recursion_{depth}`

All logs are prefixed with `[chain-name]` for easy filtering and monitoring.

## License

See the main repository LICENSE file.

