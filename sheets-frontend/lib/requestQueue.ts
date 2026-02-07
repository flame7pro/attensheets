// lib/requestQueue.ts
/**
 * Request queue with retry logic and concurrency control
 * Prevents overwhelming the backend with simultaneous requests
 */

interface QueuedRequest<T> {
  id: string;
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: any) => void;
  retries: number;
  maxRetries: number;
  priority: number; // Lower number = higher priority
}

export interface QueueOptions {
  maxRetries?: number;
  priority?: number; // 0 = highest, 10 = lowest
}

class RequestQueue {
  private queue: QueuedRequest<any>[] = [];
  private processing = false;
  private maxConcurrent: number;
  private activeRequests = 0;
  private requestCount = 0;

  constructor(maxConcurrent: number = 3) {
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * Add a request to the queue
   * Returns a promise that resolves when the request completes
   */
  async add<T>(
    execute: () => Promise<T>,
    options: QueueOptions = {}
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const request: QueuedRequest<T> = {
        id: `req_${++this.requestCount}_${Math.random().toString(36).substr(2, 9)}`,
        execute,
        resolve,
        reject,
        retries: 0,
        maxRetries: options.maxRetries ?? 3,
        priority: options.priority ?? 5,
      };

      this.queue.push(request);
      
      // Sort queue by priority (lower number = higher priority)
      this.queue.sort((a, b) => a.priority - b.priority);
      
      console.log(`📋 Queued request ${request.id} (priority: ${request.priority}, queue size: ${this.queue.length})`);
      
      this.processQueue();
    });
  }

  /**
   * Add a high-priority request (executes before others)
   */
  async addPriority<T>(execute: () => Promise<T>): Promise<T> {
    return this.add(execute, { priority: 0 });
  }

  /**
   * Get current queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Get number of active requests
   */
  getActiveCount(): number {
    return this.activeRequests;
  }

  /**
   * Clear all pending requests
   */
  clear(): void {
    const count = this.queue.length;
    this.queue.forEach(req => {
      req.reject(new Error('Queue cleared'));
    });
    this.queue = [];
    console.log(`🧹 Cleared ${count} pending requests`);
  }

  /**
   * Process the queue
   */
  private async processQueue() {
    if (this.processing || this.activeRequests >= this.maxConcurrent) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0 && this.activeRequests < this.maxConcurrent) {
      const request = this.queue.shift();
      if (!request) break;

      this.activeRequests++;
      this.executeRequest(request);
    }

    this.processing = false;
  }

  /**
   * Execute a single request with retry logic
   */
  private async executeRequest<T>(request: QueuedRequest<T>) {
    try {
      console.log(`⚙️ Executing ${request.id} (active: ${this.activeRequests}/${this.maxConcurrent})`);
      
      const result = await request.execute();
      
      console.log(`✅ Completed ${request.id}`);
      request.resolve(result);
      
    } catch (error: any) {
      if (request.retries < request.maxRetries) {
        request.retries++;
        
        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, request.retries), 10000);
        
        console.log(`🔄 Retrying ${request.id} (${request.retries}/${request.maxRetries}) after ${delay}ms`);
        
        // Re-add to queue with delay
        await new Promise(resolve => setTimeout(resolve, delay));
        this.queue.push(request);
        
      } else {
        console.error(`❌ Failed ${request.id} after ${request.maxRetries} retries:`, error.message);
        request.reject(error);
      }
    } finally {
      this.activeRequests--;
      this.processQueue();
    }
  }
}

// Global request queue instance
export const requestQueue = new RequestQueue(3); // Max 3 concurrent requests

// Separate queue for high-priority operations (auth, critical updates)
export const priorityQueue = new RequestQueue(2);s
