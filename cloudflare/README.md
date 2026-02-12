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
- **Tokens:** Either set `TOKENS_BASE` (recommended) or `USDC_ADDRESS_BASE`.
  - **`TOKENS_BASE`**: JSON array of tokens to track. Full list for this chain; you can include USDC and any other tokens. Example: `[{"address":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","symbol":"USDC","name":"USD Coin","decimals":6},{"address":"0x4200000000000000000000000000000000000006","symbol":"WETH","name":"Wrapped Ether","decimals":18}]`. Each object: `address`, `symbol`, optional `name`, `decimals`.
  - **`USDC_ADDRESS_BASE`**: Fallback when `TOKENS_BASE` is unset—tracks a single token (USDC). You can later move to `TOKENS_BASE` and stop setting this.

#### Base Sepolia Testnet:
- `ALCHEMY_URL_SEPOLIA_BASE`: Alchemy API URL for Base Sepolia network (default: `https://base-sepolia.g.alchemy.com/v2/`)
- `CLOCKTOWER_ADDRESS_SEPOLIA_BASE`: Clocktower Protocol contract address on Base Sepolia
- `CHAIN_ID_SEPOLIA_BASE`: Network chain ID (default: `84532`)
- **Tokens:** Either `TOKENS_SEPOLIA_BASE` (JSON array, same format as above) or `USDC_ADDRESS_SEPOLIA_BASE` as fallback.

### Shared Configuration

- `CALLER_PRIVATE_KEY`: Private key for the caller account (set as secret)
- `CALLER_ADDRESS`: Address of the caller account (set as secret)
- `ALCHEMY_API_KEY`: Alchemy API key (set as secret)

### Database Configuration

- `DB`: Cloudflare D1 database binding for execution logging

**Important:** The `database_id` in `wrangler.jsonc` must be set to your own D1 database ID. Each deployment uses a separate database; the value in the repo is an example and will not work for your worker.

