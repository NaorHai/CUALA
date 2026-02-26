/**
 * LLM Provider Factory
 *
 * Creates LLM provider instances based on configuration
 */

import { ILLMProvider, ILLMProviderConfig, LLMProviderType } from './types.js';
import { OpenAIProvider } from './openai-provider.js';
import { AnthropicProvider } from './anthropic-provider.js';
import { IConfig } from '../infra/config.js';
import { ILogger } from '../infra/logger.js';

export class LLMProviderFactory {
  /**
   * Create an LLM provider based on configuration
   */
  static create(type: LLMProviderType, config: IConfig, logger: ILogger): ILLMProvider {
    switch (type) {
      case 'openai':
        return LLMProviderFactory.createOpenAIProvider(config, logger);

      case 'anthropic':
        return LLMProviderFactory.createAnthropicProvider(config, logger);

      default:
        throw new Error(`Unknown LLM provider type: ${type}`);
    }
  }

  /**
   * Create provider from environment configuration
   */
  static createFromConfig(config: IConfig, logger: ILogger): ILLMProvider {
    const providerType = (config.get('LLM_PROVIDER') || 'openai').toLowerCase() as LLMProviderType;
    logger.info(`Creating LLM provider: ${providerType}`);
    return LLMProviderFactory.create(providerType, config, logger);
  }

  /**
   * Create OpenAI provider
   */
  private static createOpenAIProvider(config: IConfig, logger: ILogger): OpenAIProvider {
    const apiKey = config.get('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required for OpenAI provider');
    }

    const providerConfig: ILLMProviderConfig = {
      apiKey,
      defaultModel: config.get('OPENAI_MODEL') || 'gpt-4o',
      visionModel: config.get('OPENAI_VISION_MODEL') || 'gpt-4o',
      plannerModel: config.get('OPENAI_PLANNER_MODEL') || 'gpt-4o-mini',
      maxRetries: 3,
      timeout: 60000,
    };

    return new OpenAIProvider(providerConfig, logger);
  }

  /**
   * Create Anthropic provider
   */
  private static createAnthropicProvider(config: IConfig, logger: ILogger): AnthropicProvider {
    const apiKey = config.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required for Anthropic provider');
    }

    const providerConfig: ILLMProviderConfig = {
      apiKey,
      defaultModel: config.get('ANTHROPIC_MODEL') || 'claude-3-5-sonnet-20241022',
      visionModel: config.get('ANTHROPIC_VISION_MODEL') || 'claude-3-5-sonnet-20241022',
      plannerModel: config.get('ANTHROPIC_PLANNER_MODEL') || 'claude-3-5-haiku-20241022',
      maxRetries: 3,
      timeout: 60000,
    };

    return new AnthropicProvider(providerConfig, logger);
  }
}
