# SearchFuel Framer Plugin - Complete Setup Guide

## 📋 Overview

The SearchFuel Framer Plugin is a modern, production-ready React plugin for publishing content from Framer to the SearchFuel blog automation platform.

### ✨ Key Features

- **React 18 + Vite** - Modern development experience
- **Bearer Token Auth** - Secure API authentication
- **localStorage** - Persistent connection settings
- **Component-Based** - Reusable UI components
- **Error Handling** - Comprehensive validation & errors
- **Responsive Design** - Works on all devices
- **Zero Dependencies** - (besides React & ReactDOM)

---

## 🚀 Setup & Development

### 1. Installation

```bash
cd framer-plugin
npm install
```

### 2. Development Server

```bash
npm run dev
```

Starts Vite dev server at `http://localhost:5173`

### 3. Production Build

```bash
npm run build
```

Creates optimized bundle in `dist/` folder

### 4. Preview Production Build

```bash
npm run preview
```

---

## 📁 Project Structure

```
framer-plugin/
│
├── Core Files
│   ├── index.html              # HTML template
│   ├── main.jsx                # React app entry point
│   ├── app.js                  # Main SearchFuel component (default export)
│   └── styles.css              # Global CSS
│
├── Configuration
│   ├── framer.json             # Plugin manifest (Framer v2)
│   ├── package.json            # Dependencies & scripts
│   ├── vite.config.js          # Vite build config
│   ├── tailwind.config.js      # Tailwind CSS config
│   └── postcss.config.js       # PostCSS plugins
│
├── Build Output
│   └── dist/                   # Production bundle (generated)
│
└── Documentation
    └── README.md               # This file

```

---

## 🎨 Architecture

### Component Tree

```
SearchFuelPublisher (Main App)
│
├─ StatusMessage
│  ├─ Success state
│  └─ Error state
│
├─ Form States
│  ├─ Connection Form
│  │  ├─ InputField (API URL)
│  │  ├─ InputField (API Key)
│  │  ├─ Button (Connect)
│  │  └─ HelpBox
│  │
│  └─ Publishing Form
│     ├─ ConnectionInfo
│     ├─ InputField (Blog Post ID)
│     ├─ Button (Publish)
│     ├─ Button (Disconnect)
│     └─ HelpBox
```

### State Management

```javascript
// Plugin state
config = {
  apiUrl: string,       // SearchFuel API URL
  apiKey: string,       // Bearer token
  blogId: string        // Target blog post ID
}

isConnected = boolean   // Auth state
status = {
  type: 'success' | 'error',
  message: string
}
isPublishing = boolean  // Loading state
selectedContent = any   // Framer selection data
```

### Data Flow

```
User Input
   ↓
Validation ← ← ← ← ← ← ← ← ← Error → Show Error
   ↓
Store in localStorage
   ↓
Update UI
   ↓
Make API Request
   ↓
Handle Response
   ↓
Update Status & Show Message
```

---

## 🔌 API Integration

### Authentication Method

**Bearer Token (Recommended)**

```javascript
headers: {
  'Authorization': `Bearer ${config.apiKey}`,
  'Content-Type': 'application/json'
}
```

### Webhook Endpoint

**URL**: `/api/framer-publish`  
**Method**: `POST`

#### Request Payload

```json
{
  "blog_post_id": "uuid-string",
  "source": "framer-plugin",
  "timestamp": "ISO-8601-datetime"
}
```

#### Response (Success)

```json
{
  "success": true,
  "post_id": "uuid",
  "published_at": "2024-11-19T10:30:00Z",
  "message": "Content published successfully"
}
```

#### Response (Error)

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

---

## 📦 Dependencies

### Production Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| react | ^18.3.1 | UI Framework |
| react-dom | ^18.3.1 | DOM Rendering |

### Development Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| vite | ^5.4.19 | Build Tool |
| @vitejs/plugin-react | ^4.2.1 | React Support |
| tailwindcss | ^3.4.17 | CSS Utility |
| postcss | ^8.5.6 | CSS Transform |
| autoprefixer | ^10.4.21 | Vendor Prefixes |
| @types/react | ^18.3.23 | Type Definitions |
| @types/react-dom | ^18.3.7 | Type Definitions |

---

## 🎯 Component Documentation

### SearchFuelPublisher (Main)

**Export**: Default export  
**Type**: React Functional Component

Main application component managing all state and UI.

```javascript
export default function SearchFuelPublisher() {
  // State management
  // Event handlers
  // Render logic
}
```

### StatusMessage

Displays success or error messages.

```javascript
<StatusMessage 
  type="success" | "error"
  message="Message text"
/>
```

### InputField

Reusable labeled input component.

```javascript
<InputField
  label="Field Label"
  placeholder="Placeholder text"
  type="text" | "password" | "email"
  value={string}
  onChange={(value) => {}}
  helpText="Optional help text"
/>
```

### Button

Reusable button component.

```javascript
<Button
  onClick={() => {}}
  disabled={boolean}
  variant="primary" | "secondary"
>
  Button Text
</Button>
```

### ConnectionInfo

Shows current connection details.

```javascript
<ConnectionInfo 
  email={string}      // Actually apiUrl
  apiUrl={string}     // Actually apiKey (placeholder display)
/>
```

### HelpBox

Displays usage instructions.

```javascript
<HelpBox />
```

---

## 🔐 Security

### Credential Storage

✅ **Browser localStorage** - Stored locally on user's machine  
✅ **No server-side storage** - No sensitive data on server  
✅ **HTTPS only** - Use HTTPS for all API communication

### Credential Format

```javascript
localStorage.setItem('searchfuelConfig', JSON.stringify({
  apiUrl: "https://your-instance.com",
  apiKey: "sk_live_xxxxxxxxxxxxxxxx",
  blogId: "uuid-of-blog-post"
}));
```

