// landing page
import { Link } from 'react-router';
import {
  ArrowRight,
  BellRing,
  BookLock,
  CheckCircle2,
  Gauge,
  Layers3,
  LineChart,
  ShieldCheck,
  Smartphone,
  Store,
  TriangleAlert,
  UserRound,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Logo } from '@/components/app/logo';
import { Money } from '@/components/app/money';
import { ThemeToggle } from '@/components/app/theme-toggle';
import { TrustScoreRing } from '@/components/app/trust-score';
import { useAuth, homePathFor } from '@/auth/auth';

const features = [
  {
    icon: ShieldCheck,
    title: 'Credit limits that hold',
    body: 'Set a limit per customer. A sale that would cross it, or one on a blocked account, is refused by the database itself.',
  },
  {
    icon: Wallet,
    title: 'Payments cleared oldest-first',
    body: 'Cash, bKash, Nagad or Rocket. Every taka is applied to the oldest unpaid sale, and a TrxID can never be counted twice.',
  },
  {
    icon: Gauge,
    title: 'Trust score across shops',
    body: 'One identity per phone number. See how reliably someone pays, at every shop on DokanKhata, before you give credit.',
  },
  {
    icon: BellRing,
    title: 'Reminders & promises',
    body: 'SMS reminders before, on and after the due date. Record “I’ll pay on the 5th” and see if it was kept.',
  },
  {
    icon: BookLock,
    title: 'A ledger you can’t erase',
    body: 'Sales and payments are never edited or deleted. Mistakes are fixed with returns, discounts and write-offs, all logged.',
  },
  {
    icon: LineChart,
    title: 'Know where your money is',
    body: 'Aging, top debtors, collection trends, the Eid credit spike and staff performance, all from the same ledger.',
  },
];

const steps = [
  {
    n: '01',
    title: 'Type the phone number',
    body: 'Karim wants rice and oil on baki. His balance, limit and trust score appear instantly.',
  },
  {
    n: '02',
    title: 'Add items, save once',
    body: 'Prices come from your list. Sale, items and stock change are saved together, or not at all.',
  },
  {
    n: '03',
    title: 'Due date & reminders set',
    body: 'The due date is set from his terms and reminders are queued automatically.',
  },
  {
    n: '04',
    title: 'He pays by bKash',
    body: '৳2,000 clears his oldest sale and part of the next. He sees it in his own portal.',
  },
];

