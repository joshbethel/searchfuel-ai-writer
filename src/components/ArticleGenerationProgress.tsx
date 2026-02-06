import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  FileText, 
  Send, 
  Sparkles,
  Clock,
  X,
  RefreshCw
} from "lucide-react";
import { cn } from "@/lib/utils";

export type GenerationStep = 'idle' | 'generating' | 'publishing' | 'complete' | 'error';

export interface GenerationResult {
  success: boolean;
  articleTitle?: string;
  articleId?: string;
  publishingSuccess?: boolean;
  publishingError?: string;
  error?: string;
  isScheduled?: boolean;
  scheduledDate?: string;
}

interface ArticleGenerationProgressProps {
  step: GenerationStep;
  result: GenerationResult | null;
  onDismiss: () => void;
  onRetry?: () => void;
  onRetryPublish?: () => void;
  cmsPlatform?: string | null;
}

const GENERATION_STEPS = [
  { key: 'generating', label: 'Generating Article', icon: Sparkles, description: 'AI is writing your article...' },
  { key: 'publishing', label: 'Publishing', icon: Send, description: 'Publishing to your CMS...' },
  { key: 'complete', label: 'Complete', icon: CheckCircle2, description: 'All done!' },
];

export function ArticleGenerationProgress({
  step,
  result,
  onDismiss,
  onRetry,
  onRetryPublish,
  cmsPlatform,
}: ArticleGenerationProgressProps) {
  const [elapsedTime, setElapsedTime] = useState(0);

  // Timer for elapsed time
  useEffect(() => {
    if (step === 'generating' || step === 'publishing') {
      const interval = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    } else if (step === 'idle') {
      setElapsedTime(0);
    }
  }, [step]);

  if (step === 'idle') return null;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const getStepStatus = (stepKey: string) => {
    const stepOrder = ['generating', 'publishing', 'complete'];
    const currentIndex = stepOrder.indexOf(step);
    const stepIndex = stepOrder.indexOf(stepKey);

    if (step === 'error') {
      // If error occurred during generating, mark generating as failed
      if (stepKey === 'generating' && !result?.articleId) return 'error';
      // If error occurred during publishing, mark generating as complete, publishing as failed
      if (stepKey === 'generating' && result?.articleId) return 'complete';
      if (stepKey === 'publishing' && result?.articleId) return 'error';
      return 'pending';
    }

    // When step is 'complete', all steps including 'complete' should show as complete
    if (step === 'complete') return 'complete';

    if (stepIndex < currentIndex) return 'complete';
    if (stepIndex === currentIndex) return 'active';
    return 'pending';
  };

  const getProgress = () => {
    switch (step) {
      case 'generating': return 33;
      case 'publishing': return 66;
      case 'complete': return 100;
      case 'error': return result?.articleId ? 50 : 20;
      default: return 0;
    }
  };

  const isRunning = step === 'generating' || step === 'publishing';
  const isComplete = step === 'complete';
  const isError = step === 'error';

  return (
    <Card className={cn(
      "border-2 transition-all duration-300 mb-6",
      isRunning && "border-blue-500 bg-blue-500/5 animate-pulse",
      isComplete && "border-green-500 bg-green-500/5",
      isError && "border-red-500 bg-red-500/5"
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isRunning && (
              <div className="relative">
                <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                <div className="absolute inset-0 w-6 h-6 rounded-full bg-blue-500/20 animate-ping" />
              </div>
            )}
            {isComplete && <CheckCircle2 className="w-6 h-6 text-green-500" />}
            {isError && <XCircle className="w-6 h-6 text-red-500" />}
            <div>
              <CardTitle className="text-lg">
                {isRunning && "Generating Article..."}
                {isComplete && "Article Ready!"}
                {isError && "Generation Issue"}
              </CardTitle>
              {isRunning && (
                <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                  <Clock className="w-3 h-3" />
                  Elapsed: {formatTime(elapsedTime)}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Show "Retry Publish" when article was generated but publishing failed */}
            {isError && result?.success && result?.publishingError && onRetryPublish && (
              <Button variant="outline" size="sm" onClick={onRetryPublish}>
                <Send className="w-4 h-4 mr-1" />
                Retry Publish
              </Button>
            )}
            {/* Show "Retry" (regenerate) only when article generation itself failed */}
            {isError && !result?.success && onRetry && (
              <Button variant="outline" size="sm" onClick={onRetry}>
                <RefreshCw className="w-4 h-4 mr-1" />
                Retry
              </Button>
            )}
            {!isRunning && (
              <Button variant="ghost" size="icon" onClick={onDismiss}>
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress bar */}
        <Progress value={getProgress()} className="h-2" />

        {/* Steps */}
        <div className="flex justify-between">
          {GENERATION_STEPS.map((s, index) => {
            const status = getStepStatus(s.key);
            const Icon = s.icon;
            
            // Skip publishing step for Framer
            if (s.key === 'publishing' && cmsPlatform === 'framer') {
              return null;
            }
            
            return (
              <div 
                key={s.key} 
                className={cn(
                  "flex flex-col items-center gap-2 flex-1",
                  status === 'pending' && "opacity-40"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                  status === 'active' && "bg-blue-500 text-white",
                  status === 'complete' && "bg-green-500 text-white",
                  status === 'error' && "bg-red-500 text-white",
                  status === 'pending' && "bg-muted text-muted-foreground"
                )}>
                  {status === 'active' && <Loader2 className="w-5 h-5 animate-spin" />}
                  {status === 'complete' && <CheckCircle2 className="w-5 h-5" />}
                  {status === 'error' && <XCircle className="w-5 h-5" />}
                  {status === 'pending' && <Icon className="w-5 h-5" />}
                </div>
                <span className={cn(
                  "text-xs font-medium text-center",
                  status === 'active' && "text-blue-500",
                  status === 'complete' && "text-green-500",
                  status === 'error' && "text-red-500"
                )}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Result Details */}
        {result && (
          <div className="pt-3 border-t space-y-3">
            {result.articleTitle && (
              <div className="flex items-start gap-2">
                <FileText className="w-4 h-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium">{result.articleTitle}</p>
                  {result.articleId && (
                    <p className="text-xs text-muted-foreground font-mono">ID: {result.articleId}</p>
                  )}
                </div>
              </div>
            )}

            {/* Status badges */}
            <div className="flex flex-wrap gap-2">
              {result.success && (
                <Badge variant="default" className="bg-green-600">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Article Generated
                </Badge>
              )}
              
              {result.isScheduled && result.scheduledDate && (
                <Badge variant="secondary" className="bg-purple-600 text-white">
                  <Clock className="w-3 h-3 mr-1" />
                  Scheduled: {new Date(result.scheduledDate).toLocaleDateString()}
                </Badge>
              )}
              
              {!result.isScheduled && result.publishingSuccess && (
                <Badge variant="default" className="bg-green-600">
                  <Send className="w-3 h-3 mr-1" />
                  Published to CMS
                </Badge>
              )}
              
              {!result.isScheduled && cmsPlatform === 'framer' && result.success && (
                <Badge variant="secondary" className="bg-blue-600 text-white">
                  <Clock className="w-3 h-3 mr-1" />
                  Pending (Manual Sync Required)
                </Badge>
              )}
              
              {result.publishingError && (
                <Badge variant="destructive">
                  <XCircle className="w-3 h-3 mr-1" />
                  Publishing Failed
                </Badge>
              )}
            </div>

            {/* Error message */}
            {(result.error || result.publishingError) && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-md">
                <p className="text-sm text-red-600">
                  {result.error || result.publishingError}
                </p>
              </div>
            )}

            {/* Framer instructions */}
            {cmsPlatform === 'framer' && result.success && !result.isScheduled && (
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-md">
                <p className="text-sm text-blue-600">
                  <strong>Next Step:</strong> Copy the Post ID and use the Framer plugin to sync this article, then click "Publish" to update its status.
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
