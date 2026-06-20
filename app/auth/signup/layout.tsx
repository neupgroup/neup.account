import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';


export default async function SignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
     <div className="flex min-h-screen items-start justify-center bg-card md:bg-background py-12 md:items-center md:py-0">
      <Card className="mx-auto max-w-lg w-full border-0 shadow-none md:border md:shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-headline">Create your NeupID</CardTitle>
          <CardDescription>A single, secure account to access all NeupID services.</CardDescription>
        </CardHeader>
        <CardContent>
          {children}
        </CardContent>
      </Card>
    </div>
  )
}
