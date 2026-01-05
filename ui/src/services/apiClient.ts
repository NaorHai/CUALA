/**
 * API Client
 * Handles all communication with the CUALA backend API
 */

const API_BASE_URL = import.meta.env.DEV_MODE === 'false' 
  ? (import.meta.env.SERVER || 'http://localhost:3001')
  : 'http://localhost:3001'

export interface ExecuteRequest {
  scenario?: string
  planId?: string
  executionMode?: 'DOM_PREFERRED' | 'VISION_REQUIRED'
  failFast?: boolean
}

export interface ExecuteResponse {
  scenarioId: string
  planId: string
  results: unknown[]
  startTime: number
  endTime: number
  status: 'completed' | 'failed'
  reason?: string
}

export interface ExecuteAsyncResponse {
  testId: string
  scenarioId: string
  status: 'pending'
  message: string
}

export interface ExecutionStatus {
  testId: string
  scenarioId: string
  scenario: string
  executionMode?: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  createdAt: number
  startedAt?: number
  completedAt?: number
  planId?: string
  planName?: string
  currentStep?: number
  totalSteps?: number
  progress: number
  steps?: unknown[]
  results?: unknown[] // Legacy field, use steps instead
  startTime?: number
  endTime?: number
  reason?: string
}

export interface ConfidenceThreshold {
  actionType: 'click' | 'type' | 'hover' | 'verify' | 'default'
  threshold: number
}

export interface ConfidenceThresholdsResponse {
  thresholds: ConfidenceThreshold[]
  total: number
}

class APIClient {
  private baseUrl: string

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl
  }

  /**
   * Check if the API server is healthy
   */
  async healthCheck(): Promise<{ status: string; timestamp: number }> {
    const response = await fetch(`${this.baseUrl}/health`)
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.statusText}`)
    }
    return response.json()
  }

  /**
   * Execute a scenario synchronously
   */
  async execute(request: ExecuteRequest): Promise<ExecuteResponse> {
    const response = await fetch(`${this.baseUrl}/api/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }))
      throw new Error(error.message || error.error || `Request failed: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * Execute a scenario asynchronously
   */
  async executeAsync(request: ExecuteRequest): Promise<ExecuteAsyncResponse> {
    const response = await fetch(`${this.baseUrl}/api/execute-async`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }))
      throw new Error(error.message || error.error || `Request failed: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * Get execution status by testId
   */
  async getStatus(testId: string): Promise<ExecutionStatus> {
    const response = await fetch(`${this.baseUrl}/api/get-status/${testId}`)

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Execution not found')
      }
      const error = await response.json().catch(() => ({ error: response.statusText }))
      throw new Error(error.message || error.error || `Request failed: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * Get execution history by scenarioId
   */
  async getHistory(scenarioId: string): Promise<{
    scenarioId: string
    totalExecutions: number
    executions: Array<{
      testId: string
      status: string
      createdAt: number
      startedAt?: number
      completedAt?: number
      progress: number
      reason?: string
      duration?: number
    }>
  }> {
    const response = await fetch(`${this.baseUrl}/api/get-history/${scenarioId}`)

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('No executions found for this scenario')
      }
      const error = await response.json().catch(() => ({ error: response.statusText }))
      throw new Error(error.message || error.error || `Request failed: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * Get latest execution by scenarioId
   */
  async getLatest(scenarioId: string): Promise<ExecutionStatus> {
    const response = await fetch(`${this.baseUrl}/api/get-latest/${scenarioId}`)

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('No execution found for this scenario')
      }
      const error = await response.json().catch(() => ({ error: response.statusText }))
      throw new Error(error.message || error.error || `Request failed: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * Get plan by planId
   */
  async getPlan(planId: string): Promise<{
    planId: string
    scenarioId: string
    name: string
    phase: string
    steps: Array<{
      id: string
      description: string
      action: {
        name: string
        arguments: Record<string, unknown>
      }
      assertion?: {
        id: string
        description: string
        check: string
      }
    }>
    refinementHistory?: unknown[]
    createdAt?: number
  }> {
    const response = await fetch(`${this.baseUrl}/api/get-plan/${planId}`)

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Plan not found')
      }
      const error = await response.json().catch(() => ({ error: response.statusText }))
      throw new Error(error.message || error.error || `Request failed: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * List all plans
   */
  async listPlans(): Promise<{
    totalPlans: number
    plans: Array<{
      planId: string
      scenarioId: string
      name: string
      phase: string
      totalSteps: number
      createdAt?: number
      steps: Array<{
        id: string
        description: string
        action: string
        hasAssertion: boolean
      }>
    }>
  }> {
    const response = await fetch(`${this.baseUrl}/api/list-plans`)

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }))
      throw new Error(error.message || error.error || `Request failed: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * Get all execution statuses (reports)
   */
  async getAllStatuses(): Promise<{
    total: number
    statuses: Array<{
      testId: string
      scenarioId: string
      scenario: string
      status: 'pending' | 'running' | 'completed' | 'failed'
      createdAt: number
      startedAt?: number
      completedAt?: number
      planId?: string
      planName?: string
      currentStep?: number
      totalSteps?: number
      progress: number
      reason?: string
      duration?: number | null
    }>
  }> {
    const response = await fetch(`${this.baseUrl}/api/get-all-statuses`)

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }))
      throw new Error(error.message || error.error || `Request failed: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * Delete a plan by plan ID
   */
  async deletePlan(planId: string): Promise<{ success: boolean; message: string; planId: string }> {
    const response = await fetch(`${this.baseUrl}/api/plans/${planId}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }))
      throw new Error(error.message || error.error || `Request failed: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * Delete all plans
   */
  async deleteAllPlans(): Promise<{ success: boolean; deletedCount: number; message: string }> {
    const response = await fetch(`${this.baseUrl}/api/plans`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }))
      throw new Error(error.message || error.error || `Request failed: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * Delete an execution/report by testId
   */
  async deleteExecution(testId: string): Promise<{ success: boolean; testId: string; message: string }> {
    const response = await fetch(`${this.baseUrl}/api/executions/${testId}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }))
      throw new Error(error.message || error.error || `Request failed: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * Get all confidence thresholds
   */
  async getConfidenceThresholds(): Promise<ConfidenceThresholdsResponse> {
    const response = await fetch(`${this.baseUrl}/api/confidence-thresholds`)

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }))
      throw new Error(error.message || error.error || `Request failed: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * Update confidence threshold for a specific action type
   */
  async updateConfidenceThreshold(
    actionType: 'click' | 'type' | 'hover' | 'verify' | 'default',
    threshold: number,
    description?: string
  ): Promise<{ actionType: string; threshold: number; configKey: string; message: string }> {
    const response = await fetch(`${this.baseUrl}/api/confidence-thresholds/${actionType}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ threshold, description }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }))
      throw new Error(error.message || error.error || `Request failed: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * Create a plan (dry run - generates plan without executing)
   */
  async createPlan(scenario: string): Promise<{
    planId: string
    scenarioId: string
    name: string
    phase: string
    steps: Array<{
      id: string
      description: string
      action: {
        name: string
        arguments: Record<string, unknown>
      }
      assertion?: {
        id: string
        description: string
        check: string
      }
    }>
    totalSteps: number
    refinementHistory?: unknown[]
    createdAt?: number
    message?: string
    alreadyExists?: boolean
  }> {
    const response = await fetch(`${this.baseUrl}/api/plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ scenario }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }))
      throw new Error(error.message || error.error || `Request failed: ${response.statusText}`)
    }

    return response.json()
  }
}

// Export singleton instance
export const apiClient = new APIClient()


