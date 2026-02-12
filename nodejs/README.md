# Clocktower Caller Node.js

A unified Node.js application for executing Clocktower Protocol `remit` transactions across multiple blockchain networks. This application replaces the separate Cloudflare Workers with a single, configuration-driven solution that supports Base, Ethereum, Arbitrum, and other EVM-compatible chains.

## Features

- ✅ **Multi-Chain Support**: Execute remit transactions across multiple chains simultaneously
- ✅ **Configuration-Driven**: Add new chains without code changes via environment variables
- ✅ **Flexible Database**: Support for both SQLite (development) and PostgreSQL (production)
- ✅ **Comprehensive Logging**: Winston-based structured logging with daily rotation
- ✅ **Email Notifications**: Success, failure, and summary notifications via Resend
- ✅ **CLI Tools**: Wallet management and balance checking utilities
- ✅ **Cron-Ready**: Designed for system cron scheduling (no internal scheduler)
- ✅ **Error Handling**: Graceful failure handling per chain with detailed logging
- ✅ **Recursive Execution**: Automatic retry with configurable depth limiting

## Quick Start

### 1. Installation

```bash
# Clone or download the project
cd clocktower-caller-nodejs

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
```

### 2. Configuration

Edit `.env` file with your configuration:

```env
# Active chains (comma-separated)
ACTIVE_CHAINS=base,sepolia-base

# Wallet configuration
CALLER_ADDRESS=0xYourWalletAddress
CALLER_PRIVATE_KEY=0xYourPrivateKey

# Alchemy API key
ALCHEMY_API_KEY=your_alchemy_api_key

# Email configuration (optional)
RESEND_API_KEY=re_your_resend_api_key
NOTIFICATION_EMAIL=your-email@example.com

# Database configuration
DATABASE_TYPE=sqlite
DATABASE_PATH=./database/clocktower.db
```

### 3. Run

```bash
# One-time execution
npm start

# Check wallet balance
npm run check-balance

# Create new wallet
npm run create-wallet
```

### 4. Set up Cron

```bash
# Add to crontab (run daily at 00:30 UTC)
30 0 * * * cd /path/to/clocktower-caller-nodejs && /usr/bin/node src/index.js >> logs/cron.log 2>&1
```

## Configuration

### Environment Variables

#### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `CALLER_ADDRESS` | Wallet address for executing transactions | `0x1234...` |
| `CALLER_PRIVATE_KEY` | Private key for the wallet | `0xabcd...` |
| `ALCHEMY_API_KEY` | Alchemy API key for blockchain access | `your_key_here` |

#### Chain Configuration

Each chain requires these variables (replace `CHAIN` with chain name):

| Variable | Description | Example |
|----------|-------------|---------|
| `ALCHEMY_URL_CHAIN` | Alchemy RPC URL | `https://base-mainnet.g.alchemy.com/v2/` |
| `CLOCKTOWER_ADDRESS_CHAIN` | Clocktower contract address | `0x1234...` |
| `CHAIN_ID_CHAIN` | Chain ID | `8453` |
| **Tokens** | Either `TOKENS_CHAIN` or `USDC_ADDRESS_CHAIN` (see below) | |
| `TOKENS_CHAIN` | JSON array of tokens to track (full list for this chain). Objects: `address`, `symbol`, optional `name`, `decimals`. You can include USDC and others; when set, `USDC_ADDRESS_CHAIN` is optional. | `[{"address":"0x...","symbol":"USDC","name":"USD Coin","decimals":6}]` |
| `USDC_ADDRESS_CHAIN` | Fallback when `TOKENS_CHAIN` is unset—tracks a single USDC token. | `0x1234...` |

#### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ACTIVE_CHAINS` | Comma-separated list of active chains | `base` |
| `DATABASE_TYPE` | Database type (`sqlite` or `postgresql`) | `sqlite` |
| `LOG_LEVEL` | Logging level | `info` |
| `MAX_RECURSION_DEPTH` | Maximum recursion depth | `5` |
| `GAS_LIMIT` | Gas limit for transactions | `1000000` |

### Supported Chains

- **Base Mainnet** (`base`)
- **Base Sepolia** (`sepolia-base`)
- **Ethereum Mainnet** (`ethereum`) - *uncomment in .env*
- **Arbitrum Mainnet** (`arbitrum`) - *uncomment in .env*
- **Polygon Mainnet** (`polygon`) - *uncomment in .env*

## Database Setup

### SQLite (Default)

No additional setup required. The database file will be created automatically.

### PostgreSQL

1. Install PostgreSQL
2. Create database:
   ```sql
   CREATE DATABASE clocktower_caller;
   ```
3. Update `.env`:
   ```env
   DATABASE_TYPE=postgresql
   DATABASE_HOST=localhost
   DATABASE_PORT=5432
   DATABASE_NAME=clocktower_caller
   DATABASE_USER=your_username
   DATABASE_PASSWORD=your_password
   ```

## CLI Tools

