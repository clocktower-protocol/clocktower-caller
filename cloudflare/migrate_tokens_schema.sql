-- Migration script to update tokens table schema
-- Changes: Remove single-column UNIQUE constraint on token_address
--          Add composite UNIQUE constraint on (token_address, chain_name)
--          Update index to composite

-- Step 1: Create new tokens table with correct schema
CREATE TABLE tokens_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_address TEXT NOT NULL,
  token_symbol TEXT NOT NULL,
  token_name TEXT NOT NULL,
  decimals INTEGER NOT NULL,
  chain_name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(token_address, chain_name)
);

-- Step 2: Copy all data from old table to new table
-- Note: If there are duplicate (token_address, chain_name) pairs, only the first one (lowest id) will be kept
INSERT INTO tokens_new (id, token_address, token_symbol, token_name, decimals, chain_name, is_active, created_at)
SELECT 
  id, 
  token_address, 
  token_symbol, 
  token_name, 
  decimals, 
  chain_name, 
  is_active, 
  created_at
FROM tokens
WHERE id IN (
  SELECT MIN(id) 
  FROM tokens 
  GROUP BY token_address, chain_name
);

-- Step 3: Drop old indexes
DROP INDEX IF EXISTS idx_tokens_address;

-- Step 4: Drop old table
DROP TABLE tokens;

-- Step 5: Rename new table to original name
ALTER TABLE tokens_new RENAME TO tokens;

-- Step 6: Create new composite index
CREATE INDEX idx_tokens_address_chain ON tokens(token_address, chain_name);
