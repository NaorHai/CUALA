import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { apiClient, ExecutionStatus } from '@/services/apiClient'
import { uiNotificationService } from '@/services/uiNotificationService'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronRight, LayoutGrid, List, Search, Eye, Trash2, Check, X, Circle } from 'lucide-react'

interface ReportStatus {
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
}

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

type ViewMode = 'card' | 'table'

export const ReportsView = () => {
  const navigate = useNavigate()
  const [statuses, setStatuses] = useState<ReportStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [fullStatuses, setFullStatuses] = useState<Map<string, ExecutionStatus>>(new Map())
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())
  const [visibleImages, setVisibleImages] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<ViewMode>('card')
  const [visibleCount, setVisibleCount] = useState<number>(20)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const pollingIntervalRef = useRef<Map<string, NodeJS.Timeout>>(new Map())
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [reportToDelete, setReportToDelete] = useState<string | null>(null)

  // Filter statuses based on search query
  const filteredStatuses = useMemo(() => {
    if (!searchQuery.trim()) {
      return statuses
    }
    
    const query = searchQuery.toLowerCase().trim()
    return statuses.filter(status => {
      // Search by testId
      if (status.testId.toLowerCase().includes(query)) {
        return true
      }
      // Search by planName
      if (status.planName && status.planName.toLowerCase().includes(query)) {
        return true
      }
      // Search by scenario (name)
      if (status.scenario.toLowerCase().includes(query)) {
        return true
      }
      // Search by planId
      if (status.planId && status.planId.toLowerCase().includes(query)) {
        return true
      }
      return false
    })
  }, [statuses, searchQuery])

  // Visible reports for infinite scroll
  const visibleReports = useMemo(() => {
    return filteredStatuses.slice(0, visibleCount)
  }, [filteredStatuses, visibleCount])

  // Reset visible count when search changes
  useEffect(() => {
    setVisibleCount(20)
  }, [searchQuery])

  // Infinite scroll handler
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      // Load more when within 200px of bottom
      if (scrollHeight - scrollTop - clientHeight < 200) {
        if (visibleCount < filteredStatuses.length) {
          setVisibleCount(prev => Math.min(prev + 20, filteredStatuses.length))
        }
      }
    }

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [visibleCount, filteredStatuses.length])

  useEffect(() => {
    loadReports()
    
    // Cleanup polling on unmount
    return () => {
      pollingIntervalRef.current.forEach((interval) => clearInterval(interval))
      pollingIntervalRef.current.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Polling effect for pending/running reports
  useEffect(() => {
    // Clear all existing polling
    pollingIntervalRef.current.forEach((interval) => clearInterval(interval))
    pollingIntervalRef.current.clear()

    // Poll all pending or running reports
    statuses.forEach((report) => {
      if (report.status === 'pending' || report.status === 'running') {
        const interval = setInterval(async () => {
          try {
            const status = await apiClient.getStatus(report.testId)
            
            // Convert ExecutionStatus to ReportStatus format
            const updatedReport: ReportStatus = {
              testId: status.testId,
              scenarioId: status.scenarioId,
              scenario: status.scenario,
              status: status.status,
              createdAt: status.createdAt,
              startedAt: status.startedAt,
              completedAt: status.completedAt,
              planId: status.planId,
              planName: status.planName,
              currentStep: status.currentStep,
              totalSteps: status.totalSteps,
              progress: status.progress,
              reason: status.reason,
              duration: status.endTime && status.startTime 
              ? status.endTime - status.startTime 
              : null,
            }
            
            // Update the status in the list
            setStatuses(prev => prev.map(s => 
              s.testId === report.testId ? updatedReport : s
            ))
            
            // Update full status if it's loaded
            setFullStatuses(prev => {
              if (prev.has(report.testId)) {
                const newMap = new Map(prev)
                newMap.set(report.testId, status)
                return newMap
              }
              return prev
            })

            // Stop polling if completed or failed
            if (updatedReport.status === 'completed' || updatedReport.status === 'failed') {
              const currentInterval = pollingIntervalRef.current.get(report.testId)
              if (currentInterval) {
                clearInterval(currentInterval)
                pollingIntervalRef.current.delete(report.testId)
              }
            }
          } catch (error) {
            console.error('Error polling report status:', error)
            // Stop polling on error
            const currentInterval = pollingIntervalRef.current.get(report.testId)
            if (currentInterval) {
              clearInterval(currentInterval)
              pollingIntervalRef.current.delete(report.testId)
            }
          }
        }, 2000) // Poll every 2 seconds
        
        pollingIntervalRef.current.set(report.testId, interval)
      }
    })

    // Cleanup function
    return () => {
      pollingIntervalRef.current.forEach((interval) => clearInterval(interval))
      pollingIntervalRef.current.clear()
    }
  }, [statuses])

  const loadReports = async () => {
    try {
      setLoading(true)
      const response = await apiClient.getAllStatuses()
      setStatuses(response.statuses)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load reports'
      uiNotificationService.send('reports:load:error', {
        title: 'Failed to Load Reports',
        message,
        variant: 'error',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteClick = (testId: string) => {
    setReportToDelete(testId)
    setDeleteConfirmOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!reportToDelete) return

    try {
      // Stop polling for this report if it exists
      const interval = pollingIntervalRef.current.get(reportToDelete)
      if (interval) {
        clearInterval(interval)
        pollingIntervalRef.current.delete(reportToDelete)
      }

      await apiClient.deleteExecution(reportToDelete)
      
      // Remove from state
      setStatuses(prev => prev.filter(s => s.testId !== reportToDelete))
      setFullStatuses(prev => {
        const newMap = new Map(prev)
        newMap.delete(reportToDelete)
        return newMap
      })

      uiNotificationService.send('reports:delete:success', {
        title: 'Report Deleted',
        message: 'The report has been successfully deleted',
        variant: 'success',
      })

      setDeleteConfirmOpen(false)
      setReportToDelete(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete report'
      uiNotificationService.send('reports:delete:error', {
        title: 'Failed to Delete Report',
        message,
        variant: 'error',
      })
    }
  }

  const toggleImage = (stepId: string) => {
    const newVisible = new Set(visibleImages)
    if (newVisible.has(stepId)) {
      newVisible.delete(stepId)
    } else {
      newVisible.add(stepId)
    }
    setVisibleImages(newVisible)
  }

  // Helper function to find base64 image in step data
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
    
    return null
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

  // Check if a string is a base64 image
  const isBase64Image = (str: string): boolean => {
    if (str.length < 100) return false
    if (str.startsWith('data:image/')) return true
    const base64Pattern = /^[A-Za-z0-9+/=]+$/
    if (!base64Pattern.test(str)) return false
    return str.length > 500
  }

  // Normalize base64 image string to data URL format
  const normalizeImageData = (imageData: string): string => {
    if (imageData.startsWith('data:image/')) {
      return imageData
    }
    return `data:image/jpeg;base64,${imageData}`
  }

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return 'N/A'
    return new Date(timestamp).toLocaleString()
  }

  const formatDuration = (duration?: number | null) => {
    if (!duration) return 'N/A'
    const seconds = Math.floor(duration / 1000)
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

  const getStatusColor = (status: ReportStatus['status']) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950 dark:border-green-800'
      case 'failed':
        return 'text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950 dark:border-red-800'
      case 'running':
        return 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950 dark:border-blue-800'
      case 'pending':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200 dark:text-yellow-400 dark:bg-yellow-950 dark:border-yellow-800'
      default:
        return 'text-muted-foreground bg-muted border-border'
    }
  }

  if (loading) {
    return (
      <Card className="w-full max-w-6xl mx-auto h-[95vh] flex flex-col">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Reports</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12">
            <div className="text-muted-foreground">Loading reports...</div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-6xl mx-auto h-[95vh] flex flex-col">
      <CardHeader>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <CardTitle>Reports ({filteredStatuses.length}{searchQuery && ` of ${statuses.length}`})</CardTitle>
            <div className="flex gap-2">
              <Button onClick={loadReports} variant="outline" size="sm">
                Refresh
              </Button>
              <Button
                onClick={() => setViewMode(viewMode === 'card' ? 'table' : 'card')}
                variant="outline"
                size="sm"
                className="p-2"
                title={viewMode === 'card' ? 'Switch to table view' : 'Switch to card view'}
              >
                {viewMode === 'card' ? (
                  <List className="h-4 w-4" />
                ) : (
                  <LayoutGrid className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by ID or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto">
        {filteredStatuses.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-muted-foreground">
              {searchQuery ? `No reports found matching "${searchQuery}"` : 'No reports found'}
            </div>
          </div>
        ) : viewMode === 'table' ? (
          /* Table View */
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-semibold text-sm">Plan Name</th>
                  <th className="text-left p-3 font-semibold text-sm">Status</th>
                  <th className="text-left p-3 font-semibold text-sm">Created</th>
                  <th className="text-left p-3 font-semibold text-sm">Duration</th>
                  <th className="text-left p-3 font-semibold text-sm">Progress</th>
                  <th className="text-left p-3 font-semibold text-sm">Test ID</th>
                  <th className="text-left p-3 font-semibold text-sm">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStatuses.map((status) => (
                  <tr
                    key={status.testId}
                    className="border-b hover:bg-muted/50 transition-colors"
                  >
                    <td className="p-3 text-sm">
                      {status.planName || status.scenario.substring(0, 50) || 'Unnamed Plan'}
                    </td>
                    <td className="p-3">
                      <div className={cn(
                        "px-2 py-1 rounded text-xs font-semibold uppercase inline-block",
                        getStatusColor(status.status)
                      )}>
                        {status.status}
                      </div>
                    </td>
                    <td className="p-3 text-sm text-muted-foreground">
                      {formatDate(status.createdAt)}
                    </td>
                    <td className="p-3 text-sm text-muted-foreground">
                      {formatDuration(status.duration)}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-col gap-2">
                        {status.totalSteps !== undefined && status.totalSteps > 0 && (
                          <div className="flex items-center gap-1">
                            {Array.from({ length: Math.min(status.totalSteps, 10) }, (_, index) => {
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
                              const fullStatus = fullStatuses.get(status.testId)
                              const stepData = fullStatus && (fullStatus.steps || fullStatus.results) 
                                ? ((fullStatus.steps || fullStatus.results || []) as ExecutionStep[])[index]
                                : null
                              const stepDescription = stepData?.description || `Step ${stepNumber}`
                              const stepStatusText = isCompleted ? ' (Completed)' : isCurrent ? ' (Current)' : isFailed ? ' (Failed)' : ' (Pending)'
                              
                              return (
                                <div key={stepNumber} className="flex items-center">
                                  <div
                                    className={cn(
                                      "w-4 h-4 rounded-full flex items-center justify-center border transition-all",
                                      isCompleted && "bg-green-500 border-green-600",
                                      isCurrent && !isFailed && "bg-blue-500 border-blue-600 animate-pulse",
                                      isFailed && "bg-red-500 border-red-600",
                                      isPending && "bg-muted border-border"
                                    )}
                                    title={`${stepDescription}${stepStatusText}`}
                                  >
                                    {isCompleted && <Check className="h-2.5 w-2.5 text-white" />}
                                    {isFailed && <X className="h-2.5 w-2.5 text-white" />}
                                  </div>
                                  {index < Math.min(status.totalSteps, 10) - 1 && (
                                    <div
                                      className={cn(
                                        "h-0.5 w-1 transition-colors",
                                        isCompleted ? "bg-green-500" : "bg-muted"
                                      )}
                                    />
                                  )}
                                </div>
                              )
                            })}
                            {status.totalSteps > 10 && (
                              <span className="text-xs text-muted-foreground ml-1">+{status.totalSteps - 10}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground font-mono">
                      {status.testId.substring(0, 12)}...
                    </td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <Button
                          onClick={() => navigate(`/reports/${status.testId}`)}
                          variant="outline"
                          size="sm"
                          title="View full report details"
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          View
                        </Button>
                        <Button
                          onClick={() => handleDeleteClick(status.testId)}
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                          title="Delete report"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* Card View with Infinite Scroll */
          <div 
            ref={scrollContainerRef}
            className="space-y-4 max-h-[calc(100vh-300px)] overflow-y-auto scrollbar-hide"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {visibleReports.map((status) => {
              const fullStatus = fullStatuses.get(status.testId)
              const isStepsExpanded = expandedSteps.has(status.testId)
              
              return (
                <Card
                  key={status.testId}
                  className="transition-all hover:shadow-md"
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg">
                          {status.planName || status.scenario.substring(0, 50) || 'Unnamed Plan'}
                        </CardTitle>
                        <div className="text-sm text-muted-foreground mt-1">
                          <div>Test ID: {status.testId}</div>
                          {status.planId && <div>Plan ID: {status.planId}</div>}
                          <div>Created: {formatDate(status.createdAt)}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => navigate(`/reports/${status.testId}`)}
                          variant="outline"
                          size="sm"
                          title="View full report details"
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </Button>
                        <Button
                          onClick={() => handleDeleteClick(status.testId)}
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                          title="Delete report"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <div className={cn(
                          "px-3 py-1 rounded-md border text-sm font-semibold uppercase",
                          getStatusColor(status.status)
                        )}>
                          {status.status}
                        </div>
                        {(status.status === 'pending' || status.status === 'running') && (
                          <div className="animate-spin text-blue-500" aria-label="Polling">
                            ⟳
                          </div>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4 pt-4 border-t">
                      <div>
                        <h4 className="font-semibold text-sm mb-2">Scenario:</h4>
                        <p className="text-sm text-muted-foreground">{status.scenario}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <h4 className="font-semibold text-sm mb-1">Created:</h4>
                          <p className="text-sm text-muted-foreground">{formatDate(status.createdAt)}</p>
                        </div>
                        <div>
                          <h4 className="font-semibold text-sm mb-1">Started:</h4>
                          <p className="text-sm text-muted-foreground">{formatDate(status.startedAt)}</p>
                        </div>
                        <div>
                          <h4 className="font-semibold text-sm mb-1">Completed:</h4>
                          <p className="text-sm text-muted-foreground">{formatDate(status.completedAt)}</p>
                        </div>
                        <div>
                          <h4 className="font-semibold text-sm mb-1">Duration:</h4>
                          <p className="text-sm text-muted-foreground">{formatDuration(status.duration)}</p>
                        </div>
                      </div>

                      {status.totalSteps !== undefined && (
                        <div>
                          <h4 className="font-semibold text-sm mb-3">Progress:</h4>
                          <div className="space-y-3">
                            <div className="flex items-center justify-between text-sm">
                              <span>Step {status.currentStep || 0} of {status.totalSteps}</span>
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
                                const fullStatus = fullStatuses.get(status.testId)
                                const stepData = fullStatus && (fullStatus.steps || fullStatus.results) 
                                  ? ((fullStatus.steps || fullStatus.results || []) as ExecutionStep[])[index]
                                  : null
                                
                                return (
                                  <div key={stepNumber} className="flex items-center">
                                    <div className="flex flex-col items-center min-w-[60px]">
                                      <div
                                        className={cn(
                                          "relative w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all cursor-pointer",
                                          isCompleted && "bg-green-500 border-green-600 text-white",
                                          isCurrent && !isFailed && "bg-blue-500 border-blue-600 text-white animate-pulse",
                                          isFailed && "bg-red-500 border-red-600 text-white",
                                          isPending && "bg-muted border-border text-muted-foreground"
                                        )}
                                        title={stepData?.description || `Step ${stepNumber}`}
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
                          </div>
                        </div>
                      )}

                      {status.reason && (
                        <div>
                          <h4 className="font-semibold text-sm mb-2">Reason:</h4>
                          <p className="text-sm text-muted-foreground">{status.reason}</p>
                        </div>
                      )}

                      {/* Steps dropdown */}
                      <div className="mt-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            const newExpanded = new Set(expandedSteps)
                            if (isStepsExpanded) {
                              newExpanded.delete(status.testId)
                            } else {
                              newExpanded.add(status.testId)
                              // Load full status if not already loaded
                              if (!fullStatus) {
                                apiClient.getStatus(status.testId).then(s => {
                                  setFullStatuses(prev => new Map(prev).set(status.testId, s))
                                }).catch(err => console.error('Error loading steps:', err))
                              }
                            }
                            setExpandedSteps(newExpanded)
                          }}
                          className="w-full px-3 py-2 text-sm font-medium rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-colors"
                          type="button"
                        >
                          <span className="flex items-center justify-between">
                            <span className="flex items-center gap-2">
                              <span>Steps</span>
                              <span>
                                {fullStatus && (fullStatus.steps || fullStatus.results)
                                  ? `(${(fullStatus.steps || fullStatus.results || []).length})` 
                                  : status.totalSteps 
                                  ? `(${status.totalSteps})` 
                                  : '(Loading...)'}
                              </span>
                            </span>
                            <span className="text-muted-foreground">
                              {isStepsExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </span>
                          </span>
                        </button>
                        
                        {isStepsExpanded && fullStatus && (fullStatus.steps || fullStatus.results) && (fullStatus.steps || fullStatus.results || []).length > 0 && (
                          <div className="space-y-3 mt-3 border-t pt-3">
                            {((fullStatus.steps || fullStatus.results || []) as ExecutionStep[]).map((step, index) => {
                                const base64Image = findBase64Image(step)
                                const isImageVisible = visibleImages.has(step.stepId)
                                const stepStatus = step.status

                                return (
                                  <div
                                    key={step.stepId}
                                    className={cn(
                                      "p-4 rounded-lg border",
                                      stepStatus === 'success' && "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800",
                                      stepStatus === 'failure' && "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800",
                                      stepStatus === 'error' && "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800",
                                      !stepStatus && "bg-muted/30 border-border"
                                    )}
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-xs">
                                            {index + 1}
                                          </div>
                                          <div className="font-medium text-sm">
                                            {step.description || `Step ${index + 1}`}
                                          </div>
                                          <div className={cn(
                                            "px-2 py-0.5 rounded text-xs font-semibold uppercase",
                                            stepStatus === 'success' && "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
                                            stepStatus === 'failure' && "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
                                            stepStatus === 'error' && "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                                          )}>
                                            {stepStatus}
                                          </div>
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
                                        
                                        {base64Image && isImageVisible && (
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
                                      
                                      {base64Image && (
                                        <Button
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            toggleImage(step.stepId)
                                          }}
                                          variant="outline"
                                          size="sm"
                                          className="flex-shrink-0"
                                        >
                                          {isImageVisible ? 'Hide Image' : 'View Image'}
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                          </div>
                        )}
                        
                        {isStepsExpanded && (!fullStatus || !(fullStatus.steps || fullStatus.results) || (fullStatus.steps || fullStatus.results || []).length === 0) && (
                          <div className="text-center py-4 text-muted-foreground text-sm mt-3 border-t pt-3">
                            {!fullStatus ? 'Loading steps...' : 'No steps available'}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
            
            {visibleCount < filteredStatuses.length && (
              <div className="text-center py-4 text-muted-foreground text-sm">
                Loading more reports... ({visibleCount} of {filteredStatuses.length})
              </div>
            )}
          </div>
        )}
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
              onClick={() => {
                setDeleteConfirmOpen(false)
                setReportToDelete(null)
              }}
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