### Check Wallet Balance

```bash
# Check balance for configured wallet
npm run check-balance

# Check balance for specific address
node src/scripts/checkWalletBalance.js 0x1234...

# Check balance across all active chains
node src/scripts/checkWalletBalance.js
```

### Create Wallet

```bash
# Generate new wallet
npm run create-wallet

# Generate and save to file
node src/scripts/createWallet.js --save

# Use specific private key
node src/scripts/createWallet.js --private-key 0x1234...

# Hide private key in output
node src/scripts/createWallet.js --hide-key
```

## Cron Setup

### System Cron

Add to crontab (`crontab -e`):

```bash
# Daily at 00:30 UTC
30 0 * * * cd /path/to/clocktower-caller-nodejs && /usr/bin/node src/index.js >> logs/cron.log 2>&1

# Every 6 hours
0 */6 * * * cd /path/to/clocktower-caller-nodejs && /usr/bin/node src/index.js >> logs/cron.log 2>&1

# Every hour (for testing)
0 * * * * cd /path/to/clocktower-caller-nodejs && /usr/bin/node src/index.js >> logs/cron.log 2>&1
```

### PM2 (Alternative)

```bash
# Install PM2
npm install -g pm2

# Create ecosystem file
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'clocktower-caller',
    script: 'src/index.js',
    cron_restart: '30 0 * * *',
    autorestart: false,
    env: {
      NODE_ENV: 'production'
    }
  }]
};
EOF

# Start with PM2
pm2 start ecosystem.config.js
```

## Logging

Logs are stored in the `logs/` directory:

- `clocktower-YYYY-MM-DD.log` - General logs
- `clocktower-error-YYYY-MM-DD.log` - Error logs only
- `cron.log` - Cron execution logs

### Log Levels

- `error` - Error messages only
- `warn` - Warnings and errors
- `info` - General information (default)
- `debug` - Detailed debugging information

## Email Notifications

Configure email notifications in `.env`:

```env
RESEND_API_KEY=re_your_resend_api_key
NOTIFICATION_EMAIL=your-email@example.com
SENDER_ADDRESS=daily@notifications.clockcaller.com
```

### Email Types

- **Success**: Sent when remit transaction succeeds
- **No Subscriptions**: Sent when no subscriptions are found
- **Summary**: Sent after multi-chain execution with results

## Development

### Project Structure

```
clocktower-caller-nodejs/
├── src/
│   ├── config/          # Configuration services
│   ├── services/        # Core business logic
│   ├── utils/           # Utilities and helpers
│   ├── scripts/         # CLI tools
│   └── index.js         # Main entry point
├── database/
│   └── schema.sql       # Database schema
├── logs/                # Log files
├── .env.example         # Environment template
└── package.json
```

### Running in Development

```bash
# Watch mode
npm run dev

# Check specific chain
ACTIVE_CHAINS=base npm start

# Debug mode
LOG_LEVEL=debug npm start
```

## Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Check database configuration in `.env`
   - Ensure database server is running (PostgreSQL)
   - Check file permissions (SQLite)

2. **Wallet Balance Insufficient**
   - Ensure wallet has enough ETH for gas
   - Check gas limit configuration
   - Verify wallet address and private key

3. **Chain Connection Failed**
   - Verify Alchemy API key
   - Check chain configuration
   - Ensure network connectivity

4. **Email Notifications Not Working**
   - Verify Resend API key
   - Check email addresses
   - Review email service logs

### Debug Mode

Enable debug logging:

```bash
LOG_LEVEL=debug npm start
```

### Check Logs

```bash
# View recent logs
tail -f logs/clocktower-$(date +%Y-%m-%d).log

# View error logs
tail -f logs/clocktower-error-$(date +%Y-%m-%d).log

# View cron logs
tail -f logs/cron.log
```

## Migration from Cloudflare Workers

See [MIGRATION.md](./MIGRATION.md) for detailed migration instructions.

## Security

### Private Key Management

- **Store private keys securely**: Private keys are only accessed from environment variables (`CALLER_PRIVATE_KEY`)
- **Never commit private keys**: 
  - The `.env` file is gitignored
  - The `createWallet.js` script can generate `.env.wallet` files - these are also gitignored
  - **Never commit** `.env`, `.env.wallet`, or any files containing private keys
- **Best practices**:
  - Use environment variables for all sensitive data
  - If using `createWallet.js --save`, manually copy keys to your main `.env` file and delete `.env.wallet`
  - Use a secrets management service (AWS Secrets Manager, HashiCorp Vault, etc.) in production
  - Consider using hardware wallets for production deployments
  - Regularly rotate API keys and private keys
  - Monitor logs for suspicious activity
  - Restrict file permissions on `.env` files: `chmod 600 .env`

## License

MIT License - see [LICENSE](./LICENSE) file for details.

## Support

For issues and questions:

1. Check the logs for error messages
2. Review this documentation
3. Check the migration guide
4. Open an issue in the repository
