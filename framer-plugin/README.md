# Blog Automation Framer Plugin

This plugin allows you to publish content directly from Framer to your blog automation system.

## Installation

1. **In Framer Desktop App:**
   - Go to Plugins → Development → New Plugin
   - Select the `framer-plugin` folder
   - The plugin will appear in your plugins panel

2. **For Distribution:**
   - Zip the `framer-plugin` folder
   - Submit to Framer Plugin Store (requires Framer account)

## Usage

### Setup
1. Open the plugin in Framer
2. Enter your connection details:
   - **API URL**: Your Supabase project URL (e.g., `https://qihpywleopgrlvwcffvy.supabase.co`)
   - **Email**: Your account email
   - **Password**: Your account password
3. Click "Connect"

### Publishing
1. Enter the **Blog Post ID** from your dashboard
2. Select the content you want to publish in Framer
3. Click "Publish to Blog"
4. The content will be sent to your blog automation system

## Configuration

The plugin stores connection details locally in the browser using `localStorage`. This means:
- ✅ You only need to connect once
- ✅ Credentials are stored securely in your browser
- ⚠️ You'll need to reconnect if you clear browser data

## API Endpoint

The plugin calls:
```
POST /functions/v1/publish-to-cms
```

With Basic Authentication:
```
Authorization: Basic base64(email:password)
```

Request body:
```json
{
  "blog_post_id": "your-post-id",
  "title": "Post Title",
  "content": "Post content from Framer"
}
```

## Development

To modify the plugin:

1. Edit `app.js` for UI and logic changes
2. Edit `index.html` for layout changes
3. Edit `framer.json` to change plugin metadata
4. Refresh the plugin in Framer to see changes

## Troubleshooting

### "Unauthorized" Error
- Check your email and password are correct
- Ensure your API URL is correct (should end with `.supabase.co`)

### "Post not found" Error
- Verify the Blog Post ID is correct
- Check that the post exists in your dashboard

### Connection Issues
- Ensure your API endpoint is accessible
- Check CORS settings on your backend

## Support

For issues or questions, contact your blog automation system administrator.
