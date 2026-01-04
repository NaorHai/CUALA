import { OpenAIPlanner } from './planner/openai-planner.js';
import { AdaptivePlanner } from './planner/adaptive-planner.js';
import { AdaptiveExecutionOrchestrator } from './orchestrator/adaptive-orchestrator.js';
import { UnifiedExecutor } from './executors/unified/unified-executor.js';
import { AIVerifier } from './verifier/ai-verifier.js';
import { StdoutReporter } from './reporter/stdout-reporter.js';
import { EnvConfig } from './infra/config.js';
import { WinstonLogger } from './infra/logger.js';
import { ITestScenario, IReportData, IExecutionPlan, PlanPhase } from './types/index.js';
import { IStorage } from './storage/index.js';
import { InMemoryStorage } from './storage/in-memory-storage.js';
import { MultiStrategyElementDiscovery } from './element-discovery/multi-strategy-discovery.js';
import { LLMDOMStrategy } from './element-discovery/strategies/llm-dom-strategy.js';
import { VisionAIStrategy } from './element-discovery/strategies/vision-ai-strategy.js';
import { PromptManager } from './infra/prompt-manager.js';
import OpenAI from 'openai';

/**
 * Extract URL from scenario description
 */
function extractUrlFromDescription(description: string): { fullUrl: string; domain: string } | null {
  // Match URLs with protocol (http:// or https://)
  const urlWithProtocol = description.match(/(https?:\/\/[^\s]+)/i);
  if (urlWithProtocol) {
    const url = urlWithProtocol[1];
    try {
      const urlObj = new URL(url);
      return {
        fullUrl: url,
        domain: urlObj.hostname
      };
    } catch {
      return { fullUrl: url, domain: url.split('/')[2] || url };
    }
  }

  // Match URLs without protocol (e.g., example.com, www.example.com)
  const urlWithoutProtocol = description.match(/(?:www\.)?([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}(?:\/[^\s]*)?)/i);
  if (urlWithoutProtocol) {
    const url = urlWithoutProtocol[0];
    const normalized = url.startsWith('http://') || url.startsWith('https://') 
      ? url 
      : `https://${url}`;
    try {
      const urlObj = new URL(normalized);
      return {
        fullUrl: normalized,
        domain: urlObj.hostname
      };
    } catch {
      return { fullUrl: normalized, domain: url.split('/')[0] };
    }
  }

  return null;
}

/**
 * Generate a human-readable name for a plan from the scenario description using LLM
 */
