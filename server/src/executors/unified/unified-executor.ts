import { Page, Browser, chromium, BrowserContext } from 'playwright';
import OpenAI from 'openai';
import { IExecutor } from '../index.js';
import { IAction, IExecutionResult, ISnapshot } from '../../types/index.js';
import { ILogger } from '../../infra/logger.js';
import { IConfig } from '../../infra/config.js';
import { PromptManager } from '../../infra/prompt-manager.js';
import { SmartElementLocator } from '../../element-discovery/smart-element-locator.js';
import { IElementDiscoveryService } from '../../element-discovery/index.js';
import { ConfidenceThresholdService } from '../../infra/confidence-threshold-service.js';
import {
  ACTIONS,
  VERIFICATION_TARGETS,
  VERIFICATION_OPERATIONS,
  EXECUTION_STATUS,
  SELECTORS,
  METHOD_MAPPINGS,
  SUPPORTED_VERIFICATION_TARGETS,
  SUPPORTED_VERIFICATION_OPERATIONS,
  ERROR_MESSAGES,
} from '../../constants/index.js';

/**
 * Unified Executor
 * Combines DOM and Vision approaches intelligently
 * Tries DOM first, falls back to vision automatically
 */
export class UnifiedExecutor implements IExecutor {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private client: OpenAI;
  private model: string;
  private promptManager: PromptManager;
  private smartLocator: SmartElementLocator;
  private recursionDepth: number = 0; // Track recursion to prevent infinite loops
  private readonly MAX_RECURSION_DEPTH = 2; // Max DOM↔Vision cycles

