/**
 * Configuration entity for storing system-wide settings
 * This is designed to be extensible for future configuration properties
 */

export interface IConfiguration {
  id: string;
  key: string; // Namespaced key like "confidence.threshold.click" or "feature.enabled"
  value: unknown; // Can be string, number, boolean, object, etc.
  description?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface IConfigurationValue {
  key: string;
  value: unknown;
  description?: string;
  updatedAt?: number;
}

/**
 * Predefined configuration keys for type safety
 */
export enum ConfigKey {
  // Confidence thresholds
  CONFIDENCE_THRESHOLD_CLICK = 'confidence.threshold.click',
  CONFIDENCE_THRESHOLD_TYPE = 'confidence.threshold.type',
  CONFIDENCE_THRESHOLD_HOVER = 'confidence.threshold.hover',
  CONFIDENCE_THRESHOLD_VERIFY = 'confidence.threshold.verify',
  CONFIDENCE_THRESHOLD_DEFAULT = 'confidence.threshold.default',
}

/**
 * Helper to get confidence threshold key for an action type
 */
export function getConfidenceThresholdKey(actionType: string): string {
  return `confidence.threshold.${actionType}`;
}

/**
 * Helper to check if a key is a confidence threshold key
 */
export function isConfidenceThresholdKey(key: string): boolean {
  return key.startsWith('confidence.threshold.');
}

/**
 * Helper to extract action type from confidence threshold key
 */
export function extractActionTypeFromKey(key: string): string | null {
  const match = key.match(/^confidence\.threshold\.(.+)$/);
  return match ? match[1] : null;
}

