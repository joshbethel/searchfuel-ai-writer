import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";

interface ScheduleKeywordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  keyword: string;
  onScheduled?: () => void;
}

export function ScheduleKeywordDialog({
  open,
  onOpenChange,
  keyword,
  onScheduled,
}: ScheduleKeywordDialogProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [isScheduling, setIsScheduling] = useState(false);

  const handleSchedule = async () => {
    if (!selectedDate) {
      toast.error("Please select a date");
      return;
    }

    try {
      setIsScheduling(true);

      // Get user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please sign in");
        return;
      }

      // Get user's blog
      const { data: blog, error: blogError } = await supabase
        .from("blogs")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (blogError || !blog) {
        toast.error("No blog found");
        return;
      }

      // Check if date already has a scheduled post
      const { data: existingScheduled } = await supabase
        .from("scheduled_keywords")
        .select("id")
        .eq("blog_id", blog.id)
        .eq("scheduled_date", selectedDate.toISOString())
        .eq("status", "pending")
        .maybeSingle();

      if (existingScheduled) {
        toast.error("This date already has a scheduled post");
        return;
      }

      // Schedule the keyword
      const { error: scheduleError } = await supabase
        .from("scheduled_keywords")
        .insert({
          blog_id: blog.id,
          user_id: user.id,
          keyword,
          scheduled_date: selectedDate.toISOString(),
          status: "pending",
        });

      if (scheduleError) throw scheduleError;

      toast.success(`Scheduled "${keyword}" for ${format(selectedDate, 'MMM d, yyyy')}`);
      onOpenChange(false);
      onScheduled?.();
    } catch (error) {
      console.error("Error scheduling keyword:", error);
      toast.error("Failed to schedule keyword");
    } finally {
      setIsScheduling(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Schedule Article Generation</DialogTitle>
          <DialogDescription>
            Select a date to automatically generate and publish an article for "{keyword}"
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-center py-4">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            disabled={(date) => date < new Date()}
            className="rounded-md border"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSchedule} disabled={!selectedDate || isScheduling}>
            {isScheduling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
