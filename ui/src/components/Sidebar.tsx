import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { FileText, BarChart3, Home, Moon, Sun, LayoutDashboard } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'

export const Sidebar = () => {
  const { theme, toggleTheme } = useTheme()
  const location = useLocation()
  
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
    <aside className="w-64 bg-card border-r border-border h-screen fixed left-0 top-0 overflow-y-auto flex flex-col">
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
      
      <div className="p-4 border-t border-border">
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
    </aside>
  )
}

