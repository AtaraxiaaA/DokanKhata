// customer login setup. a shop has to add the customer first; then they can
// claim a login with the same phone number. there's no SMS gateway yet, so the
// code is a fixed demo one and in dev we show it on the page
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, Eye, EyeOff, Loader2, MessageSquareText, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { normalizePhone, PHONE_REGEX } from '@dokankhata/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { errorMessage } from '@/api/client';
import { useClaim, useClaimStart } from '@/api/queries/auth';

export default function ClaimPage() {
  const navigate = useNavigate();
  const start = useClaimStart();
  const claim = useClaim();
  const [phoneInput, setPhoneInput] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phone = normalizePhone(phoneInput);
  const found = start.data;

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!PHONE_REGEX.test(phone))
      return setError('Enter a valid Bangladeshi mobile number (01XXXXXXXXX)');
    try {
      await start.mutateAsync(phone);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const finish = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(otp)) return setError('The code is 6 digits');
    if (password.length < 8) return setError('Use at least 8 characters for the password');
    try {
      await claim.mutateAsync({ phone, otp, password });
      toast.success('You’re all set', {
        description: 'You can now see your balance at every shop.',
      });
      navigate('/me', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {found ? `Hi ${found.firstName}` : 'Claim your account'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {found
            ? `We sent a 6-digit code to ${phone}. Enter it and choose a password.`
            : 'If you buy on baki at a shop that uses DokanKhata, you can see your balance and statement here.'}
        </p>
      </div>

      {!found ? (
        <form onSubmit={sendCode} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="phone">Your mobile number</Label>
            <div className="relative">
              <Phone className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="phone"
                autoFocus
                inputMode="tel"
                autoComplete="tel"
                placeholder="01XXXXXXXXX"
                className="tabular pl-9"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">Use the number the shop has for you.</p>
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" size="lg" disabled={start.isPending}>
            {start.isPending ? <Loader2 className="animate-spin" /> : <MessageSquareText />}
            Send me a code
          </Button>
        </form>
      ) : (
        <form onSubmit={finish} className="space-y-4" noValidate>
          {found.shops.length > 0 && (
            <div className="rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">
              <p className="text-xs text-muted-foreground">Your accounts</p>
              <p className="font-medium">{found.shops.join(', ')}</p>
            </div>
          )}
          {found.demoCode && (
            <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
              Demo: no SMS is sent yet. The code is{' '}
              <span className="tabular font-semibold text-foreground">{found.demoCode}</span>.
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="otp">6-digit code</Label>
            <Input
              id="otp"
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="tabular text-lg tracking-[0.4em]"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Choose a password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPw ? 'text' : 'password'}
                autoComplete="new-password"
                className="pr-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
            <p className="text-xs text-muted-foreground">At least 8 characters.</p>
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => {
                start.reset();
                setOtp('');
                setError(null);
              }}
            >
              <ArrowLeft /> Back
            </Button>
            <Button type="submit" className="flex-1" size="lg" disabled={claim.isPending}>
              {claim.isPending && <Loader2 className="animate-spin" />}
              Create my login
            </Button>
          </div>
        </form>
      )}

      <p className="text-center text-sm text-muted-foreground">
        Already have a login?{' '}
        <Link to="/login" className="font-medium text-primary hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
