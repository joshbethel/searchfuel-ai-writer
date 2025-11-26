import { useSiteContext } from "@/contexts/SiteContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Globe, ChevronDown, Loader2, Settings, Check, Plus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSiteLimitInfo } from "@/lib/utils/site-limits";

export function SiteSwitcher() {
  const navigate = useNavigate();
  const { selectedSite, allSites, isLoading, selectSite } = useSiteContext();
  const [siteLimitInfo, setSiteLimitInfo] = useState<{
    limit: number;
    count: number;
    remaining: number;
    canCreate: boolean;
    isOverLimit: boolean;
    sitesToDelete: number;
  } | null>(null);

  useEffect(() => {
    if (!isLoading) {
      // Fetch site limit info for all states
      const fetchLimitInfo = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const info = await getSiteLimitInfo(user.id);
          setSiteLimitInfo(info);
        }
      };
      fetchLimitInfo();
    }
  }, [isLoading, allSites.length]);

  const getSiteDisplayName = (site: typeof selectedSite) => {
    if (!site) return "No Site";
    return site.title || site.subdomain || site.custom_domain || "Untitled Site";
  };

  const getSiteUrl = (site: typeof selectedSite) => {
    if (!site) return "";
    return site.custom_domain || site.subdomain || site.website_homepage || "";
  };

  const handleAddSite = async () => {
    if (siteLimitInfo && !siteLimitInfo.canCreate) {
      navigate("/plans");
      return;
    }
    // Navigate to dashboard to trigger onboarding
    navigate("/dashboard?action=add-site");
  };

  if (isLoading) {
    return (
      <div className="px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading sites...</span>
        </div>
      </div>
    );
  }

  // No sites - show empty state with CTA
  if (allSites.length === 0) {
    return (
      <div className="px-4 py-3 border-b border-border">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="text-sm text-muted-foreground">No sites connected</span>
          </div>
          {siteLimitInfo && (
            <div className="text-xs text-muted-foreground">
              {siteLimitInfo.canCreate ? (
                <span>You can add {siteLimitInfo.remaining} {siteLimitInfo.remaining === 1 ? 'site' : 'sites'}</span>
              ) : siteLimitInfo.isOverLimit ? (
                <span className="text-red-600 dark:text-red-400">
                  Over limit ({siteLimitInfo.count}/{siteLimitInfo.limit})
                </span>
              ) : (
                <span>Site limit reached ({siteLimitInfo.count}/{siteLimitInfo.limit})</span>
              )}
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddSite}
            className="w-full mt-1"
            disabled={siteLimitInfo && !siteLimitInfo.canCreate}
          >
            <Plus className="h-3 w-3 mr-1" />
            {siteLimitInfo && !siteLimitInfo.canCreate ? "Upgrade to Add Sites" : "Add Site"}
          </Button>
        </div>
      </div>
    );
  }

  // Single site view - show site info without dropdown
  if (allSites.length === 1) {
    return (
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <div className="flex flex-col items-start flex-1 min-w-0">
            <span className="text-sm font-medium text-foreground truncate w-full">
              {getSiteDisplayName(selectedSite)}
            </span>
            {getSiteUrl(selectedSite) && (
              <span className="text-xs text-muted-foreground truncate w-full">
                {getSiteUrl(selectedSite)}
              </span>
            )}
            {siteLimitInfo && (
              <span className={`text-xs mt-0.5 ${siteLimitInfo.isOverLimit ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
                {siteLimitInfo.count} of {siteLimitInfo.limit} {siteLimitInfo.limit === 1 ? 'site' : 'sites'}
                {siteLimitInfo.isOverLimit && ' (over limit)'}
              </span>
            )}
          </div>
          <Link
            to="/settings?tab=sites"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            title="Manage sites"
          >
            <Settings className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 border-b border-border">
      <div className="flex items-center gap-2 min-w-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="flex-1 min-w-0 justify-between h-auto py-2 px-3 hover:bg-secondary"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex flex-col items-start flex-1 min-w-0">
                  <span className="text-sm font-medium text-foreground truncate w-full">
                    {getSiteDisplayName(selectedSite)}
                  </span>
                  {getSiteUrl(selectedSite) && (
                    <span className="text-xs text-muted-foreground truncate w-full">
                      {getSiteUrl(selectedSite)}
                    </span>
                  )}
                  {siteLimitInfo && (
                    <span className={`text-xs mt-0.5 ${siteLimitInfo.isOverLimit ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
                      {siteLimitInfo.count} of {siteLimitInfo.limit} {siteLimitInfo.limit === 1 ? 'site' : 'sites'}
                      {siteLimitInfo.isOverLimit && ' (over limit)'}
                    </span>
                  )}
                </div>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
            </Button>
          </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Sites</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {allSites.map((site) => {
            const isSelected = selectedSite?.id === site.id;
            const displayName = getSiteDisplayName(site);
            const siteUrl = getSiteUrl(site);

            return (
              <DropdownMenuItem
                key={site.id}
                onClick={() => selectSite(site.id)}
                className={cn(
                  "flex items-center gap-2 cursor-pointer",
                  isSelected && "bg-accent/10"
                )}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {isSelected && <Check className="h-4 w-4 text-accent flex-shrink-0" />}
                  <div className="flex flex-col items-start flex-1 min-w-0">
                    <span className={cn(
                      "text-sm truncate w-full",
                      isSelected ? "font-medium text-foreground" : "text-muted-foreground"
                    )}>
                      {displayName}
                    </span>
                    {siteUrl && (
                      <span className="text-xs text-muted-foreground truncate w-full">
                        {siteUrl}
                      </span>
                    )}
                  </div>
                </div>
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link
              to="/settings?tab=sites"
              className="flex items-center gap-2 cursor-pointer"
            >
              <Settings className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Manage Sites</span>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Link
        to="/settings?tab=sites"
        className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        title="Manage sites"
      >
        <Settings className="h-4 w-4" />
      </Link>
      </div>
    </div>
  );
}

