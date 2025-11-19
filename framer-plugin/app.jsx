import React, { useState, useEffect } from "react";
import "./styles.css";

/**
 * SearchFuel Framer Plugin
 * Publish content from Framer to SearchFuel blog automation system
 * 
 * Note: The `framer` API is globally available in the plugin context
 */

// Status Message Component
function StatusMessage({ type, message }) {
  if (!message) return null;

  const bgColor = type === "success" ? "#d1fae5" : "#fee2e2";
  const textColor = type === "success" ? "#065f46" : "#991b1b";

  return (
    <div
      style={{
        padding: "12px",
        borderRadius: "8px",
        marginBottom: "16px",
        fontSize: "13px",
        backgroundColor: bgColor,
        color: textColor,
        border: `1px solid ${type === "success" ? "#a7f3d0" : "#fecaca"}`,
      }}
    >
      {type === "success" ? "✓ " : "✕ "}
      {message}
    </div>
  );
}

// Input Field Component
function InputField({ label, placeholder, type = "text", value, onChange, helpText }) {
  return (
    <div style={{ marginBottom: "16px" }}>
      <label style={styles.label}>{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={styles.input}
      />
      {helpText && <p style={styles.helpText}>{helpText}</p>}
    </div>
  );
}

// Button Component
function Button({ onClick, disabled = false, variant = "primary", children }) {
  const baseStyle = {
    width: "100%",
    padding: "12px 16px",
    borderRadius: "8px",
    border: "none",
    fontSize: "14px",
    fontWeight: "600",
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "all 0.2s ease",
    opacity: disabled ? 0.6 : 1,
  };

  const variantStyles = {
    primary: {
      backgroundColor: "#0099ff",
      color: "white",
      "&:hover": { backgroundColor: "#0077cc" },
    },
    secondary: {
      backgroundColor: "#f3f4f6",
      color: "#374151",
      "&:hover": { backgroundColor: "#e5e7eb" },
    },
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...baseStyle,
        ...(variant === "primary" ? variantStyles.primary : variantStyles.secondary),
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.target.style.backgroundColor =
            variant === "primary" ? "#0077cc" : "#e5e7eb";
        }
      }}
      onMouseLeave={(e) => {
        e.target.style.backgroundColor =
          variant === "primary" ? "#0099ff" : "#f3f4f6";
      }}
    >
      {children}
    </button>
  );
}

// Connection Info Component
function ConnectionInfo({ email, apiUrl }) {
  return (
    <div
      style={{
        padding: "12px",
        backgroundColor: "#f9fafb",
        borderRadius: "8px",
        marginBottom: "16px",
        fontSize: "13px",
        border: "1px solid #e5e7eb",
      }}
    >
      <div style={{ marginBottom: "8px" }}>
        <strong>✓ Connected as:</strong>
      </div>
      <div style={{ marginBottom: "4px", color: "#1f2937" }}>{email}</div>
      <div style={{ color: "#6b7280", fontSize: "12px", wordBreak: "break-all" }}>
        {apiUrl}
      </div>
    </div>
  );
}

// Help Box Component
function HelpBox() {
  return (
    <div
      style={{
        marginTop: "24px",
        padding: "12px",
        backgroundColor: "#fffbeb",
        border: "1px solid #fef3c7",
        borderRadius: "8px",
        fontSize: "12px",
        color: "#92400e",
      }}
    >
      <strong>📝 How to use:</strong>
      <ol style={{ margin: "8px 0 0 16px", paddingLeft: "8px" }}>
        <li>Connect with your SearchFuel account credentials</li>
        <li>Select the content you want to publish in Framer</li>
        <li>Enter your Blog Post ID from the dashboard</li>
        <li>Click "Publish to SearchFuel"</li>
        <li>Track your content performance in the SearchFuel dashboard</li>
      </ol>
    </div>
  );
}

