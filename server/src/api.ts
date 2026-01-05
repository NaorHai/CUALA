import express from 'express';
import cors from 'cors';
import { runScenario, runScenarioAsync, generatePlan, generatePlanAsync, runPlan, runPlanAsync } from './index.js';
import { WinstonLogger } from './infra/logger.js';
import { EnvConfig } from './infra/config.js';
import { SafetyChecker } from './infra/safety-checker.js';
import { ConfidenceThresholdService } from './infra/confidence-threshold-service.js';
import { createStorage } from './storage/storage-factory.js';
import { IExecutionPlan } from './types/index.js';
import { ActionType } from './types/confidence-threshold.js';
import { getConfidenceThresholdKey, extractActionTypeFromKey } from './types/config.js';

const app = express();
const port = process.env.PORT || 3001;
const logger = new WinstonLogger();
const config = new EnvConfig();

// Initialize safety checker
const safetyChecker = new SafetyChecker(config, logger);

// Initialize storage (will be set in async initialization)
let storage: Awaited<ReturnType<typeof createStorage>>;
let confidenceThresholdService: ConfidenceThresholdService;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // For Slack slash command form data

// Request logging middleware - before routes
app.use((req, res, next) => {
  logger.info(`Incoming ${req.method} ${req.path}`, { body: req.body });
  console.log(`[MIDDLEWARE] ${req.method} ${req.path}`, JSON.stringify(req.body));
  next();
});

