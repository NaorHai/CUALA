import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { apiClient } from '@/services/apiClient'
import { uiNotificationService } from '@/services/uiNotificationService'
import { useTheme } from '@/contexts/ThemeContext'
import { Filter, GripVertical } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { 
  Card as MuiCard, 
  CardContent as MuiCardContent, 
  CardHeader as MuiCardHeader,
  Typography,
  Box,
  IconButton
} from '@mui/material'
import { LineChart, PieChart, BarChart } from '@mui/x-charts'

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

// Sortable Widget Wrapper Component
const SortableWidget = ({ id, children, isDark }: { id: string; children: React.ReactNode; isDark: boolean }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <Box
      ref={setNodeRef}
      style={style}
      sx={{ 
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: '400px'
      }}
    >
      <IconButton
        {...attributes}
        {...listeners}
        sx={{
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 10,
          cursor: 'grab',
          '&:active': { cursor: 'grabbing' },
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.8)',
          color: isDark ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.8)',
          '&:hover': { 
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.9)',
          },
        }}
        size="small"
      >
        <GripVertical className="h-4 w-4" />
      </IconButton>
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
        {children}
      </Box>
    </Box>
  )
}

export const DashboardsView = () => {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [statuses, setStatuses] = useState<ReportStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [globalSelectedReports, setGlobalSelectedReports] = useState<Set<string>>(new Set())
  const [globalSelectedScenarios, setGlobalSelectedScenarios] = useState<Set<string>>(new Set())
  const [selectedReportsDuration, setSelectedReportsDuration] = useState<Set<string>>(new Set())
  const [selectedScenariosDuration, setSelectedScenariosDuration] = useState<Set<string>>(new Set())
  const [selectedReportsStatus, setSelectedReportsStatus] = useState<Set<string>>(new Set())
  const [selectedScenariosStatus, setSelectedScenariosStatus] = useState<Set<string>>(new Set())
  const [selectedReportsKpi, setSelectedReportsKpi] = useState<Set<string>>(new Set())
  const [selectedScenariosKpi, setSelectedScenariosKpi] = useState<Set<string>>(new Set())
  const [selectedReportsSuccessRate, setSelectedReportsSuccessRate] = useState<Set<string>>(new Set())
  const [selectedScenariosSuccessRate, setSelectedScenariosSuccessRate] = useState<Set<string>>(new Set())
  const [selectedReportsAvgDuration, setSelectedReportsAvgDuration] = useState<Set<string>>(new Set())
  const [selectedScenariosAvgDuration, setSelectedScenariosAvgDuration] = useState<Set<string>>(new Set())
  const [selectedReportsExecutionStats, setSelectedReportsExecutionStats] = useState<Set<string>>(new Set())
  const [selectedScenariosExecutionStats, setSelectedScenariosExecutionStats] = useState<Set<string>>(new Set())
  const [openWidgetFilter, setOpenWidgetFilter] = useState<'kpi' | 'duration' | 'status' | 'successRate' | 'avgDuration' | 'executionStats' | null>(null)
  const [isGlobalFiltersOpen, setIsGlobalFiltersOpen] = useState(false)
  const [widgetOrder, setWidgetOrder] = useState<string[]>(() => {
    // Load from localStorage on init
    const saved = localStorage.getItem('cuala_dashboard_widget_order')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch {
        return ['kpi', 'duration', 'status', 'successRate', 'avgDuration', 'executionStats']
      }
    }
    return ['kpi', 'duration', 'status', 'successRate', 'avgDuration', 'executionStats']
  })

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Dark mode card styles
  const cardStyles = useMemo(() => ({
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: isDark ? 'hsl(222.2, 84%, 4.9%)' : '#ffffff',
    color: isDark ? 'hsl(210, 40%, 98%)' : 'hsl(222.2, 84%, 4.9%)',
    border: isDark ? '1px solid hsl(217.2, 32.6%, 17.5%)' : '1px solid hsl(214.3, 31.8%, 91.4%)',
    '& .MuiCardHeader-root': {
      borderBottom: isDark ? '1px solid hsl(217.2, 32.6%, 17.5%)' : '1px solid hsl(214.3, 31.8%, 91.4%)',
      '& .MuiTypography-root': {
        color: isDark ? 'hsl(210, 40%, 98%)' : 'hsl(222.2, 84%, 4.9%)',
      },
    },
    '& .MuiCardContent-root': {
      color: isDark ? 'hsl(210, 40%, 98%)' : 'hsl(222.2, 84%, 4.9%)',
    },
  }), [isDark])

  const nestedCardStyles = useMemo(() => ({
    backgroundColor: isDark ? 'hsl(217.2, 32.6%, 17.5%)' : 'hsl(210, 40%, 96.1%)',
    border: isDark ? '1px solid hsl(217.2, 32.6%, 25%)' : '1px solid hsl(214.3, 31.8%, 91.4%)',
    '& .MuiTypography-root': {
      color: isDark ? 'hsl(210, 40%, 98%)' : 'hsl(222.2, 84%, 4.9%)',
    },
  }), [isDark])

  // Chart container styles for dark mode
  const chartContainerStyles = useMemo(() => ({
    '& .MuiChartsAxis-root .MuiChartsAxis-tick': {
      fill: isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.87)',
    },
    '& .MuiChartsAxis-root .MuiChartsAxis-tickLabel': {
      fill: isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.87)',
    },
    '& .MuiChartsAxis-root .MuiChartsAxis-line': {
      stroke: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.12)',
    },
    '& .MuiChartsGrid-root .MuiChartsGrid-line': {
      stroke: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.12)',
    },
    '& .MuiChartsLegend-root .MuiChartsLegend-mark': {
      fill: isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.87)',
    },
    '& .MuiChartsLegend-root .MuiChartsLegend-label': {
      fill: isDark ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.87)',
    },
    '& .MuiChartsLegend-root text': {
      fill: isDark ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.87)',
    },
    '& .MuiChartsLegend-root .MuiChartsLegend-series': {
      '& text': {
        fill: isDark ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.87)',
      },
    },
    '& .MuiChartsLabel-root.MuiChartsLegend-label:not(.MuiChartsLabelMark-fill)': {
      fill: isDark ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.87)',
    },
    '& .MuiChartsLabel-root.MuiChartsLegend-label text': {
      fill: isDark ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.87)',
    },
    '& .MuiChartsLegend-root .MuiChartsLabel-root:not(.MuiChartsLabelMark-fill)': {
      fill: isDark ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.87)',
    },
    '& .MuiChartsLegend-root .MuiChartsLabel-root text': {
      fill: isDark ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.87)',
    },
    // Note: MuiChartsLabelMark-fill should keep its original fill color (not overridden)
    '& .MuiChartsTooltip-root': {
      backgroundColor: isDark ? 'hsl(222.2, 84%, 4.9%)' : '#ffffff',
      color: isDark ? 'hsl(210, 40%, 98%)' : 'hsl(222.2, 84%, 4.9%)',
      border: isDark ? '1px solid hsl(217.2, 32.6%, 17.5%)' : '1px solid hsl(214.3, 31.8%, 91.4%)',
    },
    // Target all SVG text elements within the chart
    '& svg text': {
      fill: isDark ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.87)',
    },
  }), [isDark])

  useEffect(() => {
    loadReports()
  }, [])

  // Save widget order to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('cuala_dashboard_widget_order', JSON.stringify(widgetOrder))
  }, [widgetOrder])

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setWidgetOrder((items) => {
        const oldIndex = items.indexOf(active.id as string)
        const newIndex = items.indexOf(over.id as string)
        return arrayMove(items, oldIndex, newIndex)
      })
    }
  }

  // Get unique scenarios from statuses
  const uniqueScenarios = useMemo(() => {
    const scenarioSet = new Set<string>()
    statuses.forEach(s => {
      if (s.scenario) {
        scenarioSet.add(s.scenario)
      }
    })
    return Array.from(scenarioSet).sort()
  }, [statuses])

  useEffect(() => {
    // Select all reports and scenarios by default for global filter
    if (statuses.length > 0 && globalSelectedReports.size === 0) {
      const allTestIds = new Set(statuses.map(s => s.testId))
      const allScenarios = new Set(uniqueScenarios)
      setGlobalSelectedReports(allTestIds)
      setGlobalSelectedScenarios(allScenarios)
      // Also set all individual widget filters to match
      setSelectedReportsDuration(allTestIds)
      setSelectedScenariosDuration(allScenarios)
      setSelectedReportsStatus(allTestIds)
      setSelectedScenariosStatus(allScenarios)
      setSelectedReportsKpi(allTestIds)
      setSelectedScenariosKpi(allScenarios)
      setSelectedReportsSuccessRate(allTestIds)
      setSelectedScenariosSuccessRate(allScenarios)
      setSelectedReportsAvgDuration(allTestIds)
      setSelectedScenariosAvgDuration(allScenarios)
      setSelectedReportsExecutionStats(allTestIds)
      setSelectedScenariosExecutionStats(allScenarios)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statuses, uniqueScenarios])

  // Sync all widget filters when global filter changes
  useEffect(() => {
    setSelectedReportsDuration(globalSelectedReports)
    setSelectedScenariosDuration(globalSelectedScenarios)
    setSelectedReportsStatus(globalSelectedReports)
    setSelectedScenariosStatus(globalSelectedScenarios)
    setSelectedReportsKpi(globalSelectedReports)
    setSelectedScenariosKpi(globalSelectedScenarios)
    setSelectedReportsSuccessRate(globalSelectedReports)
    setSelectedScenariosSuccessRate(globalSelectedScenarios)
    setSelectedReportsAvgDuration(globalSelectedReports)
    setSelectedScenariosAvgDuration(globalSelectedScenarios)
    setSelectedReportsExecutionStats(globalSelectedReports)
    setSelectedScenariosExecutionStats(globalSelectedScenarios)
  }, [globalSelectedReports, globalSelectedScenarios])


  const loadReports = async () => {
    try {
      setLoading(true)
      const response = await apiClient.getAllStatuses()
      const reports: ReportStatus[] = response.statuses.map(status => ({
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
        duration: status.duration,
      }))
      setStatuses(reports)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load reports'
      uiNotificationService.send('dashboards:load:error', {
        title: 'Failed to Load Reports',
        message,
        variant: 'error',
      })
    } finally {
      setLoading(false)
    }
  }

  const toggleReport = (testId: string, widgetId: string) => {
    const setters: { [key: string]: React.Dispatch<React.SetStateAction<Set<string>>> } = {
      'kpi': setSelectedReportsKpi,
      'duration': setSelectedReportsDuration,
      'status': setSelectedReportsStatus,
      'successRate': setSelectedReportsSuccessRate,
      'avgDuration': setSelectedReportsAvgDuration,
      'executionStats': setSelectedReportsExecutionStats,
    }
    const setter = setters[widgetId]
    if (setter) {
      setter(prev => {
        const newSet = new Set(prev)
        if (newSet.has(testId)) {
          newSet.delete(testId)
        } else {
          newSet.add(testId)
        }
        return newSet
      })
    }
  }

  const toggleGlobalReport = (testId: string) => {
    setGlobalSelectedReports(prev => {
      const newSet = new Set(prev)
      if (newSet.has(testId)) {
        newSet.delete(testId)
      } else {
        newSet.add(testId)
      }
      return newSet
    })
  }

  const selectAllReports = (widgetId: string) => {
    const setters: { [key: string]: React.Dispatch<React.SetStateAction<Set<string>>> } = {
      'kpi': setSelectedReportsKpi,
      'duration': setSelectedReportsDuration,
      'status': setSelectedReportsStatus,
      'successRate': setSelectedReportsSuccessRate,
      'avgDuration': setSelectedReportsAvgDuration,
      'executionStats': setSelectedReportsExecutionStats,
    }
    const setter = setters[widgetId]
    if (setter) {
      setter(new Set(statuses.map(s => s.testId)))
    }
  }

  const deselectAllReports = (widgetId: string) => {
    const setters: { [key: string]: React.Dispatch<React.SetStateAction<Set<string>>> } = {
      'kpi': setSelectedReportsKpi,
      'duration': setSelectedReportsDuration,
      'status': setSelectedReportsStatus,
      'successRate': setSelectedReportsSuccessRate,
      'avgDuration': setSelectedReportsAvgDuration,
      'executionStats': setSelectedReportsExecutionStats,
    }
    const setter = setters[widgetId]
    if (setter) {
      setter(new Set())
    }
  }

  const selectAllGlobalReports = () => {
    setGlobalSelectedReports(new Set(statuses.map(s => s.testId)))
  }

  const deselectAllGlobalReports = () => {
    setGlobalSelectedReports(new Set())
  }

  const toggleGlobalScenario = (scenario: string) => {
    setGlobalSelectedScenarios(prev => {
      const newSet = new Set(prev)
      if (newSet.has(scenario)) {
        newSet.delete(scenario)
      } else {
        newSet.add(scenario)
      }
      return newSet
    })
  }

  const selectAllGlobalScenarios = () => {
    setGlobalSelectedScenarios(new Set(uniqueScenarios))
  }

  const deselectAllGlobalScenarios = () => {
    setGlobalSelectedScenarios(new Set())
  }

  const toggleScenario = (scenario: string, widgetId: string) => {
    const setters: { [key: string]: React.Dispatch<React.SetStateAction<Set<string>>> } = {
      'kpi': setSelectedScenariosKpi,
      'duration': setSelectedScenariosDuration,
      'status': setSelectedScenariosStatus,
      'successRate': setSelectedScenariosSuccessRate,
      'avgDuration': setSelectedScenariosAvgDuration,
      'executionStats': setSelectedScenariosExecutionStats,
    }
    const setter = setters[widgetId]
    if (setter) {
      setter(prev => {
        const newSet = new Set(prev)
        if (newSet.has(scenario)) {
          newSet.delete(scenario)
        } else {
          newSet.add(scenario)
        }
        return newSet
      })
    }
  }

  const selectAllScenarios = (widgetId: string) => {
    const setters: { [key: string]: React.Dispatch<React.SetStateAction<Set<string>>> } = {
      'kpi': setSelectedScenariosKpi,
      'duration': setSelectedScenariosDuration,
      'status': setSelectedScenariosStatus,
      'successRate': setSelectedScenariosSuccessRate,
      'avgDuration': setSelectedScenariosAvgDuration,
      'executionStats': setSelectedScenariosExecutionStats,
    }
    const setter = setters[widgetId]
    if (setter) {
      setter(new Set(uniqueScenarios))
    }
  }

  const deselectAllScenarios = (widgetId: string) => {
    const setters: { [key: string]: React.Dispatch<React.SetStateAction<Set<string>>> } = {
      'kpi': setSelectedScenariosKpi,
      'duration': setSelectedScenariosDuration,
      'status': setSelectedScenariosStatus,
      'successRate': setSelectedScenariosSuccessRate,
      'avgDuration': setSelectedScenariosAvgDuration,
      'executionStats': setSelectedScenariosExecutionStats,
    }
    const setter = setters[widgetId]
    if (setter) {
      setter(new Set())
    }
  }

  const getSelectedReports = (widgetId: string): Set<string> => {
    const maps: { [key: string]: Set<string> } = {
      'kpi': selectedReportsKpi,
      'duration': selectedReportsDuration,
      'status': selectedReportsStatus,
      'successRate': selectedReportsSuccessRate,
      'avgDuration': selectedReportsAvgDuration,
      'executionStats': selectedReportsExecutionStats,
    }
    return maps[widgetId] || new Set()
  }

  const getSelectedScenarios = (widgetId: string): Set<string> => {
    const maps: { [key: string]: Set<string> } = {
      'kpi': selectedScenariosKpi,
      'duration': selectedScenariosDuration,
      'status': selectedScenariosStatus,
      'successRate': selectedScenariosSuccessRate,
      'avgDuration': selectedScenariosAvgDuration,
      'executionStats': selectedScenariosExecutionStats,
    }
    return maps[widgetId] || new Set()
  }

  // Filter by both reports AND scenarios (AND logic)
  // If no scenarios are selected, show all reports that match the report filter
  // If scenarios are selected, only show reports that match both filters
  // When a scenario is deselected, reports with that scenario are hidden
  const filteredStatusesDuration = statuses.filter(s => {
    const matchesReport = selectedReportsDuration.has(s.testId)
    // If no scenarios are selected, show all (scenario filter is ignored)
    // If scenarios are selected, only show reports whose scenario is in the selected set
    const matchesScenario = selectedScenariosDuration.size === 0 || (s.scenario && selectedScenariosDuration.has(s.scenario))
    return matchesReport && matchesScenario
  })
  const filteredStatusesStatus = statuses.filter(s => {
    const matchesReport = selectedReportsStatus.has(s.testId)
    const matchesScenario = selectedScenariosStatus.size === 0 || (s.scenario && selectedScenariosStatus.has(s.scenario))
    return matchesReport && matchesScenario
  })
  const filteredStatusesKpi = statuses.filter(s => {
    const matchesReport = selectedReportsKpi.has(s.testId)
    const matchesScenario = selectedScenariosKpi.size === 0 || (s.scenario && selectedScenariosKpi.has(s.scenario))
    return matchesReport && matchesScenario
  })
  const filteredStatusesSuccessRate = statuses.filter(s => {
    const matchesReport = selectedReportsSuccessRate.has(s.testId)
    const matchesScenario = selectedScenariosSuccessRate.size === 0 || (s.scenario && selectedScenariosSuccessRate.has(s.scenario))
    return matchesReport && matchesScenario
  })
  const filteredStatusesAvgDuration = statuses.filter(s => {
    const matchesReport = selectedReportsAvgDuration.has(s.testId)
    const matchesScenario = selectedScenariosAvgDuration.size === 0 || (s.scenario && selectedScenariosAvgDuration.has(s.scenario))
    return matchesReport && matchesScenario
  })
  const filteredStatusesExecutionStats = statuses.filter(s => {
    const matchesReport = selectedReportsExecutionStats.has(s.testId)
    const matchesScenario = selectedScenariosExecutionStats.size === 0 || (s.scenario && selectedScenariosExecutionStats.has(s.scenario))
    return matchesReport && matchesScenario
  })

  // Helper function to render filter button
  const renderFilterButton = (widgetId: string) => {
    return (
      <Button
        onClick={() => setOpenWidgetFilter(widgetId as 'kpi' | 'duration' | 'status' | 'successRate' | 'avgDuration' | 'executionStats')}
        variant="outline"
        size="sm"
        className="h-8 w-8 p-0 ml-2"
        title="Filter reports"
      >
        <Filter className="h-4 w-4" />
      </Button>
    )
  }

  // Calculate duration statistics
  const durations = filteredStatusesDuration
    .filter(s => s.duration !== null && s.duration !== undefined)
    .map(s => ({
      testId: s.testId,
      planName: s.planName || s.scenario.substring(0, 30) || 'Unnamed',
      duration: s.duration!,
    }))
    .sort((a, b) => b.duration - a.duration)

  // Calculate status counts
  const statusCounts = filteredStatusesStatus.reduce((acc, status) => {
    acc[status.status] = (acc[status.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const statusColors: Record<string, string> = {
    completed: 'bg-green-500',
    failed: 'bg-red-500',
    running: 'bg-blue-500',
    pending: 'bg-yellow-500',
  }

  const statusLabels: Record<string, string> = {
    completed: 'Completed',
    failed: 'Failed',
    running: 'Running',
    pending: 'Pending',
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

  // Calculate KPI metrics (using filtered KPI reports)
  const totalReports = filteredStatusesKpi.length
  const completedReports = filteredStatusesKpi.filter(s => s.status === 'completed').length
  const failedReports = filteredStatusesKpi.filter(s => s.status === 'failed').length
  const runningReports = filteredStatusesKpi.filter(s => s.status === 'running').length
  const pendingReports = filteredStatusesKpi.filter(s => s.status === 'pending').length
  const successRate = totalReports > 0 ? ((completedReports / totalReports) * 100).toFixed(1) : '0'
  
  const totalDuration = filteredStatusesKpi
    .filter(s => s.duration !== null && s.duration !== undefined)
    .reduce((sum, s) => sum + (s.duration || 0), 0)
  const avgDuration = filteredStatusesKpi.filter(s => s.duration !== null && s.duration !== undefined).length > 0
    ? totalDuration / filteredStatusesKpi.filter(s => s.duration !== null && s.duration !== undefined).length
    : 0

  // Calculate success rate over time (group by day) - using filtered reports
  const successRateByDay = useMemo(() => {
    const dayMap = new Map<string, { total: number; completed: number }>()
    
    filteredStatusesSuccessRate.forEach(status => {
      const date = new Date(status.createdAt)
      const dayKey = date.toISOString().split('T')[0]
      
      const dayData = dayMap.get(dayKey) || { total: 0, completed: 0 }
      dayData.total++
      if (status.status === 'completed') {
        dayData.completed++
      }
      dayMap.set(dayKey, dayData)
    })
    
    return Array.from(dayMap.entries())
      .map(([date, data]) => ({
        date,
        rate: data.total > 0 ? (data.completed / data.total) * 100 : 0,
        total: data.total,
        completed: data.completed
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [filteredStatusesSuccessRate])

  // Calculate average duration by plan - using filtered reports
  const avgDurationByPlan = useMemo(() => {
    const planMap = new Map<string, { total: number; sum: number }>()
    
    filteredStatusesAvgDuration.forEach(status => {
      const planName = status.planName || status.scenario.substring(0, 30) || 'Unnamed'
      if (status.duration !== null && status.duration !== undefined) {
        const planData = planMap.get(planName) || { total: 0, sum: 0 }
        planData.total++
        planData.sum += status.duration
        planMap.set(planName, planData)
      }
    })
    
    return Array.from(planMap.entries())
      .map(([planName, data]) => ({
        planName,
        avgDuration: data.sum / data.total
      }))
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, 10) // Top 10 plans
  }, [filteredStatusesAvgDuration])

  // Execution statistics - using filtered reports
  const executionStats = useMemo(() => {
    const durations = filteredStatusesExecutionStats
      .filter(s => s.duration !== null && s.duration !== undefined)
      .map(s => s.duration!)
    
    if (durations.length === 0) {
      return {
        total: 0,
        avg: 0,
        median: 0,
        min: 0,
        max: 0,
        totalTime: 0
      }
    }
    
    const sorted = [...durations].sort((a, b) => a - b)
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)]
    
    return {
      total: filteredStatusesExecutionStats.length,
      avg: durations.reduce((a, b) => a + b, 0) / durations.length,
      median,
      min: Math.min(...durations),
      max: Math.max(...durations),
      totalTime: durations.reduce((a, b) => a + b, 0)
    }
  }, [filteredStatusesExecutionStats])

  if (loading) {
    return (
      <Card className="w-full max-w-6xl mx-auto h-[95vh] flex flex-col">
        <CardHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle>Analytics</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-muted-foreground">Loading analytics...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 scrollbar-hide">
      <Card className="h-[95vh] flex flex-col">
        <CardHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle>Analytics</CardTitle>
            <div className="flex gap-2">
              <Button
                onClick={() => setIsGlobalFiltersOpen(true)}
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                title="Open filters"
              >
                <Filter className="h-4 w-4" />
              </Button>
              <Button onClick={loadReports} variant="outline" size="sm" className="h-8">
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent 
          className="scrollbar-hide flex-1 overflow-y-auto"
          style={{
            msOverflowStyle: 'none',
            scrollbarWidth: 'none',
          }}
        >
          {statuses.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-muted-foreground">No reports found</div>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={widgetOrder}
                strategy={verticalListSortingStrategy}
              >
                <Box 
                  display="grid" 
                  gridTemplateColumns={{ xs: '1fr', md: 'repeat(2, 1fr)' }} 
                  gap={3}
                  sx={{ alignItems: 'stretch' }}
                >
                  {widgetOrder.map((widgetId) => {
                    if (widgetId === 'kpi') {
                      return (
                        <SortableWidget key={widgetId} id={widgetId} isDark={isDark}>
                          {/* KPI Cards */}
                          <Box sx={{ gridColumn: { xs: '1', md: '1 / -1' }, height: '100%', display: 'flex', flexDirection: 'column' }}>
                            <MuiCard sx={cardStyles}>
                              <MuiCardHeader
                                title={
                                  <Box display="flex" alignItems="center">
                                    <Typography variant="h6">KPI Cards</Typography>
                                    {renderFilterButton('kpi')}
                                  </Box>
                                }
                              />
                              <MuiCardContent>
                                <Box display="grid" gridTemplateColumns={{ xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' }} gap={2}>
                                  <MuiCard sx={nestedCardStyles}>
                                    <MuiCardContent sx={{ p: 2 }}>
                                      <Typography variant="body2" sx={{ color: isDark ? 'rgba(255, 255, 255, 0.7)' : undefined }} gutterBottom>
                                        Total Reports
                                      </Typography>
                                      <Typography variant="h4" component="div" sx={{ color: isDark ? 'rgba(255, 255, 255, 0.9)' : undefined }}>
                                        {totalReports}
                                      </Typography>
                                    </MuiCardContent>
                                  </MuiCard>
                                  <MuiCard sx={nestedCardStyles}>
                                    <MuiCardContent sx={{ p: 2 }}>
                                      <Typography variant="body2" sx={{ color: isDark ? 'rgba(255, 255, 255, 0.7)' : undefined }} gutterBottom>
                                        Success Rate
                                      </Typography>
                                      <Typography variant="h4" component="div" color="success.main">
                                        {successRate}%
                                      </Typography>
                                      <Typography variant="caption" sx={{ color: isDark ? 'rgba(255, 255, 255, 0.7)' : undefined }}>
                                        {completedReports} / {totalReports} completed
                                      </Typography>
                                    </MuiCardContent>
                                  </MuiCard>
                                  <MuiCard sx={nestedCardStyles}>
                                    <MuiCardContent sx={{ p: 2 }}>
                                      <Typography variant="body2" sx={{ color: isDark ? 'rgba(255, 255, 255, 0.7)' : undefined, whiteSpace: 'nowrap' }} gutterBottom>
                                        Active Reports
                                      </Typography>
                                      <Typography variant="h4" component="div" color="info.main">
                                        {runningReports + pendingReports}
                                      </Typography>
                                      <Typography variant="caption" sx={{ color: isDark ? 'rgba(255, 255, 255, 0.7)' : undefined }}>
                                        {runningReports} running, {pendingReports} pending
                                      </Typography>
                                    </MuiCardContent>
                                  </MuiCard>
                                  <MuiCard sx={nestedCardStyles}>
                                    <MuiCardContent sx={{ p: 2 }}>
                                      <Typography variant="body2" sx={{ color: isDark ? 'rgba(255, 255, 255, 0.7)' : undefined }} gutterBottom>
                                        Avg Duration
                                      </Typography>
                                      <Typography variant="h4" component="div" sx={{ color: isDark ? 'rgba(255, 255, 255, 0.9)' : undefined }}>
                                        {formatDuration(avgDuration)}
                                      </Typography>
                                      <Typography variant="caption" sx={{ color: isDark ? 'rgba(255, 255, 255, 0.7)' : undefined }}>
                                        {failedReports} failed
                                      </Typography>
                                    </MuiCardContent>
                                  </MuiCard>
                                </Box>
                              </MuiCardContent>
                            </MuiCard>
                          </Box>
                        </SortableWidget>
                      )
                    }
                    
                    if (widgetId === 'duration') {
                      return (
                        <SortableWidget key={widgetId} id={widgetId} isDark={isDark}>
                          <Box flex={1} display="flex" flexDirection="column">
                            <MuiCard sx={cardStyles}>
                              <MuiCardHeader
                                title={
                                  <Box display="flex" alignItems="center">
                                    <Typography variant="h6">Duration Comparison</Typography>
                                    {renderFilterButton('duration')}
                                  </Box>
                                }
                              />
                              <MuiCardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                {durations.length === 0 ? (
                                  <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
                                    <Typography variant="body2" sx={{ color: isDark ? 'rgba(255, 255, 255, 0.7)' : undefined }}>
                                      No duration data available for selected reports
                                    </Typography>
                                  </Box>
                                ) : (
                                  <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', ...chartContainerStyles }}>
                                    <LineChart
                                      width={500}
                                      height={300}
                                      series={durations.map((item) => ({
                                        data: [0, item.duration],
                                        label: item.planName.substring(0, 20),
                                        id: item.testId,
                                      }))}
                                      xAxis={[{
                                        data: [0, 1],
                                        label: 'Reports',
                                        labelStyle: { fill: isDark ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.87)' },
                                        tickLabelStyle: { fill: isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.87)' },
                                      }]}
                                      yAxis={[{
                                        label: 'Duration',
                                        valueFormatter: (value: number) => formatDuration(value),
                                        labelStyle: { fill: isDark ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.87)' },
                                        tickLabelStyle: { fill: isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.87)' },
                                      }]}
                                      grid={{ vertical: true, horizontal: true }}
                                      colors={isDark ? ['#60a5fa', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#fb7185'] : undefined}
                                    />
                                  </Box>
                                )}
                              </MuiCardContent>
                            </MuiCard>
                          </Box>
                        </SortableWidget>
                      )
                    }
                    
                    if (widgetId === 'status') {
                      return (
                        <SortableWidget key={widgetId} id={widgetId} isDark={isDark}>
                          <Box flex={1} display="flex" flexDirection="column">
                            <MuiCard sx={cardStyles}>
                              <MuiCardHeader
                                title={
                                  <Box display="flex" alignItems="center">
                                    <Typography variant="h6">Status Comparison</Typography>
                                    {renderFilterButton('status')}
                                  </Box>
                                }
                              />
                              <MuiCardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                {Object.keys(statusCounts).length === 0 ? (
                                  <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
                                    <Typography variant="body2" sx={{ color: isDark ? 'rgba(255, 255, 255, 0.7)' : undefined }}>
                                      No status data available for selected reports
                                    </Typography>
                                  </Box>
                                ) : (
                                  <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', ...chartContainerStyles }}>
                                    <PieChart
                                      width={400}
                                      height={300}
                                      series={[
                                        {
                                          data: Object.entries(statusCounts).map(([status, count]) => ({
                                            id: status,
                                            value: count,
                                            label: statusLabels[status] || status,
                                          })),
                                          innerRadius: 30,
                                          outerRadius: 100,
                                          paddingAngle: 2,
                                          cornerRadius: 5,
                                        },
                                      ]}
                                      colors={Object.keys(statusCounts).map(status => {
                                        const color = statusColors[status] || 'bg-gray-500'
                                        const bgColor = color.replace('bg-', '').replace('-500', '')
                                        return bgColor === 'green' ? '#22c55e' : 
                                               bgColor === 'red' ? '#ef4444' : 
                                               bgColor === 'blue' ? '#3b82f6' : 
                                               bgColor === 'yellow' ? '#eab308' : '#6b7280'
                                      })}
                                    />
                                    <Box mt={2}>
                                      {Object.entries(statusCounts).map(([status, count]) => {
                                        const total = filteredStatusesStatus.length
                                        const percentage = total > 0 ? (count / total) * 100 : 0
                                        
                                        return (
                                          <Box key={status} display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                                            <Box display="flex" alignItems="center" gap={1}>
                                              <Box
                                                sx={{
                                                  width: 12,
                                                  height: 12,
                                                  borderRadius: '50%',
                                                  bgcolor: statusColors[status]?.replace('bg-', '').replace('-500', '') === 'green' ? '#22c55e' : 
                                                           statusColors[status]?.replace('bg-', '').replace('-500', '') === 'red' ? '#ef4444' : 
                                                           statusColors[status]?.replace('bg-', '').replace('-500', '') === 'blue' ? '#3b82f6' : 
                                                           statusColors[status]?.replace('bg-', '').replace('-500', '') === 'yellow' ? '#eab308' : '#6b7280',
                                                }}
                                              />
                                              <Typography variant="body2" fontWeight="medium" sx={{ color: isDark ? 'rgba(255, 255, 255, 0.9)' : undefined }}>
                                                {statusLabels[status] || status}
                                              </Typography>
                                            </Box>
                                            <Typography variant="body2" sx={{ color: isDark ? 'rgba(255, 255, 255, 0.7)' : undefined }}>
                                              {count} ({percentage.toFixed(1)}%)
                                            </Typography>
                                          </Box>
                                        )
                                      })}
                                    </Box>
                                  </Box>
                                )}
                              </MuiCardContent>
                            </MuiCard>
                          </Box>
                        </SortableWidget>
                      )
                    }
                    
                    if (widgetId === 'successRate') {
                      return (
                        <SortableWidget key={widgetId} id={widgetId} isDark={isDark}>
                          <Box flex={1} display="flex" flexDirection="column">
                            <MuiCard sx={cardStyles}>
                              <MuiCardHeader
                                title={
                                  <Box display="flex" alignItems="center">
                                    <Typography variant="h6">Success Rate Over Time</Typography>
                                    {renderFilterButton('successRate')}
                                  </Box>
                                }
                              />
                              <MuiCardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                {successRateByDay.length === 0 ? (
                                  <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
                                    <Typography variant="body2" sx={{ color: isDark ? 'rgba(255, 255, 255, 0.7)' : undefined }}>
                                      No data available
                                    </Typography>
                                  </Box>
                                ) : (
                                  <Box sx={chartContainerStyles}>
                                    <LineChart
                                      width={500}
                                      height={300}
                                      series={[{
                                        data: successRateByDay.map(d => d.rate),
                                        label: 'Success Rate (%)',
                                        color: '#22c55e',
                                      }]}
                                      xAxis={[{
                                        data: successRateByDay.map(d => new Date(d.date).toLocaleDateString()),
                                        scaleType: 'point',
                                        label: 'Date',
                                        labelStyle: { fill: isDark ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.87)' },
                                        tickLabelStyle: { fill: isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.87)' },
                                      }]}
                                      yAxis={[{
                                        label: 'Success Rate (%)',
                                        min: 0,
                                        max: 100,
                                        labelStyle: { fill: isDark ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.87)' },
                                        tickLabelStyle: { fill: isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.87)' },
                                      }]}
                                      grid={{ vertical: true, horizontal: true }}
                                    />
                                  </Box>
                                )}
                              </MuiCardContent>
                            </MuiCard>
                          </Box>
                        </SortableWidget>
                      )
                    }
                    
                    if (widgetId === 'avgDuration') {
                      return (
                        <SortableWidget key={widgetId} id={widgetId} isDark={isDark}>
                          <Box flex={1} display="flex" flexDirection="column">
                            <MuiCard sx={cardStyles}>
                              <MuiCardHeader
                                title={
                                  <Box display="flex" alignItems="center">
                                    <Typography variant="h6">Average Duration by Plan</Typography>
                                    {renderFilterButton('avgDuration')}
                                  </Box>
                                }
                              />
                              <MuiCardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                {avgDurationByPlan.length === 0 ? (
                                  <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
                                    <Typography variant="body2" sx={{ color: isDark ? 'rgba(255, 255, 255, 0.7)' : undefined }}>
                                      No duration data available
                                    </Typography>
                                  </Box>
                                ) : (
                                  <Box sx={chartContainerStyles}>
                                    <BarChart
                                      width={500}
                                      height={300}
                                      series={[{
                                        data: avgDurationByPlan.map(d => d.avgDuration),
                                        label: 'Avg Duration',
                                        color: '#3b82f6',
                                      }]}
                                      yAxis={[{
                                        data: avgDurationByPlan.map(d => d.planName.substring(0, 20)),
                                        scaleType: 'band',
                                        label: 'Plan',
                                        labelStyle: { fill: isDark ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.87)' },
                                        tickLabelStyle: { fill: isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.87)' },
                                      }]}
                                      xAxis={[{
                                        label: 'Duration',
                                        valueFormatter: (value: number) => formatDuration(value),
                                        labelStyle: { fill: isDark ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.87)' },
                                        tickLabelStyle: { fill: isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.87)' },
                                      }]}
                                      layout="horizontal"
                                    />
                                  </Box>
                                )}
                              </MuiCardContent>
                            </MuiCard>
                          </Box>
                        </SortableWidget>
                      )
                    }
                    
                    if (widgetId === 'executionStats') {
                      return (
                        <SortableWidget key={widgetId} id={widgetId} isDark={isDark}>
                          <Box flex={1} display="flex" flexDirection="column">
                            <MuiCard sx={cardStyles}>
                              <MuiCardHeader
                                title={
                                  <Box display="flex" alignItems="center">
                                    <Typography variant="h6">Execution Statistics</Typography>
                                    {renderFilterButton('executionStats')}
                                  </Box>
                                }
                              />
                              <MuiCardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                <Box display="grid" gridTemplateColumns="1fr 1fr" gap={2}>
                                  <Box>
                                    <Typography variant="body2" sx={{ color: isDark ? 'rgba(255, 255, 255, 0.7)' : undefined }} gutterBottom>
                                      Total Executions
                                    </Typography>
                                    <Typography variant="h6" sx={{ color: isDark ? 'rgba(255, 255, 255, 0.9)' : undefined }}>{executionStats.total}</Typography>
                                  </Box>
                                  <Box>
                                    <Typography variant="body2" sx={{ color: isDark ? 'rgba(255, 255, 255, 0.7)' : undefined }} gutterBottom>
                                      Average Duration
                                    </Typography>
                                    <Typography variant="h6" sx={{ color: isDark ? 'rgba(255, 255, 255, 0.9)' : undefined }}>{formatDuration(executionStats.avg)}</Typography>
                                  </Box>
                                  <Box>
                                    <Typography variant="body2" sx={{ color: isDark ? 'rgba(255, 255, 255, 0.7)' : undefined }} gutterBottom>
                                      Median Duration
                                    </Typography>
                                    <Typography variant="h6" sx={{ color: isDark ? 'rgba(255, 255, 255, 0.9)' : undefined }}>{formatDuration(executionStats.median)}</Typography>
                                  </Box>
                                  <Box>
                                    <Typography variant="body2" sx={{ color: isDark ? 'rgba(255, 255, 255, 0.7)' : undefined }} gutterBottom>
                                      Fastest Execution
                                    </Typography>
                                    <Typography variant="h6" sx={{ color: isDark ? 'rgba(255, 255, 255, 0.9)' : undefined }}>{formatDuration(executionStats.min)}</Typography>
                                  </Box>
                                  <Box>
                                    <Typography variant="body2" sx={{ color: isDark ? 'rgba(255, 255, 255, 0.7)' : undefined }} gutterBottom>
                                      Slowest Execution
                                    </Typography>
                                    <Typography variant="h6" sx={{ color: isDark ? 'rgba(255, 255, 255, 0.9)' : undefined }}>{formatDuration(executionStats.max)}</Typography>
                                  </Box>
                                  <Box>
                                    <Typography variant="body2" sx={{ color: isDark ? 'rgba(255, 255, 255, 0.7)' : undefined }} gutterBottom>
                                      Total Execution Time
                                    </Typography>
                                    <Typography variant="h6" sx={{ color: isDark ? 'rgba(255, 255, 255, 0.9)' : undefined }}>{formatDuration(executionStats.totalTime)}</Typography>
                                  </Box>
                                </Box>
                              </MuiCardContent>
                            </MuiCard>
                          </Box>
                        </SortableWidget>
                      )
                    }
                    
                    return null
                  })}
                </Box>
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>
      
      <Dialog open={isGlobalFiltersOpen} onOpenChange={setIsGlobalFiltersOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Filters</DialogTitle>
            <DialogDescription>
              Select reports and scenarios to include in all analytics widgets
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div>
              <h4 className="text-sm font-semibold mb-2">Reports</h4>
              <div className="space-y-2 max-h-[30vh] overflow-y-auto border rounded-md p-3">
                <div className="flex items-center space-x-2 pb-2 border-b">
                  <input
                    type="checkbox"
                    id="global-select-all-reports"
                    checked={statuses.length > 0 && globalSelectedReports.size === statuses.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        selectAllGlobalReports()
                      } else {
                        deselectAllGlobalReports()
                      }
                    }}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <label
                    htmlFor="global-select-all-reports"
                    className="text-sm font-semibold flex-1 cursor-pointer"
                  >
                    Select All
                  </label>
                </div>
                {statuses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No reports available</p>
                ) : (
                  statuses.map((status) => (
                    <div key={status.testId} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={`global-${status.testId}`}
                        checked={globalSelectedReports.has(status.testId)}
                        onChange={() => toggleGlobalReport(status.testId)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <label
                        htmlFor={`global-${status.testId}`}
                        className="text-sm flex-1 cursor-pointer"
                      >
                        {status.planName || status.scenario.substring(0, 50) || 'Unnamed Plan'}
                      </label>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-2">Scenarios</h4>
              <div className="space-y-2 max-h-[30vh] overflow-y-auto border rounded-md p-3">
                <div className="flex items-center space-x-2 pb-2 border-b">
                  <input
                    type="checkbox"
                    id="global-select-all-scenarios"
                    checked={uniqueScenarios.length > 0 && globalSelectedScenarios.size === uniqueScenarios.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        selectAllGlobalScenarios()
                      } else {
                        deselectAllGlobalScenarios()
                      }
                    }}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <label
                    htmlFor="global-select-all-scenarios"
                    className="text-sm font-semibold flex-1 cursor-pointer"
                  >
                    Select All
                  </label>
                </div>
                {uniqueScenarios.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No scenarios available</p>
                ) : (
                  uniqueScenarios.map((scenario) => (
                    <div key={scenario} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={`global-scenario-${scenario}`}
                        checked={globalSelectedScenarios.has(scenario)}
                        onChange={() => toggleGlobalScenario(scenario)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <label
                        htmlFor={`global-scenario-${scenario}`}
                        className="text-sm flex-1 cursor-pointer"
                      >
                        {scenario}
                      </label>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {openWidgetFilter && (
        <Dialog open={!!openWidgetFilter} onOpenChange={(open) => !open && setOpenWidgetFilter(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Filters</DialogTitle>
              <DialogDescription>
                Select reports and scenarios to include in this widget's analytics
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div>
                <h4 className="text-sm font-semibold mb-2">Reports</h4>
                <div className="space-y-2 max-h-[30vh] overflow-y-auto border rounded-md p-3">
                  {(() => {
                    const selectedReports = getSelectedReports(openWidgetFilter)
                    const allSelected = statuses.length > 0 && selectedReports.size === statuses.length
                    return (
                      <div className="flex items-center space-x-2 pb-2 border-b">
                        <input
                          type="checkbox"
                          id={`${openWidgetFilter}-select-all-reports`}
                          checked={allSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              selectAllReports(openWidgetFilter)
                            } else {
                              deselectAllReports(openWidgetFilter)
                            }
                          }}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        <label
                          htmlFor={`${openWidgetFilter}-select-all-reports`}
                          className="text-sm font-semibold flex-1 cursor-pointer"
                        >
                          Select All
                        </label>
                      </div>
                    )
                  })()}
                  {statuses.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No reports available</p>
                  ) : (
                    statuses.map((status) => {
                      const selectedReports = getSelectedReports(openWidgetFilter)
                      return (
                        <div key={status.testId} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id={`${openWidgetFilter}-${status.testId}`}
                            checked={selectedReports.has(status.testId)}
                            onChange={() => toggleReport(status.testId, openWidgetFilter)}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                          <label
                            htmlFor={`${openWidgetFilter}-${status.testId}`}
                            className="text-sm flex-1 cursor-pointer"
                          >
                            {status.planName || status.scenario.substring(0, 50) || 'Unnamed Plan'}
                          </label>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
              <div>
                <h4 className="text-sm font-semibold mb-2">Scenarios</h4>
                <div className="space-y-2 max-h-[30vh] overflow-y-auto border rounded-md p-3">
                  {(() => {
                    const selectedScenarios = getSelectedScenarios(openWidgetFilter)
                    const allScenariosSelected = uniqueScenarios.length > 0 && selectedScenarios.size === uniqueScenarios.length
                    return (
                      <div className="flex items-center space-x-2 pb-2 border-b">
                        <input
                          type="checkbox"
                          id={`${openWidgetFilter}-select-all-scenarios`}
                          checked={allScenariosSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              selectAllScenarios(openWidgetFilter)
                            } else {
                              deselectAllScenarios(openWidgetFilter)
                            }
                          }}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        <label
                          htmlFor={`${openWidgetFilter}-select-all-scenarios`}
                          className="text-sm font-semibold flex-1 cursor-pointer"
                        >
                          Select All
                        </label>
                      </div>
                    )
                  })()}
                  {uniqueScenarios.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No scenarios available</p>
                  ) : (
                    uniqueScenarios.map((scenario) => {
                      const selectedScenarios = getSelectedScenarios(openWidgetFilter)
                      return (
                        <div key={scenario} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id={`${openWidgetFilter}-scenario-${scenario}`}
                            checked={selectedScenarios.has(scenario)}
                            onChange={() => toggleScenario(scenario, openWidgetFilter)}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                          <label
                            htmlFor={`${openWidgetFilter}-scenario-${scenario}`}
                            className="text-sm flex-1 cursor-pointer"
                          >
                            {scenario}
                          </label>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

