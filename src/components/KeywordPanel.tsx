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

  useEffect(() => {
    if (!id) return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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
    <Card className="p-4 bg-card">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        {/* Preview Mode (Collapsed) */}
        <div className="flex items-start justify-between gap-4 mb-2">
          <div className="flex-1 min-w-0">
            {errorMsg ? (
              <div className="flex items-center gap-2">
                <p className="text-xs text-destructive">Failed to load keywords</p>
                <Button size="sm" variant="outline" onClick={fetchData} disabled={isReExtracting} className="h-6 text-xs">
                  {isReExtracting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                  Retry
                </Button>
              </div>
            ) : keywords.length === 0 ? (
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground">No keywords extracted</p>
                <Button size="sm" onClick={async () => await handleReExtract()} className="h-6 text-xs">
                  {isReExtracting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                  Extract
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5 items-center">
                {keywords.slice(0, 3).map((k) => (
                  <Badge 
                    key={k.keyword} 
                    variant="outline" 
                    className="px-1.5 py-0.5 text-xs whitespace-nowrap"
                  >
                    {k.keyword}
                  </Badge>
                ))}
                {keywords.length > 3 && (
                  <span className="text-xs text-muted-foreground">+{keywords.length - 3} more</span>
                )}
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
                <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center justify-between">
                  <span>Keywords</span>
                  {keywords.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {keywords.length}
                    </Badge>
                  )}
                </h4>
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                  {keywords.map((k) => (
                    <div 
                      key={k.keyword}
                      className="bg-card border rounded-md p-3 hover:shadow-sm transition-shadow"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1">
                          <h4 className="text-sm font-medium text-foreground">{k.keyword}</h4>
                          <div className="flex items-center gap-1.5 mt-1">
                            <Badge variant="secondary" className="text-xs">
                              Relevance: {(k.score * 100).toFixed(0)}%
                            </Badge>
                            {k.seoStats?.intent && (
                              <Badge 
                                variant="outline" 
                                className={`text-xs capitalize ${
                                  k.seoStats.intent === 'transactional' ? "text-green-600" :
                                  k.seoStats.intent === 'commercial' ? "text-blue-600" :
                                  k.seoStats.intent === 'informational' ? "text-orange-600" : ""
                                }`}
                              >
                                {k.seoStats.intent}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {k.seoStats && (
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-2">
                                  <TrendingUp className="w-4 h-4 text-blue-500" />
                                  <div>
                                    <div className="font-medium">
                                      {k.seoStats.searchVolume?.toLocaleString() || '0'}
                                    </div>
                                    <div className="text-xs text-muted-foreground">Monthly Searches</div>
                                  </div>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Average monthly search volume</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>

                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-2">
                                  <Target className="w-4 h-4 text-orange-500" />
                                  <div>
                                    <div className="font-medium">
                                      {k.seoStats.keywordDifficulty 
                                        ? `${k.seoStats.keywordDifficulty}%` 
                                        : 'N/A'
                                      }
                                    </div>
                                    <div className="text-xs text-muted-foreground">Difficulty</div>
                                  </div>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>How difficult it is to rank for this keyword</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>

                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-2">
                                  <DollarSign className="w-4 h-4 text-green-500" />
                                  <div>
                                    <div className="font-medium">
                                      {k.seoStats.cpc 
                                        ? `$${k.seoStats.cpc.toFixed(2)}` 
                                        : 'N/A'
                                      }
                                    </div>
                                    <div className="text-xs text-muted-foreground">CPC</div>
                                  </div>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Average cost per click for ads</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>

                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-2">
                                  <BarChart3 className="w-4 h-4 text-purple-500" />
                                  <div>
                                    <div className="font-medium">
                                      {k.seoStats.competition 
                                        ? `${(k.seoStats.competition * 100).toFixed(0)}%`
                                        : 'N/A'
                                      }
                                    </div>
                                    <div className="text-xs text-muted-foreground">Competition</div>
                                  </div>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Level of competition for this keyword</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      )}

                      {k.seoStats?.trendsData && k.seoStats.trendsData.length > 0 && (
                        <div className="mt-3 pt-3 border-t">
                          <div className="text-xs text-muted-foreground mb-1">Search Volume Trend</div>
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
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Topics Section */}
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center justify-between">
                  <span>Recommended Topics</span>
                  {topics.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {topics.length}
                    </Badge>
                  )}
                </h4>
                {topics.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No suggestions yet</p>
                ) : (
                  <div className="space-y-1.5">
                    {topics.map((t, i) => (
                      <div key={i} className="bg-secondary/30 rounded-sm p-2 flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate" title={t.topic}>{t.topic}</p>
                          {t.reason && (
                            <p className="text-xs text-muted-foreground truncate" title={t.reason}>{t.reason}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs text-foreground">{Math.round(t.score * 100)}%</span>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => createDraft(t.topic)}
                            className="h-7 text-xs"
                          >
                            Create Draft
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Re-extract button */}
              {keywords.length > 0 && (
                <div className="pt-2">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={async () => await handleReExtract()} 
                    className="h-7 text-xs"
                    disabled={isReExtracting}
                  >
                    {isReExtracting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                    Re-extract Keywords
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );

  async function createDraft(topic: string) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Create a draft article in articles table using topic as title
      const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const { data, error } = await supabase
        .from('articles')
        .insert({
          user_id: user.id,
          title: topic,
          keyword: topic,
          intent: 'informational',
          content: { title: topic, content: '' },
          status: 'draft',
          // some DB schemas require website_url; provide empty string as safe default
          website_url: ''
        })
        .select()
        .single();

      if (error) throw error;
      toast.success('Draft created');
      // navigate to edit page if exists - left as manual step
    } catch (err: any) {
      console.error('Failed to create draft from topic:', err);
      toast.error(err?.message || 'Failed to create draft');
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
    const stopwords = new Set([
      'the','and','is','in','at','of','a','an','to','for','on','with','as','by','that','this','it','from','be','are','or','was','were','will','can','has','have'
    ]);

    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const ntext = normalize(text);
    const words = ntext.split(' ').filter(Boolean).filter(w => !stopwords.has(w));

    const counts = new Map<string, number>();
    for (const w of words) counts.set(w, (counts.get(w) || 0) + 1);

    // bigrams
    for (let i = 0; i + 1 < words.length; i++) {
      const big = `${words[i]} ${words[i+1]}`;
      counts.set(big, (counts.get(big) || 0) + 1);
    }

    const titleNorm = normalize(title);

    const entries = Array.from(counts.entries()).map(([keyword, cnt]) => {
      let score = cnt;
      if (titleNorm && titleNorm.includes(keyword)) score += 2; // title boost
      return { keyword, score };
    });

    entries.sort((a,b) => b.score - a.score);

    const top = entries.slice(0, 20);
    const maxScore = top[0]?.score || 1;

    const keywords: ExtractedData['keywords'] = top.map(k => ({
      keyword: k.keyword,
      score: +(k.score / maxScore).toFixed(3),
      source: 'local',
    }));

    // Recommended topics are just the top 5 keywords with reasons
    const topics: ExtractedData['topics'] = keywords.slice(0,5).map(k => ({
      topic: k.keyword,
      score: k.score,
      reason: 'Top occurrence'
    }));

    return { keywords, topics };
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
