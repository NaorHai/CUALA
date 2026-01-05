import { Page } from 'playwright';
import { IElementDiscoveryService } from './index.js';
import { IElementDiscoveryResult } from '../types/index.js';
import { ILogger } from '../infra/logger.js';
import { ConfidenceThresholdService } from '../infra/confidence-threshold-service.js';

/**
 * Smart Element Locator
 * Tries DOM first, falls back to vision if needed
 */
export class SmartElementLocator {
  constructor(
    private elementDiscovery: IElementDiscoveryService,
    private logger: ILogger,
    private confidenceThresholdService: ConfidenceThresholdService
  ) {}

  /**
   * Locate element using smart strategy:
   * 1. Try DOM selector if provided
   * 2. Try element discovery via DOM analysis (intelligent, multi-strategy)
   * 3. For TYPE actions: Enhanced input field detection
   * 4. Fall back to vision AI with validation
   */
  async locateElement(
    page: Page,
    description: string,
    actionType: 'click' | 'type' | 'hover' | 'verify',
    selector?: string,
    testId?: string
  ): Promise<{
    method: 'dom' | 'vision';
    selector?: string;
    coordinates?: { x: number; y: number };
    confidence: number;
    elementInfo?: {
      tag: string;
      type?: string;
      attributes: Record<string, string>;
    };
  }> {
    // Strategy 1: Try provided selector first
    if (selector) {
      try {
        const count = await page.locator(selector).count();
        if (count === 1) {
          const isVisible = await page.locator(selector).isVisible().catch(() => false);
          if (isVisible) {
            // For TYPE actions, validate it's an input field
            if (actionType === 'type') {
              const isValidInput = await this.validateInputField(page, selector);
              if (isValidInput) {
                this.logger.debug(`Input field found via DOM selector: ${selector}`, { testId });
                return {
                  method: 'dom',
                  selector,
                  confidence: 1.0,
                  elementInfo: isValidInput
                };
              } else {
                this.logger.warn(`Selector is not a valid input field: ${selector}, trying discovery`, { testId });
              }
            } else {
              this.logger.debug(`Element found via DOM selector: ${selector}`, { testId });
              return {
                method: 'dom',
                selector,
                confidence: 1.0
              };
            }
          }
        } else if (count > 1) {
          this.logger.warn(`Selector matched multiple elements: ${selector} (${count}), trying discovery`, { testId });
        } else {
          this.logger.debug(`Selector found no elements: ${selector}, trying discovery`, { testId });
        }
      } catch (error) {
        this.logger.debug(`DOM selector failed: ${selector}, trying discovery`, { error, testId });
      }
    }

    // Strategy 2: Intelligent element discovery (uses multi-strategy approach)
    // This leverages LLM DOM analysis, Vision AI, and other strategies
    try {
      const discovery = await this.elementDiscovery.discoverElement(
        page,
        description,
        actionType,
        { 
          url: page.url(),
          testId 
        }
      );

      // For TYPE actions, ensure we found an actual input field
      if (actionType === 'type') {
        const isValidInput = await this.validateInputField(page, discovery.selector);
        if (!isValidInput && discovery.confidence >= 0.7) {
          // Discovery found something but it's not an input field
          // Try to find input fields using the description context
          const inputField = await this.findInputFieldByContext(page, description, discovery);
          if (inputField) {
            this.logger.info(`Input field found via contextual discovery: ${inputField.selector}`, {
              testId,
              confidence: inputField.confidence,
              originalStrategy: discovery.strategy
            });
            return {
              method: 'dom',
              selector: inputField.selector,
              confidence: inputField.confidence,
              elementInfo: inputField.elementInfo
            };
          }
        } else if (isValidInput && discovery.confidence >= 0.7) {
          const count = await page.locator(discovery.selector).count();
          if (count === 1) {
            this.logger.info(`Input field found via discovery: ${discovery.selector}`, {
              testId,
              confidence: discovery.confidence,
              strategy: discovery.strategy,
              elementInfo: isValidInput
            });
            return {
              method: 'dom',
              selector: discovery.selector,
              confidence: discovery.confidence,
              elementInfo: isValidInput
            };
          }
        }
      } else {
        // For non-TYPE actions (click, hover, verify), use discovery result
        // Get confidence threshold from configuration service
        const minConfidence = await this.confidenceThresholdService.getThreshold(actionType);
        
        if (discovery.confidence >= minConfidence) {
          const count = await page.locator(discovery.selector).count();
          if (count === 1) {
            const isVisible = await page.locator(discovery.selector).isVisible().catch(() => false);
            if (isVisible) {
              this.logger.info(`Element found via discovery: ${discovery.selector}`, {
                testId,
                confidence: discovery.confidence,
                strategy: discovery.strategy,
                actionType,
                minConfidenceThreshold: minConfidence
              });
              return {
                method: 'dom',
                selector: discovery.selector,
                confidence: discovery.confidence
              };
            } else {
              this.logger.debug(`Element found but not visible: ${discovery.selector}`, { testId });
            }
          } else if (count > 1) {
            this.logger.warn(`Selector matched multiple elements: ${discovery.selector} (${count})`, { testId });
          } else {
            this.logger.warn(`Selector found no elements: ${discovery.selector}`, { testId });
          }
        } else {
          this.logger.debug(`Discovery confidence ${discovery.confidence} below threshold ${minConfidence} for ${actionType}`, {
            testId,
            selector: discovery.selector,
            strategy: discovery.strategy
          });
        }
      }
    } catch (error) {
      this.logger.debug('Element discovery failed, trying direct DOM fallback', { error, testId });
    }

    // Strategy 3: Intelligent DOM search (probability-based, flexible)
    // Searches all DOM elements and scores by match probability
    if (actionType === 'click' || actionType === 'type' || actionType === 'verify') {
      // For TYPE actions, wait a bit for popups/modals to appear (they might open after previous click)
      if (actionType === 'type') {
        await page.waitForTimeout(500).catch(() => {}); // Wait for popups/modals
        // Also wait for any dialogs/modals to appear
        try {
          await page.waitForSelector('[role="dialog"], [role="combobox"], .slds-modal, [class*="modal"]', { 
            state: 'visible', 
            timeout: 2000 
          }).catch(() => {});
        } catch (e) {
          // No modal found, continue
        }
      }
      
      // Try intelligent DOM search first (more flexible)
      const intelligentMatch = await this.intelligentDOMSearch(page, description, actionType, testId);
      if (intelligentMatch) {
        this.logger.info(`Element found via intelligent DOM search: ${intelligentMatch.selector}`, {
          testId,
          selector: intelligentMatch.selector,
          confidence: intelligentMatch.confidence,
          actionType
        });
        return {
          method: 'dom',
          selector: intelligentMatch.selector,
          confidence: intelligentMatch.confidence
        };
      }
      
      // Fallback to pattern-based direct DOM query
      const directSelector = await this.tryDirectDOMQuery(page, description, actionType, testId);
      if (directSelector) {
        this.logger.info(`Element found via direct DOM query fallback: ${directSelector.selector}`, {
          testId,
          selector: directSelector.selector,
          confidence: directSelector.confidence,
          actionType
        });
        return {
          method: 'dom',
          selector: directSelector.selector,
          confidence: directSelector.confidence
        };
      }
    }

    // Strategy 4: Fall back to vision AI
    // Vision AI will handle validation and retry logic
    this.logger.info(`Using vision AI to locate element: ${description}`, { testId, actionType });
    
    return {
      method: 'vision',
      confidence: 0.8 // Vision is reliable but slower
    };
  }

