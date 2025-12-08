/**
 * Database Service
 * 
 * Unified database interface supporting both SQLite and PostgreSQL.
 * Handles database initialization, schema management, and data operations.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DatabaseConfigService } from '../config/database.js';
import { Logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class DatabaseService {
  constructor() {
    this.config = new DatabaseConfigService();
    this.db = null;
    this.logger = new Logger('DatabaseService');
    this.isInitialized = false;
  }

  /**
   * Initialize database connection and schema
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      // Validate configuration
      const validation = this.config.validateConfig();
      if (!validation.valid) {
        throw new Error(`Database configuration invalid: ${validation.errors.join(', ')}`);
      }

      // Log warnings
      validation.warnings.forEach(warning => {
        this.logger.warn(warning);
      });

      // Initialize database connection
      await this.connect();

      // Initialize schema
      await this.initializeSchema();

      this.isInitialized = true;
      this.logger.info(`Database initialized successfully (${this.config.getDatabaseType()})`);
    } catch (error) {
      this.logger.error('Failed to initialize database', error);
      throw error;
    }
  }

  /**
   * Connect to database
   * @returns {Promise<void>}
   */
  async connect() {
    if (this.config.isSQLite()) {
      await this.connectSQLite();
    } else if (this.config.isPostgreSQL()) {
      await this.connectPostgreSQL();
    } else {
      throw new Error(`Unsupported database type: ${this.config.getDatabaseType()}`);
    }
  }

  /**
   * Connect to SQLite database
   * @returns {Promise<void>}
   */
  async connectSQLite() {
    try {
      const Database = (await import('better-sqlite3')).default;
      const options = this.config.getConnectionOptions();
      
      this.db = new Database(options.filename, { verbose: options.verbose });
      
      // Enable WAL mode for better concurrency
      this.db.pragma('journal_mode = WAL');
      
      this.logger.info(`Connected to SQLite database: ${options.filename}`);
    } catch (error) {
      this.logger.error('Failed to connect to SQLite database', error);
      throw error;
    }
  }

  /**
   * Connect to PostgreSQL database
   * @returns {Promise<void>}
   */
  async connectPostgreSQL() {
    try {
      const { Pool } = await import('pg');
      const options = this.config.getConnectionOptions();
      
      this.db = new Pool(options);
      
      // Test connection
      const client = await this.db.connect();
      await client.query('SELECT NOW()');
      client.release();
      
      this.logger.info(`Connected to PostgreSQL database: ${options.database}`);
    } catch (error) {
      this.logger.error('Failed to connect to PostgreSQL database', error);
      throw error;
    }
  }

  /**
   * Initialize database schema
   * @returns {Promise<void>}
   */
  async initializeSchema() {
    try {
      const schemaPath = join(__dirname, '../../database/schema.sql');
      const schema = readFileSync(schemaPath, 'utf8');
      
      if (this.config.isSQLite()) {
        // If core tables already exist, skip schema application (idempotent init)
        const existing = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('execution_logs','tokens','token_balances')").all();
        if (existing && existing.length === 3) {
          this.logger.info('Database schema already present, skipping initialization');
        } else {
          this.db.exec(schema);
        }
      } else if (this.config.isPostgreSQL()) {
        // Remove SQL comments, then split into statements for PostgreSQL
        const cleaned = schema
          .split('\n')
          .filter(line => !line.trim().startsWith('--'))
          .join('\n');

        const statements = cleaned
          .split(';')
          .map(stmt => stmt.trim())
          .filter(stmt => stmt.length > 0);

        // Execute statements for PostgreSQL
        const client = await this.db.connect();
        try {
          for (const statement of statements) {
            if (statement.trim()) {
              await client.query(statement);
            }
          }
        } finally {
          client.release();
        }
      }

      this.logger.info('Database schema initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize database schema', error);
      throw error;
    }
  }

  /**
   * Log execution to database
   * @param {Object} data - Execution data
   * @returns {Promise<number>} Execution log ID
   */
  async logExecution(data) {
    if (!this.isInitialized) {
      throw new Error('Database not initialized');
    }

    try {
      const sql = `
        INSERT INTO execution_logs (
          execution_id, timestamp, chain_name, chain_display_name, precheck_passed, 
          current_day, next_unchecked_day, should_proceed, tx_hash, tx_status, 
          revert_reason, gas_used, balance_before_eth, balance_after_eth, 
          recursion_depth, max_recursion_reached, error_message, error_stack, 
          execution_time_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      // Helper to convert undefined to null (SQLite requirement)
      const toNull = (v) => (v === undefined ? null : v);
      // Helper to convert boolean to SQLite integer (0 or 1)
      const boolToSqlite = (v) => {
        if (v === null || v === undefined) return null;
        return v ? 1 : 0;
      };

      if (this.config.isSQLite()) {
        const params = [
          toNull(data.execution_id),
          toNull(data.timestamp),
          toNull(data.chain_name),
          toNull(data.chain_display_name),
          boolToSqlite(data.precheck_passed),
          toNull(data.current_day),
          toNull(data.next_unchecked_day),
          boolToSqlite(data.should_proceed),
          toNull(data.tx_hash),
          toNull(data.tx_status),
          toNull(data.revert_reason),
          toNull(data.gas_used),
          toNull(data.balance_before_eth),
          toNull(data.balance_after_eth),
          toNull(data.recursion_depth),
          boolToSqlite(data.max_recursion_reached),
          toNull(data.error_message),
          toNull(data.error_stack),
          toNull(data.execution_time_ms)
        ];
        const stmt = this.db.prepare(sql);
        const result = stmt.run(...params);
        return result.lastInsertRowid;
      } else if (this.config.isPostgreSQL()) {
        const params = [
          data.execution_id,
          data.timestamp,
          data.chain_name,
          data.chain_display_name,
          data.precheck_passed,
          data.current_day,
          data.next_unchecked_day,
          data.should_proceed,
          data.tx_hash,
          data.tx_status,
          data.revert_reason,
          data.gas_used,
          data.balance_before_eth,
          data.balance_after_eth,
          data.recursion_depth,
          data.max_recursion_reached,
          data.error_message,
          data.error_stack,
          data.execution_time_ms
        ];
        const client = await this.db.connect();
        try {
          const result = await client.query(sql, params);
          return result.rows[0].id;
        } finally {
          client.release();
        }
      }
    } catch (error) {
      this.logger.error('Failed to log execution', error);
      throw error;
    }
  }

  /**
   * Log token balance to database
   * @param {number} executionLogId - Execution log ID
   * @param {string} tokenAddress - Token address
   * @param {number} balanceBefore - Balance before
   * @param {number} balanceAfter - Balance after
   * @param {string} chainName - Chain name
   * @returns {Promise<void>}
   */
  async logTokenBalance(executionLogId, tokenAddress, balanceBefore, balanceAfter, chainName) {
    if (!this.isInitialized) {
      throw new Error('Database not initialized');
    }

    try {
      // Get or create token record
      let token = await this.getTokenByAddress(tokenAddress, chainName);
      
      if (!token) {
        // Insert new token if not exists
        token = await this.createToken({
          token_address: tokenAddress,
          token_symbol: 'UNKNOWN', // Will be updated when we know the symbol
          token_name: 'Unknown Token',
          decimals: 18, // Default, will be updated when we know
          chain_name: chainName
        });
      }

      // Insert token balance
      const sql = `
        INSERT INTO token_balances (execution_log_id, token_id, balance_before, balance_after)
        VALUES (?, ?, ?, ?)
      `;

      // Helper to convert undefined to null (SQLite requirement)
      const toNull = (v) => (v === undefined ? null : v);

      const params = [
        toNull(executionLogId), 
        toNull(token.id), 
        toNull(balanceBefore), 
        toNull(balanceAfter)
      ];

      if (this.config.isSQLite()) {
        const stmt = this.db.prepare(sql);
        stmt.run(...params);
      } else if (this.config.isPostgreSQL()) {
        const client = await this.db.connect();
        try {
          await client.query(sql, params);
        } finally {
          client.release();
        }
      }
    } catch (error) {
      this.logger.error('Failed to log token balance', error);
      throw error;
    }
  }

  /**
   * Get token by address and chain
   * @param {string} tokenAddress - Token address
   * @param {string} chainName - Chain name
   * @returns {Promise<Object|null>} Token object or null
   */
  async getTokenByAddress(tokenAddress, chainName) {
    const sql = 'SELECT * FROM tokens WHERE token_address = ? AND chain_name = ?';
    const params = [tokenAddress, chainName];

    if (this.config.isSQLite()) {
      const stmt = this.db.prepare(sql);
      return stmt.get(...params);
    } else if (this.config.isPostgreSQL()) {
      const client = await this.db.connect();
      try {
        const result = await client.query(sql, params);
        return result.rows[0] || null;
      } finally {
        client.release();
      }
    }
  }

  /**
   * Create new token record
   * @param {Object} tokenData - Token data
   * @returns {Promise<Object>} Created token object or existing token if already exists
   */
  async createToken(tokenData) {
    // Helper to convert undefined to null (SQLite requirement)
    const toNull = (v) => (v === undefined ? null : v);
    // Helper to convert boolean to SQLite integer (0 or 1)
    const boolToSqlite = (v) => {
      if (v === null || v === undefined) return 1; // Default to active
      return v ? 1 : 0;
    };
    
    if (this.config.isSQLite()) {
      // Use INSERT OR IGNORE to handle composite unique constraint (token_address, chain_name)
      const insertSql = `
        INSERT OR IGNORE INTO tokens (token_address, token_symbol, token_name, decimals, chain_name, is_active)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      const params = [
        toNull(tokenData.token_address),
        toNull(tokenData.token_symbol),
        toNull(tokenData.token_name),
        toNull(tokenData.decimals),
        toNull(tokenData.chain_name),
        boolToSqlite(tokenData.is_active)
      ];
      const stmt = this.db.prepare(insertSql);
      stmt.run(...params);
      
      // Query to get the token ID (works whether insert happened or token already existed)
      const selectSql = 'SELECT * FROM tokens WHERE token_address = ? AND chain_name = ?';
      const selectStmt = this.db.prepare(selectSql);
      const existing = selectStmt.get(tokenData.token_address, tokenData.chain_name);
      
      if (existing) {
        return existing;
      }
      throw new Error('Failed to create or retrieve token record');
    } else if (this.config.isPostgreSQL()) {
      // Use ON CONFLICT for PostgreSQL to handle composite unique constraint
      const sql = `
        INSERT INTO tokens (token_address, token_symbol, token_name, decimals, chain_name, is_active)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (token_address, chain_name) DO NOTHING
        RETURNING *
      `;
      const params = [
        tokenData.token_address,
        tokenData.token_symbol,
        tokenData.token_name,
        tokenData.decimals,
        tokenData.chain_name,
        tokenData.is_active !== false
      ];
      const client = await this.db.connect();
      try {
        const result = await client.query(sql, params);
        
        // If insert was ignored (conflict), fetch the existing record
        if (result.rows.length === 0) {
          const selectSql = 'SELECT * FROM tokens WHERE token_address = $1 AND chain_name = $2';
          const selectResult = await client.query(selectSql, [tokenData.token_address, tokenData.chain_name]);
          if (selectResult.rows.length > 0) {
            return selectResult.rows[0];
          }
          throw new Error('Failed to create or retrieve token record');
        }
        
        return result.rows[0];
      } finally {
        client.release();
      }
    }
  }

  /**
   * Get recent executions
   * @param {number} limit - Number of executions to return
   * @param {string} chainName - Optional chain filter
   * @returns {Promise<Array>} Recent executions
   */
  async getRecentExecutions(limit = 10, chainName = null) {
    let sql = `
      SELECT * FROM execution_logs 
      ORDER BY timestamp DESC 
      LIMIT ?
    `;
    const params = [limit];

    if (chainName) {
      sql = `
        SELECT * FROM execution_logs 
        WHERE chain_name = ?
        ORDER BY timestamp DESC 
        LIMIT ?
      `;
      params.unshift(chainName);
    }

    if (this.config.isSQLite()) {
      const stmt = this.db.prepare(sql);
      return stmt.all(...params);
    } else if (this.config.isPostgreSQL()) {
      const client = await this.db.connect();
      try {
        const result = await client.query(sql, params);
        return result.rows;
      } finally {
        client.release();
      }
    }
  }

  /**
   * Get execution statistics
   * @param {string} chainName - Optional chain filter
   * @returns {Promise<Object>} Execution statistics
   */
  async getExecutionStats(chainName = null) {
    let sql = `
      SELECT 
        COUNT(*) as total_executions,
        SUM(CASE WHEN tx_status = 1 THEN 1 ELSE 0 END) as successful_txs,
        AVG(execution_time_ms) as avg_execution_time,
        MAX(timestamp) as last_execution
      FROM execution_logs
    `;
    const params = [];

    if (chainName) {
      sql += ' WHERE chain_name = ?';
      params.push(chainName);
    }

    if (this.config.isSQLite()) {
      const stmt = this.db.prepare(sql);
      return stmt.get(...params);
    } else if (this.config.isPostgreSQL()) {
      const client = await this.db.connect();
      try {
        const result = await client.query(sql, params);
        return result.rows[0];
      } finally {
        client.release();
      }
    }
  }

  /**
   * Close database connection
   * @returns {Promise<void>}
   */
  async close() {
    if (this.db) {
      if (this.config.isSQLite()) {
        this.db.close();
      } else if (this.config.isPostgreSQL()) {
        await this.db.end();
      }
      this.db = null;
      this.isInitialized = false;
      this.logger.info('Database connection closed');
    }
  }

  /**
   * Check if database is initialized
   * @returns {boolean} True if initialized
   */
  isReady() {
    return this.isInitialized && this.db !== null;
  }
}
