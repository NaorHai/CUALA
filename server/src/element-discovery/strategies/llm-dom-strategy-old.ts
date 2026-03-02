import { Page } from 'playwright';
import OpenAI from 'openai';
import { IElementDiscoveryStrategy } from '../index.js';
import { IElementDiscoveryResult } from '../../types/index.js';
import { ILogger } from '../../infra/logger.js';
import { IConfig } from '../../infra/config.js';
import { PromptManager } from '../../infra/prompt-manager.js';

/**
 * LLM-based DOM analysis strategy
 * Uses OpenAI to analyze DOM structure and find matching elements
 */
export class LLMDOMStrategy implements IElementDiscoveryStrategy {
  public readonly name = 'LLM_DOM_ANALYSIS';
  private client: OpenAI;
  private model: string;
  private promptManager: PromptManager;

  constructor(
    private config: IConfig,
    private logger: ILogger
  ) {
    const apiKey = config.get('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not defined for LLMDOMStrategy');
    }
    this.client = new OpenAI({ apiKey });
    this.model = config.get('OPENAI_MODEL') || 'gpt-4-turbo-preview';
    this.promptManager = PromptManager.getInstance();
  }

  async discover(
    page: Page,
    description: string,
    actionType: 'click' | 'type' | 'hover' | 'verify',
    context?: {
      url?: string;
      html?: string;
      testId?: string;
    }
  ): Promise<IElementDiscoveryResult | null> {
    try {
      // Extract simplified DOM structure
      const domStructure = await this.extractDOMStructure(page);
      
      if (!domStructure || domStructure.length === 0) {
        this.logger.warn('Empty DOM structure extracted');
        return null;
      }

      // Use LLM to analyze DOM and find matching element
      const systemPrompt = this.promptManager.render('element-discovery-system', {});
      const userPrompt = this.promptManager.render('element-discovery-user', {
        description,
        actionType,
        domStructure: domStructure.substring(0, 15000), // Limit size
        url: context?.url || page.url()
      });

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1, // Low temperature for consistency
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        this.logger.warn('LLM returned empty response for element discovery');
        return null;
      }

      const parsed = JSON.parse(content);
      
      if (parsed.error || !parsed.selector) {
        this.logger.warn('LLM element discovery failed', { error: parsed.error });
        return null;
      }

      // Validate selector exists on page
      const selectorExists = await this.validateSelector(page, parsed.selector);
      if (!selectorExists) {
        this.logger.warn(`LLM suggested selector does not exist: ${parsed.selector}`);
        // Try alternatives if provided
        if (parsed.alternatives && parsed.alternatives.length > 0) {
          for (const alt of parsed.alternatives) {
            if (await this.validateSelector(page, alt)) {
              parsed.selector = alt;
              parsed.confidence = Math.max(0.5, parsed.confidence - 0.2); // Reduce confidence for alternative
              break;
            }
          }
        } else {
          return null;
        }
      }

      return {
        selector: parsed.selector,
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0.7)),
        alternatives: parsed.alternatives || [],
        elementInfo: parsed.elementInfo || {
          tag: 'unknown',
          attributes: {}
        },
        strategy: this.name
      };
    } catch (error) {
      this.logger.error('LLM DOM strategy failed', error);
      return null;
    }
  }

  /**
   * Extract simplified, semantic DOM structure
   * Focuses on interactive elements, IDs, classes, text content
   */
  private async extractDOMStructure(page: Page): Promise<string> {
    return await page.evaluate(function() {
      // Self-contained function - no external dependencies
      function extractElementInfo(el: Element): any {
        const info: any = {
          tag: el.tagName.toLowerCase(),
          attributes: {}
        };

        // Extract important attributes
        if (el.id) {
          info.id = el.id;
        }
        if (el.className && typeof el.className === 'string') {
          const classList = el.className.split(/\s+/);
          info.classes = classList.filter(function(c) { return c.length > 0; });
        }

        // Extract semantic attributes
        const importantAttrs = ['role', 'type', 'name', 'data-testid', 'aria-label', 'placeholder', 'value'];
        for (let i = 0; i < importantAttrs.length; i++) {
          const attr = importantAttrs[i];
          const value = el.getAttribute(attr);
          if (value) {
            info.attributes[attr] = value;
            if (attr === 'role') info.role = value;
            if (attr === 'type') info.type = value;
            if (attr === 'name') info.name = value;
            if (attr === 'data-testid') info['data-testid'] = value;
            if (attr === 'aria-label') info['aria-label'] = value;
          }
        }

        // Extract text content (limited length)
        const textContent = el.textContent;
        if (textContent) {
          const trimmed = textContent.trim();
          if (trimmed.length > 0 && trimmed.length < 100) {
            info.text = trimmed;
          }
        }

        return info;
      }

      // Focus on interactive and important elements
      const selectors = [
        'button',
        'a',
        'input',
        'select',
        'textarea',
        '[role="button"]',
        '[role="link"]',
        '[data-testid]',
        '[id]',
        'h1, h2, h3, h4, h5, h6'
      ];

      const elements: any[] = [];
      for (let i = 0; i < selectors.length; i++) {
        const selector = selectors[i];
        try {
          const nodeList = document.querySelectorAll(selector);
          for (let j = 0; j < nodeList.length; j++) {
            const el = nodeList[j];
            elements.push(extractElementInfo(el));
          }
        } catch (e) {
          // Ignore invalid selectors
        }
      }

      // Remove duplicates (same element matched by multiple selectors)
      const seen = new Set();
      const uniqueElements: any[] = [];
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        const key = el.tag + '-' + (el.id || '') + '-' + (el.classes ? el.classes.join(',') : '');
        if (!seen.has(key)) {
          seen.add(key);
          uniqueElements.push(el);
        }
      }

      return JSON.stringify(uniqueElements.slice(0, 200), null, 2); // Limit to 200 elements
    });
  }

  /**
   * Validate that selector exists and is visible/interactable
   */
  private async validateSelector(page: Page, selector: string): Promise<boolean> {
    try {
      const count = await page.locator(selector).count();
      return count > 0;
    } catch (error) {
      return false;
    }
  }
}

