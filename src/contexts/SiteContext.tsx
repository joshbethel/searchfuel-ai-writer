import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type Blog = Database['public']['Tables']['blogs']['Row'];

interface SiteContextType {
  selectedSite: Blog | null;
  allSites: Blog[];
  isLoading: boolean;
  selectSite: (siteId: string) => void;
  refreshSites: () => Promise<void>;
}

const SiteContext = createContext<SiteContextType | undefined>(undefined);

const STORAGE_KEY = 'searchfuel_selected_site_id';

export function SiteProvider({ children }: { children: ReactNode }) {
  const [allSites, setAllSites] = useState<Blog[]>([]);
  const [selectedSite, setSelectedSite] = useState<Blog | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch all user sites
  const fetchSites = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setAllSites([]);
        setSelectedSite(null);
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('blogs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching sites:', error);
        setAllSites([]);
        setSelectedSite(null);
        setIsLoading(false);
        return;
      }

      const sites = (data || []) as Blog[];
      setAllSites(sites);

      // Handle site selection after fetching
      if (sites.length > 0) {
        const savedSiteId = localStorage.getItem(STORAGE_KEY);
        const currentSelectedId = savedSiteId || null;
        
        // Check if current selected site still exists
        const siteExists = currentSelectedId && sites.find(s => s.id === currentSelectedId);
        
        if (siteExists) {
          // Keep current selection if it still exists
          const site = sites.find(s => s.id === currentSelectedId)!;
          setSelectedSite(site);
        } else {
          // Select first site (either no saved site or saved site was deleted)
          setSelectedSite(sites[0]);
          localStorage.setItem(STORAGE_KEY, sites[0].id);
        }
      } else {
        // No sites, clear selection
        setSelectedSite(null);
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (error) {
      console.error('Error in fetchSites:', error);
      setAllSites([]);
      setSelectedSite(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Refresh sites list
  const refreshSites = useCallback(async () => {
    await fetchSites();
  }, [fetchSites]);

  // Select a site
  const selectSite = useCallback((siteId: string) => {
    const site = allSites.find(s => s.id === siteId);
    if (site) {
      setSelectedSite(site);
      localStorage.setItem(STORAGE_KEY, siteId);
    } else {
      console.warn(`Site ${siteId} not found in allSites`);
    }
  }, [allSites]);

  // Initial fetch on mount
  useEffect(() => {
    fetchSites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for auth changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        fetchSites();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const value: SiteContextType = {
    selectedSite,
    allSites,
    isLoading,
    selectSite,
    refreshSites,
  };

  return (
    <SiteContext.Provider value={value}>
      {children}
    </SiteContext.Provider>
  );
}

export function useSiteContext() {
  const context = useContext(SiteContext);
  if (context === undefined) {
    throw new Error('useSiteContext must be used within a SiteProvider');
  }
  return context;
}