// Greeting page for base URL
app.get('/', (req, res) => {
  logger.info('Greeting page accessed');
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>CUALA - Test Automation Service</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: white;
          border-radius: 12px;
          padding: 40px;
          max-width: 600px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        h1 {
          color: #667eea;
          margin-bottom: 10px;
          font-size: 2.5em;
        }
        .status {
          display: inline-block;
          background: #10b981;
          color: white;
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 0.9em;
          margin-bottom: 30px;
        }
        p {
          color: #4b5563;
          line-height: 1.6;
          margin-bottom: 20px;
        }
        .endpoints {
          background: #f9fafb;
          border-radius: 8px;
          padding: 20px;
          margin-top: 30px;
        }
        .endpoints h2 {
          color: #374151;
          font-size: 1.2em;
          margin-bottom: 15px;
        }
        .endpoint {
          margin-bottom: 10px;
          font-family: 'Courier New', monospace;
          font-size: 0.9em;
          color: #1f2937;
        }
        .method {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 4px;
          font-weight: bold;
          margin-right: 8px;
          font-size: 0.85em;
        }
        .method.post { background: #3b82f6; color: white; }
        .method.get { background: #10b981; color: white; }
        .footer {
          margin-top: 30px;
          text-align: center;
          color: #9ca3af;
          font-size: 0.9em;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🤖 CUALA</h1>
        <span class="status">● Service Running</span>
        <p>
          <strong>Computer-Using Automation Layer Agent</strong>
        </p>
        <p>
          CUALA is a high-performance, deterministic browser automation system designed to execute natural-language test scenarios.
        </p>
        <div class="endpoints">
          <h2>API Endpoints</h2>
          <div class="endpoint">
            <span class="method post">POST</span>
            <code>/api/execute</code> - Execute test scenario synchronously
          </div>
          <div class="endpoint">
            <span class="method post">POST</span>
            <code>/api/execute-async</code> - Execute test scenario asynchronously
          </div>
          <div class="endpoint">
            <span class="method post">POST</span>
            <code>/api/plan</code> - Generate execution plan (dry run)
          </div>
          <div class="endpoint">
            <span class="method get">GET</span>
            <code>/api/get-status/:testId</code> - Get execution status
          </div>
          <div class="endpoint">
            <span class="method get">GET</span>
            <code>/api/get-history/:scenarioId</code> - Get execution history
          </div>
          <div class="endpoint">
            <span class="method get">GET</span>
            <code>/api/get-latest/:scenarioId</code> - Get latest execution
          </div>
          <div class="endpoint">
            <span class="method get">GET</span>
            <code>/api/list-plans</code> - List all execution plans
          </div>
          <div class="endpoint">
            <span class="method get">GET</span>
            <code>/health</code> - Health check
          </div>
          <div class="endpoint">
            <span class="method post">POST</span>
            <code>/api/slack/command</code> - Slack command endpoint (free-text to API)
          </div>
        </div>
        <div class="footer">
          Version 0.1.0 | Port ${port}
        </div>
      </div>
    </body>
    </html>
  `);
});

// POST endpoint for base URL
app.post('/', (req, res) => {
  logger.info('POST request to base URL');
  res.json({
    service: 'CUALA',
    description: 'Computer-Using Automation Layer Agent',
    version: '0.1.0',
    status: 'running',
    port: port,
    timestamp: Date.now(),
    endpoints: {
      execute: {
        method: 'POST',
        path: '/api/execute',
        description: 'Execute test scenario synchronously'
      },
      executeAsync: {
        method: 'POST',
        path: '/api/execute-async',
        description: 'Execute test scenario asynchronously'
      },
      plan: {
        method: 'POST',
        path: '/api/plan',
        description: 'Generate execution plan (dry run)'
      },
      getStatus: {
        method: 'GET',
        path: '/api/get-status/:testId',
        description: 'Get execution status'
      },
      getAllStatuses: {
        method: 'GET',
        path: '/api/get-all-statuses',
        description: 'Get all test execution statuses'
      },
      deleteExecution: {
        method: 'DELETE',
        path: '/api/executions/:testId',
        description: 'Delete a specific execution by test ID'
      },
      deleteAllExecutions: {
        method: 'DELETE',
        path: '/api/executions',
        description: 'Delete all executions from storage'
      },
      executePlan: {
        method: 'POST',
        path: '/api/plans/:planId/execute',
        description: 'Execute a plan by plan ID (synchronous)'
      },
      executePlanAsync: {
        method: 'POST',
        path: '/api/plans/:planId/execute-async',
        description: 'Execute a plan by plan ID (asynchronous)'
      },
      updatePlan: {
        method: 'PUT',
        path: '/api/plans/:planId',
        description: 'Update a plan by plan ID'
      },
      deletePlan: {
        method: 'DELETE',
        path: '/api/plans/:planId',
        description: 'Delete a plan by plan ID'
      },
      deleteAllPlans: {
        method: 'DELETE',
        path: '/api/plans',
        description: 'Delete all plans from storage'
      },
      getHistory: {
        method: 'GET',
        path: '/api/get-history/:scenarioId',
        description: 'Get execution history'
      },
      getLatest: {
        method: 'GET',
        path: '/api/get-latest/:scenarioId',
        description: 'Get latest execution'
      },
      listPlans: {
        method: 'GET',
        path: '/api/list-plans',
        description: 'List all execution plans'
      },
      health: {
        method: 'GET',
        path: '/health',
        description: 'Health check'
      },
      slackCommand: {
        method: 'POST',
        path: '/api/slack/command',
        description: 'Slack command endpoint - accepts free-text commands and converts to API calls'
      }
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  console.log('[HEALTH] Health endpoint called');
  logger.info('Health check endpoint called');
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.post('/api/execute', async (req, res) => {
  const requestId = `req-${Date.now()}`;
  const { scenario, failFast, planId } = req.body;

  logger.info(`[${requestId}] API Request received`, { scenario, planId });
  console.log(`[${requestId}] API Request received:`, { scenario, planId });
  console.log(`[${requestId}] Request body:`, JSON.stringify(req.body, null, 2));

  // If planId is provided, use it; otherwise require scenario
  if (planId) {
    try {
      // Check if plan exists
      const plan = await storage.getPlanByPlanId(planId);
      if (!plan) {
        logger.warn(`[${requestId}] Plan not found`, { planId });
        return res.status(404).json({ 
          error: 'Plan not found',
          planId 
        });
      }

      // Default failFast to true if not provided
      const shouldFailFast = failFast !== undefined ? failFast : true;
      
      logger.info(`[${requestId}] Executing plan: ${planId}, failFast: ${shouldFailFast}`);
      console.log(`[${requestId}] Starting plan execution...`);
      
      const result = await runPlan(planId, shouldFailFast, storage);
      console.log(`[${requestId}] Plan execution completed, result:`, result ? `SUCCESS (${result.summary.success ? 'PASSED' : 'FAILED'})` : 'NULL');

      if (result) {
        logger.info(`[${requestId}] Plan execution completed successfully`, { 
          planId: result.planId,
          success: result.summary.success 
        });
        
        return res.json({
          scenarioId: result.scenarioId,
          planId: result.planId,
          planName: plan.name || undefined,
          steps: result.results,
          startTime: result.summary.startTime,
          endTime: result.summary.endTime,
          status: result.summary.success ? 'completed' : 'failed',
          reason: result.summary.reason,
        });
      } else {
        logger.error(`[${requestId}] Plan execution returned null result`);
        return res.status(500).json({ 
          error: 'Plan execution failed to produce a result',
          message: 'runPlan returned null unexpectedly'
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      logger.error(`[${requestId}] API Error during plan execution`, error);
      console.error(`[${requestId}] API ERROR:`, errorMessage);
      
      const errorResponse: Record<string, any> = { 
        error: 'An internal server error occurred',
        message: errorMessage
      };
      
      if (process.env.NODE_ENV === 'development' && errorStack) {
        errorResponse.stack = errorStack;
      }
      
      return res.status(500).json(errorResponse);
    }
  }

  // Original flow: execute from scenario description
  if (!scenario) {
    logger.warn(`[${requestId}] API Request rejected: Missing scenario or planId`);
    return res.status(400).json({ error: 'Either scenario description or planId is required' });
  }

  // Safety check for scenario
  const safetyCheck = await safetyChecker.checkScenario(scenario);
  if (!safetyCheck.isSafe) {
    logger.warn(`[${requestId}] Scenario failed safety check`, { 
      reason: safetyCheck.reason,
      categories: safetyCheck.categories 
    });
    return res.status(400).json({ 
      error: 'Scenario failed safety check',
      message: safetyCheck.reason || 'The provided scenario contains inappropriate or malicious content and cannot be processed.',
      details: safetyCheck.categories ? { flaggedCategories: safetyCheck.categories } : undefined
    });
  }

  try {
    // Default failFast to true if not provided (maintains current behavior)
    const shouldFailFast = failFast !== undefined ? failFast : true;
    
    logger.info(`[${requestId}] Executing scenario: "${scenario}", failFast: ${shouldFailFast}`);
    console.log(`[${requestId}] Starting scenario execution...`);
    
    // Use the shared storage instance so sync executions are also stored
    const result = await runScenario(scenario, shouldFailFast, storage);
    console.log(`[${requestId}] Scenario execution completed, result:`, result ? `SUCCESS (${result.summary.success ? 'PASSED' : 'FAILED'})` : 'NULL');

    if (result) {
      logger.info(`[${requestId}] Scenario execution completed successfully`, { 
        scenarioId: result.scenarioId,
        success: result.summary.success 
      });
      // Get plan name from storage
      let planName: string | undefined;
      if (result.planId) {
        const plan = await storage.getPlanByPlanId(result.planId);
        planName = plan?.name;
      }
      
      // Consolidate response - move summary to root, remove nested reportData structure
      return res.json({
        scenarioId: result.scenarioId,
        planId: result.planId,
        planName: planName || undefined,
        steps: result.results,
        startTime: result.summary.startTime,
        endTime: result.summary.endTime,
        status: result.summary.success ? 'completed' : 'failed',
        reason: result.summary.reason,
      });
    } else {
      logger.error(`[${requestId}] Scenario execution returned null result - this should not happen`);
      return res.status(500).json({ 
        error: 'Test execution failed to produce a result',
        message: 'runScenario returned null unexpectedly'
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    logger.error(`[${requestId}] API Error during scenario execution`, error);
    if (error instanceof Error) {
      logger.error(`[${requestId}] Error stack trace`, { stack: error.stack });
    }
    
    // Also log to console for immediate debugging
    console.error(`[${requestId}] API ERROR:`, errorMessage);
    console.error(`[${requestId}] ERROR TYPE:`, error instanceof Error ? error.constructor.name : typeof error);
    if (errorStack) {
      console.error(`[${requestId}] STACK:`, errorStack);
    }
    
    // Return the actual error details to the client - ensure all fields are included
    const errorResponse: Record<string, any> = { 
      error: 'An internal server error occurred',
      message: errorMessage
    };
    
    if (process.env.NODE_ENV === 'development' && errorStack) {
      errorResponse.stack = errorStack;
    }
    
    if (error instanceof Error) {
      errorResponse.details = {
        name: error.name,
        message: error.message
      };
      if (error.cause) {
        errorResponse.details.cause = error.cause;
      }
    }
    
    console.log(`[${requestId}] Sending error response:`, JSON.stringify(errorResponse, null, 2));
    return res.status(500).json(errorResponse);
  }
});

// Async execution endpoint - returns immediately with test ID
app.post('/api/execute-async', async (req, res) => {
  const requestId = `req-${Date.now()}`;
  const { scenario, failFast, planId } = req.body;

  logger.info(`[${requestId}] Async API Request received`, { scenario, planId });
  console.log(`[${requestId}] Async API Request received:`, { scenario, planId });

  // If planId is provided, use it; otherwise require scenario
  if (planId) {
    try {
      // Check if plan exists
      const plan = await storage.getPlanByPlanId(planId);
      if (!plan) {
        logger.warn(`[${requestId}] Plan not found`, { planId });
        return res.status(404).json({ 
          error: 'Plan not found',
          planId 
        });
      }

      // Get scenario description from plan or existing execution
      const allExecutions = await storage.listExecutions();
      const executionWithPlan = allExecutions.find(e => e.planId === planId);
      const scenarioDescription = executionWithPlan?.scenario || plan.name || `Plan ${planId}`;
      
      // Create execution state
      const testId = await storage.createExecution(scenarioDescription);
      
      logger.info(`[${requestId}] Created async plan execution`, { testId, planId });
      console.log(`[${requestId}] Created async plan execution with testId: ${testId}`);

      // Default failFast to true if not provided
      const shouldFailFast = failFast !== undefined ? failFast : true;
      
      logger.info(`[${requestId}] Starting async plan execution with failFast: ${shouldFailFast}`);
      
      // Start execution in background (don't await)
      runPlanAsync(testId, planId, storage, shouldFailFast).catch((error) => {
        logger.error(`[${requestId}] Background plan execution error for ${testId}`, error);
        console.error(`[${requestId}] Background plan execution error for ${testId}:`, error);
      });

      // Get the execution to retrieve scenarioId
      const execution = await storage.getExecution(testId);
      
      // Return immediately with test ID and scenarioId
      return res.json({
        testId,
        planId,
        planName: plan.name || undefined,
        scenarioId: execution?.scenarioId,
        status: 'pending',
        message: 'Plan execution started. Use GET /api/get-status/:testId to check progress.'
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      logger.error(`[${requestId}] Async API Error`, error);
      console.error(`[${requestId}] Async API ERROR:`, errorMessage);
      
      const errorResponse: Record<string, any> = { 
        error: 'Failed to start async plan execution',
        message: errorMessage
      };
      
      if (process.env.NODE_ENV === 'development' && errorStack) {
        errorResponse.stack = errorStack;
      }
      
      return res.status(500).json(errorResponse);
    }
  }

  // Original flow: execute from scenario description
  if (!scenario) {
    logger.warn(`[${requestId}] Async API Request rejected: Missing scenario or planId`);
    return res.status(400).json({ error: 'Either scenario description or planId is required' });
  }

  // Safety check for scenario
  const safetyCheck = await safetyChecker.checkScenario(scenario);
  if (!safetyCheck.isSafe) {
    logger.warn(`[${requestId}] Scenario failed safety check`, { 
      reason: safetyCheck.reason,
      categories: safetyCheck.categories 
    });
    return res.status(400).json({ 
      error: 'Scenario failed safety check',
      message: safetyCheck.reason || 'The provided scenario contains inappropriate or malicious content and cannot be processed.',
      details: safetyCheck.categories ? { flaggedCategories: safetyCheck.categories } : undefined
    });
  }

  try {
    // Create execution state
    const testId = await storage.createExecution(scenario);
    
    logger.info(`[${requestId}] Created async execution`, { testId, scenario });
    console.log(`[${requestId}] Created async execution with testId: ${testId}`);

    // Default failFast to true if not provided (maintains current behavior)
    const shouldFailFast = failFast !== undefined ? failFast : true;
    
    logger.info(`[${requestId}] Starting async execution with failFast: ${shouldFailFast}`);
    
    // Start execution in background (don't await)
    runScenarioAsync(testId, scenario, storage, shouldFailFast).catch((error) => {
      logger.error(`[${requestId}] Background execution error for ${testId}`, error);
      console.error(`[${requestId}] Background execution error for ${testId}:`, error);
    });

    // Get the execution to retrieve scenarioId
    const execution = await storage.getExecution(testId);
    
    // Return immediately with test ID and scenarioId
    return res.json({
      testId,
      scenarioId: execution?.scenarioId,
      status: 'pending',
      message: 'Test execution started. Use GET /api/get-status/:testId to check progress, or GET /api/get-history/:scenarioId to view execution history.'
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    logger.error(`[${requestId}] Async API Error`, error);
    console.error(`[${requestId}] Async API ERROR:`, errorMessage);
    
    const errorResponse: Record<string, any> = { 
      error: 'Failed to start async execution',
      message: errorMessage
    };
    
    if (process.env.NODE_ENV === 'development' && errorStack) {
      errorResponse.stack = errorStack;
    }
    
    return res.status(500).json(errorResponse);
  }
});

// Execute plan by plan ID (synchronous)
app.post('/api/execute-plan/:planId', async (req, res) => {
  const { planId } = req.params;
  const requestId = `req-${Date.now()}`;
  const { failFast } = req.body;

  logger.info(`[${requestId}] Execute plan request for planId: ${planId}`);
  console.log(`[${requestId}] Execute plan request for planId: ${planId}`);

  try {
    // Check if plan exists
    const plan = await storage.getPlanByPlanId(planId);
    if (!plan) {
      logger.warn(`[${requestId}] Plan not found`, { planId });
      return res.status(404).json({ 
        error: 'Plan not found',
        planId 
      });
    }

    // Default failFast to true if not provided
    const shouldFailFast = failFast !== undefined ? failFast : true;
    
    logger.info(`[${requestId}] Executing plan: ${planId}, failFast: ${shouldFailFast}`);
    console.log(`[${requestId}] Starting plan execution...`);
    
    const result = await runPlan(planId, shouldFailFast, storage);
    console.log(`[${requestId}] Plan execution completed, result:`, result ? `SUCCESS (${result.summary.success ? 'PASSED' : 'FAILED'})` : 'NULL');

    if (result) {
      logger.info(`[${requestId}] Plan execution completed successfully`, { 
        planId: result.planId,
        success: result.summary.success 
      });
      
      return res.json({
        scenarioId: result.scenarioId,
        planId: result.planId,
        planName: plan.name || undefined,
        steps: result.results,
        startTime: result.summary.startTime,
        endTime: result.summary.endTime,
        status: result.summary.success ? 'completed' : 'failed',
        reason: result.summary.reason,
      });
    } else {
      logger.error(`[${requestId}] Plan execution returned null result`);
      return res.status(500).json({ 
        error: 'Plan execution failed to produce a result',
        message: 'runPlan returned null unexpectedly'
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    logger.error(`[${requestId}] API Error during plan execution`, error);
    console.error(`[${requestId}] API ERROR:`, errorMessage);
    
    const errorResponse: Record<string, any> = { 
      error: 'An internal server error occurred',
      message: errorMessage
    };
    
    if (process.env.NODE_ENV === 'development' && errorStack) {
      errorResponse.stack = errorStack;
    }
    
    return res.status(500).json(errorResponse);
  }
});

// Execute plan by plan ID (asynchronous)
app.post('/api/execute-plan-async/:planId', async (req, res) => {
  const { planId } = req.params;
  const requestId = `req-${Date.now()}`;
  const { failFast } = req.body;

  logger.info(`[${requestId}] Async execute plan request for planId: ${planId}`);
  console.log(`[${requestId}] Async execute plan request for planId: ${planId}`);

  try {
    // Check if plan exists
    const plan = await storage.getPlanByPlanId(planId);
    if (!plan) {
      logger.warn(`[${requestId}] Plan not found`, { planId });
      return res.status(404).json({ 
        error: 'Plan not found',
        planId 
      });
    }

    // Get scenario description from plan or existing execution
    const allExecutions = await storage.listExecutions();
    const executionWithPlan = allExecutions.find(e => e.planId === planId);
    const scenarioDescription = executionWithPlan?.scenario || plan.name || `Plan ${planId}`;
    
    // Create execution state
    const testId = await storage.createExecution(scenarioDescription);
    
    logger.info(`[${requestId}] Created async plan execution`, { testId, planId });
    console.log(`[${requestId}] Created async plan execution with testId: ${testId}`);

    // Default failFast to true if not provided
    const shouldFailFast = failFast !== undefined ? failFast : true;
    
    logger.info(`[${requestId}] Starting async plan execution with failFast: ${shouldFailFast}`);
    
    // Start execution in background (don't await)
    runPlanAsync(testId, planId, storage, shouldFailFast).catch((error) => {
      logger.error(`[${requestId}] Background plan execution error for ${testId}`, error);
      console.error(`[${requestId}] Background plan execution error for ${testId}:`, error);
    });

    // Get the execution to retrieve scenarioId
    const execution = await storage.getExecution(testId);
    
    // Return immediately with test ID and scenarioId
    return res.json({
      testId,
      planId,
      planName: plan.name || undefined,
      scenarioId: execution?.scenarioId,
      status: 'pending',
      message: 'Plan execution started. Use GET /api/get-status/:testId to check progress.'
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    logger.error(`[${requestId}] Async API Error`, error);
    console.error(`[${requestId}] Async API ERROR:`, errorMessage);
    
    const errorResponse: Record<string, any> = { 
      error: 'Failed to start async plan execution',
      message: errorMessage
    };
    
    if (process.env.NODE_ENV === 'development' && errorStack) {
      errorResponse.stack = errorStack;
    }
    
    return res.status(500).json(errorResponse);
  }
});

// Dedicated API endpoints for plan execution
// POST /api/plans/:planId/execute - Execute plan synchronously
app.post('/api/plans/:planId/execute', async (req, res) => {
  const { planId } = req.params;
  const requestId = `req-${Date.now()}`;
  const { failFast } = req.body;

  logger.info(`[${requestId}] Execute plan request (dedicated API) for planId: ${planId}`);
  console.log(`[${requestId}] Execute plan request (dedicated API) for planId: ${planId}`);

  try {
    // Check if plan exists
    const plan = await storage.getPlanByPlanId(planId);
    if (!plan) {
      logger.warn(`[${requestId}] Plan not found`, { planId });
      return res.status(404).json({ 
        error: 'Plan not found',
        planId 
      });
    }

    // Default failFast to true if not provided
    const shouldFailFast = failFast !== undefined ? failFast : true;
    
    logger.info(`[${requestId}] Executing plan: ${planId}, failFast: ${shouldFailFast}`);
    console.log(`[${requestId}] Starting plan execution...`);
    
    const result = await runPlan(planId, shouldFailFast, storage);
    console.log(`[${requestId}] Plan execution completed, result:`, result ? `SUCCESS (${result.summary.success ? 'PASSED' : 'FAILED'})` : 'NULL');

    if (result) {
      logger.info(`[${requestId}] Plan execution completed successfully`, { 
        planId: result.planId,
        success: result.summary.success 
      });
      
      return res.json({
        scenarioId: result.scenarioId,
        planId: result.planId,
        planName: plan.name || undefined,
        steps: result.results,
        startTime: result.summary.startTime,
        endTime: result.summary.endTime,
        status: result.summary.success ? 'completed' : 'failed',
        reason: result.summary.reason,
      });
    } else {
      logger.error(`[${requestId}] Plan execution returned null result`);
      return res.status(500).json({ 
        error: 'Plan execution failed to produce a result',
        message: 'runPlan returned null unexpectedly'
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    logger.error(`[${requestId}] API Error during plan execution`, error);
    console.error(`[${requestId}] API ERROR:`, errorMessage);
    
    const errorResponse: Record<string, any> = { 
      error: 'An internal server error occurred',
      message: errorMessage
    };
    
    if (process.env.NODE_ENV === 'development' && errorStack) {
      errorResponse.stack = errorStack;
    }
    
    return res.status(500).json(errorResponse);
  }
});

// POST /api/plans/:planId/execute-async - Execute plan asynchronously
app.post('/api/plans/:planId/execute-async', async (req, res) => {
  const { planId } = req.params;
  const requestId = `req-${Date.now()}`;
  const { failFast } = req.body;

  logger.info(`[${requestId}] Async execute plan request (dedicated API) for planId: ${planId}`);
  console.log(`[${requestId}] Async execute plan request (dedicated API) for planId: ${planId}`);

  try {
    // Check if plan exists
    const plan = await storage.getPlanByPlanId(planId);
    if (!plan) {
      logger.warn(`[${requestId}] Plan not found`, { planId });
      return res.status(404).json({ 
        error: 'Plan not found',
        planId 
      });
    }

    // Get scenario description from plan or existing execution
    const allExecutions = await storage.listExecutions();
    const executionWithPlan = allExecutions.find(e => e.planId === planId);
    const scenarioDescription = executionWithPlan?.scenario || plan.name || `Plan ${planId}`;
    
    // Create execution state
    const testId = await storage.createExecution(scenarioDescription);
    
    logger.info(`[${requestId}] Created async plan execution`, { testId, planId });
    console.log(`[${requestId}] Created async plan execution with testId: ${testId}`);

    // Default failFast to true if not provided
    const shouldFailFast = failFast !== undefined ? failFast : true;
    
    logger.info(`[${requestId}] Starting async plan execution with failFast: ${shouldFailFast}`);
    
    // Start execution in background (don't await)
    runPlanAsync(testId, planId, storage, shouldFailFast).catch((error) => {
      logger.error(`[${requestId}] Background plan execution error for ${testId}`, error);
      console.error(`[${requestId}] Background plan execution error for ${testId}:`, error);
    });

    // Get the execution to retrieve scenarioId
    const execution = await storage.getExecution(testId);
    
    // Return immediately with test ID and scenarioId
    return res.json({
      testId,
      planId,
      planName: plan.name || undefined,
      scenarioId: execution?.scenarioId,
      status: 'pending',
      message: 'Plan execution started. Use GET /api/get-status/:testId to check progress.'
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    logger.error(`[${requestId}] Async API Error`, error);
    console.error(`[${requestId}] Async API ERROR:`, errorMessage);
    
    const errorResponse: Record<string, any> = { 
      error: 'Failed to start async plan execution',
      message: errorMessage
    };
    
    if (process.env.NODE_ENV === 'development' && errorStack) {
      errorResponse.stack = errorStack;
    }
    
    return res.status(500).json(errorResponse);
  }
});

// Get execution status endpoint - by testId
app.get('/api/get-status/:testId', async (req, res) => {
  const { testId } = req.params;
  const requestId = `req-${Date.now()}`;

  logger.info(`[${requestId}] Status request for testId: ${testId}`);
  console.log(`[${requestId}] Status request for testId: ${testId}`);

  try {
    const execution = await storage.getExecution(testId);
    
    if (!execution) {
      logger.warn(`[${requestId}] Execution not found`, { testId });
      return res.status(404).json({ 
        error: 'Execution not found',
        testId 
      });
    }

    // Consolidate response - use reportData if available, otherwise use root level data
    const reportData = execution.reportData;
    const steps = reportData?.results || execution.results;
    const summary = reportData?.summary;
    const planId = execution.planId || reportData?.planId;
    
    // Get plan name from stored plan or fetch it
    let planName: string | undefined;
    if (execution.plan?.name) {
      planName = execution.plan.name;
    } else if (planId) {
      const plan = await storage.getPlanByPlanId(planId);
      planName = plan?.name;
    }
    
    return res.json({
      testId: execution.testId,
      scenarioId: execution.scenarioId,
      scenario: execution.scenario,
      status: execution.status,
      createdAt: execution.createdAt,
      startedAt: execution.startedAt || summary?.startTime,
      completedAt: execution.completedAt || summary?.endTime,
      planId: planId,
      planName: planName || undefined,
      currentStep: execution.currentStep,
      totalSteps: execution.totalSteps,
      progress: execution.totalSteps 
        ? Math.round((execution.currentStep || 0) / execution.totalSteps * 100)
        : 0,
      steps,
      startTime: summary?.startTime || execution.startedAt,
      endTime: summary?.endTime || execution.completedAt,
      reason: summary?.reason || execution.error,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.error(`[${requestId}] Error getting execution status`, error);
    console.error(`[${requestId}] Error getting execution status:`, errorMessage);
    
    return res.status(500).json({
      error: 'Failed to get execution status',
      message: errorMessage
    });
  }
});

// Get all test statuses endpoint
app.get('/api/get-all-statuses', async (req, res) => {
  const requestId = `req-${Date.now()}`;

  logger.info(`[${requestId}] All statuses request`);
  console.log(`[${requestId}] All statuses request`);

  try {
    const executions = await storage.listExecutions();
    
    // Transform each execution to status format (similar to get-status but without detailed steps)
    const statuses = await Promise.all(executions.map(async (execution) => {
      const reportData = execution.reportData;
      const summary = reportData?.summary;
      const planId = execution.planId || reportData?.planId;
      
      // Get plan name from stored plan or fetch it
      let planName: string | undefined;
      if (execution.plan?.name) {
        planName = execution.plan.name;
      } else if (planId) {
        const plan = await storage.getPlanByPlanId(planId);
        planName = plan?.name;
      }
      
      return {
        testId: execution.testId,
        scenarioId: execution.scenarioId,
        scenario: execution.scenario,
        status: execution.status,
        createdAt: execution.createdAt,
        startedAt: execution.startedAt || summary?.startTime,
        completedAt: execution.completedAt || summary?.endTime,
        planId: planId,
        planName: planName || undefined,
        currentStep: execution.currentStep,
        totalSteps: execution.totalSteps,
        progress: execution.totalSteps 
          ? Math.round((execution.currentStep || 0) / execution.totalSteps * 100)
          : 0,
        reason: summary?.reason || execution.error,
        duration: (execution.completedAt && execution.startedAt) 
          ? execution.completedAt - execution.startedAt 
          : (summary?.endTime && summary?.startTime)
          ? summary.endTime - summary.startTime
          : null,
      };
    }));
    
    // Sort by creation time (newest first)
    statuses.sort((a, b) => b.createdAt - a.createdAt);
    
    return res.json({
      total: statuses.length,
      statuses: statuses
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.error(`[${requestId}] Error getting all statuses`, error);
    console.error(`[${requestId}] Error getting all statuses:`, errorMessage);
    
    return res.status(500).json({
      error: 'Failed to get all statuses',
      message: errorMessage
    });
  }
});

// Delete a specific execution by test ID
app.delete('/api/executions/:testId', async (req, res) => {
  const { testId } = req.params;
  const requestId = `req-${Date.now()}`;
  
  logger.info(`[${requestId}] Delete execution request for testId: ${testId}`);
  console.log(`[${requestId}] Delete execution request for testId: ${testId}`);
  
  try {
    // Check if execution exists
    const execution = await storage.getExecution(testId);
    if (!execution) {
      logger.warn(`[${requestId}] Execution not found for deletion`, { testId });
      return res.status(404).json({
        error: 'Execution not found',
        testId,
        message: `No execution found with test ID: ${testId}`
      });
    }
    
    // Delete the execution
    await storage.deleteExecution(testId);
    
    logger.info(`[${requestId}] Execution deleted successfully`, { 
      testId,
      scenarioId: execution.scenarioId,
      status: execution.status
    });
    console.log(`[${requestId}] Execution deleted successfully: ${testId}`);
    
    return res.json({
      success: true,
      testId,
      scenarioId: execution.scenarioId,
      message: `Execution ${testId} deleted successfully`
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[${requestId}] Error deleting execution`, error);
    console.error(`[${requestId}] Error deleting execution:`, errorMessage);
    
    return res.status(500).json({
      error: 'Failed to delete execution',
      testId,
      message: errorMessage
    });
  }
});

// Delete all executions
app.delete('/api/executions', async (req, res) => {
  const requestId = `req-${Date.now()}`;

  logger.info(`[${requestId}] Delete all executions request`);
  console.log(`[${requestId}] Delete all executions request`);

  try {
    // Get count of executions before deletion
    const executions = await storage.listExecutions();
    const executionCount = executions.length;

    // Delete all executions
    await storage.deleteAllExecutions();
    
    logger.info(`[${requestId}] All executions deleted successfully`, { deletedCount: executionCount });
    
    return res.json({
      success: true,
      deletedCount: executionCount,
      message: `Successfully deleted ${executionCount} execution(s)`
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.error(`[${requestId}] Error deleting all executions`, error);
    console.error(`[${requestId}] Error deleting all executions:`, errorMessage);
    
    return res.status(500).json({
      error: 'Failed to delete all executions',
      message: errorMessage
    });
  }
});

// Get execution history by scenario ID
app.get('/api/get-history/:scenarioId', async (req, res) => {
  const { scenarioId } = req.params;
  const requestId = `req-${Date.now()}`;

  logger.info(`[${requestId}] History request for scenarioId: ${scenarioId}`);
  console.log(`[${requestId}] History request for scenarioId: ${scenarioId}`);

  try {
    const executions = await storage.getExecutionsByScenarioId(scenarioId);
    
    if (executions.length === 0) {
      logger.warn(`[${requestId}] No executions found for scenarioId`, { scenarioId });
      
      // Provide helpful error message with suggestion to get scenarioId from description
      const allExecutions = await storage.listExecutions();
      const availableScenarioIds = [...new Set(allExecutions.map(e => e.scenarioId))];
      
      return res.status(404).json({ 
        error: 'No executions found for this scenario',
        scenarioId,
        hint: 'Make sure you are using the scenarioId returned from the execute or execute-async endpoint. The scenarioId is generated from the scenario description hash.',
        availableScenarioIds: availableScenarioIds.length > 0 ? availableScenarioIds.slice(0, 10) : [],
        totalAvailableScenarios: availableScenarioIds.length
      });
    }

    // Return execution history with summary for each execution
    return res.json({
      scenarioId,
      totalExecutions: executions.length,
      executions: await Promise.all(executions.map(async (exec) => {
        const summary = exec.reportData?.summary;
        const planId = exec.planId || exec.reportData?.planId;
        
        // Get plan name from stored plan or fetch it
        let planName: string | undefined;
        if (exec.plan?.name) {
          planName = exec.plan.name;
        } else if (planId) {
          const plan = await storage.getPlanByPlanId(planId);
          planName = plan?.name;
        }
        
        return {
          testId: exec.testId,
          planId: planId,
          planName: planName || undefined,
          status: exec.status,
          createdAt: exec.createdAt,
          startedAt: exec.startedAt || summary?.startTime,
          completedAt: exec.completedAt || summary?.endTime,
          progress: exec.totalSteps 
            ? Math.round((exec.currentStep || 0) / exec.totalSteps * 100)
            : 0,
          reason: summary?.reason || exec.error,
          duration: (exec.completedAt && exec.startedAt) 
            ? exec.completedAt - exec.startedAt 
            : (summary?.endTime && summary?.startTime)
            ? summary.endTime - summary.startTime
            : null,
        };
      }))
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.error(`[${requestId}] Error getting execution history`, error);
    console.error(`[${requestId}] Error getting execution history:`, errorMessage);
    
    return res.status(500).json({
      error: 'Failed to get execution history',
      message: errorMessage
    });
  }
});

// Get latest execution by scenario ID
app.get('/api/get-latest/:scenarioId', async (req, res) => {
  const { scenarioId } = req.params;
  const requestId = `req-${Date.now()}`;

  logger.info(`[${requestId}] Latest execution request for scenarioId: ${scenarioId}`);
  console.log(`[${requestId}] Latest execution request for scenarioId: ${scenarioId}`);

  try {
    const execution = await storage.getLatestExecutionByScenarioId(scenarioId);
    
    if (!execution) {
      logger.warn(`[${requestId}] No execution found for scenarioId`, { scenarioId });
      
      // Provide helpful error message with suggestion
      const allExecutions = await storage.listExecutions();
      const availableScenarioIds = [...new Set(allExecutions.map(e => e.scenarioId))];
      
      return res.status(404).json({ 
        error: 'No execution found for this scenario',
        scenarioId,
        hint: 'Make sure you are using the scenarioId returned from the execute or execute-async endpoint. The scenarioId is generated from the scenario description hash.',
        availableScenarioIds: availableScenarioIds.length > 0 ? availableScenarioIds.slice(0, 10) : [],
        totalAvailableScenarios: availableScenarioIds.length
      });
    }

    // Consolidate response - use reportData if available, otherwise use root level data
    const reportData = execution.reportData;
    const steps = reportData?.results || execution.results;
    const summary = reportData?.summary;
    const planId = execution.planId || reportData?.planId;
    
    // Get plan name from stored plan or fetch it
    let planName: string | undefined;
    if (execution.plan?.name) {
      planName = execution.plan.name;
    } else if (planId) {
      const plan = await storage.getPlanByPlanId(planId);
      planName = plan?.name;
    }
    
    return res.json({
      testId: execution.testId,
      scenarioId: execution.scenarioId,
      scenario: execution.scenario,
      status: execution.status,
      createdAt: execution.createdAt,
      startedAt: execution.startedAt || summary?.startTime,
      completedAt: execution.completedAt || summary?.endTime,
      planId: planId,
      planName: planName || undefined,
      currentStep: execution.currentStep,
      totalSteps: execution.totalSteps,
      progress: execution.totalSteps 
        ? Math.round((execution.currentStep || 0) / execution.totalSteps * 100)
        : 0,
      steps,
      startTime: summary?.startTime || execution.startedAt,
      endTime: summary?.endTime || execution.completedAt,
      reason: summary?.reason || execution.error,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.error(`[${requestId}] Error getting latest execution`, error);
    console.error(`[${requestId}] Error getting latest execution:`, errorMessage);
    
    return res.status(500).json({
      error: 'Failed to get latest execution',
      message: errorMessage
    });
  }
});

// Update plan by plan ID
app.put('/api/plans/:planId', async (req, res) => {
  const { planId } = req.params;
  const updates = req.body;
  const requestId = `req-${Date.now()}`;

  logger.info(`[${requestId}] Update plan request for planId: ${planId}`, { updates });
  console.log(`[${requestId}] Update plan request for planId: ${planId}`);

  try {
    // Check if plan exists
    const plan = await storage.getPlanByPlanId(planId);
    if (!plan) {
      logger.warn(`[${requestId}] Plan not found for update`, { planId });
      return res.status(404).json({ 
        error: 'Plan not found',
        planId 
      });
    }

    // Validate that id and scenarioId are not being changed
    if (updates.id && updates.id !== planId) {
      return res.status(400).json({ 
        error: 'Cannot change plan ID',
        planId 
      });
    }
    if (updates.scenarioId && updates.scenarioId !== plan.scenarioId) {
      return res.status(400).json({ 
        error: 'Cannot change scenario ID',
        planId 
      });
    }

    // Update the plan
    await storage.updatePlan(planId, updates);
    
    // Get the updated plan
    const updatedPlan = await storage.getPlanByPlanId(planId);
    
    logger.info(`[${requestId}] Plan updated successfully`, { planId });
    
    return res.json({
      success: true,
      planId: updatedPlan!.id,
      scenarioId: updatedPlan!.scenarioId,
      name: updatedPlan!.name || 'Unnamed Plan',
      phase: updatedPlan!.phase || 'initial',
      steps: updatedPlan!.steps,
      totalSteps: updatedPlan!.steps.length,
      refinementHistory: updatedPlan!.refinementHistory || [],
      createdAt: updatedPlan!.createdAt,
      message: 'Plan updated successfully'
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.error(`[${requestId}] Error updating plan`, error);
    console.error(`[${requestId}] Error updating plan:`, errorMessage);
    
    return res.status(500).json({
      error: 'Failed to update plan',
      message: errorMessage
    });
  }
});

// Delete plan by plan ID
app.delete('/api/plans/:planId', async (req, res) => {
  const { planId } = req.params;
  const requestId = `req-${Date.now()}`;

  logger.info(`[${requestId}] Delete plan request for planId: ${planId}`);
  console.log(`[${requestId}] Delete plan request for planId: ${planId}`);

  try {
    // Check if plan exists
    const plan = await storage.getPlanByPlanId(planId);
    if (!plan) {
      logger.warn(`[${requestId}] Plan not found for deletion`, { planId });
      return res.status(404).json({ 
        error: 'Plan not found',
        planId 
      });
    }

    // Delete the plan
    await storage.deletePlan(planId);
    
    logger.info(`[${requestId}] Plan deleted successfully`, { planId });
    
    return res.json({
      success: true,
      planId,
      message: 'Plan deleted successfully'
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.error(`[${requestId}] Error deleting plan`, error);
    console.error(`[${requestId}] Error deleting plan:`, errorMessage);
    
    return res.status(500).json({
      error: 'Failed to delete plan',
      message: errorMessage
    });
  }
});

// Delete all plans
app.delete('/api/plans', async (req, res) => {
  const requestId = `req-${Date.now()}`;

  logger.info(`[${requestId}] Delete all plans request`);
  console.log(`[${requestId}] Delete all plans request`);

  try {
    // Get count of plans before deletion
    const plans = await storage.listPlans();
    const planCount = plans.length;

    // Delete all plans
    await storage.deleteAllPlans();
    
    logger.info(`[${requestId}] All plans deleted successfully`, { deletedCount: planCount });
    
    return res.json({
      success: true,
      deletedCount: planCount,
      message: `Successfully deleted ${planCount} plan(s)`
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.error(`[${requestId}] Error deleting all plans`, error);
    console.error(`[${requestId}] Error deleting all plans:`, errorMessage);
    
    return res.status(500).json({
      error: 'Failed to delete all plans',
      message: errorMessage
    });
  }
});

// Helper endpoint to get scenarioId from scenario description
app.post('/api/get-scenario-id', async (req, res) => {
  const { scenario } = req.body;
  const requestId = `req-${Date.now()}`;

  if (!scenario) {
    return res.status(400).json({ error: 'Scenario description is required' });
  }

  // Safety check for scenario
  const safetyCheck = await safetyChecker.checkScenario(scenario);
  if (!safetyCheck.isSafe) {
    logger.warn(`[${requestId}] Scenario failed safety check`, { 
      reason: safetyCheck.reason,
      categories: safetyCheck.categories 
    });
    return res.status(400).json({ 
      error: 'Scenario failed safety check',
      message: safetyCheck.reason || 'The provided scenario contains inappropriate or malicious content and cannot be processed.',
      details: safetyCheck.categories ? { flaggedCategories: safetyCheck.categories } : undefined
    });
  }

  try {
    const scenarioId = storage.generateScenarioId(scenario);
    return res.json({
      scenarioId,
      scenario
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[${requestId}] Error generating scenarioId`, error);
    return res.status(500).json({
      error: 'Failed to generate scenarioId',
      message: errorMessage
    });
  }
});

// Dry run endpoint - generate plan without executing
app.post('/api/plan', async (req, res) => {
  const requestId = `req-${Date.now()}`;
  const { scenario } = req.body;

  logger.info(`[${requestId}] Plan generation request (dry run)`, { scenario });
  console.log(`[${requestId}] Plan generation request:`, { scenario });

  if (!scenario) {
    logger.warn(`[${requestId}] Plan generation request rejected: Missing scenario`);
    return res.status(400).json({ error: 'Scenario description is required' });
  }

  // Safety check for scenario
  const safetyCheck = await safetyChecker.checkScenario(scenario);
  if (!safetyCheck.isSafe) {
    logger.warn(`[${requestId}] Scenario failed safety check`, { 
      reason: safetyCheck.reason,
      categories: safetyCheck.categories 
    });
    return res.status(400).json({ 
      error: 'Scenario failed safety check',
      message: safetyCheck.reason || 'The provided scenario contains inappropriate or malicious content and cannot be processed.',
      details: safetyCheck.categories ? { flaggedCategories: safetyCheck.categories } : undefined
    });
  }

  try {
    logger.info(`[${requestId}] Generating plan for scenario: "${scenario}"`);
    console.log(`[${requestId}] Starting plan generation...`);
    
    // Check if a plan already exists for this scenario
    const scenarioId = storage.generateScenarioId(scenario);
    const existingPlans = await storage.getPlansByScenarioId(scenarioId);
    
    if (existingPlans.length > 0) {
      // Reuse the most recent plan
      const latestPlan = existingPlans.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
      logger.info(`[${requestId}] Reusing existing plan`, { 
        planId: latestPlan.id,
        scenarioId,
        stepsCount: latestPlan.steps.length
      });
      
      return res.json({
        success: true,
        planId: latestPlan.id,
        scenarioId: latestPlan.scenarioId,
        scenario: latestPlan.scenario,
        name: latestPlan.name || 'Unnamed Plan',
        phase: latestPlan.phase || 'initial',
        steps: latestPlan.steps,
        totalSteps: latestPlan.steps.length,
        refinementHistory: latestPlan.refinementHistory || [],
        createdAt: latestPlan.createdAt,
        alreadyExists: true,
        message: 'Plan already exists for this scenario. Returning existing plan. Unified executor will automatically choose DOM or Vision for each step.'
      });
    }
    
    // Generate new plan and persist it
    const plan = await generatePlan(scenario, storage);
    
    logger.info(`[${requestId}] Plan generated successfully`, { 
      planId: plan.id,
      stepsCount: plan.steps.length,
      phase: plan.phase
    });
    
    return res.json({
      success: true,
      planId: plan.id,
      scenarioId: plan.scenarioId,
      scenario: plan.scenario,
      name: plan.name || 'Unnamed Plan',
      phase: plan.phase || 'initial',
      steps: plan.steps,
      totalSteps: plan.steps.length,
      refinementHistory: plan.refinementHistory || [],
      createdAt: plan.createdAt,
      alreadyExists: false,
      message: 'Plan generated successfully (dry run - no execution). Unified executor will automatically choose DOM or Vision for each step.'
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    logger.error(`[${requestId}] Plan generation error`, error);
    if (error instanceof Error) {
      logger.error(`[${requestId}] Error stack trace`, { stack: error.stack });
    }
    
    console.error(`[${requestId}] PLAN GENERATION ERROR:`, errorMessage);
    if (errorStack) {
      console.error(`[${requestId}] STACK:`, errorStack);
    }
    
    const errorResponse: Record<string, any> = { 
      error: 'Failed to generate plan',
      message: errorMessage
    };
    
    if (process.env.NODE_ENV === 'development' && errorStack) {
      errorResponse.stack = errorStack;
    }
    
    if (error instanceof Error) {
      errorResponse.details = {
        name: error.name,
        message: error.message
      };
      if (error.cause) {
        errorResponse.details.cause = error.cause;
      }
    }
    
    console.log(`[${requestId}] Sending error response:`, JSON.stringify(errorResponse, null, 2));
    return res.status(500).json(errorResponse);
  }
});

// Get execution plan by plan ID
app.get('/api/get-plan/:planId', async (req, res) => {
  const { planId } = req.params;
  const requestId = `req-${Date.now()}`;

  logger.info(`[${requestId}] Plan request for planId: ${planId}`);
  console.log(`[${requestId}] Plan request for planId: ${planId}`);

  try {
    const plan = await storage.getPlanByPlanId(planId);
    
    if (!plan) {
      logger.warn(`[${requestId}] Plan not found`, { planId });
      return res.status(404).json({ 
        error: 'Plan not found',
        planId 
      });
    }

    return res.json({
      planId: plan.id,
      scenarioId: plan.scenarioId,
      scenario: plan.scenario,
      name: plan.name || 'Unnamed Plan',
      phase: plan.phase || 'initial',
      steps: plan.steps, // Each step may contain an optional assertion field
      refinementHistory: plan.refinementHistory || [],
      createdAt: plan.createdAt
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.error(`[${requestId}] Error getting plan`, error);
    console.error(`[${requestId}] Error getting plan:`, errorMessage);
    
    return res.status(500).json({
      error: 'Failed to get plan',
      message: errorMessage
    });
  }
});

// ============================================================================
// Slack Command Endpoints
// ============================================================================

// Helper function to parse Slack command text
function parseSlackCommand(text: string): { command: string; scenario: string; planId?: string; failFast?: boolean } {
  const trimmed = text.trim();
  
  // Plan execution commands
  if (trimmed.match(/^(execute-plan|run-plan|exec-plan|plan-execute|plan-run)\s+/i)) {
    const rest = trimmed.replace(/^(execute-plan|run-plan|exec-plan|plan-execute|plan-run)\s+/i, '').trim();
    const failFastMatch = rest.match(/--(no-)?fail-fast/i);
    const shouldFailFast = failFastMatch ? !failFastMatch[1] : true;
    const cleanRest = rest.replace(/--(no-)?fail-fast/i, '').trim();
    return { command: 'execute-plan', scenario: '', planId: cleanRest, failFast: shouldFailFast };
  }
  
  if (trimmed.match(/^(execute-plan-async|run-plan-async|exec-plan-async|async-plan|plan-execute-async|plan-run-async)\s+/i)) {
    const rest = trimmed.replace(/^(execute-plan-async|run-plan-async|exec-plan-async|async-plan|plan-execute-async|plan-run-async)\s+/i, '').trim();
    const failFastMatch = rest.match(/--(no-)?fail-fast/i);
    const shouldFailFast = failFastMatch ? !failFastMatch[1] : true;
    const cleanRest = rest.replace(/--(no-)?fail-fast/i, '').trim();
    return { command: 'execute-plan-async', scenario: '', planId: cleanRest, failFast: shouldFailFast };
  }
  
  // Check for command prefixes
  if (trimmed.startsWith('execute ') || trimmed.startsWith('run ')) {
    const scenario = trimmed.replace(/^(execute|run)\s+/i, '').trim();
    // Check for --no-fail-fast or --fail-fast flags
    const failFastMatch = scenario.match(/--(no-)?fail-fast/i);
    const shouldFailFast = failFastMatch ? !failFastMatch[1] : true; // default true
    const cleanScenario = scenario.replace(/--(no-)?fail-fast/i, '').trim();
    return { command: 'execute', scenario: cleanScenario, failFast: shouldFailFast };
  }
  
  if (trimmed.startsWith('async ') || trimmed.startsWith('execute-async ')) {
    const scenario = trimmed.replace(/^(async|execute-async)\s+/i, '').trim();
    const failFastMatch = scenario.match(/--(no-)?fail-fast/i);
    const shouldFailFast = failFastMatch ? !failFastMatch[1] : true;
    const cleanScenario = scenario.replace(/--(no-)?fail-fast/i, '').trim();
    return { command: 'execute-async', scenario: cleanScenario, failFast: shouldFailFast };
  }
  
  if (trimmed.startsWith('plan ') || trimmed.startsWith('dry-run ')) {
    const scenario = trimmed.replace(/^(plan|dry-run)\s+/i, '').trim();
    return { command: 'plan', scenario };
  }
  
  if (trimmed.startsWith('get-plan ') || trimmed.startsWith('plan-info ')) {
    const planId = trimmed.replace(/^(get-plan|plan-info)\s+/i, '').trim();
    return { command: 'get-plan', scenario: planId };
  }
  
  if (trimmed.match(/^(update-plan|modify-plan|plan-update|plan-modify|edit-plan)\s+/i)) {
    const rest = trimmed.replace(/^(update-plan|modify-plan|plan-update|plan-modify|edit-plan)\s+/i, '').trim();
    // Format: update-plan <planId> <updates as JSON or key=value pairs>
    const parts = rest.split(/\s+/);
    const planId = parts[0];
    return { command: 'update-plan', scenario: planId, planId };
  }
  
  if (trimmed.match(/^(delete-plan|remove-plan|plan-delete|plan-remove)\s+/i)) {
    const planId = trimmed.replace(/^(delete-plan|remove-plan|plan-delete|plan-remove)\s+/i, '').trim();
    return { command: 'delete-plan', scenario: planId };
  }
  
  if (trimmed.startsWith('status ')) {
    const testId = trimmed.replace(/^status\s+/i, '').trim();
    return { command: 'status', scenario: testId };
  }
  
  if (trimmed.startsWith('history ')) {
    const scenarioId = trimmed.replace(/^history\s+/i, '').trim();
    return { command: 'history', scenario: scenarioId };
  }
  
  if (trimmed.startsWith('latest ')) {
    const scenarioId = trimmed.replace(/^latest\s+/i, '').trim();
    return { command: 'latest', scenario: scenarioId };
  }
  
  if (trimmed.toLowerCase() === 'list-plans' || trimmed.toLowerCase().startsWith('list-plans ')) {
    return { command: 'list-plans', scenario: '' };
  }
  
  if (trimmed.toLowerCase() === 'help' || trimmed.toLowerCase().startsWith('help ')) {
    return { command: 'help', scenario: '' };
  }
  
  // Default: treat entire text as scenario for execute
  return { command: 'execute', scenario: trimmed, failFast: true };
}

// Helper function to format Slack response
function formatSlackResponse(text: string, blocks?: any[]): any {
  const response: any = { text };
  if (blocks && blocks.length > 0) {
    response.blocks = blocks;
  }
  return response;
}

// Main Slack command endpoint
app.post('/api/slack/command', async (req, res) => {
  const requestId = `slack-${Date.now()}`;
  
  // Slack sends commands in different formats:
  // 1. Slash commands: { text: "command scenario", ... }
  // 2. Interactive components: { payload: "...", ... }
  // 3. Webhook: { text: "...", ... }
  
  let commandText = '';
  
  // Handle Slack slash command format
  if (req.body.text) {
    commandText = req.body.text;
  }
  // Handle URL-encoded form data (Slack sends this for slash commands)
  else if (req.body.text || typeof req.body === 'string') {
    commandText = req.body.text || req.body;
  }
  // Handle JSON body with text field
  else if (req.body.command && req.body.text !== undefined) {
    commandText = req.body.text;
  }
  
  logger.info(`[${requestId}] Slack command received`, { body: req.body, commandText });
  console.log(`[${requestId}] Slack command received:`, commandText);
  
  if (!commandText || commandText.trim().length === 0) {
    // Empty command = show help
    commandText = 'help';
  }
  
  try {
    const parsed = parseSlackCommand(commandText);
    
    switch (parsed.command) {
      case 'execute': {
        logger.info(`[${requestId}] Executing scenario via Slack: "${parsed.scenario}"`);
        
        // Safety check for scenario
        const safetyCheck = await safetyChecker.checkScenario(parsed.scenario);
        if (!safetyCheck.isSafe) {
          logger.warn(`[${requestId}] Scenario failed safety check via Slack`, { 
            reason: safetyCheck.reason,
            categories: safetyCheck.categories 
          });
          return res.json(formatSlackResponse(
            `🚫 *Safety Check Failed*\n\n` +
            `*Reason:* ${safetyCheck.reason || 'The provided scenario contains inappropriate or malicious content and cannot be processed.'}\n\n` +
            `Please provide a valid test scenario description.`
          ));
        }
        
        const result = await runScenario(parsed.scenario, parsed.failFast ?? true, storage);
        
        if (result) {
          const statusEmoji = result.summary.success ? '✅' : '❌';
          const statusText = result.summary.success ? 'PASSED' : 'FAILED';
          const duration = result.summary.endTime - result.summary.startTime;
          const durationSec = (duration / 1000).toFixed(2);
          
          let responseText = `${statusEmoji} *Execution ${statusText}*\n`;
          responseText += `*Scenario ID:* ${result.scenarioId}\n`;
          responseText += `*Plan ID:* ${result.planId}\n`;
          responseText += `*Duration:* ${durationSec}s\n`;
          responseText += `*Steps:* ${result.results.length}\n`;
          
          if (result.summary.reason) {
            responseText += `*Reason:* ${result.summary.reason}\n`;
          }
          
          // Add step summary
          const passedSteps = result.results.filter(s => s.status === 'success').length;
          const failedSteps = result.results.filter(s => s.status !== 'success').length;
          responseText += `*Results:* ${passedSteps} passed, ${failedSteps} failed\n`;
          
          return res.json(formatSlackResponse(responseText));
        } else {
          return res.json(formatSlackResponse('❌ Execution failed to produce a result'));
        }
      }
      
      case 'execute-async': {
        logger.info(`[${requestId}] Starting async execution via Slack: "${parsed.scenario}"`);
        
        // Safety check for scenario
        const safetyCheck = await safetyChecker.checkScenario(parsed.scenario);
        if (!safetyCheck.isSafe) {
          logger.warn(`[${requestId}] Scenario failed safety check via Slack`, { 
            reason: safetyCheck.reason,
            categories: safetyCheck.categories 
          });
          return res.json(formatSlackResponse(
            `🚫 *Safety Check Failed*\n\n` +
            `*Reason:* ${safetyCheck.reason || 'The provided scenario contains inappropriate or malicious content and cannot be processed.'}\n\n` +
            `Please provide a valid test scenario description.`
          ));
        }
        
        const testId = await storage.createExecution(parsed.scenario);
        const execution = await storage.getExecution(testId);
        
        runScenarioAsync(testId, parsed.scenario, storage, parsed.failFast ?? true).catch((error) => {
          logger.error(`[${requestId}] Background execution error for ${testId}`, error);
        });
        
        return res.json(formatSlackResponse(
          `🚀 *Async execution started*\n` +
          `*Test ID:* ${testId}\n` +
          `*Scenario ID:* ${execution?.scenarioId || 'N/A'}\n` +
          `*Status:* pending\n\n` +
          `Use \`status ${testId}\` to check progress.`
        ));
      }
      
      case 'plan': {
        logger.info(`[${requestId}] Generating plan via Slack (async): "${parsed.scenario}"`);
        
        // Safety check for scenario
        const safetyCheck = await safetyChecker.checkScenario(parsed.scenario);
        if (!safetyCheck.isSafe) {
          logger.warn(`[${requestId}] Scenario failed safety check via Slack`, { 
            reason: safetyCheck.reason,
            categories: safetyCheck.categories 
          });
          return res.json(formatSlackResponse(
            `🚫 *Safety Check Failed*\n\n` +
            `*Reason:* ${safetyCheck.reason || 'The provided scenario contains inappropriate or malicious content and cannot be processed.'}\n\n` +
            `Please provide a valid test scenario description.`
          ));
        }
        
        // Check if a plan already exists for this scenario
        const scenarioId = storage.generateScenarioId(parsed.scenario);
        const existingPlans = await storage.getPlansByScenarioId(scenarioId);
        
        if (existingPlans.length > 0) {
          // Reuse the most recent plan
          const latestPlan = existingPlans.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
          
          let responseText = `♻️ *Reusing Existing Plan*\n`;
          responseText += `*Plan ID:* ${latestPlan.id}\n`;
          responseText += `*Name:* ${latestPlan.name || 'Unnamed Plan'}\n`;
          responseText += `*Scenario ID:* ${scenarioId}\n`;
          responseText += `*Total Steps:* ${latestPlan.steps.length}\n`;
          responseText += `*Phase:* ${latestPlan.phase || 'initial'}\n`;
          if (latestPlan.createdAt) {
            responseText += `*Created:* ${new Date(latestPlan.createdAt).toISOString()}\n`;
          }
          responseText += `\n*Steps:*\n`;
          
          // Limit steps shown
          const maxStepsToShow = 10;
          latestPlan.steps.slice(0, maxStepsToShow).forEach((step, index) => {
            responseText += `${index + 1}. ${step.description}\n`;
            if (step.action) {
              responseText += `   Action: ${step.action.name}\n`;
            }
            if (step.assertion) {
              responseText += `   Assertion: ${step.assertion.description}\n`;
            }
          });
          
          if (latestPlan.steps.length > maxStepsToShow) {
            responseText += `\n... and ${latestPlan.steps.length - maxStepsToShow} more steps.`;
          }
          
          return res.json(formatSlackResponse(responseText));
        }
        
        // No existing plan found, generate a new one
        // Generate plan ID immediately
        const planId = `plan-${Date.now()}`;
        
        // Start plan generation in background
        generatePlanAsync(planId, parsed.scenario, storage).catch((error) => {
          logger.error(`[${requestId}] Background plan generation error for ${planId}`, error);
        });
        
        // Return immediately with plan ID
        return res.json(formatSlackResponse(
          `⏳ *Plan Generation Started*\n` +
          `*Plan ID:* ${planId}\n` +
          `*Scenario:* ${parsed.scenario.substring(0, 100)}${parsed.scenario.length > 100 ? '...' : ''}\n\n` +
          `Plan is being generated in the background. This may take a few seconds.\n` +
          `Use \`get-plan ${planId}\` to check when it's ready, or use the API endpoint \`GET /api/get-plan/${planId}\`.`
        ));
      }
      
      case 'get-plan': {
        const planId = parsed.scenario;
        logger.info(`[${requestId}] Getting plan via Slack for planId: ${planId}`);
        
        const plan = await storage.getPlanByPlanId(planId);
        
        if (!plan) {
          return res.json(formatSlackResponse(
            `❌ *Plan not found*\n` +
            `*Plan ID:* ${planId}\n\n` +
            `The plan may still be generating. Please wait a moment and try again.`
          ));
        }
        
        let responseText = `📋 *Execution Plan*\n`;
        responseText += `*Name:* ${plan.name || 'Unnamed Plan'}\n`;
        responseText += `*Plan ID:* ${plan.id}\n`;
        responseText += `*Scenario ID:* ${plan.scenarioId}\n`;
        responseText += `*Total Steps:* ${plan.steps.length}\n`;
        responseText += `*Phase:* ${plan.phase || 'initial'}\n`;
        if (plan.createdAt) {
          responseText += `*Created:* ${new Date(plan.createdAt).toISOString()}\n`;
        }
        responseText += `\n*Steps:*\n`;
        
        // Limit steps shown to avoid message being too long
        const maxStepsToShow = 10;
        plan.steps.slice(0, maxStepsToShow).forEach((step, index) => {
          responseText += `${index + 1}. ${step.description}\n`;
          if (step.action) {
            responseText += `   Action: ${step.action.name}\n`;
          }
          if (step.assertion) {
            responseText += `   Assertion: ${step.assertion.description}\n`;
          }
        });
        
        if (plan.steps.length > maxStepsToShow) {
          responseText += `\n... and ${plan.steps.length - maxStepsToShow} more steps.`;
        }
        
        return res.json(formatSlackResponse(responseText));
      }
      
      case 'update-plan': {
        const planId = parsed.planId || parsed.scenario;
        if (!planId) {
          return res.json(formatSlackResponse('❌ *Error*\nPlan ID is required. Usage: `update-plan <planId>`'));
        }
        
        logger.info(`[${requestId}] Updating plan via Slack for planId: ${planId}`);
        
        // For Slack, we'll support simple name updates
        // More complex updates should use the REST API
        const updateText = parsed.scenario && parsed.scenario !== planId 
          ? parsed.scenario.replace(planId, '').trim()
          : '';
        
        try {
          const plan = await storage.getPlanByPlanId(planId);
          
          if (!plan) {
            return res.json(formatSlackResponse(
              `❌ *Plan not found*\n` +
              `*Plan ID:* ${planId}`
            ));
          }
          
          // If update text is provided, assume it's a name update
          const updates: Partial<IExecutionPlan> = {};
          if (updateText) {
            updates.name = updateText;
          } else {
            // No updates provided - show help
            return res.json(formatSlackResponse(
              `📝 *Update Plan*\n\n` +
              `*Current Plan:*\n` +
              `*Plan ID:* ${planId}\n` +
              `*Name:* ${plan.name || 'Unnamed Plan'}\n` +
              `*Steps:* ${plan.steps.length}\n\n` +
              `*Usage:*\n` +
              `\`update-plan <planId> <new-name>\` - Update plan name\n\n` +
              `For more complex updates (steps, phase, etc.), use the REST API:\n` +
              `\`PUT /api/plans/${planId}\` with JSON body`
            ));
          }
          
          await storage.updatePlan(planId, updates);
          const updatedPlan = await storage.getPlanByPlanId(planId);
          
          return res.json(formatSlackResponse(
            `✅ *Plan Updated*\n` +
            `*Plan ID:* ${planId}\n` +
            `*Updated Name:* ${updatedPlan!.name || 'Unnamed Plan'}\n` +
            `*Steps:* ${updatedPlan!.steps.length}\n\n` +
            `The plan has been successfully updated.`
          ));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error(`[${requestId}] Plan update error`, error);
          return res.json(formatSlackResponse(`❌ *Error updating plan*\n*Message:* ${errorMessage}`));
        }
      }
      
      case 'delete-plan': {
        const planId = parsed.scenario;
        logger.info(`[${requestId}] Deleting plan via Slack for planId: ${planId}`);
        
        try {
          const plan = await storage.getPlanByPlanId(planId);
          
          if (!plan) {
            return res.json(formatSlackResponse(
              `❌ *Plan not found*\n` +
              `*Plan ID:* ${planId}`
            ));
          }
          
          await storage.deletePlan(planId);
          
          return res.json(formatSlackResponse(
            `🗑️ *Plan Deleted*\n` +
            `*Plan ID:* ${planId}\n` +
            `*Plan Name:* ${plan.name || 'Unnamed Plan'}\n\n` +
            `The plan has been successfully deleted.`
          ));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error(`[${requestId}] Plan deletion error`, error);
          return res.json(formatSlackResponse(`❌ *Error deleting plan*\n*Message:* ${errorMessage}`));
        }
      }
      
      case 'execute-plan': {
        const planId = parsed.planId;
        if (!planId) {
          return res.json(formatSlackResponse('❌ *Error*\nPlan ID is required. Usage: `execute-plan <planId>`'));
        }
        
        logger.info(`[${requestId}] Executing plan via Slack: "${planId}"`);
        
        try {
          const plan = await storage.getPlanByPlanId(planId);
          if (!plan) {
            return res.json(formatSlackResponse(`❌ *Plan not found*\nPlan ID: ${planId}`));
          }
          
          const result = await runPlan(planId, parsed.failFast ?? true, storage);
          
          if (result) {
            const status = result.summary.success ? '✅ SUCCESS' : '❌ FAILED';
            let responseText = `🎯 *Plan Execution ${status}*\n`;
            responseText += `*Plan ID:* ${planId}\n`;
            responseText += `*Plan Name:* ${plan.name || 'Unnamed Plan'}\n`;
            responseText += `*Steps Executed:* ${result.results.length}\n`;
            responseText += `*Duration:* ${Math.round((result.summary.endTime - result.summary.startTime) / 1000)}s\n`;
            if (result.summary.reason) {
              responseText += `*Reason:* ${result.summary.reason}\n`;
            }
            
            return res.json(formatSlackResponse(responseText));
          } else {
            return res.json(formatSlackResponse(`❌ *Execution failed*\nPlan execution returned no result.`));
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error(`[${requestId}] Plan execution error`, error);
          return res.json(formatSlackResponse(`❌ *Error executing plan*\n*Message:* ${errorMessage}`));
        }
      }
      
      case 'execute-plan-async': {
        const planId = parsed.planId;
        if (!planId) {
          return res.json(formatSlackResponse('❌ *Error*\nPlan ID is required. Usage: `execute-plan-async <planId>`'));
        }
        
        logger.info(`[${requestId}] Starting async plan execution via Slack: "${planId}"`);
        
        try {
          const plan = await storage.getPlanByPlanId(planId);
          if (!plan) {
            return res.json(formatSlackResponse(`❌ *Plan not found*\nPlan ID: ${planId}`));
          }
          
          // Get scenario description from plan or existing execution
          const allExecutions = await storage.listExecutions();
          const executionWithPlan = allExecutions.find(e => e.planId === planId);
          const scenarioDescription = executionWithPlan?.scenario || plan.name || `Plan ${planId}`;
          
          const testId = await storage.createExecution(scenarioDescription);
          const execution = await storage.getExecution(testId);
          
          runPlanAsync(testId, planId, storage, parsed.failFast ?? true).catch((error) => {
            logger.error(`[${requestId}] Background plan execution error for ${testId}`, error);
          });
          
          return res.json(formatSlackResponse(
            `🚀 *Async Plan Execution Started*\n` +
            `*Plan ID:* ${planId}\n` +
            `*Plan Name:* ${plan.name || 'Unnamed Plan'}\n` +
            `*Test ID:* ${testId}\n` +
            `*Scenario ID:* ${execution?.scenarioId || 'N/A'}\n` +
            `*Status:* pending\n\n` +
            `Use \`status ${testId}\` to check progress.`
          ));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error(`[${requestId}] Async plan execution error`, error);
          return res.json(formatSlackResponse(`❌ *Error starting async plan execution*\n*Message:* ${errorMessage}`));
        }
      }
      
      case 'status': {
        const testId = parsed.scenario;
        logger.info(`[${requestId}] Getting status via Slack for testId: ${testId}`);
        
        const execution = await storage.getExecution(testId);
        
        if (!execution) {
          return res.json(formatSlackResponse(`❌ Execution not found for test ID: ${testId}`));
        }
        
        const reportData = execution.reportData;
        const summary = reportData?.summary;
        const progress = execution.totalSteps 
          ? Math.round((execution.currentStep || 0) / execution.totalSteps * 100)
          : 0;
        
        let responseText = `📊 *Execution Status*\n`;
        responseText += `*Test ID:* ${execution.testId}\n`;
        responseText += `*Scenario ID:* ${execution.scenarioId}\n`;
        responseText += `*Status:* ${execution.status}\n`;
        responseText += `*Progress:* ${progress}% (${execution.currentStep || 0}/${execution.totalSteps || 0})\n`;
        
        if (execution.startedAt) {
          responseText += `*Started:* ${new Date(execution.startedAt).toISOString()}\n`;
        }
        if (execution.completedAt) {
          responseText += `*Completed:* ${new Date(execution.completedAt).toISOString()}\n`;
        }
        if (summary?.reason || execution.error) {
          responseText += `*Reason:* ${summary?.reason || execution.error}\n`;
        }
        
        // Add deep dive report URL
        const reportUrl = `http://localhost:3000/reports/${execution.testId}`;
        responseText += `\n*📋 Deep Dive Report:*\n${reportUrl}`;
        
        return res.json(formatSlackResponse(responseText));
      }
      
      case 'history': {
        const scenarioId = parsed.scenario;
        logger.info(`[${requestId}] Getting history via Slack for scenarioId: ${scenarioId}`);
        
        const executions = await storage.getExecutionsByScenarioId(scenarioId);
        
        if (executions.length === 0) {
          return res.json(formatSlackResponse(`❌ No executions found for scenario ID: ${scenarioId}`));
        }
        
        let responseText = `📜 *Execution History*\n`;
        responseText += `*Scenario ID:* ${scenarioId}\n`;
        responseText += `*Total Executions:* ${executions.length}\n\n`;
        
        executions.slice(0, 10).forEach((exec, index) => {
          const summary = exec.reportData?.summary;
          const duration = (exec.completedAt && exec.startedAt) 
            ? ((exec.completedAt - exec.startedAt) / 1000).toFixed(2)
            : (summary?.endTime && summary?.startTime)
            ? ((summary.endTime - summary.startTime) / 1000).toFixed(2)
            : 'N/A';
          
          responseText += `${index + 1}. *${exec.testId}*\n`;
          responseText += `   Status: ${exec.status}\n`;
          responseText += `   Duration: ${duration}s\n`;
          if (summary?.reason || exec.error) {
            responseText += `   Reason: ${summary?.reason || exec.error}\n`;
          }
          responseText += `\n`;
        });
        
        if (executions.length > 10) {
          responseText += `... and ${executions.length - 10} more executions`;
        }
        
        return res.json(formatSlackResponse(responseText));
      }
      
      case 'latest': {
        const scenarioId = parsed.scenario;
        logger.info(`[${requestId}] Getting latest execution via Slack for scenarioId: ${scenarioId}`);
        
        const execution = await storage.getLatestExecutionByScenarioId(scenarioId);
        
        if (!execution) {
          return res.json(formatSlackResponse(`❌ No execution found for scenario ID: ${scenarioId}`));
        }
        
        const reportData = execution.reportData;
        const summary = reportData?.summary;
        const steps = reportData?.results || execution.results;
        const duration = (execution.completedAt && execution.startedAt) 
          ? ((execution.completedAt - execution.startedAt) / 1000).toFixed(2)
          : (summary?.endTime && summary?.startTime)
          ? ((summary.endTime - summary.startTime) / 1000).toFixed(2)
          : 'N/A';
        
        let responseText = `🔍 *Latest Execution*\n`;
        responseText += `*Test ID:* ${execution.testId}\n`;
        responseText += `*Scenario ID:* ${execution.scenarioId}\n`;
        responseText += `*Status:* ${execution.status}\n`;
        responseText += `*Duration:* ${duration}s\n`;
        responseText += `*Steps:* ${steps?.length || 0}\n`;
        
        if (summary?.reason || execution.error) {
          responseText += `*Reason:* ${summary?.reason || execution.error}\n`;
        }
        
        return res.json(formatSlackResponse(responseText));
      }
      
      case 'list-plans': {
        logger.info(`[${requestId}] Listing all plans via Slack`);
        
        const plans = await storage.listPlans();
        
        if (plans.length === 0) {
          return res.json(formatSlackResponse('📋 *No plans found*\nNo execution plans have been generated yet.'));
        }
        
        let responseText = `📋 *Execution Plans*\n`;
        responseText += `*Total Plans:* ${plans.length}\n\n`;
        
        plans.slice(0, 20).forEach((plan, index) => {
          responseText += `${index + 1}. *${plan.name || 'Unnamed Plan'}*\n`;
          responseText += `   *Plan ID:* ${plan.id}\n`;
          responseText += `   *Scenario ID:* ${plan.scenarioId}\n`;
          responseText += `   *Steps:* ${plan.steps.length} | *Phase:* ${plan.phase || 'initial'}\n`;
          if (plan.createdAt) {
            responseText += `   *Created:* ${new Date(plan.createdAt).toISOString()}\n`;
          }
          responseText += `\n`;
        });
        
        if (plans.length > 20) {
          responseText += `... and ${plans.length - 20} more plans`;
        }
        
        return res.json(formatSlackResponse(responseText));
      }
      
      case 'help': {
        const helpText = `*CUALA Test Automation Commands*\n\n` +
          `*Execution:*\n` +
          `• \`execute <scenario>\` - Run test synchronously\n` +
          `• \`async <scenario>\` - Run test asynchronously\n` +
          `  Example: \`async Navigate to example.com and verify the heading\`\n\n` +
          `*Planning:*\n` +
          `• \`plan <scenario>\` - Generate execution plan (dry run)\n` +
          `• \`get-plan <planId>\` - View plan details\n` +
          `• \`list-plans\` - List all plans\n` +
          `• \`execute-plan <planId>\` - Execute existing plan\n` +
          `• \`delete-plan <planId>\` - Delete a plan\n` +
          `• \`update-plan <planId> <name>\` - Update plan name\n\n` +
          `*Status & History:*\n` +
          `• \`status <testId>\` - Check execution status\n` +
          `• \`history <scenarioId>\` - View execution history\n` +
          `• \`latest <scenarioId>\` - Get latest execution\n\n` +
          `*Options:*\n` +
          `• \`--fail-fast\` (default) - Stop on first failure\n` +
          `• \`--no-fail-fast\` - Continue on failures\n\n` +
          `Use \`help\` to see this message again.`;
        
        return res.json(formatSlackResponse(helpText));
      }
      
      default:
        return res.json(formatSlackResponse(`❌ Unknown command: ${parsed.command}\n\nUse \`help\` to see available commands.`));
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[${requestId}] Slack command error`, error);
    console.error(`[${requestId}] Slack command error:`, errorMessage);
    
    return res.json(formatSlackResponse(
      `❌ *Error executing command*\n*Message:* ${errorMessage}`
    ));
  }
});

// ============================================================================
// Confidence Threshold Management Endpoints
// ============================================================================

// Get all confidence thresholds
app.get('/api/confidence-thresholds', async (req, res) => {
  const requestId = `req-${Date.now()}`;
  
  logger.info(`[${requestId}] Get all confidence thresholds request`);
  
  try {
    const thresholds = await confidenceThresholdService.getAllThresholds();
    const thresholdsArray = Array.from(thresholds.entries()).map(([actionType, threshold]) => ({
      actionType,
      threshold
    }));
    
    return res.json({
      thresholds: thresholdsArray,
      total: thresholdsArray.length
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[${requestId}] Error getting confidence thresholds`, error);
    return res.status(500).json({
      error: 'Failed to get confidence thresholds',
      message: errorMessage
    });
  }
});

// Get confidence threshold for a specific action type
app.get('/api/confidence-thresholds/:actionType', async (req, res) => {
  const { actionType } = req.params;
  const requestId = `req-${Date.now()}`;
  
  logger.info(`[${requestId}] Get confidence threshold request for actionType: ${actionType}`);
  
  try {
    const threshold = await confidenceThresholdService.getThreshold(actionType as ActionType);
    const configKey = `confidence.threshold.${actionType}`;
    const config = await storage.getConfiguration(configKey);
    
    return res.json({
      actionType,
      threshold,
      isDefault: !config,
      config: config ? {
        id: config.id,
        description: config.description,
        updatedAt: config.updatedAt
      } : null
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[${requestId}] Error getting confidence threshold`, error);
    return res.status(500).json({
      error: 'Failed to get confidence threshold',
      message: errorMessage
    });
  }
});

// Create or update confidence threshold
app.put('/api/confidence-thresholds/:actionType', async (req, res) => {
  const { actionType } = req.params;
  const { threshold, description } = req.body;
  const requestId = `req-${Date.now()}`;
  
  logger.info(`[${requestId}] Set confidence threshold request`, { actionType, threshold });
  
  if (threshold === undefined || threshold === null) {
    return res.status(400).json({ 
      error: 'Threshold value is required',
      message: 'Please provide a threshold value between 0.0 and 1.0'
    });
  }
  
  // Validate threshold range
  if (typeof threshold !== 'number' || threshold < 0 || threshold > 1) {
    return res.status(400).json({ 
      error: 'Invalid threshold value',
      message: 'Threshold must be a number between 0.0 and 1.0'
    });
  }
  
  // Validate action type
  const validActionTypes: ActionType[] = ['click', 'type', 'hover', 'verify', 'default'];
  if (!validActionTypes.includes(actionType as ActionType)) {
    return res.status(400).json({ 
      error: 'Invalid action type',
      message: `Action type must be one of: ${validActionTypes.join(', ')}`,
      validActionTypes
    });
  }
  
  try {
    const configKey = `confidence.threshold.${actionType}`;
    await storage.setConfiguration(configKey, threshold, description);
    
    logger.info(`[${requestId}] Confidence threshold set successfully`, { actionType, threshold, configKey });
    
    return res.json({
      actionType,
      threshold,
      configKey,
      message: `Confidence threshold for ${actionType} set to ${threshold}`
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[${requestId}] Error setting confidence threshold`, error);
    return res.status(500).json({
      error: 'Failed to set confidence threshold',
      message: errorMessage
    });
  }
});

// Delete confidence threshold (revert to default)
app.delete('/api/confidence-thresholds/:actionType', async (req, res) => {
  const { actionType } = req.params;
  const requestId = `req-${Date.now()}`;
  
  logger.info(`[${requestId}] Delete confidence threshold request for actionType: ${actionType}`);
  
  try {
    const configKey = `confidence.threshold.${actionType}`;
    await storage.deleteConfiguration(configKey);
    
    // Get default threshold to return
    const defaultThreshold = await confidenceThresholdService.getThreshold(actionType as ActionType);
    
    logger.info(`[${requestId}] Confidence threshold deleted, reverted to default`, { actionType, defaultThreshold });
    
    return res.json({
      actionType,
      threshold: defaultThreshold,
      message: `Confidence threshold for ${actionType} deleted, reverted to default: ${defaultThreshold}`
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[${requestId}] Error deleting confidence threshold`, error);
    return res.status(500).json({
      error: 'Failed to delete confidence threshold',
      message: errorMessage
    });
  }
});

// Delete all confidence thresholds (revert all to defaults)
app.delete('/api/confidence-thresholds', async (req, res) => {
  const requestId = `req-${Date.now()}`;
  
  logger.info(`[${requestId}] Delete all confidence thresholds request`);
  
  try {
    await storage.deleteAllConfigurations('confidence.threshold.');
    
    logger.info(`[${requestId}] All confidence thresholds deleted, reverted to defaults`);
    
    return res.json({
      message: 'All confidence thresholds deleted, reverted to defaults',
      defaults: {
        click: 0.5,
        type: 0.7,
        hover: 0.7,
        verify: 0.7,
        default: 0.6
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[${requestId}] Error deleting all confidence thresholds`, error);
    return res.status(500).json({
      error: 'Failed to delete all confidence thresholds',
      message: errorMessage
    });
  }
});

// List all execution plans endpoint
app.get('/api/list-plans', async (req, res) => {
  const requestId = `req-${Date.now()}`;
  
  logger.info(`[${requestId}] List plans request`);
  console.log(`[${requestId}] List plans request`);

  try {
    const plans = await storage.listPlans();
    
    return res.json({
      totalPlans: plans.length,
      plans: plans.map(plan => ({
        planId: plan.id,
        scenarioId: plan.scenarioId,
        scenario: plan.scenario,
        name: plan.name || 'Unnamed Plan',
        phase: plan.phase || 'initial',
        totalSteps: plan.steps.length,
        createdAt: plan.createdAt,
        steps: plan.steps.map(step => ({
          id: step.id,
          description: step.description,
          action: step.action.name,
          hasAssertion: !!step.assertion
        }))
      }))
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.error(`[${requestId}] Error listing plans`, error);
    console.error(`[${requestId}] Error listing plans:`, errorMessage);
    
    return res.status(500).json({
      error: 'Failed to list plans',
      message: errorMessage
    });
  }
});

// Error handling middleware - MUST be after all routes
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error in Express middleware', err);
  console.error('UNHANDLED EXPRESS ERROR:', err);
  if (!res.headersSent) {
    res.status(500).json({
      error: 'An internal server error occurred',
      message: err instanceof Error ? err.message : String(err),
      stack: process.env.NODE_ENV === 'development' ? (err instanceof Error ? err.stack : undefined) : undefined
    });
  }
});

// Initialize storage and start server
(async () => {
  try {
    storage = await createStorage();
    const storageType = process.env.STORAGE_TYPE || 'memory';
    logger.info(`Storage initialized: ${storageType}`);
    console.log(`Storage initialized: ${storageType}`);
    
    // Initialize confidence threshold service
    confidenceThresholdService = new ConfidenceThresholdService(storage, logger, config);
    logger.info('Confidence threshold service initialized');
    
    app.listen(port, () => {
      logger.info(`CUALA API Server started on port ${port}`);
      console.log(`CUALA API Server running at http://localhost:${port}`);
    });
  } catch (error) {
    logger.error('Failed to initialize storage', { error });
    console.error('Failed to initialize storage:', error);
    process.exit(1);
  }
})();

