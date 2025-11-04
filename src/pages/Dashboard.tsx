import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import {
  Search,
  TrendingUp,
  Users,
  FileText,
  Globe,
  Check,
  X,
  Loader2,
  ExternalLink,
  Settings,
  ArrowLeft,
  Eye,
  Clock,
  Unplug,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";
import { Label } from "@/components/ui/label";
import { BlogOnboarding } from "@/components/onboarding/BlogOnboarding";
import { PublishDialog } from "@/components/PublishDialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface BlogIdea {
  id: string;
  title: string;
  keyword: string;
  intent: "informational" | "commercial" | "transactional";
  reason: string;
  status?: "pending" | "approved" | "rejected" | "generating" | "completed";
}

interface ScanData {
  url: string;
  blogIdeas: BlogIdea[];
  scannedAt: Date;
}

interface Blog {
  id: string;
  subdomain: string | null;
  custom_domain: string | null;
  title: string;
  description: string | null;
  is_published: boolean;
  company_name: string | null;
  website_homepage: string | null;
  cms_platform: string | null;
  cms_site_url: string | null;
  mode: string;
  article_types: Record<string, boolean> | null;
}

interface AnalyticsData {
  date: string;
  views: number;
}

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  published_at: string;
  views: number;
  publishing_status: string | null;
  external_post_id: string | null;
  article_type: string | null;
}

interface KeywordRanking {
  id: string;
  keyword: string;
  ranking_position: number | null;
  intent: string | null;
  search_volume: number;
}

type DateRange = "7D" | "1M" | "3M" | "6M" | "1Y" | "All";

