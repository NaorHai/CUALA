import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription as DialogDesc } from '@/components/ui/dialog'
import { AgentTaskForm, TaskFormData } from '../agent/AgentTaskForm'
import { PlanForm } from '../plans/PlanForm'
import { useNavigate } from 'react-router-dom'
import { uiService } from '@/services/uiService'
import { uiNotificationService } from '@/services/uiNotificationService'

export const HomeView = () => {
  const [showPlanModal, setShowPlanModal] = useState(false)
  const [showScenarioModal, setShowScenarioModal] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const navigate = useNavigate()

  const handlePlanCreated = async (data: { planId: string; scenarioId: string; name: string; steps: unknown[]; alreadyExists?: boolean }) => {
    setShowPlanModal(false)
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
    // Navigate to plans page to see the plan
    navigate('/plans')
  }

  const handlePlanCancel = () => {
    setShowPlanModal(false)
  }

  const handleScenarioSubmit = async (data: TaskFormData) => {
    try {
      setIsRunning(true)
      const result = await uiService.submitTask(data, 'VISION_REQUIRED')
      
      if (result.success && result.testId && result.scenarioId) {
        setShowScenarioModal(false)
        // Navigate to report page with test ID
        navigate(`/reports/${result.testId}`)
      } else if (result.success) {
        setShowScenarioModal(false)
        // Fallback to reports page if no test ID
        navigate('/reports')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit scenario'
      uiNotificationService.send('task:submission:error', {
        title: 'Scenario Submission Failed',
        message,
        variant: 'error',
      })
    } finally {
      setIsRunning(false)
    }
  }

  const handleScenarioCancel = () => {
    setShowScenarioModal(false)
  }

  return (
    <>
      <div className="w-full max-w-7xl mx-auto">
        <div className="flex flex-col lg:flex-row gap-6 items-stretch">
          {/* Create Plan Container - Left */}
          <Card className="flex-1 flex flex-col">
            <CardHeader>
              <CardTitle>Create Plan</CardTitle>
              <CardDescription>
                Generate an execution plan without executing it
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              <div className="flex justify-center items-center flex-1">
                <Button
                  onClick={() => setShowPlanModal(true)}
                  size="lg"
                  className="w-full max-w-md"
                >
                  Create Plan
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Scenario Agent Flow Container - Middle/Center */}
          <Card className="flex-1 flex flex-col">
            <CardHeader>
              <CardTitle>Scenario Agent Flow</CardTitle>
              <CardDescription>
                Create and execute a new test scenario
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              <div className="flex justify-center items-center flex-1">
                <Button
                  onClick={() => setShowScenarioModal(true)}
                  size="lg"
                  className="w-full max-w-md"
                >
                  New Scenario
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Create Plan Modal */}
      <Dialog open={showPlanModal} onOpenChange={setShowPlanModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Plan</DialogTitle>
            <DialogDesc>
              Generate an execution plan without executing it
            </DialogDesc>
          </DialogHeader>
          <PlanForm
            onSubmit={handlePlanCreated}
            onCancel={handlePlanCancel}
          />
        </DialogContent>
      </Dialog>

      {/* New Scenario Modal */}
      <Dialog open={showScenarioModal} onOpenChange={setShowScenarioModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Scenario</DialogTitle>
            <DialogDesc>
              Create and execute a new test scenario
            </DialogDesc>
          </DialogHeader>
          <AgentTaskForm
            onSubmit={handleScenarioSubmit}
            onCancel={handleScenarioCancel}
            isLoading={isRunning}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}

