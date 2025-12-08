# Database Schema Migration Instructions

This migration updates the `tokens` table to use a composite unique constraint on `(token_address, chain_name)` instead of a single-column unique constraint on `token_address` alone.

## Why This Migration?

The original schema had `token_address TEXT UNIQUE NOT NULL`, which prevented the same token address from existing on different chains. The new schema allows the same token address (e.g., USDC) to exist on multiple chains (e.g., base and sepolia-base) with `UNIQUE(token_address, chain_name)`.

## Migration Steps

### Option 1: Cloudflare D1 Database (Remote)

```bash
cd cloudflare

# Run migration
wrangler d1 execute clocktower_caller_logs --file=migrate_tokens_schema.sql

# Verify migration
wrangler d1 execute clocktower_caller_logs --command "PRAGMA table_info(tokens);"
```

### Option 2: Local D1 Database (Created with Wrangler)

```bash
cd cloudflare

# Run migration on local D1 database (use --local flag)
wrangler d1 execute clocktower_caller_logs --local --file=migrate_tokens_schema.sql

# Verify migration
wrangler d1 execute clocktower_caller_logs --local --command "PRAGMA table_info(tokens);"
```

**Note:** The `--local` flag tells Wrangler to use the local development database instead of the remote Cloudflare D1 database.

## What the Migration Does

1. Creates a new table (`tokens_new`) with the correct schema (composite unique constraint)
2. Copies data from the old table, keeping only one record per `(token_address, chain_name)` pair
3. Drops old indexes and the old table
4. Renames the new table to `tokens`
5. Creates new composite index on `(token_address, chain_name)`

## Troubleshooting

**"table tokens already exists"**: The migration may have partially completed. Check the current state:
```bash
# For remote D1
wrangler d1 execute clocktower_caller_logs --command "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'tokens%';"

# For local D1
wrangler d1 execute clocktower_caller_logs --local --command "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'tokens%';"
```

**"Database not found" error with --local**: Make sure you've run `wrangler dev` at least once to create the local D1 database.
