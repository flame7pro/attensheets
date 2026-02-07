// lib/debounce.ts
/**
 * Debounce and throttle utilities for rate limiting
 * Prevents overwhelming the backend with rapid requests
 */

/**
 * Debounce: Delays execution until after wait time has elapsed since last call
 * Use for: Search inputs, form validation, auto-save
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function(...args: Parameters<T>) {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Throttle: Limits execution to once per time period
 * Use for: Scroll handlers, resize events, rapid clicks
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean = false;

  return function(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Debounce with immediate first call
 * First call executes immediately, subsequent calls are debounced
 */
export function debounceImmediate<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  let immediate = true;

  return function(...args: Parameters<T>) {
    const callNow = immediate;
    
    if (timeout) clearTimeout(timeout);
    
    timeout = setTimeout(() => {
      immediate = true;
    }, wait);

    if (callNow) {
      immediate = false;
      func(...args);
    }
  };
}

/**
 * Rate limiter: Limits number of calls within time window
 * Returns true if call is allowed, false if rate limit exceeded
 */
export class RateLimiter {
  private calls: number[] = [];
  
  constructor(
    private maxCalls: number,
    private windowMs: number
  ) {}

  attempt(): boolean {
    const now = Date.now();
    
    // Remove calls outside the window
    this.calls = this.calls.filter(time => now - time < this.windowMs);
    
    if (this.calls.length < this.maxCalls) {
      this.calls.push(now);
      return true;
    }
    
    return false;
  }

  reset(): void {
    this.calls = [];
  }

  getRemainingCalls(): number {
    const now = Date.now();
    this.calls = this.calls.filter(time => now - time < this.windowMs);
    return Math.max(0, this.maxCalls - this.calls.length);
  }
}
