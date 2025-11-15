import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Lock, CheckCircle, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function CredentialMigration() {
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<{
    migrated: number;
    skipped: number;
    errors: number;
    total: number;
    errorDetails?: string[];
  } | null>(null);

  const handleMigrate = async () => {
    setIsMigrating(true);
    setMigrationResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('migrate-encrypted-credentials', {
        body: {}
      });

      if (error) {
        console.error('Migration error:', error);
        toast.error(error.message || 'Failed to migrate credentials');
        return;
      }

      console.log('Migration result:', data);
      setMigrationResult(data);

      if (data.errors > 0) {
        toast.warning(`Migration completed with ${data.errors} error(s)`);
      } else if (data.migrated > 0) {
        toast.success(`Successfully migrated ${data.migrated} credential(s)`);
      } else if (data.skipped > 0) {
        toast.info('All credentials are already encrypted');
      } else {
        toast.info('No credentials found to migrate');
      }
    } catch (error: any) {
      console.error('Migration error:', error);
      toast.error('Failed to migrate credentials');
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="h-5 w-5" />
          Encrypt CMS Credentials
        </CardTitle>
        <CardDescription>
          Migrate your existing CMS credentials to use encryption for enhanced security. 
          This will encrypt all plaintext credentials stored in your blog settings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {migrationResult && (
          <div className="space-y-3 p-4 bg-muted rounded-lg">
            <h4 className="font-medium text-sm">Migration Results:</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span>Migrated: {migrationResult.migrated}</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-blue-600" />
                <span>Skipped: {migrationResult.skipped}</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <span>Errors: {migrationResult.errors}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">Total: {migrationResult.total}</span>
              </div>
            </div>
            {migrationResult.errorDetails && migrationResult.errorDetails.length > 0 && (
              <div className="mt-2 p-2 bg-destructive/10 rounded text-sm">
                <p className="font-medium text-destructive mb-1">Error Details:</p>
                <ul className="list-disc list-inside text-destructive/80 space-y-1">
                  {migrationResult.errorDetails.map((error, idx) => (
                    <li key={idx}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <Button
          onClick={handleMigrate}
          disabled={isMigrating}
          className="w-full bg-[#8B7355] hover:bg-[#8B7355]/90 text-white"
        >
          {isMigrating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Migrating Credentials...
            </>
          ) : (
            <>
              <Lock className="mr-2 h-4 w-4" />
              Encrypt Credentials Now
            </>
          )}
        </Button>

        <div className="text-xs text-muted-foreground space-y-1">
          <p>• Credentials that are already encrypted will be skipped</p>
          <p>• This operation is safe and can be run multiple times</p>
          <p>• Encrypted credentials are stored securely in your database</p>
        </div>
      </CardContent>
    </Card>
  );
}
