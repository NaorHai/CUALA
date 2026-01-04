import { Page } from 'playwright';
import OpenAI from 'openai';
import { IElementDiscoveryStrategy } from '../index.js';
import { IElementDiscoveryResult } from '../../types/index.js';
import { ILogger } from '../../infra/logger.js';
import { IConfig } from '../../infra/config.js';
import { PromptManager } from '../../infra/prompt-manager.js';

/**
 * Vision AI-based element discovery strategy (Hybrid DOM + Screenshot)
 * For semantic concepts: Uses screenshot + Vision AI for visual understanding, then DOM for selector extraction
 * For specific elements: Uses DOM analysis only
 * Always returns CSS selectors (never pixel coordinates) for DOM-based execution
 */
export class VisionAIStrategy implements IElementDiscoveryStrategy {
  public readonly name = 'VISION_AI';
  private client: OpenAI;
  private textModel: string;
  private visionModel: string;
  private promptManager: PromptManager;

  // Semantic concepts that are better identified visually
  private readonly semanticConcepts = [
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

  constructor(
    private config: IConfig,
    private logger: ILogger
  ) {
    const apiKey = config.get('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not defined for VisionAIStrategy');
    }
    this.client = new OpenAI({ apiKey });
    // Use vision model for semantic concepts (screenshot analysis)
    this.visionModel = config.get('OPENAI_VISION_MODEL') || 'gpt-4o';
    // Use text model for DOM-only analysis of specific elements
    this.textModel = config.get('OPENAI_MODEL') || 'gpt-4-turbo-preview';
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
      // Check if this is a semantic/visual concept
      const isSemanticConcept = this.isSemanticConcept(description);
      
      // For semantic concepts, use hybrid screenshot + DOM approach
      // For specific elements, use DOM-only analysis
      if (isSemanticConcept) {
        return await this.discoverSemanticConcept(page, description, actionType, context);
      } else {
        // For specific elements, use DOM-only analysis
        return await this.discoverSpecificElement(page, description, actionType, context);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`VISION AI STRATEGY: Failed to discover element "${description}"`, {
        testId: context?.testId,
        error: errorMsg
      });
      return null;
    }
  }

  /**
   * Discover semantic/visual concepts using hybrid screenshot + DOM approach
   */
  private async discoverSemanticConcept(
    page: Page,
    description: string,
    actionType: 'click' | 'type' | 'hover' | 'verify',
    context?: {
      url?: string;
      html?: string;
      testId?: string;
    }
  ): Promise<IElementDiscoveryResult | null> {
    this.logger.info(`VISION AI STRATEGY: Discovering semantic concept "${description}" using hybrid screenshot + DOM`, {
      testId: context?.testId,
      actionType,
      approach: 'Screenshot for visual understanding, DOM for selector extraction'
    });

    // Capture screenshot for visual understanding
    const screenshot = await page.screenshot({ type: 'jpeg', quality: 80 });
    const base64Screenshot = screenshot.toString('base64');

    // Extract DOM structure for selector extraction
    const domStructure = await this.extractDOMStructure(page);
    const url = context?.url || page.url();

    // Use Vision AI with screenshot + DOM for hybrid analysis
    const visionResult = await this.getElementFromHybridAnalysis(
      base64Screenshot,
      domStructure,
      description,
      actionType,
      url,
      page
    );

    if (!visionResult) {
      this.logger.warn(`VISION AI STRATEGY: Hybrid analysis did not find semantic concept "${description}"`, {
        testId: context?.testId
      });
      return null;
    }

    this.logger.info(`VISION AI STRATEGY: Semantic concept discovered via hybrid analysis`, {
      testId: context?.testId,
      description,
      selector: visionResult.selector,
      confidence: visionResult.confidence,
      elementInfo: visionResult.elementInfo
    });

    return {
      selector: visionResult.selector || 'body',
      confidence: visionResult.confidence,
      alternatives: visionResult.alternatives || [],
      elementInfo: visionResult.elementInfo || {
        tag: 'semantic',
        attributes: {
          'data-visual-concept': description.toLowerCase(),
          'data-hybrid-discovered': 'true'
        }
      },
      strategy: this.name,
      metadata: {
        visualConcept: true,
        hybridDiscovered: true,
        screenshotUsed: true
      }
    };
  }

  /**
   * Discover specific elements using DOM-only analysis
   */
  private async discoverSpecificElement(
    page: Page,
    description: string,
    actionType: 'click' | 'type' | 'hover' | 'verify',
    context?: {
      url?: string;
      html?: string;
      testId?: string;
    }
  ): Promise<IElementDiscoveryResult | null> {
    this.logger.info(`VISION AI STRATEGY: Discovering specific element "${description}" using DOM-only analysis`, {
      testId: context?.testId,
      actionType,
      approach: 'DOM analysis only'
    });

    // Extract DOM structure
    const domStructure = await this.extractDOMStructure(page);
    const url = context?.url || page.url();

    // Build intent prompt
    const intent = this.buildIntentPrompt(description, actionType, url);

    // Get element information from DOM analysis
    const domResult = await this.getElementFromDOMAnalysis(
      domStructure,
      intent,
      description,
      actionType,
      page
    );

    if (!domResult) {
      this.logger.warn(`VISION AI STRATEGY: DOM analysis did not find element "${description}"`, {
        testId: context?.testId
      });
      return null;
    }

    this.logger.info(`VISION AI STRATEGY: Element discovered via DOM analysis`, {
      testId: context?.testId,
      description,
      selector: domResult.selector,
      confidence: domResult.confidence,
      elementInfo: domResult.elementInfo
    });

    return {
      selector: domResult.selector || 'body',
      confidence: domResult.confidence,
      alternatives: domResult.alternatives || [],
      elementInfo: domResult.elementInfo || {
        tag: 'unknown',
        attributes: {}
      },
      strategy: this.name,
      metadata: {
        visualConcept: false,
        domDiscovered: true
      }
    };
  }

  /**
   * Check if description represents a semantic/visual concept
   */
  private isSemanticConcept(description: string): boolean {
    const lowerDescription = description.toLowerCase();
    for (let i = 0; i < this.semanticConcepts.length; i++) {
      if (lowerDescription.includes(this.semanticConcepts[i])) {
        return true;
      }
    }
    return false;
  }

  /**
   * Build intent prompt for DOM analysis
   */
  private buildIntentPrompt(description: string, actionType: string, url: string): string {
    if (actionType === 'verify') {
      return `Analyze the DOM structure and identify the element or semantic region described as: "${description}". ` +
        `This could be a semantic concept (like a form, modal, or visual grouping). ` +
        `Return the best CSS selector for this element or region. ` +
        `If it's a visual grouping (like a form), return a selector for the container element that groups the related elements.`;
    }
    
    return `Analyze the DOM structure and find the element described as: "${description}". ` +
      `This could be a semantic concept (like a form, modal, or visual grouping) or a specific element (button, input, link). ` +
      `Return the best CSS selector for this element. ` +
      `Current URL: ${url}`;
  }

  /**
   * Extract simplified DOM structure for analysis
   */
  private async extractDOMStructure(page: Page): Promise<string> {
    return await page.evaluate(function() {
      function extractElementInfo(el: Element): any {
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
            if (attr === 'placeholder') info.placeholder = value;
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

        // Extract position for better context
        if (el instanceof HTMLElement) {
          const rect = el.getBoundingClientRect();
          info.position = {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height
          };
        }

        return info;
      }

      // Focus on interactive and important elements, plus containers for semantic concepts
      const selectors = [
        'button',
        'a',
        'input',
        'select',
        'textarea',
        'form',
        '[role="button"]',
        '[role="link"]',
        '[role="form"]',
        '[role="dialog"]',
        '[role="menu"]',
        '[data-testid]',
        '[id]',
        'h1, h2, h3, h4, h5, h6',
        'div[class*="form"]',
        'div[class*="modal"]',
        'div[class*="dialog"]',
        'div[class*="menu"]',
        'section',
        'article',
        'nav',
        'header',
        'footer',
        'aside'
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

      return JSON.stringify(uniqueElements.slice(0, 300), null, 2); // Limit to 300 elements
    });
  }

  /**
   * Get element information from hybrid screenshot + DOM analysis using Vision AI
   */
  private async getElementFromHybridAnalysis(
    base64Screenshot: string,
    domStructure: string,
    description: string,
    actionType: string,
    url: string,
    page: Page
  ): Promise<{
    selector?: string;
    confidence: number;
    alternatives?: string[];
    elementInfo?: {
      tag: string;
      attributes: Record<string, string>;
    };
  } | null> {
    const systemPrompt = this.promptManager.render('vision-element-discovery-system', {});
    const userPrompt = this.promptManager.render('vision-element-discovery-user', {
      url,
      description,
      actionType,
      domStructure: domStructure.substring(0, 15000) + (domStructure.length > 15000 ? '... (truncated)' : '')
    });

    try {
      const messages: any[] = [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${base64Screenshot}` }
            }
          ]
        }
      ];

      const response = await this.client.chat.completions.create({
        model: this.visionModel,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return null;
      }

      const parsed = JSON.parse(content);
      
      if (!parsed.selector || typeof parsed.selector !== 'string') {
        this.logger.warn('Hybrid analysis did not return a valid selector', {
          parsed
        });
        return null;
      }

      // Validate selector exists in DOM
      try {
        const count = await page.locator(parsed.selector).count();
        if (count === 0) {
          this.logger.warn(`Hybrid analysis suggested selector does not exist: ${parsed.selector}`);
          // Try alternatives if available
          if (parsed.alternatives && parsed.alternatives.length > 0) {
            for (const altSelector of parsed.alternatives) {
              const altCount = await page.locator(altSelector).count();
              if (altCount > 0) {
                this.logger.info(`Using alternative selector from hybrid analysis: ${altSelector}`);
                return {
                  selector: altSelector,
                  confidence: Math.min(1, Math.max(0, (parsed.confidence || 0.7) * 0.9)),
                  alternatives: parsed.alternatives.filter((s: string) => s !== altSelector),
                  elementInfo: parsed.elementInfo || {
                    tag: 'unknown',
                    attributes: {}
                  }
                };
              }
            }
          }
          return null;
        }
      } catch (error) {
        this.logger.warn(`Invalid selector from hybrid analysis: ${parsed.selector}`, {
          error: error instanceof Error ? error.message : String(error)
        });
        return null;
      }

      return {
        selector: parsed.selector,
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0.7)),
        alternatives: parsed.alternatives || [],
        elementInfo: parsed.elementInfo || {
          tag: 'unknown',
          attributes: {}
        }
      };
    } catch (error) {
      this.logger.error('Hybrid analysis request failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Get element information from DOM analysis using LLM (for specific elements)
   */
  private async getElementFromDOMAnalysis(
    domStructure: string,
    intent: string,
    description: string,
    actionType: string,
    page: Page
  ): Promise<{
    selector?: string;
    confidence: number;
    alternatives?: string[];
    elementInfo?: {
      tag: string;
      attributes: Record<string, string>;
    };
  } | null> {
    const systemPrompt = `You are a DOM element discovery agent. Given a DOM structure and a description, identify the best CSS selector for the element.

CRITICAL INTELLIGENCE RULES:
1. SEMANTIC CONCEPTS: Elements like "form", "login form", "modal", etc. are SEMANTIC CONCEPTS that may be represented by containers.
   - A "form" is typically a <form> element or a container div with form-related inputs
   - A "login form" is a form or container that contains email/password inputs and a submit button
   - Look for elements that GROUP related interactive elements together

2. SELECTOR PRIORITY: Prefer selectors in this order:
   - ID selector (#id) - most specific and stable
   - Data attributes ([data-testid], [data-id])
   - Name attribute ([name="..."])
   - Class selector (.class) - but ensure it's unique
   - Tag + attribute combinations (input[type="email"])
   - Tag selector (button, input) - only if unique on page

3. SEMANTIC GROUPINGS: For semantic concepts like "form", "modal", etc.:
   - Look for container elements (form, div, section) that contain related elements
   - Check for role attributes ([role="form"], [role="dialog"])
   - Look for class names that indicate the concept (class*="form", class*="modal")
   - Return the selector for the CONTAINER element

4. ELEMENT DETECTION: For specific elements (buttons, inputs, links):
   - Match by text content if description mentions text
   - Match by type attribute (input[type="email"], input[type="password"])
   - Match by placeholder text
   - Match by aria-label or label text
   - Consider context (e.g., "login button" near email/password inputs)

5. OUTPUT FORMAT: Return JSON with:
   - "selector": CSS selector string (REQUIRED)
   - "confidence": confidence level (0.0-1.0)
   - "alternatives": array of alternative selectors if primary might not be unique
   - "elementInfo": { "tag": element type, "attributes": {...} }

6. ALWAYS RETURN VALID JSON: {"selector": "string", "confidence": number, "alternatives": [...], "elementInfo": {...}}`;

    const userPrompt = `${intent}

Description: "${description}"
Action Type: ${actionType}

DOM Structure:
${domStructure.substring(0, 15000)} ${domStructure.length > 15000 ? '... (truncated)' : ''}

Analyze the DOM structure and return the best CSS selector for the element described.`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.textModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return null;
      }

      const parsed = JSON.parse(content);
      
      if (!parsed.selector || typeof parsed.selector !== 'string') {
        this.logger.warn('DOM analysis did not return a valid selector', {
          parsed
        });
        return null;
      }

      // Validate selector exists in DOM
      try {
        const count = await page.locator(parsed.selector).count();
        if (count === 0) {
          this.logger.warn(`DOM analysis suggested selector does not exist: ${parsed.selector}`);
          // Try alternatives if available
          if (parsed.alternatives && parsed.alternatives.length > 0) {
            for (const altSelector of parsed.alternatives) {
              const altCount = await page.locator(altSelector).count();
              if (altCount > 0) {
                this.logger.info(`Using alternative selector: ${altSelector}`);
                return {
                  selector: altSelector,
                  confidence: Math.min(1, Math.max(0, (parsed.confidence || 0.7) * 0.9)), // Slightly lower confidence for alternative
                  alternatives: parsed.alternatives.filter((s: string) => s !== altSelector),
                  elementInfo: parsed.elementInfo || {
                    tag: 'unknown',
                    attributes: {}
                  }
                };
              }
            }
          }
          return null;
        }
      } catch (error) {
        this.logger.warn(`Invalid selector from DOM analysis: ${parsed.selector}`, {
          error: error instanceof Error ? error.message : String(error)
        });
        return null;
      }

      return {
        selector: parsed.selector,
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0.7)),
        alternatives: parsed.alternatives || [],
        elementInfo: parsed.elementInfo || {
          tag: 'unknown',
          attributes: {}
        }
      };
    } catch (error) {
      this.logger.error('DOM analysis request failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

}

