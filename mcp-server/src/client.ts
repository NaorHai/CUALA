/**
 * CUALA API Client
 * Handles all HTTP requests to the CUALA API server
 */

export class CUALAClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:3001') {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
  }

  /**
   * Generic request method with error handling
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `CUALA API error (${response.status}): ${errorText}`
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to connect to CUALA API: ${error.message}`);
      }
      throw error;
    }
  }

  // ============================================================================
  // Execution Tools
  // ============================================================================

  async executeScenario(scenario: string, failFast?: boolean) {
    return this.request('POST', '/api/execute', { scenario, failFast });
  }

  async executeScenarioAsync(scenario: string, failFast?: boolean) {
    return this.request('POST', '/api/execute-async', { scenario, failFast });
  }

  async executePlan(planId: string, failFast?: boolean) {
    return this.request('POST', `/api/plans/${planId}/execute`, { failFast });
  }

  async executePlanAsync(planId: string, failFast?: boolean) {
    return this.request('POST', `/api/plans/${planId}/execute-async`, { failFast });
  }

  // ============================================================================
  // Plan Management Tools
  // ============================================================================

  async generatePlan(scenario: string) {
    return this.request('POST', '/api/plan', { scenario });
  }

  async getPlan(planId: string) {
    return this.request('GET', `/api/get-plan/${planId}`);
  }

  async listPlans() {
    return this.request('GET', '/api/list-plans');
  }

  async updatePlan(planId: string, updates: {
    name?: string;
    steps?: unknown[];
    phase?: string;
    refinementHistory?: unknown[];
  }) {
    return this.request('PUT', `/api/plans/${planId}`, updates);
  }

  async deletePlan(planId: string) {
    return this.request('DELETE', `/api/plans/${planId}`);
  }

  async deleteAllPlans() {
    return this.request('DELETE', '/api/plans');
  }

  // ============================================================================
  // Execution Status Tools
  // ============================================================================

  async getStatus(testId: string) {
    return this.request('GET', `/api/get-status/${testId}`);
  }

  async getAllStatuses() {
    return this.request('GET', '/api/get-all-statuses');
  }

  async getHistory(scenarioId: string) {
    return this.request('GET', `/api/get-history/${scenarioId}`);
  }

  async getLatest(scenarioId: string) {
    return this.request('GET', `/api/get-latest/${scenarioId}`);
  }

  async deleteExecution(testId: string) {
    return this.request('DELETE', `/api/executions/${testId}`);
  }

  async deleteAllExecutions() {
    return this.request('DELETE', '/api/executions');
  }

  // ============================================================================
  // Configuration Tools
  // ============================================================================

  async getConfidenceThresholds() {
    return this.request('GET', '/api/confidence-thresholds');
  }

  async getConfidenceThreshold(actionType: string) {
    return this.request('GET', `/api/confidence-thresholds/${actionType}`);
  }

  async updateConfidenceThreshold(actionType: string, threshold: number) {
    return this.request('PUT', `/api/confidence-thresholds/${actionType}`, { threshold });
  }

  async deleteConfidenceThreshold(actionType: string) {
    return this.request('DELETE', `/api/confidence-thresholds/${actionType}`);
  }

  async resetAllConfidenceThresholds() {
    return this.request('DELETE', '/api/confidence-thresholds');
  }
}
