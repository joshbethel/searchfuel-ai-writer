import { useState, useEffect } from "react";
import React from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Search,
  Loader2,
  Crown,
  X,
  Calendar,
  User,
  Mail,
  Clock,
  CheckCircle2,
  XCircle,
  Edit,
  Users,
  CreditCard,
  UserCog,
  UserX,
  Info,
  ChevronDown,
  Shield,
  ShieldCheck,
  ShieldX,
  Eye,
  FileText,
  Sparkles,
  EyeOff,
  History,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, addDays, differenceInDays, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { CalendarIcon } from "lucide-react";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface UserWithSubscription {
  id: string;
  email: string;
  user_metadata?: {
    name?: string;
    full_name?: string;
  };
  subscription?: {
    id: string;
    status: string;
    plan_name: string;
    current_period_end: string | null;
    is_manual: boolean;
    stripe_subscription_id: string | null;
    sites_allowed?: number;
  } | null;
  is_admin?: boolean;
}

type SubscriptionFilter = "all" | "paid" | "manual" | "no_subscription";

export default function Admin() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [subscriptionFilter, setSubscriptionFilter] = useState<SubscriptionFilter>("all");
  const [users, setUsers] = useState<UserWithSubscription[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserWithSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserWithSubscription | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<"grant" | "revoke" | "update_period_end" | "update_sites">("grant");
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [sitesAllowed, setSitesAllowed] = useState<number>(1);
  const [reason, setReason] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [usersPerPage] = useState(20);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isInspectorInfoOpen, setIsInspectorInfoOpen] = useState(false);
  const [isDialogInfoOpen, setIsDialogInfoOpen] = useState(false);
  const [isRevokeDialogInfoOpen, setIsRevokeDialogInfoOpen] = useState(false);
  const [adminRoleDialogOpen, setAdminRoleDialogOpen] = useState(false);
  const [adminRoleAction, setAdminRoleAction] = useState<"grant" | "revoke">("grant");
  const [adminRoleUser, setAdminRoleUser] = useState<UserWithSubscription | null>(null);

  // Load all users on mount
  useEffect(() => {
    loadAllUsers();
  }, []);

  // Helper function to check if a subscription is valid
  // Valid subscriptions: active Pro subscriptions OR canceled subscriptions (even if plan_name is 'free')
  // Invalid subscriptions: inactive subscriptions with plan_name 'free' (never had Pro access)
  const hasValidSubscription = (subscription: UserWithSubscription['subscription']): boolean => {
    if (!subscription) return false;
    // Active Pro subscription - valid
    if (subscription.status === 'active' && subscription.plan_name === 'pro') return true;
    // Canceled subscription - still valid (was a Pro subscription that got canceled)
    if (subscription.status === 'canceled') return true;
    // Everything else (inactive/free) - invalid
    return false;
  };

  // Filter users based on search query and subscription type
  useEffect(() => {
    let filtered = users;

    // Apply subscription type filter
    if (subscriptionFilter !== "all") {
      filtered = filtered.filter((user) => {
        const hasSubscription = hasValidSubscription(user.subscription);
        const isManual = user.subscription?.is_manual || false;

        switch (subscriptionFilter) {
          case "paid":
            return hasSubscription && !isManual;
          case "manual":
            return hasSubscription && isManual;
          case "no_subscription":
            return !hasSubscription;
          default:
            return true;
        }
      });
    }

    // Apply search query filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((user) => {
        const email = (user.email || '').toLowerCase();
        const name = (user.user_metadata?.name || user.user_metadata?.full_name || '').toLowerCase();
        const userId = user.id.toLowerCase();
        return email.includes(query) || name.includes(query) || userId.includes(query);
      });
    }

    setFilteredUsers(filtered);
    setCurrentPage(1);
  }, [searchQuery, subscriptionFilter, users]);

  const loadAllUsers = async () => {
    setLoading(true);
    try {
      // Use empty query to get all users (or modify the edge function to support this)
      const { data, error } = await supabase.functions.invoke("admin-search-users", {
        body: { query: "" }, // Empty query to get all users
      });

      if (error) throw error;

      if (data?.success) {
        setUsers(data.users || []);
        setFilteredUsers(data.users || []);
      } else {
        throw new Error(data?.error || "Failed to load users");
      }
    } catch (error: any) {
      console.error("Error loading users:", error);
      toast.error(error.message || "Failed to load users");
      setUsers([]);
      setFilteredUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const calculateRemainingDays = (periodEnd: string | null): number | null => {
    if (!periodEnd) return null;
    try {
      const endDate = parseISO(periodEnd);
      const now = new Date();
      const days = differenceInDays(endDate, now);
      return days >= 0 ? days : null;
    } catch {
      return null;
    }
  };

  const getRemainingDaysColor = (days: number | null): string => {
    if (days === null) return "text-muted-foreground";
    if (days > 7) return "text-green-600";
    if (days > 0) return "text-yellow-600";
    return "text-red-600";
  };

  const handleAction = (user: UserWithSubscription, type: "grant" | "revoke" | "update_period_end" | "update_sites") => {
    setSelectedUser(user);
    setActionType(type);
    setReason(""); // Reset reason when opening dialog
    
    if (type === "grant") {
      // Default to 30 days from now
      setSelectedDate(addDays(new Date(), 30));
      setSitesAllowed(1); // Default to 1 site
    } else if (type === "update_period_end" && user.subscription?.current_period_end) {
      setSelectedDate(parseISO(user.subscription.current_period_end));
    } else if (type === "update_sites") {
      // Set current sites_allowed value
      setSitesAllowed(user.subscription?.sites_allowed || 1);
    }
    
    setActionDialogOpen(true);
  };

  const processAction = async () => {
    if (!selectedUser) return;

    if ((actionType === "grant" || actionType === "update_period_end") && !selectedDate) {
      toast.error("Please select a date");
      return;
    }

    if (actionType === "update_sites" || actionType === "grant") {
      if (sitesAllowed < 1) {
        toast.error("Sites allowed must be at least 1");
        return;
      }
      if (sitesAllowed > 5) {
        toast.error("Maximum allowed sites is 5");
        return;
      }
    }

    // For paid subscriptions, only allow increasing sites_allowed
    if (actionType === "update_sites" && selectedUser.subscription && !selectedUser.subscription.is_manual) {
      const currentSites = selectedUser.subscription.sites_allowed || 1;
      if (sitesAllowed < currentSites) {
        toast.error("For paid subscriptions, you can only increase the number of sites");
        return;
      }
    }

    setIsProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-grant-pro-access", {
        body: {
          action: actionType,
          target_user_id: selectedUser.id,
          current_period_end: (actionType === "grant" || actionType === "update_period_end") ? selectedDate?.toISOString() : undefined,
          sites_allowed: (actionType === "grant" || actionType === "update_sites") ? sitesAllowed : undefined,
          reason: reason.trim() || undefined,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(data.message || "Action completed successfully");
        setActionDialogOpen(false);
        setSelectedUser(null);
        setReason(""); // Reset reason after successful action
        // Refresh all users
        loadAllUsers();
      } else {
        throw new Error(data?.error || "Action failed");
      }
    } catch (error: any) {
      console.error("Error processing action:", error);
      toast.error(error.message || "Failed to process action");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAdminRoleAction = (user: UserWithSubscription, action: "grant" | "revoke") => {
    setAdminRoleUser(user);
    setAdminRoleAction(action);
    setAdminRoleDialogOpen(true);
  };

  const processAdminRoleAction = async () => {
    if (!adminRoleUser) return;

    setIsProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-manage-roles", {
        body: {
          action: adminRoleAction,
          target_user_id: adminRoleUser.id,
          reason: `Admin role ${adminRoleAction === "grant" ? "granted" : "revoked"} via admin dashboard`,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(data.message || `Admin role ${adminRoleAction === "grant" ? "granted" : "revoked"} successfully`);
        setAdminRoleDialogOpen(false);
        setAdminRoleUser(null);
        // Refresh all users
        loadAllUsers();
      } else {
        throw new Error(data?.error || "Action failed");
      }
    } catch (error: any) {
      console.error("Error managing admin role:", error);
      toast.error(error.message || "Failed to manage admin role");
    } finally {
      setIsProcessing(false);
    }
  };

  // Calculate statistics
  const stats = {
    totalUsers: users.length,
    usersWithPaidSub: users.filter(
      (user) => hasValidSubscription(user.subscription) && !user.subscription.is_manual
    ).length,
    usersWithManualSub: users.filter(
      (user) => hasValidSubscription(user.subscription) && user.subscription.is_manual
    ).length,
    usersWithoutSub: users.filter((user) => !hasValidSubscription(user.subscription)).length,
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Admin Dashboard</h1>
            <p className="text-muted-foreground">Manage user Pro access and subscriptions</p>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate("/admin/audit-log")}
            className="gap-2"
          >
            <History className="h-4 w-4" />
            View Audit Log
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalUsers}</div>
            <p className="text-xs text-muted-foreground">All registered users</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Paid Subscriptions</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.usersWithPaidSub}</div>
            <p className="text-xs text-muted-foreground">Users with paid plans</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Manual Subscriptions</CardTitle>
            <UserCog className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.usersWithManualSub}</div>
            <p className="text-xs text-muted-foreground">Admin-granted access</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">No Subscription</CardTitle>
            <UserX className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.usersWithoutSub}</div>
            <p className="text-xs text-muted-foreground">Users without access</p>
          </CardContent>
        </Card>
      </div>

      {/* Information Section - Collapsible */}
      <Collapsible open={isInfoOpen} onOpenChange={setIsInfoOpen} className="mb-6">
        <CollapsibleTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-between border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30"
          >
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span className="text-blue-800 dark:text-blue-200 font-medium">
                How Manual Pro Access Works
              </span>
            </div>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-blue-600 dark:text-blue-400 transition-transform duration-200",
                isInfoOpen && "transform rotate-180"
              )}
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Alert className="mt-2 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <AlertTitle className="text-blue-800 dark:text-blue-200">How Manual Pro Access Works</AlertTitle>
            <AlertDescription className="text-blue-700 dark:text-blue-300 mt-2 space-y-2">
              <p className="font-semibold">When you grant Pro access to a user, here's what happens:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong>Stripe Subscription Created:</strong> A subscription is automatically created in Stripe with invoice collection (no payment method required).</li>
                <li><strong>Invoice Automatically Paid:</strong> The invoice is immediately marked as paid, so users won't receive any invoice emails.</li>
                <li><strong>Access Period:</strong> You set the subscription end date, which determines how long the user has Pro access.</li>
                <li><strong>Email Notification:</strong> The user receives an email notification informing them that Pro access has been granted (no invoice email is sent).</li>
                <li><strong>Audit Log:</strong> All actions are logged in the audit system with your admin user ID and timestamp.</li>
                <li><strong>Manual Flag:</strong> The subscription is marked as "Manual" in both our database and Stripe, distinguishing it from paid subscriptions.</li>
                <li><strong>Automatic Cancellation:</strong> The subscription will automatically cancel on the end date you specify.</li>
              </ul>
              <p className="mt-2 font-semibold">Revoking Access:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Only manual subscriptions can be revoked through this dashboard.</li>
                <li>Revoking immediately cancels the Stripe subscription and removes Pro access.</li>
                <li>The user receives an email notification when access is revoked.</li>
              </ul>
              <p className="mt-2 font-semibold">Updating Period End:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>You can extend or shorten the access period by updating the end date.</li>
                <li>The subscription will automatically cancel on the new end date.</li>
              </ul>
            </AlertDescription>
          </Alert>
        </CollapsibleContent>
      </Collapsible>

      {/* User Content Inspector Information */}
      <Collapsible open={isInspectorInfoOpen} onOpenChange={setIsInspectorInfoOpen} className="mb-6">
        <CollapsibleTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-between border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/30"
          >
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              <span className="text-orange-800 dark:text-orange-200 font-medium">
                User Content Inspector
              </span>
            </div>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-orange-600 dark:text-orange-400 transition-transform duration-200",
                isInspectorInfoOpen && "transform rotate-180"
              )}
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Alert className="mt-2 border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20">
            <Info className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            <AlertTitle className="text-orange-800 dark:text-orange-200">User Content Inspector</AlertTitle>
            <AlertDescription className="text-orange-700 dark:text-orange-300 mt-2 space-y-2">
              <p className="font-semibold">Inspect and manage any user's content:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Use the "Inspect Content" button to view and manage any user's content (blogs, posts, articles, keywords).</li>
                <li>All content viewing and editing actions are logged in the audit trail for security and compliance.</li>
                <li>You can switch between users without leaving the inspector mode.</li>
                <li>Edit content on behalf of users with full audit logging of all changes.</li>
              </ul>
            </AlertDescription>
          </Alert>
        </CollapsibleContent>
      </Collapsible>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>User Management</CardTitle>
          <CardDescription>
            {users.length > 0 && (
              <span>Showing {filteredUsers.length} of {users.length} users</span>
            )}
            {users.length === 0 && !loading && <span>No users found</span>}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Filter by email, name, or user ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={subscriptionFilter} onValueChange={(value) => setSubscriptionFilter(value as SubscriptionFilter)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                <SelectItem value="paid">Paid Subscriptions</SelectItem>
                <SelectItem value="manual">Manual Subscriptions</SelectItem>
                <SelectItem value="no_subscription">No Subscription</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={loadAllUsers}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && filteredUsers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              Users 
              {searchQuery.trim() ? ` (${filteredUsers.length} filtered)` : ` (${filteredUsers.length} total)`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>Subscription</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Remaining Days</TableHead>
                  <TableHead>Sites Allowed</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers
                  .slice((currentPage - 1) * usersPerPage, currentPage * usersPerPage)
                  .map((user) => {
                  const remainingDays = calculateRemainingDays(user.subscription?.current_period_end || null);
                  const hasSubscription = hasValidSubscription(user.subscription);
                  const isCanceled = user.subscription?.status === 'canceled';
                  const hasPro = hasSubscription && !isCanceled; // Active Pro subscription (exclude canceled)
                  const isManual = user.subscription?.is_manual || false;
                  const currentSites = user.subscription?.sites_allowed || 1;
                  // Hide "Update Sites" button for paid subscriptions that are already at max (5)
                  // Manual subscriptions can always update (can decrease), paid can only increase
                  const canUpdateSites = isManual || currentSites < 5;

                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <div className="font-medium">{user.email}</div>
                          <div className="text-sm text-muted-foreground">
                            {(user.user_metadata?.name || user.user_metadata?.full_name) || "No name"}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono mt-1">
                            {user.id.substring(0, 8)}...
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {user.is_admin ? (
                          <Badge variant="default" className="bg-purple-600 hover:bg-purple-700">
                            <Shield className="h-3 w-3 mr-1" />
                            Admin
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {hasSubscription ? (
                          <Badge variant={hasPro ? "default" : "secondary"}>
                            {user.subscription?.plan_name || "—"}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {hasSubscription ? (
                          <Badge
                            variant={
                              user.subscription?.status === "active"
                                ? "default"
                                : user.subscription?.status === "canceled"
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            {user.subscription?.status || "—"}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {remainingDays !== null ? (
                          <div className={cn("flex items-center gap-1", getRemainingDaysColor(remainingDays))}>
                            <Clock className="h-4 w-4" />
                            <span className="font-medium">{remainingDays} days</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {hasSubscription ? (
                          <div className="flex items-center gap-1">
                            <span className="font-medium">{user.subscription?.sites_allowed || 1}</span>
                            <span className="text-muted-foreground text-xs">sites</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {!hasSubscription ? (
                          <span className="text-muted-foreground">—</span>
                        ) : isManual ? (
                          <Badge variant="outline" className="text-orange-600 border-orange-600">
                            Manual
                          </Badge>
                        ) : (
                          <Badge variant="outline">Paid</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2 flex-wrap">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(`/admin/users/${user.id}/content`)}
                            className="gap-1.5 border-orange-500 text-orange-700 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/30 hover:border-orange-600 dark:hover:border-orange-500 font-medium shadow-sm hover:shadow-md transition-all"
                          >
                            <svg
                              className="h-4 w-4"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              {/* Incognito icon - person with hat (spy/private browsing style) */}
                              <circle cx="12" cy="9" r="3"/>
                              <path d="M7 20v-2a5 5 0 0 1 5-5h0a5 5 0 0 1 5 5v2"/>
                              <path d="M9 5h6M10 4h4M11 3h2"/>
                              <path d="M8 6h8" strokeWidth="2.5"/>
                            </svg>
                            <span>Inspect Content</span>
                            <Sparkles className="h-3 w-3 opacity-70" />
                          </Button>
                          {!hasPro && (
                            <Button
                              size="sm"
                              onClick={() => handleAction(user, "grant")}
                              className="gap-1"
                            >
                              <Crown className="h-4 w-4" />
                              Grant Pro
                            </Button>
                          )}
                          {hasPro && (
                            <>
                              {canUpdateSites && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleAction(user, "update_sites")}
                                  className="gap-1"
                                >
                                  <Edit className="h-4 w-4" />
                                  Update Sites
                                </Button>
                              )}
                              {isManual && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleAction(user, "update_period_end")}
                                    className="gap-1"
                                  >
                                    <Edit className="h-4 w-4" />
                                    Update Period
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => handleAction(user, "revoke")}
                                    className="gap-1"
                                  >
                                    <X className="h-4 w-4" />
                                    Revoke Subscription
                                  </Button>
                                </>
                              )}
                            </>
                          )}
                          {/* Admin role management buttons */}
                          {user.is_admin ? (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleAdminRoleAction(user, "revoke")}
                              className="gap-1"
                            >
                              <ShieldX className="h-4 w-4" />
                              Revoke Admin
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAdminRoleAction(user, "grant")}
                              className="gap-1 border-purple-600 text-purple-600 hover:bg-purple-50"
                            >
                              <ShieldCheck className="h-4 w-4" />
                              Grant Admin
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            
            {/* Pagination */}
            {filteredUsers.length > usersPerPage && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm text-muted-foreground">
                    Showing {(currentPage - 1) * usersPerPage + 1} to {Math.min(currentPage * usersPerPage, filteredUsers.length)} of {filteredUsers.length} users
                  </div>
                </div>
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          setCurrentPage(prev => Math.max(1, prev - 1));
                        }}
                        className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                    {Array.from({ length: Math.ceil(filteredUsers.length / usersPerPage) }, (_, i) => i + 1)
                      .filter(page => {
                        // Show first page, last page, current page, and pages around current
                        const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
                        return page === 1 || 
                               page === totalPages || 
                               (page >= currentPage - 1 && page <= currentPage + 1);
                      })
                      .map((page, idx, arr) => {
                        // Add ellipsis if there's a gap
                        const prevPage = arr[idx - 1];
                        const showEllipsis = prevPage && page - prevPage > 1;
                        return (
                          <React.Fragment key={page}>
                            {showEllipsis && (
                              <PaginationItem>
                                <span className="px-2">...</span>
                              </PaginationItem>
                            )}
                            <PaginationItem>
                              <PaginationLink
                                href="#"
                                onClick={(e) => {
                                  e.preventDefault();
                                  setCurrentPage(page);
                                }}
                                isActive={currentPage === page}
                                className="cursor-pointer"
                              >
                                {page}
                              </PaginationLink>
                            </PaginationItem>
                          </React.Fragment>
                        );
                      })}
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          setCurrentPage(prev => Math.min(Math.ceil(filteredUsers.length / usersPerPage), prev + 1));
                        }}
                        className={currentPage >= Math.ceil(filteredUsers.length / usersPerPage) ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!loading && filteredUsers.length === 0 && users.length > 0 && searchQuery.trim() && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No users found matching your search.</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => setSearchQuery("")}
            >
              Clear Search
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && users.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No users found matching your search.</p>
          </CardContent>
        </Card>
      )}

      {/* Action Dialog */}
      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === "grant" && "Grant Pro Access"}
              {actionType === "revoke" && "Revoke Pro Access"}
              {actionType === "update_period_end" && "Update Period End"}
              {actionType === "update_sites" && "Update Sites Allowed"}
            </DialogTitle>
            <DialogDescription>
              {actionType === "grant" && `Grant Pro access to ${selectedUser?.email}`}
              {actionType === "revoke" && `Revoke Pro access from ${selectedUser?.email}. This will remove their access to the platform.`}
              {actionType === "update_period_end" && `Update the subscription period end date for ${selectedUser?.email}`}
              {actionType === "update_sites" && `Update the number of websites ${selectedUser?.email} can manage`}
            </DialogDescription>
          </DialogHeader>

          {actionType === "grant" && (
            <Collapsible open={isDialogInfoOpen} onOpenChange={setIsDialogInfoOpen} className="mb-4">
              <CollapsibleTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30"
                >
                  <div className="flex items-center gap-2">
                    <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-blue-800 dark:text-blue-200 font-medium text-sm">
                      What happens when granting Pro access?
                    </span>
                  </div>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-blue-600 dark:text-blue-400 transition-transform duration-200",
                      isDialogInfoOpen && "transform rotate-180"
                    )}
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Alert className="mt-2 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
                  <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <AlertTitle className="text-blue-800 dark:text-blue-200 text-sm">How Manual Pro Access Works</AlertTitle>
                  <AlertDescription className="text-blue-700 dark:text-blue-300 mt-2 space-y-2 text-xs">
                    <p className="font-semibold">When you grant Pro access to a user, here's what happens:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li><strong>Stripe Subscription Created:</strong> A subscription is automatically created in Stripe with invoice collection (no payment method required).</li>
                      <li><strong>Invoice Automatically Paid:</strong> The invoice is immediately marked as paid, so users won't receive any invoice emails.</li>
                      <li><strong>Access Period:</strong> You set the subscription end date, which determines how long the user has Pro access.</li>
                      <li><strong>Email Notification:</strong> The user receives an email notification informing them that Pro access has been granted (no invoice email is sent).</li>
                      <li><strong>Audit Log:</strong> All actions are logged in the audit system with your admin user ID and timestamp.</li>
                      <li><strong>Manual Flag:</strong> The subscription is marked as "Manual" in both our database and Stripe, distinguishing it from paid subscriptions.</li>
                      <li><strong>Automatic Cancellation:</strong> The subscription will automatically cancel on the end date you specify.</li>
                    </ul>
                  </AlertDescription>
                </Alert>
              </CollapsibleContent>
            </Collapsible>
          )}

          {actionType === "revoke" && (
            <Collapsible open={isRevokeDialogInfoOpen} onOpenChange={setIsRevokeDialogInfoOpen} className="mb-4">
              <CollapsibleTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/30"
                >
                  <div className="flex items-center gap-2">
                    <Info className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                    <span className="text-orange-800 dark:text-orange-200 font-medium text-sm">
                      What happens when revoking Pro access?
                    </span>
                  </div>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-orange-600 dark:text-orange-400 transition-transform duration-200",
                      isRevokeDialogInfoOpen && "transform rotate-180"
                    )}
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Alert className="mt-2 border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20">
                  <Info className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                  <AlertTitle className="text-orange-800 dark:text-orange-200 text-sm">How Revoking Pro Access Works</AlertTitle>
                  <AlertDescription className="text-orange-700 dark:text-orange-300 mt-2 space-y-2 text-xs">
                    <p className="font-semibold">When you revoke Pro access from a user, here's what happens:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li><strong>Immediate Cancellation:</strong> The Stripe subscription is immediately canceled, removing Pro access.</li>
                      <li><strong>Access Removed:</strong> The user loses all Pro features and no longer has access to the platform.</li>
                      <li><strong>Email Notification:</strong> The user receives an email notification informing them that Pro access has been revoked.</li>
                      <li><strong>Audit Log:</strong> The revocation action is logged in the audit system with your admin user ID and timestamp.</li>
                      <li><strong>Database Update:</strong> The subscription record is updated to reflect the canceled status.</li>
                    </ul>
                    <p className="mt-2 font-semibold">Important Notes:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li>Only manual subscriptions (admin-granted) can be revoked through this dashboard.</li>
                      <li>Paid subscriptions must be canceled through Stripe or the user's account.</li>
                      <li>This action cannot be undone - you'll need to grant access again if needed.</li>
                    </ul>
                  </AlertDescription>
                </Alert>
              </CollapsibleContent>
            </Collapsible>
          )}

          {actionType === "grant" && (
            <div className="py-4 space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Period End Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !selectedDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      disabled={(date) => date < new Date()}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <p className="text-xs text-muted-foreground mt-2">
                  Default: 30 days from today. Select a custom date if needed.
                </p>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Number of Websites</label>
                <Input
                  type="number"
                  min="1"
                  max="5"
                  value={sitesAllowed}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || 1;
                    setSitesAllowed(Math.max(1, Math.min(5, value)));
                  }}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Number of websites this user can manage. Range: 1-5 sites. Default: 1.
                </p>
              </div>
            </div>
          )}

          {actionType === "update_period_end" && (
            <div className="py-4">
              <label className="text-sm font-medium mb-2 block">Period End Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !selectedDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    disabled={(date) => date < new Date()}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}

          {actionType === "update_sites" && (
            <div className="py-4">
              <label className="text-sm font-medium mb-2 block">Number of Websites</label>
              <Input
                type="number"
                min="1"
                max="5"
                value={sitesAllowed}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 1;
                  setSitesAllowed(Math.max(1, Math.min(5, value)));
                }}
                className={cn(
                  "w-full",
                  selectedUser?.subscription && !selectedUser.subscription.is_manual && sitesAllowed < (selectedUser.subscription.sites_allowed || 1) && "border-red-500"
                )}
              />
              {selectedUser?.subscription && !selectedUser.subscription.is_manual && (
                <>
                  {sitesAllowed < (selectedUser.subscription.sites_allowed || 1) && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-2 font-semibold">
                      Error: For paid subscriptions, you can only increase the number of sites.
                    </p>
                  )}
                  {sitesAllowed >= (selectedUser.subscription.sites_allowed || 1) && (
                    <p className="text-xs text-orange-600 dark:text-orange-400 mt-2">
                      Note: For paid subscriptions, you can only increase the number of sites.
                    </p>
                  )}
                </>
              )}
              {sitesAllowed > 5 && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-2 font-semibold">
                  Error: Maximum allowed sites is 5.
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                Current: {selectedUser?.subscription?.sites_allowed || 1} site(s) | Max: 5 sites
              </p>
            </div>
          )}

          {/* Reason field for all actions */}
          <div className="py-4">
            <label className="text-sm font-medium mb-2 block">
              Reason (Optional)
            </label>
            <Textarea
              placeholder="Enter a reason for this action (e.g., 'Customer support request', 'Trial extension', etc.)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full min-h-[80px]"
              rows={3}
            />
            <p className="text-xs text-muted-foreground mt-2">
              This reason will be logged in the audit trail for record keeping.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialogOpen(false)} disabled={isProcessing}>
              Cancel
            </Button>
            <Button 
              onClick={processAction} 
              disabled={
                isProcessing || 
                (actionType === "update_sites" && (
                  sitesAllowed < 1 || 
                  sitesAllowed > 5 || 
                  (selectedUser?.subscription && !selectedUser.subscription.is_manual && sitesAllowed < (selectedUser.subscription.sites_allowed || 1))
                )) ||
                (actionType === "grant" && (sitesAllowed < 1 || sitesAllowed > 5))
              }
            >
              {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {actionType === "grant" && "Grant Access"}
              {actionType === "revoke" && "Revoke Access"}
              {actionType === "update_period_end" && "Update Date"}
              {actionType === "update_sites" && "Update Sites"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Admin Role Management Confirmation Dialog */}
      <AlertDialog open={adminRoleDialogOpen} onOpenChange={setAdminRoleDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {adminRoleAction === "grant" ? "Grant Admin Role" : "Revoke Admin Role"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {adminRoleAction === "grant" 
                ? `Are you sure you want to grant admin role to ${adminRoleUser?.email}? They will have full access to the admin dashboard and can manage users and subscriptions.`
                : `Are you sure you want to revoke admin role from ${adminRoleUser?.email}? They will lose access to the admin dashboard.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={processAdminRoleAction}
              disabled={isProcessing}
              className={adminRoleAction === "revoke" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {adminRoleAction === "grant" ? "Grant Admin Role" : "Revoke Admin Role"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
