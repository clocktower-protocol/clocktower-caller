# Test Suite

This directory contains unit tests for the Clocktower Caller Node.js application.

## Test Framework

We use [Vitest](https://vitest.dev/) as our testing framework, which provides:
- Fast test execution
- Native ES modules support
- Built-in code coverage
- Jest-compatible API

## Running Tests

```bash
# Run all tests once (unit + integration)
npm test

# Run only unit tests
npm test test/config test/services test/utils

# Run only integration tests
npm test test/integration

# Run tests in watch mode (for development)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

## Test Structure

```
test/
├── config/          # Unit tests for configuration services
│   ├── chainConfig.test.js
│   └── database.test.js
├── services/        # Unit tests for business logic services
│   ├── database.test.js
│   └── email.test.js
├── utils/           # Unit tests for utility functions
│   └── helpers.test.js
└── integration/     # Integration tests for end-to-end flows
    ├── clocktowerCaller.integration.test.js
    ├── database.integration.test.js
    └── services.integration.test.js
```

## Test Coverage

The test suite covers:

### Utilities (`utils/helpers.test.js`)
- ✅ Date/time utilities (getCurrentDay, getCurrentTimestamp, etc.)
- ✅ Frequency calculations (weekly, monthly, quarterly, yearly)
- ✅ Validation functions (address, private key, chain ID)
- ✅ String formatting utilities
- ✅ Error handling utilities
- ✅ Environment variable utilities

### Configuration (`config/`)
- ✅ Chain configuration service
  - Loading chains from environment variables
  - Chain validation
  - Testnet/mainnet detection
  - Chain lookup by name and ID
- ✅ Database configuration service
  - SQLite configuration
  - PostgreSQL configuration
  - Connection string generation
  - Configuration validation

### Services (`services/`)
- ✅ Database service
  - Execution logging with undefined value handling
  - Token balance logging
  - Query operations
- ✅ Email service
  - Email configuration detection
  - Success email notifications
  - No subscriptions notifications
  - Summary email notifications
  - Explorer URL generation

### Integration Tests (`integration/`)
- ✅ ClocktowerCaller integration
  - Full initialization flow
  - Execution flow end-to-end
  - Multi-chain execution
  - Error handling scenarios
  - Shutdown procedures
- ✅ Database integration
  - Complete execution logging flow
  - Token balance tracking
  - Query operations with real data
  - Recursive execution logging
- ✅ Services integration
  - ClocktowerService + DatabaseService interaction
  - EmailService + ClocktowerService interaction
  - Multi-chain service coordination
  - Error propagation across services

## Writing New Tests

When adding new functionality, follow these guidelines:

1. **Test file naming**: Use `.test.js` suffix (e.g., `myModule.test.js`)
2. **Test structure**: Use `describe` blocks to group related tests
3. **Test isolation**: Each test should be independent and not rely on other tests
4. **Mocking**: Use Vitest's mocking capabilities for external dependencies
5. **Assertions**: Use clear, descriptive assertions

### Example Test

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MyModule } from '../../src/myModule.js';

describe('MyModule', () => {
  beforeEach(() => {
    // Setup before each test
  });

  it('should do something', () => {
    const result = MyModule.doSomething();
    expect(result).toBe(expectedValue);
  });
});
```

## Mocking

### Mocking Environment Variables

```javascript
import { vi } from 'vitest';

beforeEach(() => {
  vi.stubEnv('MY_ENV_VAR', 'test-value');
});

afterEach(() => {
  vi.unstubAllEnvs();
});
```

### Mocking Modules

```javascript
import { vi } from 'vitest';

vi.mock('external-module', () => ({
  default: vi.fn(() => ({
    method: vi.fn(() => Promise.resolve(mockData))
  }))
}));
```

## Continuous Integration

Tests should be run in CI/CD pipelines before merging code. The test suite should:
- Pass all tests
- Maintain minimum code coverage (aim for >80%)
- Run quickly (< 30 seconds)

## Troubleshooting

### Tests failing with "Cannot find module"
- Ensure all dependencies are installed: `npm install`
- Check that file paths in imports are correct

### Database tests failing
- Database tests use mocks and should not require actual database connections
- If using real database, ensure test database is configured separately

### Environment variable issues
- Use `vi.stubEnv()` to set environment variables in tests
- Clean up with `vi.unstubAllEnvs()` in `afterEach`

## Integration Tests

Integration tests verify that multiple services work together correctly. They test:

- **End-to-end execution flow**: From initialization through execution to shutdown
- **Service interactions**: How ClocktowerService, DatabaseService, and EmailService work together
- **Database operations**: Real database operations with actual SQLite/PostgreSQL
- **Error propagation**: How errors are handled across service boundaries
- **Multi-chain coordination**: Execution across multiple blockchain networks

### Integration Test Files

- `clocktowerCaller.integration.test.js`: Tests the main ClocktowerCaller class
- `database.integration.test.js`: Tests database operations end-to-end
- `services.integration.test.js`: Tests service interactions

### Running Integration Tests

```bash
# Run all integration tests
npm test test/integration

# Run specific integration test file
npm test test/integration/clocktowerCaller.integration.test.js
```

## Coverage Goals

- **Target**: >80% code coverage
- **Critical paths**: >90% coverage
- **Integration coverage**: All major execution flows
- Focus on:
  - Business logic
  - Error handling
  - Edge cases
  - Configuration validation
  - Service interactions

