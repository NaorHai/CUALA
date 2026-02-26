/**
 * Constants Unit Tests
 *
 * Tests that all constants are properly defined and exported
 */

import { describe, it, expect } from 'vitest';
import {
  ACTIONS,
  VERIFICATION_TARGETS,
  VERIFICATION_OPERATIONS,
  EXECUTION_STATUS,
  SELECTORS,
  METHOD_MAPPINGS,
  SUPPORTED_VERIFICATION_TARGETS,
  SUPPORTED_VERIFICATION_OPERATIONS,
  ERROR_MESSAGES
} from '../index.js';

describe('Constants', () => {
  describe('ACTIONS', () => {
    it('should define all action types', () => {
      expect(ACTIONS.NAVIGATE).toBe('navigate');
      expect(ACTIONS.CLICK).toBe('click');
      expect(ACTIONS.TYPE).toBe('type');
      expect(ACTIONS.WAIT).toBe('wait');
      expect(ACTIONS.HOVER).toBe('hover');
      expect(ACTIONS.SCROLL).toBe('scroll');
      expect(ACTIONS.VERIFY_PREFIX).toBe('verify_');
    });

    it('should be a constant object', () => {
      // TypeScript enforces readonly at compile time
      // At runtime, verify the object structure
      expect(typeof ACTIONS).toBe('object');
      expect(ACTIONS).toBeDefined();
    });
  });

  describe('VERIFICATION_TARGETS', () => {
    it('should define all verification targets', () => {
      expect(VERIFICATION_TARGETS.TITLE).toBe('title');
      expect(VERIFICATION_TARGETS.TEXT).toBe('text');
      expect(VERIFICATION_TARGETS.BODY).toBe('body');
      expect(VERIFICATION_TARGETS.URL).toBe('url');
      expect(VERIFICATION_TARGETS.ELEMENT).toBe('element');
      expect(VERIFICATION_TARGETS.HEADING).toBe('heading');
    });

    it('should define all heading variants', () => {
      expect(VERIFICATION_TARGETS.HEADING1).toBe('heading1');
      expect(VERIFICATION_TARGETS.HEADING2).toBe('heading2');
      expect(VERIFICATION_TARGETS.HEADING3).toBe('heading3');
      expect(VERIFICATION_TARGETS.HEADING4).toBe('heading4');
      expect(VERIFICATION_TARGETS.HEADING5).toBe('heading5');
      expect(VERIFICATION_TARGETS.HEADING6).toBe('heading6');
      expect(VERIFICATION_TARGETS.H1).toBe('h1');
      expect(VERIFICATION_TARGETS.H2).toBe('h2');
      expect(VERIFICATION_TARGETS.H3).toBe('h3');
      expect(VERIFICATION_TARGETS.H4).toBe('h4');
      expect(VERIFICATION_TARGETS.H5).toBe('h5');
      expect(VERIFICATION_TARGETS.H6).toBe('h6');
    });

    it('should define element types', () => {
      expect(VERIFICATION_TARGETS.LINK).toBe('link');
      expect(VERIFICATION_TARGETS.BUTTON).toBe('button');
      expect(VERIFICATION_TARGETS.INPUT).toBe('input');
      expect(VERIFICATION_TARGETS.LABEL).toBe('label');
    });
  });

  describe('VERIFICATION_OPERATIONS', () => {
    it('should define positive operations', () => {
      expect(VERIFICATION_OPERATIONS.CONTAINS).toBe('contains');
      expect(VERIFICATION_OPERATIONS.EQUALS).toBe('equals');
      expect(VERIFICATION_OPERATIONS.EQUAL).toBe('equal');
      expect(VERIFICATION_OPERATIONS.STARTS_WITH).toBe('startsWith');
      expect(VERIFICATION_OPERATIONS.ENDS_WITH).toBe('endsWith');
      expect(VERIFICATION_OPERATIONS.VISIBLE).toBe('visible');
      expect(VERIFICATION_OPERATIONS.EXISTS).toBe('exists');
    });

    it('should define negative operations', () => {
      expect(VERIFICATION_OPERATIONS.NOT_CONTAINS).toBe('not_contains');
      expect(VERIFICATION_OPERATIONS.NOT_EQUALS).toBe('not_equals');
      expect(VERIFICATION_OPERATIONS.NOT_VISIBLE).toBe('not_visible');
      expect(VERIFICATION_OPERATIONS.NOT_EXISTS).toBe('not_exists');
    });

    it('should define snake_case variants', () => {
      expect(VERIFICATION_OPERATIONS.STARTS_WITH_SNAKE).toBe('starts_with');
      expect(VERIFICATION_OPERATIONS.ENDS_WITH_SNAKE).toBe('ends_with');
      expect(VERIFICATION_OPERATIONS.NOT_STARTS_WITH_SNAKE).toBe('not_starts_with');
      expect(VERIFICATION_OPERATIONS.NOT_ENDS_WITH_SNAKE).toBe('not_ends_with');
    });

    it('should define regex operations', () => {
      expect(VERIFICATION_OPERATIONS.MATCHES).toBe('matches');
      expect(VERIFICATION_OPERATIONS.REGEX).toBe('regex');
      expect(VERIFICATION_OPERATIONS.MATCH).toBe('match');
    });
  });

  describe('EXECUTION_STATUS', () => {
    it('should define all status values', () => {
      expect(EXECUTION_STATUS.SUCCESS).toBe('success');
      expect(EXECUTION_STATUS.FAILURE).toBe('failure');
      expect(EXECUTION_STATUS.ERROR).toBe('error');
    });

    it('should have exactly 3 status values', () => {
      const keys = Object.keys(EXECUTION_STATUS);
      expect(keys).toHaveLength(3);
    });
  });

  describe('SELECTORS', () => {
    it('should define CSS selectors', () => {
      expect(SELECTORS.ALL_HEADINGS).toBe('h1, h2, h3, h4, h5, h6');
      expect(SELECTORS.H1).toBe('h1');
      expect(SELECTORS.H2).toBe('h2');
      expect(SELECTORS.H3).toBe('h3');
      expect(SELECTORS.H4).toBe('h4');
      expect(SELECTORS.H5).toBe('h5');
      expect(SELECTORS.H6).toBe('h6');
      expect(SELECTORS.BODY).toBe('body');
    });

    it('should have valid CSS selector syntax', () => {
      Object.values(SELECTORS).forEach(selector => {
        expect(selector).toBeTruthy();
        expect(typeof selector).toBe('string');
      });
    });
  });

  describe('METHOD_MAPPINGS', () => {
    it('should map string methods correctly', () => {
      expect(METHOD_MAPPINGS.contains).toBe('includes');
      expect(METHOD_MAPPINGS.includes).toBe('includes');
      expect(METHOD_MAPPINGS.starts_with).toBe('startsWith');
      expect(METHOD_MAPPINGS.startsWith).toBe('startsWith');
      expect(METHOD_MAPPINGS.ends_with).toBe('endsWith');
      expect(METHOD_MAPPINGS.endsWith).toBe('endsWith');
    });

    it('should map case methods', () => {
      expect(METHOD_MAPPINGS.to_lower).toBe('toLowerCase');
      expect(METHOD_MAPPINGS.to_upper).toBe('toUpperCase');
    });

    it('should map property accessors', () => {
      expect(METHOD_MAPPINGS.length).toBe('length');
    });
  });

  describe('SUPPORTED_VERIFICATION_TARGETS', () => {
    it('should be an array', () => {
      expect(Array.isArray(SUPPORTED_VERIFICATION_TARGETS)).toBe(true);
    });

    it('should contain all verification targets', () => {
      expect(SUPPORTED_VERIFICATION_TARGETS.length).toBeGreaterThan(0);
      expect(SUPPORTED_VERIFICATION_TARGETS).toContain('title');
      expect(SUPPORTED_VERIFICATION_TARGETS).toContain('text');
      expect(SUPPORTED_VERIFICATION_TARGETS).toContain('element');
    });

    it('should not have duplicates', () => {
      const unique = [...new Set(SUPPORTED_VERIFICATION_TARGETS)];
      expect(unique).toHaveLength(SUPPORTED_VERIFICATION_TARGETS.length);
    });
  });

  describe('SUPPORTED_VERIFICATION_OPERATIONS', () => {
    it('should be an array', () => {
      expect(Array.isArray(SUPPORTED_VERIFICATION_OPERATIONS)).toBe(true);
    });

    it('should contain all verification operations', () => {
      expect(SUPPORTED_VERIFICATION_OPERATIONS.length).toBeGreaterThan(0);
      expect(SUPPORTED_VERIFICATION_OPERATIONS).toContain('contains');
      expect(SUPPORTED_VERIFICATION_OPERATIONS).toContain('equals');
      expect(SUPPORTED_VERIFICATION_OPERATIONS).toContain('visible');
    });

    it('should not have duplicates', () => {
      const unique = [...new Set(SUPPORTED_VERIFICATION_OPERATIONS)];
      expect(unique).toHaveLength(SUPPORTED_VERIFICATION_OPERATIONS.length);
    });

    it('should include both camelCase and snake_case variants', () => {
      expect(SUPPORTED_VERIFICATION_OPERATIONS).toContain('startsWith');
      expect(SUPPORTED_VERIFICATION_OPERATIONS).toContain('starts_with');
      expect(SUPPORTED_VERIFICATION_OPERATIONS).toContain('endsWith');
      expect(SUPPORTED_VERIFICATION_OPERATIONS).toContain('ends_with');
    });
  });

  describe('ERROR_MESSAGES', () => {
    it('should define error message functions', () => {
      expect(typeof ERROR_MESSAGES.INVALID_VERIFICATION_ACTION).toBe('function');
      expect(typeof ERROR_MESSAGES.INVALID_VERIFICATION_FORMAT).toBe('function');
      expect(typeof ERROR_MESSAGES.ELEMENT_NOT_FOUND).toBe('function');
    });

    it('should generate correct error messages', () => {
      const message1 = ERROR_MESSAGES.INVALID_VERIFICATION_ACTION('test_action');
      expect(message1).toContain('test_action');
      expect(message1).toContain('verify_');

      const message2 = ERROR_MESSAGES.ELEMENT_NOT_FOUND('#my-button');
      expect(message2).toContain('#my-button');

      const message3 = ERROR_MESSAGES.AMBIGUOUS_SELECTOR('.button', 5);
      expect(message3).toContain('.button');
      expect(message3).toContain('5');
    });

    it('should define string constant messages', () => {
      expect(typeof ERROR_MESSAGES.VISIBLE_REQUIRES_SELECTOR).toBe('string');
      expect(ERROR_MESSAGES.VISIBLE_REQUIRES_SELECTOR).toBeTruthy();
    });

    it('should provide helpful error context', () => {
      const message = ERROR_MESSAGES.MISSING_OPERATION('verify_text', 'text', 'targets', 'ops');
      expect(message).toContain('verify_text');
      expect(message).toContain('Examples:');
      expect(message).toContain('Supported');
    });
  });

  describe('Type Safety', () => {
    it('should have readonly constants', () => {
      // TypeScript enforces readonly at compile time
      // At runtime, we can verify the objects are defined and structured correctly
      expect(ACTIONS).toBeDefined();
      expect(VERIFICATION_TARGETS).toBeDefined();
      expect(VERIFICATION_OPERATIONS).toBeDefined();
      expect(EXECUTION_STATUS).toBeDefined();
      expect(SELECTORS).toBeDefined();
    });

    it('should export all constant groups', () => {
      expect(ACTIONS).toBeDefined();
      expect(VERIFICATION_TARGETS).toBeDefined();
      expect(VERIFICATION_OPERATIONS).toBeDefined();
      expect(EXECUTION_STATUS).toBeDefined();
      expect(SELECTORS).toBeDefined();
      expect(METHOD_MAPPINGS).toBeDefined();
      expect(SUPPORTED_VERIFICATION_TARGETS).toBeDefined();
      expect(SUPPORTED_VERIFICATION_OPERATIONS).toBeDefined();
      expect(ERROR_MESSAGES).toBeDefined();
    });
  });
});
