import { Link, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { FileText, BarChart3, Home, Moon, Sun, LayoutDashboard, Settings, Loader2, MousePointer2, Keyboard, Move, CheckCircle2, RotateCcw, Save } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiClient, ConfidenceThreshold } from '@/services/apiClient'
import { uiNotificationService } from '@/services/uiNotificationService'

export const Sidebar = () => {
  const { theme, toggleTheme } = useTheme()
  const location = useLocation()
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [thresholds, setThresholds] = useState<ConfidenceThreshold[]>([])
  const [loadingThresholds, setLoadingThresholds] = useState(false)
  const [savingThresholds, setSavingThresholds] = useState(false)
  const [thresholdValues, setThresholdValues] = useState<Record<string, number>>({})
  const [originalThresholdValues, setOriginalThresholdValues] = useState<Record<string, number>>({})
  
  const actionTypeInfo: Record<string, { icon: typeof MousePointer2; description: string }> = {
    click: { icon: MousePointer2, description: 'Minimum confidence for clicking elements' },
    type: { icon: Keyboard, description: 'Minimum confidence for typing into input fields' },
    hover: { icon: Move, description: 'Minimum confidence for hovering over elements' },
    verify: { icon: CheckCircle2, description: 'Minimum confidence for verifying element presence' },
    default: { icon: Settings, description: 'Default threshold used when action type is not specified' },
  }
  
  const getConfidenceLevel = (value: number): { label: string; color: string } => {
    if (value < 0.3) return { label: 'Low', color: 'text-red-500' }
    if (value < 0.7) return { label: 'Medium', color: 'text-yellow-500' }
    return { label: 'High', color: 'text-green-500' }
  }
  
  const hasChanges = () => {
    return Object.keys(thresholdValues).some(
      (key) => thresholdValues[key] !== originalThresholdValues[key]
    )
  }
  
  // Load confidence thresholds when settings modal opens
  useEffect(() => {
    if (isSettingsOpen) {
      loadConfidenceThresholds()
    }
  }, [isSettingsOpen])

  const loadConfidenceThresholds = async () => {
    try {
      setLoadingThresholds(true)
      const response = await apiClient.getConfidenceThresholds()
      setThresholds(response.thresholds)
      // Initialize threshold values
      const values: Record<string, number> = {}
      response.thresholds.forEach((t) => {
        values[t.actionType] = t.threshold
      })
      setThresholdValues(values)
      setOriginalThresholdValues({ ...values })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load confidence thresholds'
      uiNotificationService.send('settings:load:error', {
        title: 'Failed to Load Settings',
        message,
        variant: 'error',
      })
    } finally {
      setLoadingThresholds(false)
    }
  }
  
  const resetToDefaults = () => {
    setThresholdValues({ ...originalThresholdValues })
  }

  const handleThresholdChange = (actionType: string, value: string) => {
    const numValue = parseFloat(value)
    if (!isNaN(numValue) && numValue >= 0 && numValue <= 1) {
      setThresholdValues((prev) => ({
        ...prev,
        [actionType]: numValue,
      }))
    }
  }

  const handleSaveThresholds = async () => {
    try {
      setSavingThresholds(true)
      const updates = thresholds.map((threshold) => {
        const newValue = thresholdValues[threshold.actionType]
        if (newValue !== undefined && newValue !== threshold.threshold) {
          return apiClient.updateConfidenceThreshold(threshold.actionType, newValue)
        }
        return Promise.resolve(null)
      })

      await Promise.all(updates.filter((p) => p !== null))

      uiNotificationService.send('settings:save:success', {
        title: 'Settings Saved',
        message: 'Confidence thresholds have been updated successfully',
        variant: 'success',
      })

      // Reload thresholds to get updated values
      await loadConfidenceThresholds()
      setOriginalThresholdValues({ ...thresholdValues })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save confidence thresholds'
      uiNotificationService.send('settings:save:error', {
        title: 'Failed to Save Settings',
        message,
        variant: 'error',
      })
    } finally {
      setSavingThresholds(false)
    }
  }

  const menuItems = [
    {
      path: '/',
      label: 'Home',
      icon: Home,
    },
    {
      path: '/plans',
      label: 'Plans',
      icon: FileText,
    },
    {
      path: '/reports',
      label: 'Reports',
      icon: BarChart3,
    },
    {
      path: '/analytics',
      label: 'Analytics',
      icon: LayoutDashboard,
    },
  ]

  return (
    <aside className="w-64 bg-card border-r border-border h-screen fixed left-0 top-0 overflow-y-auto flex flex-col z-50">
      <div className="p-4 flex-1">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <img 
              src={theme === 'dark' ? '/images/cualal_logo_dark.png' : '/images/cuala_icon.png'}
              alt="CUALA Logo" 
              className={`h-12 w-12 object-contain rounded-full ${theme === 'dark' ? 'bg-black' : 'bg-white'}`}
            />
            <h1 className="text-2xl font-bold">CUALA</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Computer-Using Automation Layer Agent
          </p>
        </div>
        
        <nav className="space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon
            // Check if pathname matches exactly or starts with the item path (for routes like /reports/:testId)
            const isActive = location.pathname === item.path || 
              (item.path !== '/' && location.pathname.startsWith(item.path + '/'))
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>
      </div>
      
      <div className="p-4 border-t border-border space-y-1">
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <Settings className="h-5 w-5" />
          <span>Settings</span>
        </button>
        <div className="border-t border-border my-1" />
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? (
            <Moon className="h-5 w-5" />
          ) : (
            <Sun className="h-5 w-5" />
          )}
          <span>{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>
        </button>
      </div>

      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col p-0 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>
              Configure your application settings
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 pb-4 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            <div className="space-y-6 py-4">
              <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h4 className="text-sm font-semibold">Confidence Thresholds</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Configure the minimum confidence level (0.0 - 1.0) required for element discovery. Higher values require more certainty before accepting a found element.
                  </p>
                </div>
                {loadingThresholds && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-2" />
                )}
              </div>

              {loadingThresholds ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
                  <span className="text-sm text-muted-foreground">Loading thresholds...</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {thresholds.map((threshold) => {
                    const currentValue = thresholdValues[threshold.actionType] ?? threshold.threshold
                    const originalValue = originalThresholdValues[threshold.actionType] ?? threshold.threshold
                    const hasChanged = currentValue !== originalValue
                    const info = actionTypeInfo[threshold.actionType]
                    const Icon = info?.icon || Settings
                    const confidenceLevel = getConfidenceLevel(currentValue)
                    
                    return (
                      <div
                        key={threshold.actionType}
                        className={cn(
                          "p-4 rounded-lg border transition-all",
                          hasChanged ? "border-primary bg-primary/5" : "border-border bg-card"
                        )}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2 flex-1">
                            <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <label
                                htmlFor={`threshold-${threshold.actionType}`}
                                className="text-sm font-semibold capitalize block"
                              >
                                {threshold.actionType === 'default' ? 'Default' : threshold.actionType}
                              </label>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {info?.description}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-2">
                            <span className={cn("text-xs font-medium", confidenceLevel.color)}>
                              {confidenceLevel.label}
                            </span>
                            <span className="text-sm font-mono font-semibold min-w-[3rem] text-right">
                              {currentValue.toFixed(2)}
                            </span>
                            {hasChanged && (
                              <span className="text-xs text-primary font-medium">*</span>
                            )}
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex items-center gap-3">
                            <Input
                              id={`threshold-${threshold.actionType}`}
                              type="number"
                              min="0"
                              max="1"
                              step="0.01"
                              value={currentValue}
                              onChange={(e) => handleThresholdChange(threshold.actionType, e.target.value)}
                              className="w-24 h-9"
                            />
                            <div className="flex-1 relative">
                              <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={currentValue}
                                onChange={(e) => handleThresholdChange(threshold.actionType, e.target.value)}
                                className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer"
                                style={{
                                  background: `linear-gradient(to right, hsl(var(--primary)) 0%, hsl(var(--primary)) ${(currentValue * 100)}%, hsl(var(--muted)) ${(currentValue * 100)}%, hsl(var(--muted)) 100%)`
                                }}
                              />
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                            <span>0.0 (Low)</span>
                            <span>0.5 (Medium)</span>
                            <span>1.0 (High)</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  
                  <div className="space-y-2 border-t pt-4">
                    <h4 className="text-sm font-semibold">Theme</h4>
                    <p className="text-sm text-muted-foreground">
                      Current theme: {theme === 'light' ? 'Light' : 'Dark'}
                    </p>
                    <button
                      onClick={toggleTheme}
                      className="w-full flex items-center justify-between px-4 py-2 border rounded-md hover:bg-accent transition-colors"
                    >
                      <span className="text-sm">Switch to {theme === 'light' ? 'Dark' : 'Light'} Mode</span>
                      {theme === 'light' ? (
                        <Moon className="h-4 w-4" />
                      ) : (
                        <Sun className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              )}
              </div>
            </div>
          </div>
          <div className="border-t bg-background px-6 py-4 space-y-2 bottom-0">
            <div className="flex gap-2">
              <Button
                onClick={resetToDefaults}
                disabled={!hasChanges() || savingThresholds}
                variant="outline"
                className="flex-1"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
              <Button
                onClick={handleSaveThresholds}
                disabled={!hasChanges() || savingThresholds}
                className="flex-1"
              >
                {savingThresholds ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
            {hasChanges() && (
              <p className="text-xs text-muted-foreground text-center">
                * You have unsaved changes
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </aside>
  )
}

