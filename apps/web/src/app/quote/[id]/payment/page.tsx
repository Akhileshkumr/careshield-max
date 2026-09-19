import { notFound, redirect } from 'next/navigation';

import { ApiClientError, getQuote } from '@/lib/api-client';
import { PaymentPanel } from '@/components/payment-panel';
import { Card, PageHeading, Stepper } from '@/components/ui';

export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const quote = await getQuote(id).catch((error: unknown) => {
    if (error instanceof ApiClientError && error.status === 404) notFound();
    throw error;
  });

  if (quote.status === 'POLICY_ISSUED' && quote.policyId) {
    redirect(`/policy/${quote.policyId}`);
  }
  if (quote.status !== 'MEDICAL_DECLARED') {
    redirect(`/quote/${id}`);
  }

  return (
    <>
      <Stepper current={3} />
      <PageHeading
        title="Confirm and pay"
        description="Your cover starts the moment this payment succeeds."
      />

      <Card>
        <PaymentPanel quote={quote} />
      </Card>
    </>
  );
}
