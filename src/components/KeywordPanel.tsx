import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { 
  Loader2, 
  ChevronDown, 
  ChevronUp, 
  TrendingUp, 
  DollarSign, 
  BarChart3,
  Target
} from 'lucide-react';
import { toast } from 'sonner';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SEOStats {
  searchVolume?: number;
  keywordDifficulty?: number;
  cpc?: number;
  competition?: number;
  intent?: 'informational' | 'commercial' | 'transactional' | 'navigational';
  trendsData?: {
    month: string;
    volume: number;
  }[];
}

interface KeywordItem {
  keyword: string;
  score: number;
  source?: string;
  seoStats?: SEOStats;
}

interface TopicItem {
  topic: string;
  score: number;
  reason?: string;
  seoStats?: SEOStats;
}

// Ensure the base types for client-side extraction include seoStats
interface ExtractedData {
  keywords: (Omit<KeywordItem, 'seoStats'> & { seoStats?: SEOStats })[];
  topics: (Omit<TopicItem, 'seoStats'> & { seoStats?: SEOStats })[];
}

export default function KeywordPanel({ id, kind = 'blog_post' }: { id: string; kind?: 'blog_post' | 'article' }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [keywords, setKeywords] = useState<KeywordItem[]>([]);
  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isReExtracting, setIsReExtracting] = useState(false);
  const [generatingTopics, setGeneratingTopics] = useState<string[]>([]);
  const [addingKeywords, setAddingKeywords] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!id) return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const addToKeywordsList = async (keyword: KeywordItem) => {
    if (addingKeywords.has(keyword.keyword)) return;

    try {
      setAddingKeywords(prev => new Set([...prev, keyword.keyword]));
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Prepare keyword data
      const keywordData = {
        user_id: user.id,
        keyword: keyword.keyword,
        search_volume: keyword.seoStats?.searchVolume || 0,
        cpc: keyword.seoStats?.cpc || 0,
        difficulty: keyword.seoStats?.keywordDifficulty || 0,
        competition: keyword.seoStats?.competition || 0,
        intent: (keyword.seoStats?.intent || 'informational').toLowerCase(),
        trend: 'stable',
        location_code: 2840,
        language_code: 'en'
      };

      const { error } = await supabase
        .from('keywords')
        .insert(keywordData);

      if (error) {
        if (error.code === '23505') { // Unique violation
          toast("Keyword already exists in your list");
        } else {
          throw error;
        }
      } else {
        toast.success("Keyword added to your list");
      }

    } catch (error) {
      console.error("Error adding keyword:", error);
      toast.error("Failed to add keyword to list");
    } finally {
      setAddingKeywords(prev => {
        const next = new Set(prev);
        next.delete(keyword.keyword);
        return next;
      });
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const table = kind === 'article' ? 'articles' : 'blog_posts';
      // also fetch title/content so we can run a client-side fallback extractor if functions are unreachable
      const { data, error } = await supabase
        .from(table)
        .select('extracted_keywords, recommended_topics, title, content')
        .eq('id', id)
        .single();

      if (error) throw error;

  // Cast to any because DB type definitions may not include the new JSONB columns yet
  const row: any = data as any;
  setKeywords((row?.extracted_keywords || []) as KeywordItem[]);
  setTopics((row?.recommended_topics || []) as TopicItem[]);
    } catch (err) {
      // capture and show a clearer error message
      // eslint-disable-next-line no-console
      console.error('Error loading keywords:', err);
      // If the error indicates missing columns (Postgres 42703), try a safe fallback select '*' to still show the row
      const msg = (err && (err.message || err.error || String(err))) || '';
      const isMissingColumn = msg.includes('does not exist') || (err && (err.code === '42703' || err?.name === 'PostgresError'));
      if (isMissingColumn) {
        try {
          const table = kind === 'article' ? 'articles' : 'blog_posts';
          const { data: fallbackRow, error: fallbackErr } = await supabase.from(table).select('*').eq('id', id).single();
          if (!fallbackErr && fallbackRow) {
            const r: any = fallbackRow as any;
            setKeywords((r?.extracted_keywords || []) as KeywordItem[]);
            setTopics((r?.recommended_topics || []) as TopicItem[]);
            setErrorMsg(null);
            return;
          }
        } catch (inner) {
          // fall through to showing the original error
          // eslint-disable-next-line no-console
          console.warn('Fallback select failed:', inner);
        }
      }

      const message = msg || 'Failed to load extracted keywords';
      setErrorMsg(message);
      toast.error('Failed to load extracted keywords');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-4"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  return (
    <Card className="p-6 my-8 bg-gradient-to-br from-background to-muted/20 border-2 hover:border-primary/20 transition-all duration-300 shadow-lg min-w-[900px] w-full overflow-hidden">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        {/* Preview Mode (Collapsed) */}
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1 min-w-0">
            {errorMsg ? (
              <div className="flex items-center gap-3">
                <p className="text-sm text-destructive font-medium">Failed to load keywords</p>
                <Button size="sm" variant="outline" onClick={fetchData} disabled={isReExtracting} 
                  className="h-8 text-sm hover:bg-destructive/10 hover:text-destructive">
                  {isReExtracting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Retry
                </Button>
              </div>
            ) : keywords.length === 0 ? (
              <div className="flex items-center gap-3">
                <p className="text-sm text-muted-foreground font-medium">No keywords extracted</p>
                <Button size="sm" onClick={async () => await handleReExtract()} 
                  className="h-8 text-sm bg-primary/10 text-primary hover:bg-primary/20 border-primary/20">
                  {isReExtracting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Extract Keywords
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Extracted Keywords</h3>
                <div className="flex flex-wrap gap-2 items-center">
                  {keywords.slice(0, 3).map((k) => (
                    <Badge 
                      key={k.keyword} 
                      variant="secondary"
                      className="px-3 py-1 text-sm font-medium hover:bg-secondary/80 cursor-default transition-colors"
                    >
                      {k.keyword}
                    </Badge>
                  ))}
                  {keywords.length > 3 && (
                    <span className="text-sm text-muted-foreground font-medium">+{keywords.length - 3} more</span>
                  )}
                </div>
              </div>
            )}
          </div>
          
          <CollapsibleTrigger asChild>
            <Button 
              variant="ghost" 
              size="sm"
              className="h-6 px-2 hover:bg-secondary/80"
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </CollapsibleTrigger>
        </div>

        {/* Expanded Mode */}
        <CollapsibleContent>
          <div className="pt-4 border-t">
            <div className="space-y-4">
              {/* Keywords Section */}
              <div>
                <h4 className="text-base font-semibold text-foreground mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>Keywords Analysis</span>
                    {keywords.length > 0 && (
                      <Badge variant="secondary" className="text-xs px-2 py-0.5">
                        {keywords.length} found
                      </Badge>
                    )}
                  </div>
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse table-fixed">
                    <colgroup>
                      <col className="w-[18%]" /> {/* Keyword */}
                      <col className="w-[8%]" />  {/* Relevance */}
                      <col className="w-[11%]" /> {/* Monthly Volume */}
                      <col className="w-[11%]" /> {/* Difficulty */}
                      <col className="w-[11%]" /> {/* CPC */}
                      <col className="w-[11%]" /> {/* Competition */}
                      <col className="w-[11%]" /> {/* Intent */}
                      <col className="w-[19%]" /> {/* Actions */}
                    </colgroup>
                    <thead>
                      <tr className="border-b-2 border-border">
                        <th className="py-3 px-4 text-left text-sm font-semibold text-muted-foreground">Keyword</th>
                        <th className="py-3 px-4 text-left text-sm font-semibold text-muted-foreground">Relevance</th>
                        <th className="py-3 px-4 text-left text-sm font-semibold text-muted-foreground">Monthly Volume</th>
                        <th className="py-3 px-4 text-left text-sm font-semibold text-muted-foreground">Difficulty</th>
                        <th className="py-3 px-4 text-left text-sm font-semibold text-muted-foreground">CPC</th>
                        <th className="py-3 px-4 text-left text-sm font-semibold text-muted-foreground">Competition</th>
                        <th className="py-3 px-4 text-left text-sm font-semibold text-muted-foreground">Intent</th>
                        <th className="py-3 px-4 text-left text-sm font-semibold text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {keywords.map((k) => (
                        <tr 
                          key={k.keyword}
                          className="group hover:bg-muted/50 transition-colors"
                        >
                          <td className="py-3 px-4 truncate">
                            <span className="text-sm font-medium text-foreground" title={k.keyword}>{k.keyword}</span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <Badge variant="secondary" className="text-xs font-medium">
                              {(k.score * 100).toFixed(0)}%
                            </Badge>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <TrendingUp className="w-4 h-4 text-blue-500" />
                              <span className="text-sm font-medium">
                                {k.seoStats?.searchVolume?.toLocaleString() || '0'}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <Target className="w-4 h-4 text-orange-500" />
                              <span className="text-sm font-medium">
                                {k.seoStats?.keywordDifficulty 
                                  ? `${k.seoStats.keywordDifficulty}%` 
                                  : 'N/A'
                                }
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <DollarSign className="w-4 h-4 text-green-500" />
                              <span className="text-sm font-medium">
                                {k.seoStats?.cpc 
                                  ? `$${k.seoStats.cpc.toFixed(2)}` 
                                  : 'N/A'
                                }
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <BarChart3 className="w-4 h-4 text-purple-500" />
                              <span className="text-sm font-medium">
                                {k.seoStats?.competition 
                                  ? `${(k.seoStats.competition * 100).toFixed(0)}%`
                                  : 'N/A'
                                }
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            {k.seoStats?.intent && (
                              <Badge 
                                variant="outline" 
                                className={`text-xs capitalize ${
                                  k.seoStats.intent === 'transactional' ? "text-green-600 border-green-200" :
                                  k.seoStats.intent === 'commercial' ? "text-blue-600 border-blue-200" :
                                  k.seoStats.intent === 'informational' ? "text-orange-600 border-orange-200" :
                                  "text-muted-foreground"
                                }`}
                              >
                                {k.seoStats.intent}
                              </Badge>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary/10 hover:text-primary"
                              onClick={() => addToKeywordsList(k)}
                            >
                              {addingKeywords.has(k.keyword) ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                  Adding...
                                </>
                              ) : (
                                'Add to Keywords'
                              )}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {keywords.map((k) => k.seoStats?.trendsData && k.seoStats.trendsData.length > 0 && (
                  <div key={k.keyword} className="mt-4 p-4 border rounded-lg bg-card/50">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium">{k.keyword}</span>
                      <span className="text-xs text-muted-foreground">Search Volume Trend</span>
                    </div>
                    <div className="flex items-end gap-1 h-12">
                      {k.seoStats.trendsData.map((month, i) => {
                        const maxVolume = Math.max(...k.seoStats!.trendsData!.map(m => m.volume));
                        const height = `${(month.volume / maxVolume * 100)}%`;
                        return (
                          <TooltipProvider key={i}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div 
                                  className="flex-1 bg-blue-500/20 hover:bg-blue-500/30 transition-colors rounded-t"
                                  style={{ height }}
                                />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">
                                  {month.month}: {month.volume.toLocaleString()} searches
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Topics Section */}
              <div className="mt-8">
                <h4 className="text-base font-semibold text-foreground mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>Recommended Topics</span>
                    {topics.length > 0 && (
                      <Badge variant="secondary" className="text-xs px-2 py-0.5">
                        {topics.length} ideas
                      </Badge>
                    )}
                  </div>
                </h4>
                {topics.length === 0 ? (
                  <div className="text-center py-8 bg-muted/20 rounded-lg border-2 border-dashed">
                    <p className="text-sm text-muted-foreground">No topic suggestions available yet</p>
                    <p className="text-xs text-muted-foreground mt-1">Extract keywords to get topic recommendations</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {topics.map((t, i) => {
                      const isGenerating = generatingTopics.includes(t.topic);
                      return (
                        <div key={i} className="bg-card/50 backdrop-blur-sm border-2 rounded-lg p-4 hover:border-primary/20 hover:shadow-md transition-all duration-300">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-foreground mb-1" title={t.topic}>{t.topic}</p>
                              {t.reason && (
                                <p className="text-sm text-muted-foreground" title={t.reason}>{t.reason}</p>
                              )}
                              <div className="mt-2 flex items-center gap-2">
                                <Badge variant="secondary" className="text-xs">
                                  Relevance: {Math.round(t.score * 100)}%
                                </Badge>
                              </div>
                            </div>
                            <Button 
                              size="default"
                              variant="secondary"
                              onClick={() => generateArticle(t.topic)}
                              className="h-9 px-4 hover:bg-primary/20 hover:text-primary transition-colors"
                              disabled={isGenerating}
                            >
                              {isGenerating ? (
                                <>
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  Writing...
                                </>
                              ) : (
                                'Write Article'
                              )}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Re-extract button */}
              {keywords.length > 0 && (
                <div className="pt-6 flex justify-center">
                  <Button 
                    size="default"
                    variant="outline"
                    onClick={async () => await handleReExtract()} 
                    className="bg-background hover:bg-primary/10 hover:text-primary border-2 border-muted-foreground/20 hover:border-primary/30 transition-all duration-300 font-medium"
                    disabled={isReExtracting}
                  >
                    {isReExtracting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Extracting...
                      </>
                    ) : (
                      <>
                        Re-analyze Keywords
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );

  async function generateArticle(topic: string) {
    // Add topic to generating list
    setGeneratingTopics(prev => [...prev, topic]);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('Not authenticated');

      toast.info('Starting article generation...');

      // Get the blog ID
      const { data: blog } = await supabase
        .from('blogs')
        .select('id')
        .eq('user_id', session.user.id)
        .single();

      if (!blog?.id) {
        throw new Error('No blog found. Please connect your CMS first.');
      }

      // Use the generate-blog-post function with the topic as a parameter
      const { data, error } = await supabase.functions.invoke(
        'generate-blog-post',
        {
          body: { 
            blogId: blog.id,
            initialTopic: topic // This will be used to guide the article generation
          }
        }
      );

      if (error) throw error;

      if (data?.success) {
        toast.success('Article generated successfully!');
        return;
      } else {
        throw new Error('Failed to generate article');
      }

    } catch (err: any) {
      console.error('Failed to generate article:', err);
      
      // Handle specific error cases
      if (err.message?.includes('LOVABLE_API_KEY')) {
        toast.error('Article generation service is not properly configured');
      } else if (err.message?.includes('Not authenticated')) {
        toast.error('Please log in again to continue');
      } else if (err.message?.includes('No blog found')) {
        toast.error(err.message);
      } else if (err.message?.includes('FunctionsHttpError')) {
        toast.error('Generation service is currently unavailable. Please try again later.');
      } else {
        toast.error(err?.message || 'Failed to generate article');
      }
    } finally {
      // Remove topic from generating list whether it succeeded or failed
      setGeneratingTopics(prev => prev.filter(t => t !== topic));
    }
  }

  // ----- Helper functions -----
  async function fetchSEOStats(keywords: string[]) {
    try {
      console.log('Fetching SEO stats for keywords:', keywords);
      
      // Get the current session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }
      
      // Call Supabase function that wraps DataForSEO API
      const { data, error } = await supabase.functions.invoke('fetch-seo-data', {
        body: { keywords },
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        }
      });

      if (error) {
        console.error('Supabase function error:', error);
        throw error;
      }
      
      // Process the raw data into the expected format
      const processedData: Record<string, SEOStats> = {};
      
      if (data && typeof data === 'object') {
        Object.entries(data).forEach(([keyword, stats]: [string, any]) => {
          processedData[keyword.toLowerCase()] = {
            searchVolume: Number(stats.search_volume || stats.searchVolume) || 0,
            keywordDifficulty: Number(stats.keyword_difficulty || stats.keywordDifficulty) || 0,
            cpc: Number(stats.cpc) || 0,
            competition: Number(stats.competition_level || stats.competition) || 0,
            intent: (stats.intent || 'informational') as SEOStats['intent'],
            trendsData: Array.isArray(stats.monthly_searches || stats.trendsData) ? 
              (stats.monthly_searches || stats.trendsData).map((m: any) => ({
                month: String(m.month),
                volume: Number(m.search_volume || m.volume) || 0
              })) : undefined
          };
        });
      }
      
      console.log('Processed SEO data:', processedData);
      return processedData;
    } catch (err) {
      console.error('Error fetching SEO stats:', err);
      return null;
    }
  }

  async function handleReExtract() {
    setIsReExtracting(true);
    setErrorMsg(null);
    const table = kind === 'article' ? 'articles' : 'blog_posts';

    try {
      // First try to call the server-side proxy function with a short timeout
      const body: any = {};
      if (kind === 'article') body.article_id = id; else body.blog_post_id = id;

      // Try invoking the function with retries
      const maxRetries = 3;
      let lastError;
      
      for (let i = 0; i < maxRetries; i++) {
        try {
          const res = await supabase.functions.invoke('proxy-extract', { 
            body,
            headers: {
              'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
              'Content-Type': 'application/json',
            }
          });
          
          if (!res.error) {
            // Success - break out of retry loop
            return res;
          }
          
          lastError = res.error;
          console.warn(`Retry ${i + 1}/${maxRetries} failed:`, lastError);
          
          // Wait a bit before retrying
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
          
        } catch (e) {
          lastError = e;
          console.warn(`Retry ${i + 1}/${maxRetries} failed:`, e);
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
      }
      
      const res: any = { error: lastError };

      if (res && res.error) {
        // Check for specific error types
        const errorStr = String(res.error);
        if (errorStr.includes('CORS') || errorStr.includes('NetworkError')) {
          console.error('CORS or Network error:', res.error);
          toast.error('Network error - please try again');
          setIsReExtracting(false);
          return;
        }
        
        if (errorStr.includes('JWT') || errorStr.includes('auth')) {
          console.error('Authentication error:', res.error);
          toast.error('Session expired - please log in again');
          setIsReExtracting(false);
          return;
        }
        
        // For other errors, fallback to client-side extraction
        console.warn('proxy-extract failed, falling back to client-side extraction:', res.error);
        toast.warning('Server extraction failed — using local fallback');

        // fetch content/title so we can run local extractor
        const { data: rowData, error: rowErr } = await supabase
          .from(table)
          .select('title, content')
          .eq('id', id)
          .single();

        if (rowErr) throw rowErr;

        const title = (rowData as any)?.title || '';
        const content = (rowData as any)?.content || '';
        const extracted = clientExtract(`${title}\n\n${extractContentText(content)}`.trim(), title);

          // Debug log the initial extraction
        console.log('Initial extraction:', extracted);

        // Fetch SEO stats for extracted keywords
        const keywordsList = [...extracted.keywords.map(k => k.keyword), ...extracted.topics.map(t => t.topic)];
        console.log('Fetching SEO stats for keywords:', keywordsList);
        const seoData = await fetchSEOStats(keywordsList);

        if (seoData) {
          console.log('Processing keywords with SEO data');
          
          // Process keywords with SEO data
          const enhancedKeywords = extracted.keywords.map(k => {
            const stats = seoData[k.keyword.toLowerCase()];
            console.log(`Processing keyword "${k.keyword}":`, stats);
            
            if (!stats) return k;
            
            return {
              ...k,
              seoStats: {
                searchVolume: stats.searchVolume,
                keywordDifficulty: stats.keywordDifficulty,
                cpc: stats.cpc,
                competition: stats.competition,
                intent: stats.intent || 'informational',
                trendsData: stats.trendsData
              }
            } as KeywordItem;
          });
          
          // Sort keywords by SEO value
          enhancedKeywords.sort((a, b) => {
            const aScore = (a.seoStats?.searchVolume || 0) * a.score;
            const bScore = (b.seoStats?.searchVolume || 0) * b.score;
            return bScore - aScore;
          });
          
          // Process topics with SEO data
          const enhancedTopics = extracted.topics.map(t => {
            const stats = seoData[t.topic.toLowerCase()];
            if (!stats) return t;
            
            return {
              ...t,
              seoStats: {
                searchVolume: stats.searchVolume,
                keywordDifficulty: stats.keywordDifficulty,
                cpc: stats.cpc,
                competition: stats.competition,
                intent: stats.intent || 'informational',
                trendsData: stats.trendsData
              }
            } as TopicItem;
          });
          
          // Sort topics by SEO potential
          enhancedTopics.sort((a, b) => {
            const aScore = (a.seoStats?.searchVolume || 0) * (1 - (a.seoStats?.keywordDifficulty || 50) / 100);
            const bScore = (b.seoStats?.searchVolume || 0) * (1 - (b.seoStats?.keywordDifficulty || 50) / 100);
            return bScore - aScore;
          });
          
          // Update the extracted data with enhanced keywords and topics
          extracted.keywords = enhancedKeywords;
          extracted.topics = enhancedTopics;          // Debug log data before saving
          console.log('Final processed data:', {
            keywords: extracted.keywords,
            topics: extracted.topics
          });
        }

        setKeywords(extracted.keywords);
        setTopics(extracted.topics);

        // attempt to persist to DB (best-effort)
        try {
          // cast to any because DB types may not include the new JSONB columns yet
          await (supabase as any).from(table).update({ 
            extracted_keywords: extracted.keywords, 
            recommended_topics: extracted.topics 
          }).eq('id', id);
          toast.success('Local extraction saved to DB with SEO data');
        } catch (saveErr: any) {
          console.warn('Failed to save local extraction to DB:', saveErr);
        }
      } else {
        // invocation succeeded — refresh data after a short wait for the function to complete DB writes
        toast.success('Extraction started on server — refreshing shortly');
        setTimeout(() => fetchData(), 1400);
      }
    } catch (err: any) {
      console.error('Re-extract failed:', err);
      setErrorMsg(err?.message || 'Re-extract failed');
      toast.error(err?.message || 'Re-extract failed');
    } finally {
      setIsReExtracting(false);
    }
  }

  // Lightweight client-side extractor fallback (rule-based: unigrams + bigrams, stopwords, title boost)
  function clientExtract(text: string, title = ''): ExtractedData {
    // Comprehensive stopwords list
    const stopwords = new Set([
      // Common articles, prepositions, conjunctions
      'the', 'and', 'is', 'in', 'at', 'of', 'a', 'an', 'to', 'for', 'on', 'with', 'as', 'by',
      // Pronouns
      'that', 'this', 'it', 'i', 'you', 'he', 'she', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
      'my', 'your', 'his', 'its', 'our', 'their', 'mine', 'yours', 'theirs',
      // Common verbs and auxiliary verbs
      'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
      'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'can', 'could',
      // Common adverbs
      'very', 'really', 'just', 'now', 'then', 'here', 'there', 'when', 'where', 'why', 'how',
      // Other common words
      'from', 'or', 'but', 'not', 'what', 'all', 'if', 'about', 'which', 'get', 'got', 'into',
      'some', 'than', 'up', 'out', 'so', 'one', 'also', 'like', 'time', 'only', 'more'
    ]);

    // Helper to check if a word looks like a valid keyword
    const isValidKeyword = (word: string): boolean => {
      // Must be at least 3 characters long
      if (word.length < 3) return false;
      
      // Must not be just numbers
      if (/^\d+$/.test(word)) return false;
      
      // Must not contain special characters (except hyphens and spaces)
      if (/[^a-z0-9\s-]/.test(word)) return false;
      
      // Must contain at least one letter
      if (!/[a-z]/.test(word)) return false;
      
      return true;
    };

    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
    const ntext = normalize(text);
    const words = ntext.split(' ')
      .filter(Boolean)
      .filter(w => !stopwords.has(w))
      .filter(isValidKeyword);

    const counts = new Map<string, number>();
    for (const w of words) counts.set(w, (counts.get(w) || 0) + 1);

    // Extract and score bigrams and trigrams
    for (let n = 2; n <= 3; n++) {
      for (let i = 0; i + n <= words.length; i++) {
        const phrase = words.slice(i, i + n).join(' ');
        // Check if phrase makes sense (no stopwords at start/end)
        if (!stopwords.has(words[i]) && !stopwords.has(words[i + n - 1])) {
          counts.set(phrase, (counts.get(phrase) || 0) + n); // Boost multi-word phrases
        }
      }
    }

    const titleNorm = normalize(title);

    // Calculate TF-IDF like scoring
    const totalWords = words.length;
    const entries = Array.from(counts.entries())
      .map(([keyword, cnt]) => {
        let score = cnt;
        
        // Boost factors
        if (titleNorm && titleNorm.includes(keyword)) score *= 1.5; // Title presence boost
        if (keyword.includes(' ')) score *= 1.2; // Multi-word phrase boost
        if (/^[a-z]/.test(keyword)) score *= 1.1; // Start with letter boost
        
        // Normalize by length to prevent long phrases from dominating
        score = score / Math.sqrt(keyword.split(' ').length);
        
        // Normalize by document length
        score = score / Math.sqrt(totalWords);
        
        return { keyword, score };
      })
      .filter(({ keyword, score }) => {
        // Additional quality filters
        if (score < 0.01) return false; // Remove very low scoring keywords
        if (keyword.split(' ').length > 4) return false; // Max 4 words per phrase
        return true;
      });

    entries.sort((a, b) => b.score - a.score);

    // Take top keywords but ensure we don't include substrings of higher-ranked keywords
    const filteredEntries = entries.filter(({ keyword }, i) => {
      const isSubstring = entries
        .slice(0, i)
        .some(({ keyword: higherKeyword }) => 
          higherKeyword.includes(keyword) || keyword.includes(higherKeyword)
        );
      return !isSubstring;
    });

    const top = filteredEntries.slice(0, 15); // Reduce to top 15
    const maxScore = Math.max(...top.map(e => e.score));

    const keywords: ExtractedData['keywords'] = top.map(k => {
      // Get context for the keyword
      const keywordContext = getKeywordContext(text, k.keyword);
      
      return {
        keyword: k.keyword,
        score: +(k.score / maxScore).toFixed(3),
        source: 'local',
      };
    });

    // Group similar keywords and combine their scores
    const groupedTopics = new Map<string, { score: number; variations: string[]; contexts: string[] }>();
    
    keywords.forEach(k => {
      // Find if this keyword belongs to an existing group
      let added = false;
      for (const [mainTopic, group] of groupedTopics.entries()) {
        if (areKeywordsSimilar(k.keyword, mainTopic)) {
          group.score += k.score;
          group.variations.push(k.keyword);
          added = true;
          break;
        }
      }
      
      if (!added) {
        groupedTopics.set(k.keyword, {
          score: k.score,
          variations: [k.keyword],
          contexts: [getKeywordContext(text, k.keyword)]
        });
      }
    });

    // Convert groups to topics with engaging titles
    const generateTopicTitle = (keyword: string, context: string): string => {
      const words = keyword.toLowerCase().split(' ');
      const isService = words.includes('service') || words.includes('services');
      const isGuide = words.includes('guide') || words.includes('tutorial') || words.includes('how');
      const isList = words.includes('types') || words.includes('examples') || words.includes('ways');
      const isComparison = words.includes('vs') || words.includes('versus') || words.includes('compared');
      
      // Remove common words from keyword for cleaner incorporation
      const cleanKeyword = keyword
        .replace(/\b(service|services|guide|tutorial|how|to|types|of|ways|examples)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

      // Generate engaging titles based on context and keyword type
      if (isService) {
        return `Complete Guide to ${cleanKeyword} Services`;
      } else if (isGuide) {
        return `How to Master ${cleanKeyword}: Expert Tips`;
      } else if (isList) {
        return `Top Benefits of ${cleanKeyword} Explained`;
      } else if (isComparison) {
        const [first, , second] = cleanKeyword.split(' ');
        return `${first} vs ${second}: Which is Better?`;
      } else {
        // Generate different title patterns
        const patterns = [
          `Essential Guide to ${cleanKeyword}`,
          `Understanding ${cleanKeyword}: A Comprehensive Overview`,
          `${cleanKeyword} Mastery: Tips and Best Practices`,
          `Maximizing Results with ${cleanKeyword}`,
          `${cleanKeyword}: Expert Insights and Strategies`,
          `The Ultimate Guide to ${cleanKeyword}`,
          `Everything You Need to Know About ${cleanKeyword}`,
          `Exploring the Benefits of ${cleanKeyword}`
        ];
        
        // Use keyword hash to consistently select same pattern for same keyword
        const hash = Array.from(keyword).reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
        return patterns[Math.abs(hash) % patterns.length];
      }
    };

    const topics: ExtractedData['topics'] = Array.from(groupedTopics.entries())
      .map(([topic, group]) => {
        const cleanContext = group.contexts[0]?.replace(/[#*\n]/g, '').trim() || '';
        return {
          topic: generateTopicTitle(topic, cleanContext),
          score: Math.min(1, group.score), // Cap at 1
          reason: group.variations.length > 1
            ? `Based on key themes: ${group.variations.slice(0, 2).join(', ')}`
            : cleanContext ? `Popular topic in your content` : 'Recommended topic based on industry trends'
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 6) // Limit to top 6 for better focus

    return { keywords, topics };
  }

  // Helper function to get context for a keyword
  function getKeywordContext(text: string, keyword: string): string {
    const sentences = text.split(/[.!?]+/);
    for (const sentence of sentences) {
      if (sentence.toLowerCase().includes(keyword.toLowerCase())) {
        // Clean and truncate the context
        return sentence.trim()
          .replace(/\s+/g, ' ')
          .slice(0, 100) + (sentence.length > 100 ? '...' : '');
      }
    }
    return '';
  }

  // Helper function to check if two keywords are similar
  function areKeywordsSimilar(a: string, b: string): boolean {
    const normalize = (s: string) => s.toLowerCase().trim();
    const aWords = new Set(normalize(a).split(/\s+/));
    const bWords = new Set(normalize(b).split(/\s+/));
    
    // Check for complete containment
    if (normalize(a).includes(normalize(b)) || normalize(b).includes(normalize(a))) {
      return true;
    }
    
    // Check for significant word overlap
    const intersection = new Set([...aWords].filter(x => bWords.has(x)));
    const union = new Set([...aWords, ...bWords]);
    
    // Calculate Jaccard similarity
    return intersection.size / union.size > 0.5;
  
  }

  // extract plain text from content field which may be JSON or markdown
  function extractContentText(content: any) {
    if (!content) return '';
    if (typeof content === 'string') return content;
    try {
      // some content is stored as { title, content }
      if (content?.content && typeof content.content === 'string') return content.content;
      return JSON.stringify(content);
    } catch {
      return String(content);
    }
  }
}
