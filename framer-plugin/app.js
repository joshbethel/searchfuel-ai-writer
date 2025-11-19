const { useState, useEffect } = React;

function App() {
  const [config, setConfig] = useState({
    apiUrl: '',
    email: '',
    password: '',
    blogId: ''
  });
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });
  const [publishing, setPublishing] = useState(false);

  // Load saved config from localStorage
  useEffect(() => {
    const savedConfig = localStorage.getItem('blogAutomationConfig');
    if (savedConfig) {
      const parsed = JSON.parse(savedConfig);
      setConfig(parsed);
      setIsConnected(!!parsed.apiUrl && !!parsed.email);
    }
  }, []);

  const handleConfigChange = (field, value) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleConnect = () => {
    if (!config.apiUrl || !config.email || !config.password) {
      setStatus({ type: 'error', message: 'Please fill in all connection fields' });
      return;
    }

    // Save config
    localStorage.setItem('blogAutomationConfig', JSON.stringify(config));
    setIsConnected(true);
    setStatus({ type: 'success', message: 'Connected successfully!' });
  };

  const handleDisconnect = () => {
    localStorage.removeItem('blogAutomationConfig');
    setConfig({ apiUrl: '', email: '', password: '', blogId: '' });
    setIsConnected(false);
    setStatus({ type: '', message: '' });
  };

  const handlePublish = async () => {
    if (!config.blogId) {
      setStatus({ type: 'error', message: 'Please enter your Blog ID' });
      return;
    }

    setPublishing(true);
    setStatus({ type: '', message: '' });

    try {
      // Get current selection from Framer
      const selection = await framer.getSelection();
      
      if (!selection || selection.length === 0) {
        setStatus({ type: 'error', message: 'Please select a blog post in Framer' });
        setPublishing(false);
        return;
      }

      // Get the selected node data
      const node = selection[0];
      const nodeData = await framer.getNode(node);

      // Extract content from the node
      const title = nodeData.name || 'Untitled Post';
      const content = nodeData.text || '';

      // Create Basic Auth header
      const credentials = btoa(`${config.email}:${config.password}`);
      
      // Call your publish API
      const response = await fetch(`${config.apiUrl}/functions/v1/publish-to-cms`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          blog_post_id: config.blogId,
          title: title,
          content: content
        })
      });

      const result = await response.json();

      if (response.ok) {
        setStatus({ 
          type: 'success', 
          message: `Published successfully! Post ID: ${result.external_post_id || 'N/A'}` 
        });
      } else {
        setStatus({ 
          type: 'error', 
          message: result.error || 'Failed to publish' 
        });
      }
    } catch (error) {
      setStatus({ 
        type: 'error', 
        message: `Error: ${error.message}` 
      });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>
        Blog Automation Publisher
      </h1>

      {status.message && (
        <div className={`status ${status.type === 'success' ? 'status-success' : 'status-error'}`}>
          {status.message}
        </div>
      )}

      {!isConnected ? (
        <div>
          <div style={{ marginBottom: '16px' }}>
            <label className="label">API URL</label>
            <input
              type="text"
              className="input"
              placeholder="https://your-project.supabase.co"
              value={config.apiUrl}
              onChange={(e) => handleConfigChange('apiUrl', e.target.value)}
            />
            <p style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
              Your Supabase project URL
            </p>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label className="label">Email</label>
            <input
              type="email"
              className="input"
              placeholder="your@email.com"
              value={config.email}
              onChange={(e) => handleConfigChange('email', e.target.value)}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label className="label">Password</label>
            <input
              type="password"
              className="input"
              placeholder="Your password"
              value={config.password}
              onChange={(e) => handleConfigChange('password', e.target.value)}
            />
          </div>

          <button 
            className="btn btn-primary" 
            style={{ width: '100%' }}
            onClick={handleConnect}
          >
            Connect
          </button>
        </div>
      ) : (
        <div>
          <div style={{ 
            padding: '12px', 
            background: '#f9fafb', 
            borderRadius: '6px',
            marginBottom: '16px',
            fontSize: '13px'
          }}>
            <div style={{ marginBottom: '4px' }}>
              <strong>Connected as:</strong> {config.email}
            </div>
            <div style={{ color: '#6b7280' }}>
              {config.apiUrl}
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label className="label">Blog Post ID</label>
            <input
              type="text"
              className="input"
              placeholder="Enter your blog post ID"
              value={config.blogId}
              onChange={(e) => handleConfigChange('blogId', e.target.value)}
            />
            <p style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
              Get this from your blog dashboard
            </p>
          </div>

          <button 
            className="btn btn-primary" 
            style={{ width: '100%', marginBottom: '8px' }}
            onClick={handlePublish}
            disabled={publishing}
          >
            {publishing ? 'Publishing...' : 'Publish to Blog'}
          </button>

          <button 
            className="btn btn-secondary" 
            style={{ width: '100%' }}
            onClick={handleDisconnect}
          >
            Disconnect
          </button>
        </div>
      )}

      <div style={{ 
        marginTop: '24px', 
        padding: '12px', 
        background: '#fffbeb',
        border: '1px solid #fef3c7',
        borderRadius: '6px',
        fontSize: '12px',
        color: '#92400e'
      }}>
        <strong>How to use:</strong>
        <ol style={{ margin: '8px 0 0 16px', padding: 0 }}>
          <li>Connect with your credentials</li>
          <li>Enter your blog post ID</li>
          <li>Select content in Framer</li>
          <li>Click "Publish to Blog"</li>
        </ol>
      </div>
    </div>
  );
}

ReactDOM.render(<App />, document.getElementById('root'));
