import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function APIStatusChecker() {
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<any>(null);

  const checkAPIStatus = async () => {
    setChecking(true);
    try {
      // Test the generate-blog-post function with a simple request
      const { data, error } = await supabase.functions.invoke('generate-blog-post', {
        body: { 
          test: true,
          blogId: "test" 
        }
      });

      if (error) {
        setStatus({ error: error.message, type: 'error' });
        toast.error(`API Error: ${error.message}`);
      } else {
        setStatus({ data, type: 'success' });
        toast.success("API connection test completed");
      }
    } catch (error: any) {
      setStatus({ error: error.message, type: 'error' });
      toast.error(`Test failed: ${error.message}`);
    } finally {
      setChecking(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>API Status Checker</CardTitle>
        <CardDescription>
          Test the AI API connection and quota status
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button 
          onClick={checkAPIStatus} 
          disabled={checking}
          className="w-full"
        >
          {checking ? "Checking..." : "Check API Status"}
        </Button>
        
        {status && (
          <div className={`p-3 rounded border ${
            status.type === 'error' ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'
          }`}>
            <div className="text-sm">
              <strong>Status:</strong> {status.type === 'error' ? 'Error' : 'Success'}
            </div>
            <div className="text-xs mt-1 font-mono">
              {status.error || JSON.stringify(status.data, null, 2)}
            </div>
          </div>
        )}
        
        <div className="text-xs text-muted-foreground">
          <strong>Common 402 causes:</strong>
          <ul className="list-disc list-inside mt-1">
            <li>Lovable API quota exceeded</li>
            <li>Billing issues</li>
            <li>Free tier limits reached</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}