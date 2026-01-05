/**
 * Confidence threshold configuration for element discovery
 */

export type ActionType = 'click' | 'type' | 'hover' | 'verify' | 'default';

export interface IConfidenceThreshold {
  id: string;
  actionType: ActionType;
  threshold: number; // 0.0 to 1.0
  description?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface IConfidenceThresholdConfig {
  click?: number;
  type?: number;
  hover?: number;
  verify?: number;
  default?: number;
}

