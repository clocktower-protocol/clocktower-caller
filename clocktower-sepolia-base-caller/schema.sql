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

-- Insert common tokens for Sepolia chain
INSERT INTO tokens (token_address, token_symbol, token_name, decimals, chain_name) VALUES
('0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', 'USDC', 'USD Coin', 6, 'sepolia'),
('0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', 'WETH', 'Wrapped Ether', 18, 'sepolia');
