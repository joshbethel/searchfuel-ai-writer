import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { ProtectedRoute } from "./ProtectedRoute";

export function SubscriptionProtectedRoute({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    const checkAccess = async () => {
      try {
        // First check authentication
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          setAuthenticated(false);
          setLoading(false);
          return;
        }

        setAuthenticated(true);

        // Fetch subscription from database
        const { data: subscription, error } = await supabase
          .from('subscriptions')
          .select('status, plan_name')
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (error) {
          console.error('Error fetching subscription:', error);
          setHasAccess(false);
          setLoading(false);
          return;
        }

        // Check if subscription is active with valid plan
        const isActive = subscription && 
          (subscription.status === 'active' || subscription.status === 'trialing') &&
          subscription.plan_name !== null &&
          subscription.plan_name !== 'free';

        setHasAccess(!!isActive);
      } catch (error) {
        console.error('Error checking subscription access:', error);
        setHasAccess(false);
      } finally {
        setLoading(false);
      }
    };

    checkAccess();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setAuthenticated(false);
        setHasAccess(false);
      } else if (session) {
        // Re-check subscription when auth state changes
        checkAccess();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!authenticated) {
    return <Navigate to="/auth" replace />;
  }

  if (!hasAccess) {
    return <Navigate to="/plans" replace />;
  }

  return <>{children}</>;
}

