interface RequestOptions extends RequestInit {
  retries?: number;
  backoffFactor?: number; // ms
}

const DEFAULT_RETRIES = 3;
const DEFAULT_BACKOFF = 500; // ms

class ApiError extends Error {
  constructor(public status: number, public statusText: string, message?: string) {
    super(message || `API Error: ${status} ${statusText}`);
    this.name = 'ApiError';
  }
}

async function fetchWithRetry(url: string, options: RequestOptions = {}): Promise<Response> {
  const { retries = DEFAULT_RETRIES, backoffFactor = DEFAULT_BACKOFF, ...fetchOptions } = options;
  
  let lastError: unknown;
  
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(url, fetchOptions);
      
      // If 5xx or 429, we might want to retry. 
      // Typically 4xx (except 429) should not be retried.
      if (response.status >= 500 || response.status === 429) {
         throw new ApiError(response.status, response.statusText, `Server error ${response.status}`);
      }

      return response;
    } catch (error) {
      lastError = error;
      
      // Don't retry if it's not a fetch error (network) or 5xx/429
      // However, we threw on 5xx/429 above to trigger this catch block.
      // If we are out of retries, throw.
      if (i === retries) break;
      
      const waitTime = backoffFactor * Math.pow(2, i);
      // Optional: Add jitter
      const jitter = Math.random() * 100;
      await new Promise(resolve => setTimeout(resolve, waitTime + jitter));
    }
  }
  
  throw lastError;
}

export const apiClient = {
  get: (url: string, options?: RequestOptions) => fetchWithRetry(url, { ...options, method: 'GET' }),
  
  post: (url: string, body: unknown, options?: RequestOptions) => 
    fetchWithRetry(url, { 
      ...options, 
      method: 'POST', 
      body: JSON.stringify(body), 
      headers: { 
        'Content-Type': 'application/json', 
        ...options?.headers 
      } 
    }),
    
  put: (url: string, body: unknown, options?: RequestOptions) => 
    fetchWithRetry(url, { 
      ...options, 
      method: 'PUT', 
      body: JSON.stringify(body), 
      headers: { 
        'Content-Type': 'application/json', 
        ...options?.headers 
      } 
    }),
    
  delete: (url: string, options?: RequestOptions) => 
    fetchWithRetry(url, { ...options, method: 'DELETE' }),
};
