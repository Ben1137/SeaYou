import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';
import { I18nextProvider } from 'react-i18next';
import App from './App';
import { ErrorState } from './components/ErrorState';
import { ThemeProvider } from './src/contexts/ThemeContext';
import i18n from './src/i18n/config';
import './src/index.css'; // Import Tailwind CSS and theme variables

// Configure React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 30 * 60 * 1000, // 30 minutes (formerly cacheTime)
      refetchOnWindowFocus: true,
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary
      FallbackComponent={ErrorState}
      onReset={() => window.location.reload()}
    >
      <I18nextProvider i18n={i18n}>
        <ThemeProvider defaultTheme="light">
          <QueryClientProvider client={queryClient}>
            <App />
          </QueryClientProvider>
        </ThemeProvider>
      </I18nextProvider>
    </ErrorBoundary>
  </React.StrictMode>
);