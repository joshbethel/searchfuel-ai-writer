import { Link, useLocation, useParams } from "react-router-dom";
import {
  BookOpen,
  FileText,
  Newspaper,
  Tag,
  Shield,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo.png";

const adminContentNavigation = [
  { name: "Content Overview", href: "content", icon: Shield, basePath: "/admin/users" },
  { name: "Blogs", href: "blogs", icon: BookOpen, basePath: "/admin/users" },
  { name: "Blog Posts", href: "blog-posts", icon: FileText, basePath: "/admin/users" },
  { name: "Articles", href: "articles", icon: Newspaper, basePath: "/admin/users" },
  { name: "Keywords", href: "keywords", icon: Tag, basePath: "/admin/users" },
];

export function AdminContentSidebar() {
  const location = useLocation();
  const { userId } = useParams<{ userId: string }>();

  const getFullPath = (href: string) => {
    if (!userId) return "#";
    return `/admin/users/${userId}/${href}`;
  };

  const isActive = (href: string) => {
    if (!userId) return false;
    const fullPath = `/admin/users/${userId}/${href}`;
    return location.pathname === fullPath || 
           (href === "content" && location.pathname === `/admin/users/${userId}/content`);
  };

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
              <p className="text-xs text-muted-foreground">Content Inspector</p>
            </div>
          </div>
        </div>

        {/* Back to Admin Dashboard */}
        <div className="p-4 border-b border-border">
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => window.location.href = "/admin"}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Admin
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {adminContentNavigation.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            const fullPath = getFullPath(item.href);

            return (
              <Link
                key={item.href}
                to={fullPath}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Shield className="h-3 w-3" />
            <span>Content Inspector</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

