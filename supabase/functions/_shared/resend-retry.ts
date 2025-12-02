/**
 * Shared retry utilities for Resend email sending
 * Handles rate limiting with exponential backoff
 */

/**
 * Helper function to sleep/delay execution
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if error is a rate limit error
 */
export function isRateLimitError(error: any): boolean {
  const errorMessage = error?.message || error?.toString() || '';
  return errorMessage.includes('Too many requests') || 
         errorMessage.includes('rate limit') ||
         errorMessage.includes('429') ||
         (error?.status === 429);
}

/**
 * Send email with retry logic for rate limits
 * @param resend - Resend client instance
 * @param emailData - Email data to send
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @returns Promise with email result
 */
export async function sendEmailWithRetry(
  resend: any,
  emailData: { from: string; to: string | string[]; subject: string; html: string },
  maxRetries: number = 3
): Promise<any> {
  let lastError: any = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Add delay before retry (exponential backoff: 500ms, 1000ms, 2000ms)
      if (attempt > 0) {
        const delayMs = 500 * Math.pow(2, attempt - 1);
        console.log(`Rate limit hit, retrying after ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`);
        await sleep(delayMs);
      }
      
      const result = await resend.emails.send(emailData);
      
      if (result.error) {
        // Check if it's a rate limit error
        if (isRateLimitError(result.error) && attempt < maxRetries - 1) {
          lastError = result.error;
          continue; // Retry
        }
        throw new Error(result.error.message || "Failed to send email");
      }
      
      return result;
    } catch (error) {
      lastError = error;
      
      // Check if it's a rate limit error and we have retries left
      if (isRateLimitError(error) && attempt < maxRetries - 1) {
        continue; // Retry
      }
      
      // If it's not a rate limit error or we're out of retries, throw
      throw error;
    }
  }
  
  // If we exhausted all retries, throw the last error
  throw lastError || new Error("Failed to send email after retries");
}

