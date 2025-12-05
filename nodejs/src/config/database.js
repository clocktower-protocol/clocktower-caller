/**
 * Database Configuration Service
 * 
 * Provides unified database interface supporting both SQLite and PostgreSQL.
 * Auto-detects database type from environment variables.
 */

export class DatabaseConfigService {
  constructor() {
    this.databaseType = process.env.DATABASE_TYPE?.toLowerCase() || 'sqlite';
    this.config = this.loadDatabaseConfig();
  }

  /**
   * Load database configuration based on type
   * @returns {Object} Database configuration object
   */
  loadDatabaseConfig() {
    switch (this.databaseType) {
      case 'postgresql':
      case 'postgres':
        return {
          type: 'postgresql',
          host: process.env.DATABASE_HOST || 'localhost',
          port: parseInt(process.env.DATABASE_PORT, 10) || 5432,
          database: process.env.DATABASE_NAME || 'clocktower_caller',
          user: process.env.DATABASE_USER,
          password: process.env.DATABASE_PASSWORD,
          ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
          connectionString: process.env.DATABASE_URL
        };
      
      case 'sqlite':
      default:
        return {
          type: 'sqlite',
          path: process.env.DATABASE_PATH || './database/clocktower.db'
        };
    }
  }

  /**
   * Get database type
   * @returns {string} Database type
   */
  getDatabaseType() {
    return this.databaseType;
  }

  /**
   * Get database configuration
   * @returns {Object} Database configuration
   */
  getConfig() {
    return this.config;
  }

  /**
   * Check if using PostgreSQL
   * @returns {boolean} True if PostgreSQL
   */
  isPostgreSQL() {
    return this.databaseType === 'postgresql' || this.databaseType === 'postgres';
  }

  /**
   * Check if using SQLite
   * @returns {boolean} True if SQLite
   */
  isSQLite() {
    return this.databaseType === 'sqlite';
  }

  /**
   * Get connection string for the database
   * @returns {string} Connection string
   */
  getConnectionString() {
    if (this.isPostgreSQL()) {
      if (this.config.connectionString) {
        return this.config.connectionString;
      }
      
      const { host, port, database, user, password, ssl } = this.config;
      const sslParam = ssl ? '?sslmode=require' : '';
      return `postgresql://${user}:${password}@${host}:${port}/${database}${sslParam}`;
    }
    
    return this.config.path;
  }

  /**
   * Validate database configuration
   * @returns {Object} Validation result
   */
  validateConfig() {
    const errors = [];
    const warnings = [];

    if (this.isPostgreSQL()) {
      const required = ['user', 'password', 'database'];
      const missing = required.filter(field => !this.config[field]);
      
      if (missing.length > 0) {
        errors.push(`Missing required PostgreSQL configuration: ${missing.join(', ')}`);
      }

      if (!this.config.host) {
        warnings.push('PostgreSQL host not specified, using default: localhost');
      }

      if (!this.config.port) {
        warnings.push('PostgreSQL port not specified, using default: 5432');
      }
    }

    if (this.isSQLite()) {
      if (!this.config.path) {
        errors.push('SQLite database path not specified');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Get database-specific SQL syntax helpers
   * @returns {Object} SQL syntax helpers
   */
  getSQLHelpers() {
    if (this.isPostgreSQL()) {
      return {
        // PostgreSQL uses $1, $2, etc. for parameterized queries
        parameterize: (index) => `$${index}`,
        // PostgreSQL uses SERIAL for auto-increment
        autoIncrement: 'SERIAL',
        // PostgreSQL uses BOOLEAN
        boolean: 'BOOLEAN',
        // PostgreSQL uses TEXT
        text: 'TEXT',
        // PostgreSQL uses REAL
        real: 'REAL',
        // PostgreSQL uses INTEGER
        integer: 'INTEGER',
        // PostgreSQL uses TIMESTAMP
        timestamp: 'TIMESTAMP',
        // PostgreSQL uses datetime('now')
        now: 'NOW()',
        // PostgreSQL uses datetime('now')
        datetimeNow: 'NOW()'
      };
    }

    // SQLite defaults
    return {
      // SQLite uses ? for parameterized queries
      parameterize: () => '?',
      // SQLite uses INTEGER PRIMARY KEY AUTOINCREMENT
      autoIncrement: 'INTEGER PRIMARY KEY AUTOINCREMENT',
      // SQLite uses BOOLEAN
      boolean: 'BOOLEAN',
      // SQLite uses TEXT
      text: 'TEXT',
      // SQLite uses REAL
      real: 'REAL',
      // SQLite uses INTEGER
      integer: 'INTEGER',
      // SQLite uses TEXT
      timestamp: 'TEXT',
      // SQLite uses datetime('now')
      now: "datetime('now')",
      // SQLite uses datetime('now')
      datetimeNow: "datetime('now')"
    };
  }

  /**
   * Get database-specific connection options
   * @returns {Object} Connection options
   */
  getConnectionOptions() {
    if (this.isPostgreSQL()) {
      return {
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.config.user,
        password: this.config.password,
        ssl: this.config.ssl,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000,
        max: 20
      };
    }

    // SQLite options
    return {
      filename: this.config.path,
      verbose: process.env.NODE_ENV === 'development' ? console.log : null
    };
  }
}
