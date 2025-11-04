// Debug script to test WordPress publishing
// This will help us identify the exact issue

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://qihpywleopgrlvwcffvy.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpaHB5d2xlb3Bncmx2d2NmZnZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NTk1MjUsImV4cCI6MjA3NTQzNTUyNX0.awC4TbT5cCScXYkq9Hbam-0B7K1TP9MibT_w86oGerk';

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugPublishIssue() {
  try {
    console.log('🔍 Starting WordPress publishing debug...\n');
    
    // Get current user's blogs and posts
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.log('❌ No authenticated user found');
      return;
    }
    
    console.log('✅ User authenticated:', user.email);
    
    // Get user's blogs
    const { data: blogs, error: blogsError } = await supabase
      .from('blogs')
      .select('*')
      .eq('user_id', user.id);
      
    if (blogsError) {
      console.log('❌ Error fetching blogs:', blogsError);
      return;
    }
    
    console.log(`📚 Found ${blogs.length} blog(s)`);
    
    // Find WordPress connected blog
    const wpBlog = blogs.find(blog => blog.cms_platform === 'wordpress');
    
    if (!wpBlog) {
      console.log('❌ No WordPress blog found');
      return;
    }
    
    console.log('✅ WordPress blog found:', {
      id: wpBlog.id,
      cms_site_url: wpBlog.cms_site_url,
      has_credentials: !!wpBlog.cms_credentials
    });
    
    // Check credentials structure
    if (wpBlog.cms_credentials) {
      const creds = wpBlog.cms_credentials;
      console.log('🔑 Credentials structure:', {
        username: !!creds.username,
        password: !!creds.password,
        credentialsKeys: Object.keys(creds)
      });
    }
    
    // Get pending posts
    const { data: posts, error: postsError } = await supabase
      .from('blog_posts')
      .select('*')
      .eq('blog_id', wpBlog.id)
      .eq('publishing_status', 'pending');
      
    if (postsError) {
      console.log('❌ Error fetching posts:', postsError);
      return;
    }
    
    console.log(`📝 Found ${posts.length} pending post(s)`);
    
    if (posts.length > 0) {
      const post = posts[0];
      console.log('📄 First pending post:', {
        id: post.id,
        title: post.title,
        content_length: post.content?.length || 0,
        has_excerpt: !!post.excerpt
      });
      
      // Test WordPress API connection
      const testUrl = `${wpBlog.cms_site_url}/wp-json/wp/v2/posts?per_page=1`;
      console.log('\n🧪 Testing WordPress API connection...');
      console.log('URL:', testUrl);
      
      try {
        const testResponse = await fetch(testUrl);
        console.log('✅ WordPress API test response:', {
          status: testResponse.status,
          ok: testResponse.ok,
          headers: Object.fromEntries(testResponse.headers.entries())
        });
      } catch (apiError) {
        console.log('❌ WordPress API test failed:', apiError.message);
      }
    }
    
  } catch (error) {
    console.log('❌ Debug script error:', error);
  }
}

// Only run if called directly
if (require.main === module) {
  debugPublishIssue();
}

module.exports = { debugPublishIssue };