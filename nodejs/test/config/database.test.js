import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DatabaseConfigService } from '../../src/config/database.js';

describe('DatabaseConfigService', () => {
  beforeEach(() => {
    // Clear environment variables
    vi.stubEnv('DATABASE_TYPE', undefined);
    vi.stubEnv('DATABASE_PATH', undefined);
    vi.stubEnv('DATABASE_HOST', undefined);
    vi.stubEnv('DATABASE_PORT', undefined);
    vi.stubEnv('DATABASE_NAME', undefined);
    vi.stubEnv('DATABASE_USER', undefined);
    vi.stubEnv('DATABASE_PASSWORD', undefined);
    vi.stubEnv('DATABASE_SSL', undefined);
    vi.stubEnv('DATABASE_URL', undefined);
  });

  it('should default to SQLite', () => {
    delete process.env.DATABASE_TYPE;
    const service = new DatabaseConfigService();
    
    expect(service.getDatabaseType()).toBe('sqlite');
    expect(service.isSQLite()).toBe(true);
    expect(service.isPostgreSQL()).toBe(false);
  });

  it('should configure SQLite with default path', () => {
    vi.stubEnv('DATABASE_TYPE', 'sqlite');
    delete process.env.DATABASE_PATH;
    
    const service = new DatabaseConfigService();
    const config = service.getConfig();
    
    expect(config.type).toBe('sqlite');
    expect(config.path).toBe('./database/clocktower.db');
  });

  it('should configure SQLite with custom path', () => {
    vi.stubEnv('DATABASE_TYPE', 'sqlite');
    vi.stubEnv('DATABASE_PATH', '/custom/path.db');
    
    const service = new DatabaseConfigService();
    const config = service.getConfig();
    
    expect(config.path).toBe('/custom/path.db');
  });

  it('should configure PostgreSQL', () => {
    vi.stubEnv('DATABASE_TYPE', 'postgresql');
    vi.stubEnv('DATABASE_HOST', 'localhost');
    vi.stubEnv('DATABASE_PORT', '5432');
    vi.stubEnv('DATABASE_NAME', 'testdb');
    vi.stubEnv('DATABASE_USER', 'testuser');
    vi.stubEnv('DATABASE_PASSWORD', 'testpass');
    
    const service = new DatabaseConfigService();
    
    expect(service.getDatabaseType()).toBe('postgresql');
    expect(service.isPostgreSQL()).toBe(true);
    expect(service.isSQLite()).toBe(false);
    
    const config = service.getConfig();
    expect(config.type).toBe('postgresql');
    expect(config.host).toBe('localhost');
    expect(config.port).toBe(5432);
    expect(config.database).toBe('testdb');
    expect(config.user).toBe('testuser');
    expect(config.password).toBe('testpass');
  });

  it('should use postgres alias', () => {
    vi.stubEnv('DATABASE_TYPE', 'postgres');
    vi.stubEnv('DATABASE_NAME', 'testdb');
    vi.stubEnv('DATABASE_USER', 'testuser');
    vi.stubEnv('DATABASE_PASSWORD', 'testpass');
    
    const service = new DatabaseConfigService();
    
    expect(service.isPostgreSQL()).toBe(true);
  });

  it('should use PostgreSQL defaults', () => {
    vi.stubEnv('DATABASE_TYPE', 'postgresql');
    delete process.env.DATABASE_HOST;
    delete process.env.DATABASE_PORT;
    vi.stubEnv('DATABASE_NAME', 'testdb');
    vi.stubEnv('DATABASE_USER', 'testuser');
    vi.stubEnv('DATABASE_PASSWORD', 'testpass');
    
    const service = new DatabaseConfigService();
    const config = service.getConfig();
    
    expect(config.host).toBe('localhost');
    expect(config.port).toBe(5432);
  });

  it('should configure SSL for PostgreSQL', () => {
    vi.stubEnv('DATABASE_TYPE', 'postgresql');
    vi.stubEnv('DATABASE_NAME', 'testdb');
    vi.stubEnv('DATABASE_USER', 'testuser');
    vi.stubEnv('DATABASE_PASSWORD', 'testpass');
    vi.stubEnv('DATABASE_SSL', 'true');
    
    const service = new DatabaseConfigService();
    const config = service.getConfig();
    
    expect(config.ssl).toEqual({ rejectUnauthorized: false });
  });

  it('should validate SQLite configuration', () => {
    vi.stubEnv('DATABASE_TYPE', 'sqlite');
    vi.stubEnv('DATABASE_PATH', './test.db');
    
    const service = new DatabaseConfigService();
    const validation = service.validateConfig();
    
    expect(validation.valid).toBe(true);
    expect(validation.errors.length).toBe(0);
  });

  it('should validate PostgreSQL configuration', () => {
    vi.stubEnv('DATABASE_TYPE', 'postgresql');
    vi.stubEnv('DATABASE_NAME', 'testdb');
    vi.stubEnv('DATABASE_USER', 'testuser');
    vi.stubEnv('DATABASE_PASSWORD', 'testpass');
    
    const service = new DatabaseConfigService();
    const validation = service.validateConfig();
    
    expect(validation.valid).toBe(true);
    expect(validation.errors.length).toBe(0);
  });

  it('should fail validation for missing PostgreSQL required fields', () => {
    vi.stubEnv('DATABASE_TYPE', 'postgresql');
    delete process.env.DATABASE_NAME;
    delete process.env.DATABASE_USER;
    delete process.env.DATABASE_PASSWORD;
    // Missing required fields
    
    const service = new DatabaseConfigService();
    const validation = service.validateConfig();
    
    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
  });

  it('should get connection string for PostgreSQL', () => {
    vi.stubEnv('DATABASE_TYPE', 'postgresql');
    vi.stubEnv('DATABASE_HOST', 'localhost');
    vi.stubEnv('DATABASE_PORT', '5432');
    vi.stubEnv('DATABASE_NAME', 'testdb');
    vi.stubEnv('DATABASE_USER', 'testuser');
    vi.stubEnv('DATABASE_PASSWORD', 'testpass');
    delete process.env.DATABASE_URL;
    
    const service = new DatabaseConfigService();
    const connString = service.getConnectionString();
    
    expect(connString).toContain('postgresql://');
    expect(connString).toContain('testuser:testpass@localhost:5432/testdb');
  });

  it('should use DATABASE_URL if provided', () => {
    vi.stubEnv('DATABASE_TYPE', 'postgresql');
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@host:5432/db');
    
    const service = new DatabaseConfigService();
    const connString = service.getConnectionString();
    
    expect(connString).toBe('postgresql://user:pass@host:5432/db');
  });

  it('should get connection options for SQLite', () => {
    vi.stubEnv('DATABASE_TYPE', 'sqlite');
    vi.stubEnv('DATABASE_PATH', './test.db');
    
    const service = new DatabaseConfigService();
    const options = service.getConnectionOptions();
    
    expect(options.filename).toBe('./test.db');
  });

  it('should get connection options for PostgreSQL', () => {
    vi.stubEnv('DATABASE_TYPE', 'postgresql');
    vi.stubEnv('DATABASE_HOST', 'localhost');
    vi.stubEnv('DATABASE_PORT', '5432');
    vi.stubEnv('DATABASE_NAME', 'testdb');
    vi.stubEnv('DATABASE_USER', 'testuser');
    vi.stubEnv('DATABASE_PASSWORD', 'testpass');
    
    const service = new DatabaseConfigService();
    const options = service.getConnectionOptions();
    
    expect(options.host).toBe('localhost');
    expect(options.port).toBe(5432);
    expect(options.database).toBe('testdb');
    expect(options.user).toBe('testuser');
    expect(options.password).toBe('testpass');
    expect(options.max).toBe(20);
  });

  it('should get SQL helpers for SQLite', () => {
    vi.stubEnv('DATABASE_TYPE', 'sqlite');
    
    const service = new DatabaseConfigService();
    const helpers = service.getSQLHelpers();
    
    expect(helpers.parameterize()).toBe('?');
    expect(helpers.autoIncrement).toContain('AUTOINCREMENT');
    expect(helpers.now).toContain('datetime');
  });

  it('should get SQL helpers for PostgreSQL', () => {
    vi.stubEnv('DATABASE_TYPE', 'postgresql');
    vi.stubEnv('DATABASE_NAME', 'testdb');
    vi.stubEnv('DATABASE_USER', 'testuser');
    vi.stubEnv('DATABASE_PASSWORD', 'testpass');
    
    const service = new DatabaseConfigService();
    const helpers = service.getSQLHelpers();
    
    expect(helpers.parameterize(1)).toBe('$1');
    expect(helpers.autoIncrement).toBe('SERIAL');
    expect(helpers.now).toBe('NOW()');
  });
});

