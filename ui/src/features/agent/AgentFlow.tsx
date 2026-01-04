import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AgentTaskForm, TaskFormData } from './AgentTaskForm'
import { uiService } from '@/services/uiService'
import { uiNotificationService } from '@/services/uiNotificationService'
import { ExecutionStatus } from '@/services/apiClient'

export interface Step {
  id: string
  name: string
  description: string
  status: 'pending' | 'in-progress' | 'success' | 'failure'
  timestamp?: number
  details?: string
}

export interface FlowPhase {
  id: string
  name: string
  icon: string
  steps: Step[]
}

export interface AgentFlowProps {
  onFlowComplete?: (success: boolean) => void
  onFlowStart?: () => void
  onFlowReset?: () => void
}

const INITIAL_PHASES: FlowPhase[] = [
  {
    id: 'planning',
    name: 'Planning',
    icon: '📋',
    steps: [
      {
        id: 'plan-1',
        name: 'Scenario Analysis',
        description: 'Analyzing natural language scenario',
        status: 'pending',
      },
      {
        id: 'plan-2',
        name: 'Plan Generation',
        description: 'Generating execution plan',
        status: 'pending',
      },
    ],
  },
  {
    id: 'execution',
    name: 'Execution',
    icon: '⚡',
    steps: [
      {
        id: 'exec-1',
        name: 'DOM Executor',
        description: 'Executing DOM-based actions',
        status: 'pending',
      },
      {
        id: 'exec-2',
        name: 'Vision Executor',
        description: 'Fallback to vision-based execution',
        status: 'pending',
      },
    ],
  },
  {
    id: 'verification',
    name: 'Verification',
    icon: '✓',
    steps: [
      {
        id: 'verify-1',
        name: 'Step Verification',
        description: 'Verifying each execution step',
        status: 'pending',
      },
      {
        id: 'verify-2',
        name: 'Assertion Check',
        description: 'Validating final assertions',
        status: 'pending',
      },
    ],
  },
  {
    id: 'reporting',
    name: 'Reporting',
    icon: '📊',
    steps: [
      {
        id: 'report-1',
        name: 'Report Generation',
        description: 'Generating structured test report',
        status: 'pending',
      },
    ],
  },
]

