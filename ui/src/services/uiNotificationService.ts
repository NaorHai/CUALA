/**
 * UI Notification Service (Client-Side Only)
 * 
 * Provides a unified interface for sending events and displaying notifications.
 * 
 * Constraints:
 * - Client-side only (no server-side code)
 * - No backend implementation (all notifications are client-side)
 * - Logs events to console
 * - Shows toast notifications using shadcn/ui
 * 
 * Current implementation:
 * - Logs events to console
 * - Shows toast notifications using shadcn/ui
 * 
 * Future implementations can replace the send() method to use:
 * - WebSocket connections (client-side)
 * - Server-Sent Events (SSE) (client-side)
 * - Push notifications (client-side)
 * - Other real-time communication methods (client-side)
 * 
 * NOTE: This service is designed for client-side use only.
 * All event handling happens in the browser.
 */

import { toast } from '@/components/ui/use-toast'

export type NotificationType = 'success' | 'error' | 'info' | 'warning' | 'default'

export interface NotificationPayload {
  title?: string
  message?: string
  description?: string
  variant?: NotificationType
  duration?: number
  [key: string]: unknown
}

/**
 * Event handler interface for future WebSocket/SSE implementations
 */
export interface EventHandler {
  (event: string, payload: unknown): void | Promise<void>
}

class UINotificationService {
  private eventHandlers: Set<EventHandler> = new Set()
  private eventHistory: Array<{ event: string; payload: unknown; timestamp: number }> = []

  /**
   * Register an event handler for future WebSocket/SSE integration
   * @param handler Function to handle events
   * @returns Unsubscribe function
   */
  onEvent(handler: EventHandler): () => void {
    this.eventHandlers.add(handler)
    return () => {
      this.eventHandlers.delete(handler)
    }
  }

  /**
   * Send an event with payload
   * 
   * Current implementation:
   * - Logs to console
   * - Shows toast notification
   * 
   * Future: Can be replaced to send via WebSocket/SSE/push
   * 
   * @param event Event name/type
   * @param payload Event payload (will be normalized to NotificationPayload)
   */
  send(event: string, payload: unknown): void {
    // Normalize payload to NotificationPayload
    const normalizedPayload = this.normalizePayload(payload)
    
    // Log to console
    console.log(`[UI Notification Service] Event: ${event}`, {
      event,
      payload: normalizedPayload,
      timestamp: new Date().toISOString(),
    })

    // Store in event history (useful for debugging)
    this.eventHistory.push({
      event,
      payload: normalizedPayload,
      timestamp: Date.now(),
    })

    // Keep only last 100 events in history
    if (this.eventHistory.length > 100) {
      this.eventHistory.shift()
    }

    // Show toast notification
    this.showToast(event, normalizedPayload)

    // Call registered event handlers (for future WebSocket/SSE integration)
    this.eventHandlers.forEach((handler) => {
      try {
        handler(event, normalizedPayload)
      } catch (error) {
        console.error('[UI Notification Service] Error in event handler:', error)
      }
    })
  }

  /**
   * Normalize payload to NotificationPayload format
   */
  private normalizePayload(payload: unknown): NotificationPayload {
    if (typeof payload === 'string') {
      return {
        message: payload,
        title: 'Notification',
      }
    }

    if (typeof payload === 'object' && payload !== null) {
      const p = payload as Record<string, unknown>
      return {
        title: (p.title as string) || (p.message as string) || 'Notification',
        message: (p.message as string) || (p.description as string),
        description: (p.description as string),
        variant: (p.variant as NotificationType) || (p.type as NotificationType) || 'default',
        duration: (p.duration as number) || undefined,
        ...p,
      }
    }

    return {
      title: 'Notification',
      message: String(payload),
    }
  }

  /**
   * Show toast notification using shadcn/ui
   */
  private showToast(event: string, payload: NotificationPayload): void {
    const variant = this.mapVariantToToast(payload.variant || 'default')
    const title = payload.title || event
    const description = payload.description || payload.message

    toast({
      title,
      description,
      variant,
      duration: payload.duration,
    })
  }

  /**
   * Map NotificationType to toast variant
   */
  private mapVariantToToast(variant: NotificationType): 'default' | 'destructive' | 'success' | 'warning' | 'info' {
    switch (variant) {
      case 'error':
        return 'destructive'
      case 'success':
        return 'success'
      case 'warning':
        return 'warning'
      case 'info':
        return 'info'
      default:
        return 'default'
    }
  }

  /**
   * Get event history (useful for debugging)
   */
  getEventHistory(): ReadonlyArray<{ event: string; payload: unknown; timestamp: number }> {
    return [...this.eventHistory]
  }

  /**
   * Clear event history
   */
  clearEventHistory(): void {
    this.eventHistory = []
  }

  // Legacy methods for backward compatibility
  // These can be removed if not needed, or kept for convenience

  /**
   * Show a success notification
   * @deprecated Use send() instead for consistency
   */
  success(message: string, title?: string, duration?: number): void {
    this.send('notification:success', {
      title: title || 'Success',
      message,
      variant: 'success',
      duration,
    })
  }

  /**
   * Show an error notification
   * @deprecated Use send() instead for consistency
   */
  error(message: string, title?: string, duration?: number): void {
    this.send('notification:error', {
      title: title || 'Error',
      message,
      variant: 'error',
      duration,
    })
  }

  /**
   * Show an info notification
   * @deprecated Use send() instead for consistency
   */
  info(message: string, title?: string, duration?: number): void {
    this.send('notification:info', {
      title: title || 'Info',
      message,
      variant: 'info',
      duration,
    })
  }

  /**
   * Show a warning notification
   * @deprecated Use send() instead for consistency
   */
  warning(message: string, title?: string, duration?: number): void {
    this.send('notification:warning', {
      title: title || 'Warning',
      message,
      variant: 'warning',
      duration,
    })
  }
}

// Export singleton instance
export const uiNotificationService = new UINotificationService()

/**
 * Example usage for future WebSocket/SSE implementation:
 * 
 * ```typescript
 * // In a WebSocket service
 * const ws = new WebSocket('ws://example.com')
 * 
 * ws.onmessage = (event) => {
 *   const data = JSON.parse(event.data)
 *   uiNotificationService.send(data.type, data.payload)
 * }
 * 
 * // Or for SSE
 * const eventSource = new EventSource('/events')
 * eventSource.onmessage = (event) => {
 *   const data = JSON.parse(event.data)
 *   uiNotificationService.send(data.type, data.payload)
 * }
 * ```
 */
