import { Component, ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { error: string | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(e: Error): State {
    return { error: e.message };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: 'var(--font)' }}>
          <div className="page-header">
            <div className="page-title">Something went wrong</div>
          </div>
          <div className="page-body">
            <div className="alert alert-error">
              <strong>Error:</strong> {this.state.error}
              <button
                style={{ marginLeft: 12, padding: '2px 10px', fontSize: 12, height: 'auto', background: 'none', color: 'var(--error)', border: '1px solid var(--error-border)', borderRadius: 6 }}
                onClick={() => this.setState({ error: null })}
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
