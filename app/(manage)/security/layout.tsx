import React from 'react';
import { requireIndividualAccount404 } from '@/services/account/account-type-guards';

export default async function SecurityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireIndividualAccount404();
  return children;
}

