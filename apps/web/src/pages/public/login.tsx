// login page. also a good example of react-hook-form + zod + showing API errors
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocation, useNavigate } from 'react-router';
import { Eye, EyeOff, Loader2, LogIn } from 'lucide-react';
import { loginSchema, type LoginInput } from '@dokankhata/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { errorMessage } from '@/api/client';
import { homePathFor, useAuth } from '@/auth/auth';

// demo accounts from the seed (password dokan123), only shown in dev
const DEMO = [
  { role: 'Owner', who: 'Rahim General Store', phone: '01534490777' },
  { role: 'Manager', who: 'Rahim General Store', phone: '01568634607' },
  { role: 'Customer', who: 'Portal', phone: '01394132777' },
  { role: 'Admin', who: 'Platform', phone: '01927948204' },
];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPw, setShowPw] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      const user = await login(values);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== '/login' ? from : homePathFor(user), { replace: true });
    } catch (e) {
      setServerError(errorMessage(e));
    }
  });

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Log in with your mobile number or email.</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="identifier">Mobile number or email</Label>
          <Input
            id="identifier"
            autoComplete="username"
            inputMode="email"
            placeholder="01XXXXXXXXX"
            autoFocus
            aria-invalid={!!errors.identifier}
            {...form.register('identifier')}
          />
          {errors.identifier && (
            <p className="text-xs text-destructive">{errors.identifier.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              className="pr-10"
              {...form.register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground hover:text-foreground"
              aria-label={showPw ? 'Hide password' : 'Show password'}
            >
              {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
        </div>

        {serverError && (
          <p
            role="alert"
            className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {serverError}
          </p>
        )}

        <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : <LogIn />}
          Log in
        </Button>
      </form>

      <div className="space-y-1 text-center text-sm text-muted-foreground">
        <p>
          New shop?{' '}
          <Link to="/register" className="font-medium text-primary hover:underline">
            Register it free
          </Link>
        </p>
        <p>
          Buying on baki somewhere?{' '}
          <Link to="/claim" className="font-medium text-primary hover:underline">
            Claim your account
          </Link>
        </p>
      </div>

      {import.meta.env.DEV && (
        <div className="space-y-2 rounded-xl border border-dashed p-3">
          <p className="text-xs font-medium text-muted-foreground">
            Demo accounts · password dokan123
          </p>
          <div className="grid grid-cols-2 gap-2">
            {DEMO.map((d) => (
              <button
                key={d.phone}
                type="button"
                onClick={() => {
                  form.setValue('identifier', d.phone);
                  form.setValue('password', 'dokan123');
                  void onSubmit();
                }}
                className="rounded-lg bg-muted/60 px-2.5 py-2 text-left transition-colors hover:bg-accent"
              >
                <p className="text-xs font-medium">{d.role}</p>
                <p className="truncate text-[11px] text-muted-foreground">{d.who}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
