'use client';

import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ApplicationDevLogEntry } from '@/services/applications/manage';

type Props = {
  logs: ApplicationDevLogEntry[];
};

function pretty(value: unknown): string {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return String(value);
  }
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function getLogPresentation(log: { endpoint: string; requestMeta: unknown }) {
  const requestMeta = asObject(log.requestMeta);
  const webhookUrl = typeof requestMeta?.webhookUrl === 'string' ? requestMeta.webhookUrl.trim() : '';
  const isWebhook = webhookUrl.length > 0;

  return {
    displayUrl: webhookUrl || log.endpoint,
    isWebhook,
  };
}

function LogCard({
  log,
  isOpen,
  onToggle,
}: {
  log: ApplicationDevLogEntry;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    const node = contentRef.current;
    if (!node) return;

    const updateHeight = () => {
      setContentHeight(node.scrollHeight);
    };

    updateHeight();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateHeight);
    observer.observe(node);
    return () => observer.disconnect();
  }, [log, isOpen]);

  const presentation = getLogPresentation(log);

  return (
    <Card>
      <button type="button" className="w-full text-left" onClick={onToggle} aria-expanded={isOpen}>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">
              {log.method} {presentation.displayUrl}
            </CardTitle>
            {presentation.isWebhook ? <Badge variant="outline">webhook</Badge> : null}
            <Badge variant={log.statusCode >= 400 ? 'destructive' : 'secondary'}>{log.statusCode}</Badge>
          </div>
          <CardDescription>
            {new Date(log.createdAt).toLocaleString()} | IP: {log.requesterIp ?? 'N/A'} | Origin: {log.origin ?? 'N/A'}
          </CardDescription>
        </CardHeader>
      </button>

      <div
        className="overflow-hidden transition-[max-height,opacity,transform] duration-300 ease-in-out"
        style={{
          maxHeight: isOpen ? `${contentHeight}px` : '0px',
          opacity: isOpen ? 1 : 0,
          transform: isOpen ? 'translateY(0)' : 'translateY(-4px)',
        }}
      >
        <div ref={contentRef}>
          <CardContent className="space-y-3 pt-0 text-sm">
            <div className="grid gap-1">
              <p><span className="font-medium">Referer:</span> {log.referer ?? 'N/A'}</p>
              <p><span className="font-medium">User-Agent:</span> {log.userAgent ?? 'N/A'}</p>
              {log.error ? <p className="text-destructive"><span className="font-medium">Error:</span> {log.error}</p> : null}
            </div>

            <details>
              <summary className="cursor-pointer font-medium">Request Body</summary>
              <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted p-3 text-xs">{pretty(log.requestBody)}</pre>
            </details>
            <details>
              <summary className="cursor-pointer font-medium">Query</summary>
              <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted p-3 text-xs">{pretty(log.query)}</pre>
            </details>
            <details>
              <summary className="cursor-pointer font-medium">Request Meta</summary>
              <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted p-3 text-xs">{pretty(log.requestMeta)}</pre>
            </details>
            <details>
              <summary className="cursor-pointer font-medium">Response Body</summary>
              <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted p-3 text-xs">{pretty(log.responseBody)}</pre>
            </details>
          </CardContent>
        </div>
      </div>
    </Card>
  );
}

export function LogsAccordion({ logs }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <>
      {logs.map((log) => (
        <LogCard
          key={log.id}
          log={log}
          isOpen={openId === log.id}
          onToggle={() => setOpenId((current) => (current === log.id ? null : log.id))}
        />
      ))}
    </>
  );
}
