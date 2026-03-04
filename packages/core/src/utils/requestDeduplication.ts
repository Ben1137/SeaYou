/**
 * Request Deduplication Utility with Retry Logic
 *
 * Prevents duplicate API calls by tracking in-flight requests and returning
 * the same Promise for identical requests. This is especially useful for:
 * - Components mounting simultaneously
 * - Rapid user interactions
 * - Parallel data fetching scenarios
 *
 * Now includes exponential backoff retry strategy for transient failures:
 * - Configurable timeout with AbortController
 * - Exponential backoff with jitter
 * - Retry on network errors, timeouts, and 5xx status codes (429 handled by rate limiter)
 * - Debug logging for monitoring retry attempts
 *
 * Strategy:
 * 1. Generate a unique key based on URL + params
 * 2. Check if request is already in-flight
 * 3. Return existing Promise if found, otherwise execute new request with retry
 * 4. Clean up completed requests immediately
 * 5. DO NOT cache failed requests (they can be retried)
 *
 * This is different from cacheService.ts which provides long-term storage.
 * Request deduplication is only for in-flight requests (milliseconds/seconds).
 */

import { fetchWithTimeout } from './fetchWithRetry';
import { REQUEST_CONFIG, ERROR_MESSAGES } from '../constants';

interface RequestCacheEntry<T> {
  promise: Promise<T>;
  timestamp: number;
  key: string;
}

interface DeduplicationOptions {
  /**
   * Time-to-live for request cache entry in milliseconds
   * Default: 5000ms (5 seconds)
   * After this time, a new request will be made even if one is in-flight
   */
  ttl?: number;

  /**
   * Custom key generator function
   * Default: URL + stringified params
   */
  keyGenerator?: (url: string, params?: Record<string, any>) => string;

  /**
   * Whether to deduplicate this request
   * Default: true
   */
  enabled?: boolean;

  /**
   * Maximum number of retry attempts
   * Default: 3 (from REQUEST_CONFIG.RETRY.MAX_ATTEMPTS)
   */
  maxRetries?: number;

  /**
   * Request timeout in milliseconds
   * Default: 10000ms (from REQUEST_CONFIG.DEFAULT_TIMEOUT_MS)
   */
  timeoutMs?: number;

  /**
   * Initial delay between retries in milliseconds
   * Default: 1000ms (from REQUEST_CONFIG.RETRY.INITIAL_DELAY_MS)
   */
  initialDelayMs?: number;

  /**
   * Maximum delay between retries in milliseconds
   * Default: 10000ms (from REQUEST_CONFIG.RETRY.MAX_DELAY_MS)
   */
  maxDelayMs?: number;

  /**
   * Backoff multiplier for exponential backoff
   * Default: 2 (from REQUEST_CONFIG.RETRY.BACKOFF_MULTIPLIER)
   */
  backoffMultiplier?: number;

  /**
   * Whether to log retry attempts for debugging
   * Default: true
   */
  logRetries?: boolean;
}

class RequestDeduplicationService {
  // In-flight request cache
  private inFlightRequests: Map<string, RequestCacheEntry<any>> = new Map();

  // Default TTL: 5 seconds (enough to catch duplicate requests, not too long to cause stale data issues)
  private readonly DEFAULT_TTL = 5000;

  // Cleanup interval: every 10 seconds
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly CLEANUP_INTERVAL = 10000;

  constructor() {
    // Start periodic cleanup
    this.startCleanup();
  }

