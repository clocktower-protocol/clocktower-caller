# Clocktower Protocol Caller Scripts

This repository contains Cloudflare Worker scripts for the Clocktower Protocol, designed to execute the `remit` function on both Base mainnet and Base Sepolia testnet.

## Overview

The repository contains two separate Cloudflare Worker implementations:

### 🚀 [Base Mainnet Caller](./clocktower-base-caller/)
- Executes the `remit` function on Base mainnet
- Includes email notifications for both success and no-subscription scenarios
- Full database logging and analytics
- **[View Documentation →](./clocktower-base-caller/README.md)**

### 🧪 [Base Sepolia Testnet Caller](./clocktower-sepolia-base-caller/)
- Executes the `remit` function on Base Sepolia testnet
- Includes email notifications for both success and no-subscription scenarios
- Full database logging and analytics
- **[View Documentation →](./clocktower-sepolia-base-caller/README.md)**

## Key Features

Both scripts provide:
- ✅ Automated daily execution checks
- ✅ Balance tracking for both ETH and USDC
- ✅ Detailed transaction logging and error handling
- ✅ Recursive execution capability
- ✅ Analytics integration for monitoring
- ✅ Email notifications for successful transactions
- ✅ Support for both Base mainnet and Base Sepolia testnet

**Additional Features:**
- 📧 **Email Notifications**: Both success and no-subscription scenarios
- 🗄️ **Database Logging**: Comprehensive execution tracking via Cloudflare D1
- 🔄 **Recursive Execution**: Automatic retry with depth limiting
- 🛡️ **Error Handling**: Graceful failure handling and detailed logging

## Quick Start

1. **Choose your target network:**
   - For **production**: Use [Base Mainnet Caller](./clocktower-base-caller/)
   - For **testing**: Use [Base Sepolia Testnet Caller](./clocktower-sepolia-base-caller/)

2. **Follow the specific documentation:**
   - Each worker has its own detailed README with setup instructions
   - Environment variables and configuration details are documented per worker

3. **Deploy to Cloudflare Workers:**
   - Configure environment variables
   - Set up D1 database binding
   - Deploy and schedule the worker

## Repository Structure

```
clocktower-caller/
├── clocktower-base-caller/          # Base mainnet worker
│   ├── README.md                   # Mainnet-specific documentation
│   ├── remit_script.js             # Main worker script
│   ├── package.json                # Dependencies
│   └── wrangler.jsonc              # Worker configuration
├── clocktower-sepolia-base-caller/  # Base Sepolia testnet worker
│   ├── README.md                   # Testnet-specific documentation
│   ├── remit_script.js             # Main worker script
│   ├── package.json                # Dependencies
│   ├── wrangler.jsonc              # Worker configuration
│   ├── checkWalletbalance.js       # Utility scripts
│   ├── createWallet.js
│   └── schema.sql                  # Database schema
├── database-schema.md              # Database documentation
└── README.md                       # This overview file
```

## Documentation

- **[Base Mainnet Caller Documentation](./clocktower-base-caller/README.md)**
- **[Base Sepolia Testnet Caller Documentation](./clocktower-sepolia-base-caller/README.md)**
- **[Database Schema Documentation](./database-schema.md)**

## Security

- Private keys should be stored securely in environment variables
- Maximum recursion depth is limited to prevent infinite loops
- Transaction gas limits are set appropriately
- Email notifications are optional and gracefully handle failures