function HeroMock() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      <Card className="gap-0 overflow-hidden p-0 shadow-xl shadow-primary/5">
        <div className="flex items-center justify-between border-b bg-muted/40 px-5 py-3">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Store className="size-3.5" /> Rahim General Store · Mirpur 10
          </div>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
            NEW BAKI
          </span>
        </div>
        <div className="space-y-5 p-5">
          <div className="flex items-center gap-4">
            <TrustScoreRing score={82} size={56} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Karim Hossain</p>
              <p className="tabular text-sm text-muted-foreground">01712-345678</p>
            </div>
            <span className="rounded-full bg-success/12 px-2 py-0.5 text-xs font-medium text-success">
              Reliable
            </span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Balance</span>
              <span>
                <Money value={3450} className="font-medium" />{' '}
                <span className="text-muted-foreground">/ ৳5,000</span>
              </span>
            </div>
            <Progress value={69} className="h-2" />
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-warning/12 px-3 py-2 text-xs">
            <TriangleAlert className="size-3.5 shrink-0 text-warning" />
            <span>Also owes 2 other shops · ৳1,280 in total</span>
          </div>
          <div className="divide-y rounded-lg border text-sm">
            {[
              ['Miniket rice', 'মিনিকেট চাল', '5 kg', 400],
              ['Soybean oil', 'সয়াবিন তেল', '2 L', 330],
            ].map(([en, bn, q, amt]) => (
              <div key={en as string} className="flex items-center justify-between px-3 py-2.5">
                <div>
                  <p className="font-medium">{en}</p>
                  <p className="font-bangla text-xs text-muted-foreground">
                    {bn} · {q}
                  </p>
                </div>
                <Money value={amt as number} />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Due in 15 days</p>
              <Money value={730} className="text-xl font-semibold" />
            </div>
            <Button size="sm">Record baki</Button>
          </div>
        </div>
      </Card>

      <div className="absolute -top-14 left-4 hidden rotate-[-3deg] items-center gap-2 rounded-xl border bg-card px-3 py-2 text-xs shadow-lg sm:flex">
        <span className="grid size-6 place-items-center rounded-full bg-[#e2136e] text-[10px] font-bold text-white">
          b
        </span>
        <div>
          <p className="font-medium">৳2,000 received</p>
          <p className="text-muted-foreground">cleared 2 oldest sales</p>
        </div>
      </div>
      <div className="absolute -right-6 bottom-24 hidden rotate-[3deg] items-center gap-2 rounded-xl border bg-card px-3 py-2 text-xs shadow-lg sm:flex">
        <BellRing className="size-4 text-brand-amber" />
        <div>
          <p className="font-medium">Reminder queued</p>
          <p className="text-muted-foreground">due in 3 days</p>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-svh overflow-x-clip">
      {/* nav */}
      <header className="sticky top-0 z-30 border-b border-transparent bg-background/70 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-4">
          <Link to="/">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">
              Features
            </a>
            <a href="#how" className="hover:text-foreground">
              How it works
            </a>
            <a href="#who" className="hover:text-foreground">
              Who it’s for
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            {user ? (
              <Button asChild size="sm">
                <Link to={homePathFor(user)}>
                  Open DokanKhata <ArrowRight />
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                  <Link to="/login">Log in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/register">Register shop</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* hero */}
      <section className="relative">
        <div className="mx-auto grid max-w-6xl items-center gap-16 px-4 pt-20 pb-24 md:pt-28 lg:grid-cols-[1.1fr_1fr]">
          <div className="space-y-8">
            <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground shadow-sm">
              <span className="size-1.5 rounded-full bg-brand-amber" />
              For mudi dokans, pharmacies, hardware & stationery shops
            </span>
            <div className="space-y-5">
              <h1 className="text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
                The baki khata,
                <br />
                <span className="text-primary">now impossible to lose.</span>
              </h1>
              <p className="font-bangla text-xl text-muted-foreground">
                আপনার বাকির খাতা, এখন ডিজিটাল।
              </p>
              <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
                Record credit in seconds, collect it on time, and check a customer’s reliability
                across shops before you hand over the goods.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="h-11 px-5">
                <Link to="/register">
                  Start your digital khata <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-11 px-5">
                <Link to="/claim">
                  <Smartphone /> I’m a customer
                </Link>
              </Button>
            </div>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              {[
                'Works with cash, bKash, Nagad, Rocket',
                'Bangla product names',
                'Nothing is ever deleted',
              ].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-4 text-success" /> {t}
                </li>
              ))}
            </ul>
          </div>
          <HeroMock />
        </div>
      </section>

      {/* problem strip */}
      <section className="border-y bg-muted/40">
        <div className="mx-auto grid max-w-6xl gap-px px-4 md:grid-cols-3">
          {[
            ['The khata got wet.', 'Every record of who owes what, gone.'],
            ['“I paid you last week.”', 'No proof either way, so a regular is lost.'],
            ['He owes four shops on this street.', 'And none of them knew.'],
          ].map(([q, a]) => (
            <div key={q} className="space-y-1 py-8 md:px-8 md:first:pl-0">
              <p className="font-medium">{q}</p>
              <p className="text-sm text-muted-foreground">{a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* features */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24">
        <div className="mb-14 max-w-2xl space-y-3">
          <p className="text-sm font-medium text-primary">
            Everything a khata does, and what it can’t
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            The rules live in the database, so nobody can bend them.
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <Card key={f.title} className="group gap-3 p-6 transition-shadow hover:shadow-md">
              <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <f.icon className="size-5" />
              </div>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* how it works */}
      <section id="how" className="scroll-mt-20 bg-primary text-primary-foreground">
        <div className="mx-auto max-w-6xl px-4 py-24">
          <div className="mb-14 max-w-2xl space-y-3">
            <p className="text-sm font-medium text-primary-foreground/70">
              A typical day at Rahim General Store
            </p>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              From “baki please” to paid, in four steps.
            </h2>
          </div>
          <ol className="grid gap-8 md:grid-cols-4">
            {steps.map((s) => (
              <li key={s.n} className="space-y-3 border-t border-primary-foreground/20 pt-6">
                <span className="tabular text-sm font-semibold text-brand-amber">{s.n}</span>
                <h3 className="text-lg font-semibold">{s.title}</h3>
                <p className="text-sm leading-relaxed text-primary-foreground/75">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* who */}
      <section id="who" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              icon: Store,
              title: 'Shop owners',
              body: 'See every taka out on credit, who is late, and which staff gave it. Set limits and terms per customer.',
            },
            {
              icon: Layers3,
              title: 'Staff at the counter',
              body: 'Phone number, items, done. The system checks limits and stock so you don’t have to argue.',
            },
            {
              icon: UserRound,
              title: 'Customers',
              body: 'Check what you owe at every shop, see a clear statement, pay by bKash and raise a dispute if something is wrong.',
            },
          ].map((r) => (
            <div key={r.title} className="space-y-3 rounded-2xl border bg-card p-6">
              <r.icon className="size-5 text-primary" />
              <h3 className="font-semibold">{r.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{r.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 overflow-hidden rounded-3xl border bg-card p-10 text-center md:p-16">
          <div className="space-y-6">
            <h2 className="text-3xl font-semibold tracking-tight text-balance">
              Close the paper khata for good.
            </h2>
            <p className="mx-auto max-w-lg text-muted-foreground">
              Register your shop in two minutes. An admin verifies it, and you can start recording
              baki the same day.
            </p>
            <div className="flex justify-center gap-3">
              <Button asChild size="lg">
                <Link to="/register">
                  Register shop <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/login">Log in</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row">
          <Logo />
          <p>© {new Date().getFullYear()} DokanKhata · Made for Bangladesh</p>
        </div>
      </footer>
    </div>
  );
}