  /**
   * Intelligent DOM search: Search all elements and score by match probability
   * More flexible than pattern-based approach - finds best match regardless of structure
   */
  private async intelligentDOMSearch(
    page: Page,
    description: string,
    actionType: 'click' | 'type' | 'hover' | 'verify',
    testId?: string
  ): Promise<{ selector: string; confidence: number } | null> {
    try {
      this.logger.debug(`INTELLIGENT DOM SEARCH: Searching for "${description}"`, { testId, actionType });
      
      // Extract all candidate elements and score them
      // Use function declaration instead of arrow function to avoid __name transpilation issues
      const candidates = await page.evaluate(function(args: any) {
        const desc = args.desc;
        const actType = args.actType;
        
        function buildSelector(el: Element): string {
          const tagName = el.tagName.toLowerCase();
          
          // For links, prioritize href over data-testid (href is more unique)
          if (tagName === 'a') {
            const href = (el as HTMLElement).getAttribute('href');
            if (href) {
              return 'a[href="' + href + '"]';
            }
            // For links without href, prefer title or aria-label over data-testid
            const title = el.getAttribute('title');
            if (title) {
              return 'a[title="' + title + '"]';
            }
            const ariaLabel = el.getAttribute('aria-label');
            if (ariaLabel) {
              return 'a[aria-label="' + ariaLabel + '"]';
            }
          }
          
          // Prefer ID (most unique)
          if (el.id) {
            return '#' + el.id;
          }
          
          // Use name for inputs
          if (tagName === 'input') {
            const name = el.getAttribute('name');
            if (name) {
              return 'input[name="' + name + '"]';
            }
          }
          
          // Use title for buttons/other elements
          const title = el.getAttribute('title');
          if (title) {
            return tagName + '[title="' + title + '"]';
          }
          
          // Use aria-label
          const ariaLabel = el.getAttribute('aria-label');
          if (ariaLabel) {
            return '[aria-label="' + ariaLabel + '"]';
          }
          
          // Use data-testid as fallback (less reliable for links with shared testids)
          const testId = el.getAttribute('data-testid');
          if (testId) {
            return '[data-testid="' + testId + '"]';
          }
          
          // Use class if specific enough
          if (el.className && typeof el.className === 'string') {
            const classes = el.className.split(/\s+/);
            for (let i = 0; i < classes.length; i++) {
              const cls = classes[i];
              if (cls.length > 3 && !cls.includes('slds-')) { // Avoid generic Salesforce classes
                return '.' + cls;
              }
            }
            // Fallback to first class
            if (classes.length > 0 && classes[0].length > 0) {
              return '.' + classes[0];
            }
          }
          
          // Fallback to tag
          return tagName;
        }
        
        function calculateMatchScore(el: any, desc: string, actType: string): number {
          let score = 0;
          const lowerDesc = desc.toLowerCase();
          const tagName = el.tagName.toLowerCase();
          
          // Get element text content
          const textContent = el.textContent || '';
          const lowerText = textContent.toLowerCase().trim();
          
          // Get attributes
          const title = el.getAttribute('title') || '';
          const ariaLabel = el.getAttribute('aria-label') || '';
          const id = el.id || '';
          const name = el.getAttribute('name') || '';
          const className = el.className || '';
          const type = el.getAttribute('type') || '';
          
          // Extract specific tab/link text from description (prioritize this)
          const extractTabText = function(desc: string): string[] {
            const texts: string[] = [];
            // Match quoted strings
            const quotedMatches = desc.match(/'([^']+)'/g) || desc.match(/"([^"]+)"/g) || [];
            for (let i = 0; i < quotedMatches.length; i++) {
              const match = quotedMatches[i];
              const text = match.substring(1, match.length - 1);
              if (text.length > 0 && text.toLowerCase() !== 'tab' && text.toLowerCase() !== 'link') {
                texts.push(text);
              }
            }
            // Extract capitalized phrases
            const capitalizedPhrases = desc.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+(?:tab|link|item)\b/i) || 
                                       desc.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g) || [];
            for (let i = 0; i < capitalizedPhrases.length; i++) {
              const phrase = capitalizedPhrases[i];
              const cleaned = phrase.replace(/\s+(tab|link|item)$/i, '').trim();
              if (cleaned.length > 3 && !texts.includes(cleaned) && cleaned.toLowerCase() !== 'tab' && cleaned.toLowerCase() !== 'link' && cleaned.toLowerCase() !== 'item') {
                texts.push(cleaned);
              }
            }
            // Also extract single capitalized words (e.g., "Health" from "the Health top navigation item")
            const singleCapitalizedWords = desc.match(/\b([A-Z][a-z]{2,})\b/g) || [];
            for (let i = 0; i < singleCapitalizedWords.length; i++) {
              const word = singleCapitalizedWords[i];
              // Skip common words that aren't meaningful
              const skipWords = ['The', 'Top', 'Navigation', 'Nav', 'Item', 'Link', 'Tab', 'Button'];
              if (!skipWords.includes(word) && !texts.includes(word)) {
                texts.push(word);
              }
            }
            return texts;
          };
          
          const tabTexts = extractTabText(desc);
          
          // If we have specific tab text, prioritize exact matches
          if (tabTexts.length > 0) {
            for (let i = 0; i < tabTexts.length; i++) {
              const tabText = tabTexts[i].toLowerCase();
              // Exact title match (highest score)
              if (title.toLowerCase() === tabText) {
                score += 60;
              } else if (title.toLowerCase().includes(tabText)) {
                score += 50;
              }
              // Exact aria-label match
              if (ariaLabel.toLowerCase() === tabText) {
                score += 55;
              } else if (ariaLabel.toLowerCase().includes(tabText)) {
                score += 45;
              }
              // Exact text content match
              if (lowerText === tabText) {
                score += 55;
              } else if (lowerText.includes(tabText)) {
                score += 45;
              }
            }
          }
          
          // Extract key terms from description (but skip generic terms if we have specific tab text)
          const descWords = lowerDesc
            .replace(/\b(the|a|an|button|link|element|field|input|tab|search|submit|login)\b/g, '')
            .split(/\s+/)
            .filter(function(w: any) { 
              // Skip generic terms if we have specific tab text
              if (tabTexts.length > 0 && (w === 'tab' || w === 'link' || w === 'button')) {
                return false;
              }
              return w.length > 2; 
            });
          
          // Score by text content match
          if (lowerText.length > 0) {
            // Exact text match
            if (lowerText === lowerDesc.replace(/^(the|a|an)\s+/i, '').trim().toLowerCase()) {
              score += 50;
            }
            // Text contains description
            else if (lowerText.includes(lowerDesc.replace(/^(the|a|an)\s+/i, '').trim().toLowerCase())) {
              score += 40;
            }
            // Description contains text
            else if (lowerDesc.includes(lowerText)) {
              score += 35;
            }
            // Word overlap
            else {
              const textWords = lowerText.split(/\s+/);
              let wordMatches = 0;
              for (let i = 0; i < descWords.length; i++) {
                for (let j = 0; j < textWords.length; j++) {
                  if (textWords[j].includes(descWords[i]) || descWords[i].includes(textWords[j])) {
                    wordMatches++;
                    break;
                  }
                }
              }
              if (wordMatches > 0) {
                score += wordMatches * 10;
              }
            }
          }
          
          // Score by title attribute
          if (title.length > 0) {
            const lowerTitle = title.toLowerCase();
            if (lowerTitle === lowerDesc.replace(/^(the|a|an)\s+/i, '').trim().toLowerCase()) {
              score += 45; // Exact title match
            } else if (lowerTitle.includes(lowerDesc.replace(/^(the|a|an)\s+/i, '').trim().toLowerCase()) ||
                       lowerDesc.includes(lowerTitle)) {
              score += 35; // Partial title match
            }
          }
          
          // Score by aria-label
          if (ariaLabel.length > 0) {
            const lowerAriaLabel = ariaLabel.toLowerCase();
            if (lowerAriaLabel === lowerDesc.replace(/^(the|a|an)\s+/i, '').trim().toLowerCase()) {
              score += 40;
            } else if (lowerAriaLabel.includes(lowerDesc.replace(/^(the|a|an)\s+/i, '').trim().toLowerCase()) ||
                       lowerDesc.includes(lowerAriaLabel)) {
              score += 30;
            }
          }
          
          // Score by ID/name match
          if (id.length > 0) {
            const lowerId = id.toLowerCase();
            for (let i = 0; i < descWords.length; i++) {
              if (lowerId.includes(descWords[i])) {
                score += 25;
                break;
              }
            }
          }
          if (name.length > 0) {
            const lowerName = name.toLowerCase();
            for (let i = 0; i < descWords.length; i++) {
              if (lowerName.includes(descWords[i])) {
                score += 25;
                break;
              }
            }
          }
          
          // Score by semantic match (tag type)
          if (actType === 'click') {
            if (tagName === 'button' || tagName === 'a' || 
                el.getAttribute('role') === 'button' ||
                type === 'submit' || type === 'button') {
              score += 20;
            }
          } else if (actType === 'type') {
            if (tagName === 'input' && type !== 'submit' && type !== 'button' && type !== 'hidden') {
              score += 20;
            } else if (tagName === 'textarea') {
              score += 20;
            }
          } else if (actType === 'verify') {
            // For verify, any visible element can match
            score += 10;
          }
          
          // Score by class name match
          if (className && typeof className === 'string') {
            const lowerClass = className.toLowerCase();
            for (let i = 0; i < descWords.length; i++) {
              if (lowerClass.includes(descWords[i])) {
                score += 15;
                break;
              }
            }
          }
          
          // Bonus for visibility (elements that are likely interactable)
          if (el instanceof HTMLElement) {
            const style = window.getComputedStyle(el);
            if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
              score += 10;
            }
          }
          
          return score;
        }
        
