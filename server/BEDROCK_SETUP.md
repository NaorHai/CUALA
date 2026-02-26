# Anthropic Bedrock Gateway Setup

CUALA supports both the public Anthropic API and custom enterprise endpoints like AWS Bedrock or Salesforce's internal AI gateway.

## Configuration Options

### Option 1: Public Anthropic API (Default)

For most users, simply use the public Anthropic API:

```env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-your-key-here
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
ANTHROPIC_VISION_MODEL=claude-3-5-sonnet-20241022
ANTHROPIC_PLANNER_MODEL=claude-3-5-haiku-20241022
```

**Get your API key**: https://console.anthropic.com/

### Option 2: Bedrock Gateway / Custom Endpoint

For enterprise deployments using AWS Bedrock, Salesforce internal gateway, or other custom endpoints:

```env
LLM_PROVIDER=anthropic

# Custom endpoint configuration
ANTHROPIC_BEDROCK_BASE_URL=https://your-gateway.example.com/bedrock
ANTHROPIC_AUTH_TOKEN=your-auth-token-here

# Model configuration (same as public API)
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
ANTHROPIC_VISION_MODEL=claude-3-5-sonnet-20241022
ANTHROPIC_PLANNER_MODEL=claude-3-5-haiku-20241022
```

## How It Works

The provider factory automatically detects which configuration to use:

1. **Checks for `ANTHROPIC_BEDROCK_BASE_URL`**:
   - If present → Uses custom endpoint with `ANTHROPIC_AUTH_TOKEN`
   - If absent → Uses public API with `ANTHROPIC_API_KEY`

2. **Backward Compatible**:
   - Existing configurations using `ANTHROPIC_API_KEY` continue to work
   - No changes needed for public API users

3. **Flexible Authentication**:
   - Custom endpoints can use either `ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_API_KEY`
   - Fallback logic ensures compatibility

## Examples

### Salesforce Internal Gateway

```env
LLM_PROVIDER=anthropic
ANTHROPIC_BEDROCK_BASE_URL=https://eng-ai-model-gateway.sfproxy.devx-preprod.aws-esvc1-useast2.aws.sfdc.cl/bedrock
ANTHROPIC_AUTH_TOKEN=sk-your-internal-token
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
```

### AWS Bedrock

```env
LLM_PROVIDER=anthropic
ANTHROPIC_BEDROCK_BASE_URL=https://bedrock-runtime.us-east-1.amazonaws.com
ANTHROPIC_AUTH_TOKEN=your-aws-token
ANTHROPIC_MODEL=anthropic.claude-3-5-sonnet-20241022-v2:0
```

### Azure OpenAI with Anthropic (Hypothetical)

```env
LLM_PROVIDER=anthropic
ANTHROPIC_BEDROCK_BASE_URL=https://your-azure-endpoint.openai.azure.com/anthropic
ANTHROPIC_AUTH_TOKEN=your-azure-key
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
```

## Testing Your Configuration

### 1. Test Provider Initialization

```bash
cd server
npm test -- src/providers/__tests__/providers.test.ts
```

### 2. Test with Simple Scenario

```bash
# Start the API server
npm run start-api

# In another terminal, test with curl
curl -X POST http://localhost:3001/api/plan \
  -H "Content-Type: application/json" \
  -d '{"scenario": "Navigate to https://example.com"}'
```

### 3. Check Logs

Watch for initialization logs:
```
INFO: Using Anthropic with custom base URL (e.g., Bedrock gateway) { baseURL: 'https://...' }
INFO: Anthropic provider initialized { defaultModel: 'claude-3-5-sonnet-20241022', customEndpoint: true }
```

## Troubleshooting

### Error: "ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY is required"

**Solution**: Set the appropriate credential based on your configuration:
- Public API: Set `ANTHROPIC_API_KEY`
- Custom endpoint: Set `ANTHROPIC_AUTH_TOKEN` (or `ANTHROPIC_API_KEY` as fallback)

### Error: "401 Unauthorized" or "invalid x-api-key"

**Solutions**:
1. Verify your token/key is correct
2. Check if the base URL is correct for your gateway
3. Ensure your token has the required permissions
4. For Bedrock: Verify AWS credentials are properly configured

### Error: "Connection timeout"

**Solutions**:
1. Check network connectivity to the base URL
2. Verify firewall rules allow outbound HTTPS
3. For internal gateways: Ensure VPN/proxy is configured
4. Increase timeout in configuration:
   ```typescript
   timeout: 120000  // 2 minutes
   ```

### Provider not using custom endpoint

**Check**:
1. `.env` file is in the correct location (`server/.env`)
2. `ANTHROPIC_BEDROCK_BASE_URL` is set (not commented out)
3. Restart the server after changing `.env`

## Architecture

### Code Flow

```
1. Factory (factory.ts)
   ├─> Detects ANTHROPIC_BEDROCK_BASE_URL
   ├─> Selects appropriate auth token
   └─> Creates provider config with optional baseURL

2. Provider (anthropic-provider.ts)
   ├─> Receives config with optional baseURL
   ├─> Configures Anthropic SDK client
   └─> Uses custom endpoint if baseURL present

3. SDK (node_modules/@anthropic-ai/sdk)
   └─> Makes API calls to configured endpoint
```

### Key Files

- `src/providers/types.ts` - Added `baseURL?: string` to `ILLMProviderConfig`
- `src/providers/factory.ts` - Detection logic for Bedrock vs public API
- `src/providers/anthropic-provider.ts` - Custom baseURL support
- `.env.example` - Configuration documentation

## Security Considerations

1. **Never commit `.env` files**: Tokens/keys should stay local
2. **Use environment variables**: For production, use secrets management
3. **Rotate tokens regularly**: Follow your organization's security policy
4. **Least privilege**: Grant only required permissions to tokens
5. **Network security**: Use HTTPS only, verify TLS certificates

## Migration Guide

### From Public API to Bedrock

1. Backup current configuration
2. Add Bedrock variables:
   ```env
   ANTHROPIC_BEDROCK_BASE_URL=your-gateway-url
   ANTHROPIC_AUTH_TOKEN=your-token
   ```
3. Test with a simple scenario
4. Monitor logs for successful initialization
5. Remove or comment out `ANTHROPIC_API_KEY` (optional)

### From Bedrock to Public API

1. Remove Bedrock configuration:
   ```env
   # ANTHROPIC_BEDROCK_BASE_URL=...
   # ANTHROPIC_AUTH_TOKEN=...
   ```
2. Set public API key:
   ```env
   ANTHROPIC_API_KEY=sk-ant-your-key
   ```
3. Restart server
4. Verify public API is being used (check logs)

## Support

For issues or questions:
- Public Anthropic API: https://support.anthropic.com
- Enterprise/Bedrock deployments: Contact your IT/DevOps team
- CUALA issues: https://github.com/NaorHai/CUALA/issues
