/**
 * Centralized DOM Extraction Utility
 * v1.0: Eliminates duplication across strategies
 */

import { Page } from 'playwright';
import { ILogger } from '../infra/logger.js';

export interface DOMExtractionOptions {
  maxElements?: number;
  includePosition?: boolean;
  includeContainers?: boolean; // For semantic concepts like forms, modals
}

/**
 * Centralized DOM extractor to avoid duplication
 */
export class DOMExtractor {
  constructor(private logger?: ILogger) {}

  /**
   * Extract simplified DOM structure with configurable options
   */
  async extract(
    page: Page,
    options: DOMExtractionOptions = {}
  ): Promise<string> {
    const {
      maxElements = 200,
      includePosition = false,
      includeContainers = true
    } = options;

    try {
      return await page.evaluate(
        (opts) => {
          function extractElementInfo(el: Element, includePos: boolean): any {
            const info: any = {
              tag: el.tagName.toLowerCase(),
              attributes: {}
            };

            // Extract important attributes
            if (el.id) info.id = el.id;
            if (el.className && typeof el.className === 'string') {
              const classList = el.className.split(/\s+/);
              info.classes = [];
              for (let i = 0; i < classList.length; i++) {
                const c = classList[i];
                if (c.length > 0) {
                  info.classes.push(c);
                }
              }
            }

            // Extract semantic attributes
            const importantAttrs = [
              'role', 'type', 'name', 'data-testid', 'data-test-id',
              'aria-label', 'aria-labelledby', 'placeholder', 'value', 'title'
            ];
            for (let i = 0; i < importantAttrs.length; i++) {
              const attr = importantAttrs[i];
              const value = el.getAttribute(attr);
              if (value) {
                info.attributes[attr] = value;
                // Also add as top-level for easier access
                if (attr === 'role') info.role = value;
                if (attr === 'type') info.type = value;
                if (attr === 'name') info.name = value;
                if (attr.includes('testid')) info.testId = value;
                if (attr.includes('label')) info.label = value;
              }
            }

            // Extract text content (limited length)
            const textContent = el.textContent;
            if (textContent) {
              const trimmed = textContent.trim();
              // Get direct text (not from children)
              const directText = Array.from(el.childNodes)
                .filter(node => node.nodeType === Node.TEXT_NODE)
                .map(node => node.textContent?.trim())
                .filter(text => text && text.length > 0)
                .join(' ')
                .trim();

              if (directText && directText.length < 100) {
                info.text = directText;
              } else if (trimmed.length > 0 && trimmed.length < 100) {
                info.text = trimmed;
              }
            }

            // Extract position if requested
            if (includePos && el instanceof HTMLElement) {
              const rect = el.getBoundingClientRect();
              // Only include visible elements
              if (rect.width > 0 && rect.height > 0) {
                info.position = {
                  top: Math.round(rect.top),
                  left: Math.round(rect.left),
                  width: Math.round(rect.width),
                  height: Math.round(rect.height)
                };
                // Check if element is in viewport
                info.inViewport = (
                  rect.top >= 0 &&
                  rect.left >= 0 &&
                  rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                  rect.right <= (window.innerWidth || document.documentElement.clientWidth)
                );
              }
            }

            return info;
          }

          // Build selector list based on options
          const baseSelectors = [
            'button',
            'a',
            'input',
            'select',
            'textarea',
            '[role="button"]',
            '[role="link"]',
            '[data-testid]',
            '[data-test-id]',
            '[id]',
            'h1, h2, h3, h4, h5, h6'
          ];

          const containerSelectors = [
            'form',
            '[role="form"]',
            '[role="dialog"]',
            '[role="menu"]',
            '[role="navigation"]',
            'div[class*="form"]',
            'div[class*="modal"]',
            'div[class*="dialog"]',
            'div[class*="menu"]',
            'section',
            'article',
            'nav',
            'header',
            'footer',
            'aside',
            'main'
          ];

          const selectors = opts.includeContainers
            ? [...baseSelectors, ...containerSelectors]
            : baseSelectors;

          const elements: any[] = [];
          const elementMap = new Map(); // For deduplication

          for (let i = 0; i < selectors.length; i++) {
            const selector = selectors[i];
            try {
              const nodeList = document.querySelectorAll(selector);
              for (let j = 0; j < nodeList.length; j++) {
                const el = nodeList[j];
                // Create unique key for deduplication
                const key = el.tagName + '-' +
                           (el.id || '') + '-' +
                           (el.className || '');

                if (!elementMap.has(key)) {
                  const info = extractElementInfo(el, opts.includePosition);
                  elementMap.set(key, info);
                  elements.push(info);
                }
              }
            } catch (e) {
              // Ignore invalid selectors
            }
          }

          // Sort by position (top-left first) if position is included
          if (opts.includePosition) {
            elements.sort((a, b) => {
              if (!a.position || !b.position) return 0;
              const aScore = a.position.top * 10000 + a.position.left;
              const bScore = b.position.top * 10000 + b.position.left;
              return aScore - bScore;
            });
          }

          return JSON.stringify(elements.slice(0, opts.maxElements), null, 2);
        },
        { maxElements, includePosition, includeContainers }
      );
    } catch (error) {
      this.logger?.error('Failed to extract DOM structure', {
        error: error instanceof Error ? error.message : String(error)
      });
      // Return empty structure on error
      return JSON.stringify([], null, 2);
    }
  }

  /**
   * Validate selector exists, is unique, and is visible
   */
  async validateSelector(
    page: Page,
    selector: string
  ): Promise<{
    exists: boolean;
    isUnique: boolean;
    isVisible: boolean;
    count: number;
  }> {
    try {
      const count = await page.locator(selector).count();

      if (count === 0) {
        return { exists: false, isUnique: false, isVisible: false, count: 0 };
      }

      // Check if first match is visible
      const isVisible = await page.locator(selector).first().isVisible().catch(() => false);

      return {
        exists: true,
        isUnique: count === 1,
        isVisible,
        count
      };
    } catch (error) {
      return { exists: false, isUnique: false, isVisible: false, count: 0 };
    }
  }

  /**
   * Get best selector from alternatives based on validation
   */
  async getBestSelector(
    page: Page,
    selectors: string[]
  ): Promise<{
    selector: string | null;
    confidence: number;
    validation: {
      exists: boolean;
      isUnique: boolean;
      isVisible: boolean;
      count: number;
    };
  }> {
    for (const selector of selectors) {
      const validation = await this.validateSelector(page, selector);

      if (validation.exists && validation.isVisible) {
        let confidence = 0.7;
        if (validation.isUnique) confidence += 0.2;
        if (validation.isVisible) confidence += 0.1;

        return {
          selector,
          confidence: Math.min(1, confidence),
          validation
        };
      }
    }

    return {
      selector: null,
      confidence: 0,
      validation: { exists: false, isUnique: false, isVisible: false, count: 0 }
    };
  }
}
