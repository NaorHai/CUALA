import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const SettingsView = () => {
  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-muted-foreground">
              Settings configuration will be available here.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

