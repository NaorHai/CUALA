import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
  Checkbox as MuiCheckbox,
  FormControlLabel,
  Popover,
  Box,
  IconButton,
  Button as MuiButton
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
  const [selectedReportsDuration, setSelectedReportsDuration] = useState<Set<string>>(new Set())
  const [selectedReportsStatus, setSelectedReportsStatus] = useState<Set<string>>(new Set())
  const [selectedReportsKpi, setSelectedReportsKpi] = useState<Set<string>>(new Set())
  const [selectedReportsSuccessRate, setSelectedReportsSuccessRate] = useState<Set<string>>(new Set())
  const [selectedReportsAvgDuration, setSelectedReportsAvgDuration] = useState<Set<string>>(new Set())
  const [selectedReportsExecutionStats, setSelectedReportsExecutionStats] = useState<Set<string>>(new Set())
  const [openFilter, setOpenFilter] = useState<'kpi' | 'duration' | 'status' | 'successRate' | 'avgDuration' | 'executionStats' | null>(null)
  const [filterAnchorEl, setFilterAnchorEl] = useState<{ [key: string]: HTMLButtonElement | null }>({})
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

  useEffect(() => {
    // Select all reports by default for all widgets
    if (statuses.length > 0) {
      if (selectedReportsDuration.size === 0) {
        setSelectedReportsDuration(new Set(statuses.map(s => s.testId)))
      }
      if (selectedReportsStatus.size === 0) {
        setSelectedReportsStatus(new Set(statuses.map(s => s.testId)))
      }
      if (selectedReportsKpi.size === 0) {
        setSelectedReportsKpi(new Set(statuses.map(s => s.testId)))
      }
      if (selectedReportsSuccessRate.size === 0) {
        setSelectedReportsSuccessRate(new Set(statuses.map(s => s.testId)))
      }
      if (selectedReportsAvgDuration.size === 0) {
        setSelectedReportsAvgDuration(new Set(statuses.map(s => s.testId)))
      }
      if (selectedReportsExecutionStats.size === 0) {
        setSelectedReportsExecutionStats(new Set(statuses.map(s => s.testId)))
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statuses])


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

  const filteredStatusesDuration = statuses.filter(s => selectedReportsDuration.has(s.testId))
  const filteredStatusesStatus = statuses.filter(s => selectedReportsStatus.has(s.testId))
  const filteredStatusesKpi = statuses.filter(s => selectedReportsKpi.has(s.testId))
  const filteredStatusesSuccessRate = statuses.filter(s => selectedReportsSuccessRate.has(s.testId))
  const filteredStatusesAvgDuration = statuses.filter(s => selectedReportsAvgDuration.has(s.testId))
  const filteredStatusesExecutionStats = statuses.filter(s => selectedReportsExecutionStats.has(s.testId))

  // Helper function to render filter popover
  const renderFilterPopover = (widgetId: string) => {
    const selectedReports = getSelectedReports(widgetId)
    const anchorEl = filterAnchorEl[widgetId]
    const isOpen = openFilter === widgetId

    return (
      <>
        <IconButton
          onClick={(e) => {
            if (isOpen) {
              setOpenFilter(null)
              setFilterAnchorEl(prev => ({ ...prev, [widgetId]: null }))
            } else {
              setOpenFilter(widgetId as 'kpi' | 'duration' | 'status' | 'successRate' | 'avgDuration' | 'executionStats')
              setFilterAnchorEl(prev => ({ ...prev, [widgetId]: e.currentTarget }))
            }
          }}
          size="small"
          title="Filter reports"
          sx={{ ml: 1 }}
        >
          <Filter className="h-4 w-4" />
        </IconButton>
        <Popover
          open={isOpen}
          anchorEl={anchorEl}
          onClose={() => {
            setOpenFilter(null)
            setFilterAnchorEl(prev => ({ ...prev, [widgetId]: null }))
          }}
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'right',
          }}
          transformOrigin={{
            vertical: 'top',
            horizontal: 'right',
          }}
          PaperProps={{
            sx: {
              backgroundColor: isDark ? 'hsl(222.2, 84%, 4.9%)' : '#ffffff',
              color: isDark ? 'hsl(210, 40%, 98%)' : 'hsl(222.2, 84%, 4.9%)',
              border: isDark ? '1px solid hsl(217.2, 32.6%, 17.5%)' : '1px solid hsl(214.3, 31.8%, 91.4%)',
            },
          }}
        >
          <Box 
            sx={{ 
              p: 2, 
              minWidth: 256, 
              maxHeight: 400, 
              overflow: 'auto',
              msOverflowStyle: 'none',
              scrollbarWidth: 'none',
              '&::-webkit-scrollbar': {
                display: 'none',
              },
            }} 
            className="scrollbar-hide"
          >
            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold', color: isDark ? 'rgba(255, 255, 255, 0.9)' : undefined }}>
              Filter Reports:
            </Typography>
            <Box display="flex" gap={1} mb={2}>
              <MuiButton
                onClick={() => selectAllReports(widgetId)}
                variant="outlined"
                size="small"
                sx={{ flex: 1, fontSize: '0.75rem' }}
              >
                Select All
              </MuiButton>
              <MuiButton
                onClick={() => deselectAllReports(widgetId)}
                variant="outlined"
                size="small"
                sx={{ flex: 1, fontSize: '0.75rem' }}
              >
                Deselect All
              </MuiButton>
            </Box>
            <Box>
              {statuses.map((status) => (
                <FormControlLabel
                  key={status.testId}
                  control={
                    <MuiCheckbox
                      checked={selectedReports.has(status.testId)}
                      onChange={() => toggleReport(status.testId, widgetId)}
                      size="small"
                    />
                  }
                  label={
                    <Typography variant="body2" sx={{ color: isDark ? 'rgba(255, 255, 255, 0.9)' : undefined }}>
                      {status.planName || status.scenario.substring(0, 40) || 'Unnamed Plan'}
                    </Typography>
                  }
                />
              ))}
            </Box>
          </Box>
        </Popover>
      </>
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
              <Button onClick={loadReports} variant="outline" size="sm">
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
                                    {renderFilterPopover('kpi')}
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
                                      <Typography variant="body2" sx={{ color: isDark ? 'rgba(255, 255, 255, 0.7)' : undefined }} gutterBottom>
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
                                    {renderFilterPopover('duration')}
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
                                    {renderFilterPopover('status')}
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
                                    {renderFilterPopover('successRate')}
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
                                    {renderFilterPopover('avgDuration')}
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
                                    {renderFilterPopover('executionStats')}
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
    </div>
  )
}

