import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function PublishComparisonTest() {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<string[]>([]);

  const addResult = (message: string) => {
    setResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
    console.log(message);
  };

  const runComparisonTest = async () => {
    setIsRunning(true);
    setResults([]);
    
    try {
      addResult("🔍 Starting comparison test between Dashboard and Articles publishing...");
      
      // Get user and blog data
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        addResult("❌ No authenticated user");
        return;
      }
      
      const { data: blog } = await supabase
        .from("blogs")
        .select("*")
        .eq("user_id", user.id)
        .single();
        
      if (!blog) {
        addResult("❌ No blog found");
        return;
      }
      
      addResult(`✅ Found blog: ${blog.title} (${blog.cms_platform})`);
      
      // Get posts with different statuses to see what's available
      addResult("🔍 Checking all post statuses...");
      const { data: allPosts } = await supabase
        .from("blog_posts")
        .select("publishing_status, title, id")
        .eq("blog_id", blog.id);
        
      if (allPosts && allPosts.length > 0) {
        const statusCounts: Record<string, number> = {};
        allPosts.forEach(post => {
          const status = post.publishing_status || 'null';
          statusCounts[status] = (statusCounts[status] || 0) + 1;
        });
        
        addResult(`📊 Post status breakdown: ${JSON.stringify(statusCounts)}`);
        addResult(`📊 Total posts: ${allPosts.length}`);
        
        // Try to find a post that can be published
        const publishablePost = allPosts.find(p => 
          p.publishing_status === 'pending' || 
          p.publishing_status === 'failed' || 
          p.publishing_status === null
        );
        
        if (publishablePost) {
          addResult(`✅ Found publishable post: "${publishablePost.title}" (status: ${publishablePost.publishing_status})`);
          
          // Test with this post
          const testPost = publishablePost;
          
          // Test 1: Dashboard-style test connection (what works)
          addResult("🧪 Test 1: Dashboard-style connection test...");
          try {
            const credentials = blog.cms_credentials as { username?: string; password?: string; accessToken?: string };
            const { data: testData, error: testError } = await supabase.functions.invoke('test-cms-connection', {
              body: {
                platform: blog.cms_platform,
                siteUrl: blog.cms_site_url,
                apiKey: credentials?.username,
                apiSecret: credentials?.password,
                accessToken: credentials?.accessToken
              }
            });
            
            if (testError) {
              addResult(`❌ Test connection failed: ${testError.message}`);
            } else {
              addResult(`✅ Test connection succeeded: ${JSON.stringify(testData)}`);
            }
          } catch (error: any) {
            addResult(`❌ Test connection error: ${error.message}`);
          }
          
          // Test 2: Articles-style publish (what fails)
          addResult("🧪 Test 2: Articles-style publish test...");
          try {
            const { data: publishData, error: publishError } = await supabase.functions.invoke('publish-to-cms', {
              body: { blog_post_id: testPost.id }
            });
            
            if (publishError) {
              addResult(`❌ Publish failed: ${publishError.message}`);
              addResult(`❌ Error details: ${JSON.stringify(publishError)}`);
            } else {
              addResult(`✅ Publish succeeded: ${JSON.stringify(publishData)}`);
            }
          } catch (error: any) {
            addResult(`❌ Publish error: ${error.message}`);
          }
          
          // Test 3: Check post status after attempt
          addResult("🧪 Test 3: Checking post status after publish attempt...");
          const { data: updatedPost } = await supabase
            .from("blog_posts")
            .select("publishing_status, external_post_id, last_published_at")
            .eq("id", testPost.id)
            .single();
            
          if (updatedPost) {
            addResult(`📊 Post status: ${updatedPost.publishing_status}`);
            addResult(`📊 External ID: ${updatedPost.external_post_id || 'None'}`);
            addResult(`📊 Last published: ${updatedPost.last_published_at || 'Never'}`);
          }
          
        } else {
          addResult("❌ No publishable posts found (no pending, failed, or null status posts)");
        }
      } else {
        addResult("❌ No posts found in database");
      }
      
      // Get a pending post
      const { data: posts } = await supabase
        .from("blog_posts")
        .select("*")
        .eq("blog_id", blog.id)
        .eq("publishing_status", "pending")
        .limit(1);
        
      if (!posts || posts.length === 0) {
        addResult("❌ No pending posts found for testing - this explains the Articles page issue!");
        return;
      }
      
      const testPost = posts[0];
      addResult(`✅ Found test post: "${testPost.title}"`);
      
      // Test 1: Dashboard-style test connection (what works)
      addResult("🧪 Test 1: Dashboard-style connection test...");
      try {
        const credentials = blog.cms_credentials as { username?: string; password?: string; accessToken?: string };
        const { data: testData, error: testError } = await supabase.functions.invoke('test-cms-connection', {
          body: {
            platform: blog.cms_platform,
            siteUrl: blog.cms_site_url,
            apiKey: credentials?.username,
            apiSecret: credentials?.password,
            accessToken: credentials?.accessToken
          }
        });
        
        if (testError) {
          addResult(`❌ Test connection failed: ${testError.message}`);
        } else {
          addResult(`✅ Test connection succeeded: ${JSON.stringify(testData)}`);
        }
      } catch (error: any) {
        addResult(`❌ Test connection error: ${error.message}`);
      }
      
      // Test 2: Articles-style publish (what fails)
      addResult("🧪 Test 2: Articles-style publish test...");
      try {
        const { data: publishData, error: publishError } = await supabase.functions.invoke('publish-to-cms', {
          body: { blog_post_id: testPost.id }
        });
        
        if (publishError) {
          addResult(`❌ Publish failed: ${publishError.message}`);
          addResult(`❌ Error details: ${JSON.stringify(publishError)}`);
        } else {
          addResult(`✅ Publish succeeded: ${JSON.stringify(publishData)}`);
        }
      } catch (error: any) {
        addResult(`❌ Publish error: ${error.message}`);
      }
      
      // Test 3: Check post status after attempt
      addResult("🧪 Test 3: Checking post status after publish attempt...");
      const { data: updatedPost } = await supabase
        .from("blog_posts")
        .select("publishing_status, external_post_id, last_published_at")
        .eq("id", testPost.id)
        .single();
        
      if (updatedPost) {
        addResult(`📊 Post status: ${updatedPost.publishing_status}`);
        addResult(`📊 External ID: ${updatedPost.external_post_id || 'None'}`);
        addResult(`📊 Last published: ${updatedPost.last_published_at || 'Never'}`);
      }
      
      // Test 4: Direct database check
      addResult("🧪 Test 4: Direct database blog credentials check...");
      const { data: blogCheck, error: blogError } = await supabase
        .from("blogs")
        .select("cms_credentials, cms_platform, cms_site_url")
        .eq("id", blog.id)
        .single();
        
      if (blogError) {
        addResult(`❌ Database check failed: ${blogError.message}`);
      } else {
        addResult(`✅ CMS Platform: ${blogCheck.cms_platform}`);
        addResult(`✅ CMS URL: ${blogCheck.cms_site_url}`);
        addResult(`✅ Has credentials: ${!!blogCheck.cms_credentials}`);
        if (blogCheck.cms_credentials) {
          const creds = blogCheck.cms_credentials as any;
          addResult(`✅ Username available: ${!!creds.username}`);
          addResult(`✅ Password available: ${!!creds.password}`);
        }
      }
      
    } catch (error: any) {
      addResult(`❌ Test failed: ${error.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card className="p-4 mt-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">🔬 Publish Comparison Test</h3>
        <Button onClick={runComparisonTest} disabled={isRunning} size="sm">
          {isRunning ? 'Testing...' : 'Run Comparison Test'}
        </Button>
      </div>
      
      {results.length > 0 && (
        <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded max-h-60 overflow-y-auto">
          <pre className="text-xs whitespace-pre-wrap">
            {results.join('\n')}
          </pre>
        </div>
      )}
    </Card>
  );
}