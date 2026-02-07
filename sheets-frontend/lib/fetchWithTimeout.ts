// lib/fetchWithTimeout.ts
/**
 * Enhanced fetch utilities with timeout and retry capabilities
 * Fixes network hanging and improves resilience
 */

export interface FetchWithTimeoutOptions extends RequestInit {
  timeout?: number; // milliseconds
}

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number; // milliseconds
  maxDelay?: number;
  timeout?: number;
}

/**
 * Fetch with automatic timeout
 * Prevents requests from hanging indefinitely
 */
export async function fetchWithTimeout(
  url: string,
  options: FetchWithTimeoutOptions = {}
): Promise<Response> {
  const { timeout = 15000, ...fetchOptions } = options; // 15 second default

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout}ms. Please check your connection.`);
    }
    throw error;
  }
}

/**
 * Fetch with automatic retry and exponential backoff
 * Handles temporary network issues gracefully
 */
export async function fetchWithRetry(
  url: string,
  options: FetchWithTimeoutOptions & RetryOptions = {}
): Promise<Response> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    timeout = 15000,
    ...fetchOptions
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, {
        ...fetchOptions,
        timeout,
      });

      // Only retry on 5xx errors (server errors) or network failures
      // Don't retry on 4xx errors (client errors like 401, 404)
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }

      lastError = new Error(`Server error: ${response.status} ${response.statusText}`);
      
      console.warn(`⚠️ Server error on attempt ${attempt + 1}:`, {
        url,
        status: response.status,
        statusText: response.statusText
      });
    } catch (error: any) {
      lastError = error;
      
      // Don't retry on client errors or authentication issues
      if (
        error.message?.includes('404') || 
        error.message?.includes('401') ||
        error.message?.includes('403')
      ) {
        throw error;
      }

      console.warn(`⚠️ Network error on attempt ${attempt + 1}:`, {
        url,
        error: error.message
      });
    }

    // Don't delay after last attempt
    if (attempt < maxRetries) {
      // Exponential backoff: 1s, 2s, 4s, 8s (capped at maxDelay)
      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      console.log(`🔄 Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms delay`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Request failed after maximum retries');
}

/**
 * Check if user is online
 */
export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

/**
 * Wait for network to come back online
 */
export function waitForOnline(timeout: number = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (isOnline()) {
      resolve();
      return;
    }

    const timeoutId = setTimeout(() => {
      window.removeEventListener('online', handleOnline);
      reject(new Error('Network did not come back online within timeout'));
    }, timeout);

    const handleOnline = () => {
      clearTimeout(timeoutId);
      window.removeEventListener('online', handleOnline);
      resolve();
    };

    window.addEventListener('online', handleOnline);
  });
}

/**
 * Enhanced fetch that waits for online status before attempting
 */
export async function fetchWithOnlineCheck(
  url: string,
  options: FetchWithTimeoutOptions & RetryOptions = {}
): Promise<Response> {
  if (!isOnline()) {
    console.log('⏳ Waiting for network connection...');
    await waitForOnline();
    console.log('✅ Network connection restored');
  }

  return fetchWithRetry(url, options);
}
