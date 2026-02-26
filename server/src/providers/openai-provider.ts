/**
 * OpenAI Provider Implementation
 *
 * Wraps OpenAI API in the common ILLMProvider interface
 */

import OpenAI from 'openai';
import {
  ILLMProvider,
  ILLMProviderConfig,
  ILLMCompletionOptions,
  ILLMCompletionResponse,
} from './types.js';
import { ILogger } from '../infra/logger.js';

export class OpenAIProvider implements ILLMProvider {
  readonly name = 'openai';
  private client: OpenAI;
  private config: ILLMProviderConfig;

  constructor(
    config: ILLMProviderConfig,
    private logger: ILogger
  ) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      maxRetries: config.maxRetries || 3,
      timeout: config.timeout || 60000,
    });

    this.logger.info('OpenAI provider initialized', {
      defaultModel: config.defaultModel,
      visionModel: config.visionModel,
    });
  }

  async createChatCompletion(options: ILLMCompletionOptions): Promise<ILLMCompletionResponse> {
    try {
      // Convert our generic format to OpenAI format
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = options.messages.map(msg => {
        if (typeof msg.content === 'string') {
          if (msg.role === 'system') {
            return {
              role: 'system',
              content: msg.content,
            } as OpenAI.Chat.Completions.ChatCompletionSystemMessageParam;
          } else if (msg.role === 'user') {
            return {
              role: 'user',
              content: msg.content,
            } as OpenAI.Chat.Completions.ChatCompletionUserMessageParam;
          } else {
            return {
              role: 'assistant',
              content: msg.content,
            } as OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam;
          }
        } else {
          // Handle multimodal content (text + images) - only valid for user messages
          const contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = msg.content.map(part => {
            if (part.type === 'text') {
              return { type: 'text', text: part.text! };
            } else {
              return {
                type: 'image_url',
                image_url: {
                  url: part.image_url!.url,
                  detail: part.image_url!.detail as 'low' | 'high' | 'auto' | undefined,
                },
              };
            }
          });

          return {
            role: 'user',
            content: contentParts,
          } as OpenAI.Chat.Completions.ChatCompletionUserMessageParam;
        }
      });

      const response = await this.client.chat.completions.create({
        model: options.model,
        messages,
        temperature: options.temperature ?? 0,
        max_tokens: options.max_tokens,
        response_format: options.response_format
          ? { type: options.response_format.type as 'json_object' | 'text' }
          : undefined,
      });

      const choice = response.choices[0];
      if (!choice || !choice.message.content) {
        throw new Error('OpenAI returned empty response');
      }

      return {
        content: choice.message.content,
        role: 'assistant',
        model: response.model,
        usage: response.usage
          ? {
              prompt_tokens: response.usage.prompt_tokens,
              completion_tokens: response.usage.completion_tokens,
              total_tokens: response.usage.total_tokens,
            }
          : undefined,
      };
    } catch (error) {
      this.logger.error('OpenAI API error', error);
      throw error;
    }
  }

  supportsVision(): boolean {
    return true;
  }

  supportsJsonMode(): boolean {
    return true;
  }

  getAvailableModels(): string[] {
    return [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4-turbo',
      'gpt-4-turbo-preview',
      'gpt-4',
      'gpt-3.5-turbo',
    ];
  }

  async validateConnection(): Promise<boolean> {
    try {
      await this.client.models.list();
      this.logger.info('OpenAI connection validated');
      return true;
    } catch (error) {
      this.logger.error('OpenAI connection validation failed', error);
      return false;
    }
  }

  /**
   * Get the client instance for direct access (if needed for specific features)
   */
  getClient(): OpenAI {
    return this.client;
  }

  /**
   * Get the configured default model
   */
  getDefaultModel(): string {
    return this.config.defaultModel || 'gpt-4o';
  }

  /**
   * Get the configured vision model
   */
  getVisionModel(): string {
    return this.config.visionModel || 'gpt-4o';
  }

  /**
   * Get the configured planner model
   */
  getPlannerModel(): string {
    return this.config.plannerModel || 'gpt-4o-mini';
  }
}
