#!/usr/bin/env node

/**
 * Migration script for local SQLite databases
 * Updates tokens table schema to use composite unique constraint
 * 
 * Usage:
 *   node migrate-local-db.js [database-path]
 * 
 * If database-path is not provided, it will look for:
 * - DATABASE_PATH environment variable
 * - ./database/clocktower.db (relative to project root)
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get database path from command line or environment
const dbPath = process.argv[2] || process.env.DATABASE_PATH || join(__dirname, '../nodejs/database/clocktower.db');

console.log(`Migrating database: ${dbPath}`);

try {
  // Check if database file exists
  const fs = await import('fs/promises');
  try {
    await fs.access(dbPath);
  } catch (error) {
    console.error(`Error: Database file not found at ${dbPath}`);
    console.error('Please provide the correct path to your database file.');
    process.exit(1);
  }

  // Open database
  const db = new Database(dbPath);

  // Read migration SQL
  const migrationSqlPath = join(__dirname, 'migrate_tokens_schema.sql');
  const migrationSql = readFileSync(migrationSqlPath, 'utf8');

  console.log('Starting migration...');

  // Execute migration in a transaction for safety
  db.transaction(() => {
    // Split SQL into statements and execute each one
    const statements = migrationSql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    for (const statement of statements) {
      if (statement) {
        try {
          db.exec(statement + ';');
        } catch (error) {
          // If table already exists or index already exists, that's okay
          if (error.message.includes('already exists') || error.message.includes('duplicate')) {
            console.warn(`Warning: ${error.message}`);
          } else {
            throw error;
          }
        }
      }
    }
  })();

  console.log('Migration completed successfully!');

  // Verify migration
  console.log('\nVerifying migration...');
  const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tokens'").get();
  if (tableInfo && tableInfo.sql.includes('UNIQUE(token_address, chain_name)')) {
    console.log('✓ Composite unique constraint is present');
  } else {
    console.warn('⚠ Warning: Could not verify composite unique constraint');
  }

  const tokenCount = db.prepare('SELECT COUNT(*) as count FROM tokens').get();
  console.log(`✓ Token records: ${tokenCount.count}`);

  const duplicates = db.prepare(`
    SELECT token_address, chain_name, COUNT(*) as count 
    FROM tokens 
    GROUP BY token_address, chain_name 
    HAVING count > 1
  `).all();
  
  if (duplicates.length === 0) {
    console.log('✓ No duplicate (token_address, chain_name) pairs found');
  } else {
    console.warn(`⚠ Warning: Found ${duplicates.length} duplicate pairs`);
  }

  db.close();
  console.log('\nMigration verification complete!');
} catch (error) {
  console.error('Migration failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
