# Clocktower Protocol Caller Script

This repository contains an example caller script for the Clocktower Protocol, designed to execute the `remit` function on the Base Sepolia network.

## Overview

The script is implemented as a Cloudflare Worker that can be scheduled to run periodically. It performs the following key functions:

- Checks if the `remit` function has already been called for the current day
- Executes the `remit` function on the Clocktower Protocol contract
- Tracks ETH and USDC balances before and after execution
- Handles transaction failures and provides detailed error reporting
- Implements recursive execution with a maximum depth limit
- Logs execution data to analytics

## Features

- Automated daily execution checks
- Balance tracking for both ETH and USDC
- Detailed transaction logging and error handling
- Recursive execution capability
- Analytics integration for monitoring
- Support for Base Sepolia testnet

## Environment Variables

The script requires the following environment variables:

- `ALCHEMY_URL_SEPOLIA_BASE`: Alchemy API URL for Base Sepolia
- `ALCHEMY_API_KEY`: Alchemy API key
- `CHAIN_ID`: Network chain ID
- `CLOCKTOWER_ADDRESS_SEPOLIA_BASE`: Clocktower Protocol contract address
- `CALLER_PRIVATE_KEY`: Private key for the caller account
- `CALLER_ADDRESS`: Address of the caller account
- `USDC_ADDRESS`: USDC token contract address

## Usage

The script is designed to run as a scheduled Cloudflare Worker. It can be triggered either through the scheduler or via HTTP requests.

### Scheduled Execution

The script runs automatically based on the configured schedule in Cloudflare Workers.

### Manual Execution

You can trigger the script manually by sending a GET request to the worker's endpoint.

## Error Handling

The script includes comprehensive error handling:
- Transaction failure detection
- Revert reason extraction
- Balance tracking
- Analytics logging

## Analytics

Execution data is logged to Cloudflare Analytics, including:
- Transaction status
- Balance changes
- Error messages
- Execution depth
- Chain information

## Security

- Private keys should be stored securely in environment variables
- Maximum recursion depth is limited to prevent infinite loops
- Transaction gas limits are set appropriately

