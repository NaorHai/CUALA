# Project Constraints

This project adheres to the following constraints:

## 1. No Class Components ✅
- All React components use functional components only
- No `class Component extends React.Component` patterns
- All components use hooks (useState, useEffect, etc.)

## 2. No Deprecated React APIs ✅
- Using React 19.2.1 (latest with security fixes)
- Using `ReactDOM.createRoot()` (not deprecated `ReactDOM.render()`)
- Using modern hooks API only
- No deprecated lifecycle methods
- No `UNSAFE_` prefixed APIs

## 3. No React Server Components ✅
- Client-side only application
- No `'use server'` directives
- No server-side rendering
- Built with Vite (client-side bundler)
- All components run in the browser

## 4. Client-Side Only ✅
- No server-side code
- No Node.js server implementation
- All code runs in the browser
- Vite dev server is for development only (not part of the app)

## 5. No Backend Implementation (Mock Service Only) ✅
- All services are mock implementations
- No actual HTTP requests (fetch, axios, etc.)
- All API calls are simulated with `setTimeout`
- Services are clearly marked as MOCK in documentation
- Ready to be replaced with real API calls when backend is available

## Verification

To verify these constraints are met:

```bash
# Check for class components
grep -r "class.*extends.*Component" ui/src

# Check for deprecated APIs
grep -r "componentDidMount\|componentWillMount\|UNSAFE_" ui/src

# Check for server components
grep -r "'use server'" ui/src

# Check for actual API calls
grep -r "fetch\|axios\|XMLHttpRequest" ui/src
```

All checks should return no results (except for Set/Map `.delete()` methods which are not HTTP calls).


