'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateAppPermissionSource } from '@/services/applications/authz-manage';
import { Button } from '#/components/ui/button';

export function PermissionSourceForm({ appId, sourceId, sourceName, applications, canManage }: {
  appId: string;
  sourceId: string | null;
  sourceName?: string;
  applications: { id: string; name: string }[];
  canManage: boolean;
}) {
  const [selected, setSelected] = useState(sourceId ?? '');
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <form className="space-y-4 rounded-lg border p-5" onSubmit={(event) => {
      event.preventDefault();
      startTransition(async () => {
        const result = await updateAppPermissionSource(appId, selected || null);
        setMessage(result.success ? 'Permission source saved.' : result.error ?? 'Could not save.');
        if (result.success) router.refresh();
      });
    }}>
      <div>
        <h2 className="text-lg font-semibold leading-7">
          <label htmlFor="permission-source">Use permission from other app</label>
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">Define permissions for this app, or reuse another app’s permissions. Only applications that define their own permissions can be selected. Roles stay with this app. Edit shared definitions in the source app.</p>
      </div>
      <select id="permission-source" className="w-full rounded-md border bg-background p-2" value={selected} disabled={!canManage || pending} onChange={(event) => setSelected(event.target.value)}>
        <option value="">Use this app’s own permissions</option>
        {sourceId && !applications.some((app) => app.id === sourceId) && <option value={sourceId} disabled>Current permission source is unavailable</option>}
        {applications.map((app) => <option key={app.id} value={app.id}>{app.name} ({app.id})</option>)}
      </select>
      {sourceId && <p className="text-sm">Using permissions from {sourceName ?? sourceId}.</p>}
      {canManage && <Button type="submit" disabled={pending || selected === (sourceId ?? '')}>{pending ? 'Saving…' : 'Save permission source'}</Button>}
      {message && <p role="status" className="text-sm">{message}</p>}
    </form>
  );
}