1. **Create a D1 database** (if you haven't already):
   ```bash
   wrangler d1 create clocktower_caller_logs
   ```
   Or create one in the [Cloudflare Dashboard](https://dash.cloudflare.com/) under Workers & Pages → D1.

2. **Copy the database ID** from the command output or dashboard.

3. **Update `wrangler.jsonc`** — in the `d1_databases` section, set `database_id` to your database's ID:
   ```jsonc
   "d1_databases": [
     {
       "binding": "DB",
       "database_name": "clocktower_caller_logs",
       "database_id": "your-database-id-here"
     }
   ]
   ```

4. **Apply the schema** (see `schema.sql`):
   ```bash
   wrangler d1 execute clocktower_caller_logs --file=./schema.sql
   ```

### Email Notifications (Optional)

- `RESEND_API_KEY`: Resend API key for sending email notifications (set as secret)
- `NOTIFICATION_EMAIL`: Email address to receive notifications (set as secret)
- `SENDER_ADDRESS`: Sender email address (defaults to 'onboarding@resend.dev' if not provided)

## Local Development Setup

For local development, secrets are managed using a `.dev.vars` file. This file is automatically loaded by Wrangler when running `wrangler dev` and is git-ignored to prevent committing secrets.

### Setting Up Local Secrets

1. **Copy the example file:**
   ```bash
   cp .dev.vars.example .dev.vars
   ```

2. **Fill in your actual values** in `.dev.vars`:
   ```bash
   CALLER_ADDRESS=0xYourActualAddress
   CALLER_PRIVATE_KEY=0xYourActualPrivateKey
   ALCHEMY_API_KEY=your_actual_alchemy_key
   RESEND_API_KEY=re_your_actual_resend_key
   NOTIFICATION_EMAIL=your-email@example.com
   SENDER_ADDRESS=your-sender@example.com
   ```

3. **Run locally:**
   ```bash
   npm run dev
   ```

The `.dev.vars` file will be automatically loaded by Wrangler. **Never commit this file** - it's already in `.gitignore`.

### Production Secrets

For production deployments, secrets must be set using Cloudflare's secret management:

```bash
# Set secrets using Wrangler CLI
wrangler secret put CALLER_PRIVATE_KEY
wrangler secret put CALLER_ADDRESS
wrangler secret put ALCHEMY_API_KEY
wrangler secret put RESEND_API_KEY
wrangler secret put NOTIFICATION_EMAIL
wrangler secret put SENDER_ADDRESS
```

Alternatively, you can set secrets via the [Cloudflare Dashboard](https://dash.cloudflare.com/) under your Worker's Settings → Variables and Secrets.

**Note:** Non-secret environment variables (like `ALCHEMY_URL_BASE`, `CLOCKTOWER_ADDRESS_BASE`, etc.) are defined in `wrangler.jsonc` under the `vars` section and are committed to version control.

## Adding New Chains

To add a new chain, follow these steps:

1. **Add environment variables** (e.g. in Cloudflare Dashboard or `wrangler.jsonc`). Either use a token list or a single USDC fallback:
   - **Option A (recommended):** `TOKENS_NEW_CHAIN` — JSON array of tokens, e.g. `[{"address":"0x...","symbol":"USDC","name":"USD Coin","decimals":6}]`
   - **Option B:** `USDC_ADDRESS_NEW_CHAIN` — single token address (fallback when `TOKENS_NEW_CHAIN` is unset)
   - Also set: `ALCHEMY_URL_NEW_CHAIN`, `CLOCKTOWER_ADDRESS_NEW_CHAIN`, `CHAIN_ID_NEW_CHAIN`

2. **Update `getChainConfigs()`** in `remit_script.js`: add a new entry and call `parseTokensForChain(env, 'NEW_CHAIN')` to build the `tokens` array, e.g.:
   ```javascript
   const newChainTokens = parseTokensForChain(env, 'NEW_CHAIN');
   // ... in the returned array:
   {
     chainId: parseInt(env.CHAIN_ID_NEW_CHAIN || '12345', 10),
     chainName: 'new-chain',
     displayName: 'New Chain',
     alchemyUrl: env.ALCHEMY_URL_NEW_CHAIN || '...',
     clocktowerAddress: env.CLOCKTOWER_ADDRESS_NEW_CHAIN,
     tokens: newChainTokens,
     usdcAddress: newChainTokens[0]?.address,
     explorerUrl: 'https://explorer.newchain.com',
     enabled: env.CLOCKTOWER_ADDRESS_NEW_CHAIN !== undefined && newChainTokens.length > 0
   }
   ```

3. **No further code changes** for balance logging or emails—they iterate over `tokens` automatically.

## Usage

The script is designed to run as a scheduled Cloudflare Worker. It can be triggered either through the scheduler or via HTTP requests.

### Scheduled Execution

The worker runs on a schedule defined in `wrangler.jsonc` under `triggers.crons`. Set the schedule to whatever time you think is appropriate for your deployment. Times are in UTC.

Example format: `minute hour day month weekday` (e.g. `30 1 * * *` = daily at 01:30 UTC, `0 12 * * *` = daily at noon UTC). Edit the `crons` array in `wrangler.jsonc` to change it.

### Manual Execution

**Local testing:** To trigger the scheduled handler locally, run the dev server with the test-scheduled flag, then call the scheduler endpoint:

```bash
npm run dev -- --test-scheduled
```

In another terminal (with the worker listening on the default port, e.g. 8787):

```bash
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
```

**Production:** To run remit on demand in production, use “Run” / “Trigger” for your Worker’s cron trigger in the [Cloudflare Dashboard](https://dash.cloudflare.com/) (Workers & Pages → your worker → Triggers), or wait for the next scheduled run.

### Development

```bash
# Install dependencies
npm install

# Set up local secrets (see "Local Development Setup" section above)
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your actual values

# Run locally
npm run dev

# Deploy to Cloudflare
npm run deploy
```

**Important:** Before running locally, make sure you've created a `.dev.vars` file with your secrets. See the "Local Development Setup" section above for details.

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

