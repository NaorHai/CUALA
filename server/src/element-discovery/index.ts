import { Page } from 'playwright';
import { IElementDiscoveryResult } from '../types/index.js';

/**
 * Strategy interface for element discovery
 */
export interface IElementDiscoveryStrategy {
  name: string;
  discover(
    page: Page,
    description: string,
    actionType: 'click' | 'type' | 'hover' | 'verify',
    context?: {
      url?: string;
      html?: string;
      testId?: string;
    }
  ): Promise<IElementDiscoveryResult | null>;
}

/**
 * Element Discovery Service interface
 */
export interface IElementDiscoveryService {
  /**
   * Discovers elements using multiple strategies
   */
  discoverElement(
    page: Page,
    description: string,
    actionType: 'click' | 'type' | 'hover' | 'verify',
    context?: {
      url?: string;
      html?: string;
      testId?: string; // Test ID for logging
    }
  ): Promise<IElementDiscoveryResult>;
  
  /**
   * Finds alternative selectors if primary fails
   */
  findAlternatives(
    page: Page,
    failedSelector: string,
    description: string
  ): Promise<string[]>;
}

