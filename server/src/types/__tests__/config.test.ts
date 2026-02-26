/**
 * Configuration Types and Helpers Unit Tests
 *
 * Tests configuration key helpers and utilities
 */

import { describe, it, expect } from 'vitest';
import {
  ConfigKey,
  getConfidenceThresholdKey,
  isConfidenceThresholdKey,
  extractActionTypeFromKey
} from '../config.js';

describe('Configuration Types and Helpers', () => {
  describe('ConfigKey Enum', () => {
    it('should define confidence threshold keys', () => {
      expect(ConfigKey.CONFIDENCE_THRESHOLD_CLICK).toBe('confidence.threshold.click');
      expect(ConfigKey.CONFIDENCE_THRESHOLD_TYPE).toBe('confidence.threshold.type');
      expect(ConfigKey.CONFIDENCE_THRESHOLD_HOVER).toBe('confidence.threshold.hover');
      expect(ConfigKey.CONFIDENCE_THRESHOLD_VERIFY).toBe('confidence.threshold.verify');
      expect(ConfigKey.CONFIDENCE_THRESHOLD_DEFAULT).toBe('confidence.threshold.default');
    });

    it('should use consistent namespace format', () => {
      const keys = Object.values(ConfigKey);
      keys.forEach(key => {
        expect(key).toMatch(/^confidence\.threshold\.\w+$/);
      });
    });
  });

  describe('getConfidenceThresholdKey', () => {
    it('should generate correct key for action type', () => {
      expect(getConfidenceThresholdKey('click')).toBe('confidence.threshold.click');
      expect(getConfidenceThresholdKey('type')).toBe('confidence.threshold.type');
      expect(getConfidenceThresholdKey('hover')).toBe('confidence.threshold.hover');
    });

    it('should handle custom action types', () => {
      expect(getConfidenceThresholdKey('custom_action')).toBe('confidence.threshold.custom_action');
      expect(getConfidenceThresholdKey('scroll')).toBe('confidence.threshold.scroll');
    });

    it('should handle action types with special characters', () => {
      expect(getConfidenceThresholdKey('action-type')).toBe('confidence.threshold.action-type');
      expect(getConfidenceThresholdKey('action_type')).toBe('confidence.threshold.action_type');
    });

    it('should handle empty string', () => {
      const key = getConfidenceThresholdKey('');
      expect(key).toBe('confidence.threshold.');
    });
  });

  describe('isConfidenceThresholdKey', () => {
    it('should return true for valid confidence threshold keys', () => {
      expect(isConfidenceThresholdKey('confidence.threshold.click')).toBe(true);
      expect(isConfidenceThresholdKey('confidence.threshold.type')).toBe(true);
      expect(isConfidenceThresholdKey('confidence.threshold.custom')).toBe(true);
    });

    it('should return false for non-confidence threshold keys', () => {
      expect(isConfidenceThresholdKey('feature.enabled')).toBe(false);
      expect(isConfidenceThresholdKey('system.timeout')).toBe(false);
      expect(isConfidenceThresholdKey('confidence.other.setting')).toBe(false);
    });

    it('should return false for partial matches', () => {
      expect(isConfidenceThresholdKey('confidence.threshold')).toBe(false);
      expect(isConfidenceThresholdKey('confidence.')).toBe(false);
      expect(isConfidenceThresholdKey('threshold.click')).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(isConfidenceThresholdKey('')).toBe(false);
      expect(isConfidenceThresholdKey('confidence.threshold.')).toBe(true); // Has prefix
    });
  });

  describe('extractActionTypeFromKey', () => {
    it('should extract action type from valid keys', () => {
      expect(extractActionTypeFromKey('confidence.threshold.click')).toBe('click');
      expect(extractActionTypeFromKey('confidence.threshold.type')).toBe('type');
      expect(extractActionTypeFromKey('confidence.threshold.hover')).toBe('hover');
    });

    it('should extract custom action types', () => {
      expect(extractActionTypeFromKey('confidence.threshold.custom_action')).toBe('custom_action');
      expect(extractActionTypeFromKey('confidence.threshold.scroll')).toBe('scroll');
    });

    it('should return null for invalid keys', () => {
      expect(extractActionTypeFromKey('feature.enabled')).toBeNull();
      expect(extractActionTypeFromKey('confidence.threshold')).toBeNull();
      expect(extractActionTypeFromKey('invalid.key.format')).toBeNull();
    });

    it('should return null for malformed keys', () => {
      expect(extractActionTypeFromKey('')).toBeNull();
      expect(extractActionTypeFromKey('confidence.')).toBeNull();
      expect(extractActionTypeFromKey('threshold.click')).toBeNull();
    });

    it('should handle action types with special characters', () => {
      expect(extractActionTypeFromKey('confidence.threshold.action-type')).toBe('action-type');
      expect(extractActionTypeFromKey('confidence.threshold.action_type')).toBe('action_type');
      expect(extractActionTypeFromKey('confidence.threshold.action.type')).toBe('action.type');
    });

    it('should handle empty action type', () => {
      // Empty action type after the prefix - regex requires at least one character
      expect(extractActionTypeFromKey('confidence.threshold.')).toBeNull();
    });
  });

  describe('Integration', () => {
    it('should round-trip action type through helpers', () => {
      const actionType = 'click';
      const key = getConfidenceThresholdKey(actionType);
      const extractedType = extractActionTypeFromKey(key);

      expect(extractedType).toBe(actionType);
    });

    it('should work with all ConfigKey enum values', () => {
      const configKeys = Object.values(ConfigKey);

      configKeys.forEach(key => {
        expect(isConfidenceThresholdKey(key)).toBe(true);
        expect(extractActionTypeFromKey(key)).toBeTruthy();
      });
    });

    it('should maintain consistency between helpers', () => {
      const actionTypes = ['click', 'type', 'hover', 'verify', 'custom'];

      actionTypes.forEach(actionType => {
        const key = getConfidenceThresholdKey(actionType);
        expect(isConfidenceThresholdKey(key)).toBe(true);
        expect(extractActionTypeFromKey(key)).toBe(actionType);
      });
    });
  });

  describe('Type Safety', () => {
    it('should use ConfigKey enum values correctly', () => {
      const click = ConfigKey.CONFIDENCE_THRESHOLD_CLICK;
      expect(isConfidenceThresholdKey(click)).toBe(true);
      expect(extractActionTypeFromKey(click)).toBe('click');
    });

    it('should generate keys that match enum values', () => {
      expect(getConfidenceThresholdKey('click')).toBe(ConfigKey.CONFIDENCE_THRESHOLD_CLICK);
      expect(getConfidenceThresholdKey('type')).toBe(ConfigKey.CONFIDENCE_THRESHOLD_TYPE);
      expect(getConfidenceThresholdKey('hover')).toBe(ConfigKey.CONFIDENCE_THRESHOLD_HOVER);
      expect(getConfidenceThresholdKey('verify')).toBe(ConfigKey.CONFIDENCE_THRESHOLD_VERIFY);
      expect(getConfidenceThresholdKey('default')).toBe(ConfigKey.CONFIDENCE_THRESHOLD_DEFAULT);
    });
  });
});
