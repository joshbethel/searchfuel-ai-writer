import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PublishDialogProps {
  blog: {
    id: string;
    subdomain: string;
    is_published: boolean;
  };
  onComplete: () => void;
  onCancel: () => void;
}

export function PublishDialog({ blog, onComplete, onCancel }: PublishDialogProps) {
  const [customPath, setCustomPath] = useState(blog.subdomain);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const checkAvailability = async () => {
    if (!customPath) return;

    setIsChecking(true);
    try {
      const { data, error } = await supabase
        .from("blogs")
        .select("id")
        .eq("subdomain", customPath.toLowerCase())
        .neq("id", blog.id)
        .maybeSingle();

      if (error) throw error;

      setIsAvailable(!data);
    } catch (error) {
      console.error("Error checking availability:", error);
      toast.error("Failed to check availability");
    } finally {
      setIsChecking(false);
    }
  };

  const handleSave = async () => {
    if (!customPath || !isAvailable) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("blogs")
        .update({ 
          subdomain: customPath.toLowerCase(),
          is_published: true 
        })
        .eq("id", blog.id);

      if (error) throw error;

      toast.success("Blog published successfully!");
      onComplete();
    } catch (error: any) {
      console.error("Error saving:", error);
      toast.error("Failed to publish blog: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const isValidPath = customPath && /^[a-z0-9-]+$/.test(customPath);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="p-8 max-w-2xl w-full bg-card">
        <div className="space-y-6">
          <div>
            <h2 className="text-3xl font-bold text-foreground mb-2">Customize link</h2>
            <p className="text-muted-foreground">
              Make it short, unique and easy to remember.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="customPath">Your Blog URL</Label>
              <div className="flex items-center gap-2 mt-2">
                <Input
                  id="customPath"
                  value={customPath}
                  onChange={(e) => {
                    const value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
                    setCustomPath(value);
                    setIsAvailable(null);
                  }}
                  onBlur={checkAvailability}
                  className="flex-1"
                  placeholder="your-custom-path"
                />
                {isAvailable && (
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-green-500/10">
                    <Check className="w-5 h-5 text-green-600" />
                  </div>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                https://searchfuelblog.com/<span className="font-medium text-foreground">{customPath || "your-path"}</span>
              </p>
              {!isValidPath && customPath && (
                <p className="text-sm text-red-500 mt-1">
                  Only lowercase letters, numbers, and hyphens allowed
                </p>
              )}
              {isAvailable === false && (
                <p className="text-sm text-red-500 mt-1">
                  This URL is already taken
                </p>
              )}
            </div>

            <div className="pt-4 border-t">
              <Button 
                variant="link" 
                className="text-muted-foreground p-0 h-auto"
                onClick={() => {
                  // Custom domain functionality can be added later
                  toast.info("Custom domain coming soon!");
                }}
              >
                + Connect a new domain
              </Button>
            </div>
          </div>

          <div className="flex gap-4 pt-6">
            <Button variant="outline" onClick={onCancel} className="flex-1">
              Cancel
            </Button>
            <Button 
              onClick={handleSave}
              disabled={!isValidPath || !isAvailable || isSaving || isChecking}
              className="flex-1"
            >
              {isSaving ? "Publishing..." : "Save link"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
