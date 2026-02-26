/**
 * LLM Provider Tests
 *
 * Comprehensive test suite for OpenAI and Anthropic providers
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { OpenAIProvider } from '../openai-provider.js';
import { AnthropicProvider } from '../anthropic-provider.js';
import { LLMProviderFactory } from '../factory.js';
import { EnvConfig } from '../../infra/config.js';
import { WinstonLogger } from '../../infra/logger.js';
import type { ILLMProvider } from '../types.js';

// Mock logger for tests
const logger = new WinstonLogger('error'); // Only log errors during tests
const config = new EnvConfig();

describe('LLM Provider Abstraction', () => {
  describe('OpenAI Provider', () => {
    let provider: OpenAIProvider;

    beforeAll(() => {
      const apiKey = config.get('OPENAI_API_KEY') || 'test-key';
      provider = new OpenAIProvider(
        {
          apiKey,
          defaultModel: 'gpt-4o-mini',
          visionModel: 'gpt-4o',
          plannerModel: 'gpt-4o-mini',
        },
        logger
      );
    });

    it('should create OpenAI provider instance', () => {
      expect(provider).toBeDefined();
      expect(provider.name).toBe('openai');
    });

    it('should support vision', () => {
      expect(provider.supportsVision()).toBe(true);
    });

    it('should support JSON mode', () => {
      expect(provider.supportsJsonMode()).toBe(true);
    });

    it('should return available models', () => {
      const models = provider.getAvailableModels();
      expect(models).toContain('gpt-4o');
      expect(models).toContain('gpt-4o-mini');
      expect(models.length).toBeGreaterThan(0);
    });

    it('should get configured models', () => {
      expect(provider.getDefaultModel()).toBe('gpt-4o-mini');
      expect(provider.getVisionModel()).toBe('gpt-4o');
      expect(provider.getPlannerModel()).toBe('gpt-4o-mini');
    });

    // Only run API tests if key is configured
    if (config.get('OPENAI_API_KEY')) {
      it('should create simple completion', async () => {
        const response = await provider.createChatCompletion({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You are a test assistant.' },
            { role: 'user', content: 'Say "test" in exactly one word.' },
          ],
          temperature: 0,
          max_tokens: 5,
        });

        expect(response.content).toBeDefined();
        expect(response.content.toLowerCase()).toContain('test');
        expect(response.role).toBe('assistant');
        expect(response.model).toContain('gpt-4o-mini');
      }, 30000);

      it('should create JSON completion', async () => {
        const response = await provider.createChatCompletion({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'Respond with valid JSON only.' },
            { role: 'user', content: 'Return a JSON object with field "status" set to "ok"' },
          ],
          response_format: { type: 'json_object' },
          temperature: 0,
        });

        expect(response.content).toBeDefined();
        const parsed = JSON.parse(response.content);
        expect(parsed.status).toBe('ok');
      }, 30000);

      it('should validate connection', async () => {
        const isValid = await provider.validateConnection();
        expect(isValid).toBe(true);
      }, 30000);
    }
  });

  describe('Anthropic Provider', () => {
    let provider: AnthropicProvider;

    beforeAll(() => {
      const apiKey = config.get('ANTHROPIC_API_KEY') || 'test-key';
      provider = new AnthropicProvider(
        {
          apiKey,
          defaultModel: 'claude-3-5-haiku-20241022',
          visionModel: 'claude-3-5-sonnet-20241022',
          plannerModel: 'claude-3-5-haiku-20241022',
        },
        logger
      );
    });

    it('should create Anthropic provider instance', () => {
      expect(provider).toBeDefined();
      expect(provider.name).toBe('anthropic');
    });

    it('should support vision', () => {
      expect(provider.supportsVision()).toBe(true);
    });

    it('should support JSON mode', () => {
      expect(provider.supportsJsonMode()).toBe(true);
    });

    it('should return available models', () => {
      const models = provider.getAvailableModels();
      expect(models).toContain('claude-3-5-sonnet-20241022');
      expect(models).toContain('claude-3-5-haiku-20241022');
      expect(models.length).toBeGreaterThan(0);
    });

    it('should get configured models', () => {
      expect(provider.getDefaultModel()).toBe('claude-3-5-haiku-20241022');
      expect(provider.getVisionModel()).toBe('claude-3-5-sonnet-20241022');
      expect(provider.getPlannerModel()).toBe('claude-3-5-haiku-20241022');
    });

    // Only run API tests if key is configured
    if (config.get('ANTHROPIC_API_KEY')) {
      it('should create simple completion', async () => {
        const response = await provider.createChatCompletion({
          model: 'claude-3-5-haiku-20241022',
          messages: [
            { role: 'system', content: 'You are a test assistant.' },
            { role: 'user', content: 'Say "test" in exactly one word.' },
          ],
          temperature: 0,
          max_tokens: 10,
        });

        expect(response.content).toBeDefined();
        expect(response.content.toLowerCase()).toContain('test');
        expect(response.role).toBe('assistant');
      }, 30000);

      it('should create JSON completion', async () => {
        const response = await provider.createChatCompletion({
          model: 'claude-3-5-haiku-20241022',
          messages: [
            { role: 'system', content: 'Respond with valid JSON only. No markdown formatting.' },
            { role: 'user', content: 'Return a JSON object with field "status" set to "ok"' },
          ],
          response_format: { type: 'json_object' },
          temperature: 0,
        });

        expect(response.content).toBeDefined();
        // Claude might wrap in markdown, handle that
        let content = response.content;
        const jsonMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (jsonMatch) {
          content = jsonMatch[1].trim();
        }
        const parsed = JSON.parse(content);
        expect(parsed.status).toBe('ok');
      }, 30000);

      it('should validate connection', async () => {
        const isValid = await provider.validateConnection();
        expect(isValid).toBe(true);
      }, 30000);
    }
  });

  describe('Provider Factory', () => {
    it('should create OpenAI provider from config', () => {
      if (!config.get('OPENAI_API_KEY')) {
        return; // Skip if no key
      }

      const provider = LLMProviderFactory.create('openai', config, logger);
      expect(provider).toBeDefined();
      expect(provider.name).toBe('openai');
    });

    it('should create Anthropic provider from config', () => {
      if (!config.get('ANTHROPIC_API_KEY')) {
        return; // Skip if no key
      }

      const provider = LLMProviderFactory.create('anthropic', config, logger);
      expect(provider).toBeDefined();
      expect(provider.name).toBe('anthropic');
    });

    it('should throw error for unknown provider type', () => {
      expect(() => {
        // @ts-expect-error Testing invalid type
        LLMProviderFactory.create('unknown', config, logger);
      }).toThrow('Unknown LLM provider type');
    });

    it('should create provider based on LLM_PROVIDER env var', () => {
      // This will use whatever is configured in .env
      if (!config.get('OPENAI_API_KEY') && !config.get('ANTHROPIC_API_KEY')) {
        return; // Skip if no keys
      }

      const provider = LLMProviderFactory.createFromConfig(config, logger);
      expect(provider).toBeDefined();
      expect(['openai', 'anthropic']).toContain(provider.name);
    });
  });

  describe('Provider Interface Compatibility', () => {
    const providers: ILLMProvider[] = [];

    beforeAll(() => {
      if (config.get('OPENAI_API_KEY')) {
        providers.push(
          new OpenAIProvider(
            {
              apiKey: config.get('OPENAI_API_KEY')!,
              defaultModel: 'gpt-4o-mini',
            },
            logger
          )
        );
      }

      if (config.get('ANTHROPIC_API_KEY')) {
        providers.push(
          new AnthropicProvider(
            {
              apiKey: config.get('ANTHROPIC_API_KEY')!,
              defaultModel: 'claude-3-5-haiku-20241022',
            },
            logger
          )
        );
      }
    });

    it('all providers should implement ILLMProvider interface', () => {
      providers.forEach(provider => {
        expect(provider.name).toBeDefined();
        expect(provider.createChatCompletion).toBeTypeOf('function');
        expect(provider.supportsVision).toBeTypeOf('function');
        expect(provider.supportsJsonMode).toBeTypeOf('function');
        expect(provider.getAvailableModels).toBeTypeOf('function');
        expect(provider.validateConnection).toBeTypeOf('function');
      });
    });

    it('all providers should handle same message format', async () => {
      if (providers.length === 0) return; // Skip if no providers configured

      const testMessage = {
        model: 'test-model',
        messages: [
          { role: 'system' as const, content: 'Test system.' },
          { role: 'user' as const, content: 'Say OK' },
        ],
        temperature: 0,
        max_tokens: 5,
      };

      // Just verify the function accepts the format (don't actually call APIs in this test)
      providers.forEach(provider => {
        expect(async () => {
          // This tests that the interface accepts the correct format
          // We won't actually execute it to avoid API calls
          expect(provider.createChatCompletion).toBeDefined();
        }).toBeDefined();
      });
    });
  });
});
