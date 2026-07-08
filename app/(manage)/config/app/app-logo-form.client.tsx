'use client';

import { useState, useTransition } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/core/hooks/use-toast';
import { updateSiteLogoUrl } from '@/services/manage/site/logo';

type AppLogoFormProps = {
  initialSiteLogoUrl?: string;
};

export function AppLogoForm({ initialSiteLogoUrl }: AppLogoFormProps) {
  const [isPending, startTransition] = useTransition();
  const [siteLogoUrl, setSiteLogoUrl] = useState(initialSiteLogoUrl || '');
  const { toast } = useToast();

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      const result = await updateSiteLogoUrl(formData);

      if (!result.success) {
        toast({
          variant: 'destructive',
          title: 'Save failed',
          description: result.error || 'Unable to save site logo.',
        });
        return;
      }

      setSiteLogoUrl(result.siteLogoUrl || '');

      toast({
        title: 'Site logo updated',
        description: 'The header logo was saved successfully.',
      });
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Site Logo</CardTitle>
        <CardDescription>
          Set the logo image URL used in the application header.
        </CardDescription>
      </CardHeader>
      <form action={handleSubmit}>
        <CardContent className="grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor="siteLogoUrl">Logo Image URL</Label>
            <Input
              id="siteLogoUrl"
              name="siteLogoUrl"
              placeholder="https://..."
              value={siteLogoUrl}
              onChange={(e) => setSiteLogoUrl(e.target.value)}
            />
          </div>

          {siteLogoUrl ? (
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="mb-3 text-sm font-medium">Preview</p>
              <div className="flex items-center gap-3">
                <img
                  src={siteLogoUrl}
                  alt="Site logo preview"
                  className="h-10 w-10 rounded-md object-contain bg-background"
                />
                <div className="text-sm text-muted-foreground truncate">{siteLogoUrl}</div>
              </div>
            </div>
          ) : null}
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={isPending}>
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Logo
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
