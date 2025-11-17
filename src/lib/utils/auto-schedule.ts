import { supabase } from "@/integrations/supabase/client";
import { format, addDays } from "date-fns";

export async function autoScheduleKeyword(keyword: string): Promise<{ success: boolean; date?: Date; error?: string }> {
  try {
    // Get user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: "Please sign in" };
    }

    // Get user's blog
    const { data: blog, error: blogError } = await supabase
      .from("blogs")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (blogError || !blog) {
      return { success: false, error: "No blog found" };
    }

    // Get all scheduled dates
    const { data: scheduledDates } = await supabase
      .from("scheduled_keywords")
      .select("scheduled_date")
      .eq("blog_id", blog.id)
      .eq("status", "pending");

    // Also check blog_posts for scheduled dates
    const { data: scheduledPosts } = await supabase
      .from("blog_posts")
      .select("scheduled_publish_date")
      .eq("blog_id", blog.id)
      .not("scheduled_publish_date", "is", null);

    // Create a Set of occupied dates
    const occupiedDates = new Set<string>();
    
    scheduledDates?.forEach(item => {
      if (item.scheduled_date) {
        occupiedDates.add(new Date(item.scheduled_date).toDateString());
      }
    });

    scheduledPosts?.forEach(item => {
      if (item.scheduled_publish_date) {
        occupiedDates.add(new Date(item.scheduled_publish_date).toDateString());
      }
    });

    // Find next available date
    let nextDate = new Date();
    nextDate.setHours(0, 0, 0, 0);
    
    // Start from tomorrow
    nextDate = addDays(nextDate, 1);

    // Find first unoccupied date
    while (occupiedDates.has(nextDate.toDateString())) {
      nextDate = addDays(nextDate, 1);
    }

    // Schedule the keyword
    const { error: scheduleError } = await supabase
      .from("scheduled_keywords")
      .insert({
        blog_id: blog.id,
        user_id: user.id,
        keyword,
        scheduled_date: nextDate.toISOString(),
        status: "pending",
      });

    if (scheduleError) {
      return { success: false, error: "Failed to schedule keyword" };
    }

    return { success: true, date: nextDate };
  } catch (error) {
    console.error("Error auto-scheduling keyword:", error);
    return { success: false, error: "Failed to schedule keyword" };
  }
}
