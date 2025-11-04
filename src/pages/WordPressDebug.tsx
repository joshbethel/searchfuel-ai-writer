import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, Loader2, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface TestResult {
  type: 'success' | 'error' | 'info';
  message: string;
  details?: string;
}

export default function WordPressDebug() {
  const navigate = useNavigate();
  const [siteUrl, setSiteUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [postTitle, setPostTitle] = useState("Test Post from SearchFuel");
  const [postContent, setPostContent] = useState("This is a test post created by SearchFuel to verify the WordPress REST API connection.");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);

  const addResult = (type: TestResult['type'], message: string, details?: string) => {
    setResults(prev => [...prev, { type, message, details }]);
  };

  const clearResults = () => {
    setResults([]);
  };

  const runTests = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    clearResults();

    const cleanSiteUrl = siteUrl.replace(/\/$/, '');

    addResult('info', '🔄 Starting WordPress connection tests...');

    try {
      // Test 1: WordPress REST API Accessibility
      addResult('info', '🧪 Test 1: WordPress REST API Accessibility');
      try {
        const apiTestUrl = `${cleanSiteUrl}/wp-json/wp/v2`;
        const apiResponse = await fetch(apiTestUrl);

        if (apiResponse.ok) {
          addResult('success', '✅ WordPress REST API is accessible');
          const apiData = await apiResponse.json();
          addResult('info', `API Info: ${apiData.name || 'WordPress Site'}`, JSON.stringify({
            name: apiData.name,
            description: apiData.description,
            url: apiData.url,
            routes: Object.keys(apiData.routes || {}).length + ' routes available'
          }, null, 2));
        } else {
          addResult('error', `❌ WordPress REST API not accessible (Status: ${apiResponse.status})`);
          return;
        }
      } catch (error: any) {
        addResult('error', `❌ Cannot reach WordPress site: ${error.message}`);
        return;
      }

      // Test 2: Authentication Test
      addResult('info', '🔐 Test 2: Authentication Test');
      try {
        const authTestUrl = `${cleanSiteUrl}/wp-json/wp/v2/posts?per_page=1`;
        const authHeader = 'Basic ' + btoa(username + ':' + password);

        const authResponse = await fetch(authTestUrl, {
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json'
          }
        });

        if (authResponse.ok) {
          addResult('success', '✅ Authentication successful');
          const posts = await authResponse.json();
          addResult('info', `Found ${posts.length} existing posts`);
        } else if (authResponse.status === 401) {
          addResult('error', '❌ Authentication failed - check username and password');
          const errorText = await authResponse.text();
          addResult('error', 'Error details:', errorText);
          return;
        } else if (authResponse.status === 403) {
          addResult('error', '❌ User doesn\'t have permission to access posts');
          return;
        } else {
          addResult('error', `❌ Authentication test failed (Status: ${authResponse.status})`);
          return;
        }
      } catch (error: any) {
        addResult('error', `❌ Authentication test error: ${error.message}`);
        return;
      }

      // Test 3: Post Creation Test
      addResult('info', '📝 Test 3: Post Creation Test');
      try {
        const createPostUrl = `${cleanSiteUrl}/wp-json/wp/v2/posts`;
        const authHeader = 'Basic ' + btoa(username + ':' + password);

        const postData = {
          title: postTitle,
          content: postContent,
          status: 'draft', // Create as draft first
          excerpt: 'Test post created by SearchFuel debug tool'
        };

        const createResponse = await fetch(createPostUrl, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(postData)
        });

        if (createResponse.ok) {
          const newPost = await createResponse.json();
          addResult('success', '✅ Post creation successful!');
          addResult('info', 'Created post details:', `ID: ${newPost.id}
Title: ${newPost.title.rendered}
Status: ${newPost.status}
URL: ${newPost.link}
Date: ${newPost.date}`);

          // Test 4: Post Publishing Test
          addResult('info', '🚀 Test 4: Post Publishing Test');
          try {
            const publishUrl = `${cleanSiteUrl}/wp-json/wp/v2/posts/${newPost.id}`;
            const publishResponse = await fetch(publishUrl, {
              method: 'POST',
              headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ status: 'publish' })
            });

            if (publishResponse.ok) {
              const publishedPost = await publishResponse.json();
              addResult('success', '✅ Post publishing successful!');
              addResult('success', `Published post URL: ${publishedPost.link}`);
              addResult('success', '🎉 All tests passed! Your WordPress setup is working correctly.');
            } else {
              addResult('error', `❌ Post publishing failed (Status: ${publishResponse.status})`);
              const publishError = await publishResponse.text();
              addResult('error', 'Publish Error:', publishError);
            }
          } catch (error: any) {
            addResult('error', `❌ Post publishing error: ${error.message}`);
          }

        } else {
          addResult('error', `❌ Post creation failed (Status: ${createResponse.status})`);
          const createError = await createResponse.text();
          addResult('error', 'Create Error:', createError);

          if (createResponse.status === 403) {
            addResult('error', '⚠️ User doesn\'t have permission to create posts. Make sure the user has Editor or Administrator role.');
          }
        }
      } catch (error: any) {
        addResult('error', `❌ Post creation error: ${error.message}`);
      }

    } catch (error: any) {
      addResult('error', `❌ Unexpected error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const getResultIcon = (type: TestResult['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      case 'info':
        return <AlertCircle className="w-4 h-4 text-blue-600" />;
    }
  };

  const getResultBadge = (type: TestResult['type']) => {
    switch (type) {
      case 'success':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'error':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'info':
        return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => navigate('/dashboard')} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
          
          <h1 className="text-3xl font-bold text-foreground mb-2">🔧 WordPress Publishing Debug Tool</h1>
          <p className="text-muted-foreground">
            This tool helps debug WordPress publishing issues by testing the REST API connection and credentials.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Form */}
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">WordPress Connection Test</h2>
            
            <form onSubmit={runTests} className="space-y-4">
              <div>
                <Label htmlFor="siteUrl">WordPress Site URL</Label>
                <Input
                  id="siteUrl"
                  type="url"
                  placeholder="https://yoursite.com"
                  value={siteUrl}
                  onChange={(e) => setSiteUrl(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Enter your WordPress site URL (without trailing slash)
                </p>
              </div>

              <div>
                <Label htmlFor="username">WordPress Username</Label>
                <Input
                  id="username"
                  placeholder="admin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  WordPress admin username
                </p>
              </div>

              <div>
                <Label htmlFor="password">WordPress Password/App Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  WordPress password or application password (recommended)
                </p>
              </div>

              <div>
                <Label htmlFor="postTitle">Test Post Title</Label>
                <Input
                  id="postTitle"
                  value={postTitle}
                  onChange={(e) => setPostTitle(e.target.value)}
                  required
                />
              </div>

              <div>
                <Label htmlFor="postContent">Test Post Content</Label>
                <Textarea
                  id="postContent"
                  value={postContent}
                  onChange={(e) => setPostContent(e.target.value)}
                  rows={4}
                  required
                />
              </div>

              <Button type="submit" disabled={isLoading} className="w-full">
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Testing Connection...
                  </>
                ) : (
                  '🧪 Test WordPress Connection & Publishing'
                )}
              </Button>
            </form>
          </Card>

          {/* Results */}
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Test Results</h2>
            
            {results.length === 0 ? (
              <p className="text-muted-foreground">No tests run yet. Fill in the form and click "Test Connection".</p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {results.map((result, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex items-start gap-2">
                      {getResultIcon(result.type)}
                      <div className="flex-1">
                        <Badge className={`text-xs ${getResultBadge(result.type)}`}>
                          {result.message}
                        </Badge>
                        {result.details && (
                          <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-x-auto">
                            {result.details}
                          </pre>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Tips */}
        <Card className="p-6 mt-6">
          <h3 className="text-lg font-semibold mb-3">💡 Tips for WordPress Connection</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <h4 className="font-medium mb-2">✅ Recommended Setup:</h4>
              <ul className="space-y-1 text-muted-foreground">
                <li>• Use Application Passwords instead of regular passwords</li>
                <li>• Ensure user has Editor or Administrator role</li>
                <li>• Use HTTPS for your WordPress site</li>
                <li>• Site must be accessible from internet</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">🚫 Common Issues:</h4>
              <ul className="space-y-1 text-muted-foreground">
                <li>• Security plugins blocking REST API</li>
                <li>• Incorrect site URL format</li>
                <li>• User doesn't have proper permissions</li>
                <li>• Hosting provider blocking external requests</li>
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}