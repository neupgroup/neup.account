import { ShieldAlert } from 'lucide-react';
import { Button } from '#/components/ui/button';
import { FlowLink } from '#/components/ui/flow-link';

export default function Forbidden() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center p-6 text-center">
      <ShieldAlert className="h-16 w-16 text-primary" />
      <h1 className="mt-4 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
        Permission Required
      </h1>
      <p className="mt-4 text-muted-foreground">
        You do not have permission to view this page.
      </p>
      <Button asChild className="mt-8">
        <FlowLink href="/">Go back home</FlowLink>
      </Button>
    </div>
  );
}