  constructor(
    private config: IConfig,
    private logger: ILogger,
    elementDiscovery: IElementDiscoveryService,
    private confidenceThresholdService: ConfidenceThresholdService
  ) {
    const apiKey = config.get('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not defined for UnifiedExecutor');
    }
    this.client = new OpenAI({ apiKey });
    this.model = config.get('OPENAI_VISION_MODEL') || 'gpt-4o';
    this.promptManager = PromptManager.getInstance();
    this.smartLocator = new SmartElementLocator(elementDiscovery, logger, confidenceThresholdService);
  }

  async initialize(): Promise<void> {
    if (this.browser) return;
    
    this.logger.info('Initializing Unified Executor...');
    const headlessSetting = this.config.get('HEADLESS');
    const isHeadless = headlessSetting === 'true';
    this.browser = await chromium.launch({
      headless: isHeadless,
    });
  }

  private async ensureSession(): Promise<void> {
    await this.initialize();
    if (!this.context) {
      this.logger.debug('Creating new isolated browser context...');
      this.context = await this.browser!.newContext();
      this.page = await this.context.newPage();
      await this.page.setViewportSize({ width: 1280, height: 800 });
    }
  }

  async execute(action: IAction): Promise<IExecutionResult> {
    await this.ensureSession();
    if (!this.page) throw new Error('Browser page not initialized');

    this.logger.info(`Unified Execution: ${action.name}`, action.arguments);

    try {
      // Handle verification actions (use DOM)
      if (action.name.startsWith(ACTIONS.VERIFY_PREFIX)) {
        return await this.handleVerification(action);
      }

      // Handle navigation
      if (action.name === ACTIONS.NAVIGATE) {
        return await this.handleNavigate(action.arguments);
      }

      // Handle wait
      if (action.name === ACTIONS.WAIT) {
        return await this.handleWait(action.arguments);
      }

      // Handle interaction actions (click, type, hover) with smart location
      const description = (action.arguments.description as string) || '';
      const selector = (action.arguments.selector as string) || '';

      // Use smart locator to find element (intelligent, multi-strategy)
      const location = await this.smartLocator.locateElement(
        this.page,
        description || selector || action.name,
        action.name as 'click' | 'type' | 'hover',
        selector,
        (action as any).testId
      );

      if (location.method === 'dom' && location.selector) {
        // Execute via DOM
        return await this.executeViaDOM(action, location.selector);
      } else {
        // Execute via Vision
        return await this.executeViaVision(action, description || selector);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Unified Execution failed: ${errorMessage}`, { action });

      return {
        stepId: (action as any).stepId || 'unknown',
        selector: undefined, // No selector available on error
        status: EXECUTION_STATUS.FAILURE,
        error: errorMessage,
        snapshot: await this.getSnapshot(),
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Execute action via DOM selector
   */
  private async executeViaDOM(action: IAction, selector: string): Promise<IExecutionResult> {
    this.logger.debug(`Executing via DOM: ${action.name}`, { selector });

    try {
      switch (action.name) {
        case ACTIONS.CLICK:
          await this.page!.locator(selector).click();
          break;
        case ACTIONS.TYPE:
          const value = action.arguments.value as string;
          if (!value) throw new Error('Missing value for TYPE action');
          // Focus the input first, then clear and type
          await this.page!.locator(selector).focus();
          await this.page!.waitForTimeout(100);
          await this.page!.locator(selector).fill(value);
          // Wait a bit and verify the value was actually set
          await this.page!.waitForTimeout(300);
          try {
            const actualValue = await this.page!.locator(selector).inputValue();
            if (actualValue !== value) {
              this.logger.warn(`TYPE action (DOM): Value mismatch. Expected: "${value}", Got: "${actualValue}"`, {
                testId: (action as any).testId,
                selector,
                expected: value,
                actual: actualValue
              });
            } else {
              this.logger.info(`TYPE action (DOM): Value verified in DOM`, {
                testId: (action as any).testId,
                selector,
                value: actualValue
              });
            }
          } catch (error) {
            this.logger.warn(`Could not verify typed value in DOM`, {
              testId: (action as any).testId,
              selector,
              error: error instanceof Error ? error.message : String(error)
            });
          }
          break;
        case ACTIONS.HOVER:
          await this.page!.locator(selector).hover();
          break;
        default:
          throw new Error(ERROR_MESSAGES.UNSUPPORTED_ACTION(action.name));
      }

      // Reset recursion depth on success
      this.recursionDepth = 0;

      return {
        stepId: (action as any).stepId || 'unknown',
        selector: selector, // Store the selector that was used
        status: EXECUTION_STATUS.SUCCESS,
        snapshot: await this.getSnapshot(),
        timestamp: Date.now(),
      };
    } catch (error) {
      // Check recursion depth before fallback
      if (this.recursionDepth >= this.MAX_RECURSION_DEPTH) {
        this.logger.error(`Max recursion depth reached (${this.MAX_RECURSION_DEPTH}), stopping retries`, {
          testId: (action as any).testId,
          selector,
          recursionDepth: this.recursionDepth
        });
        throw new Error(`Element discovery failed after ${this.MAX_RECURSION_DEPTH} retry cycles: ${error instanceof Error ? error.message : String(error)}`);
      }

      // DOM failed, try vision as fallback
      this.recursionDepth++;
      this.logger.warn(`DOM execution failed, trying vision fallback (depth ${this.recursionDepth}/${this.MAX_RECURSION_DEPTH})`, {
        error: error instanceof Error ? error.name : 'Unknown',
        selector
      });
      const description = (action.arguments.description as string) || selector;
      return await this.executeViaVision(action, description);
    }
  }

  /**
   * Execute action via intelligent element discovery (fallback when direct DOM selector fails)
   * Named executeViaVision for historical reasons, but now uses DOM-based discovery
   * instead of screenshot-based Vision AI for better performance and reliability.
   * Screenshots are still captured in snapshots for user presentation.
   *
   * Includes retry logic with recursion depth tracking to prevent infinite loops.
   */
  private async executeViaVision(action: IAction, description: string): Promise<IExecutionResult> {
    this.logger.debug(`Executing via DOM-based discovery: ${action.name}`, { description, testId: (action as any).testId });

    try {
      // Wait for page to stabilize, especially for forms
      await this.page!.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {});
      await this.page!.waitForTimeout(300);

      // Use DOM-based element discovery instead of screenshot-based Vision AI
      let location = await this.smartLocator.locateElement(
        this.page!,
        description,
        action.name as 'click' | 'type' | 'hover',
        undefined,
        (action as any).testId
      );

      let retryCount = 0;
      const maxRetries = 3;
      
      // Get confidence threshold from configuration service
      const actionType = action.name === ACTIONS.CLICK ? 'click' : 
                         action.name === ACTIONS.TYPE ? 'type' : 
                         action.name === ACTIONS.HOVER ? 'hover' : 'verify';
      const clickMinConfidence = await this.confidenceThresholdService.getThreshold(actionType);

      // Retry logic for better element discovery
      while (retryCount < maxRetries && (!location.selector || location.method !== 'dom' || location.confidence < clickMinConfidence)) {
        this.logger.debug(`DOM discovery retry ${retryCount + 1}/${maxRetries}`, {
          testId: (action as any).testId,
          method: location.method,
          selector: location.selector,
          confidence: location.confidence,
          minConfidenceThreshold: clickMinConfidence,
          actionName: action.name
        });

        // Wait before retry (longer wait for later retries)
        await this.page!.waitForTimeout(500 * (retryCount + 1));
        
        // Try discovery again
        location = await this.smartLocator.locateElement(
          this.page!,
          description,
          action.name as 'click' | 'type' | 'hover',
          undefined,
          (action as any).testId
        );

        if (location.method === 'dom' && location.selector && location.confidence >= clickMinConfidence) {
          break; // Found good selector
        }

        retryCount++;
      }

      // If we found a DOM selector, use DOM execution
      if (location.method === 'dom' && location.selector && location.confidence >= clickMinConfidence) {
        this.logger.info(`DOM-based discovery found selector, using DOM execution`, {
          testId: (action as any).testId,
          selector: location.selector,
          confidence: location.confidence,
          method: 'DOM-based discovery (formerly Vision AI fallback)'
        });

        // Check recursion depth before calling back to DOM to prevent infinite loops
        // (executeViaDOM can fail and call back to executeViaVision, creating a cycle)
        if (this.recursionDepth >= this.MAX_RECURSION_DEPTH) {
          this.logger.error(`Max recursion depth reached (${this.MAX_RECURSION_DEPTH}), stopping retries`, {
            testId: (action as any).testId,
            selector: location.selector,
            recursionDepth: this.recursionDepth
          });
          throw new Error(`Element discovery failed after ${this.MAX_RECURSION_DEPTH} retry cycles. Last attempted selector: ${location.selector}`);
        }

        // Execute via DOM (may recurse back to executeViaVision if it fails)
        const result = await this.executeViaDOM(action, location.selector);
        
        // Ensure screenshot is in snapshot for user presentation (getSnapshot already does this, but double-check)
        if (result.snapshot && !result.snapshot.metadata.screenshot_base64) {
          const postScreenshot = await this.page!.screenshot({ type: 'jpeg', quality: 80 });
          result.snapshot.metadata.screenshot_base64 = postScreenshot.toString('base64');
        }
        
        return result;
      }

      // Fallback: If DOM discovery failed, try DOM heuristics for TYPE actions
      if (action.name === ACTIONS.TYPE) {
        this.logger.warn(`DOM-based discovery failed, attempting DOM heuristics fallback`, {
          testId: (action as any).testId,
          description
        });

        // Check if SmartElementLocator has locateInputByHeuristics method
        const smartLocatorAny = this.smartLocator as any;
        if (smartLocatorAny.locateInputByHeuristics) {
          const domInputLocation = await smartLocatorAny.locateInputByHeuristics(
            this.page!,
            description,
            undefined,
            (action as any).testId
          );

          if (domInputLocation && domInputLocation.selector) {
            this.logger.info(`Found input via DOM heuristics fallback`, {
              testId: (action as any).testId,
              selector: domInputLocation.selector
            });
            const result = await this.executeViaDOM(action, domInputLocation.selector);
            
            // Ensure screenshot is in snapshot
            if (result.snapshot && !result.snapshot.metadata.screenshot_base64) {
              const postScreenshot = await this.page!.screenshot({ type: 'jpeg', quality: 80 });
              result.snapshot.metadata.screenshot_base64 = postScreenshot.toString('base64');
            }
            
            return result;
          }
        }
      }

      // If all DOM-based methods failed, throw error with detailed info
      throw new Error(`Could not find element "${description}" using DOM-based discovery methods. Tried ${retryCount + 1} times with confidence threshold ${clickMinConfidence}. Last attempt: method=${location.method}, selector=${location.selector || 'none'}, confidence=${location.confidence || 'none'}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`DOM-based discovery execution failed: ${errorMessage}`, {
        testId: (action as any).testId,
        description,
        action: action.name
      });
      
      // Capture screenshot even on failure for user presentation
      const snapshot = await this.getSnapshot();
      
      return {
        stepId: (action as any).stepId || 'unknown',
        status: EXECUTION_STATUS.FAILURE,
        error: errorMessage,
        snapshot,
        timestamp: Date.now(),
      };
    }
  }


  private async handleNavigate(args: Record<string, unknown>): Promise<IExecutionResult> {
    const url = args.url as string;
    if (!url) throw new Error('Missing URL for navigate action');
    // Use 'load' instead of 'networkidle' to avoid timeouts on pages with continuous network activity
    // 'load' waits for the page load event (all resources loaded) without waiting for network idle
    await this.page!.goto(url, { waitUntil: 'load', timeout: 30000 });
    return {
      stepId: (args as any).stepId || 'unknown',
      selector: undefined, // Navigation doesn't use a selector
      status: EXECUTION_STATUS.SUCCESS,
      snapshot: await this.getSnapshot(),
      timestamp: Date.now(),
    };
  }

  private async handleWait(args: Record<string, unknown>): Promise<IExecutionResult> {
    const selector = args.selector as string;
    const timeoutValue = args.timeout || args.duration || 5000;
    const timeout = typeof timeoutValue === 'string' ? parseInt(timeoutValue, 10) : Number(timeoutValue);
    
    if (selector) {
      await this.page!.waitForSelector(selector, { state: 'visible', timeout });
    } else {
      await this.page!.waitForTimeout(timeout);
    }
    
    return {
      stepId: (args as any).stepId || 'unknown',
      selector: selector || undefined, // Include selector if provided
      status: EXECUTION_STATUS.SUCCESS,
      snapshot: await this.getSnapshot(),
      timestamp: Date.now(),
    };
  }

  private async handleVerification(action: IAction): Promise<IExecutionResult> {
    const actionName = action.name;
    const args = action.arguments;

    try {
      // Parse action name: verify_<target>_<operation>
      if (!actionName.startsWith(ACTIONS.VERIFY_PREFIX)) {
        return {
          stepId: (action as any).stepId || 'unknown',
          status: EXECUTION_STATUS.FAILURE,
          error: ERROR_MESSAGES.INVALID_VERIFICATION_ACTION(actionName),
          snapshot: await this.getSnapshot(),
          timestamp: Date.now(),
        };
      }

      const parts = actionName.replace(ACTIONS.VERIFY_PREFIX, '').split('_');
      
      if (parts.length < 2) {
        const target = parts[0];
        const supportedTargets = SUPPORTED_VERIFICATION_TARGETS.join(', ');
        const supportedOps = SUPPORTED_VERIFICATION_OPERATIONS.join(', ');
        
        return {
          stepId: (action as any).stepId || 'unknown',
          status: EXECUTION_STATUS.FAILURE,
          error: ERROR_MESSAGES.MISSING_OPERATION(actionName, target, supportedTargets, supportedOps),
          snapshot: await this.getSnapshot(),
          timestamp: Date.now(),
        };
      }

      const operation = parts[parts.length - 1];
      const target = parts.slice(0, -1).join('_');
      
      const cleanOperation = operation.startsWith('not_') ? operation.replace('not_', '') : operation;
      if (!SUPPORTED_VERIFICATION_OPERATIONS.some((op: string) => op === operation || op === cleanOperation)) {
        const supportedOps = SUPPORTED_VERIFICATION_OPERATIONS.join(', ');
        return {
          stepId: (action as any).stepId || 'unknown',
          status: EXECUTION_STATUS.FAILURE,
          error: ERROR_MESSAGES.UNSUPPORTED_OPERATION(operation, actionName, target, supportedOps),
          snapshot: await this.getSnapshot(),
          timestamp: Date.now(),
        };
      }
      
      if (!SUPPORTED_VERIFICATION_TARGETS.some((t: string) => t === target)) {
        this.logger.debug(`Using unsupported target "${target}" - will attempt to resolve as selector`);
      }

      // Handle visibility checks
      if (cleanOperation === VERIFICATION_OPERATIONS.VISIBLE) {
        const selector = args.selector as string;
        const description = args.description as string || '';
        
        // Check if description mentions multiple elements (e.g., "presence of 'X' and 'Y'")
        const multipleElementsMatch = description.match(/presence of ['"]([^'"]+)['"]\s+and\s+['"]([^'"]+)['"]/i) ||
                                      description.match(/['"]([^'"]+)['"]\s+and\s+['"]([^'"]+)['"]/i);
        
        if (multipleElementsMatch) {
          // Handle multiple element verification
          const element1Name = multipleElementsMatch[1];
          const element2Name = multipleElementsMatch[2];
          
          this.logger.info(`MULTIPLE ELEMENT VERIFICATION: Checking presence of "${element1Name}" and "${element2Name}"`, {
            testId: (action as any).testId,
            description
          });
          
          // Find both elements using intelligent DOM search
          const location1 = await this.smartLocator.locateElement(
            this.page!,
            element1Name,
            'verify',
            undefined,
            (action as any).testId
          );
          
          const location2 = await this.smartLocator.locateElement(
            this.page!,
            element2Name,
            'verify',
            undefined,
            (action as any).testId
          );
          
          const missingElements: string[] = [];
          const foundElements: Array<{ name: string; selector: string }> = [];
          
          if (location1.method === 'dom' && location1.selector) {
            const count1 = await this.page!.locator(location1.selector).count();
            const isVisible1 = count1 > 0 && await this.page!.locator(location1.selector).first().isVisible().catch(() => false);
            if (isVisible1) {
              foundElements.push({ name: element1Name, selector: location1.selector });
            } else {
              missingElements.push(element1Name);
            }
          } else {
            missingElements.push(element1Name);
          }
          
          if (location2.method === 'dom' && location2.selector) {
            const count2 = await this.page!.locator(location2.selector).count();
            const isVisible2 = count2 > 0 && await this.page!.locator(location2.selector).first().isVisible().catch(() => false);
            if (isVisible2) {
              foundElements.push({ name: element2Name, selector: location2.selector });
            } else {
              missingElements.push(element2Name);
            }
          } else {
            missingElements.push(element2Name);
          }
          
          if (missingElements.length > 0) {
            return {
              stepId: (action as any).stepId || 'unknown',
              selector: undefined, // Multiple elements, no single selector
              status: EXECUTION_STATUS.FAILURE,
              error: `Elements not found in DOM: ${missingElements.join(', ')}. Found: ${foundElements.map(e => e.name).join(', ')}`,
              snapshot: await this.getSnapshot(),
              timestamp: Date.now(),
            };
          }
          
          // Both elements found and visible
          this.logger.info(`MULTIPLE ELEMENT VERIFICATION: Both elements found and visible`, {
            testId: (action as any).testId,
            foundElements: foundElements.map(e => ({ name: e.name, selector: e.selector }))
          });
          
          return {
            stepId: (action as any).stepId || 'unknown',
            selector: undefined, // Multiple elements verified, no single selector
            status: EXECUTION_STATUS.SUCCESS,
            snapshot: await this.getSnapshot(),
            timestamp: Date.now(),
          };
        }
        
        // Single element verification (existing logic)
        let elementSelector: string | undefined = selector;
        
        if (!elementSelector) {
          if (target === VERIFICATION_TARGETS.HEADING) {
            elementSelector = SELECTORS.ALL_HEADINGS;
          } else if (target === VERIFICATION_TARGETS.HEADING1 || target === VERIFICATION_TARGETS.H1) {
            elementSelector = SELECTORS.H1;
          } else if (target === VERIFICATION_TARGETS.HEADING2 || target === VERIFICATION_TARGETS.H2) {
            elementSelector = SELECTORS.H2;
          } else if (target === VERIFICATION_TARGETS.HEADING3 || target === VERIFICATION_TARGETS.H3) {
            elementSelector = SELECTORS.H3;
          } else if (target === VERIFICATION_TARGETS.HEADING4 || target === VERIFICATION_TARGETS.H4) {
            elementSelector = SELECTORS.H4;
          } else if (target === VERIFICATION_TARGETS.HEADING5 || target === VERIFICATION_TARGETS.H5) {
            elementSelector = SELECTORS.H5;
          } else if (target === VERIFICATION_TARGETS.HEADING6 || target === VERIFICATION_TARGETS.H6) {
            elementSelector = SELECTORS.H6;
          } else if (target === VERIFICATION_TARGETS.ELEMENT) {
            elementSelector = undefined;
          } else {
            elementSelector = target;
          }
        }
        
        if (!elementSelector) {
          return {
            stepId: (action as any).stepId || 'unknown',
            selector: undefined,
            status: EXECUTION_STATUS.FAILURE,
            error: ERROR_MESSAGES.VISIBLE_REQUIRES_SELECTOR,
            snapshot: await this.getSnapshot(),
            timestamp: Date.now(),
          };
        }
        
        // Check if this is a semantic/visual concept selector
        const isSemanticSelector = elementSelector.startsWith('[data-visual-concept=') || 
                                   elementSelector.startsWith('[data-vision-');
        
        if (isSemanticSelector) {
          // Use Vision AI to verify visual concepts
          return await this.verifyVisualConceptVisibility(
            action,
            elementSelector,
            target,
            operation
          );
        }
        
        try {
          const elements = this.page!.locator(elementSelector);
          const count = await elements.count();
          
          if (count === 0) {
            // If DOM selector fails, try element discovery to find by description/text
            const description = args.description as string || target;
            
            // Try element discovery to find the element by description
            try {
              this.logger.info(`DOM selector failed, trying element discovery for verification`, {
                selector: elementSelector,
                description,
                testId: (action as any).testId
              });
              
              const location = await this.smartLocator.locateElement(
                this.page!,
                description,
                'verify',
                undefined,
                (action as any).testId
              );
              
              if (location.method === 'dom' && location.selector) {
                // Found via discovery, use the discovered selector
                this.logger.info(`Element found via discovery for verification: ${location.selector}`, {
                  testId: (action as any).testId,
                  originalSelector: elementSelector,
                  discoveredSelector: location.selector
                });
                elementSelector = location.selector;
                
                // Retry with discovered selector
                const discoveredElements = this.page!.locator(elementSelector);
                const discoveredCount = await discoveredElements.count();
                
                if (discoveredCount === 0) {
                  throw new Error(`Discovered selector also found no elements: ${elementSelector}`);
                }
                if (discoveredCount > 1) {
                  return {
                    stepId: (action as any).stepId || 'unknown',
                    selector: elementSelector,
                    status: EXECUTION_STATUS.FAILURE,
                    error: ERROR_MESSAGES.AMBIGUOUS_SELECTOR(elementSelector, discoveredCount),
                    snapshot: await this.getSnapshot(),
                    timestamp: Date.now(),
                  };
                }
                
                // Use discovered element for verification
                const isVisible = await discoveredElements.isVisible();
                const isNegated = operation.startsWith('not_');
                const finalResult = isNegated ? !isVisible : isVisible;
                
                if (!finalResult) {
                  return {
                    stepId: (action as any).stepId || 'unknown',
                    selector: elementSelector,
                    status: EXECUTION_STATUS.FAILURE,
                    error: `Element "${elementSelector}" is ${isNegated ? '' : 'not '}visible`,
                    snapshot: await this.getSnapshot(),
                    timestamp: Date.now(),
                  };
                }
                
                return {
                  stepId: (action as any).stepId || 'unknown',
                  selector: elementSelector,
                  status: EXECUTION_STATUS.SUCCESS,
                  snapshot: await this.getSnapshot(),
                  timestamp: Date.now(),
                };
              }
            } catch (discoveryError) {
              this.logger.warn(`Element discovery failed for verification`, {
                testId: (action as any).testId,
                selector: elementSelector,
                description,
                error: discoveryError instanceof Error ? discoveryError.message : String(discoveryError)
              });
            }
            
            // If element discovery also failed, try Vision AI as fallback for semantic concepts
            const semanticConcepts = ['form', 'login form', 'signup form', 'modal', 'dialog', 'menu'];
            const isSemanticConcept = semanticConcepts.some(concept => 
              description.toLowerCase().includes(concept)
            );
            
            if (isSemanticConcept) {
              this.logger.info(`DOM selector failed for semantic concept, using Vision AI fallback`, {
                selector: elementSelector,
                description
              });
              return await this.verifyVisualConceptVisibility(
                action,
                elementSelector,
                target,
                operation
              );
            }
            
            return {
              stepId: (action as any).stepId || 'unknown',
              selector: elementSelector,
              status: EXECUTION_STATUS.FAILURE,
              error: ERROR_MESSAGES.ELEMENT_NOT_FOUND(elementSelector),
              snapshot: await this.getSnapshot(),
              timestamp: Date.now(),
            };
          }
          if (count > 1) {
            return {
              stepId: (action as any).stepId || 'unknown',
              selector: elementSelector,
              status: EXECUTION_STATUS.FAILURE,
              error: ERROR_MESSAGES.AMBIGUOUS_SELECTOR(elementSelector, count),
              snapshot: await this.getSnapshot(),
              timestamp: Date.now(),
            };
          }
          
          const isVisible = await elements.isVisible();
          const isNegated = operation.startsWith('not_');
          const finalResult = isNegated ? !isVisible : isVisible;
          
          if (!finalResult) {
            return {
              stepId: (action as any).stepId || 'unknown',
              selector: elementSelector,
              status: EXECUTION_STATUS.FAILURE,
              error: `Element "${elementSelector}" is ${isNegated ? '' : 'not '}visible`,
              snapshot: await this.getSnapshot(),
              timestamp: Date.now(),
            };
          }
          return {
            stepId: (action as any).stepId || 'unknown',
            selector: elementSelector,
            status: EXECUTION_STATUS.SUCCESS,
            snapshot: await this.getSnapshot(),
            timestamp: Date.now(),
          };
        } catch (error) {
          return {
            stepId: (action as any).stepId || 'unknown',
            selector: elementSelector,
            status: EXECUTION_STATUS.FAILURE,
            error: `Error checking visibility: ${error instanceof Error ? error.message : String(error)}`,
            snapshot: await this.getSnapshot(),
            timestamp: Date.now(),
          };
        }
      }

      // Get the value to verify against
      const expectedValue = args.text as string || args.value as string || args.expected as string;
      const selector = args.selector as string;

      // Get the actual value based on target
      const actualValue = await this.getVerificationTarget(target, selector);
      
      if (actualValue === null) {
        return {
          stepId: (action as any).stepId || 'unknown',
          selector: selector || undefined,
          status: EXECUTION_STATUS.FAILURE,
          error: `Could not retrieve value for target: ${target}${selector ? ` with selector: ${selector}` : ''}`,
          snapshot: await this.getSnapshot(),
          timestamp: Date.now(),
        };
      }

      // Perform the verification operation
      const verificationResult = this.performVerificationOperation(
        operation,
        actualValue,
        expectedValue,
        target,
        selector
      );

      return {
        stepId: (action as any).stepId || 'unknown',
        selector: selector || undefined,
        status: verificationResult.success ? EXECUTION_STATUS.SUCCESS : EXECUTION_STATUS.FAILURE,
        error: verificationResult.success ? undefined : verificationResult.error,
        snapshot: await this.getSnapshot(),
        timestamp: Date.now(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const selector = args.selector as string;
      return {
        stepId: (action as any).stepId || 'unknown',
        selector: selector || undefined,
        status: EXECUTION_STATUS.FAILURE,
        error: `Verification failed: ${errorMessage}`,
        snapshot: await this.getSnapshot(),
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Verify visual concept visibility using Vision AI
   */
  private async verifyVisualConceptVisibility(
    action: IAction,
    elementSelector: string,
    target: string,
    operation: string
  ): Promise<IExecutionResult> {
    try {
      // Extract description from selector or use target
      const description = action.arguments.description as string || 
                         elementSelector.replace(/\[data-visual-concept="([^"]+)"\]/, '$1') ||
                         target;
      
      this.logger.info(`Verifying visual concept visibility using Vision AI`, {
        description,
        selector: elementSelector,
        target
      });
      
      // Take screenshot
      const screenshot = await this.page!.screenshot({ type: 'jpeg', quality: 80 });
      const base64Screenshot = screenshot.toString('base64');
      
      // Build verification prompt
      const intent = `Verify if the visual concept "${description}" is visible on the page. ` +
        `This could be a semantic concept (like a form, modal, or visual grouping) that may not have an explicit DOM element. ` +
        `Return true if you can see this visual concept, false otherwise.`;
      
      const systemPrompt = `You are a visual verification agent. Given a screenshot and a description, verify if a visual concept is present.

CRITICAL INTELLIGENCE RULES:
1. SEMANTIC CONCEPTS: Elements like "form", "login form", "modal", etc. are VISUAL CONCEPTS:
   - A "form" is a visual grouping of input fields, labels, and buttons
   - A "login form" is a specific visual region containing email/password inputs and a submit button
   - These should be identified by their VISUAL APPEARANCE, not just DOM structure

2. VISUAL PRESENCE: A visual concept is "visible" if:
   - You can see the visual grouping/elements that represent it
   - The concept is not hidden, obscured, or off-screen
   - The visual elements are clearly identifiable

3. RETURN JSON: {"visible": boolean, "confidence": number (0.0-1.0), "reason": "explanation"}`;

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: intent },
              {
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${base64Screenshot}` },
              },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return {
          stepId: (action as any).stepId || 'unknown',
          selector: elementSelector || undefined,
          status: EXECUTION_STATUS.FAILURE,
          error: 'Vision AI failed to return a response for visual verification',
          snapshot: await this.getSnapshot(),
          timestamp: Date.now(),
        };
      }

      const parsed = JSON.parse(content);
      const isVisible = parsed.visible === true;
      const isNegated = operation.startsWith('not_');
      const finalResult = isNegated ? !isVisible : isVisible;
      const confidence = parsed.confidence || 0.5;
      
      this.logger.info(`Vision AI verification result`, {
        description,
        visible: isVisible,
        finalResult,
        confidence,
        reason: parsed.reason
      });
      
      if (!finalResult) {
        return {
          stepId: (action as any).stepId || 'unknown',
          selector: elementSelector || undefined,
          status: EXECUTION_STATUS.FAILURE,
          error: `Visual concept "${description}" is ${isNegated ? '' : 'not '}visible. ${parsed.reason || ''}`,
          snapshot: await this.getSnapshot(),
          timestamp: Date.now(),
        };
      }
      
      return {
        stepId: (action as any).stepId || 'unknown',
        selector: elementSelector || undefined,
        status: EXECUTION_STATUS.SUCCESS,
        snapshot: await this.getSnapshot(),
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error('Vision AI verification failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      return {
        stepId: (action as any).stepId || 'unknown',
        status: EXECUTION_STATUS.FAILURE,
        error: `Vision AI verification failed: ${error instanceof Error ? error.message : String(error)}`,
        snapshot: await this.getSnapshot(),
        timestamp: Date.now(),
      };
    }
  }

  private async getVerificationTarget(
    target: string,
    selector?: string
  ): Promise<string | boolean | null> {
    switch (target) {
      case VERIFICATION_TARGETS.TITLE:
        return await this.page!.title();
      
      case VERIFICATION_TARGETS.TEXT:
      case VERIFICATION_TARGETS.BODY:
        const bodyText = await this.page!.locator(SELECTORS.BODY).textContent();
        return bodyText || '';
      
      case VERIFICATION_TARGETS.URL:
        return this.page!.url();
      
      case VERIFICATION_TARGETS.HEADING:
        return await this.getHeadingValue(SELECTORS.ALL_HEADINGS);
      
      case VERIFICATION_TARGETS.HEADING1:
      case VERIFICATION_TARGETS.H1:
        return await this.getHeadingValue(SELECTORS.H1);
      
      case VERIFICATION_TARGETS.HEADING2:
      case VERIFICATION_TARGETS.H2:
        return await this.getHeadingValue(SELECTORS.H2);
      
      case VERIFICATION_TARGETS.HEADING3:
      case VERIFICATION_TARGETS.H3:
        return await this.getHeadingValue(SELECTORS.H3);
      
      case VERIFICATION_TARGETS.HEADING4:
      case VERIFICATION_TARGETS.H4:
        return await this.getHeadingValue(SELECTORS.H4);
      
      case VERIFICATION_TARGETS.HEADING5:
      case VERIFICATION_TARGETS.H5:
        return await this.getHeadingValue(SELECTORS.H5);
      
      case VERIFICATION_TARGETS.HEADING6:
      case VERIFICATION_TARGETS.H6:
        return await this.getHeadingValue(SELECTORS.H6);
      
      case VERIFICATION_TARGETS.ELEMENT:
        if (!selector) {
          return null;
        }
        return await this.getElementValue(selector, false);
      
      default:
        if (selector) {
          return await this.getElementValue(selector, false);
        }
        return await this.getElementValue(target, false);
    }
  }

  private async getHeadingValue(selector: string): Promise<string | null> {
    const elements = this.page!.locator(selector);
    const count = await elements.count();
    
    if (count === 0) {
      throw new Error(ERROR_MESSAGES.NO_HEADING_FOUND(selector));
    }
    
    const firstHeading = elements.first();
    return await firstHeading.textContent() || '';
  }

  private async getElementValue(selector: string, checkVisibility: boolean = false): Promise<string | boolean | null> {
    const elements = this.page!.locator(selector);
    const count = await elements.count();
    
    if (count === 0) {
      throw new Error(ERROR_MESSAGES.ELEMENT_NOT_FOUND(selector));
    }
    if (count > 1) {
      throw new Error(ERROR_MESSAGES.AMBIGUOUS_SELECTOR(selector, count));
    }
    
    if (checkVisibility) {
      return await elements.isVisible();
    }
    
    return await elements.textContent() || '';
  }

  private performVerificationOperation(
    operation: string,
    actualValue: string | boolean,
    expectedValue: string | undefined,
    target: string,
    selector?: string
  ): { success: boolean; error?: string } {
    let isNegated = false;
    let cleanOperation = operation;
    
    if (operation.startsWith('not_')) {
      isNegated = true;
      cleanOperation = operation.replace('not_', '');
    }

    if (cleanOperation === VERIFICATION_OPERATIONS.EXISTS) {
      const result = actualValue !== null && actualValue !== undefined && actualValue !== '';
      const finalResult = isNegated ? !result : result;
      
      if (!finalResult) {
        return {
          success: false,
          error: `${target}${selector ? ` "${selector}"` : ''} ${isNegated ? 'exists' : 'does not exist'}`
        };
      }
      return { success: true };
    }

    if (typeof actualValue === 'string') {
      const methodName = METHOD_MAPPINGS[cleanOperation] || cleanOperation;
      
      if (typeof (actualValue as any)[methodName] === 'function') {
        try {
          let result: boolean;
          
          if (expectedValue !== undefined) {
            result = (actualValue as any)[methodName](expectedValue) as boolean;
          } else {
            result = (actualValue as any)[methodName]() as boolean;
          }
          
          const finalResult = isNegated ? !result : result;
          
          if (!finalResult) {
            const operationName = isNegated ? `not ${cleanOperation}` : cleanOperation;
            return {
              success: false,
              error: `${target}${selector ? ` "${selector}"` : ''} "${actualValue}" does not ${operationName} "${expectedValue}"`
            };
          }
          return { success: true };
        } catch (error) {
          return {
            success: false,
            error: `Error executing ${methodName}: ${error instanceof Error ? error.message : String(error)}`
          };
        }
      } else if (cleanOperation === VERIFICATION_OPERATIONS.EQUALS) {
        const result = actualValue === expectedValue;
        const finalResult = isNegated ? !result : result;
        if (!finalResult) {
          const operationName = isNegated ? `not ${cleanOperation}` : cleanOperation;
          return {
            success: false,
            error: `${target}${selector ? ` "${selector}"` : ''} "${actualValue}" does not ${operationName} "${expectedValue}"`
          };
        }
        return { success: true };
      } else if (cleanOperation === VERIFICATION_OPERATIONS.MATCHES) {
        if (!expectedValue) {
          return { success: false, error: `Missing expected value for ${operation}` };
        }
        try {
          const regex = new RegExp(expectedValue);
          const result = regex.test(actualValue);
          const finalResult = isNegated ? !result : result;
          if (!finalResult) {
            const operationName = isNegated ? `not ${cleanOperation}` : cleanOperation;
            return {
              success: false,
              error: `${target}${selector ? ` "${selector}"` : ''} "${actualValue}" does not ${operationName} pattern "${expectedValue}"`
            };
          }
          return { success: true };
        } catch (error) {
          return { success: false, error: `Invalid regex pattern: ${expectedValue}` };
        }
      }
    } else if (typeof actualValue === 'boolean') {
      if (cleanOperation === VERIFICATION_OPERATIONS.EQUALS) {
        const expectedBool = expectedValue === 'true';
        const result = actualValue === expectedBool;
        const finalResult = isNegated ? !result : result;
        if (!finalResult) {
          const operationName = isNegated ? `not ${cleanOperation}` : cleanOperation;
          return {
            success: false,
            error: `${target}${selector ? ` "${selector}"` : ''} "${actualValue}" does not ${operationName} "${expectedBool}"`
          };
        }
        return { success: true };
      } else {
        return { success: false, error: `Cannot use ${operation} on boolean value` };
      }
    }

    return { success: false, error: ERROR_MESSAGES.UNSUPPORTED_VERIFICATION_OPERATION(operation) };
  }

  private async getSnapshot(): Promise<ISnapshot> {
    if (!this.page) throw new Error('Page not initialized for snapshot');
    const screenshot = await this.page.screenshot({ type: 'jpeg', quality: 80 });
    const base64Screenshot = screenshot.toString('base64');
    const htmlContent = await this.page.content();
    
    return {
      timestamp: Date.now(),
      metadata: {
        url: this.page.url(),
        html_length: htmlContent.length,
        screenshot_base64: base64Screenshot,
      },
    };
  }

  async cleanup(): Promise<void> {
    try {
      if (this.context) {
        // Check if browser is connected before attempting to close context
        const browser = this.context.browser();
        const isBrowserConnected = browser?.isConnected() ?? false;
        
        if (!isBrowserConnected) {
          this.logger.debug('Browser disconnected, skipping context cleanup');
          this.context = null;
          this.page = null;
        } else {
          await this.context.close().catch(err => {
            // Context might already be closed or disposed - this is okay
            const errorMsg = err.message || String(err);
            const isExpectedError = 
              errorMsg.includes('Target page, context or browser has been closed') ||
              errorMsg.includes('Failed to find context') ||
              errorMsg.includes('Target.disposeBrowserContext') ||
              errorMsg.includes('Protocol error');
            
            if (!isExpectedError) {
              this.logger.warn('Unexpected error closing browser context', { error: errorMsg });
            } else {
              this.logger.debug('Browser context was already closed or disposed');
            }
          });
          this.context = null;
          this.page = null;
        }
      }
    } catch (error) {
      // Non-fatal: context cleanup errors should not affect test results
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.warn('Error closing browser context (non-fatal)', { error: errorMsg });
      this.context = null;
      this.page = null;
    }
    
    try {
      if (this.browser) {
        // Check if browser is already closed before attempting to close
        if (!this.browser.isConnected()) {
          this.logger.debug('Browser already closed, skipping cleanup');
          this.browser = null;
        } else {
          await this.browser.close().catch(err => {
            // Browser might already be closed - this is okay
            const errorMsg = err.message || String(err);
            const isExpectedError = 
              errorMsg.includes('Target page, context or browser has been closed') ||
              errorMsg.includes('Protocol error');
            
            if (!isExpectedError) {
              this.logger.warn('Unexpected error closing browser', { error: errorMsg });
            } else {
              this.logger.debug('Browser was already closed');
            }
          });
          this.browser = null;
        }
      }
    } catch (error) {
      // Non-fatal: browser cleanup errors should not affect test results
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.warn('Error closing browser (non-fatal)', { error: errorMsg });
      this.browser = null;
    }
    
    this.logger.info('Unified executor cleaned up.');
  }
}

