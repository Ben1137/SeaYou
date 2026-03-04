/**
 * Fetch utilities with timeout and exponential backoff retry logic
 *
 * Provides robust HTTP request handling for the SeaYou API layer with:
 * - Configurable request timeouts using AbortController
 * - Exponential backoff retry strategy for transient failures
 * - Rate limit and timeout error handling
 * - Debug logging for monitoring retry attempts
 */

import { REQUEST_CONFIG, ERROR_MESSAGES } from '../constants';

/**
 * Configuration options for fetch with retry
 */
export interface FetchRetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;

  /** Request timeout in milliseconds (default: 10000) */
  timeoutMs?: number;

  /** Initial delay between retries in milliseconds (default: 1000) */
  initialDelayMs?: number;

  /** Maximum delay between retries in milliseconds (default: 10000) */
  maxDelayMs?: number;

  /** Backoff multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;

  /** Whether to log retry attempts for debugging (default: true) */
  logRetries?: boolean;

  /** Custom function to determine if error should trigger retry */
  shouldRetry?: (error: Error, response?: Response) => boolean;
}

/**
 * Default retry configuration from constants
 */
const DEFAULT_OPTIONS: Required<FetchRetryOptions> = {
  maxRetries: REQUEST_CONFIG.RETRY.MAX_ATTEMPTS,
  timeoutMs: REQUEST_CONFIG.DEFAULT_TIMEOUT_MS,
  initialDelayMs: REQUEST_CONFIG.RETRY.INITIAL_DELAY_MS,
  maxDelayMs: REQUEST_CONFIG.RETRY.MAX_DELAY_MS,
  backoffMultiplier: REQUEST_CONFIG.RETRY.BACKOFF_MULTIPLIER,
  logRetries: true,
  shouldRetry: defaultShouldRetry,
};

/**
 * Fetch with timeout using AbortController
 *
 * Wraps a fetch request with a timeout mechanism that aborts the request
 * if it takes longer than the specified timeout period.
 *
 * @param url - The URL to fetch
 * @param init - Fetch initialization options
 * @param timeoutMs - Timeout in milliseconds
 * @returns Promise resolving to the fetch Response
 * @throws Error with TIMEOUT message if request times out
 *
 * @example
 * const response = await fetchWithTimeout('https://api.example.com/data', {}, 5000);
 */
export async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs: number = REQUEST_CONFIG.DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(ERROR_MESSAGES.TIMEOUT);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Default retry logic: retry on network errors and specific HTTP status codes
 */
function defaultShouldRetry(error: Error, response?: Response): boolean {
  // Retry on network errors
  if (!response) return true;

  // Retry on server errors (5xx)
  if (response.status >= 500) return true;

  // DO NOT retry on rate limit (429) - the global rate limiter handles backoff

  // Retry on timeout (408)
  if (response.status === 408) return true;

  // Don't retry on client errors (4xx except 408)
  return false;
}

/**
 * Calculate delay for exponential backoff
 */
function calculateBackoffDelay(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
  backoffMultiplier: number
): number {
  const delay = initialDelayMs * Math.pow(backoffMultiplier, attempt);
  return Math.min(delay, maxDelayMs);
}

/**
 * Sleep utility for delays between retries
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch with exponential backoff retry logic
 *
 * Performs HTTP requests with automatic retry on transient failures using
 * exponential backoff strategy. Configurable retry behavior and logging.
 *
 * @param url - The URL to fetch
 * @param init - Fetch initialization options
 * @param options - Retry configuration options
 * @returns Promise resolving to the fetch Response
 * @throws Error after all retry attempts are exhausted
 *
 * @example
 * // Basic usage with defaults
 * const response = await fetchWithRetry('https://api.example.com/data');
 *
 * @example
 * // Custom retry configuration
 * const response = await fetchWithRetry('https://api.example.com/data', {}, {
 *   maxRetries: 5,
 *   timeoutMs: 15000,
 *   initialDelayMs: 2000,
 *   logRetries: false,
 * });
 *
 * @example
 * // With custom retry logic
 * const response = await fetchWithRetry('https://api.example.com/data', {}, {
 *   shouldRetry: (error, response) => {
 *     return response?.status === 503; // Only retry on service unavailable
 *   },
 * });
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  options: FetchRetryOptions = {}
): Promise<Response> {
  const config = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | null = null;
  let lastResponse: Response | undefined;

  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    try {
      // Attempt fetch with timeout
      const response = await fetchWithTimeout(url, init, config.timeoutMs);

      // Check if response indicates a retryable error
      if (!response.ok && config.shouldRetry(new Error(`HTTP ${response.status}`), response)) {
        lastResponse = response;
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Success - return the response
      return response;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry this error
      const shouldRetry = config.shouldRetry(lastError, lastResponse);

      // If this is the last attempt or we shouldn't retry, throw
      if (attempt === config.maxRetries - 1 || !shouldRetry) {
        if (config.logRetries) {
          console.error(
            `[fetchWithRetry] Request failed after ${attempt + 1} attempt(s):`,
            url,
            lastError.message
          );
        }
        throw lastError;
      }

      // Calculate backoff delay
      const delayMs = calculateBackoffDelay(
        attempt,
        config.initialDelayMs,
        config.maxDelayMs,
        config.backoffMultiplier
      );

      // Log retry attempt
      if (config.logRetries) {
        console.warn(
          `[fetchWithRetry] Attempt ${attempt + 1}/${config.maxRetries} failed for ${url}. ` +
          `Retrying in ${delayMs}ms... Error: ${lastError.message}`
        );
      }

      // Wait before retrying
      await sleep(delayMs);
    }
  }

  // This should never be reached due to the throw in the loop,
  // but TypeScript needs this for type safety
  throw lastError || new Error('Unknown error during fetch retry');
}

/**
 * Fetch with retry that returns null on failure instead of throwing
 *
 * Useful for non-critical requests where you want to handle failures gracefully
 * without try-catch blocks.
 *
 * @param url - The URL to fetch
 * @param init - Fetch initialization options
 * @param options - Retry configuration options
 * @returns Promise resolving to Response or null on failure
 *
 * @example
 * const response = await fetchWithRetrySafe('https://api.example.com/optional-data');
 * if (response?.ok) {
 *   const data = await response.json();
 * }
 */
export async function fetchWithRetrySafe(
  url: string,
  init?: RequestInit,
  options: FetchRetryOptions = {}
): Promise<Response | null> {
  try {
    return await fetchWithRetry(url, init, options);
  } catch (error) {
    console.error('[fetchWithRetrySafe] Request failed:', url, error);
    return null;
  }
}

/**
 * Check if an error is a timeout error
 */
export function isTimeoutError(error: Error): boolean {
  return error.message === ERROR_MESSAGES.TIMEOUT || error.name === 'AbortError';
}

/**
 * Check if an error is a rate limit error
 */
export function isRateLimitError(error: Error): boolean {
  return error.message.includes('429') || error.message === ERROR_MESSAGES.RATE_LIMIT;
}

/**
 * Check if an error is a network error
 */
export function isNetworkError(error: Error): boolean {
  return (
    error.message === ERROR_MESSAGES.NETWORK ||
    error.message.includes('fetch') ||
    error.message.includes('network')
  );
}
