import { IStorage } from '../storage/index.js';
import { ILogger } from './logger.js';
import { ActionType } from '../types/confidence-threshold.js';
import { getConfidenceThresholdKey, extractActionTypeFromKey } from '../types/config.js';

/**
 * Service for managing and retrieving confidence thresholds
 * Uses the unified configuration system
 */
export class ConfidenceThresholdService {
  private defaultThresholds: Map<ActionType, number> = new Map([
    ['click', 0.5],
    ['type', 0.7],
    ['hover', 0.7],
    ['verify', 0.7],
    ['default', 0.6]
  ]);

  constructor(
    private storage: IStorage,
    private logger: ILogger
  ) {}

  /**
   * Get confidence threshold for a specific action type
   * Returns configured threshold or default if not configured
   */
  async getThreshold(actionType: ActionType): Promise<number> {
    try {
      const configKey = getConfidenceThresholdKey(actionType);
      const config = await this.storage.getConfiguration(configKey);
      
      if (config && typeof config.value === 'number') {
        this.logger.debug(`Using configured confidence threshold for ${actionType}: ${config.value}`);
        return config.value;
      }
      
      // Fallback to default
      const defaultThreshold = this.defaultThresholds.get(actionType) || this.defaultThresholds.get('default') || 0.6;
      this.logger.debug(`Using default confidence threshold for ${actionType}: ${defaultThreshold}`);
      return defaultThreshold;
    } catch (error) {
      this.logger.warn(`Failed to get confidence threshold for ${actionType}, using default`, error);
      return this.defaultThresholds.get(actionType) || this.defaultThresholds.get('default') || 0.6;
    }
  }

  /**
   * Get all configured thresholds
   */
  async getAllThresholds(): Promise<Map<string, number>> {
    try {
      const configs = await this.storage.getAllConfigurations('confidence.threshold.');
      const thresholds = new Map<string, number>();
      
      // Add configured thresholds
      configs.forEach(config => {
        const actionType = extractActionTypeFromKey(config.key);
        if (actionType && typeof config.value === 'number') {
          thresholds.set(actionType, config.value);
        }
      });
      
      // Add defaults for action types that don't have configured values
      for (const [actionType, defaultThreshold] of this.defaultThresholds.entries()) {
        if (!thresholds.has(actionType)) {
          thresholds.set(actionType, defaultThreshold);
        }
      }
      
      return thresholds;
    } catch (error) {
      this.logger.warn('Failed to get all confidence thresholds, returning defaults', error);
      return new Map(this.defaultThresholds);
    }
  }
}

