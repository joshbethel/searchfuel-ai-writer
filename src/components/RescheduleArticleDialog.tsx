import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, CalendarIcon } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

interface RescheduleArticleDialogProps {
  articleId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  currentScheduledDate?: string | null;
}

export function RescheduleArticleDialog({ 
  articleId, 
  open, 
  onOpenChange, 
  onSaved,
  currentScheduledDate 
}: RescheduleArticleDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [scheduledDate, setScheduledDate] = useState<Date>();
  const [scheduledTime, setScheduledTime] = useState("");

  useEffect(() => {
    if (open && currentScheduledDate) {
      try {
        const date = parseISO(currentScheduledDate);
        setScheduledDate(date);
        setScheduledTime(format(date, "HH:mm"));
      } catch (error) {
        // If parsing fails, set to current date/time
        const now = new Date();
        setScheduledDate(now);
        setScheduledTime(format(now, "HH:mm"));
      }
    } else if (open) {
      // If no current date, set to tomorrow at 8 AM
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(8, 0, 0, 0);
      setScheduledDate(tomorrow);
      setScheduledTime(format(tomorrow, "HH:mm"));
    }
  }, [open, currentScheduledDate]);

  const handleSave = async () => {
    if (!articleId) return;

    if (!scheduledDate || !scheduledTime) {
      toast.error("Please select both date and time");
      return;
    }

    setIsSaving(true);
    try {
      // Combine date and time into ISO string (treat as local time, then convert to UTC)
      const [hours, minutes] = scheduledTime.split(":").map(Number);
      const scheduledDateTime = new Date(scheduledDate);
      scheduledDateTime.setHours(hours, minutes, 0, 0);
      const isoString = scheduledDateTime.toISOString();

      const { error } = await supabase
        .from("blog_posts")
        .update({
          scheduled_publish_date: isoString,
          publishing_status: "scheduled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", articleId);

      if (error) throw error;

      toast.success("Article rescheduled successfully!");
      onSaved();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error rescheduling article:", error);
      toast.error(error.message || "Failed to reschedule article");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveSchedule = async () => {
    if (!articleId) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("blog_posts")
        .update({
          scheduled_publish_date: null,
          publishing_status: "pending",
          updated_at: new Date().toISOString(),
        })
        .eq("id", articleId);

      if (error) throw error;

      toast.success("Schedule removed. Article is now pending.");
      onSaved();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error removing schedule:", error);
      toast.error(error.message || "Failed to remove schedule");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5" />
            Reschedule Article
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Scheduled Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !scheduledDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {scheduledDate ? format(scheduledDate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={scheduledDate}
                  onSelect={setScheduledDate}
                  initialFocus
                  disabled={(date) => date < new Date()}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label htmlFor="scheduled-time">Scheduled Time</Label>
            <Input
              id="scheduled-time"
              type="time"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
            />
          </div>

          {scheduledDate && scheduledTime && (() => {
            try {
              const [hours, minutes] = scheduledTime.split(":").map(Number);
              const previewDate = new Date(scheduledDate);
              previewDate.setHours(hours, minutes, 0, 0);
              const formattedDate = format(previewDate, "PPP 'at' p");
              return (
                <div className="p-3 bg-muted rounded-md border border-border">
                  <p className="text-sm text-muted-foreground">
                    Article will be published on{" "}
                    <span className="font-semibold text-foreground">
                      {formattedDate}
                    </span>
                  </p>
                </div>
              );
            } catch (error) {
              console.error("Error formatting preview date:", error);
              return null;
            }
          })()}
        </div>

        <DialogFooter className="!flex !flex-row !justify-between !items-center gap-2 w-full">
          {currentScheduledDate && (
            <Button
              variant="outline"
              onClick={handleRemoveSchedule}
              disabled={isSaving}
              className="flex-shrink-0"
            >
              Remove Schedule
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Schedule
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