export const AgentFlow = ({
  onFlowComplete,
  onFlowStart,
  onFlowReset,
}: AgentFlowProps) => {
  const [phases, setPhases] = useState<FlowPhase[]>(INITIAL_PHASES)
  const [isRunning, setIsRunning] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [showFlow, setShowFlow] = useState(false)

  const resetFlow = () => {
    // Reset all flow state
    setPhases(INITIAL_PHASES)
    setShowFlow(false)
    setShowForm(false)
    setIsRunning(false)
    onFlowReset?.()
  }

  const handleTaskSubmit = async (data: TaskFormData) => {
    // Form submission is handled by uiService in AgentTaskForm
    // This callback is called after successful submission with the result
    const result = await uiService.submitTask(data , 'VISION_REQUIRED')
    
    if (result.success && result.testId && result.scenarioId) {
      // Reset flow state
      setPhases(INITIAL_PHASES)
      setShowForm(false)
      setShowFlow(true)
      
      // Start polling for execution status
      await pollExecutionStatus(result.testId)
    }
  }

  const pollExecutionStatus = async (testId: string) => {
    setIsRunning(true)
    onFlowStart?.()

    // Reset phases to pending
    const updatedPhases = phases.map((phase) => ({
      ...phase,
      steps: phase.steps.map((step) => ({
        ...step,
        status: 'pending' as const,
      })),
    }))
    setPhases(updatedPhases)

    let allSuccess = true
    const maxPollAttempts = 300 // 5 minutes max (1 second intervals)
    let pollAttempts = 0

    try {
      while (pollAttempts < maxPollAttempts) {
        const status = await uiService.getExecutionStatus(testId)

        // Update phases based on execution status
        updatePhasesFromStatus(status)

        if (status.status === 'completed' || status.status === 'failed') {
          allSuccess = status.status === 'completed'
          break
        }

        // Poll every second
        await new Promise((resolve) => setTimeout(resolve, 1000))
        pollAttempts++
      }

      if (pollAttempts >= maxPollAttempts) {
        uiNotificationService.send('task:timeout', {
          title: 'Execution Timeout',
          message: 'Execution is taking longer than expected',
          variant: 'warning',
        })
      }
    } catch (error) {
      allSuccess = false
      const message = error instanceof Error ? error.message : 'Failed to get execution status'
      uiNotificationService.send('task:status:error', {
        title: 'Status Check Failed',
        message,
        variant: 'error',
      })
    } finally {
      setIsRunning(false)
      onFlowComplete?.(allSuccess)
    }
  }

  const updatePhasesFromStatus = (status: ExecutionStatus) => {
    // Map API status to our phase visualization
    // This is a simplified mapping - you may want to enhance this based on actual API response structure
    setPhases((prev) => {
      const updated = [...prev]
      const progress = status.progress || 0
      
      // Planning phase - mark as in-progress or completed based on status
      if (status.status === 'pending' || status.status === 'running') {
        updated[0] = {
          ...updated[0],
          steps: updated[0].steps.map((step, idx) => ({
            ...step,
            status: idx === 0 ? 'in-progress' : 'pending',
          })),
        }
      }

      // Execution phase
      if (status.status === 'running' && progress > 0) {
        updated[1] = {
          ...updated[1],
          steps: updated[1].steps.map((step, idx) => ({
            ...step,
            status: progress > 30 && idx === 0 ? 'success' : 
                    progress > 30 ? 'in-progress' : 'pending',
          })),
        }
      }

      // Verification phase
      if (status.status === 'running' && progress > 60) {
        updated[2] = {
          ...updated[2],
          steps: updated[2].steps.map((step, idx) => ({
            ...step,
            status: idx === 0 ? 'in-progress' : 'pending',
          })),
        }
      }

      // Reporting phase
      if (status.status === 'completed' || status.status === 'failed') {
        updated.forEach((phase) => {
          phase.steps = phase.steps.map((step) => ({
            ...step,
            status: status.status === 'completed' ? 'success' : 'failure',
            details: status.reason || (status.status === 'completed' ? 'Completed successfully' : 'Execution failed'),
          }))
        })
      }

      return updated
    })
  }

  const handleStartClick = () => {
    // Reset flow state when starting new flow
    setPhases(INITIAL_PHASES)
    setShowFlow(false)
    setShowForm(true)
  }

  const handleCancel = () => {
    // Reset flow state on cancel
    setPhases(INITIAL_PHASES)
    setShowForm(false)
    setShowFlow(false)
  }

  const getStatusIcon = (status: Step['status']) => {
    switch (status) {
      case 'success':
        return '✓'
      case 'failure':
        return '✗'
      case 'in-progress':
        return '⟳'
      default:
        return '○'
    }
  }

  // Show form when "Start Agent Flow" is clicked
  if (showForm) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Create Test Task</CardTitle>
          <CardDescription>
            Enter your task description to start the scenario agent flow
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AgentTaskForm
            onSubmit={handleTaskSubmit}
            onCancel={handleCancel}
            isLoading={isRunning}
          />
        </CardContent>
      </Card>
    )
  }

  // Show flow visualization after form submission
  if (showFlow) {
    return (
      <div className="w-full">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <h2 className="text-2xl font-semibold">Scenario Agent Flow</h2>
          <Button
            onClick={resetFlow}
            disabled={isRunning}
            variant="outline"
            aria-label="Reset scenario agent flow"
          >
            Reset
          </Button>
        </div>
        <div className="space-y-8">
          {phases.map((phase, phaseIndex) => (
            <div key={phase.id}>
              <div className="flex items-center gap-3 mb-4">
                <div className="text-3xl">{phase.icon}</div>
                <div>
                  <h3 className="text-xl font-semibold">
                    {phase.name}
                  </h3>
                  <div className="text-sm text-muted-foreground">
                    Phase {phaseIndex + 1} of {phases.length}
                  </div>
                </div>
              </div>

              <div className="ml-4 sm:ml-12 space-y-3">
                {phase.steps.map((step, stepIndex) => (
                  <div key={step.id}>
                    <div
                      className={cn(
                        "flex items-center gap-4 p-4 rounded-lg border-2 transition-all",
                        step.status === 'success' && "bg-green-50 text-green-900 border-green-200 dark:bg-green-950 dark:text-green-100 dark:border-green-800",
                        step.status === 'failure' && "bg-red-50 text-red-900 border-red-200 dark:bg-red-950 dark:text-red-100 dark:border-red-800",
                        step.status === 'in-progress' && "bg-blue-50 text-blue-900 border-blue-200 dark:bg-blue-950 dark:text-blue-100 dark:border-blue-800",
                        step.status === 'pending' && "bg-muted text-muted-foreground border-border"
                      )}
                      role="status"
                      aria-live="polite"
                      aria-label={`${step.name}: ${step.status}`}
                    >
                      <div className="text-2xl font-bold" aria-hidden="true">
                        {getStatusIcon(step.status)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold">{step.name}</div>
                        <div className="text-sm opacity-80">{step.description}</div>
                        {step.details && (
                          <div className="text-xs mt-1 opacity-70">
                            {step.details}
                          </div>
                        )}
                      </div>
                      {step.status === 'in-progress' && (
                        <div className="animate-spin text-2xl" aria-label="Processing" aria-hidden="true">
                          ⟳
                        </div>
                      )}
                    </div>
                    {stepIndex < phase.steps.length - 1 && (
                      <div className="ml-6 w-0.5 h-4 bg-border" aria-hidden="true"></div>
                    )}
                  </div>
                ))}
              </div>

              {phaseIndex < phases.length - 1 && (
                <div className="flex justify-center my-6">
                  <div className="w-0.5 h-8 bg-gradient-to-b from-primary/40 to-primary"></div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Show start button initially
  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-4">
      <Button
        onClick={handleStartClick}
        disabled={isRunning}
        size="lg"
        className="w-full max-w-md"
        aria-label="Start scenario agent flow"
      >
        New Scenario
      </Button>
    </div>
  )
}