        // Get all candidate elements based on action type
        let candidateSelectors: string[] = [];
        if (actType === 'click') {
          candidateSelectors = ['button', 'a', 'input[type="submit"]', 'input[type="button"]', '[role="button"]'];
        } else if (actType === 'type') {
          candidateSelectors = ['input:not([type="hidden"]):not([type="submit"]):not([type="button"])', 'textarea'];
        } else {
          // For verify/hover, check all interactive elements
          candidateSelectors = ['button', 'a', 'input', 'select', 'textarea', '[role="button"]', '[role="link"]', '[role="tab"]'];
        }
        
        const scoredElements: any[] = [];
        
        for (let i = 0; i < candidateSelectors.length; i++) {
          const selector = candidateSelectors[i];
          try {
            const elements = document.querySelectorAll(selector);
            for (let j = 0; j < elements.length; j++) {
              const el = elements[j];
              const score = calculateMatchScore(el, desc, actType);
              
              if (score > 0) {
                const href = (el as HTMLElement).getAttribute('href') || undefined;
                scoredElements.push({
                  selector: buildSelector(el),
                  score: score,
                  tag: el.tagName.toLowerCase(),
                  text: el.textContent ? el.textContent.trim().substring(0, 50) : undefined,
                  title: el.getAttribute('title') || undefined,
                  ariaLabel: el.getAttribute('aria-label') || undefined,
                  id: el.id || undefined,
                  name: el.getAttribute('name') || undefined,
                  className: el.className || undefined,
                  type: el.getAttribute('type') || undefined,
                  href: href
                });
              }
            }
          } catch (e) {
            // Invalid selector, skip
          }
        }
        
