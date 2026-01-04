import { Routes, Route, useLocation } from 'react-router-dom'
import { useMemo } from 'react'
import { HomeView } from './features/home/HomeView'
import { PlansView } from './features/plans/PlansView'
import { ReportsView } from './features/reports/ReportsView'
import { ReportDetailView } from './features/reports/ReportDetailView'
import { DashboardsView } from './features/dashboards/DashboardsView'
import { Toaster } from '@/components/ui/toaster'
import { Sidebar } from '@/components/Sidebar'
import { useTheme } from '@/contexts/ThemeContext'
import './App.css'

function App() {
  const { theme } = useTheme()
  const location = useLocation()
  const isWideLayout = location.pathname !== '/'

  const backgroundImage = useMemo(() => {
    // Only show background on home page
    if (location.pathname !== '/') return 'none'
    const bgFile = theme === 'dark' ? 'background_dark.svg' : 'background_light.svg'
    // Add cache-busting query parameter to force reload when theme changes
    return `url(/images/${bgFile}?theme=${theme})`
  }, [theme, location.pathname])

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 flex">
        <Sidebar />
        
        <main 
          className="flex-1 ml-64"
          style={{
            backgroundImage,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            minHeight: '100vh',
          }}
        >
          <div className={isWideLayout ? 'container mx-auto px-4 py-5 max-w-7xl' : 'container mx-auto px-4 py-5 max-w-4xl'}>
            <Routes>
              <Route 
                path="/" 
                element={
                  <div className="flex flex-col items-center">
                    <div className="mb-8 text-center">
                      <div className="flex items-center justify-center mb-4">
                        <img 
                          src={theme === 'dark' ? '/images/cualal_logo_dark.png' : '/images/cuala_icon.png'}
                          alt="CUALA Logo" 
                          className={`w-64 h-64 object-contain border-2 border-border rounded-full ${theme === 'dark' ? 'logo-aura-dark bg-black' : 'logo-aura bg-white'}`}
                        />
                      </div>
                      <p className="text-muted-foreground text-lg">
                        Computer-Using Automation Layer Agent
                      </p>
                    </div>
                    <HomeView />
                  </div>
                } 
              />
              <Route 
                path="/plans" 
                element={
                  <div className="flex justify-center">
                    <PlansView />
                  </div>
                } 
              />
              <Route 
                path="/reports" 
                element={
                  <div className="flex justify-center">
                    <ReportsView />
                  </div>
                } 
              />
              <Route 
                path="/reports/:testId" 
                element={
                  <div className="flex justify-center">
                    <ReportDetailView />
                  </div>
                } 
              />
              <Route 
                path="/analytics" 
                element={
                  <div className="flex justify-center">
                    <DashboardsView />
                  </div>
                } 
              />
            </Routes>
          </div>
        </main>
      </div>
      <Toaster />
    </>
  )
}

export default App

