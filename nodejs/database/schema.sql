-- =============================================================================
-- CLOCKTOWER CALLER DATABASE SCHEMA
-- =============================================================================
-- 
-- This schema supports both SQLite and PostgreSQL databases.
-- Comments indicate database-specific syntax where applicable.
-- 
-- SQLite: Uses INTEGER PRIMARY KEY AUTOINCREMENT, datetime('now')
-- PostgreSQL: Uses SERIAL, NOW()
-- =============================================================================

-- =============================================================================
-- TOKEN REGISTRY TABLE
-- =============================================================================
-- Stores information about tokens tracked across different chains

CREATE TABLE tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,  -- PostgreSQL: SERIAL PRIMARY KEY
  token_address TEXT NOT NULL,
  token_symbol TEXT NOT NULL,
  token_name TEXT NOT NULL,
  decimals INTEGER NOT NULL,
  chain_name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TEXT DEFAULT (datetime('now')),  -- PostgreSQL: TIMESTAMP DEFAULT NOW()
  UNIQUE(token_address, chain_name)
);

-- =============================================================================
-- EXECUTION LOGS TABLE
-- =============================================================================
-- Main table for tracking script executions across multiple chains

CREATE TABLE execution_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,  -- PostgreSQL: SERIAL PRIMARY KEY
  execution_id TEXT UNIQUE,
  timestamp TEXT NOT NULL,  -- PostgreSQL: TIMESTAMP
  chain_name TEXT NOT NULL,
  chain_display_name TEXT NOT NULL,
  
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
  created_at TEXT DEFAULT (datetime('now'))  -- PostgreSQL: TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- TOKEN BALANCE TRACKING TABLE
-- =============================================================================
-- Separate table for tracking token balances per execution (flexible design)

CREATE TABLE token_balances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,  -- PostgreSQL: SERIAL PRIMARY KEY
  execution_log_id INTEGER,
  token_id INTEGER,
  balance_before REAL,
  balance_after REAL,
  created_at TEXT DEFAULT (datetime('now')),  -- PostgreSQL: TIMESTAMP DEFAULT NOW()
  FOREIGN KEY (execution_log_id) REFERENCES execution_logs(id),
  FOREIGN KEY (token_id) REFERENCES tokens(id)
);

-- =============================================================================
-- INDEXES FOR EFFICIENT QUERYING
-- =============================================================================

-- Execution logs indexes
CREATE INDEX idx_execution_logs_timestamp ON execution_logs(timestamp);
CREATE INDEX idx_execution_logs_tx_hash ON execution_logs(tx_hash);
CREATE INDEX idx_execution_logs_status ON execution_logs(tx_status);
CREATE INDEX idx_execution_logs_chain ON execution_logs(chain_name);
CREATE INDEX idx_execution_logs_execution_id ON execution_logs(execution_id);
CREATE INDEX idx_execution_logs_chain_timestamp ON execution_logs(chain_name, timestamp);

-- Token balances indexes
CREATE INDEX idx_token_balances_execution ON token_balances(execution_log_id);
CREATE INDEX idx_token_balances_token ON token_balances(token_id);

-- Tokens indexes
CREATE INDEX idx_tokens_address_chain ON tokens(token_address, chain_name);
CREATE INDEX idx_tokens_chain ON tokens(chain_name);
CREATE INDEX idx_tokens_active ON tokens(is_active);

-- =============================================================================
-- SAMPLE DATA
-- =============================================================================
-- Insert common tokens for different chains

-- Base Mainnet tokens
INSERT INTO tokens (token_address, token_symbol, token_name, decimals, chain_name) VALUES
('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', 'USDC', 'USD Coin', 6, 'base'),
('0x4200000000000000000000000000000000000006', 'WETH', 'Wrapped Ether', 18, 'base'),
('0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', 'cbETH', 'Coinbase Wrapped Staked ETH', 18, 'base');

-- Base Sepolia tokens
INSERT INTO tokens (token_address, token_symbol, token_name, decimals, chain_name) VALUES
('0x036CbD53842c5426634e7929541eC2318f3dCF7e', 'USDC', 'USD Coin', 6, 'sepolia-base'),
('0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', 'WETH', 'Wrapped Ether', 18, 'sepolia-base');

-- Ethereum Mainnet tokens (uncomment if needed)
-- INSERT INTO tokens (token_address, token_symbol, token_name, decimals, chain_name) VALUES
-- ('0xA0b86a33E6441b8c4C8C0C4C0C4C0C4C0C4C0C4C', 'USDC', 'USD Coin', 6, 'ethereum'),
-- ('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 'WETH', 'Wrapped Ether', 18, 'ethereum');

-- Arbitrum Mainnet tokens (uncomment if needed)
-- INSERT INTO tokens (token_address, token_symbol, token_name, decimals, chain_name) VALUES
-- ('0xYourArbUSDCAddress', 'USDC', 'USD Coin', 6, 'arbitrum'),
-- ('0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', 'WETH', 'Wrapped Ether', 18, 'arbitrum');

-- Polygon Mainnet tokens (uncomment if needed)
-- INSERT INTO tokens (token_address, token_symbol, token_name, decimals, chain_name) VALUES
-- ('0xYourPolygonUSDCAddress', 'USDC', 'USD Coin', 6, 'polygon'),
-- ('0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', 'WMATIC', 'Wrapped MATIC', 18, 'polygon');

-- =============================================================================
-- USEFUL QUERIES
-- =============================================================================

-- Get recent executions across all chains
-- SELECT 
--   execution_id,
--   chain_display_name,
--   timestamp,
--   tx_status,
--   execution_time_ms
-- FROM execution_logs 
-- ORDER BY timestamp DESC 
-- LIMIT 10;

-- Get failed transactions
-- SELECT 
--   execution_id,
--   chain_display_name,
--   timestamp,
--   tx_hash,
--   revert_reason
-- FROM execution_logs 
-- WHERE tx_status = 0 
-- ORDER BY timestamp DESC;

-- Get token balances for a specific execution
-- SELECT 
--   el.execution_id,
--   el.chain_display_name,
--   t.token_symbol,
--   tb.balance_before,
--   tb.balance_after
-- FROM execution_logs el
-- JOIN token_balances tb ON el.id = tb.execution_log_id
-- JOIN tokens t ON tb.token_id = t.id
-- WHERE el.execution_id = 'your-execution-id';

-- Get execution statistics by chain
-- SELECT 
--   chain_display_name,
--   COUNT(*) as total_executions,
--   SUM(CASE WHEN tx_status = 1 THEN 1 ELSE 0 END) as successful_txs,
--   AVG(execution_time_ms) as avg_execution_time,
--   MAX(timestamp) as last_execution
-- FROM execution_logs 
-- GROUP BY chain_display_name
-- ORDER BY total_executions DESC;

-- Get daily execution counts
-- SELECT 
--   DATE(timestamp) as execution_date,
--   chain_display_name,
--   COUNT(*) as execution_count
-- FROM execution_logs 
-- WHERE timestamp >= datetime('now', '-30 days')  -- PostgreSQL: NOW() - INTERVAL '30 days'
-- GROUP BY DATE(timestamp), chain_display_name
-- ORDER BY execution_date DESC;

-- Get error statistics
-- SELECT 
--   chain_display_name,
--   error_message,
--   COUNT(*) as error_count
-- FROM execution_logs 
-- WHERE error_message IS NOT NULL
-- GROUP BY chain_display_name, error_message
-- ORDER BY error_count DESC;
