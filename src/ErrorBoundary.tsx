import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  children: ReactNode
}

type State = {
  hasError: boolean
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Unhandled render error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <main
          style={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
            padding: '2rem',
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
            background: '#0a0a0a',
            color: '#f4f4f5',
          }}
        >
          <section style={{ maxWidth: 560, textAlign: 'center' }}>
            <h1 style={{ marginBottom: 12, fontSize: '1.75rem', lineHeight: 1.2 }}>
              We hit a runtime error
            </h1>
            <p style={{ marginBottom: 20, color: '#a1a1aa' }}>
              The page failed to render. Refresh to retry while we fix the issue.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                border: '1px solid #3f3f46',
                borderRadius: 8,
                background: '#18181b',
                color: '#f4f4f5',
                padding: '0.625rem 1rem',
                cursor: 'pointer',
              }}
            >
              Refresh page
            </button>
          </section>
        </main>
      )
    }

    return this.props.children
  }
}