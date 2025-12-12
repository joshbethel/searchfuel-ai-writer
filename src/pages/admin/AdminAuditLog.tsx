import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Search, FileText, Calendar, Filter, Download } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

interface AuditLog {
  id: string;
  admin_user_id: string;
  action_type: string;
  target_user_id: string;
  details: any;
  created_at: string;
  admin_email: string | null;
  admin_name: string | null;
  target_email: string | null;
  target_name: string | null;
}

const ACTION_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  grant_pro_access: { label: "Grant Pro Access", color: "default" },
  revoke_pro_access: { label: "Revoke Pro Access", color: "destructive" },
  update_period_end: { label: "Update Period End", color: "secondary" },
  update_sites_allowed: { label: "Update Sites Allowed", color: "secondary" },
  view_content: { label: "View Content", color: "outline" },
  edit_content: { label: "Edit Content", color: "default" },
  grant_admin_role: { label: "Grant Admin Role", color: "default" },
  revoke_admin_role: { label: "Revoke Admin Role", color: "destructive" },
};

export default function AdminAuditLog() {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [logsPerPage] = useState(50);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);

  // Filters
  const [actionTypeFilter, setActionTypeFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadAuditLogs();
  }, [currentPage, actionTypeFilter]);

  const loadAuditLogs = async () => {
    setLoading(true);
    try {
      const filters: any = {};
      if (actionTypeFilter !== "all") {
        filters.action_type = actionTypeFilter;
      }

      const offset = (currentPage - 1) * logsPerPage;

      const { data, error } = await supabase.functions.invoke("admin-get-audit-logs", {
        body: {
          filters,
          limit: logsPerPage,
          offset,
        },
      });

      if (error) throw error;

      if (data?.success) {
        setLogs(data.logs || []);
        setTotal(data.total || 0);
      } else {
        throw new Error(data?.error || "Failed to load audit logs");
      }
    } catch (error: any) {
      console.error("Error loading audit logs:", error);
      toast.error(error.message || "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter((log) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      log.admin_email?.toLowerCase().includes(query) ||
      log.target_email?.toLowerCase().includes(query) ||
      log.admin_name?.toLowerCase().includes(query) ||
      log.target_name?.toLowerCase().includes(query) ||
      log.action_type.toLowerCase().includes(query)
    );
  });

  const handleViewDetails = (log: AuditLog) => {
    setSelectedLog(log);
    setDetailsDialogOpen(true);
  };

  const exportLogs = () => {
    const csvContent = [
      ["Timestamp", "Action", "Admin", "Target User", "Details"].join(","),
      ...filteredLogs.map((log) =>
        [
          format(new Date(log.created_at), "yyyy-MM-dd HH:mm:ss"),
          ACTION_TYPE_LABELS[log.action_type]?.label || log.action_type,
          log.admin_email || log.admin_user_id,
          log.target_email || log.target_user_id,
          JSON.stringify(log.details).replace(/"/g, '""'),
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-logs-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success("Audit logs exported successfully");
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">Audit Log</h1>
            <p className="text-muted-foreground">
              View all admin actions and changes
            </p>
          </div>
          <Button onClick={exportLogs} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search by admin, target user, or action type..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={actionTypeFilter} onValueChange={setActionTypeFilter}>
              <SelectTrigger className="w-[250px]">
                <SelectValue placeholder="Filter by action type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="grant_pro_access">Grant Pro Access</SelectItem>
                <SelectItem value="revoke_pro_access">Revoke Pro Access</SelectItem>
                <SelectItem value="update_period_end">Update Period End</SelectItem>
                <SelectItem value="update_sites_allowed">Update Sites Allowed</SelectItem>
                <SelectItem value="view_content">View Content</SelectItem>
                <SelectItem value="edit_content">Edit Content</SelectItem>
                <SelectItem value="grant_admin_role">Grant Admin Role</SelectItem>
                <SelectItem value="revoke_admin_role">Revoke Admin Role</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={loadAuditLogs}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredLogs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No audit logs found.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>
                Audit Logs ({total} total)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Admin</TableHead>
                    <TableHead>Target User</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">
                            {format(new Date(log.created_at), "MMM d, yyyy")}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(log.created_at), "HH:mm:ss")}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            ACTION_TYPE_LABELS[log.action_type]?.color as any || "outline"
                          }
                        >
                          {ACTION_TYPE_LABELS[log.action_type]?.label || log.action_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{log.admin_email || "Unknown"}</span>
                          {log.admin_name && (
                            <span className="text-xs text-muted-foreground">{log.admin_name}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{log.target_email || "Unknown"}</span>
                          {log.target_name && (
                            <span className="text-xs text-muted-foreground">{log.target_name}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-xs truncate text-sm text-muted-foreground">
                          {log.details?.reason || "—"}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewDetails(log)}
                        >
                          <FileText className="h-4 w-4 mr-1" />
                          View Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Pagination */}
          {total > logsPerPage && (
            <div className="mt-4">
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
                  <PaginationItem>
                    <span className="px-4 py-2 text-sm">
                      Page {currentPage} of {Math.ceil(total / logsPerPage)}
                    </span>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        setCurrentPage(prev => Math.min(Math.ceil(total / logsPerPage), prev + 1));
                      }}
                      className={currentPage >= Math.ceil(total / logsPerPage) ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </>
      )}

      {/* Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Audit Log Details</DialogTitle>
            <DialogDescription>
              Complete details of this admin action
            </DialogDescription>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Action Type</label>
                <p className="mt-1">
                  <Badge
                    variant={
                      ACTION_TYPE_LABELS[selectedLog.action_type]?.color as any || "outline"
                    }
                  >
                    {ACTION_TYPE_LABELS[selectedLog.action_type]?.label || selectedLog.action_type}
                  </Badge>
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground">Timestamp</label>
                <p className="mt-1">{format(new Date(selectedLog.created_at), "PPpp")}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground">Admin User</label>
                <p className="mt-1">
                  {selectedLog.admin_email || selectedLog.admin_user_id}
                  {selectedLog.admin_name && ` (${selectedLog.admin_name})`}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground">Target User</label>
                <p className="mt-1">
                  {selectedLog.target_email || selectedLog.target_user_id}
                  {selectedLog.target_name && ` (${selectedLog.target_name})`}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground">Details</label>
                <div className="mt-2 p-4 bg-muted rounded-md">
                  <pre className="text-xs overflow-auto">
                    {JSON.stringify(selectedLog.details, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

