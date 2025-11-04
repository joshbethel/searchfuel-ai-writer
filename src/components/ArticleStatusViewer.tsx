import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Clock, CalendarClock } from "lucide-react";

interface ArticleStatus {
  id: string;
  publishing_status: string;
  scheduled_for: string | null;
  last_published_at: string | null;
  external_post_id: string | null;
  external_post_url: string | null;
}

export function ArticleStatusViewer({ articleId }: { articleId: string }) {
  const [status, setStatus] = useState<ArticleStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (articleId) fetchStatus();
  }, [articleId]);

  const fetchStatus = async () => {
    try {
      const { data, error } = await supabase
        .from("articles")
        .select("id, publishing_status, scheduled_for, last_published_at, external_post_id, external_post_url")
        .eq("id", articleId)
        .single();

      if (error) throw error;
      setStatus(data as ArticleStatus);
    } catch (error: any) {
      console.error("Error fetching status:", error);
      toast.error("Failed to load article status");
    } finally {
      setIsLoading(false);
    }
  };

  const resetPostStatus = async () => {
    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from("articles")
        .update({ 
          publishing_status: 'pending',
          external_post_id: null,
          external_post_url: null,
          last_published_at: null
        })
        .eq("id", articleId);

      if (error) throw error;
      
      toast.success("Article status reset to pending");
      await fetchStatus();
    } catch (error: any) {
      toast.error("Failed to reset status: " + error.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const getStatusDisplay = (status: ArticleStatus | null) => {
    if (!status) return {
      color: 'bg-gray-100 dark:bg-gray-900/30 text-gray-800 dark:text-gray-300 border-gray-300 dark:border-gray-800',
      icon: '❔',
      text: 'Unknown'
    };

    switch (status.publishing_status) {
      case 'scheduled':
        return {
          color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-800',
          icon: '🕒',
          text: 'Scheduled'
        };
      case 'pending':
        return {
          color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 border-yellow-300 dark:border-yellow-800',
          icon: '⌛',
          text: 'Pending'
        };
      case 'published':
        return {
          color: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border-green-300 dark:border-green-800',
          icon: '✅',
          text: 'Published'
        };
      case 'failed':
        return {
          color: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 border-red-300 dark:border-red-800',
          icon: '❌',
          text: 'Failed'
        };
      case 'publishing':
        return {
          color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-800',
          icon: '📤',
          text: 'Publishing'
        };
      default:
        return {
          color: 'bg-gray-100 dark:bg-gray-900/30 text-gray-800 dark:text-gray-300 border-gray-300 dark:border-gray-800',
          icon: '❔',
          text: status.publishing_status || 'Not Set'
        };
    }
  };

  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      </Card>
    );
  }

  const statusDisplay = getStatusDisplay(status);

  return (
    <Card className={`w-full p-5 border-2 ${
      status?.publishing_status === 'scheduled' ? 'border-purple-200 dark:border-purple-800/30 bg-purple-50/50 dark:bg-purple-900/10' :
      status?.publishing_status === 'published' ? 'border-green-200 dark:border-green-800/30 bg-green-50/50 dark:bg-green-900/10' :
      'border-muted bg-card/50'
    }`}>
      <div className="flex flex-col sm:flex-row items-start gap-4">
        <div className="flex-1 space-y-4">
          <div className="flex items-center gap-3">
            <Badge className={`${statusDisplay.color} border text-sm px-4 py-1.5 font-medium`}>
              <span className="mr-2">{statusDisplay.icon}</span>
              {statusDisplay.text}
            </Badge>
          </div>
          
          <div className="flex flex-wrap gap-6 text-sm">
            {status?.scheduled_for && (
              <div className="flex items-center gap-2.5 text-purple-600 dark:text-purple-400 font-medium">
                <CalendarClock className="w-4 h-4" />
                <span>Scheduled for: {new Date(status.scheduled_for).toLocaleString()}</span>
              </div>
            )}
            {status?.last_published_at && (
              <div className="flex items-center gap-2.5 text-green-600 dark:text-green-400 font-medium">
                <Clock className="w-4 h-4" />
                <span>Published on: {new Date(status.last_published_at).toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 ml-auto">
          {status?.external_post_url && (
            <Button
              size="sm"
              variant="outline"
              className="h-9 px-4 hover:bg-secondary/80"
              onClick={() => window.open(status.external_post_url, '_blank')}
            >
              View Post
            </Button>
          )}
          {status?.publishing_status !== 'pending' && (
            <Button 
              size="sm" 
              variant="outline"
              onClick={resetPostStatus}
              className="h-9 px-4 hover:bg-muted/50"
              disabled={isUpdating}
            >
              {isUpdating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Resetting...
                </>
              ) : (
                'Reset to Pending'
              )}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}