import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, isSameDay, parseISO, startOfMonth, endOfMonth } from "date-fns";
import { cn } from "@/lib/utils";
import { Eye, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Article {
  id: string;
  title: string;
  slug: string;
  status: string;
  publishing_status: string | null;
  scheduled_publish_date?: string | null;
  created_at: string;
  article_type: string | null;
}

interface ArticleCalendarProps {
  articles: Article[];
  onViewArticle: (id: string) => void;
  onEditArticle: (id: string) => void;
}

export function ArticleCalendar({ articles, onViewArticle, onEditArticle }: ArticleCalendarProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());

  // Get articles for selected date
  const getArticlesForDate = (date: Date) => {
    return articles.filter((article) => {
      if (!article.scheduled_publish_date) return false;
      return isSameDay(parseISO(article.scheduled_publish_date), date);
    });
  };

  // Get all dates that have articles in current month
  const getDatesWithArticles = () => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    
    return articles
      .filter((article) => {
        if (!article.scheduled_publish_date) return false;
        const articleDate = parseISO(article.scheduled_publish_date);
        return articleDate >= start && articleDate <= end;
      })
      .map((article) => parseISO(article.scheduled_publish_date!));
  };

  const datesWithArticles = getDatesWithArticles();
  const selectedDateArticles = selectedDate ? getArticlesForDate(selectedDate) : [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'scheduled':
        return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'failed':
        return 'bg-red-100 text-red-700 border-red-200';
      default:
        return 'bg-blue-100 text-blue-700 border-blue-200';
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Calendar */}
      <Card className="lg:col-span-2 p-6">
        <h3 className="text-lg font-semibold mb-4">Article Schedule</h3>
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={setSelectedDate}
          month={currentMonth}
          onMonthChange={setCurrentMonth}
          className="rounded-md border"
          modifiers={{
            hasArticles: datesWithArticles,
          }}
          modifiersStyles={{
            hasArticles: {
              fontWeight: 'bold',
              textDecoration: 'underline',
              color: 'hsl(var(--primary))',
            },
          }}
        />
      </Card>

      {/* Articles for selected date */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">
          {selectedDate ? format(selectedDate, 'MMMM d, yyyy') : 'Select a date'}
        </h3>
        
        {selectedDateArticles.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No articles scheduled for this date
          </p>
        ) : (
          <div className="space-y-3">
            {selectedDateArticles.map((article) => (
              <div
                key={article.id}
                className="p-3 border rounded-lg space-y-2 hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-medium text-sm line-clamp-2">{article.title}</h4>
                  <Badge
                    variant="outline"
                    className={cn("text-xs shrink-0", getStatusColor(article.publishing_status || 'pending'))}
                  >
                    {article.publishing_status || 'pending'}
                  </Badge>
                </div>
                
                {article.scheduled_publish_date && (
                  <p className="text-xs text-muted-foreground">
                    {format(parseISO(article.scheduled_publish_date), 'h:mm a')}
                  </p>
                )}

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => onViewArticle(article.id)}
                  >
                    <Eye className="w-3 h-3 mr-1" />
                    View
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => onEditArticle(article.id)}
                  >
                    <Edit className="w-3 h-3 mr-1" />
                    Edit
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
