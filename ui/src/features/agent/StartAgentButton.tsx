import { Button } from '@/components/ui/button'
import { Play, Loader2 } from 'lucide-react'
import { uiNotificationService } from '@/services/uiNotificationService'

export interface StartAgentButtonProps {
  onStart: () => void | Promise<void>
  isLoading?: boolean
  disabled?: boolean
  variant?: 'default' | 'outline' | 'ghost' | 'secondary'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  className?: string
}

export const StartAgentButton = ({
  onStart,
  isLoading = false,
  disabled = false,
  variant = 'default',
  size = 'default',
  className,
}: StartAgentButtonProps) => {
  const handleClick = async () => {
    if (isLoading || disabled) return

    try {
      await onStart()
      uiNotificationService.info('Scenario agent flow started', 'Scenario Agent')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start agent'
      uiNotificationService.error(message, 'Agent Start Failed')
    }
  }

  return (
    <Button
      onClick={handleClick}
      disabled={disabled || isLoading}
      variant={variant}
      size={size}
      className={className}
    >
      {isLoading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Running...
        </>
      ) : (
        <>
          <Play className="h-4 w-4" />
          Run Flow
        </>
      )}
    </Button>
  )
}


