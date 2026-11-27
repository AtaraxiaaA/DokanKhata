// not built yet (Member 1). replace this whole file with the real page,
// pages/shop/new-sale.tsx is the one to copy from
import { PageStub, type StubSpec } from '@/components/app/page-stub';

const spec: StubSpec = {
  title: 'Audit log',
  owner: 'Member 1',
  description: 'Who changed credit limits, due days and account status, and when.',
  endpoints: ['GET /api/admin/audit-log'],
  todo: [
    'Table: time, table, record, changed by, old → new (JSON diff view)',
    'Filters: table, date range',
  ],
};

export default function AuditLogPage() {
  return <PageStub spec={spec} />;
}
