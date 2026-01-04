import OpenAI from 'openai';
import { IPlanner } from './index.js';
import { ITestScenario, IExecutionPlan, IStep, IAssertion } from '../types/index.js';
import { ILogger } from '../infra/logger.js';
import { IConfig } from '../infra/config.js';
import { PromptManager } from '../infra/prompt-manager.js';

export class OpenAIPlanner implements IPlanner {
  private client: OpenAI;
  private model: string;
  private promptManager: PromptManager;

  constructor(
    private config: IConfig,
    private logger: ILogger
  ) {
    const apiKey = config.get('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not defined in configuration');
    }
    this.client = new OpenAI({ apiKey });
    this.model = config.get('OPENAI_MODEL') || 'gpt-4-turbo-preview';
    this.promptManager = PromptManager.getInstance();
  }

  async plan(scenario: ITestScenario): Promise<IExecutionPlan> {
    this.logger.info(`Planning execution for scenario: ${scenario.name}`, { scenarioId: scenario.id });

    const systemPrompt = this.promptManager.render('planner-system', {});
    const userPrompt = this.promptManager.render('planner-user', {
      name: scenario.name,
      description: scenario.description,
      rawInput: scenario.rawInput
    });

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Planner received empty response from LLM');
      }

      const parsed = JSON.parse(content);
      
      if (parsed.error) {
        throw new Error(`Planner failed to create plan: ${parsed.error}`);
      }

      this.validateParsedPlan(parsed);

      // Convert parsed steps to IStep[], ensuring assertions are included within steps
      const steps: IStep[] = (parsed.steps || []).map((step: any) => ({
        id: step.id,
        description: step.description,
        action: step.action,
        assertion: step.assertion || undefined, // Optional assertion
      }));

      // Generate human-readable name from scenario description using LLM
      const planName = await this.generatePlanName(scenario.description);
      
      return {
        id: `plan-${Date.now()}`,
        scenarioId: scenario.id,
        name: planName,
        steps,
        phase: 'initial', // Plans from base planner are always initial
        createdAt: Date.now(),
        // executionMode removed - unified executor handles everything
      };
    } catch (error) {
      this.logger.error(`Failed to generate plan for scenario ${scenario.id}`, error);
      throw error;
    }
  }

  /**
   * Generate a human-readable name for a plan from the scenario description using LLM
   */
  private async generatePlanName(description: string): Promise<string> {
    try {
      const systemPrompt = this.promptManager.render('plan-name-system', {});
      const userPrompt = this.promptManager.render('plan-name-user', {
        description: description
      });

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 50
      });

      const name = response.choices[0]?.message?.content?.trim() || '';
      
      // Remove quotes if present
      const cleanName = name.replace(/^["']|["']$/g, '');
      
      // Fallback if empty
      if (!cleanName) {
        this.logger.warn('LLM returned empty plan name, using fallback');
        return this.generateFallbackName(description);
      }
      
      // Safety check: if LLM exceeded limit, truncate (shouldn't happen with proper prompt)
      if (cleanName.length > 50) {
        this.logger.warn(`LLM generated name exceeding 50 chars (${cleanName.length}), truncating: ${cleanName}`);
        return cleanName.substring(0, 50);
      }
      
      return cleanName;
    } catch (error) {
      this.logger.warn('Failed to generate plan name with LLM, using fallback', error);
      return this.generateFallbackName(description);
    }
  }

  /**
   * Fallback name generation if LLM fails
   */
  private generateFallbackName(description: string): string {
    const trimmed = description.trim();
    
    // If description is short enough, use it as-is
    if (trimmed.length <= 50) {
      return trimmed;
    }
    
    // Extract first sentence or first 50 characters
    const firstSentence = trimmed.split(/[.!?]\s+/)[0];
    if (firstSentence.length <= 50) {
      return firstSentence;
    }
    
    // Take first 50 characters (no ellipsis)
    return trimmed.substring(0, 50);
  }

  private validateParsedPlan(parsed: any): void {
    if (!parsed.steps || !Array.isArray(parsed.steps) || parsed.steps.length === 0) {
      throw new Error('Planner output missing steps or steps is empty');
    }
    // Validate that at least one step has an assertion (optional but recommended)
    const hasAssertion = parsed.steps.some((step: any) => step.assertion);
    if (!hasAssertion) {
      this.logger.warn('No assertions found in any step. Consider adding assertions for verification.');
    }
    // executionMode is no longer used - unified executor handles everything
    // Log if planner still generates it (for debugging) - ignore it
    if (parsed.execution_mode) {
      this.logger.debug(`Planner generated execution_mode: ${parsed.execution_mode} (ignored - using unified executor)`);
      delete parsed.execution_mode; // Remove it from parsed object
    }
  }
}

