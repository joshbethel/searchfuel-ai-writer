/**
 * Shared input validation schemas using Zod
 * 
 * This module provides reusable validation schemas for common input types
 * used across edge functions. All schemas use Zod for type-safe validation.
 */

import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

/**
 * Common validation schemas
 */

// UUID validation - strict UUID v4 format
export const uuidSchema = z.string().uuid({
  message: "Invalid UUID format"
});

// URL validation - validates URL format (use with url-validation.ts for SSRF protection)
export const urlSchema = z.string().url({
  message: "Invalid URL format"
}).refine(
  (url) => {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  },
  { message: "URL must use HTTP or HTTPS protocol" }
);

// Non-empty string validation
export const nonEmptyStringSchema = z.string().min(1, {
  message: "String cannot be empty"
});

// Positive integer validation
export const positiveIntegerSchema = z.number().int().positive({
  message: "Must be a positive integer"
});

// Language code validation (ISO 639-1)
export const languageCodeSchema = z.string().length(2, {
  message: "Language code must be 2 characters (ISO 639-1)"
}).toLowerCase();

// Location code validation (numeric)
export const locationCodeSchema = z.number().int().nonnegative({
  message: "Location code must be a non-negative integer"
});

/**
 * Request body schemas for specific endpoints
 */

// Publish to CMS request schema
export const publishToCmsSchema = z.object({
  blog_post_id: uuidSchema,
}).strict(); // Reject unknown fields

// Extract post keywords request schema
export const extractPostKeywordsSchema = z.object({
  blog_post_id: uuidSchema.optional(),
  article_id: uuidSchema.optional(),
  content: z.string().optional(),
  title: z.string().optional(),
}).refine(
  (data) => data.blog_post_id || data.content,
  { message: "Either blog_post_id or content must be provided" }
);

// Fetch keywords request schema
export const fetchKeywordsSchema = z.object({
  keywords: z.array(z.string().min(1)).min(1, {
    message: "Keywords array must contain at least one non-empty string"
  }),
  location_code: locationCodeSchema.optional().default(2840),
  language_code: languageCodeSchema.optional().default("en"),
}).strict();

// Scan website request schema
export const scanWebsiteSchema = z.object({
  url: urlSchema,
}).strict();

// Test CMS connection request schema
export const testCmsConnectionSchema = z.object({
  platform: z.enum([
    "wordpress",
    "ghost",
    "webflow",
    "shopify",
    "hubspot",
    "rest_api",
    "framer",
    "wix",
    "nextjs",
    "notion"
  ], {
    errorMap: () => ({ message: "Invalid CMS platform" })
  }),
  siteUrl: urlSchema.optional(),
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
  accessToken: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  storeId: z.string().optional(),
}).refine(
  (data) => {
    // Framer only needs URL
    if (data.platform === 'framer') {
      return !!data.siteUrl;
    }
    // Wix needs apiKey (API Key) and apiSecret (Site ID)
    if (data.platform === 'wix') {
      return !!(data.apiKey && data.apiSecret);
    }
    // At least one credential field should be present for other platforms
    return !!(data.apiKey || data.apiSecret || data.accessToken || 
              data.username || data.password);
  },
  { message: "At least one credential field is required" }
);

// Generate article request schema
export const generateArticleSchema = z.object({
  title: nonEmptyStringSchema,
  keyword: nonEmptyStringSchema.optional(),
  intent: z.string().optional(),
  websiteUrl: urlSchema.optional(),
}).strict();

// Generate blog post request schema
export const generateBlogPostSchema = z.object({
  blogId: uuidSchema.optional(), // Note: function uses blogId, not blog_id
  scheduledPublishDate: z.string().optional(), // ISO datetime string (flexible validation)
  keyword: nonEmptyStringSchema.optional(),
  article_type: z.record(z.string(), z.boolean()).optional(),
  // Add other fields as needed
}).strict();

// Fetch SEO data request schema
export const fetchSeoDataSchema = z.object({
  keywords: z.array(z.string().min(1)).min(1, {
    message: "Keywords array must contain at least one non-empty string"
  }),
}).strict();

/**
 * Helper function to validate request body and return typed data
 * 
 * @param schema - Zod schema to validate against
 * @param data - Raw request data to validate
 * @returns Validated and typed data
 * @throws ZodError if validation fails
 */
export function validateRequest<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown
): z.infer<T> {
  return schema.parse(data);
}

/**
 * Helper function to validate request body with better error handling
 * Returns a result object instead of throwing
 * 
 * @param schema - Zod schema to validate against
 * @param data - Raw request data to validate
 * @returns Object with success flag and either data or error
 */
export function safeValidateRequest<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown
): { success: true; data: z.infer<T> } | { success: false; error: string; details?: z.ZodError } {
  try {
    const validated = schema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0];
      const errorMessage = firstError?.message || "Validation failed";
      return { success: false, error: errorMessage, details: error };
    }
    return { success: false, error: "Unknown validation error" };
  }
}

/**
 * Create a validation middleware response helper
 * 
 * @param validationResult - Result from safeValidateRequest
 * @param corsHeaders - CORS headers to include in error response
 * @returns Response object if validation failed, null if successful
 */
export function createValidationErrorResponse(
  validationResult: { success: false; error: string; details?: z.ZodError },
  corsHeaders: Record<string, string>
): Response {
  return new Response(
    JSON.stringify({
      error: validationResult.error,
      details: validationResult.details?.errors.map(e => ({
        path: e.path.join('.'),
        message: e.message
      }))
    }),
    {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    }
  );
}

