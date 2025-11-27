/**
 * Resend API client for sending emails
 * Provides a shared Resend client instance for all Edge Functions
 */

import { Resend } from "npm:resend@^3.0.0";

/**
 * Get Resend API key from environment variables
 * Supports both production and test keys
 */
function getResendApiKey(): string {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    throw new Error("RESEND_API_KEY environment variable is not set");
  }
  return apiKey;
}

/**
 * Create and return a Resend client instance
 */
export function createResendClient(): Resend {
  const apiKey = getResendApiKey();
  return new Resend(apiKey);
}

/**
 * Get the default "from" email address
 * Uses Resend's test domain for development, or configured domain for production
 */
export function getFromEmail(): string {
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "SearchFuel <onboarding@resend.dev>";
  return fromEmail;
}

/**
 * Get internal notification email address(es)
 * Supports single email or comma-separated list
 */
export function getInternalNotificationEmails(): string[] {
  const emails = Deno.env.get("INTERNAL_NOTIFICATION_EMAILS") || 
                 Deno.env.get("INTERNAL_NOTIFICATION_EMAIL") || 
                 "team@trysearchfuel.com";
  
  // Split by comma and trim whitespace
  return emails.split(",").map(email => email.trim()).filter(email => email.length > 0);
}