        // Sort by score (highest first)
        scoredElements.sort(function(a, b) {
          return b.score - a.score;
        });
        
        // Return top 5 candidates
        return scoredElements.slice(0, 5);
      }, { desc: description, actType: actionType });
      
      if (!candidates || candidates.length === 0) {
        this.logger.debug(`INTELLIGENT DOM SEARCH: No candidates found`, { testId });
        return null;
      }
      
      // Try each candidate in order of score
      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        try {
          let count = await page.locator(candidate.selector).count();
          let selectorToUse = candidate.selector;
          
          // If selector matches multiple elements, try to create a more specific selector
          if (count > 1) {
            // Extract key text from description (e.g., "Health" from "the Health top navigation item")
            const extractKeyText = (desc: string): string | null => {
              // Remove common words and extract meaningful capitalized words
              const words = desc
                .replace(/\b(the|a|an|top|navigation|nav|item|link|button|tab)\b/gi, '')
                .trim()
                .split(/\s+/)
                .filter(w => w.length > 0 && /^[A-Z]/.test(w));
              return words.length > 0 ? words[0] : null;
            };
            
            const keyText = extractKeyText(description);
            
            // Try to create a more specific selector by combining with text content or href
            const moreSpecificSelector = await page.evaluate(function(args: any) {
              const baseSelector = args.selector;
              const targetText = args.text;
              const targetHref = args.href;
              const keyText = args.keyText;
              
              try {
                const elements = document.querySelectorAll(baseSelector);
                if (elements.length === 0) return null;
                
                // Try to find the element that matches the description
                for (let i = 0; i < elements.length; i++) {
                  const el = elements[i];
                  const textContent = (el.textContent || '').trim();
                  const lowerText = textContent.toLowerCase();
                  const href = (el as HTMLElement).getAttribute('href') || '';
                  
                  // Priority 1: Match by key text from description (e.g., "Health")
                  if (keyText) {
                    const lowerKeyText = keyText.toLowerCase();
                    if (lowerText === lowerKeyText || lowerText.includes(lowerKeyText)) {
                      // For links, prefer combining with href (case-insensitive)
                      if (el.tagName.toLowerCase() === 'a' && href) {
                        const lowerHref = href.toLowerCase();
                        // Try to infer href from key text (e.g., "Health" -> "/health")
                        const inferredHref = '/' + lowerKeyText.replace(/\s+/g, '-');
                        // Use case-insensitive attribute selector (Playwright supports this)
                        if (lowerHref === inferredHref || lowerHref.includes(inferredHref.substring(1))) {
                          return baseSelector + '[href*="' + inferredHref.substring(1) + '" i]';
                        }
                        return baseSelector + '[href="' + href + '" i]';
                      }
                      // Fallback: use text content (will need Playwright text locator)
                      // But for now, if href is available, use it
                      if (href) {
                        return baseSelector + '[href="' + href + '" i]';
                      }
                    }
                  }
                  
                  // Priority 2: Match by candidate text
                  if (targetText && lowerText.includes(targetText.toLowerCase())) {
                    if (el.tagName.toLowerCase() === 'a' && href) {
                      return baseSelector + '[href="' + href + '" i]';
                    }
                  }
                  
                  // Priority 3: Match by href (case-insensitive)
                  if (targetHref && href.toLowerCase() === targetHref.toLowerCase()) {
                    return baseSelector + '[href="' + href + '" i]';
                  }
                }
                
                return null;
              } catch (e) {
                return null;
              }
            }, {
              selector: candidate.selector,
              text: candidate.text,
              href: candidate.href,
              keyText: keyText
            });
            
            if (moreSpecificSelector) {
              count = await page.locator(moreSpecificSelector).count();
              if (count === 1) {
                selectorToUse = moreSpecificSelector;
                this.logger.debug(`INTELLIGENT DOM SEARCH: Created more specific selector for multiple matches`, {
                  testId,
                  originalSelector: candidate.selector,
                  specificSelector: moreSpecificSelector,
                  keyText: keyText
                });
              } else {
                // If still multiple matches, try using Playwright text locator
                if (keyText && candidate.selector.includes('data-testid')) {
                  try {
                    const textSelector = `${candidate.selector} >> text="${keyText}"`;
                    count = await page.locator(textSelector).count();
                    if (count === 1) {
                      selectorToUse = textSelector;
                      this.logger.debug(`INTELLIGENT DOM SEARCH: Using text locator for disambiguation`, {
                        testId,
                        selector: textSelector
                      });
                    }
                  } catch (e) {
                    // Text locator failed, continue with original
                  }
                }
              }
            } else if (keyText && candidate.selector.includes('data-testid')) {
              // Fallback: try Playwright text locator directly
              try {
                const textSelector = `${candidate.selector} >> text="${keyText}"`;
                count = await page.locator(textSelector).count();
                if (count === 1) {
                  selectorToUse = textSelector;
                  this.logger.debug(`INTELLIGENT DOM SEARCH: Using text locator for disambiguation (fallback)`, {
                    testId,
                    selector: textSelector
                  });
                }
              } catch (e) {
                // Text locator failed, continue with original
              }
            }
          }
          
          if (count === 1) {
            const isVisible = await page.locator(selectorToUse).isVisible().catch(() => false);
            if (isVisible) {
              // Convert score (0-100+) to confidence (0-1)
              const confidence = Math.min(0.95, Math.max(0.5, candidate.score / 100));
              
              this.logger.info(`INTELLIGENT DOM SEARCH: Found element with score ${candidate.score}`, {
                testId,
                selector: selectorToUse,
                confidence,
                tag: candidate.tag,
                text: candidate.text,
                title: candidate.title,
                rank: i + 1
              });
              
              return {
                selector: selectorToUse,
                confidence: confidence
              };
            }
          } else if (count > 1) {
            this.logger.debug(`INTELLIGENT DOM SEARCH: Candidate matched multiple elements, trying next`, {
              testId,
              selector: candidate.selector,
              count
            });
          }
        } catch (error) {
          this.logger.debug(`INTELLIGENT DOM SEARCH: Candidate selector invalid, trying next`, {
            testId,
            selector: candidate.selector,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      
      this.logger.debug(`INTELLIGENT DOM SEARCH: No valid candidates found`, { testId });
      return null;
    } catch (error) {
      this.logger.warn(`INTELLIGENT DOM SEARCH: Failed`, {
        testId,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Try direct DOM queries for common button and input patterns
   * Fast fallback before using vision AI
   */
  private async tryDirectDOMQuery(
    page: Page,
    description: string,
    actionType: 'click' | 'type' | 'hover' | 'verify',
    testId?: string
  ): Promise<{ selector: string; confidence: number } | null> {
    const lowerDesc = description.toLowerCase();
    
    // Extract key terms from description for matching
    const extractKeyTerms = (desc: string): string[] => {
      // Remove common words and extract meaningful terms
      const words = desc.toLowerCase()
        .replace(/\b(the|a|an|button|link|element|click|submit|login|launch|app)\b/g, '')
        .split(/\s+/)
        .filter(w => w.length > 2);
      return words;
    };
    
    const keyTerms = extractKeyTerms(description);
    
    // Build patterns based on description
    const patterns: string[] = [];
    
    // Check if description mentions submit/login button
    const isSubmitButton = lowerDesc.includes('submit') || lowerDesc.includes('login');
    
    if (isSubmitButton) {
      // Common patterns for submit/login buttons
      patterns.push(
        // Input submit buttons with id/name/value containing "login"
        'input[type="submit"][id*="login" i]',
        'input[type="submit"][name*="login" i]',
        'input[type="submit"][value*="log" i]',
        'input[type="submit"][id="Login"]',
        'input[type="submit"][name="Login"]',
        'input[type="submit"][id="login"]',
        'input[type="submit"][name="login"]',
        // Generic submit buttons
        'input[type="submit"]',
        'button[type="submit"]',
        // Buttons with login-related text/ids
        'button[id*="login" i]',
        'button[name*="login" i]',
        'button[class*="login" i]',
        '[role="button"][aria-label*="login" i]',
        '[role="button"][aria-label*="log" i]'
      );
    }
    
    // Extract specific tab/link text from description (for tabs and links)
    const extractTabText = (desc: string): string[] => {
      const texts: string[] = [];
      // Match quoted strings (e.g., "the 'dana_equinox_ds' tab" or "the 'Data Model' tab")
      const quotedMatches = desc.match(/'([^']+)'/g) || desc.match(/"([^"]+)"/g) || [];
      for (let i = 0; i < quotedMatches.length; i++) {
        const match = quotedMatches[i];
        const text = match.substring(1, match.length - 1); // Remove quotes
        if (text.length > 0 && text.toLowerCase() !== 'tab' && text.toLowerCase() !== 'link') {
          texts.push(text);
        }
      }
      // Extract capitalized phrases (e.g., "Data Model tab", "Data Lake Objects tab")
      const capitalizedPhrases = desc.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+(?:tab|link|item)\b/i) || 
                                 desc.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g) || [];
      for (let i = 0; i < capitalizedPhrases.length; i++) {
        const phrase = capitalizedPhrases[i];
        // Remove "tab", "link", or "item" suffix if present
        const cleaned = phrase.replace(/\s+(tab|link|item)$/i, '').trim();
        if (cleaned.length > 3 && !texts.includes(cleaned) && cleaned.toLowerCase() !== 'tab' && cleaned.toLowerCase() !== 'link' && cleaned.toLowerCase() !== 'item') {
          texts.push(cleaned);
        }
      }
      // Also extract single capitalized words (e.g., "Health" from "the Health top navigation item")
      const singleCapitalizedWords = desc.match(/\b([A-Z][a-z]{2,})\b/g) || [];
      for (let i = 0; i < singleCapitalizedWords.length; i++) {
        const word = singleCapitalizedWords[i];
        // Skip common words that aren't meaningful
        const skipWords = ['The', 'Top', 'Navigation', 'Nav', 'Item', 'Link', 'Tab', 'Button'];
        if (!skipWords.includes(word) && !texts.includes(word)) {
          texts.push(word);
        }
      }
      return texts;
    };
    
    const tabTexts = extractTabText(description);
    
    // If we have specific tab text, prioritize it over generic patterns
    if (tabTexts.length > 0) {
      for (let i = 0; i < tabTexts.length; i++) {
        const text = tabTexts[i];
        
        // For links, try to extract or infer href from description
        // 1. Check if description mentions a URL path directly (e.g., "/health")
        const hrefMatch = description.match(/\/([a-z0-9\-]+)/i);
        if (hrefMatch) {
          const hrefPath = hrefMatch[0].toLowerCase();
          // Try exact match (case-insensitive via lowercase)
          patterns.unshift(`a[href="${hrefPath}" i]`);
          patterns.unshift(`a[href="${hrefPath}"]`);
          // Try contains match (case-insensitive)
          patterns.unshift(`a[href*="${hrefPath}" i]`);
          patterns.unshift(`a[href*="${hrefPath}"]`);
        }
        
        // 2. Convert text to potential href path (e.g., "Health" -> "/health")
        const textToHref = (txt: string): string => {
          // Convert to lowercase and handle common patterns
          return '/' + txt.toLowerCase().replace(/\s+/g, '-');
        };
        const potentialHref = textToHref(text);
        // Try exact match (case-insensitive)
        patterns.unshift(`a[href="${potentialHref}" i]`);
        patterns.unshift(`a[href="${potentialHref}"]`);
        // Try contains match (case-insensitive)
        patterns.unshift(`a[href*="${potentialHref}" i]`);
        patterns.unshift(`a[href*="${potentialHref}"]`);
        
        // 3. Also try exact match with leading slash removed (some hrefs might be relative)
        const hrefWithoutSlash = potentialHref.substring(1);
        patterns.unshift(`a[href*="${hrefWithoutSlash}" i]`);
        patterns.unshift(`a[href*="${hrefWithoutSlash}"]`);
        
        // Tabs/links with title attribute (highest priority)
        patterns.unshift(`a[title="${text}"]`);
        patterns.unshift(`a[title*="${text}" i]`);
        patterns.unshift(`[title="${text}"]`);
        patterns.unshift(`[title*="${text}" i]`);
        // Tabs specifically (common Salesforce patterns)
        patterns.unshift(`a.slds-context-bar__label-action[title="${text}"]`);
        patterns.unshift(`a.slds-context-bar__label-action[title*="${text}" i]`);
        patterns.unshift(`a[class*="context-bar"][title*="${text}" i]`);
        // Elements with aria-label
        patterns.unshift(`[aria-label="${text}"]`);
        patterns.unshift(`[aria-label*="${text}" i]`);
        // Links/tabs with text content (Playwright text locators - highest priority for disambiguation)
        patterns.unshift(`a >> text="${text}"`);
        patterns.unshift(`a:has-text("${text}")`);
        patterns.unshift(`button >> text="${text}"`);
        patterns.unshift(`button:has-text("${text}")`);
        // Elements containing the text
        patterns.unshift(`:has-text("${text}")`);
      }
    }
    
    // For any button description, try title and aria-label patterns
    // But skip generic terms like "tab", "link", "button" if we have specific tab text
    if (keyTerms.length > 0) {
      for (const term of keyTerms) {
        // Skip generic terms if we have specific tab text
        if (tabTexts.length > 0 && (term === 'tab' || term === 'link' || term === 'button')) {
          continue;
        }
        // Button with title attribute (common for icon buttons)
        patterns.push(`button[title*="${term}" i]`);
        patterns.push(`[role="button"][title*="${term}" i]`);
        // Button with aria-label
        patterns.push(`button[aria-label*="${term}" i]`);
        patterns.push(`[role="button"][aria-label*="${term}" i]`);
        // Button with aria-labelledby (less common but possible)
        patterns.push(`button[aria-labelledby*="${term}" i]`);
        // Button with id containing the term
        patterns.push(`button[id*="${term}" i]`);
        // Button with class containing the term
        patterns.push(`button[class*="${term}" i]`);
        // Button containing text (for assistive text spans)
        patterns.push(`button:has-text("${term}")`);
        patterns.push(`button:has(span:has-text("${term}"))`);
      }
      
      // Try exact title match (highest priority)
      const fullTitle = description.replace(/^(the|a|an)\s+/i, '').trim();
      if (fullTitle.length > 0 && !tabTexts.some(t => fullTitle.includes(t))) {
        patterns.unshift(`button[title="${fullTitle}"]`);
        patterns.unshift(`button[title*="${fullTitle}" i]`);
        patterns.unshift(`[role="button"][title="${fullTitle}"]`);
        patterns.unshift(`[role="button"][title*="${fullTitle}" i]`);
      }
    }
    
    // Generic button patterns (lower priority - only if no specific tab text found)
    if (lowerDesc.includes('button') && tabTexts.length === 0) {
      patterns.push('button:visible');
      patterns.push('[role="button"]:visible');
    }
    
    // Generic tab/link patterns (lower priority - only if no specific tab text found)
    if ((lowerDesc.includes('tab') || lowerDesc.includes('link')) && tabTexts.length === 0) {
      patterns.push('a.slds-context-bar__label-action:visible');
      patterns.push('a[class*="context-bar"]:visible');
      patterns.push('a[class*="tab"]:visible');
      patterns.push('[role="tab"]:visible');
      patterns.push('a:visible');
    }
    
    // For TYPE actions, add input field patterns
    if (actionType === 'type') {
      // Check if description mentions search
      const isSearchField = lowerDesc.includes('search');
      
      if (isSearchField) {
        // Search input patterns
        patterns.unshift('input[type="search"]:visible'); // Higher priority
        patterns.unshift('input[role="combobox"]:visible'); // Higher priority
        // Search by placeholder
        for (const term of keyTerms) {
          if (term !== 'field' && term !== 'search') {
            patterns.unshift(`input[placeholder*="${term}" i]`);
            patterns.unshift(`input[type="search"][placeholder*="${term}" i]`);
          }
        }
        // Common search placeholder patterns
        patterns.unshift('input[placeholder*="search" i]');
        patterns.unshift('input[placeholder*="Search" i]');
        patterns.push('input[type="search"]');
        patterns.push('input[role="combobox"]');
      }
      
      // Generic input patterns for any input description
      if (keyTerms.length > 0) {
        for (const term of keyTerms) {
          if (term !== 'field' && term !== 'input') {
            // Input with placeholder containing term
            patterns.push(`input[placeholder*="${term}" i]`);
            // Input with aria-label containing term
            patterns.push(`input[aria-label*="${term}" i]`);
            // Input with id containing term
            patterns.push(`input[id*="${term}" i]`);
            // Input with name containing term
            patterns.push(`input[name*="${term}" i]`);
            // Input with class containing term
            patterns.push(`input[class*="${term}" i]`);
          }
        }
      }
      
      // Generic input patterns (lower priority)
      if (lowerDesc.includes('input') || lowerDesc.includes('field')) {
        patterns.push('input[type="text"]:visible');
        patterns.push('input[type="search"]:visible');
        patterns.push('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):visible');
        patterns.push('textarea:visible');
      }
    }
    
    // For VERIFY actions, add patterns for finding elements by text content and title
    if (actionType === 'verify') {
      // Extract text content from description (e.g., "Data Model", "Data Lake Objects")
      // Look for quoted strings or capitalized phrases
      const quotedTexts: string[] = [];
      // Match single or double quoted strings
      const quoteMatches = description.match(/'([^']+)'/g) || description.match(/"([^"]+)"/g) || [];
      for (let i = 0; i < quoteMatches.length; i++) {
        const match = quoteMatches[i];
        const text = match.substring(1, match.length - 1); // Remove quotes
        if (text.length > 0) {
          quotedTexts.push(text);
        }
      }
      
      // Also extract capitalized phrases (e.g., "Data Model", "Data Lake Objects")
      const capitalizedPhrases = description.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g) || [];
      for (let i = 0; i < capitalizedPhrases.length; i++) {
        const phrase = capitalizedPhrases[i];
        if (phrase.length > 3 && !quotedTexts.includes(phrase)) {
          quotedTexts.push(phrase);
        }
      }
      
      // Add patterns for each text content
      for (let i = 0; i < quotedTexts.length; i++) {
        const text = quotedTexts[i];
        // Links/tabs with title attribute (highest priority for tabs)
        patterns.unshift(`a[title="${text}"]`);
        patterns.unshift(`a[title*="${text}" i]`);
        patterns.unshift(`[title="${text}"]`);
        patterns.unshift(`[title*="${text}" i]`);
        // Tabs specifically (common Salesforce patterns)
        patterns.unshift(`a.slds-context-bar__label-action[title="${text}"]`);
        patterns.unshift(`a.slds-context-bar__label-action[title*="${text}" i]`);
        patterns.unshift(`a[class*="context-bar"][title*="${text}" i]`);
        // Elements with aria-label
        patterns.unshift(`[aria-label="${text}"]`);
        patterns.unshift(`[aria-label*="${text}" i]`);
        // Links/tabs with text content (using Playwright text locator)
        patterns.push(`a:has-text("${text}")`);
        patterns.push(`a >> text="${text}"`);
        // Elements containing the text
        patterns.push(`:has-text("${text}")`);
      }
      
      // Generic tab/link patterns
      if (lowerDesc.includes('tab')) {
        patterns.push('a.slds-context-bar__label-action:visible');
        patterns.push('a[class*="context-bar"]:visible');
        patterns.push('a[class*="tab"]:visible');
        patterns.push('[role="tab"]:visible');
      }
      
      // Generic link patterns
      if (lowerDesc.includes('link')) {
        patterns.push('a:visible');
      }
    }

    for (const pattern of patterns) {
      try {
        const count = await page.locator(pattern).count();
        if (count === 1) {
          const isVisible = await page.locator(pattern).isVisible().catch(() => false);
          if (isVisible) {
            // Higher confidence for more specific patterns
            let confidence = 0.6; // Default
            if (pattern.includes('title=') && pattern.includes('"')) {
              confidence = 0.9; // Exact title match
            } else if (pattern.includes('placeholder*=') && pattern.includes('input')) {
              confidence = 0.85; // Placeholder match for inputs (high confidence)
            } else if (pattern.includes('aria-label=') || pattern.includes('title*=')) {
              confidence = 0.8; // Attribute match
            } else if (pattern.includes('id=') || pattern.includes('name=')) {
              confidence = 0.8; // ID/name match
            } else if (pattern.includes('role=') && (pattern.includes('combobox') || pattern.includes('button'))) {
              confidence = 0.75; // Role match
            } else if (pattern.includes('type=') && (pattern.includes('search') || pattern.includes('text'))) {
              confidence = 0.7; // Type match
            } else if (pattern.includes('class*=')) {
              confidence = 0.7; // Class match
            }
            
            this.logger.debug(`Direct DOM query found element: ${pattern}`, { testId, confidence });
            return { selector: pattern, confidence };
          }
        } else if (count > 1) {
          // Multiple matches - try to find the most specific one
          this.logger.debug(`Pattern matched multiple elements: ${pattern} (${count})`, { testId });
        }
      } catch (error) {
        // Invalid selector, continue to next pattern
        continue;
      }
    }

    return null;
  }

  /**
   * Validate that a selector points to an actual input field
   */
  private async validateInputField(
    page: Page,
    selector: string
  ): Promise<{ tag: string; type?: string; attributes: Record<string, string> } | null> {
    try {
      const elementInfo = await page.evaluate(function(sel: string) {
        const element = document.querySelector(sel);
        if (!element) return null;
        
        const tagName = element.tagName.toLowerCase();
        if (tagName !== 'input' && tagName !== 'textarea') {
          return null;
        }
        
        const attrs: any = {};
        const inputElement = element as HTMLInputElement;
        
        // Extract relevant attributes
        const attrsToExtract = ['type', 'name', 'id', 'placeholder', 'aria-label'];
        for (let i = 0; i < attrsToExtract.length; i++) {
          const attr = attrsToExtract[i];
          const value = inputElement.getAttribute(attr);
          if (value) attrs[attr] = value;
        }
        
        return {
          tag: tagName,
          type: inputElement.type || undefined,
          attributes: attrs
        };
      }, selector);
      
      return elementInfo;
    } catch (error) {
      return null;
    }
  }

  /**
   * Find input field by context when discovery found a non-input element
   * This intelligently searches for input fields near or related to the discovered element
   */
  private async findInputFieldByContext(
    page: Page,
    description: string,
    discovery: { selector: string; strategy: string; alternatives: string[] }
  ): Promise<{ selector: string; confidence: number; elementInfo: any } | null> {
    try {
      // Try alternatives from discovery
      for (const altSelector of discovery.alternatives) {
        const isValid = await this.validateInputField(page, altSelector);
        if (isValid) {
          const count = await page.locator(altSelector).count();
          if (count === 1) {
            return {
              selector: altSelector,
              confidence: 0.8,
              elementInfo: isValid
            };
          }
        }
      }

      // Try to find input fields near the discovered element
      const nearbyInputs = await page.evaluate(function(sel: string) {
        const element = document.querySelector(sel);
        if (!element) return [];
        
        const inputs: any[] = [];
        const allInputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea');
        
        for (let i = 0; i < allInputs.length; i++) {
          const input = allInputs[i];
          const inputRect = input.getBoundingClientRect();
          const elementRect = element.getBoundingClientRect();
          
          // Calculate distance between centers
          const inputCenter = {
            x: inputRect.left + inputRect.width / 2,
            y: inputRect.top + inputRect.height / 2
          };
          const elementCenter = {
            x: elementRect.left + elementRect.width / 2,
            y: elementRect.top + elementRect.height / 2
          };
          
          const distance = Math.sqrt(
            Math.pow(inputCenter.x - elementCenter.x, 2) +
            Math.pow(inputCenter.y - elementCenter.y, 2)
          );
          
          // Build selector
          let selector = '';
          if (input.id) {
            selector = '#' + input.id;
          } else if (input.getAttribute('name')) {
            selector = 'input[name="' + input.getAttribute('name') + '"]';
          } else if (input.getAttribute('placeholder')) {
            selector = 'input[placeholder="' + input.getAttribute('placeholder') + '"]';
          } else {
            selector = input.tagName.toLowerCase();
          }
          
          inputs.push({ selector: selector, distance: distance });
        }
        
        inputs.sort(function(a: any, b: any) {
          return a.distance - b.distance;
        });
        
        return inputs.slice(0, 3);
      }, discovery.selector);

      // Try the closest input fields
      for (const { selector: inputSelector } of nearbyInputs) {
        const isValid = await this.validateInputField(page, inputSelector);
        if (isValid) {
          const count = await page.locator(inputSelector).count();
          if (count === 1) {
            return {
              selector: inputSelector,
              confidence: 0.7,
              elementInfo: isValid
            };
          }
        }
      }
    } catch (error) {
      this.logger.debug('Context-based input field search failed', { error });
    }
    
    return null;
  }

  /**
   * Extract selector from an element at given coordinates
   * Useful after vision AI finds an element
   */
  async extractSelectorFromCoordinates(
    page: Page,
    coordinates: { x: number; y: number }
  ): Promise<string | null> {
    try {
      // Get element at coordinates and extract selector in one call
      const selector = await page.evaluate(function(coords: any): string | null {
        const element = document.elementFromPoint(coords.x, coords.y);
        if (!element) return null;
        
        // Prefer data-testid
        const testId = element.getAttribute('data-testid');
        if (testId) {
          return '[data-testid="' + testId + '"]';
        }
        
        // Prefer ID
        if (element.id) {
          return '#' + element.id;
        }
        
        // Use class if unique
        if (element.className && typeof element.className === 'string') {
          const classList = element.className.split(/\s+/);
          const classes: any[] = [];
          for (let i = 0; i < classList.length; i++) {
            const c = classList[i];
            if (c.length > 0) {
              classes.push(c);
            }
          }
          if (classes.length > 0) {
            return '.' + classes[0];
          }
        }
        
        // Fall back to tag name
        return element.tagName.toLowerCase();
      }, coordinates);
      
      if (!selector) {
        return null;
      }

      // Validate selector is unique
      const count = await page.locator(selector).count();
      if (count === 1) {
        this.logger.info(`Extracted selector from coordinates: ${selector}`);
        return selector;
      }

      return null;
    } catch (error) {
      this.logger.warn('Failed to extract selector from coordinates', { error });
      return null;
    }
  }
}

