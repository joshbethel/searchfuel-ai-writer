import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface WordPressPost {
  id: number;
  title: { rendered: string };
  content: { rendered: string };
  excerpt: { rendered: string };
  status: string;
  link: string;
  date: string;
  modified: string;
  featured_media?: number;
}

export interface WordPressUpdateData {
  title?: string;
  content?: string;
  excerpt?: string;
  status?: 'publish' | 'draft' | 'pending' | 'private';
  featured_media?: number;
}

export function useWordPress(blogId: string) {
  const [loading, setLoading] = useState(false);

  const fetchPosts = async (postId?: string): Promise<WordPressPost[] | WordPressPost | null> => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-wordpress-data', {
        body: {
          blogId,
          type: 'posts',
          postId,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      return data.data;
    } catch (error: any) {
      console.error('Error fetching WordPress posts:', error);
      toast.error('Failed to fetch posts: ' + error.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const fetchPages = async (pageId?: string): Promise<any[] | any | null> => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-wordpress-data', {
        body: {
          blogId,
          type: 'pages',
          postId: pageId,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      return data.data;
    } catch (error: any) {
      console.error('Error fetching WordPress pages:', error);
      toast.error('Failed to fetch pages: ' + error.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async (): Promise<any[] | null> => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-wordpress-data', {
        body: {
          blogId,
          type: 'categories',
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      return data.data;
    } catch (error: any) {
      console.error('Error fetching WordPress categories:', error);
      toast.error('Failed to fetch categories: ' + error.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const fetchSiteInfo = async (): Promise<any | null> => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-wordpress-data', {
        body: {
          blogId,
          type: 'site',
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      return data.data;
    } catch (error: any) {
      console.error('Error fetching WordPress site info:', error);
      toast.error('Failed to fetch site info: ' + error.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const updatePost = async (postId: string, updateData: WordPressUpdateData): Promise<WordPressPost | null> => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('update-wordpress-content', {
        body: {
          blogId,
          type: 'post',
          postId,
          updateData,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      toast.success('Post updated successfully');
      return data.data;
    } catch (error: any) {
      console.error('Error updating WordPress post:', error);
      toast.error('Failed to update post: ' + error.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const updatePage = async (pageId: string, updateData: WordPressUpdateData): Promise<any | null> => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('update-wordpress-content', {
        body: {
          blogId,
          type: 'page',
          postId: pageId,
          updateData,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      toast.success('Page updated successfully');
      return data.data;
    } catch (error: any) {
      console.error('Error updating WordPress page:', error);
      toast.error('Failed to update page: ' + error.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    fetchPosts,
    fetchPages,
    fetchCategories,
    fetchSiteInfo,
    updatePost,
    updatePage,
  };
}
