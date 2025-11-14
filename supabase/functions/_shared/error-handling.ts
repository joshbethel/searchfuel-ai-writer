/**
 * Error handling utilities for Supabase Edge Functions
 * Provides consistent error handling patterns across all functions
 */

interface ErrorResponse {
  error: string;
  message?: string;
  code?: string;
  timestamp: string;
}

/**
 * Check if we're in development mode
 */
export function isDevelopment(): boolean {
  return Deno.env.get("ENVIRONMENT") === "development" || 
         Deno.env.get("DENO_ENV") === "development" ||
         Deno.env.get("DENO_ENV") === "dev";
}

/**
 * Create a standardized error response
 * Hides sensitive details in production, shows them in development
 */
export function createErrorResponse(
  error: unknown,
  statusCode: number = 500,
  corsHeaders: Record<string, string>,
  userMessage?: string
): Response {
  const isDev = isDevelopment();
  let errorMessage = userMessage || "An error occurred";
  let errorDetails: ErrorResponse = {
    error: errorMessage,
    timestamp: new Date().toISOString(),
  };

  if (error instanceof Error) {
    // In development, include more details
    if (isDev) {
      errorDetails.message = error.message;
      errorDetails.code = error.name;
    }
    
    // Log full error details server-side (never exposed to client)
    console.error("Error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
  } else {
    console.error("Unknown error type:", error);
  }

  return new Response(
    JSON.stringify(errorDetails),
    {
      status: statusCode,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}

/**
 * Handle API response errors with specific status code handling
 */
export function handleApiError(
  response: Response,
  corsHeaders: Record<string, string>,
  context: string = "API request"
): Response {
  const status = response.status;
  let errorMessage = "An error occurred";
  let statusCode = 500;

  // Handle specific HTTP status codes
  switch (status) {
    case 400:
      errorMessage = "Invalid request. Please check your input.";
      statusCode = 400;
      break;
    case 401:
      errorMessage = "Authentication failed. Please check your credentials.";
      statusCode = 401;
      break;
    case 403:
      errorMessage = "Access denied. You don't have permission for this operation.";
      statusCode = 403;
      break;
    case 404:
      errorMessage = "Resource not found.";
      statusCode = 404;
      break;
    case 429:
      errorMessage = "Rate limit exceeded. Please try again later.";
      statusCode = 429;
      break;
    case 500:
    case 502:
    case 503:
      errorMessage = "Service temporarily unavailable. Please try again later.";
      statusCode = 503;
      break;
    default:
      errorMessage = `${context} failed. Please try again.`;
      statusCode = 500;
  }

  return createErrorResponse(
    new Error(`API error: ${status}`),
    statusCode,
    corsHeaders,
    errorMessage
  );
}

/**
 * Safely access nested object properties with null checks
 */
export function safeGet<T>(
  obj: any,
  path: string,
  defaultValue: T
): T {
  const keys = path.split(".");
  let current = obj;

  for (const key of keys) {
    if (current == null || typeof current !== "object") {
      return defaultValue;
    }
    current = current[key];
  }

  return current != null ? current : defaultValue;
}

/**
 * Validate that required fields exist in an object
 */
export function validateRequiredFields(
  obj: any,
  requiredFields: string[]
): { valid: true } | { valid: false; missing: string[] } {
  const missing: string[] = [];

  for (const field of requiredFields) {
    const value = safeGet(obj, field, undefined);
    if (value === undefined || value === null || value === "") {
      missing.push(field);
    }
  }

  if (missing.length > 0) {
    return { valid: false, missing };
  }

  return { valid: true };
}

/**
 * Parse JSON safely with error handling
 */
export function safeJsonParse<T>(
  jsonString: string,
  defaultValue: T
): T {
  try {
    const parsed = JSON.parse(jsonString);
    return parsed as T;
  } catch (error) {
    console.error("JSON parse error:", error);
    return defaultValue;
  }
}

