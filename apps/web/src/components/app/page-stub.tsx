// placeholder for pages that aren't built yet
import { Construction } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { PageHeader } from './page-header';

export interface StubSpec {
  title: string;
  owner: 'Member 1' | 'Member 2' | 'Member 3' | 'Member 4';
  description: string;
  // endpoints the page uses (docs/API.md)
  endpoints: string[];
  // what needs to be on the page
  todo: string[];
  // which queries from queries.sql it shows
  queries?: string[];
}

export function PageStub({ spec }: { spec: StubSpec }) {
  return (
    <div>
      <PageHeader
        title={spec.title}
        description={spec.description}
        eyebrow={`To build · ${spec.owner}`}
      />
      <Card className="border-dashed bg-muted/30 p-6">
        <div className="flex items-start gap-4">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-amber/20 text-brand-amber-foreground dark:text-brand-amber">
            <Construction className="size-5" />
          </div>
          <div className="grid flex-1 gap-6 md:grid-cols-2">
            <section>
              <h2 className="mb-2 text-sm font-medium">What this page needs</h2>
              <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                {spec.todo.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </section>
            <section className="space-y-4">
              <div>
                <h2 className="mb-2 text-sm font-medium">API</h2>
                <ul className="space-y-1">
                  {spec.endpoints.map((e) => (
                    <li key={e}>
                      <code className="rounded bg-background px-1.5 py-0.5 text-xs ring-1 ring-border">
                        {e}
                      </code>
                    </li>
                  ))}
                </ul>
              </div>
              {spec.queries && spec.queries.length > 0 && (
                <div>
                  <h2 className="mb-2 text-sm font-medium">SQL (queries.sql)</h2>
                  <p className="text-sm text-muted-foreground">{spec.queries.join(', ')}</p>
                </div>
              )}
            </section>
          </div>
        </div>
      </Card>
    </div>
  );
}