const ARTICLE_TYPE_LABELS: Record<string, { name: string; emoji: string }> = {
  how_to: { name: "How-To Guides", emoji: "📚" },
  listicle: { name: "Listicles", emoji: "📝" },
  qa: { name: "Q&A Articles", emoji: "❓" },
  news: { name: "News & Updates", emoji: "📰" },
  roundup: { name: "Product Roundups", emoji: "🔍" },
  versus: { name: "Comparison Articles", emoji: "⚖️" },
  checklist: { name: "Checklists", emoji: "✅" },
  advertorial: { name: "Advertorials", emoji: "📢" },
  interactive_tool: { name: "Interactive Tools", emoji: "🛠️" },
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [scanData, setScanData] = useState<ScanData | null>(null);
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [avgCpc, setAvgCpc] = useState<number>(0);
  
  // Blog management state
  const [blog, setBlog] = useState<Blog | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData[]>([]);
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [keywordRankings, setKeywordRankings] = useState<KeywordRanking[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>("1M");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const [blogForm, setBlogForm] = useState({
    subdomain: "",
    title: "",
    description: "",
    customDomain: "",
  });

  useEffect(() => {
    fetchUserBlog();
    fetchKeywordsCpc();
  }, []);

  const fetchKeywordsCpc = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("keywords")
      .select("cpc")
      .eq("user_id", user.id);

    if (data && data.length > 0) {
      const totalCpc = data.reduce((sum, kw) => sum + parseFloat(kw.cpc?.toString() || "0"), 0);
      const average = totalCpc / data.length;
      setAvgCpc(average);
    }
  };

  const fetchUserBlog = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get the latest blog for this user (in case of duplicates)
    const { data } = await supabase
      .from("blogs")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      setBlog(data as Blog);
      fetchAnalytics(data.id);
      fetchBlogPosts(data.id);
      fetchKeywordRankings();
    }
  };

  const getDateRangeDays = (range: DateRange): number => {
    switch (range) {
      case "7D": return 7;
      case "1M": return 30;
      case "3M": return 90;
      case "6M": return 180;
      case "1Y": return 365;
      case "All": return 9999;
      default: return 30;
    }
  };

  const fetchAnalytics = async (blogId: string) => {
    const days = getDateRangeDays(dateRange);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data, error } = await supabase
      .from("blog_analytics")
      .select("date, page_views")
      .eq("blog_id", blogId)
      .gte("date", startDate.toISOString().split("T")[0])
      .order("date", { ascending: true });

    if (error) {
      console.error("Error fetching analytics:", error);
      return;
    }

    if (data && data.length > 0) {
      const chartData = data.map((row) => ({
        date: new Date(row.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        views: row.page_views || 0,
      }));
      setAnalytics(chartData);
    } else {
      setAnalytics([]);
    }
  };

  const fetchBlogPosts = async (blogId: string) => {
    const { data: posts, error: postsError } = await supabase
      .from("blog_posts")
      .select("id, title, slug, published_at, publishing_status, external_post_id, article_type")
      .eq("blog_id", blogId)
      .eq("status", "published")
      .order("published_at", { ascending: false });

    if (postsError) {
      console.error("Error fetching blog posts:", postsError);
      return;
    }

    if (!posts || posts.length === 0) {
      setBlogPosts([]);
      return;
    }

    // Fetch view counts for each post from blog_analytics
    const postsWithViews = await Promise.all(
      posts.map(async (post) => {
        const { data: analyticsData } = await supabase
          .from("blog_analytics")
          .select("page_views")
          .eq("blog_id", blogId)
          .eq("post_id", post.id);

        const totalViews = analyticsData?.reduce((sum, row) => sum + (row.page_views || 0), 0) || 0;

        return {
          ...post,
          views: totalViews,
        };
      })
    );

    setBlogPosts(postsWithViews);
  };

  const fetchKeywordRankings = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("keywords")
      .select("id, keyword, ranking_position, intent, search_volume")
      .eq("user_id", user.id)
      .not("ranking_position", "is", null)
      .order("ranking_position", { ascending: true })
      .limit(10);

    if (error) {
      console.error("Error fetching keyword rankings:", error);
      return;
    }

    setKeywordRankings(data || []);
  };

  useEffect(() => {
    if (blog) {
      fetchAnalytics(blog.id);
    }
  }, [dateRange]);

  const handleDisconnectSite = async () => {
    if (!blog) return;

    try {
      // Only clear CMS connection fields, keep the blog and its data
      const { error } = await supabase
        .from("blogs")
        .update({
          cms_platform: null,
          cms_site_url: null,
          cms_credentials: null,
        })
        .eq("id", blog.id);

      if (error) throw error;

      await fetchUserBlog();
      setShowDisconnectDialog(false);
      toast.success("Site disconnected successfully - your content remains published");
    } catch (error: any) {
      console.error("Error disconnecting site:", error);
      toast.error("Failed to disconnect site: " + error.message);
    }
  };

  const getCMSIcon = (platform: string | null) => {
    const icons: { [key: string]: string } = {
      wordpress: "🔷",
      webflow: "⚡",
      ghost: "👻",
      shopify: "🛍️",
      wix: "🌐",
      framer: "🎨",
      notion: "📝",
      hubspot: "🎯",
      nextjs: "⚫",
      rest_api: "🔌",
    };
    return icons[platform || ""] || "🌐";
  };

  const getCMSName = (platform: string | null) => {
    const names: { [key: string]: string } = {
      wordpress: "WordPress",
      webflow: "Webflow",
      ghost: "Ghost",
      shopify: "Shopify",
      wix: "WIX",
      framer: "Framer",
      notion: "Notion",
      hubspot: "HubSpot",
      nextjs: "Next.js",
      rest_api: "REST API",
    };
    return names[platform || ""] || "Website";
  };

  const handleCreateBlog = async () => {
    if (!blogForm.subdomain || !blogForm.title) {
      toast.error("Please fill in subdomain and title");
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("blogs")
      .insert({
        user_id: user.id,
        subdomain: blogForm.subdomain.toLowerCase(),
        title: blogForm.title,
        description: blogForm.description || null,
        custom_domain: blogForm.customDomain || null,
      })
      .select()
      .single();

    if (error) {
      toast.error("Failed to create blog: " + error.message);
      return;
    }

    setBlog(data as Blog);
    setShowSettings(false);
    toast.success("Blog created successfully!");
  };

  const handleUpdateBlog = async () => {
    if (!blog) return;

    const { error } = await supabase
      .from("blogs")
      .update({
        title: blogForm.title,
        description: blogForm.description || null,
        custom_domain: blogForm.customDomain || null,
      })
      .eq("id", blog.id);

    if (error) {
      toast.error("Failed to update blog: " + error.message);
      return;
    }

    await fetchUserBlog();
    setShowSettings(false);
    toast.success("Blog updated successfully!");
  };

  const handleTogglePublish = () => {
    if (!blog) return;
    
    if (blog.is_published) {
      // Unpublish directly
      handleUnpublish();
    } else {
      // Show customize link dialog
      setShowPublishDialog(true);
    }
  };

  const handleUnpublish = async () => {
    if (!blog) return;

    const { error } = await supabase
      .from("blogs")
      .update({ is_published: false })
      .eq("id", blog.id);

    if (error) {
      toast.error("Failed to unpublish blog");
      return;
    }

    await fetchUserBlog();
    toast.success("Blog unpublished!");
  };

  const handleScan = async () => {
    if (!url.trim()) {
      toast.error("Please enter a valid URL");
      return;
    }

    setIsScanning(true);

    try {
      const { data, error } = await supabase.functions.invoke("scan-website", {
        body: { url },
      });

      if (error) throw error;

      const blogIdeas = data.blogIdeas.map((idea: any) => ({
        ...idea,
        status: "pending",
      }));

      setScanData({
        url,
        blogIdeas,
        scannedAt: new Date(),
      });

      toast.success("Website scanned successfully!");
    } catch (error) {
      console.error("Scan error:", error);
      toast.error("Failed to scan website. Please try again.");
    } finally {
      setIsScanning(false);
    }
  };

  const handleApprove = async (idea: BlogIdea) => {
    if (!scanData) return;

    setGeneratingIds((prev) => new Set(prev).add(idea.id));

    // Update status to generating
    setScanData({
      ...scanData,
      blogIdeas: scanData.blogIdeas.map((item) =>
        item.id === idea.id ? { ...item, status: "generating" } : item
      ),
    });

    try {
      const { data, error } = await supabase.functions.invoke(
        "generate-article",
        {
          body: {
            title: idea.title,
            keyword: idea.keyword,
            intent: idea.intent,
            websiteUrl: scanData.url,
          },
        }
      );

      if (error) throw error;

      // Update status to completed
      setScanData({
        ...scanData,
        blogIdeas: scanData.blogIdeas.map((item) =>
          item.id === idea.id ? { ...item, status: "completed" } : item
        ),
      });

      toast.success("Article generated and saved successfully!");
    } catch (error) {
      console.error("Generation error:", error);
      toast.error("Failed to generate article. Please try again.");

      // Revert status back to pending on error
      setScanData({
        ...scanData,
        blogIdeas: scanData.blogIdeas.map((item) =>
          item.id === idea.id ? { ...item, status: "pending" } : item
        ),
      });
    } finally {
      setGeneratingIds((prev) => {
        const next = new Set(prev);
        next.delete(idea.id);
        return next;
      });
    }
  };

  const handleReject = (idea: BlogIdea) => {
    if (!scanData) return;

    setScanData({
      ...scanData,
      blogIdeas: scanData.blogIdeas.map((item) =>
        item.id === idea.id ? { ...item, status: "rejected" } : item
      ),
    });

    toast.info("Article idea rejected");
  };

  const handleTestConnection = async () => {
    if (!blog || !blog.cms_platform || !blog.cms_site_url) return;
    
    toast.info("Testing connection to your CMS...");
    
    try {
      const { data, error } = await supabase.functions.invoke('test-cms-connection', {
        body: {
          platform: blog.cms_platform,
          siteUrl: blog.cms_site_url,
          apiKey: (blog as any).cms_credentials?.apiKey,
          apiSecret: (blog as any).cms_credentials?.apiSecret,
          accessToken: (blog as any).cms_credentials?.accessToken,
        }
      });
      
      if (error) throw error;
      
      if (data.success) {
        toast.success("✅ Connection verified!");
      } else {
        toast.error("❌ Connection failed: " + (data.error || "Unknown error"));
      }
    } catch (error: any) {
      console.error("Connection test error:", error);
      toast.error("Connection test failed: " + error.message);
    }
  };

  const handlePublishNow = async (postId: string) => {
    try {
      toast.info("Publishing post to your CMS...");
      
      const { data, error } = await supabase.functions.invoke('publish-to-cms', {
        body: { blog_post_id: postId }
      });
      
      if (error) throw error;
      
      toast.success("Post published successfully!");
      if (blog) fetchBlogPosts(blog.id);
    } catch (error: any) {
      console.error("Publish error:", error);
      toast.error("Failed to publish: " + error.message);
    }
  };

  const handleRejectPost = async (postId: string) => {
    try {
      const { error } = await supabase
        .from("blog_posts")
        .delete()
        .eq("id", postId);

      if (error) throw error;

      toast.success("Article rejected and deleted");
      if (blog) fetchBlogPosts(blog.id);
    } catch (error: any) {
      console.error("Reject error:", error);
      toast.error("Failed to reject article: " + error.message);
    }
  };

  const handleGenerateFirstPost = async () => {
    if (!blog) return;
    
    try {
      toast.info("Generating your first blog post... This may take a minute.");
      
      const { data, error } = await supabase.functions.invoke('generate-blog-post', {
        body: { blogId: blog.id }
      });
      
      if (error) throw error;
      
      toast.success("First post generated! Check your post queue.");
      fetchBlogPosts(blog.id);
    } catch (error: any) {
      console.error("Generate error:", error);
      toast.error("Failed to generate post: " + error.message);
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-500/10 text-green-600">Approved</Badge>;
      case "rejected":
        return <Badge className="bg-red-500/10 text-red-600">Rejected</Badge>;
      case "generating":
        return <Badge className="bg-yellow-500/10 text-yellow-600">Generating...</Badge>;
      case "completed":
        return <Badge className="bg-blue-500/10 text-blue-600">Completed</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  if (showSettings && blog) {
    return (
      <div className="p-8">
        <div className="max-w-2xl mx-auto">
          <Button
            variant="ghost"
            onClick={() => setShowSettings(false)}
            className="mb-6"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
          
          <Card className="p-6">
            <h2 className="text-2xl font-bold text-foreground mb-6">Blog Settings</h2>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="subdomain">Subdomain *</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    id="subdomain"
                    value={blogForm.subdomain}
                    disabled
                  />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    .searchfuel.app
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Subdomain cannot be changed
                </p>
              </div>

              <div>
                <Label htmlFor="title">Blog Title *</Label>
                <Input
                  id="title"
                  placeholder="My Awesome Blog"
                  value={blogForm.title}
                  onChange={(e) => setBlogForm({ ...blogForm, title: e.target.value })}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  placeholder="A brief description of your blog"
                  value={blogForm.description}
                  onChange={(e) => setBlogForm({ ...blogForm, description: e.target.value })}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="customDomain">Custom Domain</Label>
                <Input
                  id="customDomain"
                  placeholder="blog.yourdomain.com"
                  value={blogForm.customDomain}
                  onChange={(e) => setBlogForm({ ...blogForm, customDomain: e.target.value })}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Optional: Connect your own domain
                </p>
              </div>

              <div className="flex gap-2 pt-4">
                <Button 
                  variant="outline"
                  onClick={() => setShowSettings(false)}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleUpdateBlog}
                  className="flex-1"
                >
                  Update Blog
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (showOnboarding) {
    return (
      <div className="p-8">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8">
            <p className="text-sm text-muted-foreground mb-2">SEARCHFUEL SETUP</p>
            <h1 className="text-4xl font-bold text-foreground">Create your AI SEO engine</h1>
          </div>
          <BlogOnboarding
            open={true}
            onComplete={() => {
              setShowOnboarding(false);
              fetchUserBlog();
            }}
            onCancel={() => setShowOnboarding(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 bg-background min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground tracking-tight">
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          Monitor your content performance and SEO metrics
        </p>
      </div>

      {/* Connected Site Card */}
      {blog && blog.cms_platform && blog.cms_site_url ? (
        <Card className="p-6 mb-6 bg-card shadow-sm border-l-4 border-l-accent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center text-2xl">
                {getCMSIcon(blog.cms_platform)}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-lg font-semibold text-foreground">
                    {getCMSName(blog.cms_platform)} Site Connected
                  </h3>
                  <Badge variant="outline" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800">
                    Active
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Globe className="w-4 h-4" />
                  <a 
                    href={blog.cms_site_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-accent transition-colors flex items-center gap-1 font-medium"
                  >
                    {blog.cms_site_url}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs">
                  {blogPosts.filter(p => p.publishing_status === 'published').length > 0 && (
                    <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400">
                      {blogPosts.filter(p => p.publishing_status === 'published').length} published to CMS
                    </Badge>
                  )}
                  {blogPosts.filter(p => p.publishing_status === 'failed').length > 0 && (
                    <Badge variant="outline" className="bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400">
                      {blogPosts.filter(p => p.publishing_status === 'failed').length} failed
                    </Badge>
                  )}
                  {blogPosts.filter(p => p.publishing_status === 'publishing').length > 0 && (
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
                      {blogPosts.filter(p => p.publishing_status === 'publishing').length} publishing...
                    </Badge>
                  )}
                </div>
                
                {/* Connection Health Status */}
                <div className="mt-4 p-3 border rounded-lg bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium">CMS Connected</span>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={handleTestConnection}
                      >
                        Test Connection
                      </Button>
                      {blog.cms_platform === 'wordpress' && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => navigate('/debug')}
                        >
                          Debug Tool
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  {blog.cms_platform === 'framer' && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Framer connections require manual verification. Test by publishing a post.
                    </p>
                  )}
            </div>
          </div>
        </div>
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => setShowDisconnectDialog(true)}
          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          <Unplug className="w-4 h-4 mr-2" />
          Disconnect
        </Button>
      </div>
        </Card>
      ) : blog ? (
        <Card className="p-6 mb-6 bg-card shadow-sm border-dashed">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-muted-foreground" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-lg font-semibold text-foreground">Website Not Connected</h3>
                  <Badge variant="outline" className="text-muted-foreground">
                    Disconnected
                  </Badge>
                </div>
              </div>
            </div>
            <Button 
              variant="default"
              size="sm"
              onClick={() => setShowOnboarding(true)}
            >
              Connect CMS
            </Button>
          </div>
        </Card>
      ) : null}

      {/* Article Queue Section - Shows pending articles for approval */}
      {blog && blogPosts.filter(p => p.publishing_status === 'pending').length > 0 && (
        <Card className="p-6 bg-card shadow-sm mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Articles</h3>
              <p className="text-sm text-muted-foreground">
                Review and approve AI-generated articles before publishing
              </p>
            </div>
            <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-900/20">
              {blogPosts.filter(p => p.publishing_status === 'pending').length} Pending Review
            </Badge>
          </div>

          <div className="space-y-3">
            {blogPosts
              .filter(p => p.publishing_status === 'pending')
              .slice(0, 5)
              .map((post) => {
                return (
                  <div 
                    key={post.id} 
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/5 transition-colors"
                  >
                    <div className="flex-1">
                      <h4 className="font-medium text-foreground mb-1">{post.title}</h4>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {post.article_type && (
                          <Badge variant="outline" className="text-xs">
                            {ARTICLE_TYPE_LABELS[post.article_type]?.emoji} {ARTICLE_TYPE_LABELS[post.article_type]?.name || post.article_type}
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="default" 
                        size="sm"
                        onClick={() => handlePublishNow(post.id)}
                      >
                        Approve
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleRejectPost(post.id)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                );
              })}
          </div>
          
          {blogPosts.filter(p => p.publishing_status === 'pending').length > 5 && (
            <div className="mt-4 text-center">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => navigate('/articles')}
              >
                View All {blogPosts.filter(p => p.publishing_status === 'pending').length} Articles
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Article Types Card */}
      {blog && (
        <Card className="p-6 mb-6 bg-card shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Article Types</h3>
              <p className="text-sm text-muted-foreground">
                Manage the types of content your AI generates
              </p>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => navigate('/settings?tab=article-types')}
            >
              <Settings className="w-4 h-4 mr-2" />
              Manage Types
            </Button>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {blog.article_types && Object.entries(blog.article_types)
              .filter(([_, enabled]) => enabled)
              .slice(0, 6)
              .map(([type, _]) => (
                <Badge key={type} variant="secondary">
                  {ARTICLE_TYPE_LABELS[type]?.emoji} {ARTICLE_TYPE_LABELS[type]?.name || type}
                </Badge>
              ))}
            {blog.article_types && Object.entries(blog.article_types).filter(([_, enabled]) => enabled).length > 6 && (
              <Badge variant="outline">
                +{Object.entries(blog.article_types).filter(([_, enabled]) => enabled).length - 6} more
              </Badge>
            )}
            {(!blog.article_types || Object.keys(blog.article_types).length === 0) && (
              <p className="text-sm text-muted-foreground">No article types configured yet</p>
            )}
          </div>
        </Card>
      )}

        {/* Analytics / No Site Connected */}
        {!blog ? (
          <Card className="p-12 text-center bg-card shadow-sm">
            <div className="max-w-md mx-auto">
              <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
                <Globe className="w-8 h-8 text-accent" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">
                No Site Connected
              </h3>
              <p className="text-muted-foreground mb-6">
                Connect your website to start generating SEO-optimized content and tracking performance.
              </p>
              <Button onClick={() => setShowOnboarding(true)}>
                Connect Site
              </Button>
            </div>
          </Card>
          ) : (
          <>
            {/* Analytics Section - Total Visits and Visits by Blog Posts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Traffic Chart */}
              <Card className="p-6 bg-card shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Total Visits</h3>
                    <p className="text-sm text-muted-foreground">Track your blog traffic over time</p>
                  </div>
                  <div className="flex gap-2">
                    {(["7D", "1M", "3M", "6M", "1Y", "All"] as DateRange[]).map((range) => (
                      <Button
                        key={range}
                        variant={dateRange === range ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setDateRange(range)}
                        className="h-8 px-3 text-xs"
                      >
                        {range}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="h-[300px]">
                  {analytics.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={analytics}>
                        <defs>
                          <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--accent))" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="hsl(var(--accent))" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                        <XAxis 
                          dataKey="date" 
                          className="text-xs"
                          stroke="hsl(var(--muted-foreground))"
                          tick={{ fontSize: 12 }}
                        />
                        <YAxis 
                          className="text-xs"
                          stroke="hsl(var(--muted-foreground))"
                          tick={{ fontSize: 12 }}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "8px",
                            boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
                          }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="views" 
                          stroke="hsl(var(--accent))" 
                          strokeWidth={2}
                          fill="url(#colorViews)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      No analytics data available yet
                    </div>
                  )}
                </div>
              </Card>

              {/* Visits by Blog Posts */}
              <Card className="p-6 bg-card shadow-sm">
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-foreground">Visits by Blog Posts</h3>
                  <p className="text-sm text-muted-foreground">Performance of individual posts</p>
                </div>
                <div className="h-[300px] overflow-y-auto">
                  {blogPosts.length > 0 ? (
                    <Table>
                      <TableHeader className="sticky top-0 bg-card">
                        <TableRow className="border-b hover:bg-transparent bg-muted/20">
                          <TableHead className="font-semibold text-xs uppercase tracking-wide">Title</TableHead>
                          <TableHead className="font-semibold text-xs uppercase tracking-wide w-28">Published</TableHead>
                          <TableHead className="font-semibold text-xs uppercase tracking-wide w-20 text-right">Views</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {blogPosts.map((post) => (
                          <TableRow key={post.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                            <TableCell className="py-3">
                              <p className="font-medium text-sm text-foreground line-clamp-2">{post.title}</p>
                            </TableCell>
                            <TableCell className="py-3 text-xs text-muted-foreground">
                              {new Date(post.published_at).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })}
                            </TableCell>
                            <TableCell className="py-3 text-sm text-right font-semibold">
                              {post.views.toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      No published posts yet
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {/* Keyword Rankings Section */}
            {keywordRankings.length > 0 && (
              <Card className="p-6 mb-6 bg-card shadow-sm">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-foreground">Keyword Rankings</h3>
                  <p className="text-sm text-muted-foreground">Your site's position for tracked keywords</p>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow className="border-b hover:bg-transparent bg-muted/20">
                      <TableHead className="font-semibold text-xs uppercase tracking-wide">Keyword</TableHead>
                      <TableHead className="font-semibold text-xs uppercase tracking-wide w-24 text-center">Position</TableHead>
                      <TableHead className="font-semibold text-xs uppercase tracking-wide w-32">Intent</TableHead>
                      <TableHead className="font-semibold text-xs uppercase tracking-wide w-28 text-right">Search Volume</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {keywordRankings.map((ranking) => (
                      <TableRow key={ranking.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <TableCell className="py-4">
                          <p className="font-medium text-sm text-foreground">{ranking.keyword}</p>
                        </TableCell>
                        <TableCell className="py-4 text-center">
                          <Badge 
                            variant={ranking.ranking_position && ranking.ranking_position <= 10 ? "default" : "secondary"}
                            className="font-semibold"
                          >
                            #{ranking.ranking_position}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-4">
                          <Badge variant="outline" className="text-xs">
                            {ranking.intent || "unknown"}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-4 text-sm text-right font-medium text-muted-foreground">
                          {ranking.search_volume.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}

            {/* Blog Posts Table */}
            {blogPosts.length > 0 && (
              <Card className="p-6 mb-6 bg-card shadow-sm">
                <h3 className="text-lg font-semibold text-foreground mb-4">Published Blog Posts</h3>
                <Table>
                  <TableHeader>
                    <TableRow className="border-b hover:bg-transparent bg-muted/20">
                      <TableHead className="font-semibold text-xs uppercase tracking-wide">Title</TableHead>
                      <TableHead className="font-semibold text-xs uppercase tracking-wide w-32">Published</TableHead>
                      <TableHead className="font-semibold text-xs uppercase tracking-wide w-24 text-right">Views</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {blogPosts.map((post) => (
                      <TableRow key={post.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <TableCell className="py-4">
                          <p className="font-medium text-sm text-foreground">{post.title}</p>
                        </TableCell>
                        <TableCell className="py-4 text-sm text-muted-foreground">
                          {new Date(post.published_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </TableCell>
                        <TableCell className="py-4 text-sm text-right font-semibold">
                          {post.views.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </>
        )}

        {/* Stats Overview */}
        {scanData && (
          <div className="grid grid-cols-5 gap-4 mb-6">
            <Card className="p-5 bg-card shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Ideas</div>
                <Badge variant="secondary" className="text-xs">{scanData.blogIdeas.length}</Badge>
              </div>
              <div className="text-3xl font-bold text-foreground">{scanData.blogIdeas.length}</div>
            </Card>

            <Card className="p-5 bg-card shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Completed</div>
                <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs">
                  {scanData.blogIdeas.filter((i) => i.status === "completed").length}
                </Badge>
              </div>
              <div className="text-3xl font-bold text-foreground">
                {scanData.blogIdeas.filter((i) => i.status === "completed").length}
              </div>
            </Card>

            <Card className="p-5 bg-card shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Generating</div>
                <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
              </div>
              <div className="text-3xl font-bold text-foreground">
                {scanData.blogIdeas.filter((i) => i.status === "generating").length}
              </div>
            </Card>

            <Card className="p-5 bg-card shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pending</div>
                <Clock className="w-3 h-3 text-muted-foreground" />
              </div>
              <div className="text-3xl font-bold text-foreground">
                {scanData.blogIdeas.filter((i) => i.status === "pending").length}
              </div>
            </Card>

            {avgCpc * 100 >= 100 && (
              <Card className="p-5 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 shadow-sm hover:shadow-md transition-shadow border-green-200 dark:border-green-800">
                <div className="text-xs font-medium text-green-700 dark:text-green-400 uppercase tracking-wide mb-2">Est. Value (100 Visitors/mo)</div>
                <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                  ${(avgCpc * 100).toFixed(0)}
                </div>
              </Card>
            )}
          </div>
        )}

        {/* Articles Table */}
        {scanData && (
          <Card className="bg-card shadow-sm">
            <div className="border-b px-6 py-4 bg-muted/30">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    Blog Article Ideas
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    {scanData.url.replace(/^https?:\/\//, '')}
                  </p>
                </div>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow className="border-b hover:bg-transparent bg-muted/20">
                  <TableHead className="w-12"></TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wide">Article Title</TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wide w-48">Keyword</TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wide w-32 text-center">Intent</TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wide w-32 text-center">Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scanData.blogIdeas.map((idea) => (
                  <TableRow 
                    key={idea.id}
                    className="border-b last:border-0 hover:bg-muted/20 transition-colors"
                  >
                    <TableCell className="py-4">
                      <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30"></div>
                    </TableCell>
                    <TableCell className="py-4">
                      <div className="max-w-xl">
                        <p className="font-medium text-sm text-foreground leading-snug">
                          {idea.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1.5 line-clamp-1">
                          {idea.reason}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant="secondary" 
                          className="font-medium text-xs"
                        >
                          {idea.keyword}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="py-4 text-center">
                      <Badge variant="outline" className="text-xs capitalize">
                        {idea.intent}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-4 text-center">
                      {idea.status === "pending" && (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleApprove(idea)}
                          disabled={generatingIds.has(idea.id)}
                          className="h-8 text-xs"
                        >
                          <Check className="w-3 h-3 mr-1" />
                          Approve
                        </Button>
                      )}
                      {idea.status === "generating" && (
                        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="font-medium">Writing...</span>
                        </div>
                      )}
                      {idea.status === "completed" && (
                        <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          ✓ Ready
                        </Badge>
                      )}
                      {idea.status === "rejected" && (
                        <Badge variant="outline" className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                          Rejected
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="py-4">
                      {idea.status === "pending" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleReject(idea)}
                          className="h-8 w-8 p-0 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        {/* Backlink Settings */}
        {blog && (
          <Card className="p-6 mb-6 bg-card shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-1">Backlink Settings</h3>
                <p className="text-sm text-muted-foreground">
                  Configure your automatic backlink strategy
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.href = '/settings?tab=backlinks'}
              >
                <Settings className="w-4 h-4 mr-2" />
                Manage Backlinks
              </Button>
            </div>
          </Card>
        )}

        {/* Subscription */}
        {blog && (
          <Card className="p-6 mb-6 bg-card shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-1">Subscription</h3>
                <p className="text-sm text-muted-foreground">
                  Current plan: <span className="font-medium text-foreground">Free</span>
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.href = '/settings?tab=subscription'}
              >
                <Settings className="w-4 h-4 mr-2" />
                Manage Subscription
              </Button>
            </div>
          </Card>
        )}

        {showPublishDialog && blog && (
          <PublishDialog
            blog={blog}
            onComplete={() => {
              setShowPublishDialog(false);
              fetchUserBlog();
            }}
            onCancel={() => setShowPublishDialog(false)}
          />
        )}

        {/* Disconnect Confirmation Dialog */}
        <AlertDialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-600" />
                Disconnect Site?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This will disconnect your {blog && getCMSName(blog.cms_platform)} site from SearchFuel. 
                Your published content will remain on your CMS - only the connection will be removed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleDisconnectSite}
                className="bg-red-600 hover:bg-red-700"
              >
                Disconnect Site
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }
