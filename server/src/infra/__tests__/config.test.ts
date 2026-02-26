/**
 * Configuration Unit Tests
 *
 * Tests EnvConfig and ConfigStub implementations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EnvConfig, ConfigStub } from '../config.js';

describe('Configuration', () => {
  describe('EnvConfig', () => {
    let config: EnvConfig;
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      config = new EnvConfig();
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should get existing environment variable', () => {
      process.env.TEST_KEY = 'test-value';
      const value = config.get('TEST_KEY');
      expect(value).toBe('test-value');
    });

    it('should return undefined for non-existent key', () => {
      const value = config.get('NON_EXISTENT_KEY');
      expect(value).toBeUndefined();
    });

    it('should handle empty string values', () => {
      process.env.EMPTY_KEY = '';
      const value = config.get('EMPTY_KEY');
      expect(value).toBe('');
    });

    it('should handle numeric values as strings', () => {
      process.env.PORT = '3000';
      const value = config.get('PORT');
      expect(value).toBe('3000');
      expect(typeof value).toBe('string');
    });
  });

  describe('ConfigStub', () => {
    let config: ConfigStub;
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      config = new ConfigStub();
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should get existing environment variable', () => {
      process.env.TEST_KEY = 'test-value';
      const value = config.get('TEST_KEY');
      expect(value).toBe('test-value');
    });

    it('should return undefined for non-existent key without warning', () => {
      const value = config.get('NON_EXISTENT_KEY');
      expect(value).toBeUndefined();
    });

    it('should be a simple pass-through to process.env', () => {
      process.env.STUB_TEST = 'value';
      expect(config.get('STUB_TEST')).toBe(process.env.STUB_TEST);
    });
  });

  describe('Interface Compatibility', () => {
    it('EnvConfig should implement IConfig interface', () => {
      const config = new EnvConfig();
      expect(typeof config.get).toBe('function');
    });

    it('ConfigStub should implement IConfig interface', () => {
      const config = new ConfigStub();
      expect(typeof config.get).toBe('function');
    });

    it('both implementations should have same method signature', () => {
      const envConfig = new EnvConfig();
      const stubConfig = new ConfigStub();

      process.env.TEST_VAR = 'test';

      const envResult = envConfig.get('TEST_VAR');
      const stubResult = stubConfig.get('TEST_VAR');

      expect(typeof envResult).toBe(typeof stubResult);
      expect(envResult).toBe(stubResult);
    });
  });
});
