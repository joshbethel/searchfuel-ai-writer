import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { ProtectedRoute } from "./ProtectedRoute";

export function AdminProtectedRoute({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    const checkAdminAccess = async () => {
      try {
        console.log('[AdminProtectedRoute] Starting admin access check...');
        
        // First check authentication
        const { data: { session } } = await supabase.auth.getSession();
        console.log('[AdminProtectedRoute] Session check:', { hasSession: !!session, userId: session?.user?.id });
        
        if (!session) {
          console.log('[AdminProtectedRoute] No session found, redirecting to login');
          setAuthenticated(false);
          setLoading(false);
          return;
        }

        setAuthenticated(true);
        console.log('[AdminProtectedRoute] User authenticated, checking admin status for user:', session.user.id);

        // Check if user is admin
        const { data: adminUser, error } = await supabase
          .from('admin_users')
          .select('user_id')
          .eq('user_id', session.user.id)
          .maybeSingle();

        console.log('[AdminProtectedRoute] Admin check result:', { 
          adminUser, 
          error, 
          isAdmin: !!adminUser,
          userId: session.user.id 
        });

        if (error) {
          console.error('[AdminProtectedRoute] Error checking admin access:', error);
          setIsAdmin(false);
          setLoading(false);
          return;
        }

        const userIsAdmin = !!adminUser;
        console.log('[AdminProtectedRoute] Final admin status:', userIsAdmin);
        setIsAdmin(userIsAdmin);
        
        if (!userIsAdmin) {
          console.log('[AdminProtectedRoute] User is not an admin, will redirect to dashboard');
        }
      } catch (error) {
        console.error('[AdminProtectedRoute] Exception checking admin access:', error);
        setIsAdmin(false);
      } finally {
        setLoading(false);
        console.log('[AdminProtectedRoute] Admin check complete');
      }
    };

    checkAdminAccess();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setAuthenticated(false);
        setIsAdmin(false);
      } else if (session) {
        // Re-check admin status when auth state changes
        checkAdminAccess();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  console.log('[AdminProtectedRoute] Render state:', { loading, authenticated, isAdmin });

  if (loading) {
    console.log('[AdminProtectedRoute] Showing loading state');
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!authenticated) {
    console.log('[AdminProtectedRoute] Not authenticated, redirecting to /');
    return <Navigate to="/" replace />;
  }

  if (!isAdmin) {
    console.log('[AdminProtectedRoute] Not an admin, redirecting to /dashboard');
    return <Navigate to="/dashboard" replace />;
  }

  console.log('[AdminProtectedRoute] Admin access granted, rendering children');
  return <>{children}</>;
}
