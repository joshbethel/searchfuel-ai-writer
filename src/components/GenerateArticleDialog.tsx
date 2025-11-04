import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface GenerateArticleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (scheduleDate?: Date) => Promise<void>;
  isGenerating: boolean;
}

export function GenerateArticleDialog({
  open,
  onOpenChange,
  onGenerate,
  isGenerating,
}: GenerateArticleDialogProps) {
  const [date, setDate] = useState<Date>();
  const [time, setTime] = useState<string>("09:00");

  const handleGenerate = async () => {
    let scheduleDate: Date | undefined;
    
    if (date) {
      // Combine date and time
      scheduleDate = new Date(date);
      const [hours, minutes] = time.split(":").map(Number);
      scheduleDate.setHours(hours, minutes, 0, 0);
    }

    await onGenerate(scheduleDate);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate New Article</DialogTitle>
          <DialogDescription>
            Choose when to publish the article to your CMS. Leave empty for immediate publishing.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <label className="text-sm font-medium">Publication Date</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "justify-start text-left font-normal",
                    !date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Publication Time</label>
            <Select value={time} onValueChange={setTime}>
              <SelectTrigger>
                <SelectValue placeholder="Select a time" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 24 }, (_, hour) => [
                    <SelectItem 
                      key={`${hour}-00`} 
                      value={`${hour.toString().padStart(2, "0")}:00`}
                    >
                      {`${hour.toString().padStart(2, "0")}:00`}
                    </SelectItem>,
                    <SelectItem 
                      key={`${hour}-30`} 
                      value={`${hour.toString().padStart(2, "0")}:30`}
                    >
                      {`${hour.toString().padStart(2, "0")}:30`}
                    </SelectItem>
                  ]).flat()}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Generate Article
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}