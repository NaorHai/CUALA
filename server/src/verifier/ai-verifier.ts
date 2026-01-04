import OpenAI from 'openai';
import { IVerifier } from './index.js';
import { IStep, IExecutionResult, IVerificationResult, IAssertion, ISnapshot } from '../types/index.js';
import { ILogger } from '../infra/logger.js';
import { IConfig } from '../infra/config.js';
import { PromptManager } from '../infra/prompt-manager.js';
import { EXECUTION_STATUS } from '../constants/index.js';

export class AIVerifier implements IVerifier {
  private client: OpenAI;
  private model: string;
  private promptManager: PromptManager;

  constructor(
    private config: IConfig,
    private logger: ILogger
  ) {
    const apiKey = config.get('OPENAI_API_KEY');
    if (!apiKey) throw new Error('OPENAI_API_KEY is not defined for AIVerifier');
    this.client = new OpenAI({ apiKey });
    this.model = config.get('OPENAI_MODEL') || 'gpt-4o';
    this.promptManager = PromptManager.getInstance();
  }

  async verifyStep(step: IStep, result: IExecutionResult): Promise<IVerificationResult> {
    this.logger.debug(`Verifying step: ${step.id}`);
    
    // For NAVIGATION actions: If execution status is SUCCESS, navigation was successful
    // (page loaded, even if redirected or shows error/access denied)
    if (step.action.name === 'navigate') {
      if (result.status === EXECUTION_STATUS.SUCCESS) {
        const finalUrl = result.snapshot.metadata.url as string || 'unknown';
        this.logger.info(`NAVIGATION action verified: Page loaded successfully`, {
          stepId: step.id,
          finalUrl,
          note: 'Navigation success means page loaded, regardless of content (redirects, login pages, error messages are valid states)'
        });
        return {
          stepId: step.id,
          isVerified: true,
          evidence: `Navigation successful: Page loaded at ${finalUrl}. Note: Redirects, login pages, or access denied messages are valid page states and indicate successful navigation.`
        };
      } else {
        // Navigation failed (network error, timeout, etc.)
        this.logger.warn(`NAVIGATION action failed: Execution status is not success`, {
          stepId: step.id,
          status: result.status,
          error: result.error
        });
        return {
          stepId: step.id,
          isVerified: false,
          evidence: `Navigation failed: ${result.error || 'Unknown error'}. Page did not load successfully.`
        };
      }
    }
    
    // For TYPE actions, check DOM value directly instead of relying on screenshot
    if (step.action.name === 'type' && result.snapshot.metadata.typedValue !== undefined) {
      const expectedValue = step.action.arguments.value as string;
      const actualValue = result.snapshot.metadata.typedValue as string;
      const inputSelector = result.snapshot.metadata.inputSelector as string;
      
      if (actualValue === expectedValue) {
        this.logger.info(`TYPE action verified: Value matches in DOM`, {
          stepId: step.id,
          selector: inputSelector,
          value: actualValue
        });
        return {
          stepId: step.id,
          isVerified: true,
          evidence: `Successfully typed "${actualValue}" into the input field (verified via DOM)`
        };
      } else {
        this.logger.warn(`TYPE action verification failed: Value mismatch`, {
          stepId: step.id,
          selector: inputSelector,
          expected: expectedValue,
          actual: actualValue
        });
        return {
          stepId: step.id,
          isVerified: false,
          evidence: `Expected to type "${expectedValue}" but found "${actualValue}" in the input field (verified via DOM)`
        };
      }
    }
    
    // For verification actions, check DOM directly if execution was successful
    if (step.action.name.startsWith('verify_') && result.status === EXECUTION_STATUS.SUCCESS) {
      // If verification action executed successfully, it means elements were found in DOM
      // Don't rely on screenshot - trust the DOM-based verification
      this.logger.info(`VERIFICATION ACTION: Execution successful, trusting DOM-based verification`, {
        stepId: step.id,
        action: step.action.name,
        note: 'Skipping screenshot-based AI verification since DOM verification already succeeded'
      });
      return {
        stepId: step.id,
        isVerified: true,
        evidence: `Verification action executed successfully. Elements were found and verified in the DOM.`
      };
    }
    
    const prompt = this.promptManager.render('verifier-step-user', {
      description: step.description,
      action: JSON.stringify(step.action),
      status: result.status,
      error: result.error || 'None',
      domMetadata: result.snapshot.metadata.html_length 
        ? `URL=${result.snapshot.metadata.url}, HTML Length=${result.snapshot.metadata.html_length}` 
        : null,
      typedValue: result.snapshot.metadata.typedValue 
        ? `Typed value (from DOM): ${result.snapshot.metadata.typedValue}` 
        : null
    });

    return this.performVerification(step.id, prompt, result.snapshot);
  }

  async verifyAssertions(
    assertions: IAssertion[],
    lastResult: IExecutionResult
  ): Promise<IVerificationResult[]> {
    this.logger.info(`Verifying ${assertions.length} assertions against final state`);
    
    const verifications: IVerificationResult[] = [];
    for (const assertion of assertions) {
      const prompt = this.promptManager.render('verifier-assertion-user', {
        description: assertion.description,
        check: assertion.check,
        domMetadata: lastResult.snapshot.metadata.html_length 
          ? `URL=${lastResult.snapshot.metadata.url}, HTML Length=${lastResult.snapshot.metadata.html_length}` 
          : null
      });
      
      const verification = await this.performVerification(assertion.id, prompt, lastResult.snapshot);
      verifications.push(verification);
    }
    
    return verifications;
  }

  private async performVerification(
    id: string,
    prompt: string,
    snapshot: ISnapshot
  ): Promise<IVerificationResult> {
    const messages: any[] = [
      {
        role: 'system',
        content: this.promptManager.render('verifier-system', {}),
      },
    ];

    const userContent: any[] = [{ type: 'text', text: prompt }];

    if (snapshot.metadata.html_length) {
      userContent.push({ 
        type: 'text', 
        text: `DOM Metadata: URL=${snapshot.metadata.url}, HTML Length=${snapshot.metadata.html_length}` 
      });
    }

    if (snapshot.metadata.screenshot_base64) {
      userContent.push({
        type: 'image_url',
        image_url: { url: `data:image/jpeg;base64,${snapshot.metadata.screenshot_base64}` },
      });
    }

    messages.push({ role: 'user', content: userContent });

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Verifier received empty response');

      const parsed = JSON.parse(content);
      return {
        stepId: id,
        isVerified: !!parsed.isVerified,
        evidence: parsed.evidence || 'No evidence provided',
      };
    } catch (error) {
      this.logger.error(`Verification failed for ${id}`, error);
      return {
        stepId: id,
        isVerified: false,
        evidence: `Verification error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}

