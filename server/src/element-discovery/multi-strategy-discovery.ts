import { Page } from 'playwright';
import { IElementDiscoveryService, IElementDiscoveryStrategy } from './index.js';
import { IElementDiscoveryResult } from '../types/index.js';
import { ILogger } from '../infra/logger.js';

/**
 * Multi-strategy element discovery service
 * Tries multiple strategies in parallel and returns the best result
 */
export class MultiStrategyElementDiscovery implements IElementDiscoveryService {
  constructor(
    private strategies: IElementDiscoveryStrategy[],
    private logger: ILogger
  ) {
    if (strategies.length === 0) {
      throw new Error('At least one discovery strategy is required');
    }
  }

  async discoverElement(
    page: Page,
    description: string,
    actionType: 'click' | 'type' | 'hover' | 'verify',
    context?: {
      url?: string;
      html?: string;
      testId?: string;
    }
  ): Promise<IElementDiscoveryResult> {
    const isSemanticConcept = this.isSemanticConcept(description);
    
    this.logger.info(`ELEMENT DISCOVERY: Starting discovery for "${description}"`, { 
      testId: context?.testId,
      actionType,
      isSemanticConcept,
      context: { url: context?.url, html: context?.html },
      availableStrategies: this.strategies.map(s => s.name),
      strategiesCount: this.strategies.length,
      priority: isSemanticConcept ? 'Vision AI (semantic concept)' : 'All strategies in parallel'
    });

    // For semantic concepts, prioritize Vision AI strategy first
    if (isSemanticConcept) {
      const visionStrategy = this.strategies.find(s => s.name === 'VISION_AI');
      if (visionStrategy) {
        try {
          const visionResult = await visionStrategy.discover(page, description, actionType, {
            ...context,
            testId: context?.testId
          });
          
          if (visionResult) {
            this.logger.info(`ELEMENT DISCOVERY: Vision AI succeeded for semantic concept "${description}"`, {
              testId: context?.testId,
              selector: visionResult.selector,
              confidence: visionResult.confidence,
              strategy: visionResult.strategy
            });
            return visionResult;
          }
        } catch (error) {
          this.logger.warn(`ELEMENT DISCOVERY: Vision AI failed for semantic concept, trying other strategies`, {
            testId: context?.testId,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }

    // Try all strategies in parallel (or as fallback for semantic concepts)
    const results = await Promise.allSettled(
      this.strategies.map(strategy =>
        strategy.discover(page, description, actionType, {
          ...context,
          testId: context?.testId // Ensure testId is passed to all strategies
        })
      )
    );

    // Collect successful results with their strategies
    const successfulResults: Array<{ result: IElementDiscoveryResult; strategy: string }> = [];
    const failedStrategies: Array<{ strategy: string; error: string }> = [];
    
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const strategy = this.strategies[i];
      
      if (result.status === 'fulfilled' && result.value !== null) {
        successfulResults.push({
          result: { ...result.value, strategy: strategy.name },
          strategy: strategy.name
        });
        this.logger.info(`ELEMENT DISCOVERY: Strategy ${strategy.name} succeeded`, {
          testId: context?.testId,
          selector: result.value.selector,
          confidence: result.value.confidence
        });
      } else if (result.status === 'rejected') {
        const errorMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
        failedStrategies.push({
          strategy: strategy.name,
          error: errorMsg
        });
        this.logger.warn(`ELEMENT DISCOVERY: Strategy ${strategy.name} failed`, { 
          testId: context?.testId,
          error: errorMsg,
          note: strategy.name === 'LLM_DOM_ANALYSIS' 
            ? 'DOM analysis failed - Vision AI fallback would help here if available'
            : undefined
        });
      }
    }

    // Log summary of all strategy attempts
    this.logger.info(`ELEMENT DISCOVERY: Discovery summary for "${description}"`, {
      testId: context?.testId,
      totalStrategies: this.strategies.length,
      successfulStrategies: successfulResults.length,
      failedStrategies: failedStrategies.length,
      successful: successfulResults.map(s => ({
        strategy: s.strategy,
        selector: s.result.selector,
        confidence: s.result.confidence
      })),
      failed: failedStrategies,
      hasVisionFallback: this.strategies.some(s => s.name.includes('VISION') || s.name.includes('Vision'))
    });

    if (successfulResults.length === 0) {
      const errorMsg = `No strategy could discover element "${description}" for action ${actionType}. ` +
        `Tried strategies: ${this.strategies.map(s => s.name).join(', ')}`;
      
      this.logger.error(`ELEMENT DISCOVERY: All strategies failed for "${description}"`, {
        testId: context?.testId,
        error: errorMsg,
        failedStrategies,
        recommendation: this.strategies.some(s => s.name.includes('VISION'))
          ? 'Consider checking DOM structure or page state'
          : 'Consider adding Vision AI strategy for better element discovery'
      });
      
      throw new Error(errorMsg);
    }

    // Sort by confidence (highest first)
    // For semantic concepts, prioritize Vision AI results
    successfulResults.sort((a, b) => {
      const aIsVision = a.strategy === 'VISION_AI';
      const bIsVision = b.strategy === 'VISION_AI';
      
      if (isSemanticConcept) {
        // For semantic concepts, Vision AI results get priority boost
        if (aIsVision && !bIsVision) return -1;
        if (!aIsVision && bIsVision) return 1;
      }
      
      // Otherwise sort by confidence
      return b.result.confidence - a.result.confidence;
    });

    const bestResult = successfulResults[0].result;
    
    // Collect alternatives from all successful results
    const allAlternatives = new Set<string>();
    successfulResults.forEach(({ result }) => {
      allAlternatives.add(result.selector);
      result.alternatives.forEach(alt => allAlternatives.add(alt));
    });
    allAlternatives.delete(bestResult.selector); // Remove primary selector from alternatives

    this.logger.info(`Element discovered: "${description}"`, {
      testId: context?.testId,
      selector: bestResult.selector,
      confidence: bestResult.confidence,
      strategy: bestResult.strategy,
      alternativesCount: allAlternatives.size
    });

    return {
      ...bestResult,
      alternatives: Array.from(allAlternatives)
    };
  }

  async findAlternatives(
    page: Page,
    failedSelector: string,
    description: string,
    testId?: string
  ): Promise<string[]> {
    this.logger.debug(`Finding alternatives for failed selector: ${failedSelector}`, { testId });

    try {
      const result = await this.discoverElement(page, description, 'click', { testId });
      return [result.selector, ...result.alternatives].filter(s => s !== failedSelector);
    } catch (error) {
      this.logger.warn(`Could not find alternatives for ${failedSelector}`, { error, testId });
      return [];
    }
  }

  /**
   * Check if description represents a semantic/visual concept
   */
  private isSemanticConcept(description: string): boolean {
    const semanticConcepts = [
      'form',
      'login form',
      'signup form',
      'sign in form',
      'sign up form',
      'registration form',
      'contact form',
      'search form',
      'modal',
      'dialog',
      'popup',
      'menu',
      'navigation',
      'header',
      'footer',
      'sidebar',
      'card',
      'panel',
      'section',
      'container',
      'group',
      'region',
      'area',
      'zone'
    ];
    const lowerDescription = description.toLowerCase();
    return semanticConcepts.some(concept => lowerDescription.includes(concept));
  }
}

