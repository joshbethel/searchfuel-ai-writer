import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Users, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface User {
  id: string;
  email: string;
  user_metadata?: {
    name?: string;
    full_name?: string;
  };
  subscription?: {
    status: string;
    plan_name: string;
  } | null;
  is_admin?: boolean;
}

interface UserSwitcherProps {
  currentUserId: string;
}

export function UserSwitcher({ currentUserId }: UserSwitcherProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const loadUsers = async (query: string = "") => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-search-users", {
        body: { query: query || "" },
      });

      if (error) throw error;

      if (data?.success) {
        setUsers(data.users || []);
      }
    } catch (error) {
      console.error("Error loading users:", error);
    } finally {
      setLoading(false);
    }
  };

  // Load users when popover opens
  useEffect(() => {
    if (open) {
      loadUsers(searchQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Debounce search when query changes
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        loadUsers(searchQuery);
      }, 300);

      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, open]);

  const handleSelectUser = (selectedUserId: string) => {
    if (selectedUserId === currentUserId) {
      setOpen(false);
      return;
    }

    // Navigate to the new user's content overview
    navigate(`/admin/users/${selectedUserId}/content`);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/30"
        >
          <Users className="h-4 w-4 mr-2" />
          Switch User
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="end">
        <Command>
          <CommandInput
            placeholder="Search users by email, name, or ID..."
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : users.length === 0 ? (
              <CommandEmpty>No users found.</CommandEmpty>
            ) : (
              <CommandGroup heading="Users">
                {users.slice(0, 50).map((user) => (
                  <CommandItem
                    key={user.id}
                    value={`${user.email} ${user.user_metadata?.name || user.user_metadata?.full_name || ''} ${user.id}`}
                    onSelect={() => handleSelectUser(user.id)}
                    className={cn(
                      "flex items-center justify-between cursor-pointer",
                      user.id === currentUserId && "bg-accent"
                    )}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{user.email}</span>
                          {user.id === currentUserId && (
                            <Check className="h-3 w-3 text-primary" />
                          )}
                        </div>
                        {(user.user_metadata?.name || user.user_metadata?.full_name) && (
                          <p className="text-xs text-muted-foreground truncate">
                            {user.user_metadata?.name || user.user_metadata?.full_name}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {user.is_admin && (
                          <Badge variant="outline" className="text-xs">
                            Admin
                          </Badge>
                        )}
                        {user.subscription?.plan_name === 'pro' && (
                          <Badge variant="default" className="text-xs">
                            Pro
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CommandItem>
                ))}
                {users.length > 50 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground text-center">
                    Showing first 50 results. Refine your search for more.
                  </div>
                )}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

