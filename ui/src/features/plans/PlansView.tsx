import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription as DialogDesc } from '@/components/ui/dialog'
import { apiClient } from '@/services/apiClient'
import { uiNotificationService } from '@/services/uiNotificationService'
import { PlanForm } from './PlanForm'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronRight, Upload, Download, Trash2, Plus, Search } from 'lucide-react'

interface PlanListItem {
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
}

interface PlanDetails {
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
}

export const PlansView = () => {
  const navigate = useNavigate()
  const [plans, setPlans] = useState<PlanListItem[]>([])
  const [planDetails, setPlanDetails] = useState<Map<string, PlanDetails>>(new Map())
  const [loading, setLoading] = useState(true)
  const [expandedPlans, setExpandedPlans] = useState<Set<string>>(new Set())
  const [loadingDetails, setLoadingDetails] = useState<Set<string>>(new Set())
  const [executingPlanId, setExecutingPlanId] = useState<string | null>(null)
  const [scenarioMap, setScenarioMap] = useState<Map<string, string>>(new Map())
  const [visibleImages, setVisibleImages] = useState<Set<string>>(new Set())
  const [deleteConfirmPlanId, setDeleteConfirmPlanId] = useState<string | null>(null)
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null)
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false)
  const [deletingAll, setDeletingAll] = useState(false)
  const [showPlanModal, setShowPlanModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadPlans()
  }, [])

  // Filter plans based on search query
  const filteredPlans = useMemo(() => {
    if (!searchQuery.trim()) {
      return plans
    }
    
    const query = searchQuery.toLowerCase().trim()
    return plans.filter(plan => {
      // Search by plan name
      if (plan.name.toLowerCase().includes(query)) {
        return true
      }
      // Search by plan ID
      if (plan.planId.toLowerCase().includes(query)) {
        return true
      }
      // Search by scenario ID
      if (plan.scenarioId.toLowerCase().includes(query)) {
        return true
      }
      // Search by phase
      if (plan.phase.toLowerCase().includes(query)) {
        return true
      }
      return false
    })
  }, [plans, searchQuery])

  const loadPlans = async () => {
    try {
      setLoading(true)
      const response = await apiClient.listPlans()
      setPlans(response.plans)

      // Try to get scenario descriptions for each plan
      const scenarioPromises = response.plans.map(async (plan) => {
        try {
          // Try to get latest execution for this scenario to get the scenario description
          const execution = await apiClient.getLatest(plan.scenarioId)
          return { scenarioId: plan.scenarioId, scenario: execution.scenario }
        } catch {
          return { scenarioId: plan.scenarioId, scenario: null }
        }
      })

      const scenarios = await Promise.all(scenarioPromises)
      const newScenarioMap = new Map<string, string>()
      scenarios.forEach(({ scenarioId, scenario }) => {
        if (scenario) {
          newScenarioMap.set(scenarioId, scenario)
        }
      })
      setScenarioMap(newScenarioMap)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load plans'
      uiNotificationService.send('plans:load:error', {
        title: 'Failed to Load Plans',
        message,
        variant: 'error',
      })
    } finally {
      setLoading(false)
    }
  }

  const togglePlan = async (planId: string) => {
    const newExpanded = new Set(expandedPlans)
    if (newExpanded.has(planId)) {
      newExpanded.delete(planId)
    } else {
      newExpanded.add(planId)
      // Fetch full plan details if not already loaded
      if (!planDetails.has(planId)) {
        await loadPlanDetails(planId)
      }
    }
    setExpandedPlans(newExpanded)
  }

  const loadPlanDetails = async (planId: string) => {
    if (loadingDetails.has(planId) || planDetails.has(planId)) {
      return
    }

    try {
      setLoadingDetails(prev => new Set(prev).add(planId))
      const details = await apiClient.getPlan(planId)
      setPlanDetails(prev => new Map(prev).set(planId, details))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load plan details'
      uiNotificationService.send('plans:details:error', {
        title: 'Failed to Load Plan Details',
        message,
        variant: 'error',
      })
    } finally {
      setLoadingDetails(prev => {
        const newSet = new Set(prev)
        newSet.delete(planId)
        return newSet
      })
    }
  }

  const handleExecute = async (plan: PlanListItem) => {
    try {
      setExecutingPlanId(plan.planId)
      
      // First, retrieve the plan by ID to get its scenarioId
      const planDetails = await apiClient.getPlan(plan.planId)
      
      // Get scenario description from scenarioMap or fetch it
      let scenario = scenarioMap.get(planDetails.scenarioId)
      
      // If scenario not in map, try to get it from latest execution
      if (!scenario) {
        try {
          const execution = await apiClient.getLatest(planDetails.scenarioId)
          scenario = execution.scenario
          // Update scenarioMap for future use
          setScenarioMap(prev => new Map(prev).set(planDetails.scenarioId, scenario!))
        } catch (error) {
          // If we can't get the scenario, use plan name as fallback
          scenario = planDetails.name || `Plan ${plan.planId}`
        }
      }
      
      // Execute async using the scenario
      const result = await apiClient.executeAsync({
        scenario,
        failFast: true,
      })

      uiNotificationService.send('plans:execute:success', {
        title: 'Execution Started',
        message: `Plan execution started with ID: ${result.testId}`,
        variant: 'success',
      })

      // Navigate to report page with test ID
      if (result.testId) {
        navigate(`/reports/${result.testId}`)
      } else {
        navigate('/reports')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to execute plan'
      uiNotificationService.send('plans:execute:error', {
        title: 'Execution Failed',
        message,
        variant: 'error',
      })
    } finally {
      setExecutingPlanId(null)
    }
  }

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return 'Unknown'
    return new Date(timestamp).toLocaleString()
  }

  // Helper function to find base64 image in step data
  const findBase64Image = (step: PlanDetails['steps'][0] | PlanListItem['steps'][0]): string | null => {
    // Check in action arguments (for full details)
    if ('action' in step && typeof step.action === 'object' && 'arguments' in step.action) {
      const actionArgs = step.action.arguments as Record<string, unknown>
      for (const [key, value] of Object.entries(actionArgs)) {
        // Check if value is a base64 image string
        if (typeof value === 'string') {
          if (value.startsWith('data:image/')) {
            return value
          }
          // Check for base64 image patterns in metadata keys
          const lowerKey = key.toLowerCase()
          if ((lowerKey.includes('screenshot') || lowerKey.includes('image') || lowerKey.includes('photo')) 
              && isBase64Image(value)) {
            return value
          }
        }
        // Check nested objects (like snapshot.metadata.screenshot_base64)
        if (typeof value === 'object' && value !== null) {
          const nested = findBase64InObject(value)
          if (nested) return nested
        }
      }
    }
    
    // Check in any additional fields on the step object
    const stepObj = step as Record<string, unknown>
    for (const [key, value] of Object.entries(stepObj)) {
      if (key === 'id' || key === 'description' || key === 'action' || key === 'assertion') continue
      
      if (typeof value === 'string') {
        if (value.startsWith('data:image/') || isBase64Image(value)) {
          return value
        }
      } else if (typeof value === 'object' && value !== null) {
        const nested = findBase64InObject(value)
        if (nested) return nested
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
        if (value.startsWith('data:image/') || isBase64Image(value)) {
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
    // Must be a reasonable length for a base64 image (at least 100 chars)
    if (str.length < 100) return false
    
    // Check if it's already a data URL
    if (str.startsWith('data:image/')) return true
    
    // Check if it matches base64 pattern (only alphanumeric, +, /, =)
    const base64Pattern = /^[A-Za-z0-9+/=]+$/
    if (!base64Pattern.test(str)) return false
    
    // Base64 images typically have a certain structure
    // They should have padding (=) at the end if needed, and be a reasonable length
    // For JPEG/PNG, base64 encoded images are usually quite long
    return str.length > 500 // Reasonable minimum for a small image
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

  // Normalize base64 image string to data URL format
  const normalizeImageData = (imageData: string): string => {
    if (imageData.startsWith('data:image/')) {
      return imageData
    }
    // Assume JPEG if no format specified
    return `data:image/jpeg;base64,${imageData}`
  }

  const handleExportPlan = async (plan: PlanListItem) => {
    try {
      // Get full plan details if not already loaded
      let planData = planDetails.get(plan.planId)
      if (!planData) {
        planData = await apiClient.getPlan(plan.planId)
        setPlanDetails(prev => new Map(prev).set(plan.planId, planData!))
      }

      // Create export data
      const exportData = {
        planId: planData.planId,
        scenarioId: planData.scenarioId,
        name: planData.name,
        phase: planData.phase,
        steps: planData.steps,
        refinementHistory: planData.refinementHistory,
        createdAt: planData.createdAt,
        exportedAt: Date.now(),
      }

      // Create blob and download
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `plan-${plan.planId}-${planData.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      uiNotificationService.send('plan:export:success', {
        title: 'Plan Exported',
        message: `Plan "${planData.name}" has been exported successfully`,
        variant: 'success',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to export plan'
      uiNotificationService.send('plan:export:error', {
        title: 'Export Failed',
        message,
        variant: 'error',
      })
    }
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const importedPlan = JSON.parse(text)

      // Validate imported plan structure
      if (!importedPlan.planId || !importedPlan.steps || !Array.isArray(importedPlan.steps)) {
        throw new Error('Invalid plan file format')
      }

      uiNotificationService.send('plan:import:success', {
        title: 'Plan Imported',
        message: `Plan "${importedPlan.name || importedPlan.planId}" has been imported. Note: This only imports the plan data for viewing.`,
        variant: 'success',
      })

      // Reload plans to see if it appears (if it was saved to backend)
      await loadPlans()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to import plan'
      uiNotificationService.send('plan:import:error', {
        title: 'Import Failed',
        message,
        variant: 'error',
      })
    } finally {
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleDeleteClick = (planId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeleteConfirmPlanId(planId)
  }

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmPlanId) return

    try {
      setDeletingPlanId(deleteConfirmPlanId)
      await apiClient.deletePlan(deleteConfirmPlanId)
      
      // Remove from local state
      setPlans(prev => prev.filter(plan => plan.planId !== deleteConfirmPlanId))
      setPlanDetails(prev => {
        const newMap = new Map(prev)
        newMap.delete(deleteConfirmPlanId)
        return newMap
      })
      setExpandedPlans(prev => {
        const newSet = new Set(prev)
        newSet.delete(deleteConfirmPlanId)
        return newSet
      })

      uiNotificationService.send('plan:delete:success', {
        title: 'Plan Deleted',
        message: 'Plan has been deleted successfully',
        variant: 'success',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete plan'
      uiNotificationService.send('plan:delete:error', {
        title: 'Delete Failed',
        message,
        variant: 'error',
      })
    } finally {
      setDeleteConfirmPlanId(null)
      setDeletingPlanId(null)
    }
  }

  const handleDeleteCancel = () => {
    setDeleteConfirmPlanId(null)
  }

  const handleDeleteAllClick = () => {
    setShowDeleteAllConfirm(true)
  }

  const handleDeleteAllConfirm = async () => {
    try {
      setDeletingAll(true)
      
      // Try to use the delete all API first
      try {
        await apiClient.deleteAllPlans()
      } catch (apiError) {
        // If API doesn't exist or fails, fall back to deleting individually
        console.warn('Delete all API failed, falling back to individual deletion:', apiError)
        await Promise.all(plans.map(plan => apiClient.deletePlan(plan.planId)))
      }
      
      // Clear all local state
      setPlans([])
      setPlanDetails(new Map())
      setExpandedPlans(new Set())
      setScenarioMap(new Map())
      setVisibleImages(new Set())

      uiNotificationService.send('plan:delete-all:success', {
        title: 'All Plans Deleted',
        message: 'All plans have been deleted successfully',
        variant: 'success',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete all plans'
      uiNotificationService.send('plan:delete-all:error', {
        title: 'Delete All Failed',
        message,
        variant: 'error',
      })
    } finally {
      setShowDeleteAllConfirm(false)
      setDeletingAll(false)
    }
  }

  const handleDeleteAllCancel = () => {
    setShowDeleteAllConfirm(false)
  }

  if (loading) {
    return (
      <Card className="w-full max-w-6xl mx-auto h-[95vh] flex flex-col">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>View Plans</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12">
            <div className="text-muted-foreground">Loading plans...</div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-6xl mx-auto h-[95vh] flex flex-col">
      <CardHeader>
          <div className="flex items-center justify-between mb-4">
            <CardTitle>View Plans ({filteredPlans.length}{searchQuery && ` of ${plans.length}`})</CardTitle>
            <div className="flex gap-2">
              <Button onClick={() => setShowPlanModal(true)} variant="default" size="sm">
                <Plus className="h-4 w-4 mr-2" />
                New
              </Button>
              <Button onClick={handleImportClick} variant="outline" size="sm">
                <Upload className="h-4 w-4 mr-2" />
                Import
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileImport}
                className="hidden"
                aria-label="Import plan file"
              />
              <Button onClick={loadPlans} variant="outline" size="sm">
                Refresh
              </Button>
              <Button 
                onClick={handleDeleteAllClick} 
                variant="destructive" 
                size="sm"
                disabled={plans.length === 0 || deletingAll}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete All
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by name, ID, scenario ID, or phase..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto scrollbar-hide">
        {filteredPlans.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-muted-foreground">
              {searchQuery ? 'No plans found matching your search' : 'No plans found'}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredPlans.map((plan) => {
              const isExpanded = expandedPlans.has(plan.planId)
              const scenario = scenarioMap.get(plan.scenarioId)
              const details = planDetails.get(plan.planId)
              const isLoadingDetails = loadingDetails.has(plan.planId)
              const displaySteps = details?.steps || plan.steps

              return (
                <Card key={plan.planId} className="border-2 relative">
                  <CardHeader 
                    className="relative cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => togglePlan(plan.planId)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <div
                            className="text-muted-foreground"
                            aria-label={isExpanded ? 'Collapse plan' : 'Expand plan'}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </div>
                          <CardTitle className="text-lg">
                            {plan.name}
                          </CardTitle>
                          {/* Phase Chip */}
                          <div className="pointer-events-none">
                            <span 
                              className={cn(
                                "inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-medium border min-w-[70px] uppercase",
                                plan.phase.toLowerCase() === 'initial' 
                                  ? "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700"
                                  : "bg-blue-500 text-white border-blue-600 dark:bg-blue-600 dark:text-white dark:border-blue-500"
                              )}
                            >
                              {plan.phase}
                            </span>
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          <div>Plan ID: {plan.planId}</div>
                          <div>Scenario ID: {plan.scenarioId}</div>
                          <div>Steps: {plan.totalSteps}</div>
                          <div>Created: {formatDate(plan.createdAt)}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleExecute(plan)
                          }}
                          disabled={executingPlanId === plan.planId}
                          size="sm"
                          title="Execute this plan"
                        >
                          {executingPlanId === plan.planId ? 'Executing...' : 'Execute'}
                        </Button>
                        <Button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleExportPlan(plan)
                          }}
                          variant="outline"
                          size="sm"
                          className="p-2"
                          aria-label="Export plan"
                          title="Export plan as JSON"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteClick(plan.planId, e)
                          }}
                          variant="outline"
                          size="sm"
                          className="p-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                          aria-label="Delete plan"
                          title="Delete this plan"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  {isExpanded && (
                    <CardContent>
                      <div className="space-y-3 pt-4 border-t">
                        <h4 className="font-semibold text-sm text-muted-foreground uppercase">
                          Steps ({displaySteps.length})
                        </h4>
                        {isLoadingDetails ? (
                          <div className="text-center py-4 text-muted-foreground">
                            Loading plan details...
                          </div>
                        ) : (
                          displaySteps.map((step, index) => {
                            // Check if we have full details or simplified step
                            const hasFullDetails = details && 'action' in step && typeof step.action === 'object'
                            const actionName = hasFullDetails 
                              ? (step as PlanDetails['steps'][0]).action.name 
                              : (step as PlanListItem['steps'][0]).action
                            const actionArgs = hasFullDetails 
                              ? (step as PlanDetails['steps'][0]).action.arguments 
                              : undefined
                            const assertion = hasFullDetails 
                              ? (step as PlanDetails['steps'][0]).assertion 
                              : undefined
                            const hasAssertion = hasFullDetails 
                              ? !!assertion 
                              : (step as PlanListItem['steps'][0]).hasAssertion

                            // Check for base64 image in step data
                            const base64Image = hasFullDetails ? findBase64Image(step as PlanDetails['steps'][0]) : null
                            const isImageVisible = visibleImages.has(step.id)

                            return (
                              <div
                                key={step.id}
                                className={cn(
                                  "p-4 rounded-lg border bg-muted/30",
                                  "space-y-2"
                                )}
                              >
                                <div className="flex items-start gap-3">
                                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm">
                                    {index + 1}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex-1">
                                        <div className="font-medium">{step.description}</div>
                                        <div className="text-sm text-muted-foreground mt-1">
                                          <div>
                                            <span className="font-semibold">Action:</span> {actionName}
                                          </div>
                                          {actionArgs && Object.keys(actionArgs).length > 0 && (
                                            <div className="mt-1">
                                              <span className="font-semibold">Arguments:</span>
                                              <pre className="text-xs bg-background p-2 rounded mt-1 overflow-x-auto">
                                                {JSON.stringify(actionArgs, null, 2)}
                                              </pre>
                                            </div>
                                          )}
                                          {assertion && (
                                            <div className="mt-2 pt-2 border-t">
                                              <div className="font-semibold text-primary">Assertion:</div>
                                              <div className="text-sm">{assertion.description}</div>
                                              <div className="text-xs text-muted-foreground mt-1">
                                                Check: {assertion.check}
                                              </div>
                                            </div>
                                          )}
                                          {!hasFullDetails && hasAssertion && (
                                            <div className="mt-2 pt-2 border-t text-primary">
                                              <div className="font-semibold">Has Assertion</div>
                                              <div className="text-xs text-muted-foreground">
                                                Expand to see full details
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                      {base64Image && (
                                        <Button
                                          onClick={() => toggleImage(step.id)}
                                          variant="outline"
                                          size="sm"
                                          className="flex-shrink-0"
                                        >
                                          {isImageVisible ? 'Hide Image' : 'View Image'}
                                        </Button>
                                      )}
                                    </div>
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
                                </div>
                              </div>
                            )
                          })
                        )}
                      </div>
                    </CardContent>
                  )}
                </Card>
              )
            })}
          </div>
        )}
      </CardContent>

      {/* Delete Confirmation Modal */}
      {deleteConfirmPlanId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>Delete Plan</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Are you sure you want to delete this plan? This action cannot be undone.
                </p>
                {(() => {
                  const plan = plans.find(p => p.planId === deleteConfirmPlanId)
                  return plan && (
                    <div className="p-3 bg-muted rounded-lg">
                      <div className="font-semibold">{plan.name}</div>
                      <div className="text-sm text-muted-foreground">Plan ID: {plan.planId}</div>
                    </div>
                  )
                })()}
                <div className="flex justify-end gap-2">
                  <Button
                    onClick={handleDeleteCancel}
                    variant="outline"
                    disabled={deletingPlanId === deleteConfirmPlanId}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleDeleteConfirm}
                    variant="destructive"
                    disabled={deletingPlanId === deleteConfirmPlanId}
                  >
                    {deletingPlanId === deleteConfirmPlanId ? 'Deleting...' : 'Delete'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Delete All Confirmation Modal */}
      {showDeleteAllConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>Delete All Plans</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Are you sure you want to delete all {plans.length} plan(s)? This action cannot be undone.
                </p>
                <div className="p-3 bg-muted rounded-lg">
                  <div className="font-semibold">Total Plans: {plans.length}</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    All plans will be permanently deleted.
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    onClick={handleDeleteAllCancel}
                    variant="outline"
                    disabled={deletingAll}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleDeleteAllConfirm}
                    variant="destructive"
                    disabled={deletingAll}
                  >
                    {deletingAll ? 'Deleting...' : 'Delete All'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Create Plan Modal */}
      <Dialog open={showPlanModal} onOpenChange={setShowPlanModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-hide">
          <DialogHeader>
            <DialogTitle>Create Plan</DialogTitle>
            <DialogDesc>
              Generate an execution plan without executing it
            </DialogDesc>
          </DialogHeader>
          <PlanForm
            onSubmit={async (data) => {
              setShowPlanModal(false)
              await loadPlans()
              if (data.alreadyExists) {
                uiNotificationService.send('plan:exists', {
                  title: 'Plan Already Exists',
                  message: `A plan with ID "${data.planId}" already exists for this scenario`,
                  variant: 'info',
                })
              } else {
                uiNotificationService.send('plan:created', {
                  title: 'Plan Created',
                  message: `Plan "${data.name}" has been created successfully`,
                  variant: 'success',
                })
              }
            }}
            onCancel={() => setShowPlanModal(false)}
          />
        </DialogContent>
      </Dialog>
    </Card>
  )
}

