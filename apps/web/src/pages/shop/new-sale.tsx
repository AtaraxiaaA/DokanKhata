// new credit sale. look at this page first if you're building one of the others,
// it has the whole flow: lookup -> cart -> mutation -> toast, with DB errors shown as-is
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  Loader2,
  Minus,
  PackageSearch,
  Phone,
  Plus,
  ReceiptText,
  Search,
  Trash2,
  UserX,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDate, normalizePhone, PHONE_REGEX, type ShopProductRow } from '@dokankhata/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, errorMessage } from '@/api/client';
import { useCustomerLookup } from '@/api/queries/customers';
import { useShopProducts } from '@/api/queries/products';
import { useCreateSale } from '@/api/queries/sales';
import { CustomerRiskCard } from '@/components/app/customer-risk-card';
import { Money } from '@/components/app/money';
import { PageHeader } from '@/components/app/page-header';
import { EmptyState, ErrorState } from '@/components/app/states';
import { useShop } from '@/lib/use-shop';
import { cn } from '@/lib/utils';

type Cart = Map<number, { product: ShopProductRow; qty: number }>;

const round2 = (n: number) => Math.round(n * 100) / 100;

export default function NewSalePage() {
  const shop = useShop();
  const [phoneInput, setPhoneInput] = useState('');
  const phone = normalizePhone(phoneInput);
  const lookup = useCustomerLookup(shop.shopId, phone);
  const products = useShopProducts(shop.shopId);
  const createSale = useCreateSale(shop.shopId);

  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<Cart>(new Map());
  const [note, setNote] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = products.data ?? [];
    if (!q) return list;
    return list.filter((p) =>
      [p.name, p.banglaName ?? '', p.brand, p.category].some((s) => s.toLowerCase().includes(q)),
    );
  }, [products.data, search]);

  // just a preview, the DB recalculates the total from the price list
  const total = round2([...cart.values()].reduce((s, l) => s + l.qty * l.product.sellPrice, 0));
  const account = lookup.data?.account;
  const overLimit = !!account && account.balance + total > account.creditLimit;
  const canSubmit =
    !!account && account.status === 'active' && cart.size > 0 && !createSale.isPending;

  const setQty = (p: ShopProductRow, qty: number) =>
    setCart((prev) => {
      const next = new Map(prev);
      const q = round2(Math.max(0, qty));
      if (q === 0) next.delete(p.shopProductId);
      else next.set(p.shopProductId, { product: p, qty: q });
      return next;
    });
  const add = (p: ShopProductRow) => setQty(p, (cart.get(p.shopProductId)?.qty ?? 0) + 1);

  const submit = async () => {
    if (!account) return;
    try {
      const sale = await createSale.mutateAsync({
        shopCustomerId: account.shopCustomerId,
        items: [...cart.values()].map((l) => ({
          shopProductId: l.product.shopProductId,
          qty: l.qty,
        })),
        note: note.trim() || undefined,
      });
      toast.success(`Baki recorded · Sale #${sale.saleId}`, {
        description: `${lookup.data?.fullName}: ৳${sale.totalAmount.toLocaleString('en-IN')} due ${formatDate(sale.dueDate)}`,
      });
      setCart(new Map());
      setNote('');
    } catch (e) {
      // 422 means a DB rule refused it (limit, stock, blocked), show their message
      toast.error(
        e instanceof ApiError && e.status === 422
          ? 'The sale was refused'
          : 'Could not save the sale',
        {
          description: errorMessage(e),
        },
      );
    }
  };

  if (!shop.canGiveCredit)
    return (
      <EmptyState
        icon={UserX}
        title="You can’t give credit at this shop"
        description="Ask the shop owner to turn on “can give credit” for your account."
      />
    );

  return (
    <div>
      <PageHeader
        title="New credit sale"
        description="Find the customer by phone, add items, and save. Limits and stock are checked by the database."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* ------------ left: customer + products ------------ */}
        <div className="min-w-0 space-y-6">
          <section className="space-y-3">
            <Label htmlFor="phone" className="text-sm font-medium">
              1 · Customer
            </Label>
            <div className="relative">
              <Phone className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="phone"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="Mobile number, e.g. 01712345678"
                inputMode="tel"
                autoFocus
                className="tabular h-11 pl-9 text-base"
              />
              {lookup.isFetching && (
                <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>
            {phone.length > 0 && !PHONE_REGEX.test(phone) && phone.length >= 11 && (
              <p className="text-xs text-destructive">
                That doesn’t look like a Bangladeshi mobile number.
              </p>
            )}
            {lookup.isError &&
              (lookup.error instanceof ApiError && lookup.error.status === 404 ? (
                <Card className="flex-row items-center justify-between gap-3 p-4 text-sm">
                  <span className="text-muted-foreground">No customer with this number yet.</span>
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/shop/${shop.shopId}/customers/new?phone=${phone}`}>
                      Add customer
                    </Link>
                  </Button>
                </Card>
              ) : (
                <ErrorState error={lookup.error} onRetry={() => lookup.refetch()} />
              ))}
            {lookup.data && (
              <CustomerRiskCard data={lookup.data} shopId={shop.shopId} extraBalance={total} />
            )}
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Label htmlFor="product-search" className="text-sm font-medium">
                2 · Items
              </Label>
              <div className="relative w-full max-w-64">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="product-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search rice, তেল, Lux…"
                  className="h-9 pl-9"
                />
              </div>
            </div>
            <Card className="gap-0 p-0">
              <ScrollArea className="h-[360px] [&_[data-radix-scroll-area-viewport]>div]:!block">
                {products.isPending ? (
                  <div className="space-y-2 p-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : products.isError ? (
                  <ErrorState error={products.error} onRetry={() => products.refetch()} />
                ) : filtered.length === 0 ? (
                  <EmptyState icon={PackageSearch} title="No matching products" />
                ) : (
                  <ul className="divide-y">
                    {filtered.map((p) => {
                      const inCart = cart.get(p.shopProductId)?.qty ?? 0;
                      const out = p.trackStock && p.stockQty - inCart <= 0;
                      return (
                        <li key={p.shopProductId}>
                          <button
                            type="button"
                            onClick={() => add(p)}
                            disabled={out}
                            className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent/60 disabled:opacity-50"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                {p.name}
                                {p.brand !== 'Loose' && (
                                  <span className="font-normal text-muted-foreground">
                                    {' '}
                                    · {p.brand}
                                  </span>
                                )}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {p.banglaName && (
                                  <span className="font-bangla">{p.banglaName} · </span>
                                )}
                                {p.trackStock ? `${p.stockQty} ${p.unit} in stock` : p.category}
                              </p>
                            </div>
                            <span className="text-sm">
                              <Money value={p.sellPrice} />
                              <span className="text-xs text-muted-foreground">/{p.unit}</span>
                            </span>
                            <span
                              className={cn(
                                'grid size-7 place-items-center rounded-full border text-xs',
                                inCart > 0 && 'border-primary bg-primary text-primary-foreground',
                              )}
                            >
                              {inCart > 0 ? (
                                <span className="tabular">{inCart}</span>
                              ) : (
                                <Plus className="size-3.5" />
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </ScrollArea>
            </Card>
          </section>
        </div>

        {/* ------------ right: cart ------------ */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <Card className="gap-0 p-0">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="flex items-center gap-2 font-medium">
                <ReceiptText className="size-4" /> Bill
              </h2>
              <span className="text-xs text-muted-foreground">{cart.size} items</span>
            </div>

            {cart.size === 0 ? (
              <EmptyState
                title="No items yet"
                description="Tap a product to add it."
                className="py-10"
              />
            ) : (
              <ul className="divide-y">
                {[...cart.values()].map(({ product: p, qty }) => (
                  <li key={p.shopProductId} className="space-y-2 px-5 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm leading-tight font-medium">{p.name}</p>
                      <Money value={round2(qty * p.sellPrice)} className="text-sm font-medium" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-7"
                        onClick={() => setQty(p, qty - 1)}
                        aria-label="Less"
                      >
                        <Minus className="size-3" />
                      </Button>
                      <Input
                        type="number"
                        min={0}
                        step="0.25"
                        value={qty}
                        onChange={(e) => setQty(p, Number(e.target.value))}
                        className="tabular h-7 w-16 px-2 text-center text-sm"
                        aria-label={`Quantity of ${p.name}`}
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-7"
                        onClick={() => setQty(p, qty + 1)}
                        aria-label="More"
                      >
                        <Plus className="size-3" />
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        {p.unit} × <Money value={p.sellPrice} />
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="ml-auto size-7 text-muted-foreground"
                        onClick={() => setQty(p, 0)}
                        aria-label={`Remove ${p.name}`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-4 border-t px-5 py-4">
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note (optional)"
                maxLength={255}
                rows={2}
                className="resize-none text-sm"
              />
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Total</span>
                <Money value={total} exact className="text-2xl font-semibold tracking-tight" />
              </div>
              {account && (
                <p className="text-xs text-muted-foreground">
                  Due in {account.dueDays} days. Reminders are queued automatically.
                </p>
              )}
              <Button className="h-11 w-full" disabled={!canSubmit} onClick={submit}>
                {createSale.isPending && <Loader2 className="animate-spin" />}
                {overLimit ? 'Try anyway (over limit)' : 'Record baki'}
              </Button>
              {!account && (
                <p className="text-center text-xs text-muted-foreground">
                  Find a customer of this shop first.
                </p>
              )}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
