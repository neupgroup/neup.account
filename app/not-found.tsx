import { FlowLink } from '@/components/flow-link';
import { Button } from '#/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center p-6 text-center">
      <AlertTriangle className="h-16 w-16 text-primary" />
      <h1 className="mt-4 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
        Page Not Found
      </h1>
      <p className="mt-4 text-muted-foreground">
        Sorry, we couldn't find the page you're looking for. It might have been moved or
        deleted.
      </p>
      <Button asChild className="mt-8">
        <FlowLink href="/">Go back home</FlowLink>
      </Button>
    </div>
  );
}
