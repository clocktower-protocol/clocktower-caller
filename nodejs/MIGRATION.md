# Migration Guide: Cloudflare Workers to Node.js

This guide helps you migrate from the separate Cloudflare Worker implementations to the unified Node.js Clocktower Caller.

## Overview

The Node.js version consolidates the functionality of both `clocktower-base-caller` and `clocktower-sepolia-base-caller` into a single, multi-chain application.

### Key Changes

- **Unified Codebase**: Single application instead of separate workers
- **Multi-Chain Support**: Execute across multiple chains simultaneously
- **Flexible Database**: SQLite or PostgreSQL instead of Cloudflare D1
- **System Cron**: External scheduling instead of Cloudflare cron triggers
- **Enhanced Logging**: Winston-based structured logging
- **CLI Tools**: Additional utility scripts for wallet management

## Migration Steps

### 1. Environment Variables

#### From Cloudflare Workers

**Base Mainnet Worker:**
```env
ALCHEMY_URL_BASE=https://base-mainnet.g.alchemy.com/v2/
CLOCKTOWER_ADDRESS_BASE=0xYourContractAddress
CHAIN_ID=8453
USDC_ADDRESS=0xYourUSDCAddress
```

**Base Sepolia Worker:**
```env
ALCHEMY_URL_SEPOLIA_BASE=https://base-sepolia.g.alchemy.com/v2/
CLOCKTOWER_ADDRESS_SEPOLIA_BASE=0xYourContractAddress
CHAIN_ID=84532
USDC_ADDRESS=0xYourUSDCAddress
```

#### To Node.js Application

```env
# Active chains
ACTIVE_CHAINS=base,sepolia-base

# Base Mainnet
ALCHEMY_URL_BASE=https://base-mainnet.g.alchemy.com/v2/
CLOCKTOWER_ADDRESS_BASE=0xYourContractAddress
CHAIN_ID_BASE=8453
USDC_ADDRESS_BASE=0xYourUSDCAddress

# Base Sepolia
ALCHEMY_URL_SEPOLIA_BASE=https://base-sepolia.g.alchemy.com/v2/
CLOCKTOWER_ADDRESS_SEPOLIA_BASE=0xYourContractAddress
CHAIN_ID_SEPOLIA_BASE=84532
USDC_ADDRESS_SEPOLIA_BASE=0xYourUSDCAddress

# Common configuration
CALLER_ADDRESS=0xYourWalletAddress
CALLER_PRIVATE_KEY=0xYourPrivateKey
ALCHEMY_API_KEY=your_alchemy_api_key
```

### 2. Database Migration

#### From Cloudflare D1

The D1 database schema is compatible with the Node.js version. You can export your data:

```sql
-- Export from D1
SELECT * FROM execution_logs;
SELECT * FROM token_balances;
SELECT * FROM tokens;
```

#### To Node.js Database

**SQLite (Recommended for migration):**
```env
DATABASE_TYPE=sqlite
DATABASE_PATH=./database/clocktower.db
```

**PostgreSQL (Production):**
```env
DATABASE_TYPE=postgresql
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=clocktower_caller
DATABASE_USER=your_username
DATABASE_PASSWORD=your_password
```

### 3. Scheduling Migration

#### From Cloudflare Cron Triggers

**Cloudflare Workers:**
```json
{
  "triggers": {
    "crons": ["30 0 * * *"]
  }
}
```

#### To System Cron

**Crontab:**
```bash
# Add to crontab (crontab -e)
30 0 * * * cd /path/to/clocktower-caller-nodejs && /usr/bin/node src/index.js >> logs/cron.log 2>&1
```

