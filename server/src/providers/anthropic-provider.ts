/**
 * Anthropic Claude Provider Implementation
 *
 * Wraps Anthropic API in the common ILLMProvider interface
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  ILLMProvider,
  ILLMProviderConfig,
  ILLMCompletionOptions,
  ILLMCompletionResponse,
  ILLMMessage,
} from './types.js';
import { ILogger } from '../infra/logger.js';

export class AnthropicProvider implements ILLMProvider {
  readonly name = 'anthropic';
  private client: Anthropic;
  private config: ILLMProviderConfig;

  constructor(
    config: ILLMProviderConfig,
    private logger: ILogger
  ) {
    this.config = config;

    // Support both public Anthropic API and custom endpoints (e.g., Bedrock gateway)
    const clientConfig: Anthropic.ClientOptions = {
      apiKey: config.apiKey,
      maxRetries: config.maxRetries || 3,
      timeout: config.timeout || 60000,
    };

    // Add custom base URL if provided (for enterprise/Bedrock deployments)
    if (config.baseURL) {
      clientConfig.baseURL = config.baseURL;
      this.logger.info('Using custom Anthropic base URL', { baseURL: config.baseURL });
    }

    this.client = new Anthropic(clientConfig);

    this.logger.info('Anthropic provider initialized', {
      defaultModel: config.defaultModel,
      visionModel: config.visionModel,
      customEndpoint: !!config.baseURL,
    });
  }

  async createChatCompletion(options: ILLMCompletionOptions): Promise<ILLMCompletionResponse> {
    try {
      // Separate system message from user/assistant messages
      const systemMessage = options.messages.find(m => m.role === 'system');
      const conversationMessages = options.messages.filter(m => m.role !== 'system');

      // Convert to Anthropic format
      const messages: Anthropic.MessageParam[] = conversationMessages.map(msg => {
        if (typeof msg.content === 'string') {
          return {
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          };
        } else {
          // Handle multimodal content (text + images)
          const content: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = msg.content.map(part => {
            if (part.type === 'text') {
              return {
                type: 'text',
                text: part.text!,
              };
            } else {
              // Extract base64 data from data URL
              const imageUrl = part.image_url!.url;
              let source: Anthropic.ImageBlockParam['source'];

              if (imageUrl.startsWith('data:image/')) {
                // Data URL format: data:image/png;base64,iVBORw0KG...
                const match = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
                if (match) {
                  const [, mediaType, data] = match;
                  source = {
                    type: 'base64',
                    media_type: `image/${mediaType}` as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                    data,
                  };
                } else {
                  throw new Error('Invalid data URL format for image');
                }
              } else {
                // Regular URL - Anthropic doesn't support URL sources directly in this version
                // Convert to base64 if needed, or throw error for now
                throw new Error('Anthropic provider requires base64-encoded images. URL images are not supported yet.');
              }

              return {
                type: 'image',
                source,
              };
            }
          });

          return {
            role: msg.role as 'user' | 'assistant',
            content,
          };
        }
      });

      // Handle JSON mode differently for Anthropic
      const actualMaxTokens = options.max_tokens || 4096;

      // For JSON mode, we need to be more explicit with Claude
      const shouldForceJson = options.response_format?.type === 'json_object';

      const response = await this.client.messages.create({
        model: options.model,
        max_tokens: actualMaxTokens,
        temperature: options.temperature ?? 0,
        system: systemMessage ? (typeof systemMessage.content === 'string' ? systemMessage.content : '') : undefined,
        messages,
      });

      // Debug: Log full response for Bedrock troubleshooting
      if (this.config.baseURL) {
        this.logger.info('Bedrock raw response', {
          response: JSON.stringify(response, null, 2).substring(0, 500),
          keys: Object.keys(response),
          contentExists: 'content' in response,
          contentValue: response.content,
        });
      }

      // Extract text content
      // Handle both standard Anthropic API and Bedrock gateway formats
      let content = '';
      if (typeof response.content === 'string') {
        // Bedrock gateway format - content is a string
        content = response.content;
      } else if (Array.isArray(response.content)) {
        // Standard Anthropic API format - content is an array of blocks
        for (const block of response.content) {
          if (block.type === 'text') {
            content += block.text;
          }
        }
      } else {
        this.logger.warn('Unexpected response content format', { contentType: typeof response.content });
      }

      if (!content) {
        throw new Error('Anthropic returned empty response');
      }

      // If JSON mode was requested, try to extract JSON from response
      if (shouldForceJson && !this.isValidJson(content)) {
        // Claude might wrap JSON in markdown code blocks
        const jsonMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (jsonMatch) {
          content = jsonMatch[1].trim();
        }
      }

      return {
        content,
        role: 'assistant',
        model: response.model,
        usage: {
          prompt_tokens: response.usage.input_tokens,
          completion_tokens: response.usage.output_tokens,
          total_tokens: response.usage.input_tokens + response.usage.output_tokens,
        },
      };
    } catch (error) {
      this.logger.error('Anthropic API error', error);
      throw error;
    }
  }

  private isValidJson(str: string): boolean {
    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  }

  supportsVision(): boolean {
    return true;
  }

  supportsJsonMode(): boolean {
    // Anthropic doesn't have native JSON mode like OpenAI,
    // but we can work around it with prompting
    return true;
  }

  getAvailableModels(): string[] {
    return [
      'claude-3-5-sonnet-20241022',  // Latest Sonnet
      'claude-3-5-haiku-20241022',   // Latest Haiku
      'claude-3-opus-20240229',       // Opus
      'claude-3-sonnet-20240229',     // Older Sonnet
      'claude-3-haiku-20240307',      // Older Haiku
    ];
  }

  async validateConnection(): Promise<boolean> {
    try {
      // Make a minimal API call to validate the key
      await this.client.messages.create({
        model: this.config.defaultModel || 'claude-3-5-haiku-20241022',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hi' }],
      });
      this.logger.info('Anthropic connection validated');
      return true;
    } catch (error) {
      this.logger.error('Anthropic connection validation failed', error);
      return false;
    }
  }

  /**
   * Get the client instance for direct access (if needed for specific features)
   */
  getClient(): Anthropic {
    return this.client;
  }

  /**
   * Get the configured default model
   */
  getDefaultModel(): string {
    return this.config.defaultModel || 'claude-3-5-sonnet-20241022';
  }

  /**
   * Get the configured vision model
   */
  getVisionModel(): string {
    return this.config.visionModel || 'claude-3-5-sonnet-20241022';
  }

  /**
   * Get the configured planner model
   */
  getPlannerModel(): string {
    return this.config.plannerModel || 'claude-3-5-haiku-20241022';
  }
}
