import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { apiClient, ExecutionStatus } from '@/services/apiClient'
import { uiNotificationService } from '@/services/uiNotificationService'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronRight, ArrowLeft, Trash2, Check, X, Circle } from 'lucide-react'

interface ExecutionStep {
  stepId: string
  description?: string
  selector?: string
  status: 'success' | 'failure' | 'error'
  snapshot?: {
    timestamp: number
    metadata: Record<string, unknown>
  }
  error?: string
  timestamp?: number
  verification?: {
    stepId: string
    isVerified: boolean
    evidence: string
  }
}

export const ReportDetailView = () => {
  const { testId } = useParams<{ testId: string }>()
  const navigate = useNavigate()
  const [status, setStatus] = useState<ExecutionStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  useEffect(() => {
    if (testId) {
      loadReport()
    }
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }
    }
  }, [testId])

  // Polling for pending/running reports
  useEffect(() => {
    if (status && (status.status === 'pending' || status.status === 'running')) {
      pollingIntervalRef.current = setInterval(async () => {
        try {
          const updatedStatus = await apiClient.getStatus(testId!)
          setStatus(updatedStatus)
          
          // Stop polling if completed or failed
          if (updatedStatus.status === 'completed' || updatedStatus.status === 'failed') {
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current)
              pollingIntervalRef.current = null
            }
          }
        } catch (error) {
          console.error('Error polling report status:', error)
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current)
            pollingIntervalRef.current = null
          }
        }
      }, 1000)
    } else {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    }
  }, [status, testId])

  const loadReport = async () => {
    if (!testId) return
    
    try {
      setLoading(true)
      const reportStatus = await apiClient.getStatus(testId)
      setStatus(reportStatus)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load report'
      uiNotificationService.send('report:load:error', {
        title: 'Failed to Load Report',
        message,
        variant: 'error',
      })
    } finally {
      setLoading(false)
    }
  }

  const toggleSteps = (stepId: string) => {
    setExpandedSteps(prev => {
      const newSet = new Set(prev)
      if (newSet.has(stepId)) {
        newSet.delete(stepId)
      } else {
        newSet.add(stepId)
      }
      return newSet
    })
  }

  const scrollToStep = (stepIndex: number) => {
    const stepElement = document.getElementById(`step-${stepIndex}`)
    if (stepElement) {
      stepElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // Highlight the step briefly
      stepElement.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2')
      setTimeout(() => {
        stepElement.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2')
      }, 2000)
    }
  }

  const handleDeleteClick = () => {
    setDeleteConfirmOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!testId) return

    try {
      // Stop polling
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }

      await apiClient.deleteExecution(testId)
      
      uiNotificationService.send('report:delete:success', {
        title: 'Report Deleted',
        message: 'The report has been successfully deleted',
        variant: 'success',
      })

      // Navigate back to reports list
      navigate('/reports')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete report'
      uiNotificationService.send('report:delete:error', {
        title: 'Failed to Delete Report',
        message,
        variant: 'error',
      })
      setDeleteConfirmOpen(false)
    }
  }


  // Check if a string is a base64 image
  const isBase64Image = (str: string): boolean => {
    if (str.length < 100) return false
    const base64Pattern = /^[A-Za-z0-9+/=]+$/
    return base64Pattern.test(str) && str.length > 500
  }

  // Helper to recursively find base64 images in objects
  const findBase64InObject = (obj: unknown): string | null => {
    if (typeof obj !== 'object' || obj === null) return null
    
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const found = findBase64InObject(item)
        if (found) return found
      }
      return null
    }
    
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        if (value.startsWith('data:image/')) {
          return value
        }
        const lowerKey = key.toLowerCase()
        if ((lowerKey.includes('screenshot') || lowerKey.includes('image')) 
            && isBase64Image(value)) {
          return value
        }
      } else if (typeof value === 'object' && value !== null) {
        const found = findBase64InObject(value)
        if (found) return found
      }
    }
    
    return null
  }

  const findBase64Image = (step: ExecutionStep): string | null => {
    // Check in snapshot metadata
    if (step.snapshot?.metadata) {
      for (const [key, value] of Object.entries(step.snapshot.metadata)) {
        if (typeof value === 'string') {
          if (value.startsWith('data:image/')) {
            return value
          }
          // Check for screenshot_base64 or similar
          const lowerKey = key.toLowerCase()
          if ((lowerKey.includes('screenshot') || lowerKey.includes('image')) 
              && isBase64Image(value)) {
            return value
          }
        } else if (typeof value === 'object' && value !== null) {
          const nested = findBase64InObject(value)
          if (nested) return nested
        }
      }
    }
    
    // Also check the entire step object for any base64 images
    const stepImage = findBase64InObject(step)
    if (stepImage) return stepImage
    
    return null
  }

  const normalizeImageData = (data: string): string => {
    if (data.startsWith('data:image')) {
      return data
    }
    return `data:image/png;base64,${data}`
  }

  const formatDate = (timestamp?: number): string => {
    if (!timestamp) return 'N/A'
    return new Date(timestamp).toLocaleString()
  }

  const formatDuration = (ms: number | null | undefined): string => {
    if (ms === null || ms === undefined) return 'N/A'
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    } else {
      return `${seconds}s`
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900 dark:text-green-300 dark:border-green-800'
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900 dark:text-red-300 dark:border-red-800'
      case 'running':
        return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900 dark:text-blue-300 dark:border-blue-800'
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900 dark:text-yellow-300 dark:border-yellow-800'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-800'
    }
  }

  if (loading) {
    return (
      <Card className="w-full max-w-6xl mx-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Report Details</CardTitle>
            <Button onClick={() => navigate('/reports')} variant="outline">
              Back
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12">
            <div className="text-muted-foreground">Loading report...</div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!status) {
    return (
      <Card className="w-full max-w-6xl mx-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Report Details</CardTitle>
            <Button onClick={() => navigate('/reports')} variant="outline">
              Back
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12">
            <div className="text-muted-foreground">Report not found</div>
          </div>
        </CardContent>
      </Card>
    )
  }

  const steps = (status.steps || status.results || []) as ExecutionStep[]

  return (
    <Card className="w-full max-w-6xl mx-auto h-[95vh] flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Report Details</CardTitle>
          <div className="flex gap-2">
            <Button
              onClick={handleDeleteClick}
              variant="outline"
              className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
            <Button onClick={() => navigate('/reports')} variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Reports
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto scrollbar-hide">
        <div className="space-y-6">
          {/* Header Information */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <h3 className="font-semibold text-sm mb-2">Test ID:</h3>
              <p className="text-sm text-muted-foreground font-mono">{status.testId}</p>
            </div>
            <div>
              <h3 className="font-semibold text-sm mb-2">Status:</h3>
              <div className={cn(
                "px-3 py-1 rounded-md border text-sm font-semibold uppercase inline-block",
                getStatusColor(status.status)
              )}>
                {status.status}
                {(status.status === 'pending' || status.status === 'running') && (
                  <span className="ml-2 animate-spin">⟳</span>
                )}
              </div>
            </div>
            {status.planName && (
              <div>
                <h3 className="font-semibold text-sm mb-2">Plan Name:</h3>
                <p className="text-sm text-muted-foreground">{status.planName}</p>
              </div>
            )}
            {status.planId && (
              <div>
                <h3 className="font-semibold text-sm mb-2">Plan ID:</h3>
                <p className="text-sm text-muted-foreground font-mono">{status.planId}</p>
              </div>
            )}
            <div>
              <h3 className="font-semibold text-sm mb-2">Created:</h3>
              <p className="text-sm text-muted-foreground">{formatDate(status.createdAt)}</p>
            </div>
            <div>
              <h3 className="font-semibold text-sm mb-2">Started:</h3>
              <p className="text-sm text-muted-foreground">{formatDate(status.startedAt)}</p>
            </div>
            <div>
              <h3 className="font-semibold text-sm mb-2">Completed:</h3>
              <p className="text-sm text-muted-foreground">{formatDate(status.completedAt)}</p>
            </div>
            <div>
              <h3 className="font-semibold text-sm mb-2">Duration:</h3>
              <p className="text-sm text-muted-foreground">
                {formatDuration(status.duration || (status.endTime && status.startTime ? status.endTime - status.startTime : null))}
              </p>
            </div>
            {status.totalSteps !== undefined && (
              <div>
                <h3 className="font-semibold text-sm mb-2">Steps:</h3>
                <p className="text-sm text-muted-foreground">{status.totalSteps} step{status.totalSteps !== 1 ? 's' : ''}</p>
              </div>
            )}
          </div>

          {/* Progress Step Bar */}
          {status.totalSteps !== undefined && status.totalSteps > 0 && (
            <div>
              <h3 className="font-semibold text-sm mb-3">Progress:</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span>Step {status.currentStep || 0} of {status.totalSteps}</span>
                  <span>{status.progress}%</span>
                </div>
                
                {/* Step Progress Bar */}
                <div className="flex items-center gap-2 py-2 overflow-x-auto">
                  {Array.from({ length: status.totalSteps }, (_, index) => {
                    const stepNumber = index + 1
                    // If status is completed, all steps are completed
                    const isCompleted = status.status === 'completed' 
                      ? true 
                      : status.currentStep ? stepNumber < status.currentStep : false
                    const isCurrent = status.status === 'completed' 
                      ? false 
                      : status.currentStep === stepNumber
                    const isFailed = status.status === 'failed' && status.currentStep === stepNumber
                    const isPending = !isCompleted && !isCurrent
                    
                    // Get step details if available
                    const stepData = steps[index]
                    
                    return (
                      <div key={stepNumber} className="flex items-center">
                        <div className="flex flex-col items-center min-w-[60px]">
                          <div
                            onClick={() => scrollToStep(index)}
                            className={cn(
                              "relative w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all cursor-pointer hover:scale-110 hover:shadow-lg",
                              isCompleted && "bg-green-500 border-green-600 text-white hover:bg-green-600",
                              isCurrent && !isFailed && "bg-blue-500 border-blue-600 text-white animate-pulse hover:bg-blue-600",
                              isFailed && "bg-red-500 border-red-600 text-white hover:bg-red-600",
                              isPending && "bg-muted border-border text-muted-foreground hover:bg-muted/80"
                            )}
                            title={`Click to scroll to step ${stepNumber}`}
                          >
                            {isCompleted ? (
                              <Check className="h-5 w-5" />
                            ) : isFailed ? (
                              <X className="h-5 w-5" />
                            ) : isCurrent ? (
                              <Circle className="h-5 w-5 fill-current" />
                            ) : (
                              <span className="text-xs font-semibold">{stepNumber}</span>
                            )}
                          </div>
                          {stepData?.description && (
                            <span className="text-xs text-muted-foreground mt-1 text-center max-w-[60px] truncate" title={stepData.description}>
                              {stepData.description}
                            </span>
                          )}
                        </div>
                        {index < status.totalSteps - 1 && (
                          <div
                            className={cn(
                              "h-0.5 w-8 transition-colors",
                              isCompleted ? "bg-green-500" : "bg-muted"
                            )}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
                
                {/* Percentage Progress Bar */}
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className={cn(
                      "h-2 rounded-full transition-all",
                      status.status === 'completed' && "bg-green-500",
                      status.status === 'failed' && "bg-red-500",
                      status.status === 'running' && "bg-blue-500",
                      status.status === 'pending' && "bg-yellow-500"
                    )}
                    style={{ width: `${status.progress}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Scenario */}
          <div>
            <h3 className="font-semibold text-sm mb-2">Scenario:</h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{status.scenario}</p>
          </div>

          {/* Reason */}
          {status.reason && (
            <div>
              <h3 className="font-semibold text-sm mb-2">Reason:</h3>
              <p className="text-sm text-muted-foreground">{status.reason}</p>
            </div>
          )}

          {/* Steps */}
          {steps.length > 0 && (
            <div>
              <h3 className="font-semibold text-lg mb-4">Steps ({steps.length})</h3>
              <div className="space-y-3">
                {steps.map((step, index) => {
                  const base64Image = findBase64Image(step)
                  const stepStatus = step.status

                  return (
                    <Card
                      id={`step-${index}`}
                      key={step.stepId}
                      className={cn(
                        "transition-all",
                        stepStatus === 'success' && "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800",
                        stepStatus === 'failure' && "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800",
                        stepStatus === 'error' && "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800",
                        !stepStatus && "bg-muted/30 border-border"
                      )}
                    >
                      <CardHeader>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-xs">
                                {index + 1}
                              </div>
                              <div className="font-medium text-sm">
                                {step.description || `Step ${index + 1}`}
                              </div>
                              {stepStatus && (
                                <div className={cn(
                                  "px-2 py-0.5 rounded text-xs font-semibold uppercase",
                                  stepStatus === 'success' && "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
                                  stepStatus === 'failure' && "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
                                  stepStatus === 'error' && "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                                )}>
                                  {stepStatus}
                                </div>
                              )}
                            </div>

                            {step.selector && (
                              <div className="text-xs text-muted-foreground mb-1">
                                Selector: {step.selector}
                              </div>
                            )}

                            {step.error && (
                              <div className="text-xs text-red-600 dark:text-red-400 mb-1">
                                Error: {step.error}
                              </div>
                            )}

                            {step.verification && (
                              <div className="text-xs text-muted-foreground mt-2">
                                <div className="font-semibold">Verification:</div>
                                <div>Verified: {step.verification.isVerified ? 'Yes' : 'No'}</div>
                                <div>Evidence: {step.verification.evidence}</div>
                              </div>
                            )}

                            {base64Image && (
                              <div className="mt-3 pt-3 border-t">
                                <div className="font-semibold text-sm mb-2">Screenshot:</div>
                                <div className="rounded-lg overflow-hidden border bg-background">
                                  <img
                                    src={normalizeImageData(base64Image)}
                                    alt={`Screenshot for step ${index + 1}`}
                                    className="w-full h-auto max-h-96 object-contain"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  )
                })}
              </div>
            </div>
          )}

          {steps.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No steps available for this report
            </div>
          )}
        </div>
      </CardContent>

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Report</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this report? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