### Best Practices

- ❌ Never log credentials to console
- ❌ Never send credentials unencrypted
- ✅ Always validate API responses
- ✅ Always use HTTPS in production
- ✅ Implement CORS properly on backend
- ✅ Rotate API keys regularly

---

## 🎨 Styling

### Color Palette

```javascript
const colors = {
  primary: "#0099ff",      // Main actions
  text: "#1f2937",         // Primary text
  textSecondary: "#6b7280", // Secondary text
  bg: "#ffffff",           // Background
  success: {
    bg: "#d1fae5",
    text: "#065f46"
  },
  error: {
    bg: "#fee2e2",
    text: "#991b1b"
  },
  border: "#d1d5db",
  borderLight: "#e5e7eb",
  bgLight: "#f9fafb"
};
```

### Styling Approach

1. **Inline CSS** - Component-scoped styles using `style={{}}` prop
2. **CSS File** - Global styles in `styles.css`
3. **Tailwind** - Optional utility classes (configured but not required)

---

## 🧪 Testing

### Manual Testing Checklist

#### Connection
- [ ] Enter valid API URL
- [ ] Enter valid API Key
- [ ] Click "Connect" → Success message
- [ ] Connection info displays correctly

#### Disconnection
- [ ] Click "Disconnect"
- [ ] Connection cleared
- [ ] Form resets to initial state

#### Publishing
- [ ] Enter Blog Post ID
- [ ] Click "Publish"
- [ ] Loading state shows ("Publishing...")
- [ ] Success/Error message displays

#### Validation
- [ ] Empty API URL → Error message
- [ ] Invalid URL format → Error message
- [ ] Invalid API Key → Error message
- [ ] Empty Blog ID → Error message

#### Error Handling
- [ ] Invalid API endpoint → API error message
- [ ] Network timeout → Error message
- [ ] Server error → Error message shown

---

## 🚀 Deployment

### Step 1: Build Plugin

```bash
npm run build
```

Creates `dist/` folder with production bundle.

### Step 2: Prepare for Distribution

Create ZIP file including:
```
framer-plugin/
├── dist/               ✅ Include
├── framer.json         ✅ Include
├── index.html          ✅ Include
├── main.jsx            ✅ Include
├── app.js              ✅ Include
├── styles.css          ✅ Include
├── package.json        ✅ Include
├── README.md           ✅ Include
└── node_modules/       ❌ Exclude
```

### Step 3: Submit to Framer Store

1. Open Framer Studio
2. Go to Plugins → Publish
3. Upload ZIP file
4. Fill metadata:
   - Name: SearchFuel Publisher
   - Description: [From framer.json]
   - Author: SearchFuel Team
5. Submit for review

### Step 4: Installation for Users

Users in Framer Studio:
- Go to Plugins → Browse
- Search "SearchFuel"
- Click Install
- Plugin appears in sidebar

---

## 🔄 Development Workflow

### Local Development

```bash
# Start dev server
npm run dev

# Make changes to components
# Changes hot-reload in browser

# Test in Framer Studio
# Development → Plugin Folder
```

### Building for Production

```bash
# Build optimized bundle
npm run build

# Preview before shipping
npm run preview

# Create distribution ZIP
# Submit to Framer
```

---

## 🐛 Troubleshooting

### Plugin Not Loading

**Problem**: Plugin doesn't appear in Framer  
**Solution**: 
- Clear browser cache
- Reload Framer
- Check console for errors

### Connection Errors

**Problem**: "401 Unauthorized"  
**Solution**:
- Verify API Key is correct
- Check API URL format
- Ensure endpoint exists

**Problem**: "CORS Error"  
**Solution**:
- Verify backend allows CORS
- Check Access-Control headers
- Test from different network

### Build Errors

**Problem**: Module not found  
**Solution**:
```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

**Problem**: Vite cache issues  
**Solution**:
```bash
rm -rf dist .vite
npm run build
```

---

## 📚 Resources

### Official Documentation
- [Framer Plugin API](https://www.framer.com/plugin-api)
- [Framer Manifest](https://www.framer.com/docs/plugins/#manifest)
- [React Documentation](https://react.dev)
- [Vite Guide](https://vitejs.dev)

### Framer Plugin Examples
- [Framer Plugins Repository](https://github.com/framer/plugins)
- [Sample Plugin](https://github.com/framer/plugins/tree/main/plugins)

---

## 🔄 Future Roadmap

### Phase 1 (Current)
- ✅ Basic React plugin
- ✅ API authentication
- ✅ Publishing flow
- ✅ Error handling

### Phase 2 (Planned)
- [ ] TypeScript migration
- [ ] Full Framer SDK integration
- [ ] Content preview
- [ ] Batch publishing

### Phase 3 (Future)
- [ ] OAuth 2.0
- [ ] Analytics dashboard
- [ ] Custom branding
- [ ] Multi-language support

---

## 📞 Support

### Getting Help

1. **Check Framer Console** - Look for plugin errors
2. **Browser DevTools** - Debug network requests
3. **Check API Endpoint** - Ensure backend is accessible
4. **Contact Support** - Email support@trysearchfuel.com

### Debug Mode

Add to `app.js` for debugging:

```javascript
// Debug API calls
console.log('Publishing to:', `${config.apiUrl}/api/framer-publish`);
console.log('Payload:', JSON.stringify(payload, null, 2));

// Debug state changes
console.log('New config:', config);
console.log('Connected:', isConnected);
```

---

## 📄 License

Part of SearchFuel Platform. All rights reserved.

---

**Last Updated**: November 2024  
**Plugin Version**: 1.0.0  
**React Version**: 18.3.1  
**Framer Plugin Format**: v2  
**Status**: ✅ Production Ready
