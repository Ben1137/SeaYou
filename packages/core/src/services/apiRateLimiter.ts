/**
 * apiRateLimiter.ts - Global API Rate Limiting Coordinator
 *
 * Three-layer protection against 429 (Too Many Requests) errors:
 * 1. Throttle Queue - Max N concurrent requests (prevents burst)
 * 2. Negative Cache - 429'd URLs cached for TTL (prevents retry cascade)
 * 3. Global Cooldown - Pause after ANY 429 (lets API recover)
 */

import { REQUEST_CONFIG } from '../constants';

interface QueuedTask<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: any) => void;
  addedAt: number;
}

class ApiRateLimiter {
  private lastRequestTime = 0;
  private queue: QueuedTask<any>[] = [];
  private activeRequests = 0;
  private processing = false;
  private globalCooldownUntil = 0;

  // Negative cache: URLs that returned 429 recently
  private negativeCache: Map<string, number> = new Map();

  // Configuration from constants
  private get maxConcurrent(): number {
    return REQUEST_CONFIG.RATE_LIMIT.MAX_CONCURRENT_REQUESTS ?? 2;
  }
  private get cooldownAfter429(): number {
    return REQUEST_CONFIG.RATE_LIMIT.COOLDOWN_AFTER_429_MS ?? 30000;
  }
  private get negativeCacheTTL(): number {
    return REQUEST_CONFIG.RATE_LIMIT.NEGATIVE_CACHE_TTL_MS ?? 15000;
  }

  /**
   * Check if a URL is in the negative cache (recently 429'd)
   */
  isNegativelyCached(url: string): boolean {
    const expiry = this.negativeCache.get(url);
    if (!expiry) return false;
    if (Date.now() > expiry) {
      this.negativeCache.delete(url);
      return false;
    }
    return true;
  }

  /**
   * Add a URL to the negative cache
   */
  private addToNegativeCache(url: string): void {
    this.negativeCache.set(url, Date.now() + this.negativeCacheTTL);
  }

  /**
   * Enqueue an API request for rate-limited execution
   */
  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        fn,
        resolve,
        reject,
        addedAt: Date.now(),
      });
      this.processQueue();
    });
  }

  /**
   * Process queued requests with throttle queue and cooldown
   */
  private async processQueue() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      // Wait for global cooldown if active
      const now = Date.now();
      if (now < this.globalCooldownUntil) {
        const waitTime = this.globalCooldownUntil - now;
        console.warn(`[ApiRateLimiter] Global cooldown active, waiting ${waitTime}ms`);
        await new Promise(r => setTimeout(r, waitTime));
      }

      // Wait for a slot to open up
      if (this.activeRequests >= this.maxConcurrent) {
        await new Promise(r => setTimeout(r, 100));
        continue;
      }

      const task = this.queue.shift();
      if (!task) break;

      // Check if task is stale (>15 seconds old)
      const taskAge = Date.now() - task.addedAt;
      if (taskAge > 15000) {
        console.log(`[ApiRateLimiter] Dropping stale request (age: ${taskAge}ms)`);
        task.reject(new Error('Request timeout - viewport changed'));
        continue;
      }

      // Execute with concurrency tracking
      this.activeRequests++;
      this.executeTask(task).finally(() => {
        this.activeRequests--;
        // Trigger processing of next items
        if (this.queue.length > 0) {
          this.processQueue();
        }
      });
    }

    this.processing = false;
  }

  /**
   * Execute a single queued task
   */
  private async executeTask<T>(task: QueuedTask<T>): Promise<void> {
    try {
      const result = await task.fn();
      task.resolve(result);
    } catch (error: any) {
      // Check if this is a 429 error
      const is429 = error?.message?.includes('429') ||
                   error?.message?.includes('Too Many Requests') ||
                   error?.status === 429 ||
                   error?.statusCode === 429;

      if (is429) {
        // Layer 2: Negative cache - extract URL if available
        const url = error?.url || error?.message?.match(/https?:\/\/[^\s]+/)?.[0];
        if (url) {
          this.addToNegativeCache(url);
        }

        // Layer 3: Global cooldown
        this.globalCooldownUntil = Date.now() + this.cooldownAfter429;
        console.warn(
          `[ApiRateLimiter] 429 detected! Global cooldown ${this.cooldownAfter429}ms, ` +
          `${this.queue.length} queued, negative cache size: ${this.negativeCache.size}`
        );

        // Drop half the queue to prevent cascade
        if (this.queue.length > 4) {
          const toDrop = Math.floor(this.queue.length / 2);
          console.warn(`[ApiRateLimiter] Dropping ${toDrop} queued requests to prevent cascade`);
          for (let i = 0; i < toDrop; i++) {
            const dropped = this.queue.shift();
            if (dropped) {
              dropped.reject(new Error('Request dropped due to rate limit cascade'));
            }
          }
        }
      }

      task.reject(error);
    }
  }

  /**
   * Get current queue depth (for debugging/monitoring)
   */
  getQueueDepth(): number {
    return this.queue.length;
  }

  /**
   * Check if currently in cooldown
   */
  isInCooldown(): boolean {
    return Date.now() < this.globalCooldownUntil;
  }

  /**
   * Clear the queue (useful for viewport changes that invalidate pending requests)
   */
  clearQueue() {
    const dropped = this.queue.length;
    if (dropped > 0) {
      console.log(`[ApiRateLimiter] Clearing ${dropped} pending requests`);
      while (this.queue.length > 0) {
        const task = this.queue.shift();
        if (task) {
          task.reject(new Error('Request cancelled - viewport changed'));
        }
      }
    }
  }
}

// Global singleton instance
export const globalRateLimiter = new ApiRateLimiter();
