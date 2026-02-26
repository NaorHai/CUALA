/**
 * LLM-based Planner
 *
 * Provider-agnostic planner that works with any ILLMProvider implementation
 */

import { IPlanner } from './index.js';
import { ITestScenario, IExecutionPlan, IStep } from '../types/index.js';
import { ILogger } from '../infra/logger.js';
import { IConfig } from '../infra/config.js';
import { PromptManager } from '../infra/prompt-manager.js';
import { LLMProviderFactory } from '../providers/index.js';
import type { ILLMProvider } from '../providers/index.js';

export class LLMPlanner implements IPlanner {
  private provider: ILLMProvider;
  private promptManager: PromptManager;
  private model: string;

  constructor(
    private config: IConfig,
    private logger: ILogger,
    provider?: ILLMProvider
  ) {
    // Use provided provider or create from config
    this.provider = provider || LLMProviderFactory.createFromConfig(config, logger);

    // Get model based on provider type
    if (this.provider.name === 'openai') {
      this.model = (this.provider as any).getPlannerModel?.() || config.get('OPENAI_PLANNER_MODEL') || 'gpt-4o-mini';
    } else if (this.provider.name === 'anthropic') {
      this.model = (this.provider as any).getPlannerModel?.() || config.get('ANTHROPIC_PLANNER_MODEL') || 'claude-3-5-haiku-20241022';
    } else {
      this.model = (this.provider as any).getDefaultModel?.() || 'unknown';
    }

    this.promptManager = PromptManager.getInstance();

    this.logger.info(`LLMPlanner initialized with ${this.provider.name} provider`, { model: this.model });
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
      const response = await this.provider.createChatCompletion({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
      });

      const content = response.content;
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
        scenario: scenario.description, // Store the original scenario text
        name: planName,
        steps,
        phase: 'initial', // Plans from base planner are always initial
        createdAt: Date.now(),
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

      const response = await this.provider.createChatCompletion({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 100,
      });

      let name = response.content.trim();

      // Remove quotes if present
      name = name.replace(/^["']|["']$/g, '');

      // Fallback if name is empty or too long
      if (!name || name.length > 100) {
        // Create a fallback name from description
        name = description
          .split(' ')
          .slice(0, 8)
          .join(' ');
        if (description.split(' ').length > 8) {
          name += '...';
        }
      }

      return name;
    } catch (error) {
      this.logger.warn(`Failed to generate plan name, using fallback`, error);
      // Fallback to a simple name based on description
      const fallback = description
        .split(' ')
        .slice(0, 8)
        .join(' ');
      return fallback + (description.split(' ').length > 8 ? '...' : '');
    }
  }

  /**
   * Validate that the parsed plan has the required structure
   */
  private validateParsedPlan(parsed: any): void {
    if (!parsed.steps || !Array.isArray(parsed.steps)) {
      throw new Error('Invalid plan format: missing or invalid steps array');
    }

    for (const step of parsed.steps) {
      if (!step.id || !step.description || !step.action) {
        throw new Error(`Invalid step format: ${JSON.stringify(step)}`);
      }
    }
  }
}
