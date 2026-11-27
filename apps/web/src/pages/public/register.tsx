// register a shop: owner details first, then the shop. the shop starts as pending
// until an admin approves it, but the owner is logged in right away
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Loader2, Store } from 'lucide-react';
import { toast } from 'sonner';
import { registerShopSchema, SHOP_TYPES, type RegisterShopInput } from '@dokankhata/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { errorMessage } from '@/api/client';
import { useRegisterShop } from '@/api/queries/auth';
import { useAreas } from '@/api/queries/meta';
import { cn } from '@/lib/utils';

const SHOP_TYPE_LABEL: Record<(typeof SHOP_TYPES)[number], string> = {
  grocery: 'Grocery / mudi dokan',
  pharmacy: 'Pharmacy',
  hardware: 'Hardware',
  stationery: 'Stationery',
  tea_stall: 'Tea stall',
  cosmetics: 'Cosmetics',
  electronics: 'Electronics',
  other: 'Other',
};

function FieldError({ msg }: { msg?: string }) {
  return msg ? <p className="text-xs text-destructive">{msg}</p> : null;
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const areas = useAreas();
  const areaList = areas.data;
  const register = useRegisterShop();
  const [step, setStep] = useState<1 | 2>(1);
  const [showPw, setShowPw] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<RegisterShopInput>({
    resolver: zodResolver(registerShopSchema),
    defaultValues: {
      owner: { fullName: '', phone: '', email: '', password: '' },
      shop: {
        name: '',
        shopType: 'grocery',
        tradeLicenceNo: '',
        areaId: undefined as unknown as number,
        address: '',
        phone: '',
      },
    },
  });
  const { errors } = form.formState;

  // areas grouped by district for the dropdown
  const areaGroups = useMemo(() => {
    const groups = new Map<string, NonNullable<typeof areaList>>();
    for (const a of areaList ?? []) {
      const key = `${a.district}, ${a.division}`;
      groups.set(key, [...(groups.get(key) ?? []), a]);
    }
    return [...groups.entries()];
  }, [areaList]);

  const next = async () => {
    const ok = await form.trigger([
      'owner.fullName',
      'owner.phone',
      'owner.email',
      'owner.password',
    ]);
    if (ok) setStep(2);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      const user = await register.mutateAsync(values);
      toast.success('Your shop is registered', {
        description:
          'An admin will verify it soon. You can set up customers and products meanwhile.',
      });
      navigate(`/shop/${user.shops[0]?.shopId}`, { replace: true });
    } catch (e) {
      setServerError(errorMessage(e));
      // a taken phone number belongs to step 1
      if (/phone number already/i.test(errorMessage(e))) setStep(1);
    }
  });

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <span className={cn('h-1 w-8 rounded-full bg-primary')} />
          <span className={cn('h-1 w-8 rounded-full', step === 2 ? 'bg-primary' : 'bg-muted')} />
          <span className="ml-1">Step {step} of 2</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {step === 1 ? 'Register your shop' : 'About your shop'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {step === 1
            ? 'First, your own details. You’ll log in with this number.'
            : 'This is what your customers and staff will see.'}
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {step === 1 ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="fullName">Your full name</Label>
              <Input
                id="fullName"
                autoFocus
                autoComplete="name"
                aria-invalid={!!errors.owner?.fullName}
                {...form.register('owner.fullName')}
              />
              <FieldError msg={errors.owner?.fullName?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Mobile number</Label>
              <Input
                id="phone"
                inputMode="tel"
                autoComplete="tel"
                placeholder="01XXXXXXXXX"
                aria-invalid={!!errors.owner?.phone}
                {...form.register('owner.phone')}
              />
              <FieldError msg={errors.owner?.phone?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">
                Email <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                aria-invalid={!!errors.owner?.email}
                {...form.register('owner.email')}
              />
              <FieldError msg={errors.owner?.email?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="new-password"
                  className="pr-10"
                  aria-invalid={!!errors.owner?.password}
                  {...form.register('owner.password')}
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
              <FieldError msg={errors.owner?.password?.message ?? undefined} />
              {!errors.owner?.password && (
                <p className="text-xs text-muted-foreground">At least 8 characters.</p>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="shopName">Shop name</Label>
              <Input
                id="shopName"
                autoFocus
                placeholder="e.g. Rahim General Store"
                aria-invalid={!!errors.shop?.name}
                {...form.register('shop.name')}
              />
              <FieldError msg={errors.shop?.name?.message} />
            </div>
            <div className="space-y-2">
              <Label>Type of shop</Label>
              <Controller
                control={form.control}
                name="shop.shopType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SHOP_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {SHOP_TYPE_LABEL[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label>Area</Label>
              <Controller
                control={form.control}
                name="shop.areaId"
                render={({ field }) => (
                  <Select
                    value={field.value ? String(field.value) : undefined}
                    onValueChange={(v) => field.onChange(Number(v))}
                  >
                    <SelectTrigger className="w-full" aria-invalid={!!errors.shop?.areaId}>
                      <SelectValue
                        placeholder={areas.isPending ? 'Loading areas…' : 'Pick your area'}
                      />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {areaGroups.map(([group, list]) => (
                        <SelectGroup key={group}>
                          <SelectLabel>{group}</SelectLabel>
                          {list.map((a) => (
                            <SelectItem key={a.areaId} value={String(a.areaId)}>
                              {a.name} <span className="text-muted-foreground">· {a.thana}</span>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError msg={errors.shop?.areaId ? 'Pick your area' : undefined} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                placeholder="Shop no., road, block"
                aria-invalid={!!errors.shop?.address}
                {...form.register('shop.address')}
              />
              <FieldError msg={errors.shop?.address?.message} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="licence">
                  Trade licence{' '}
                  <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input id="licence" {...form.register('shop.tradeLicenceNo')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shopPhone">
                  Shop phone <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="shopPhone"
                  inputMode="tel"
                  placeholder="Same as yours"
                  aria-invalid={!!errors.shop?.phone}
                  {...form.register('shop.phone')}
                />
              </div>
            </div>
            <FieldError msg={errors.shop?.phone?.message} />
          </>
        )}

        {serverError && (
          <p
            role="alert"
            className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {serverError}
          </p>
        )}

        {step === 1 ? (
          <Button type="button" className="w-full" size="lg" onClick={next}>
            Continue <ArrowRight />
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="lg" onClick={() => setStep(1)}>
              <ArrowLeft /> Back
            </Button>
            <Button type="submit" className="flex-1" size="lg" disabled={register.isPending}>
              {register.isPending ? <Loader2 className="animate-spin" /> : <Store />}
              Register shop
            </Button>
          </div>
        )}
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Already registered?{' '}
        <Link to="/login" className="font-medium text-primary hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
