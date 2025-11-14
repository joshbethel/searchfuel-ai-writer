import { useState } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, parseISO, addMonths, subMonths } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

interface Article {
  id: string;
  title: string;
  slug: string;
  status: string;
  publishing_status: string | null;
  scheduled_publish_date?: string | null;
  created_at: string;
  article_type: string | null;
  excerpt?: string | null;
}

interface MonthlyCalendarViewProps {
  articles: Article[];
  onViewArticle: (id: string) => void;
  onEditArticle: (id: string) => void;
}

export function MonthlyCalendarView({ articles, onViewArticle }: MonthlyCalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Get articles for a specific date
  const getArticlesForDate = (date: Date) => {
    return articles.filter((article) => {
      if (!article.scheduled_publish_date) return false;
      return isSameDay(parseISO(article.scheduled_publish_date), date);
    });
  };

  // Get total articles in current month
  const articlesThisMonth = articles.filter((article) => {
    if (!article.scheduled_publish_date) return false;
    const articleDate = parseISO(article.scheduled_publish_date);
    return isSameMonth(articleDate, currentMonth);
  }).length;

  // Days of week
  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  // Get the starting day of week (0 = Sunday, 1 = Monday, etc.)
  const startDayOfWeek = monthStart.getDay();
  const adjustedStartDay = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1; // Convert to Monday = 0

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published':
        return 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20';
      case 'scheduled':
        return 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20';
      case 'failed':
        return 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20';
      default:
        return 'bg-primary/10 text-primary border-primary/20';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
        <p className="text-muted-foreground mt-1">Plan and schedule your articles</p>
      </div>

      {/* Calendar Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            onClick={() => setCurrentMonth(new Date())}
          >
            Today
          </Button>
          <span className="text-sm font-medium ml-2">
            {format(currentMonth, 'MMM yyyy')} - {format(addMonths(currentMonth, 1), 'MMM yyyy')}
          </span>
        </div>
      </div>

      {/* Month and Article Count */}
      <div>
        <h2 className="text-2xl font-semibold">{format(currentMonth, 'MMMM yyyy')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{articlesThisMonth} articles this month</p>
      </div>

      {/* Calendar Grid */}
      <Card className="p-6">
        <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
          {/* Week Day Headers */}
          {weekDays.map((day) => (
            <div key={day} className="bg-muted p-3 text-center">
              <span className="text-sm font-medium text-muted-foreground">{day}</span>
            </div>
          ))}

          {/* Empty cells before month starts */}
          {Array.from({ length: adjustedStartDay }).map((_, i) => (
            <div key={`empty-${i}`} className="bg-background min-h-[140px] p-3" />
          ))}

          {/* Days of month */}
          {daysInMonth.map((day) => {
            const dayArticles = getArticlesForDate(day);
            const dayNumber = format(day, 'd');
            const dayName = format(day, 'EEE');

            return (
              <div
                key={day.toISOString()}
                className="bg-background min-h-[140px] p-3 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{dayNumber}</span>
                  <span className="text-xs text-muted-foreground">{dayName}</span>
                </div>

                <div className="space-y-2">
                  {dayArticles.map((article) => (
                    <div
                      key={article.id}
                      className="p-2 bg-card border rounded-md space-y-1.5 hover:bg-accent/50 transition-colors"
                    >
                      <Badge
                        variant="outline"
                        className={cn("text-xs uppercase font-medium", getStatusColor(article.publishing_status || 'pending'))}
                      >
                        {article.publishing_status || 'pending'}
                      </Badge>
                      <h4 className="text-xs font-medium line-clamp-2">{article.title}</h4>
                      {article.excerpt && (
                        <p className="text-xs text-muted-foreground line-clamp-1">{article.excerpt}</p>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 text-xs hover:bg-transparent"
                        onClick={() => onViewArticle(article.id)}
                      >
                        <Eye className="w-3 h-3 mr-1" />
                        View Article
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
