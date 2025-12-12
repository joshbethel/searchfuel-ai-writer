import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Eye, Edit, Tag, Search } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";

interface Keyword {
  id: string;
  keyword: string;
  search_volume: number;
  cpc: number;
  difficulty: number | null;
  intent: string | null;
  trend: string | null;
  created_at: string;
  updated_at: string;
}

export default function AdminUserKeywords() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (userId) {
      loadKeywords();
    }
  }, [userId]);

  const loadKeywords = async () => {
    if (!userId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-get-user-content", {
        body: {
          target_user_id: userId,
          content_type: 'keywords',
        },
      });

      if (error) throw error;

      if (data?.success && data?.content?.keywords) {
        setKeywords(data.content.keywords);
      } else {
        throw new Error(data?.error || "Failed to load keywords");
      }
    } catch (error: any) {
      console.error("Error loading keywords:", error);
      toast.error(error.message || "Failed to load keywords");
    } finally {
      setLoading(false);
    }
  };

  const filteredKeywords = keywords.filter((keyword) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return keyword.keyword.toLowerCase().includes(query);
  });

  if (loading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => navigate(`/admin/users/${userId}/content`)}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Content Overview
        </Button>

        <div className="mb-4">
          <h1 className="text-3xl font-bold mb-2">User Keywords</h1>
          <p className="text-muted-foreground">
            {filteredKeywords.length} {filteredKeywords.length === 1 ? 'keyword' : 'keywords'} found
          </p>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Search</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search keywords..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {filteredKeywords.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Tag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No keywords found.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Keywords</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Keyword</TableHead>
                  <TableHead>Search Volume</TableHead>
                  <TableHead>CPC</TableHead>
                  <TableHead>Difficulty</TableHead>
                  <TableHead>Intent</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredKeywords.map((keyword) => (
                  <TableRow key={keyword.id}>
                    <TableCell className="font-medium">{keyword.keyword}</TableCell>
                    <TableCell>{keyword.search_volume.toLocaleString()}</TableCell>
                    <TableCell>${keyword.cpc.toFixed(2)}</TableCell>
                    <TableCell>
                      {keyword.difficulty !== null ? (
                        <Badge variant="outline">{keyword.difficulty}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {keyword.intent ? (
                        <Badge variant="secondary">{keyword.intent}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {format(new Date(keyword.created_at), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/admin/users/${userId}/keywords/${keyword.id}`)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/admin/users/${userId}/keywords/${keyword.id}?edit=true`)}
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

