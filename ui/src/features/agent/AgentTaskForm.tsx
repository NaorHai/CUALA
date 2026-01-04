import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from './FormField'
import { uiNotificationService } from '@/services/uiNotificationService'

// Validation schema
const taskFormSchema = z.object({
  description: z.string().min(1, 'Description is required'),
})

export type TaskFormData = z.infer<typeof taskFormSchema>

export interface AgentTaskFormProps {
  onSubmit: (data: TaskFormData) => void | Promise<void>
  onCancel: () => void
  isLoading?: boolean
  disabled?: boolean
}

export const AgentTaskForm = ({
  onSubmit,
  onCancel,
  isLoading = false,
  disabled = false,
}: AgentTaskFormProps) => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<TaskFormData>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      description: '',
    },
  })

  const onSubmitForm = async (data: TaskFormData) => {
    try {
      // Send payload to UI service
    //   const result = await uiService.submitTask(data, 'VISION_REQUIRED')

    //   if (result.success) {
    //     // Call parent onSubmit callback
    //     await onSubmit(data)
    //     // Reset form
    //     reset()
    //   } else {
    //     uiNotificationService.send('task:submission:failed', {
    //       title: 'Task Submission Failed',
    //       message: result.message || 'Failed to submit task',
    //       variant: 'error',
    //     })
    //   }

    await onSubmit(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit task'
      uiNotificationService.send('task:submission:error', {
        title: 'Task Submission Failed',
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
            label="Description"
            error={errors.description?.message}
            description="Describe what you want the agent to do (e.g., 'Navigate to example.com and verify the heading')"
            htmlFor="description"
          >
            <Textarea
              {...register('description')}
              placeholder="Enter task description..."
              disabled={disabled || isFormLoading}
              rows={4}
              aria-label="Task description"
            />
          </FormField>

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button
              type="submit"
              disabled={disabled || isFormLoading}
              className="flex-1"
              aria-label="Create test task"
            >
              {isFormLoading ? 'Creating...' : 'Create Test Task'}
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
