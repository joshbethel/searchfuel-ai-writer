import { Outlet, useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { AdminContentSidebar } from "@/components/admin/AdminContentSidebar";
import { UserSwitcher } from "@/components/admin/UserSwitcher";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Shield, X, Eye, Info, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface UserInfo {
  id: string;
  email: string;
  user_metadata?: {
    name?: string;
    full_name?: string;
  };
}

export default function AdminContentLayout() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [isInfoOpen, setIsInfoOpen] = useState(false);

  const loadUserInfo = async () => {
    if (!userId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-search-users", {
        body: { query: userId },
      });

      if (!error && data?.success && data?.users?.length > 0) {
        const user = data.users[0];
        setUserInfo({
          id: user.id,
          email: user.email || '',
          user_metadata: user.user_metadata,
        });
      }
    } catch (error) {
      console.error("Error loading user info:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userId) {
      loadUserInfo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const handleExit = () => {
    navigate("/admin");
  };

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Minimal Sidebar */}
      <aside className="sticky top-0 h-screen">
        <AdminContentSidebar />
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {/* Admin Mode Banner */}
        <Alert className="m-0 rounded-none border-x-0 border-t-0 border-b bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              <div className="flex items-center gap-3">
                <Eye className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                <AlertDescription className="text-orange-800 dark:text-orange-200 font-medium">
                  User Content Inspector
                </AlertDescription>
                {!loading && userInfo && (
                  <>
                    <span className="text-orange-600 dark:text-orange-400">•</span>
                    <span className="text-orange-700 dark:text-orange-300">
                      Viewing content for: <strong>{userInfo.email}</strong>
                    </span>
                    {(userInfo.user_metadata?.name || userInfo.user_metadata?.full_name) && (
                      <span className="text-orange-600 dark:text-orange-400">
                        ({userInfo.user_metadata?.name || userInfo.user_metadata?.full_name})
                      </span>
                    )}
                    <Badge variant="outline" className="ml-2 font-mono text-xs border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300">
                      {userInfo.id.substring(0, 8)}...
                    </Badge>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {userId && <UserSwitcher currentUserId={userId} />}
              <Button
                variant="outline"
                size="sm"
                onClick={handleExit}
                className="border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/30"
              >
                <X className="h-4 w-4 mr-2" />
                Exit Inspector
              </Button>
            </div>
          </div>
        </Alert>

        {/* Information Section - Collapsible */}
        <div className="px-4 pt-4">
          <Collapsible open={isInfoOpen} onOpenChange={setIsInfoOpen} className="mb-4">
            <CollapsibleTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-between border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/30"
              >
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                  <span className="text-orange-800 dark:text-orange-200 font-medium">
                    How User Content Inspector Works
                  </span>
                </div>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-orange-600 dark:text-orange-400 transition-transform duration-200",
                    isInfoOpen && "transform rotate-180"
                  )}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Alert className="mt-2 border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20">
                <Info className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                <AlertTitle className="text-orange-800 dark:text-orange-200">How User Content Inspector Works</AlertTitle>
                <AlertDescription className="text-orange-700 dark:text-orange-300 mt-2 space-y-2">
                  <p className="font-semibold">User Content Inspector allows you to inspect and manage user content:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li><strong>View User Content:</strong> Browse all content types (blogs, blog posts, articles, keywords) for the selected user.</li>
                    <li><strong>Edit Content:</strong> Make changes to user content on their behalf, with all edits logged in the audit trail.</li>
                    <li><strong>Switch Users:</strong> Use the "Switch User" button to quickly navigate between different users without leaving inspector mode.</li>
                    <li><strong>Audit Logging:</strong> All view and edit actions are automatically logged with your admin user ID, timestamp, and details of changes made.</li>
                    <li><strong>Secure Access:</strong> Content access is handled securely through backend functions that bypass Row Level Security (RLS) using service role credentials.</li>
                    <li><strong>Content Types:</strong> You can view and edit blogs (including article types), blog posts, articles, and keywords.</li>
                  </ul>
                  <p className="mt-2 font-semibold">Viewing Content:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Use the sidebar to navigate between different content types.</li>
                    <li>Click on any content item to view its details.</li>
                    <li>All views are logged for audit purposes.</li>
                  </ul>
                  <p className="mt-2 font-semibold">Editing Content:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Click "Edit" on any content item to make changes.</li>
                    <li>You can optionally provide a reason for the edit (e.g., "Customer support request").</li>
                    <li>Previous and new values are stored in the audit log for reference.</li>
                    <li>Changes are immediately reflected in the user's account.</li>
                  </ul>
                  <p className="mt-2 font-semibold">Important Notes:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>This is a content inspection mode - you're viewing the user's content, not impersonating their session.</li>
                    <li>All actions are tracked in the audit log for security and compliance.</li>
                    <li>Use "Exit Inspector" to return to the admin dashboard.</li>
                    <li>The orange banner indicates you're in User Content Inspector mode.</li>
                  </ul>
                </AlertDescription>
              </Alert>
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Page Content */}
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

