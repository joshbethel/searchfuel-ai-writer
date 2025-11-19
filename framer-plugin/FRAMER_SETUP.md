# Framer Plugin Setup & Connection Guide

## Connection Requirements

### 1. Enable Developer Mode in Framer

1. **Open Framer Editor** → Open any project
2. **Main Menu** → Click the menu icon (☰)
3. **Scroll to "Plugins"** → Click it
4. **Enable "Developer Tools"** → Toggle it ON
5. Close the menu

### 2. Load the Development Plugin

1. **Click the Plugins button** in the Framer toolbar (looks like a puzzle piece)
2. Click **"Open Development Plugin"**
3. Enter the plugin URL: **`http://localhost:5174/`**
4. Click **"Load Plugin"** or **"Open"**

### 3. Run the Dev Server

In a terminal, from the `framer-plugin` directory:

```bash
npm run dev
```

This starts the Vite dev server on `http://localhost:5174/`

## Architecture Overview

### Files

- **`framer.json`** - Plugin manifest (v2 format, Framer-recognized configuration)
- **`main.jsx`** - Entry point that initializes the plugin UI
- **`app.jsx`** - React component with the SearchFuel Publisher UI
- **`vite.config.js`** - Build configuration for production builds
- **`index.html`** - DOM template where React mounts

### Key Technologies

- **React 18** - UI library
- **Vite 5.4** - Build tool (instant HMR during dev)
- **Tailwind CSS** - Styling
- **Framer Plugin API** - Global `framer` object injected by Framer editor

## Common Connection Issues

### Issue: Plugin doesn't load in Framer

**Solution:**
1. Verify `npm run dev` is running on port 5174 (or your configured port)
2. Check browser console for errors (F12)
3. Check Framer dev server logs
4. Ensure firewall isn't blocking localhost connections

### Issue: "framer is not defined"

**Solution:**
- The `framer` API is **only available when running inside the Framer editor**
- We use `if (typeof framer !== 'undefined')` check in `main.jsx`
- This is expected behavior during testing

### Issue: UI doesn't appear

**Solution:**
1. Check that `framer.showUI()` is called in `main.jsx`
2. Verify dimensions: `width: 500, height: 600`
3. Look for console errors in browser DevTools

### Issue: Changes not hot-reloading

**Solution:**
- Vite provides HMR (Hot Module Replacement)
- Refresh Framer if updates don't appear
- Check that dev server is running

## Plugin Configuration (`framer.json`)

```json
{
  "pluginVersion": 2,
  "id": "searchfuel-framer-publisher",
  "displayName": "SearchFuel Publisher",
  "description": "Publish your Framer content directly to SearchFuel",
  "permissions": ["web.request"]
}
```

**Important:**
- `pluginVersion: 2` - Current Framer plugin API version
- `permissions` - Required for making API calls to SearchFuel servers
- `web.request` - Allows fetch/XMLHttpRequest to external APIs

## Building for Production

```bash
npm run build
```

Creates optimized build in `dist/` directory. Framer uses these files when you publish the plugin.

## Deployment to Framer Marketplace

Once ready to publish:

1. Run `npm run build`
2. Follow [Framer Publishing Guide](https://www.framer.com/developers/publishing)
3. Submit through Framer Plugins Dashboard

## Testing the Connection

### In Development:

1. Start dev server: `npm run dev`
2. Load plugin in Framer: Plugins → Open Development Plugin → `http://localhost:5174/`
3. Test UI appears and responds to input

### API Connection:

1. Verify SearchFuel API credentials work
2. Test with mock data first (currently uses mock fetch)
3. Replace `webHookUrl` in app.jsx with actual SearchFuel endpoint when ready

## API Reference

### Available Framer APIs in Plugin

```javascript
// UI Control
framer.showUI({ width: 500, height: 600 });
framer.closePlugin();

// Selection
framer.getSelection(); // Get selected layers
framer.setSelection(nodeIds); // Set selection

// Assets
framer.addImage(imageAsset);
framer.uploadFile(file);

// Nodes
framer.getNode(nodeId);
framer.setAttributes(nodeId, attributes);

// Network (with web.request permission)
fetch(url, options); // Standard fetch API
```

See [Framer Plugin API Reference](https://www.framer.com/developers/reference) for complete documentation.

## Troubleshooting Checklist

- [ ] Developer Tools enabled in Framer
- [ ] `npm run dev` running on correct port
- [ ] URL entered correctly in "Open Development Plugin"
- [ ] Browser console shows no errors (F12)
- [ ] Plugin window appears in Framer
- [ ] SearchFuel API credentials are correct
- [ ] Network requests complete successfully (check Network tab)

## Next Steps

1. **Test API connection** - Connect with actual SearchFuel credentials
2. **Implement selection API** - Get selected Framer layers
3. **Add content mapping** - Map Framer content to SearchFuel fields
4. **Build & publish** - Prepare for Framer Marketplace

---

**Questions?** Check [Framer Developer Docs](https://www.framer.com/developers/)
