import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
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
  } | null;
}

export default function Admin() {
  const [searchQuery, setSearchQuery] = useState("");
  const [users, setUsers] = useState<UserWithSubscription[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithSubscription | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<"grant" | "revoke" | "update_period_end">("grant");
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (searchQuery.trim()) {
      searchUsers();
    } else {
      setUsers([]);
    }
  }, [searchQuery]);

  const searchUsers = async () => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-search-users", {
        body: { query: searchQuery },
      });

      if (error) throw error;

      if (data?.success) {
        setUsers(data.users || []);
      } else {
        throw new Error(data?.error || "Search failed");
      }
    } catch (error: any) {
      console.error("Error searching users:", error);
      toast.error(error.message || "Failed to search users");
      setUsers([]);
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

  const handleAction = (user: UserWithSubscription, type: "grant" | "revoke" | "update_period_end") => {
    setSelectedUser(user);
    setActionType(type);
    
    if (type === "grant") {
      // Default to 30 days from now
      setSelectedDate(addDays(new Date(), 30));
    } else if (type === "update_period_end" && user.subscription?.current_period_end) {
      setSelectedDate(parseISO(user.subscription.current_period_end));
    }
    
    setActionDialogOpen(true);
  };

  const processAction = async () => {
    if (!selectedUser) return;

    if ((actionType === "grant" || actionType === "update_period_end") && !selectedDate) {
      toast.error("Please select a date");
      return;
    }

    setIsProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-grant-pro-access", {
        body: {
          action: actionType,
          target_user_id: selectedUser.id,
          current_period_end: actionType !== "revoke" ? selectedDate?.toISOString() : undefined,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(data.message || "Action completed successfully");
        setActionDialogOpen(false);
        setSelectedUser(null);
        // Refresh search results
        if (searchQuery.trim()) {
          searchUsers();
        }
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

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Admin Dashboard</h1>
        <p className="text-muted-foreground">Manage user Pro access and subscriptions</p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Search Users</CardTitle>
          <CardDescription>Search by email, name, or user ID</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search by email, name, or user ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && users.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Users ({users.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Subscription</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Remaining Days</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => {
                  const remainingDays = calculateRemainingDays(user.subscription?.current_period_end || null);
                  const hasPro = user.subscription?.plan_name === "pro" && user.subscription?.status === "active";
                  const isManual = user.subscription?.is_manual || false;

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
                        <Badge variant={hasPro ? "default" : "secondary"}>
                          {user.subscription?.plan_name || "free"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            user.subscription?.status === "active"
                              ? "default"
                              : user.subscription?.status === "canceled"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {user.subscription?.status || "inactive"}
                        </Badge>
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
                        {isManual ? (
                          <Badge variant="outline" className="text-orange-600 border-orange-600">
                            Manual
                          </Badge>
                        ) : (
                          <Badge variant="outline">Paid</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
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
                          {hasPro && isManual && (
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
                                Revoke
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {!loading && searchQuery.trim() && users.length === 0 && (
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
            </DialogTitle>
            <DialogDescription>
              {actionType === "grant" && `Grant Pro access to ${selectedUser?.email}`}
              {actionType === "revoke" && `Revoke Pro access from ${selectedUser?.email}. This will downgrade them to Free plan.`}
              {actionType === "update_period_end" && `Update the subscription period end date for ${selectedUser?.email}`}
            </DialogDescription>
          </DialogHeader>

          {(actionType === "grant" || actionType === "update_period_end") && (
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
              {actionType === "grant" && (
                <p className="text-xs text-muted-foreground mt-2">
                  Default: 30 days from today. Select a custom date if needed.
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialogOpen(false)} disabled={isProcessing}>
              Cancel
            </Button>
            <Button onClick={processAction} disabled={isProcessing}>
              {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {actionType === "grant" && "Grant Access"}
              {actionType === "revoke" && "Revoke Access"}
              {actionType === "update_period_end" && "Update Date"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