// Main App Component
export default function SearchFuelPublisher() {
  const [config, setConfig] = useState({
    apiUrl: "",
    apiKey: "",
    blogId: "",
  });

  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [isPublishing, setIsPublishing] = useState(false);
  const [selectedContent, setSelectedContent] = useState(null);

  // Load saved config from localStorage on mount
  useEffect(() => {
    try {
      const savedConfig = localStorage.getItem("searchfuelConfig");
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        setConfig(parsed);
        setIsConnected(!!parsed.apiUrl && !!parsed.apiKey);
      }
    } catch (error) {
      console.error("Error loading config:", error);
    }
  }, []);

  // Handle config field changes
  const handleConfigChange = (field, value) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  // Validate and save connection
  const handleConnect = () => {
    // Validation
    if (!config.apiUrl || !config.apiKey) {
      setStatus({
        type: "error",
        message: "Please enter both API URL and API Key",
      });
      return;
    }

    // Validate URL format
    try {
      new URL(config.apiUrl);
    } catch {
      setStatus({
        type: "error",
        message: "Please enter a valid API URL (e.g., https://your-site.com)",
      });
      return;
    }

    // Save config to localStorage
    try {
      localStorage.setItem("searchfuelConfig", JSON.stringify(config));
      setIsConnected(true);
      setStatus({
        type: "success",
        message: "✓ Connected to SearchFuel successfully!",
      });
    } catch (error) {
      setStatus({
        type: "error",
        message: "Failed to save connection settings",
      });
    }
  };

  // Handle disconnect
  const handleDisconnect = () => {
    try {
      localStorage.removeItem("searchfuelConfig");
      setConfig({ apiUrl: "", apiKey: "", blogId: "" });
      setIsConnected(false);
      setStatus({ type: "", message: "" });
      setSelectedContent(null);
    } catch (error) {
      setStatus({
        type: "error",
        message: "Failed to disconnect",
      });
    }
  };

  // Handle publish
  const handlePublish = async () => {
    // Validation
    if (!config.blogId) {
      setStatus({
        type: "error",
        message: "Please enter your Blog Post ID",
      });
      return;
    }

    setIsPublishing(true);
    setStatus({ type: "", message: "" });

    try {
      // Note: In a real Framer plugin, you would use framer.getSelection()
      // to get the current selection. For now, we'll use a mock request.

      const apiUrl = config.apiUrl.replace(/\/$/, ""); // Remove trailing slash
      const webhookUrl = `${apiUrl}/api/framer-publish`;

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          blog_post_id: config.blogId,
          source: "framer-plugin",
          timestamp: new Date().toISOString(),
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setStatus({
          type: "success",
          message: `✓ Published successfully! Post ID: ${result.post_id || config.blogId}`,
        });
        setSelectedContent(null);
      } else {
        setStatus({
          type: "error",
          message: result.error || "Failed to publish content",
        });
      }
    } catch (error) {
      setStatus({
        type: "error",
        message: `Error: ${error.message || "Unable to reach SearchFuel server"}`,
      });
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>SearchFuel Publisher</h1>
        <p style={styles.subtitle}>Publish to your blog automation system</p>
      </div>

      {/* Status Message */}
      <StatusMessage type={status.type} message={status.message} />

      {/* Connection State */}
      {!isConnected ? (
        // Connection Form
        <div style={styles.form}>
          <InputField
            label="API URL"
            placeholder="https://your-searchfuel-instance.com"
            value={config.apiUrl}
            onChange={(value) => handleConfigChange("apiUrl", value)}
            helpText="Your SearchFuel server URL"
          />

          <InputField
            label="API Key"
            placeholder="sk_live_xxxxxxxxxxxxxxxx"
            type="password"
            value={config.apiKey}
            onChange={(value) => handleConfigChange("apiKey", value)}
            helpText="Get this from Settings → API Keys in SearchFuel"
          />

          <Button onClick={handleConnect} variant="primary">
            Connect to SearchFuel
          </Button>

          <div
            style={{
              marginTop: "16px",
              padding: "12px",
              backgroundColor: "#f0f9ff",
              border: "1px solid #bfdbfe",
              borderRadius: "8px",
              fontSize: "12px",
              color: "#1e40af",
            }}
          >
            <strong>💡 First time here?</strong>
            <p style={{ marginTop: "4px" }}>
              Create a free account at{" "}
              <a
                href="https://app.trysearchfuel.com/signup"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#0099ff", textDecoration: "none" }}
              >
                SearchFuel
              </a>{" "}
              and generate your API key
            </p>
          </div>
        </div>
      ) : (
        // Publishing Form
        <div style={styles.form}>
          <ConnectionInfo email={config.apiUrl} apiUrl={config.apiKey} />

          <InputField
            label="Blog Post ID"
            placeholder="Enter your blog post ID from SearchFuel"
            value={config.blogId}
            onChange={(value) => handleConfigChange("blogId", value)}
            helpText="Find this in your SearchFuel dashboard"
          />

          <Button
            onClick={handlePublish}
            disabled={isPublishing || !config.blogId}
            variant="primary"
          >
            {isPublishing ? "Publishing..." : "Publish to SearchFuel"}
          </Button>

          <div style={{ marginTop: "8px", marginBottom: "8px" }}>
            <Button onClick={handleDisconnect} variant="secondary">
              Disconnect
            </Button>
          </div>

          <HelpBox />
        </div>
      )}
    </div>
  );
}

// Styles object
const styles = {
  container: {
    padding: "20px",
    maxWidth: "500px",
    margin: "0 auto",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  },
  header: {
    marginBottom: "24px",
  },
  title: {
    fontSize: "20px",
    fontWeight: "700",
    margin: "0 0 4px 0",
    color: "#1f2937",
  },
  subtitle: {
    fontSize: "13px",
    color: "#6b7280",
    margin: 0,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "0",
  },
  label: {
    display: "block",
    fontSize: "13px",
    fontWeight: "600",
    marginBottom: "8px",
    color: "#374151",
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    fontSize: "13px",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    fontFamily: "inherit",
    transition: "border-color 0.2s, box-shadow 0.2s",
  },
  helpText: {
    fontSize: "11px",
    color: "#6b7280",
    marginTop: "4px",
    margin: "4px 0 0 0",
  },
};
