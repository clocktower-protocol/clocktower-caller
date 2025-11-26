# Clocktower Protocol Caller Scripts

This repository contains implementations for the Clocktower Protocol, designed to execute the `remit` function across multiple blockchain networks. It includes both Cloudflare Worker scripts and a unified Node.js application.

## Overview

The repository contains multiple implementations:

### 🎯 [Node.js Multi-Chain Caller](./clocktower-caller-nodejs/) (Recommended)
- **Unified solution** for executing remit transactions across multiple chains
- Supports Base, Ethereum, Arbitrum, Polygon, and other EVM-compatible chains
- Configuration-driven: add new chains without code changes
- Flexible database support (SQLite for development, PostgreSQL for production)
- Comprehensive logging and email notifications
- Designed for system cron scheduling
- **[View Documentation →](./clocktower-caller-nodejs/README.md)**

### 🚀 [Base Mainnet Caller](./clocktower-base-caller/) (Cloudflare Worker)
- Executes the `remit` function on Base mainnet
- Includes email notifications for both success and no-subscription scenarios
- Full database logging and analytics via Cloudflare D1
- **[View Documentation →](./clocktower-base-caller/README.md)**

### 🧪 [Base Sepolia Testnet Caller](./clocktower-sepolia-base-caller/) (Cloudflare Worker)
- Executes the `remit` function on Base Sepolia testnet
- Includes email notifications for both success and no-subscription scenarios
- Full database logging and analytics via Cloudflare D1
- **[View Documentation →](./clocktower-sepolia-base-caller/README.md)**

## Key Features

All implementations provide:
- ✅ Automated daily execution checks
- ✅ Balance tracking for both ETH and USDC
- ✅ Detailed transaction logging and error handling
- ✅ Recursive execution capability
- ✅ Analytics integration for monitoring
- ✅ Email notifications for successful transactions
- ✅ Support for multiple blockchain networks

**Additional Features:**
- 📧 **Email Notifications**: Both success and no-subscription scenarios
- 🗄️ **Database Logging**: Comprehensive execution tracking
- 🔄 **Recursive Execution**: Automatic retry with depth limiting
- 🛡️ **Error Handling**: Graceful failure handling and detailed logging
- 🔗 **Multi-Chain Support**: Execute across multiple networks simultaneously (Node.js version)

## Quick Start

### Option 1: Node.js Implementation (Recommended)

The Node.js implementation is the recommended approach for new deployments:

1. **Navigate to the Node.js directory:**
   ```bash
   cd clocktower-caller-nodejs
   ```

2. **Follow the setup guide:**
   - See the [Node.js README](./clocktower-caller-nodejs/README.md) for detailed instructions
   - Supports multiple chains with a single configuration
   - Works with SQLite (development) or PostgreSQL (production)

3. **Set up cron scheduling:**
   - Configure system cron for automated daily execution
   - See the Node.js README for cron setup examples

### Option 2: Cloudflare Workers

For Cloudflare Workers deployments:

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
├── clocktower-caller-nodejs/        # Node.js multi-chain implementation (Recommended)
│   ├── README.md                   # Node.js documentation
│   ├── MIGRATION.md                # Migration guide from Workers
│   ├── src/                        # Source code
│   │   ├── config/                 # Configuration services
│   │   ├── services/               # Core business logic
│   │   ├── utils/                  # Utilities and helpers
│   │   ├── scripts/                # CLI tools
│   │   └── index.js                # Main entry point
│   ├── test/                       # Test suite
│   ├── database/                   # Database schema
│   └── package.json                # Dependencies
├── clocktower-base-caller/          # Base mainnet worker (Cloudflare)
│   ├── README.md                   # Mainnet-specific documentation
│   ├── remit_script.js             # Main worker script
│   ├── package.json                # Dependencies
│   └── wrangler.jsonc              # Worker configuration
├── clocktower-sepolia-base-caller/  # Base Sepolia testnet worker (Cloudflare)
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

- **[Node.js Multi-Chain Caller Documentation](./clocktower-caller-nodejs/README.md)** (Recommended)
- **[Migration Guide from Cloudflare Workers](./clocktower-caller-nodejs/MIGRATION.md)**
- **[Base Mainnet Caller Documentation](./clocktower-base-caller/README.md)** (Cloudflare Worker)
- **[Base Sepolia Testnet Caller Documentation](./clocktower-sepolia-base-caller/README.md)** (Cloudflare Worker)
- **[Database Schema Documentation](./database-schema.md)**

## Security

- Private keys should be stored securely in environment variables
- Maximum recursion depth is limited to prevent infinite loops
- Transaction gas limits are set appropriately
- Email notifications are optional and gracefully handle failures

