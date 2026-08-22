'use client';

import { useMemo, useState, useTransition } from 'react';
import { Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { useToast } from '@/core/hooks/useToast';
import { createResource, deleteResource, updateResourceTitle, type ManagedResource } from '@/services/manage/site/resources';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const resourceTypeOptions = [
  { value: 'display_image', label: 'display_image' },
  { value: 'displayImage_publicMale', label: 'displayImage_publicMale' },
  { value: 'displayImage_publicFemale', label: 'displayImage_publicFemale' },
  { value: 'coverImage', label: 'coverImage' },
  { value: 'kyc_document', label: 'kyc_document' },
] as const;

type Props = {
  initialResources: ManagedResource[];
  canAdd: boolean;
  canDelete: boolean;
  canUpdate: boolean;
};

export function DisplayImagesManager({ initialResources, canAdd, canDelete, canUpdate }: Props) {
  const [resources, setResources] = useState<ManagedResource[]>(initialResources);
  const [isPending, startTransition] = useTransition();
  const [type, setType] = useState<(typeof resourceTypeOptions)[number]['value']>('display_image');
  const [accountId, setAccountId] = useState('');
  const [value, setValue] = useState('');
  const [title, setTitle] = useState('');
  const [titleDrafts, setTitleDrafts] = useState<Record<string, string>>(() => {
    const drafts: Record<string, string> = {};
    initialResources.forEach((item) => {
      drafts[item.id] = item.title || '';
    });
    return drafts;
  });
  const { toast } = useToast();

  const publicTypeSelected = useMemo(
    () => type === 'displayImage_publicMale' || type === 'displayImage_publicFemale',
    [type],
  );

  const handleAdd = () => {
    const formData = new FormData();
    formData.append('type', type);
    formData.append('accountId', publicTypeSelected ? '' : accountId);
    formData.append('value', value);
    formData.append('title', title);

    startTransition(async () => {
      const result = await createResource(formData);
      if (!result.success || !result.resource) {
        toast({ variant: 'destructive', title: 'Create failed', description: result.error || 'Unable to create resource.' });
        return;
      }

      setResources((prev) => [result.resource!, ...prev]);
      setTitleDrafts((prev) => ({ ...prev, [result.resource!.id]: result.resource!.title || '' }));
      setAccountId('');
      setValue('');
      setTitle('');
      toast({ title: 'Resource added' });
    });
  };

  const handleDelete = (resourceId: string) => {
    const formData = new FormData();
    formData.append('resourceId', resourceId);

    startTransition(async () => {
      const result = await deleteResource(formData);
      if (!result.success) {
        toast({ variant: 'destructive', title: 'Delete failed', description: result.error || 'Unable to delete resource.' });
        return;
      }

      setResources((prev) => prev.filter((item) => item.id !== resourceId));
      setTitleDrafts((prev) => {
        const next = { ...prev };
        delete next[resourceId];
        return next;
      });
      toast({ title: 'Resource deleted' });
    });
  };

  const handleUpdateTitle = (resourceId: string) => {
    const formData = new FormData();
    formData.append('resourceId', resourceId);
    formData.append('title', (titleDrafts[resourceId] || '').trim());

    startTransition(async () => {
      const result = await updateResourceTitle(formData);
      if (!result.success || !result.resource) {
        toast({ variant: 'destructive', title: 'Update failed', description: result.error || 'Unable to update title.' });
        return;
      }

      setResources((prev) => prev.map((item) => (item.id === resourceId ? result.resource! : item)));
      setTitleDrafts((prev) => ({ ...prev, [resourceId]: result.resource!.title || '' }));
      toast({ title: 'Title updated' });
    });
  };

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Add Resource</CardTitle>
          <CardDescription>
            Create a new resource entry for account display images or public image assets.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="type">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as (typeof resourceTypeOptions)[number]['value'])}>
              <SelectTrigger id="type">
                <SelectValue placeholder="Select resource type" />
              </SelectTrigger>
              <SelectContent>
                {resourceTypeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="accountId">Account ID</Label>
            <Input
              id="accountId"
              placeholder={publicTypeSelected ? 'Leave empty for public images' : 'Target account UUID'}
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              disabled={publicTypeSelected}
            />
          </div>

          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="value">Image URL</Label>
            <Input
              id="value"
              placeholder="https://..."
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>

          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="Optional title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button type="button" disabled={!canAdd || isPending} onClick={handleAdd}>
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Add Resource
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Resource List</CardTitle>
          <CardDescription>View all saved resources and update titles as needed.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {resources.length === 0 ? (
            <p className="text-sm text-muted-foreground">No resources found.</p>
          ) : (
            resources.map((item) => (
              <div key={item.id} className="rounded-lg border p-4">
                <div className="grid gap-1 text-sm">
                  <p><span className="font-medium">Type:</span> {item.type}</p>
                  <p><span className="font-medium">Account ID:</span> {item.accountId || 'null (public)'}</p>
                  <p><span className="font-medium">Uploaded By:</span> {item.uploadedBy}</p>
                  <p><span className="font-medium">Uploaded On:</span> {new Date(item.uploadedOn).toLocaleString()}</p>
                </div>

                <div className="mt-3">
                  <img src={item.value} alt={item.title || item.type} className="h-24 w-24 rounded-md border object-cover" />
                  <p className="mt-2 truncate text-xs text-muted-foreground">{item.value}</p>
                </div>

                <div className="mt-3 flex flex-col gap-2 md:flex-row">
                  <Input
                    placeholder="Title"
                    value={titleDrafts[item.id] || ''}
                    onChange={(e) => setTitleDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    disabled={!canUpdate}
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!canUpdate || isPending}
                      onClick={() => handleUpdateTitle(item.id)}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      Save Title
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={!canDelete || isPending}
                      onClick={() => handleDelete(item.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
