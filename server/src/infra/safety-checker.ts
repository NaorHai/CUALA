import OpenAI from 'openai';
import { IConfig } from './config.js';
import { ILogger } from './logger.js';

export interface SafetyCheckResult {
  isSafe: boolean;
  reason?: string;
  categories?: string[];
}

/**
 * Safety checker for user-provided scenarios
 * Uses OpenAI's moderation API to detect toxic, malicious, or inappropriate content
 */
export class SafetyChecker {
  private client: OpenAI | null = null;
  private enabled: boolean;

  constructor(
    private config: IConfig,
    private logger: ILogger
  ) {
    const apiKey = config.get('OPENAI_API_KEY');
    this.enabled = !!apiKey; // Only enable if API key is available
    
    if (this.enabled) {
      try {
        this.client = new OpenAI({ apiKey });
        this.logger.info('Safety checker initialized with OpenAI moderation API');
      } catch (error) {
        this.logger.warn('Failed to initialize safety checker', error);
        this.enabled = false;
      }
    } else {
      this.logger.warn('Safety checker disabled: OPENAI_API_KEY not configured');
    }
  }

  /**
   * Check if a scenario is safe to process
   * Returns true if safe, false if unsafe
   */
  async checkScenario(scenario: string): Promise<SafetyCheckResult> {
    if (!this.enabled || !this.client) {
      // If safety checker is disabled, allow all scenarios
      this.logger.debug('Safety checker disabled, allowing scenario');
      return { isSafe: true };
    }

    if (!scenario || scenario.trim().length === 0) {
      return { isSafe: true }; // Empty scenarios are safe
    }

    try {
      // Use OpenAI moderation API
      const moderation = await this.client.moderations.create({
        input: scenario
      });

      const result = moderation.results[0];
      
      if (result.flagged) {
        // Extract categories that were flagged
        const flaggedCategories = Object.entries(result.categories)
          .filter(([_, flagged]) => flagged)
          .map(([category, _]) => category);

        const reason = this.generateReason(flaggedCategories, result.category_scores);
        
        this.logger.warn('Scenario failed safety check', {
          categories: flaggedCategories,
          scores: result.category_scores,
          reason
        });

        return {
          isSafe: false,
          reason,
          categories: flaggedCategories
        };
      }

      return { isSafe: true };
    } catch (error) {
      // If moderation API fails, log but allow the scenario (fail open)
      // This prevents blocking legitimate scenarios due to API issues
      this.logger.error('Safety check API error, allowing scenario', error);
      return { isSafe: true };
    }
  }

  /**
   * Generate a user-friendly reason for why the scenario was flagged
   */
  private generateReason(categories: string[], scores: Record<string, number>): string {
    const categoryMessages: Record<string, string> = {
      'hate': 'contains hate speech or discriminatory content',
      'hate/threatening': 'contains threatening hate speech',
      'self-harm': 'contains self-harm related content',
      'sexual': 'contains sexual content',
      'sexual/minors': 'contains sexual content involving minors',
      'violence': 'contains violent content',
      'violence/graphic': 'contains graphic violent content'
    };

    const reasons = categories
      .map(cat => categoryMessages[cat] || `flagged for ${cat}`)
      .filter(Boolean);

    if (reasons.length === 0) {
      return 'failed safety check';
    }

    if (reasons.length === 1) {
      return `Scenario ${reasons[0]}`;
    }

    return `Scenario ${reasons.slice(0, -1).join(', ')} and ${reasons[reasons.length - 1]}`;
  }
}

