import React from "react";
import ReactDOM from "react-dom/client";
import SearchFuelPublisher from "./app.jsx";

/**
 * Main entry point for SearchFuel Framer Plugin
 * Initializes the Framer Plugin with React UI
 * 
 * The framer API is injected globally when running in the Framer editor
 */

// Show the plugin UI in Framer (framer is globally available)
if (typeof framer !== 'undefined') {
  framer.showUI({
    width: 500,
    height: 600,
  });
}

// Create and render React root
const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(
  <React.StrictMode>
    <SearchFuelPublisher />
  </React.StrictMode>
);
