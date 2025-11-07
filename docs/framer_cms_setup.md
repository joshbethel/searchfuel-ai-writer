# Framer CMS Automated Connection Guide

This guide explains how to automatically connect your Framer CMS to the blog automation system.

## Prerequisites

1. **Framer Pro Plan** - Framer CMS API access requires a Pro or Team plan
2. **Published Framer Site** - Your site must be published
3. **CMS Collection** - You must have created at least one CMS collection

## Getting Your Credentials

### Step 1: Get Your API Token

1. Log into your [Framer Account](https://www.framer.com/)
2. Go to **Settings** → **API**
3. Click **Generate New Token**
4. Give it a descriptive name (e.g., "Blog Automation")
5. Copy the token immediately (you won't be able to see it again)

### Step 2: Get Your Collection ID

1. Open your Framer project
2. Go to **CMS** section
3. Select the collection you want to use for blog posts
4. Open collection settings
5. Copy the **Collection ID** (it's usually shown in the URL or settings panel)

## Connecting in the Dashboard

When you connect Framer CMS in the dashboard, you'll need:

1. **Site URL**: Your published Framer site URL (e.g., `https://yoursite.framer.website`)
2. **Collection ID** (entered in the "API Key" field): Your CMS collection identifier
3. **API Token** (entered in the "Access Token" field): Your Framer API token

## Collection Field Requirements

For automated publishing to work correctly, your Framer CMS collection should have these fields:

### Required Fields
- `title` (Text) - Article title
- `slug` (Text) - URL-friendly slug
- `content` (Rich Text or Long Text) - Main article content
- `publishedAt` (Date) - Publication date

### Recommended Fields
- `excerpt` (Text) - Short description
- `metaTitle` (Text) - SEO title
- `metaDescription` (Text) - SEO description
- `featuredImage` (Image or Link) - Article image

## Automated Publishing Flow

Once connected, the system will:

1. ✅ **Automatically generate** blog posts based on your settings
2. ✅ **Convert** markdown content to appropriate format
3. ✅ **Add SEO metadata** (title, description)
4. ✅ **Publish directly** to your Framer CMS collection
5. ✅ **Track status** of each published article

## Troubleshooting

### Connection Failed
- Verify your API token is valid and hasn't expired
- Ensure you have the correct Collection ID
- Check that your Framer plan includes API access

### Publishing Failed (401 Error)
- Your API token may have been revoked or expired
- Reconnect your Framer CMS with a new token

### Publishing Failed (404 Error)
- The Collection ID is incorrect
- The collection may have been deleted
- Verify the Collection ID in your Framer CMS settings

### Content Not Displaying
- Check that your collection fields match the required field names
- Verify your Framer site is published
- Review the Framer CMS settings for the collection

## API Rate Limits

Framer API has rate limits:
- **100 requests per minute** for Pro plans
- **500 requests per minute** for Team plans

The automation system respects these limits and will handle rate limiting gracefully.

## Security Notes

- ✅ API tokens are stored securely in the database
- ✅ Tokens are never exposed in the frontend
- ✅ All API calls are made server-side via edge functions
- ⚠️ Never commit API tokens to version control
- ⚠️ Regenerate tokens if you suspect they've been compromised

## Support

For Framer-specific API documentation, visit:
- [Framer Developers](https://www.framer.com/developers)
- [Framer API Docs](https://www.framer.com/developers/cms)

For issues with the automation system, check the dashboard logs or contact support.
