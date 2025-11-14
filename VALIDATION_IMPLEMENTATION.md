# Input Validation Implementation Guide

## Overview

This document explains how input validation has been implemented using Zod schemas to fix the "Missing Input Validation" security issue (#5).

## What Was Done

### 1. Created Shared Validation Module (`_shared/validation.ts`)

A centralized validation module with:
- **Common schemas**: UUID, URL, non-empty strings, positive integers, language codes, etc.
- **Request body schemas**: Pre-built schemas for each edge function endpoint
- **Helper functions**: `safeValidateRequest()` and `createValidationErrorResponse()` for easy integration

### 2. Updated Functions

- ✅ `publish-to-cms/index.ts` - Validates `blog_post_id` as UUID
- ✅ `extract-post-keywords/index.ts` - Validates optional UUIDs and content fields

## How to Use

### Basic Pattern

```typescript
import { 
  publishToCmsSchema,  // or other schema
  safeValidateRequest, 
  createValidationErrorResponse 
} from "../_shared/validation.ts";

// In your handler:
const requestBody = await req.json();
const validationResult = safeValidateRequest(publishToCmsSchema, requestBody);

if (!validationResult.success) {
  return createValidationErrorResponse(validationResult, corsHeaders);
}

// Use validated data (TypeScript knows the types!)
const { blog_post_id } = validationResult.data;
```

### Available Schemas

#### Common Schemas
- `uuidSchema` - Validates UUID v4 format
- `urlSchema` - Validates URL format (HTTP/HTTPS only)
- `nonEmptyStringSchema` - Non-empty string
- `positiveIntegerSchema` - Positive integer
- `languageCodeSchema` - ISO 639-1 language code
- `locationCodeSchema` - Non-negative integer

#### Request Body Schemas
- `publishToCmsSchema` - For publish-to-cms endpoint
- `extractPostKeywordsSchema` - For extract-post-keywords endpoint
- `fetchKeywordsSchema` - For fetch-keywords endpoint
- `scanWebsiteSchema` - For scan-website endpoint
- `testCmsConnectionSchema` - For test-cms-connection endpoint
- `generateArticleSchema` - For generate-article endpoint
- `generateBlogPostSchema` - For generate-blog-post endpoint
- `fetchSeoDataSchema` - For fetch-seo-data endpoint

## Benefits

1. **Type Safety**: Zod provides TypeScript type inference
2. **Security**: Prevents malformed data, injection attacks, and type errors
3. **Consistency**: All functions use the same validation patterns
4. **Better Errors**: Clear, structured error messages for clients
5. **Maintainability**: Centralized schemas are easy to update

## Next Steps

To complete the fix, update remaining functions:

1. **fetch-keywords/index.ts**
   ```typescript
   import { fetchKeywordsSchema, safeValidateRequest, createValidationErrorResponse } from "../_shared/validation.ts";
   // Replace manual validation with schema validation
   ```

2. **scan-website/index.ts**
   ```typescript
   import { scanWebsiteSchema, safeValidateRequest, createValidationErrorResponse } from "../_shared/validation.ts";
   // Note: URL validation already exists via validateUrl(), but schema ensures format first
   ```

3. **test-cms-connection/index.ts**
   ```typescript
   import { testCmsConnectionSchema, safeValidateRequest, createValidationErrorResponse } from "../_shared/validation.ts";
   ```

4. **generate-article/index.ts**
   ```typescript
   import { generateArticleSchema, safeValidateRequest, createValidationErrorResponse } from "../_shared/validation.ts";
   ```

5. **generate-blog-post/index.ts**
   ```typescript
   import { generateBlogPostSchema, safeValidateRequest, createValidationErrorResponse } from "../_shared/validation.ts";
   ```

6. **fetch-seo-data/index.ts**
   ```typescript
   import { fetchSeoDataSchema, safeValidateRequest, createValidationErrorResponse } from "../_shared/validation.ts";
   ```

## Example: Before vs After

### Before (Vulnerable)
```typescript
const { blog_post_id } = await req.json();

if (!blog_post_id) {
  return new Response(
    JSON.stringify({ error: "blog_post_id is required" }),
    { status: 400 }
  );
}
// ❌ No format validation - accepts "not-a-uuid", SQL injection attempts, etc.
```

### After (Secure)
```typescript
const requestBody = await req.json();
const validationResult = safeValidateRequest(publishToCmsSchema, requestBody);

if (!validationResult.success) {
  return createValidationErrorResponse(validationResult, corsHeaders);
}

const { blog_post_id } = validationResult.data;
// ✅ Guaranteed to be a valid UUID format
```

## Security Impact

- ✅ **Prevents SQL Injection**: Invalid UUIDs rejected before database queries
- ✅ **Prevents Type Confusion**: Ensures correct data types
- ✅ **Prevents Path Traversal**: URL validation blocks malicious paths
- ✅ **Prevents Data Corruption**: Malformed data never reaches business logic
- ✅ **Better Error Handling**: Clear error messages without exposing internals

## Testing

Test validation with invalid inputs:

```bash
# Invalid UUID
curl -X POST https://your-function-url \
  -H "Content-Type: application/json" \
  -d '{"blog_post_id": "not-a-uuid"}'
# Expected: 400 Bad Request with validation error

# Missing required field
curl -X POST https://your-function-url \
  -H "Content-Type: application/json" \
  -d '{}'
# Expected: 400 Bad Request with validation error

# Valid UUID
curl -X POST https://your-function-url \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"blog_post_id": "123e4567-e89b-12d3-a456-426614174000"}'
# Expected: 200 OK (if authenticated and authorized)
```

## Notes

- Zod is imported from Deno's CDN: `https://deno.land/x/zod@v3.22.4/mod.ts`
- All schemas use `.strict()` to reject unknown fields (prevents typos and extra data)
- URL validation still uses `validateUrl()` from `url-validation.ts` for SSRF protection (schema validates format first)
- Error responses include detailed validation errors in development, generic messages in production