**PM2 (Alternative):**
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'clocktower-caller',
    script: 'src/index.js',
    cron_restart: '30 0 * * *',
    autorestart: false
  }]
};
```

### 4. Email Configuration

#### From Cloudflare Workers

```env
RESEND_API_KEY=re_your_api_key
NOTIFICATION_EMAIL=your-email@example.com
SENDER_ADDRESS=daily@notifications.clockcaller.com
```

#### To Node.js Application

Same configuration, but now supports:
- Multi-chain email templates
- Summary emails for all chains
- Enhanced error reporting

### 5. Deployment

#### From Cloudflare Workers

1. Deploy via Wrangler CLI
2. Configure environment variables in Cloudflare dashboard
3. Set up D1 database binding

#### To Node.js Application

1. **VPS/Server Deployment:**
   ```bash
   # Clone repository
   git clone <repository-url>
   cd clocktower-caller-nodejs
   
   # Install dependencies
   npm install
   
   # Configure environment
   cp .env.example .env
   # Edit .env with your configuration
   
   # Set up cron
   crontab -e
   # Add cron job
   
   # Test execution
   npm start
   ```

2. **Docker Deployment:**
   ```dockerfile
   FROM node:18-alpine
   WORKDIR /app
   COPY package*.json ./
   RUN npm install
   COPY . .
   CMD ["node", "src/index.js"]
   ```

3. **Cloud Services:**
   - AWS EC2, Google Cloud, DigitalOcean
   - Configure environment variables
   - Set up cron or scheduled tasks

## Feature Comparison

| Feature | Cloudflare Workers | Node.js Application |
|---------|-------------------|-------------------|
| Multi-Chain | ❌ Separate workers | ✅ Single application |
| Database | Cloudflare D1 | SQLite/PostgreSQL |
| Scheduling | Cloudflare cron | System cron/PM2 |
| Logging | Console logs | Winston with rotation |
| CLI Tools | ❌ | ✅ Wallet utilities |
| Configuration | Worker-specific | Environment-driven |
| Deployment | Cloudflare platform | Any server/VPS |
| Cost | Per request | Fixed server cost |

## Migration Checklist

### Pre-Migration

- [ ] Export data from Cloudflare D1 database
- [ ] Document current environment variables
- [ ] Note current cron schedules
- [ ] Test new Node.js application in development

### Migration

- [ ] Set up Node.js application
- [ ] Configure environment variables
- [ ] Set up database (SQLite or PostgreSQL)
- [ ] Import historical data (optional)
- [ ] Configure email notifications
- [ ] Set up cron scheduling
- [ ] Test execution

### Post-Migration

- [ ] Monitor logs for errors
- [ ] Verify email notifications
- [ ] Check database logging
- [ ] Test wallet balance checking
- [ ] Verify multi-chain execution
- [ ] Decommission Cloudflare Workers

## Data Migration Script

If you need to migrate data from Cloudflare D1 to the Node.js database:

```javascript
// migrate-data.js
import { DatabaseService } from './src/services/database.js';

async function migrateData() {
  const db = new DatabaseService();
  await db.initialize();
  
  // Import your exported data here
  // This is a simplified example
  
  console.log('Data migration completed');
  await db.close();
}

migrateData().catch(console.error);
```

## Troubleshooting

### Common Migration Issues

1. **Environment Variable Mismatch**
   - Check variable names and formats
   - Ensure all required variables are set
   - Verify chain-specific configurations

2. **Database Connection Issues**
   - Check database configuration
   - Ensure database server is running (PostgreSQL)
   - Verify file permissions (SQLite)

3. **Cron Job Not Running**
   - Check cron syntax
   - Verify file paths
   - Check log files for errors
   - Test manual execution

4. **Email Notifications Not Working**
   - Verify Resend API key
   - Check email addresses
   - Review email service logs

### Rollback Plan

If you need to rollback to Cloudflare Workers:

1. Keep Cloudflare Workers running during migration
2. Disable cron triggers on Cloudflare Workers
3. Run Node.js application in parallel
4. Compare results and logs
5. If issues arise, re-enable Cloudflare Workers
6. Fix Node.js application issues
7. Repeat migration process

## Support

For migration assistance:

1. Check the logs for specific error messages
2. Review this migration guide
3. Test with a single chain first
4. Use debug logging: `LOG_LEVEL=debug npm start`
5. Open an issue in the repository

## Benefits of Migration

- **Unified Management**: Single codebase for all chains
- **Cost Efficiency**: Fixed server cost vs. per-request pricing
- **Enhanced Monitoring**: Better logging and debugging
- **Flexibility**: Easy to add new chains or features
- **CLI Tools**: Additional utilities for wallet management
- **Local Development**: Easier to test and debug locally
