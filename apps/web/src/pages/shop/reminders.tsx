// not built yet (Member 3). replace this whole file with the real page,
// pages/shop/new-sale.tsx is the one to copy from
import { PageStub, type StubSpec } from '@/components/app/page-stub';

const spec: StubSpec = {
  title: 'Reminder queue',
  owner: 'Member 3',
  description: 'SMS reminders queued by the nightly event (prototype: no SMS is really sent).',
  endpoints: ['GET /api/shops/:shopId/reminders', 'PATCH /api/shops/:shopId/reminders/:reminderId'],
  todo: [
    'Grouped by type: before due / on due / overdue / promise',
    'Preview message text; mark sent / cancel',
    'Bulk "mark all sent" for today',
  ],
};

export default function RemindersPage() {
  return <PageStub spec={spec} />;
}
