import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Palm Metric UI ErrorBoundary caught error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#1A3C2F] px-4 text-[#F5F0E6]">
          <div className="palm-card max-w-md w-full rounded-3xl p-6 text-center space-y-4">
            <h1 className="text-xl font-extrabold text-[#1A3C2F]">
              Palm Metric · بالم مترك
            </h1>
            <p className="text-sm font-semibold text-[#3B594B]">
              حدث خطأ غير متوقع في العرض. يرجى إعادة تحميل الصفحة للمتابعة.
            </p>
            <p className="text-xs font-medium text-[#546E61]" dir="ltr">
              An unexpected display error occurred. Please reload to continue.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="palm-btn-gold inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-extrabold cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Reload · إعادة تحميل</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
