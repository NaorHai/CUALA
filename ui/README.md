# CUALA UI

Modern React application for visualizing the CUALA Agent Flow.

## Features

- **React 19.2.1+** with TypeScript (includes Dec 2025 security fixes)
- **Vite** for fast development and builds
- **Tailwind CSS** for modern, responsive styling
- **shadcn/ui** for beautiful, accessible UI components
- **Agent Flow Visualization** showing the complete execution pipeline:
  - Planning phase
  - Execution phase (DOM & Vision executors)
  - Verification phase
  - Reporting phase

## Constraints

This project adheres to strict constraints:

- ✅ **No class components** - All components are functional
- ✅ **No deprecated React APIs** - Using latest React 19 patterns
- ✅ **No React Server Components** - Client-side only
- ✅ **Client-side only** - No server-side code
- ✅ **Mock services only** - No backend implementation, all services are mocked

See [CONSTRAINTS.md](./CONSTRAINTS.md) for detailed verification.

## Getting Started

### Prerequisites

- Node.js (v18+)
- npm or yarn

### Installation

```bash
cd ui
npm install
```

### Development

Start the development server:

```bash
npm run dev
```

The app will be available at `http://localhost:3000`

### Build

Build for production:

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Project Structure

```
ui/
├── src/
│   ├── components/
│   │   ├── ui/              # shadcn/ui components
│   │   │   ├── button.tsx
│   │   │   └── card.tsx
│   │   └── AgentFlow.tsx    # Main Agent Flow visualization component
│   ├── lib/
│   │   └── utils.ts         # Utility functions (cn helper)
│   ├── App.tsx              # Root application component
│   ├── main.tsx             # Application entry point
│   └── index.css            # Global styles with Tailwind
├── components.json          # shadcn/ui configuration
├── index.html               # HTML template
├── vite.config.ts           # Vite configuration
├── tsconfig.json            # TypeScript configuration
└── tailwind.config.js       # Tailwind CSS configuration
```

## Adding shadcn/ui Components

To add more shadcn/ui components:

```bash
npx shadcn@latest add [component-name]
```

For example:
```bash
npx shadcn@latest add badge
npx shadcn@latest add dialog
```

## Usage

The Agent Flow UI provides an interactive visualization of the CUALA execution pipeline:

1. **Run Flow**: Click the "Run Flow" button to simulate the complete agent execution flow
2. **Reset**: Click "Reset" to clear the flow and start over
3. **Status Indicators**: Each step shows its current status:
   - ○ Pending
   - ⟳ In Progress
   - ✓ Success
   - ✗ Failure

The UI demonstrates the four main phases of CUALA:
- **Planning**: Scenario analysis and plan generation
- **Execution**: DOM and Vision-based action execution
- **Verification**: Step verification and assertion checking
- **Reporting**: Structured test report generation

