import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '../agent/FormField'
import { uiNotificationService } from '@/services/uiNotificationService'
import { apiClient } from '@/services/apiClient'

// Validation schema
const planFormSchema = z.object({
  scenario: z.string().min(1, 'Scenario description is required'),
})

export type PlanFormData = z.infer<typeof planFormSchema>

export interface PlanFormProps {
  onSubmit: (data: { planId: string; scenarioId: string; name: string; steps: unknown[]; alreadyExists?: boolean }) => void | Promise<void>
  onCancel: () => void
  isLoading?: boolean
  disabled?: boolean
}

export const PlanForm = ({
  onSubmit,
  onCancel,
  isLoading = false,
  disabled = false,
}: PlanFormProps) => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<PlanFormData>({
    resolver: zodResolver(planFormSchema),
    defaultValues: {
      scenario: '',
    },
  })

  const onSubmitForm = async (data: PlanFormData) => {
    try {
      uiNotificationService.send('plan:creation:start', {
        title: 'Creating Plan',
        message: 'Generating execution plan...',
        variant: 'info',
      })

      const result = await apiClient.createPlan(data.scenario)

      // Don't show notification here - let parent handle it based on alreadyExists
      // Call parent onSubmit callback
      await onSubmit({
        planId: result.planId,
        scenarioId: result.scenarioId,
        name: result.name,
        steps: result.steps,
        alreadyExists: result.alreadyExists,
      })
      
      // Reset form
      reset()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create plan'
      uiNotificationService.send('plan:creation:error', {
        title: 'Plan Creation Failed',
        message,
        variant: 'error',
      })
    }
  }

  const handleCancel = () => {
    reset()
    onCancel()
  }

  const isFormLoading = isLoading || isSubmitting

  return (
    <form
      onSubmit={handleSubmit(onSubmitForm)}
      className="space-y-4"
      noValidate
    >
          <FormField
            label="Scenario"
            error={errors.scenario?.message}
            description="Describe the scenario you want to create a plan for (e.g., 'Navigate to example.com and verify the heading')"
            htmlFor="scenario"
          >
            <Textarea
              {...register('scenario')}
              placeholder="Enter scenario description..."
              disabled={disabled || isFormLoading}
              rows={4}
              aria-label="Scenario description"
            />
          </FormField>

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button
              type="submit"
              disabled={disabled || isFormLoading}
              className="flex-1"
              aria-label="Create plan"
            >
              {isFormLoading ? 'Creating...' : 'Create Plan'}
            </Button>
            <Button
              type="button"
              onClick={handleCancel}
              disabled={disabled || isFormLoading}
              variant="outline"
              className="flex-1"
              aria-label="Cancel form"
            >
              Cancel
            </Button>
          </div>
        </form>
  )
}