async function generatePlanName(description: string): Promise<string> {
  const logger = new WinstonLogger();
  const config = new EnvConfig();
  
  try {
    const apiKey = config.get('OPENAI_API_KEY');
    if (!apiKey) {
      logger.warn('OPENAI_API_KEY not found, using fallback name generation');
      return generateFallbackName(description);
    }
    
    const client = new OpenAI({ apiKey });
    const model = config.get('OPENAI_MODEL') || 'gpt-4-turbo-preview';
    const promptManager = PromptManager.getInstance();
    
    const systemPrompt = promptManager.render('plan-name-system', {});
    const userPrompt = promptManager.render('plan-name-user', {
      description: description
    });
    
    const response = await client.chat.completions.create({
      model: model,
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
      logger.warn('LLM returned empty plan name, using fallback');
      return generateFallbackName(description);
    }
    
    // Safety check: if LLM exceeded limit, truncate (shouldn't happen with proper prompt)
    if (cleanName.length > 50) {
      logger.warn(`LLM generated name exceeding 50 chars (${cleanName.length}), truncating: ${cleanName}`);
      return cleanName.substring(0, 50);
    }
    
    return cleanName;
  } catch (error) {
    logger.warn('Failed to generate plan name with LLM, using fallback', error);
    return generateFallbackName(description);
  }
}

/**
 * Fallback name generation if LLM fails
 */
function generateFallbackName(description: string): string {
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

export async function runScenario(
  description: string,
  failFast: boolean = true,
  storage?: IStorage
): Promise<IReportData | null> {
  const logger = new WinstonLogger();
  const config = new EnvConfig();
  
  // Use provided storage or create a temporary one for tracking
  const executionStorage = storage || new InMemoryStorage();
  let testId: string | undefined;
  
  // Initialize components
  const basePlanner = new OpenAIPlanner(config, logger);
  
  // Initialize element discovery service
  const llmDomStrategy = new LLMDOMStrategy(config, logger);
  const elementDiscovery = new MultiStrategyElementDiscovery(
    [llmDomStrategy],
    logger
  );
  
  // Wrap base planner with adaptive planner
  const planner = new AdaptivePlanner(basePlanner, elementDiscovery, config, logger);
  
  // Use unified executor (combines DOM and Vision automatically)
  const unifiedExecutor = new UnifiedExecutor(config, logger, elementDiscovery);
  
  const verifier = new AIVerifier(config, logger);
  const reporter = new StdoutReporter();
  
  // Use adaptive orchestrator for intelligent plan refinement
  const orchestrator = new AdaptiveExecutionOrchestrator(
    unifiedExecutor, // Unified executor handles both DOM and Vision
    unifiedExecutor, // Passed for cleanup compatibility
    verifier,
    planner as AdaptivePlanner,
    elementDiscovery,
    logger,
    executionStorage, // Pass storage for plan persistence
    config
  );

  const scenario: ITestScenario = {
    id: `test-${Date.now()}`,
    name: 'Dynamic Scenario',
    description: description,
  };

  try {
    // Create execution state in storage
    testId = await executionStorage.createExecution(description);
    await executionStorage.updateExecution(testId, {
      status: 'running',
      startedAt: Date.now()
    });

    logger.info('Starting scenario execution', { testId, scenarioId: scenario.id, description: scenario.description });
    
    const plan = await planner.plan(scenario);

    // Ensure plan has phase and name set (default to 'initial' if not set)
    const planWithPhase: IExecutionPlan = {
      ...plan,
      phase: plan.phase || 'initial',
      name: plan.name || await generatePlanName(description),
      createdAt: plan.createdAt || Date.now()
    };
    
    // Persist plan independently
    await executionStorage.savePlan(planWithPhase);

    // Store plan in execution state
    // Note: scenarioId is already set in createExecution() from description hash
    // and should not be overwritten as it's used for grouping executions
    await executionStorage.updateExecution(testId, {
      planId: planWithPhase.id,
      plan: planWithPhase,
      totalSteps: planWithPhase.steps.length,
      currentStep: 0
    });

    const reportData = await orchestrator.execute(planWithPhase, undefined, failFast);
    
    // Store final execution state
    await executionStorage.updateExecution(testId, {
      status: reportData.summary.success ? 'completed' : 'failed',
      completedAt: reportData.summary.endTime,
      reportData,
      currentStep: planWithPhase.steps.length,
      results: reportData.results
    });

    await reporter.report(reportData);
    
    logger.info('Scenario execution completed', { 
      testId,
      scenarioId: scenario.id,
      success: reportData.summary.success,
      duration: reportData.summary.endTime - reportData.summary.startTime
    });
    
    return reportData;
  } catch (error) {
    logger.error('Fatal error during scenario execution', error);
    
    // Update storage with error if we have a testId
    if (testId) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await executionStorage.updateExecution(testId, {
        status: 'failed',
        completedAt: Date.now(),
        error: errorMessage
      }).catch(err => {
        logger.error('Failed to update storage with error state', err);
      });
    }
    
    if (error instanceof Error) {
      logger.error('Error details', { message: error.message, stack: error.stack });
    }
    // Re-throw the error so the API can handle it properly
    throw error;
  }
}

/**
 * Execute a scenario asynchronously and update storage with progress.
 * This function runs in the background and updates the storage as execution progresses.
 */
export async function runScenarioAsync(
  testId: string,
  description: string,
  storage: IStorage,
  failFast: boolean = true
): Promise<void> {
  const logger = new WinstonLogger();
  const config = new EnvConfig();
  
  try {
    // Update status to running
    await storage.updateExecution(testId, {
      status: 'running',
      startedAt: Date.now()
    });

    // Initialize components
    const basePlanner = new OpenAIPlanner(config, logger);
    
    // Initialize element discovery service
    const llmDomStrategy = new LLMDOMStrategy(config, logger);
    const visionAIStrategy = new VisionAIStrategy(config, logger);
    const elementDiscovery = new MultiStrategyElementDiscovery(
      [llmDomStrategy, visionAIStrategy], // DOM first, then Vision AI for semantic concepts
      logger
    );
    
    // Wrap base planner with adaptive planner
    const planner = new AdaptivePlanner(basePlanner, elementDiscovery, config, logger);
    
    // Use unified executor (combines DOM and Vision automatically)
    const unifiedExecutor = new UnifiedExecutor(config, logger, elementDiscovery);
    
    const verifier = new AIVerifier(config, logger);
    const reporter = new StdoutReporter();
    
    // Use adaptive orchestrator for intelligent plan refinement
    const orchestrator = new AdaptiveExecutionOrchestrator(
      unifiedExecutor, // Unified executor handles both DOM and Vision
      unifiedExecutor, // Passed for cleanup compatibility
      verifier,
      planner as AdaptivePlanner,
      elementDiscovery,
      logger,
      storage, // Pass storage for plan persistence
      config
    );

    const scenario: ITestScenario = {
      id: testId,
      name: 'Dynamic Scenario',
      description: description,
    };

    logger.info('Starting async scenario execution', { testId, scenarioId: scenario.id, description });

            // Planning phase
            const plan = await planner.plan(scenario);
            
    // Ensure plan has phase and name set (default to 'initial' if not set)
    const planWithPhase: IExecutionPlan = {
      ...plan,
      phase: plan.phase || 'initial',
      name: plan.name || await generatePlanName(description),
      createdAt: plan.createdAt || Date.now()
    };
            
            // Persist plan independently
            await storage.savePlan(planWithPhase);
            
            // Update storage with plan info
            // Note: scenarioId is already set in createExecution() from description hash
            // and should not be overwritten as it's used for grouping executions
            await storage.updateExecution(testId, {
              planId: planWithPhase.id,
              plan: planWithPhase,
              totalSteps: planWithPhase.steps.length,
              currentStep: 0
            });

    // Execute plan using orchestrator with progress callback
    const reportData = await orchestrator.execute(planWithPhase, async (currentStep, totalSteps, results) => {
      // Update storage with current progress
      await storage.updateExecution(testId, {
        currentStep,
        results
      });
    }, failFast);
    
    // Update storage with final result
    await storage.updateExecution(testId, {
      status: reportData.summary.success ? 'completed' : 'failed',
      completedAt: reportData.summary.endTime,
      reportData,
      currentStep: planWithPhase.steps.length,
      results: reportData.results
    });

    await reporter.report(reportData);
    
    logger.info('Async scenario execution completed', { 
      testId,
      scenarioId: scenario.id,
      success: reportData.summary.success,
      duration: reportData.summary.endTime - reportData.summary.startTime
    });
  } catch (error) {
    logger.error('Fatal error during async scenario execution', error);
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    await storage.updateExecution(testId, {
      status: 'failed',
      completedAt: Date.now(),
      error: errorMessage
    });

    // Re-throw to ensure error is logged
    throw error;
  }
}

/**
 * Execute a plan directly by plan ID (synchronous)
 */
export async function runPlan(
  planId: string,
  failFast: boolean = true,
  storage?: IStorage
): Promise<IReportData | null> {
  const logger = new WinstonLogger();
  const config = new EnvConfig();
  
  // Use provided storage or create a temporary one
  const executionStorage = storage || new InMemoryStorage();
  let testId: string | undefined;
  
  try {
    // Get plan from storage
    const plan = await executionStorage.getPlanByPlanId(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }
    
    // Get scenario description from plan (we need it for creating execution state)
    // Try to find an existing execution with this planId to get the scenario
    const allExecutions = await executionStorage.listExecutions();
    const executionWithPlan = allExecutions.find(e => e.planId === planId);
    const scenarioDescription = executionWithPlan?.scenario || plan.name || `Plan ${planId}`;
    
    // Create execution state
    testId = await executionStorage.createExecution(scenarioDescription);
    await executionStorage.updateExecution(testId, {
      status: 'running',
      startedAt: Date.now()
    });
    
    logger.info('Starting plan execution', { testId, planId, scenarioId: plan.scenarioId });
    
    // Initialize components for execution
    const basePlanner = new OpenAIPlanner(config, logger);
    const llmDomStrategy = new LLMDOMStrategy(config, logger);
    const elementDiscovery = new MultiStrategyElementDiscovery(
      [llmDomStrategy],
      logger
    );
    const planner = new AdaptivePlanner(basePlanner, elementDiscovery, config, logger);
    const unifiedExecutor = new UnifiedExecutor(config, logger, elementDiscovery);
    const verifier = new AIVerifier(config, logger);
    const reporter = new StdoutReporter();
    
    const orchestrator = new AdaptiveExecutionOrchestrator(
      unifiedExecutor,
      unifiedExecutor,
      verifier,
      planner as AdaptivePlanner,
      elementDiscovery,
      logger,
      executionStorage,
      config
    );
    
    // Ensure plan has phase set
    const planWithPhase: IExecutionPlan = {
      ...plan,
      phase: plan.phase || 'initial',
      createdAt: plan.createdAt || Date.now()
    };
    
    // Store plan in execution state
    await executionStorage.updateExecution(testId, {
      planId: planWithPhase.id,
      plan: planWithPhase,
      totalSteps: planWithPhase.steps.length,
      currentStep: 0
    });
    
    // Execute the plan
    const reportData = await orchestrator.execute(planWithPhase, undefined, failFast);
    
    // Store final execution state
    await executionStorage.updateExecution(testId, {
      status: reportData.summary.success ? 'completed' : 'failed',
      completedAt: reportData.summary.endTime,
      reportData,
      currentStep: planWithPhase.steps.length,
      results: reportData.results
    });
    
    await reporter.report(reportData);
    
    logger.info('Plan execution completed', { 
      testId,
      planId,
      success: reportData.summary.success,
      duration: reportData.summary.endTime - reportData.summary.startTime
    });
    
    return reportData;
  } catch (error) {
    logger.error('Fatal error during plan execution', error);
    
    if (testId) {
      await executionStorage.updateExecution(testId, {
        status: 'failed',
        completedAt: Date.now(),
        error: error instanceof Error ? error.message : String(error)
      });
    }
    
    throw error;
  }
}

/**
 * Execute a plan directly by plan ID (asynchronous)
 */
export async function runPlanAsync(
  testId: string,
  planId: string,
  storage: IStorage,
  failFast: boolean = true
): Promise<void> {
  const logger = new WinstonLogger();
  const config = new EnvConfig();
  
  try {
    // Get plan from storage
    const plan = await storage.getPlanByPlanId(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }
    
    logger.info('Starting async plan execution', { testId, planId, scenarioId: plan.scenarioId });
    
    // Initialize components for execution
    const basePlanner = new OpenAIPlanner(config, logger);
    const llmDomStrategy = new LLMDOMStrategy(config, logger);
    const elementDiscovery = new MultiStrategyElementDiscovery(
      [llmDomStrategy],
      logger
    );
    const planner = new AdaptivePlanner(basePlanner, elementDiscovery, config, logger);
    const unifiedExecutor = new UnifiedExecutor(config, logger, elementDiscovery);
    const verifier = new AIVerifier(config, logger);
    const reporter = new StdoutReporter();
    
    const orchestrator = new AdaptiveExecutionOrchestrator(
      unifiedExecutor,
      unifiedExecutor,
      verifier,
      planner as AdaptivePlanner,
      elementDiscovery,
      logger,
      storage,
      config
    );
    
    // Ensure plan has phase set
    const planWithPhase: IExecutionPlan = {
      ...plan,
      phase: plan.phase || 'initial',
      createdAt: plan.createdAt || Date.now()
    };
    
    // Update storage with plan info
    await storage.updateExecution(testId, {
      planId: planWithPhase.id,
      plan: planWithPhase,
      totalSteps: planWithPhase.steps.length,
      currentStep: 0
    });
    
    // Execute the plan
    const reportData = await orchestrator.execute(planWithPhase, undefined, failFast);
    
    // Store final execution state
    await storage.updateExecution(testId, {
      status: reportData.summary.success ? 'completed' : 'failed',
      completedAt: reportData.summary.endTime,
      reportData,
      currentStep: planWithPhase.steps.length,
      results: reportData.results
    });
    
    await reporter.report(reportData);
    
    logger.info('Async plan execution completed', { 
      testId,
      planId,
      success: reportData.summary.success,
      duration: reportData.summary.endTime - reportData.summary.startTime
    });
  } catch (error) {
    logger.error('Fatal error during async plan execution', error);
    
    await storage.updateExecution(testId, {
      status: 'failed',
      completedAt: Date.now(),
      error: error instanceof Error ? error.message : String(error)
    });
    
    throw error;
  }
}

/**
 * Generate a plan asynchronously in the background
 * Reuses existing plan if one exists for the same scenario.
 */
export async function generatePlanAsync(
  planId: string,
  description: string,
  storage: IStorage
): Promise<void> {
  const logger = new WinstonLogger();
  const config = new EnvConfig();
  
  try {
    // Check if a plan already exists for this scenario
    const scenarioId = storage.generateScenarioId(description);
    const existingPlans = await storage.getPlansByScenarioId(scenarioId);
    
    if (existingPlans.length > 0) {
      // Reuse the most recent plan (by createdAt)
      const latestPlan = existingPlans.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
      
      // Update the plan ID to match the requested one (in case user wants a specific ID)
      const reusedPlan: IExecutionPlan = {
        ...latestPlan,
        id: planId, // Use the requested planId
        createdAt: latestPlan.createdAt || Date.now()
      };
      
      // Save with the new planId
      await storage.savePlan(reusedPlan);
      
      logger.info('Reusing existing plan (async)', { 
        originalPlanId: latestPlan.id,
        newPlanId: planId,
        scenarioId,
        stepsCount: reusedPlan.steps.length 
      });
      return;
    }
    
    // Initialize planner
    const basePlanner = new OpenAIPlanner(config, logger);
    
    // Initialize element discovery service
    const llmDomStrategy = new LLMDOMStrategy(config, logger);
    const elementDiscovery = new MultiStrategyElementDiscovery(
      [llmDomStrategy],
      logger
    );
    
    // Wrap base planner with adaptive planner
    const planner = new AdaptivePlanner(basePlanner, elementDiscovery, config, logger);

    const scenario: ITestScenario = {
      id: scenarioId,
      name: 'Dry Run Scenario',
      description: description,
    };

    logger.info('Generating new plan asynchronously', { planId, scenarioId: scenario.id, description: scenario.description });
    
    const plan = await planner.plan(scenario);
    
    // Extract URL from scenario description and fix navigate actions
    const extractedUrl = extractUrlFromDescription(description);
    if (extractedUrl) {
      // Fix URLs in navigate actions
      plan.steps = plan.steps.map(step => {
        if (step.action?.name === 'navigate' && step.action?.arguments?.url) {
          const currentUrl = step.action.arguments.url as string;
          // If URL is a placeholder (example.com) or doesn't match, replace it
          if (currentUrl.includes('example.com') || !currentUrl.includes(extractedUrl.domain)) {
            step.action.arguments.url = extractedUrl.fullUrl;
            logger.info(`Fixed URL in navigate action (async): ${currentUrl} -> ${extractedUrl.fullUrl}`, {
              stepId: step.id,
              planId,
              scenarioId: scenario.id
            });
          }
        }
        return step;
      });
    }
    
    // Generate plan name - with timeout to avoid blocking
    let planName: string | undefined = plan.name;
    if (!planName) {
      try {
        const namePromise = generatePlanName(description);
        const timeoutPromise = new Promise<string>((resolve) => {
          setTimeout(() => resolve(generateFallbackName(description)), 2000);
        });
        planName = await Promise.race([namePromise, timeoutPromise]);
      } catch (error) {
        logger.warn('Plan name generation failed, using fallback', error);
        planName = generateFallbackName(description);
      }
    }
    
    // Ensure plan has phase and name set
    const planWithPhase: IExecutionPlan = {
      ...plan,
      id: planId, // Use the provided planId
      phase: plan.phase || 'initial',
      name: planName,
      createdAt: plan.createdAt || Date.now()
    };
    
    // Persist plan
    await storage.savePlan(planWithPhase);
    
    logger.info('Plan generated successfully (async)', { 
      planId: planWithPhase.id,
      stepsCount: planWithPhase.steps.length,
      phase: planWithPhase.phase
    });
  } catch (error) {
    logger.error('Failed to generate plan asynchronously', error);
    if (error instanceof Error) {
      logger.error('Error details', { message: error.message, stack: error.stack });
    }
    // Don't throw - this is async, errors are logged
  }
}

/**
 * Generate a plan for a scenario without executing it (dry run).
 * Useful for testing and debugging to see what plan would be generated.
 * Reuses existing plan if one exists for the same scenario.
 */
export async function generatePlan(
  description: string,
  storage?: IStorage
): Promise<IExecutionPlan> {
  const logger = new WinstonLogger();
  const config = new EnvConfig();
  
  // Check if we have storage and if a plan already exists for this scenario
  if (storage) {
    const scenarioId = storage.generateScenarioId(description);
    const existingPlans = await storage.getPlansByScenarioId(scenarioId);
    
    if (existingPlans.length > 0) {
      // Return the most recent plan (by createdAt)
      const latestPlan = existingPlans.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
      logger.info('Reusing existing plan', { 
        planId: latestPlan.id, 
        scenarioId,
        stepsCount: latestPlan.steps.length 
      });
      return latestPlan;
    }
  }
  
  // Initialize planner
  const basePlanner = new OpenAIPlanner(config, logger);
  
  // Initialize element discovery service
  const llmDomStrategy = new LLMDOMStrategy(config, logger);
  const elementDiscovery = new MultiStrategyElementDiscovery(
    [llmDomStrategy],
    logger
  );
  
  // Wrap base planner with adaptive planner
  const planner = new AdaptivePlanner(basePlanner, elementDiscovery, config, logger);

  const scenario: ITestScenario = {
    id: storage ? storage.generateScenarioId(description) : `scenario-${Date.now()}`,
    name: 'Dry Run Scenario',
    description: description,
  };

  try {
    logger.info('Generating new plan (dry run)', { scenarioId: scenario.id, description: scenario.description });
    
    const plan = await planner.plan(scenario);
    
    // Extract URL from scenario description and fix navigate actions
    const extractedUrl = extractUrlFromDescription(description);
    if (extractedUrl) {
      // Fix URLs in navigate actions
      plan.steps = plan.steps.map(step => {
        if (step.action?.name === 'navigate' && step.action?.arguments?.url) {
          const currentUrl = step.action.arguments.url as string;
          // If URL is a placeholder (example.com) or doesn't match, replace it
          if (currentUrl.includes('example.com') || !currentUrl.includes(extractedUrl.domain)) {
            step.action.arguments.url = extractedUrl.fullUrl;
            logger.info(`Fixed URL in navigate action: ${currentUrl} -> ${extractedUrl.fullUrl}`, {
              stepId: step.id,
              scenarioId: scenario.id
            });
          }
        }
        return step;
      });
    }
    
    // Ensure plan has phase and name set (default to 'initial' if not set)
    const planWithPhase: IExecutionPlan = {
      ...plan,
      phase: plan.phase || 'initial',
      name: plan.name || await generatePlanName(description),
      createdAt: plan.createdAt || Date.now()
    };
    
    // Persist plan if storage is provided
    if (storage) {
      await storage.savePlan(planWithPhase);
      logger.info('Plan persisted to storage', { planId: planWithPhase.id, phase: planWithPhase.phase });
    }
    
    logger.info('Plan generated successfully', { 
      planId: planWithPhase.id,
      stepsCount: planWithPhase.steps.length,
      phase: planWithPhase.phase
    });
    
    return planWithPhase;
  } catch (error) {
    logger.error('Failed to generate plan', error);
    if (error instanceof Error) {
      logger.error('Error details', { message: error.message, stack: error.stack });
    }
    throw error;
  }
}
