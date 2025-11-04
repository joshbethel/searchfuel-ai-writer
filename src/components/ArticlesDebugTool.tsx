import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function ArticlesDebugTool() {
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [debugResults, setDebugResults] = useState<any[]>([]);

  const runArticlesDebug = async () => {
    setIsDebugMode(true);
    setDebugResults([]);
    
    try {
      // Check authentication
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        setDebugResults(prev => [...prev, { type: 'error', message: 'Authentication failed', details: userError }]);
        return;
      }
      
      setDebugResults(prev => [...prev, { type: 'success', message: 'User authenticated', details: { userId: user.id, email: user.email } }]);
      
      // Get user's blog
      const { data: blogData, error: blogError } = await supabase
        .from("blogs")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
        
      if (blogError) {
        setDebugResults(prev => [...prev, { type: 'error', message: 'Failed to fetch blog', details: blogError }]);
        return;
      }
      
      if (!blogData) {
        setDebugResults(prev => [...prev, { type: 'error', message: 'No blog found for user' }]);
        return;
      }
      
      setDebugResults(prev => [...prev, { 
        type: 'success', 
        message: 'Blog found', 
        details: {
          id: blogData.id,
          cms_platform: blogData.cms_platform,
          cms_site_url: blogData.cms_site_url,
          has_credentials: !!blogData.cms_credentials
        }
      }]);
      
      // Get pending posts
      const { data: postsData, error: postsError } = await supabase
        .from("blog_posts")
        .select("*")
        .eq("blog_id", blogData.id)
        .eq("publishing_status", "pending")
        .limit(5);
        
      if (postsError) {
        setDebugResults(prev => [...prev, { type: 'error', message: 'Failed to fetch posts', details: postsError }]);
        return;
      }
      
      setDebugResults(prev => [...prev, { 
        type: 'success', 
        message: `Found ${postsData?.length || 0} pending posts`,
        details: postsData?.map(p => ({ id: p.id, title: p.title, status: p.publishing_status }))
      }]);
      
      if (postsData && postsData.length > 0) {
        const testPost = postsData[0];
        
        // Test the edge function call
        setDebugResults(prev => [...prev, { type: 'info', message: `Testing publish for post: ${testPost.title}` }]);
        
        try {
          // First, let's try to get more detailed info about what the edge function receives
          setDebugResults(prev => [...prev, { 
            type: 'info', 
            message: 'Calling Edge Function with exact parameters',
            details: { blog_post_id: testPost.id }
          }]);

          const { data, error } = await supabase.functions.invoke('publish-to-cms', {
            body: { blog_post_id: testPost.id }
          });
          
          if (error) {
            setDebugResults(prev => [...prev, { 
              type: 'error', 
              message: 'Edge function failed', 
              details: {
                message: error.message,
                details: error.details,
                hint: error.hint,
                code: error.code,
                fullError: error
              }
            }]);
          } else {
            setDebugResults(prev => [...prev, { 
              type: 'success', 
              message: 'Edge function succeeded', 
              details: data 
            }]);
          }
        } catch (funcError: any) {
          setDebugResults(prev => [...prev, { 
            type: 'error', 
            message: 'Edge function exception', 
            details: {
              message: funcError.message,
              stack: funcError.stack,
              name: funcError.name,
              fullError: funcError
            }
          }]);
        }
        
        // Also test direct WordPress API call to compare
        if (blogData.cms_platform === 'wordpress' && blogData.cms_credentials && blogData.cms_site_url) {
          setDebugResults(prev => [...prev, { type: 'info', message: 'Testing direct WordPress API call...' }]);
          
          try {
            const credentials = blogData.cms_credentials as { username: string; password: string };
            const wpTestUrl = `${blogData.cms_site_url.replace(/\/$/, '')}/wp-json/wp/v2/posts?per_page=1`;
            const authHeader = `Basic ${btoa(`${credentials.username}:${credentials.password}`)}`;
            
            const wpResponse = await fetch(wpTestUrl, {
              headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
              }
            });
            
            if (wpResponse.ok) {
              setDebugResults(prev => [...prev, { 
                type: 'success', 
                message: 'Direct WordPress API call successful',
                details: { status: wpResponse.status, statusText: wpResponse.statusText }
              }]);
            } else {
              const errorText = await wpResponse.text();
              setDebugResults(prev => [...prev, { 
                type: 'error', 
                message: 'Direct WordPress API call failed',
                details: { 
                  status: wpResponse.status, 
                  statusText: wpResponse.statusText,
                  body: errorText 
                }
              }]);
            }
          } catch (wpError: any) {
            setDebugResults(prev => [...prev, { 
              type: 'error', 
              message: 'Direct WordPress API call error',
              details: wpError
            }]);
          }
        }
      }
      
    } catch (error) {
      setDebugResults(prev => [...prev, { type: 'error', message: 'Debug error', details: error }]);
    } finally {
      setIsDebugMode(false);
    }
  };

  return (
    <Card className="p-4 mt-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Articles Publishing Debug</h3>
        <Button onClick={runArticlesDebug} disabled={isDebugMode} size="sm">
          {isDebugMode ? 'Running...' : 'Debug Articles Publishing'}
        </Button>
      </div>
      
      {debugResults.length > 0 && (
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {debugResults.map((result, index) => (
            <div key={index} className={`p-2 rounded text-sm ${
              result.type === 'success' ? 'bg-green-100 text-green-800' :
              result.type === 'error' ? 'bg-red-100 text-red-800' :
              'bg-blue-100 text-blue-800'
            }`}>
              <div className="font-medium">{result.message}</div>
              {result.details && (
                <pre className="mt-1 text-xs overflow-x-auto">
                  {JSON.stringify(result.details, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}