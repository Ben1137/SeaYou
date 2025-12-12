import React from 'react';
import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';

interface ErrorStateProps {
  error: Error | null;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({ error, onRetry }) => {
  const getErrorMessage = (error: Error | null) => {
    if (!error) return 'An unexpected error occurred.';
    
    if (error.message === 'Failed to fetch' || error.message.includes('network')) {
      return 'Unable to connect to the weather service. Please check your internet connection.';
    }
    if (error.message.includes('rate limit')) {
      return 'Too many requests. Please wait a moment and try again.';
    }
    if (error.message.includes('timeout')) {
      return 'Request timed out. The service might be slow. Please try again.';
    }
    return error.message || 'An unexpected error occurred. Please try again.';
  };

  const isNetworkError = error?.message === 'Failed to fetch' || error?.message.includes('network');

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8 bg-slate-900 rounded-lg">
      {isNetworkError ? (
        <WifiOff className="w-16 h-16 text-red-400 mb-4" />
      ) : (
        <AlertTriangle className="w-16 h-16 text-red-400 mb-4" />
      )}
      
      <h2 className="text-2xl font-bold text-slate-100 mb-2">
        Oops! Something went wrong
      </h2>
      
      <p className="text-slate-400 text-center mb-6 max-w-md">
        {getErrorMessage(error)}
      </p>
      
      <div className="flex gap-4">
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
        )}
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
        >
          Reload Page
        </button>
      </div>
    </div>
  );
};

export const InlineErrorState: React.FC<ErrorStateProps> = ({ error, onRetry }) => {
  return (
    <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4 flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-red-200 text-sm">
          {error?.message || 'An error occurred'}
        </p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-2 text-xs text-red-300 hover:text-red-100 underline"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
};
