// layout for login, register and claim
import { Link, Outlet } from 'react-router';
import { Logo } from '@/components/app/logo';
import { ThemeToggle } from '@/components/app/theme-toggle';
import { STATIC_PREVIEW } from '@/api/client';

export function AuthLayout() {
  return (
    <div className="grid min-h-svh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Link to="/" className="relative">
          <Logo className="[&_span]:text-primary-foreground [&_rect]:fill-primary-foreground/15" />
        </Link>
        <div className="relative max-w-md space-y-6">
          <p className="font-bangla text-3xl leading-snug font-medium">
            “খাতা ভিজে গেলে হিসাবও ভেসে যায়।”
          </p>
          <p className="text-lg leading-relaxed text-primary-foreground/80">
            When the khata gets wet, the accounts wash away. DokanKhata keeps every taka of baki
            safe, reminded and provable.
          </p>
        </div>
        <p className="relative text-sm text-primary-foreground/60">
          © {new Date().getFullYear()} DokanKhata
        </p>
      </aside>
      <section className="flex flex-col">
        <div className="flex items-center justify-between p-4 lg:justify-end">
          <Link to="/" className="lg:hidden">
            <Logo />
          </Link>
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center px-4 pb-16">
          <div className="w-full max-w-sm">
            {STATIC_PREVIEW && (
              <p className="mb-6 rounded-lg border border-dashed px-3 py-2.5 text-sm text-muted-foreground">
                This is the static preview on GitHub Pages. Logging in needs the DokanKhata server,
                so run the project on your own computer to use the app.
              </p>
            )}
            <Outlet />
          </div>
        </div>
      </section>
    </div>
  );
}
