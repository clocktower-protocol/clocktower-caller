# Clocktower Protocol Base Mainnet Caller

This is a Cloudflare Worker script that executes the `remit` function on the Clocktower Protocol contract deployed on Base mainnet.

## Overview

The script is designed to run as a scheduled Cloudflare Worker that performs the following key functions:

- Checks if the `remit` function has already been called for the current day
- Executes the `remit` function on the Clocktower Protocol contract
- Tracks ETH and USDC balances before and after execution
- Handles transaction failures and provides detailed error reporting
- Implements recursive execution with a maximum depth limit
- Logs execution data to analytics
- Sends email notifications for both successful transactions and no-subscription scenarios

## Features

- Automated daily execution checks
- Balance tracking for both ETH and USDC
- Detailed transaction logging and error handling
- Recursive execution capability
- Analytics integration for monitoring
- Email notifications for successful transactions
- Email notifications for no-subscription scenarios
- Support for Base mainnet

## Environment Variables

The script requires the following environment variables:

### Blockchain Configuration
- `ALCHEMY_URL_BASE`: Alchemy API URL for Base network
- `ALCHEMY_API_KEY`: Alchemy API key
- `CHAIN_ID`: Network chain ID
- `CLOCKTOWER_ADDRESS_BASE`: Clocktower Protocol contract address
- `CALLER_PRIVATE_KEY`: Private key for the caller account
- `CALLER_ADDRESS`: Address of the caller account
- `USDC_ADDRESS`: USDC token contract address

### Database Configuration
- `DB`: Cloudflare D1 database binding for execution logging

### Email Notifications (Optional)
- `RESEND_API_KEY`: Resend API key for sending email notifications
- `NOTIFICATION_EMAIL`: Email address to receive notifications
- `SENDER_ADDRESS`: Sender email address (defaults to 'onboarding@resend.dev' if not provided)

## Usage

The script is designed to run as a scheduled Cloudflare Worker. It can be triggered either through the scheduler or via HTTP requests.

### Scheduled Execution

The script runs automatically based on the configured schedule in Cloudflare Workers.

### Manual Execution

You can trigger the script manually by sending a GET request to the worker's endpoint.

## Email Notifications

The script includes comprehensive email notification functionality that sends alerts in two scenarios:

### Success Notifications
When the `remit` function executes successfully, an email is sent containing:
- Transaction hash with link to BaseScan
- ETH and USDC balance changes
- Recursion depth information
- Timestamp and execution details

### No Subscriptions Notifications
When no active subscriptions are found for the current day, an email is sent containing:
- Current day and next unchecked day information
- Explanation of what "no subscriptions" means
- Status confirmation that no remit transaction was needed

### Email Configuration
Email notifications are optional and will be skipped if the required environment variables are not configured:
- `RESEND_API_KEY`: Required for sending emails
- `NOTIFICATION_EMAIL`: Required for receiving notifications
- `SENDER_ADDRESS`: Optional, defaults to 'onboarding@resend.dev'

The email system includes graceful error handling - if email sending fails, the script continues execution normally and logs the error.

## Error Handling

The script includes comprehensive error handling:
- Transaction failure detection
- Revert reason extraction
- Balance tracking
- Analytics logging

## Analytics

Execution data is logged to a Cloudflare D1 database, including:
- Transaction status and hash
- Balance changes (ETH and USDC)
- Error messages and revert reasons
- Execution depth and recursion information
- Chain information and timestamps
- Token balance tracking
- Precheck results and subscription status

## Security

- Private keys should be stored securely in environment variables
- Maximum recursion depth is limited to prevent infinite loops
- Transaction gas limits are set appropriately

## Deployment

1. Configure all required environment variables in your Cloudflare Worker
2. Set up the D1 database binding
3. Deploy the worker to Cloudflare
4. Configure the scheduled trigger (cron job)
5. Optionally configure email notifications

## Files

- `remit_script.js`: Main worker script
- `package.json`: Node.js dependencies
- `wrangler.jsonc`: Cloudflare Worker configuration
