/**
 * LLM Provider Abstraction Layer Types
 *
 * Defines common interfaces for different LLM providers (OpenAI, Anthropic, etc.)
 * to enable seamless switching and multi-provider support.
 */

export interface ILLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ILLMMessageContent[];
}

export interface ILLMMessageContent {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
    detail?: 'low' | 'high' | 'auto';
  };
}

export interface ILLMCompletionOptions {
  model: string;
  messages: ILLMMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' | 'text' };
  stream?: boolean;
}

export interface ILLMCompletionResponse {
  content: string;
  role: 'assistant';
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ILLMProvider {
  /**
   * Provider name (e.g., 'openai', 'anthropic')
   */
  readonly name: string;

  /**
   * Create a chat completion
   */
  createChatCompletion(options: ILLMCompletionOptions): Promise<ILLMCompletionResponse>;

  /**
   * Check if the provider supports vision (image understanding)
   */
  supportsVision(): boolean;

  /**
   * Check if the provider supports JSON mode
   */
  supportsJsonMode(): boolean;

  /**
   * Get available models for this provider
   */
  getAvailableModels(): string[];

  /**
   * Validate API key and connection
   */
  validateConnection(): Promise<boolean>;
}

export interface ILLMProviderConfig {
  apiKey: string;
  defaultModel?: string;
  visionModel?: string;
  plannerModel?: string;
  maxRetries?: number;
  timeout?: number;
  baseURL?: string; // Optional custom base URL (e.g., for Bedrock gateway)
}

export type LLMProviderType = 'openai' | 'anthropic';
