# Clocktower Caller Database Schema

This document contains the SQL schema for the logging database used by the Clocktower Caller Worker.

## Overview

The database is designed to track script executions across multiple chains and tokens, providing comprehensive logging for debugging, monitoring, and analytics.

## Schema

```sql
-- Token registry table
CREATE TABLE tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_address TEXT UNIQUE NOT NULL,
  token_symbol TEXT NOT NULL,
  token_name TEXT NOT NULL,
  decimals INTEGER NOT NULL,
  chain_name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Main execution log table
CREATE TABLE execution_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_id TEXT UNIQUE,
  timestamp TEXT NOT NULL,
  chain_name TEXT NOT NULL,
  
  -- Pre-check results
  precheck_passed BOOLEAN NOT NULL,
  current_day INTEGER,
  next_unchecked_day INTEGER,
  should_proceed BOOLEAN,
  
  -- Transaction details
  tx_hash TEXT,
  tx_status INTEGER, -- 0 = failed, 1 = success
  revert_reason TEXT,
  gas_used INTEGER,
  
  -- ETH balance tracking (always present)
  balance_before_eth REAL,
  balance_after_eth REAL,
  
  -- Recursion tracking
  recursion_depth INTEGER DEFAULT 0,
  max_recursion_reached BOOLEAN DEFAULT FALSE,
  
  -- Error handling
  error_message TEXT,
  error_stack TEXT,
  
  -- Performance metrics
  execution_time_ms INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Token balance tracking (separate table for flexibility)
CREATE TABLE token_balances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_log_id INTEGER,
  token_id INTEGER,
  balance_before REAL,
  balance_after REAL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (execution_log_id) REFERENCES execution_logs(id),
  FOREIGN KEY (token_id) REFERENCES tokens(id)
);

-- Indexes for efficient querying
CREATE INDEX idx_execution_logs_timestamp ON execution_logs(timestamp);
CREATE INDEX idx_execution_logs_tx_hash ON execution_logs(tx_hash);
CREATE INDEX idx_execution_logs_status ON execution_logs(tx_status);
CREATE INDEX idx_execution_logs_chain ON execution_logs(chain_name);
CREATE INDEX idx_token_balances_execution ON token_balances(execution_log_id);
CREATE INDEX idx_tokens_address ON tokens(token_address);
```

## Sample Data

```sql
-- Insert common tokens for Base chain
INSERT INTO tokens (token_address, token_symbol, token_name, decimals, chain_name) VALUES
('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', 'USDC', 'USD Coin', 6, 'base'),
('0x4200000000000000000000000000000000000006', 'WETH', 'Wrapped Ether', 18, 'base'),
('0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', 'cbETH', 'Coinbase Wrapped Staked ETH', 18, 'base');

-- Insert common tokens for Sepolia chain
INSERT INTO tokens (token_address, token_symbol, token_name, decimals, chain_name) VALUES
('0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', 'USDC', 'USD Coin', 6, 'sepolia'),
('0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', 'WETH', 'Wrapped Ether', 18, 'sepolia');
```

## Usage

### Setup

1. Create a D1 database:
```bash
wrangler d1 create clocktower-logs
```

2. Add the database binding to your `wrangler.toml`:
```toml
[[d1_databases]]
binding = "DB"
database_name = "clocktower-logs"
database_id = "your-database-id"
```

3. Apply the schema:
```bash
wrangler d1 execute clocktower-logs --file=schema.sql
```

### Example Queries

**Get recent executions:**
```sql
SELECT * FROM execution_logs 
ORDER BY timestamp DESC 
LIMIT 10;
```

**Get failed transactions:**
```sql
SELECT * FROM execution_logs 
WHERE tx_status = 0 
ORDER BY timestamp DESC;
```

**Get token balances for an execution:**
```sql
SELECT 
  el.execution_id,
  t.token_symbol,
  tb.balance_before,
  tb.balance_after
FROM execution_logs el
JOIN token_balances tb ON el.id = tb.execution_log_id
JOIN tokens t ON tb.token_id = t.id
WHERE el.execution_id = 'your-execution-id';
```

**Get execution statistics:**
```sql
SELECT 
  chain_name,
  COUNT(*) as total_executions,
  SUM(CASE WHEN tx_status = 1 THEN 1 ELSE 0 END) as successful_txs,
  AVG(execution_time_ms) as avg_execution_time
FROM execution_logs 
GROUP BY chain_name;
```

## Benefits

- **Scalable**: Easy to add new tokens without schema changes
- **Flexible**: Can track any number of tokens per execution
- **Efficient**: Only stores balance data for tokens that were actually checked
- **Queryable**: Easy to analyze token-specific data
- **Future-proof**: Can add token metadata like contract versions, etc.
