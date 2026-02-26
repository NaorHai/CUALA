# CUALA Testing Guide

## Test Suite Overview

CUALA has a comprehensive unit test suite with **156 tests** covering all core functionality.

### Test Organization

Tests are organized in `__tests__` directories alongside the source code:

```
src/
├── constants/__tests__/
│   └── constants.test.ts (55 tests)
├── infra/__tests__/
│   ├── config.test.ts (10 tests)
│   └── confidence-threshold-service.test.ts (16 tests)
├── providers/__tests__/
│   └── providers.test.ts (19 tests - Multi-LLM provider tests)
├── reporter/__tests__/
│   └── stdout-reporter.test.ts (22 tests)
├── storage/__tests__/
│   ├── in-memory-storage.test.ts (38 tests)
│   └── storage-factory.test.ts (8 tests)
└── types/__tests__/
    └── config.test.ts (28 tests)
```

### Test Coverage

#### ✅ Fully Tested Components
- **Storage Layer**: InMemoryStorage, Storage Factory
- **Configuration**: EnvConfig, ConfigStub, Config Helpers
- **Infrastructure**: ConfidenceThresholdService
- **Providers**: OpenAI, Anthropic, Factory Pattern
- **Reporter**: StdoutReporter
- **Constants**: All action types, verification targets, selectors
- **Types**: Configuration helpers and utilities

#### 🟡 Partially Tested Components
- **Providers**: API integration tests only run with real API keys
- **Storage**: Redis storage requires Redis instance

#### 📝 Components Tested Through Integration
- **Planner**: Adaptive planner, LLM planner (tested via integration)
- **Executor**: Unified executor (requires Playwright)
- **Orchestrator**: Execution orchestrator (requires browser)
- **Verifier**: AI verifier (requires LLM)
- **Element Discovery**: Smart element locator (requires browser)

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Tests in Watch Mode
```bash
npm test -- --watch
```

### Run Tests with Coverage
```bash
npm test -- --coverage
```

### Run Specific Test File
```bash
npm test -- src/storage/__tests__/in-memory-storage.test.ts
```

### Run Tests Matching Pattern
```bash
npm test -- --grep "Storage"
```

## Test Principles

### 1. **Fast & Isolated**
- All tests run in milliseconds
- No external dependencies (database, API, file system)
- Use mocks and stubs where appropriate

### 2. **Deterministic**
- No flaky tests
- Consistent results across runs
- No time-dependent behavior (except where explicitly tested)

### 3. **Comprehensive**
- Test happy paths and edge cases
- Test error handling and boundary conditions
- Test interface contracts and type safety

### 4. **Clear & Maintainable**
- Descriptive test names
- Organized in logical groups
- Well-documented test intent

## Writing New Tests

### Test Structure

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('Component Name', () => {
  describe('Feature Group', () => {
    it('should do something specific', () => {
      // Arrange
      const input = 'test data';

      // Act
      const result = doSomething(input);

      // Assert
      expect(result).toBe('expected output');
    });
  });
});
```

### Best Practices

1. **Use descriptive names**: Test names should describe behavior, not implementation
2. **Test one thing**: Each test should verify a single behavior
3. **Avoid implementation details**: Test public interfaces, not internals
4. **Use beforeEach for setup**: Keep test setup DRY
5. **Clean up after**: Use afterEach for cleanup if needed

### Mocking

```typescript
import { vi } from 'vitest';

// Mock a function
const mockFn = vi.fn().mockReturnValue('result');

// Mock console
const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

// Restore mocks
consoleLogSpy.mockRestore();
```

## CI Integration

Tests run automatically on every push and pull request via GitHub Actions:

- **Node Versions**: 18.x, 20.x
- **Test Execution**: All unit tests run without API calls
- **Coverage**: Coverage reports generated
- **Status**: Test results visible in CI badges

### CI Test Configuration

```yaml
- name: Run server tests
  working-directory: ./server
  run: npm test -- --run
  env:
    # Fake keys for interface tests (no actual API calls)
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY || 'sk-test-key-not-real' }}
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY || 'sk-ant-test-key-not-real' }}
    LLM_PROVIDER: openai
    SKIP_SAFETY_CHECK: true
```

## Test Isolation

### What Tests Don't Do
- ❌ Make real API calls to OpenAI/Anthropic
- ❌ Connect to Redis (unless running integration tests)
- ❌ Launch Playwright browsers
- ❌ Read/write files
- ❌ Make network requests

### What Tests Do
- ✅ Test pure business logic
- ✅ Verify data structures and transformations
- ✅ Test error handling paths
- ✅ Validate interface contracts
- ✅ Check edge cases and boundary conditions

## Coverage Goals

Current coverage thresholds:
- Lines: 60%
- Functions: 60%
- Branches: 60%
- Statements: 60%

### Excluded from Coverage
- Integration entry points (api.ts, index.ts, run-example.ts)
- Test files
- Type definitions
- Configuration files

## Debugging Tests

### Run Single Test
```bash
npm test -- -t "should create execution with unique testId"
```

### Run with Detailed Output
```bash
npm test -- --reporter=verbose
```

### Debug in VS Code
Add breakpoint and use VS Code's "Debug" test runner.

## Common Issues

### Test Timeout
If tests timeout, increase the timeout:
```typescript
it('slow test', async () => {
  // test code
}, 60000); // 60 second timeout
```

### Async Tests
Always return or await promises:
```typescript
it('async test', async () => {
  await asyncOperation();
  expect(result).toBe(expected);
});
```

### Mock Cleanup
Always restore mocks in afterEach:
```typescript
afterEach(() => {
  vi.restoreAllMocks();
});
```

## Future Test Additions

### High Priority
- [ ] Planner unit tests (with mocked LLM responses)
- [ ] Executor unit tests (with mocked Playwright)
- [ ] Orchestrator strategy tests
- [ ] Element discovery unit tests

### Medium Priority
- [ ] Verifier tests (with mocked LLM)
- [ ] Refinement strategy tests
- [ ] API endpoint tests
- [ ] Integration tests with test browser

### Low Priority
- [ ] Performance benchmarks
- [ ] Load testing
- [ ] E2E browser automation tests

## Test Metrics

- **Total Tests**: 156
- **Test Files**: 8
- **Average Test Duration**: ~2-4 seconds for full suite
- **Fastest Test**: < 1ms
- **Slowest Test**: ~3.6s (provider connection validation)

## Contributing

When adding new features:
1. Write tests first (TDD approach recommended)
2. Ensure all tests pass before committing
3. Aim for > 80% coverage on new code
4. Update this documentation if adding new test categories

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [Test-Driven Development](https://martinfowler.com/bliki/TestDrivenDevelopment.html)