  /**
   * Generate a unique key for a request based on URL and params
   */
  private generateKey(url: string, params?: Record<string, any>): string {
    const baseKey = url.toLowerCase();

    if (!params || Object.keys(params).length === 0) {
      return baseKey;
    }

    // Sort params to ensure consistent keys
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}=${JSON.stringify(params[key])}`)
      .join('&');

    return `${baseKey}?${sortedParams}`;
  }

  /**
   * Check if a request is currently in-flight and not expired
   */
  private getInFlightRequest<T>(key: string, ttl: number): Promise<T> | null {
    const entry = this.inFlightRequests.get(key);

    if (!entry) {
      return null;
    }

    // Check if entry has expired
    const now = Date.now();
    if (now - entry.timestamp > ttl) {
      // Expired, remove it
      this.inFlightRequests.delete(key);
      return null;
    }

    return entry.promise as Promise<T>;
  }

  /**
   * Store an in-flight request
   */
  private setInFlightRequest<T>(key: string, promise: Promise<T>): void {
    this.inFlightRequests.set(key, {
      promise,
      timestamp: Date.now(),
      key,
    });
  }

  /**
   * Remove a request from the in-flight cache
   */
  private removeInFlightRequest(key: string): void {
    this.inFlightRequests.delete(key);
  }

  /**
   * Clean up expired requests
   */
  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    this.inFlightRequests.forEach((entry, key) => {
      // Use a generous timeout (30 seconds) for cleanup to avoid removing requests that might still be valid
      if (now - entry.timestamp > 30000) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.inFlightRequests.delete(key));

    if (keysToDelete.length > 0) {
      console.debug(`[RequestDeduplication] Cleaned up ${keysToDelete.length} expired requests`);
    }
  }

  /**
   * Start periodic cleanup
   */
  private startCleanup(): void {
    if (typeof window === 'undefined') {
      // Skip cleanup in non-browser environments (e.g., SSR, tests)
      return;
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.CLEANUP_INTERVAL);
  }

  /**
   * Stop periodic cleanup
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Calculate delay for exponential backoff with jitter
   */
  private calculateBackoffDelay(
    attempt: number,
    initialDelayMs: number,
    maxDelayMs: number,
    backoffMultiplier: number
  ): number {
    const baseDelay = initialDelayMs * Math.pow(backoffMultiplier, attempt);
    const cappedDelay = Math.min(baseDelay, maxDelayMs);
    // Add jitter (±25%) to prevent thundering herd
    const jitter = cappedDelay * 0.25 * (Math.random() - 0.5);
    return Math.max(0, cappedDelay + jitter);
  }

  /**
   * Sleep utility for delays between retries
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Determine if an HTTP status code should trigger retry
   */
  private shouldRetryStatus(status: number): boolean {
    // Retry on server errors (5xx)
    if (status >= 500) return true;
    // DO NOT retry on rate limit (429) - let the global rate limiter handle backoff
    // Retry on timeout (408)
    if (status === 408) return true;
    // Don't retry on client errors (4xx except 408)
    return false;
  }

  /**
   * Execute a fetch request with deduplication and retry logic
   *
   * @param url - The URL to fetch
   * @param options - Fetch options (method, headers, body, etc.)
   * @param deduplicationOptions - Deduplication and retry-specific options
   * @returns Promise with the fetch response
   */
  async fetch<T = any>(
    url: string,
    options?: RequestInit,
    deduplicationOptions?: DeduplicationOptions
  ): Promise<T> {
    const {
      ttl = this.DEFAULT_TTL,
      keyGenerator = this.generateKey.bind(this),
      enabled = true,
      maxRetries = REQUEST_CONFIG.RETRY.MAX_ATTEMPTS,
      timeoutMs = REQUEST_CONFIG.DEFAULT_TIMEOUT_MS,
      initialDelayMs = REQUEST_CONFIG.RETRY.INITIAL_DELAY_MS,
      maxDelayMs = REQUEST_CONFIG.RETRY.MAX_DELAY_MS,
      backoffMultiplier = REQUEST_CONFIG.RETRY.BACKOFF_MULTIPLIER,
      logRetries = true,
    } = deduplicationOptions || {};

    // If deduplication is disabled, execute request with retry but no deduplication
    if (!enabled) {
      return this.fetchWithRetry<T>(url, options, {
        maxRetries,
        timeoutMs,
        initialDelayMs,
        maxDelayMs,
        backoffMultiplier,
        logRetries,
      });
    }

    // Generate cache key
    const params = options?.body ? JSON.parse(options.body as string) : undefined;
    const key = keyGenerator(url, { ...params, method: options?.method || 'GET' });

    // Check if request is already in-flight
    const existingRequest = this.getInFlightRequest<T>(key, ttl);
    if (existingRequest) {
      if (logRetries) {
        console.debug(`[RequestDeduplication] Returning existing request for: ${url}`);
      }
      return existingRequest;
    }

    // Execute new request with retry logic
    if (logRetries) {
      console.debug(`[RequestDeduplication] Executing new request for: ${url}`);
    }

    const requestPromise = this.fetchWithRetry<T>(url, options, {
      maxRetries,
      timeoutMs,
      initialDelayMs,
      maxDelayMs,
      backoffMultiplier,
      logRetries,
    });

    // Store in cache
    this.setInFlightRequest(key, requestPromise);

    // Handle cleanup after request completes
    requestPromise
      .then(() => {
        // Keep completed request in cache for the full TTL duration so that
        // subsequent calls within the TTL window get the same promise and
        // avoid firing duplicate network requests.
        setTimeout(() => {
          this.removeInFlightRequest(key);
        }, ttl);
      })
      .catch(() => {
        // IMPORTANT: Remove failed requests immediately so they can be retried
        this.removeInFlightRequest(key);
      });

    return requestPromise;
  }

  /**
   * Internal method to execute fetch with retry logic
   */
  private async fetchWithRetry<T>(
    url: string,
    options?: RequestInit,
    retryConfig?: {
      maxRetries: number;
      timeoutMs: number;
      initialDelayMs: number;
      maxDelayMs: number;
      backoffMultiplier: number;
      logRetries: boolean;
    }
  ): Promise<T> {
    const {
      maxRetries = 3,
      timeoutMs = 10000,
      initialDelayMs = 1000,
      maxDelayMs = 10000,
      backoffMultiplier = 2,
      logRetries = true,
    } = retryConfig || {};

    let lastError: Error | null = null;
    let lastResponse: Response | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Attempt fetch with timeout
        const response = await fetchWithTimeout(url, options, timeoutMs);

        // Check if response indicates a retryable error
        if (!response.ok && this.shouldRetryStatus(response.status)) {
          lastResponse = response;
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Check for non-ok status that shouldn't be retried
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Success - parse and return the response
        return await response.json();

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // GUARD: Never retry 429 (Too Many Requests). The global rate limiter in
        // apiRateLimiter.ts is responsible for backoff after rate-limit responses.
        // Retrying here would amplify the problem and accelerate the ban.
        // Check both the error message (thrown path) and lastResponse.status (set
        // only for 5xx retryable paths — kept for belt-and-suspenders coverage).
        const is429 =
          lastError.message.includes('429') ||
          lastResponse?.status === 429;
        if (is429) {
          if (logRetries) {
            console.warn(
              `[RequestDeduplication] 429 rate-limit detected for ${url}. ` +
              `Aborting retries immediately — let apiRateLimiter handle backoff.`
            );
          }
          throw lastError;
        }

        // Determine if we should retry
        const isTimeoutError = lastError.message === ERROR_MESSAGES.TIMEOUT || lastError.name === 'AbortError';
        const isNetworkError = !lastResponse && lastError.message.toLowerCase().includes('fetch');
        const isRetryableStatus = lastResponse && this.shouldRetryStatus(lastResponse.status);
        const shouldRetry = isTimeoutError || isNetworkError || isRetryableStatus;

        // If this is the last attempt or we shouldn't retry, throw
        if (attempt === maxRetries - 1 || !shouldRetry) {
          if (logRetries) {
            console.error(
              `[RequestDeduplication] Request failed after ${attempt + 1} attempt(s):`,
              url,
              lastError.message
            );
          }
          throw lastError;
        }

        // Calculate backoff delay
        const delayMs = this.calculateBackoffDelay(
          attempt,
          initialDelayMs,
          maxDelayMs,
          backoffMultiplier
        );

        // Log retry attempt
        if (logRetries) {
          console.warn(
            `[RequestDeduplication] Attempt ${attempt + 1}/${maxRetries} failed for ${url}. ` +
            `Retrying in ${Math.round(delayMs)}ms... Error: ${lastError.message}`
          );
        }

        // Wait before retrying
        await this.sleep(delayMs);

        // Clear lastResponse for next attempt
        lastResponse = undefined;
      }
    }

    // This should never be reached due to the throw in the loop,
    // but TypeScript needs this for type safety
    throw lastError || new Error('Unknown error during fetch retry');
  }

  /**
   * Get current cache statistics
   */
  getStats(): { inFlightCount: number; oldestRequestAge: number } {
    const now = Date.now();
    let oldestAge = 0;

    this.inFlightRequests.forEach(entry => {
      const age = now - entry.timestamp;
      if (age > oldestAge) {
        oldestAge = age;
      }
    });

    return {
      inFlightCount: this.inFlightRequests.size,
      oldestRequestAge: oldestAge,
    };
  }

  /**
   * Clear all in-flight requests
   * Useful for testing or manual cache invalidation
   */
  clearAll(): void {
    this.inFlightRequests.clear();
    console.debug('[RequestDeduplication] Cleared all in-flight requests');
  }
}

// Export singleton instance
export const requestDeduplicationService = new RequestDeduplicationService();

/**
 * Convenience wrapper for deduplicated fetch requests
 *
 * Usage:
 * ```typescript
 * const data = await deduplicatedFetch<MyDataType>(
 *   'https://api.example.com/data',
 *   { method: 'GET' },
 *   { ttl: 3000 }
 * );
 * ```
 */
export async function deduplicatedFetch<T = any>(
  url: string,
  options?: RequestInit,
  deduplicationOptions?: DeduplicationOptions
): Promise<T> {
  return requestDeduplicationService.fetch<T>(url, options, deduplicationOptions);
}

/**
 * Generate a cache key for a URL with query parameters
 * Useful for manual cache management
 */
export function generateRequestKey(url: string, params?: URLSearchParams | Record<string, string>): string {
  const baseUrl = url.split('?')[0];

  if (!params) {
    return baseUrl;
  }

  // Convert URLSearchParams to sorted string
  let sortedParams: string;

  if (params instanceof URLSearchParams) {
    const entries = Array.from(params.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    sortedParams = entries.map(([key, value]) => `${key}=${value}`).join('&');
  } else {
    sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');
  }

  return `${baseUrl}?${sortedParams}`;
}

// Export types
export type { DeduplicationOptions, RequestCacheEntry };
