/**
 * UI Service
 * 
 * Handles form submissions and integrates with the CUALA backend API.
 * 
 * Note: Username and password fields are collected but not currently used by the API.
 * They may be used for future authentication or can be included in the scenario description.
 */

import { TaskFormData } from '@/features/agent/AgentTaskForm'
import { uiNotificationService } from './uiNotificationService'
import { apiClient, ExecuteAsyncResponse, ExecutionStatus } from './apiClient'

export interface TaskSubmissionResult {
  success: boolean
  testId?: string
  scenarioId?: string
  message?: string
  executionMode?: 'DOM_PREFERRED' | 'VISION_REQUIRED'
}

class UIService {
  /**
   * Submit a task form
   * @param data Task form data (username, password, description)
   * @returns Promise with submission result
   */
  /**
   * Submit a task form to the CUALA API
   * 
   * Uses async execution endpoint to start the test and return immediately.
   * The execution status can be polled using the returned testId.
   * 
   * @param data Task form data (username, password, description)
   * @param executionMode Optional execution mode (defaults to DOM_PREFERRED)
   * @returns Promise with submission result including testId and scenarioId
   */
  async submitTask(
    data: TaskFormData,
    executionMode: 'DOM_PREFERRED' | 'VISION_REQUIRED' = 'VISION_REQUIRED'
  ): Promise<TaskSubmissionResult> {
    try {
      // Build scenario description
      // Note: Username/password are collected but not sent to API currently
      // They could be included in scenario description or used for future auth
      const scenario = data.description || 'No description provided'

      // Log the submission
      console.log('Submitting task to API:', {
        scenario,
        executionMode,
        username: data.username, // Logged for debugging
        password: '***', // Never log password
      })

      // Call the async execution endpoint
      const response: ExecuteAsyncResponse = await apiClient.executeAsync({
        scenario,
        executionMode,
        failFast: true,
      })

      uiNotificationService.send('task:created', {
        title: 'Task Submission',
        message: 'Test execution started successfully',
        variant: 'success',
        testId: response.testId,
        scenarioId: response.scenarioId,
      })

      return {
        success: true,
        testId: response.testId,
        scenarioId: response.scenarioId,
        message: 'Test execution started successfully',
        executionMode,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to submit task'
      
      uiNotificationService.send('task:error', {
        title: 'Task Submission Failed',
        message,
        variant: 'error',
      })

      return {
        success: false,
        message,
      }
    }
  }

  /**
   * Get execution status by testId
   */
  async getExecutionStatus(testId: string): Promise<ExecutionStatus> {
    return apiClient.getStatus(testId)
  }

  /**
   * Get execution history by scenarioId
   */
  async getExecutionHistory(scenarioId: string) {
    return apiClient.getHistory(scenarioId)
  }

  /**
   * Get latest execution by scenarioId
   */
  async getLatestExecution(scenarioId: string): Promise<ExecutionStatus> {
    return apiClient.getLatest(scenarioId)
  }

  /**
   * Validate task data before submission
   * @param data Task form data
   * @returns Validation result
   */
  validateTaskData(data: TaskFormData): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!data.username?.trim()) {
      errors.push('Username is required')
    }

    if (!data.password?.trim()) {
      errors.push('Password is required')
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }
}

// Export singleton instance
export const uiService = new UIService()

