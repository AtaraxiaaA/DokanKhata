import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/app/logo';

export default function NotFoundPage() {
  return (
    <div className="grid min-h-svh place-items-center p-6">
      <div className="space-y-6 text-center">
        <Logo className="justify-center" />
        <div className="space-y-2">
          <p className="tabular text-6xl font-semibold tracking-tight text-primary">404</p>
          <p className="text-muted-foreground">This page isn't in the khata.</p>
        </div>
        <Button asChild>
          <Link to="/">Go home</Link>
        </Button>
      </div>
    </div>
  );
}
