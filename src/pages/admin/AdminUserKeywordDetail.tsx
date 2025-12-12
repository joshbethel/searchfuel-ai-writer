import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Edit, Save, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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

export default function AdminUserKeywordDetail() {
  const { userId, keywordId } = useParams<{ userId: string; keywordId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [keyword, setKeyword] = useState<Keyword | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [formData, setFormData] = useState<Partial<Keyword>>({});
  const [reason, setReason] = useState("");

  useEffect(() => {
    const editParam = searchParams.get("edit");
    if (editParam === "true") {
      setIsEditMode(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (keywordId && userId) {
      loadKeyword();
    }
  }, [keywordId, userId]);

  const loadKeyword = async () => {
    if (!keywordId || !userId) return;

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
        const foundKeyword = data.content.keywords.find((k: Keyword) => k.id === keywordId);
        if (foundKeyword) {
          setKeyword(foundKeyword);
          setFormData(foundKeyword);
        } else {
          throw new Error("Keyword not found");
        }
      } else {
        throw new Error(data?.error || "Failed to load keyword");
      }
    } catch (error: any) {
      console.error("Error loading keyword:", error);
      toast.error(error.message || "Failed to load keyword");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!keywordId || !userId) return;

    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-update-user-content", {
        body: {
          target_user_id: userId,
          content_type: 'keywords',
          content_id: keywordId,
          updates: formData,
          reason: reason.trim() || undefined,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success("Keyword updated successfully");
        setIsEditMode(false);
        if (data.content) {
          setKeyword(data.content as Keyword);
          setFormData(data.content as Keyword);
        }
        setReason("");
      } else {
        throw new Error(data?.error || "Failed to update keyword");
      }
    } catch (error: any) {
      console.error("Error updating keyword:", error);
      toast.error(error.message || "Failed to update keyword");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (keyword) {
      setFormData(keyword);
    }
    setIsEditMode(false);
    setReason("");
  };

  if (loading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!keyword) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Keyword not found.</p>
            <Button
              variant="outline"
              onClick={() => navigate(`/admin/users/${userId}/keywords`)}
              className="mt-4"
            >
              Back to Keywords
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => navigate(`/admin/users/${userId}/keywords`)}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Keywords
        </Button>

        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">
              {isEditMode ? "Edit Keyword" : "Keyword Details"}
            </h1>
            <p className="text-muted-foreground">{keyword.keyword}</p>
          </div>
          {!isEditMode && (
            <Button onClick={() => setIsEditMode(true)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
        </div>
      </div>

      {isEditMode ? (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Edit Keyword</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="keyword">Keyword</Label>
                <Input
                  id="keyword"
                  value={formData.keyword || ""}
                  onChange={(e) => setFormData({ ...formData, keyword: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="search_volume">Search Volume</Label>
                <Input
                  id="search_volume"
                  type="number"
                  value={formData.search_volume || 0}
                  onChange={(e) => setFormData({ ...formData, search_volume: parseInt(e.target.value) || 0 })}
                />
              </div>

              <div>
                <Label htmlFor="cpc">CPC (Cost Per Click)</Label>
                <Input
                  id="cpc"
                  type="number"
                  step="0.01"
                  value={formData.cpc || 0}
                  onChange={(e) => setFormData({ ...formData, cpc: parseFloat(e.target.value) || 0 })}
                />
              </div>

              <div>
                <Label htmlFor="difficulty">Difficulty</Label>
                <Input
                  id="difficulty"
                  type="number"
                  value={formData.difficulty || ""}
                  onChange={(e) => setFormData({ ...formData, difficulty: e.target.value ? parseInt(e.target.value) : null })}
                  placeholder="Optional"
                />
              </div>

              <div>
                <Label htmlFor="intent">Intent</Label>
                <Input
                  id="intent"
                  value={formData.intent || ""}
                  onChange={(e) => setFormData({ ...formData, intent: e.target.value || null })}
                  placeholder="Optional"
                />
              </div>

              <div>
                <Label htmlFor="trend">Trend</Label>
                <Input
                  id="trend"
                  value={formData.trend || ""}
                  onChange={(e) => setFormData({ ...formData, trend: e.target.value || null })}
                  placeholder="Optional"
                />
              </div>

              <div>
                <Label htmlFor="reason">Reason for Edit (Optional)</Label>
                <Textarea
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Enter a reason for this edit..."
                  rows={3}
                />
              </div>

              <div className="flex gap-2 pt-4">
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </Button>
                <Button variant="outline" onClick={handleCancel} disabled={saving}>
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Keyword Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-muted-foreground">Keyword</Label>
                <p className="font-medium">{keyword.keyword}</p>
              </div>

              <div>
                <Label className="text-muted-foreground">Search Volume</Label>
                <p>{keyword.search_volume.toLocaleString()}</p>
              </div>

              <div>
                <Label className="text-muted-foreground">CPC</Label>
                <p>${keyword.cpc.toFixed(2)}</p>
              </div>

              <div>
                <Label className="text-muted-foreground">Difficulty</Label>
                <p>
                  {keyword.difficulty !== null ? (
                    <Badge variant="outline">{keyword.difficulty}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </p>
              </div>

              <div>
                <Label className="text-muted-foreground">Intent</Label>
                <p>
                  {keyword.intent ? (
                    <Badge variant="secondary">{keyword.intent}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </p>
              </div>

              <div>
                <Label className="text-muted-foreground">Trend</Label>
                <p>{keyword.trend || <span className="text-muted-foreground">—</span>}</p>
              </div>

              <div>
                <Label className="text-muted-foreground">Created</Label>
                <p>{format(new Date(keyword.created_at), "PPp")}</p>
              </div>

              <div>
                <Label className="text-muted-foreground">Last Updated</Label>
                <p>{format(new Date(keyword.updated_at), "PPp")}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

