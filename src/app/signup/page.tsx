'use client';

import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function SignupPage() {
  return (
    <div className="flex-1 grid place-items-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Signup disabled</CardTitle>
          <CardDescription>
            New account creation is currently disabled. Please sign in with the
            credentials shared by your administrator. Additional staff accounts
            can be added by the owner from the Staff page inside the dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/login" className={buttonVariants({ variant: 'default' }) + ' w-full justify-center'}>
            Go to sign in
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
