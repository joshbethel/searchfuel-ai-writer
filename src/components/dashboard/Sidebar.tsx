import { Link, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  FileText,
  Settings,
  Home,
  TrendingUp,
  Calendar as CalendarIcon,
  Shield,
  History,
  Cog,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SiteSwitcher } from "@/components/dashboard/SiteSwitcher";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/logo.png";

const navigation = [
  { name: "Home", href: "/", icon: Home },
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Articles", href: "/articles", icon: FileText },
  { name: "Keywords", href: "/keywords", icon: TrendingUp },
  { name: "Calendar", href: "/calendar", icon: CalendarIcon },
  { name: "Site Settings", href: "/site-settings", icon: Cog },
];

export function Sidebar() {
  const location = useLocation();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);

  useEffect(() => {
    const checkAdminStatus = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          setIsAdmin(false);
          setCheckingAdmin(false);
          return;
        }

        // Check if user is admin
        const { data: adminUser, error } = await supabase
          .from('admin_users')
          .select('user_id')
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (error) {
          console.error('Error checking admin status in sidebar:', error);
          setIsAdmin(false);
        } else {
          setIsAdmin(!!adminUser);
        }
      } catch (error) {
        console.error('Error checking admin status:', error);
        setIsAdmin(false);
      } finally {
        setCheckingAdmin(false);
      }
    };

    checkAdminStatus();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        checkAdminStatus();
      } else {
        setIsAdmin(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <aside className="w-64 border-r border-border bg-card/50 backdrop-blur-sm">
      <div className="flex flex-col h-full">
        {/* Logo */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-accent/60 flex items-center justify-center overflow-hidden">
              <img src={logo} alt="SearchFuel Logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">SearchFuel</h1>
              <p className="text-xs text-muted-foreground">SEO Dashboard</p>
            </div>
          </div>
        </div>

        {/* Site Switcher */}
        <SiteSwitcher />

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.href || 
              (item.href === "/site-settings" && location.pathname.startsWith("/site-settings"));

            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all",
                  isActive
                    ? "bg-accent text-white shadow-lg shadow-accent/20"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <Icon className="w-5 h-5" />
                {item.name}
              </Link>
            );
          })}
          
          {/* Admin Section - only show if user is admin */}
          {!checkingAdmin && isAdmin && (
            <>
              {/* Separator */}
              <div className="my-4 border-t border-border/50"></div>
              
              {/* Admin Section Header */}
              <div className="px-4 py-2">
                <span className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">
                  Administration
                </span>
              </div>
              
              {/* Admin Links */}
              <div className="space-y-1 px-2">
              <Link
                to="/admin"
                className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all border",
                  location.pathname === "/admin" || 
                  (location.pathname.startsWith("/admin/") && !location.pathname.startsWith("/admin/audit-log") && !location.pathname.startsWith("/admin/users"))
                      ? "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 shadow-sm"
                      : "border-amber-500/10 bg-amber-500/5 text-muted-foreground hover:bg-amber-500/10 hover:border-amber-500/20 hover:text-amber-600 dark:hover:text-amber-400"
                )}
              >
                <Shield className="w-5 h-5" />
                Admin
              </Link>
              <Link
                to="/admin/audit-log"
                className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all border",
                  location.pathname === "/admin/audit-log"
                      ? "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 shadow-sm"
                      : "border-amber-500/10 bg-amber-500/5 text-muted-foreground hover:bg-amber-500/10 hover:border-amber-500/20 hover:text-amber-600 dark:hover:text-amber-400"
                )}
              >
                <History className="w-5 h-5" />
                Audit Log
              </Link>
              </div>
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-border space-y-1">
          <div className="flex items-center justify-between px-4 py-2">
            <span className="text-sm font-medium text-muted-foreground">Theme</span>
            <ThemeToggle />
          </div>
          <a
            href="mailto:team@trysearchfuel.com"
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-all"
          >
            <TrendingUp className="w-5 h-5" />
            Request a Feature
          </a>
          <Link
            to="/settings"
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-all"
          >
            <Settings className="w-5 h-5" />
            Settings
          </Link>
        </div>
      </div>
    </aside>
  );
}
