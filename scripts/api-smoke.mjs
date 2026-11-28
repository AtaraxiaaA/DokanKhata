// npm run test:api
// hits every endpoint as each role and checks the status codes (and a few rules).
// needs the API running (npm run dev). it WRITES test data, so run npm run db:reset after.
const BASE = process.env.API_URL ?? 'http://localhost:3001/api';
const PW = 'dokan123';
const results = [];

function session() {
  let cookie = '';
  async function req(method, path, body) {
    const res = await fetch(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* empty body */
    }
    return { status: res.status, data };
  }
  return {
    get: (p) => req('GET', p),
    post: (p, b = {}) => req('POST', p, b),
    patch: (p, b = {}) => req('PATCH', p, b),
  };
}

async function check(name, promise, expect, extra) {
  const r = await promise;
  const want = Array.isArray(expect) ? expect : [expect];
  let ok = want.includes(r.status);
  let why = ok ? '' : `got ${r.status} ${r.data?.error?.message ?? ''}`;
  if (ok && extra) {
    const msg = extra(r.data);
    if (msg) {
      ok = false;
      why = msg;
    }
  }
  results.push({ name, ok, why });
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  <- ${why}`}`);
  return r.data;
}

async function login(phone) {
  const s = session();
  const r = await s.post('/auth/login', { identifier: phone, password: PW });
  if (r.status !== 200) throw new Error(`login ${phone} failed: ${r.status}`);
  return s;
}

const rand = (n) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, '0');
const newPhone = () => '017' + rand(8);

// ---------------------------------------------------------------- public
const pub = session();
await check('meta/health', pub.get('/meta/health'), 200);
const areas = await check('meta/areas', pub.get('/meta/areas'), 200, (d) =>
  d.length ? '' : 'no areas',
);
await check('meta/categories', pub.get('/meta/categories'), 200);
await check(
  'login wrong password',
  pub.post('/auth/login', { identifier: '01534490777', password: 'nope' }),
  401,
);
await check('shop route without login', pub.get('/shops/1/customers'), 401);

// ---------------------------------------------------------------- owner reads
const owner = await login('01534490777');
const S = '/shops/1';
await check('dashboard', owner.get(`${S}/settings/dashboard`), 200, (d) =>
  d.kpis && d.aging ? '' : 'missing kpis',
);
await check('settings', owner.get(`${S}/settings`), 200);
const custs = await check(
  'customers list',
  owner.get(`${S}/customers?owing=1&limit=5`),
  200,
  (d) => (d.rows.length ? '' : 'empty'),
);
const someone = custs.rows[0];
await check('customer lookup', owner.get(`${S}/customers/lookup?phone=${someone.phone}`), 200);
await check('customer lookup unknown', owner.get(`${S}/customers/lookup?phone=01799999999`), 404);
await check('guarantor risk (Q12)', owner.get(`${S}/customers/guarantor-risk`), 200);
await check('customer detail', owner.get(`${S}/customers/${someone.shopCustomerId}`), 200);
await check('other shop customer detail', owner.get(`${S}/customers/999999`), 404);
const prods = await check('products', owner.get(`${S}/products`), 200);
await check('products/all', owner.get(`${S}/products/all`), 200);
const catalog = await check('catalog', owner.get(`${S}/products/catalog`), 200);
const sales = await check('sales list', owner.get(`${S}/sales?limit=5`), 200, (d) =>
  d.rows.length ? '' : 'empty',
);
await check('sale detail', owner.get(`${S}/sales/${sales.rows[0].saleId}`), 200, (d) =>
  d.items.length ? '' : 'no items',
);
const pays = await check('payments list', owner.get(`${S}/payments?limit=5`), 200);
await check('payment detail (Q6)', owner.get(`${S}/payments/${pays.rows[0].paymentId}`), 200);
await check('ledger (Q7)', owner.get(`${S}/ledger/${someone.shopCustomerId}`), 200, (d) => {
  const last = d.lines.at(-1);
  return Math.abs(last.runningBalance - d.account.balance) < 0.01
    ? ''
    : `running ${last.runningBalance} != balance ${d.account.balance}`;
});
await check('adjustments list', owner.get(`${S}/adjustments`), 200);
await check('disputes list', owner.get(`${S}/disputes`), 200);
await check('promises list', owner.get(`${S}/promises`), 200);
await check('repeat breakers (Q11)', owner.get(`${S}/promises/repeat-breakers`), 200);
await check('reminders', owner.get(`${S}/reminders?status=queued`), 200);
await check('staff list', owner.get(`${S}/staff`), 200);
await check('statement months', owner.get(`${S}/statements/months`), 200);
await check('statements', owner.get(`${S}/statements`), 200);
await check('report aging (Q1)', owner.get(`${S}/reports/aging`), 200);
await check('report trend (Q8)', owner.get(`${S}/reports/trend?months=6`), 200, (d) =>
  d.length === 6 ? '' : `got ${d.length} months`,
);
await check('report festival (Q9)', owner.get(`${S}/reports/festival`), 200);
await check('report top debtors (Q10)', owner.get(`${S}/reports/top-debtors`), 200);
await check('report staff (Q13)', owner.get(`${S}/reports/staff`), 200);
await check('report products (Q15)', owner.get(`${S}/reports/products`), 200);

// ---------------------------------------------------------------- owner writes
const phone = newPhone();
const created = await check(
  'add customer',
  owner.post(`${S}/customers`, { phone, fullName: 'Smoke Test Customer', creditLimit: 3000 }),
  201,
);
const acct = created.shopCustomerId;
await check(
  'add same customer again',
  owner.post(`${S}/customers`, { phone, fullName: 'Smoke Test Customer' }),
  409,
);
const item = prods.find((p) => !p.trackStock || p.stockQty >= 5);
const sale = await check(
  'credit sale',
  owner.post(`${S}/sales`, {
    shopCustomerId: acct,
    items: [{ shopProductId: item.shopProductId, qty: 2 }],
  }),
  201,
);
await check(
  'credit sale over limit',
  owner.post(`${S}/sales`, {
    shopCustomerId: acct,
    items: [{ shopProductId: item.shopProductId, qty: 9999 }],
  }),
  422,
);
await check(
  'payment preview',
  owner.get(`${S}/payments/preview?shopCustomerId=${acct}&amount=10`),
  200,
  (d) => (d.allocations.length === 1 ? '' : 'expected 1 allocation'),
);
await check(
  'cash payment',
  owner.post(`${S}/payments`, { shopCustomerId: acct, amount: 10, method: 'cash' }),
  201,
  (d) => (d.allocations.length ? '' : 'no allocations'),
);
const trx = 'SMK' + rand(7);
await check(
  'bkash payment',
  owner.post(`${S}/payments`, { shopCustomerId: acct, amount: 5, method: 'bkash', trxRef: trx }),
  201,
);
await check(
  'same TrxID twice',
  owner.post(`${S}/payments`, { shopCustomerId: acct, amount: 5, method: 'bkash', trxRef: trx }),
  [409, 422],
);
await check(
  'bkash without TrxID',
  owner.post(`${S}/payments`, { shopCustomerId: acct, amount: 5, method: 'bkash' }),
  400,
);
await check(
  'overpay',
  owner.post(`${S}/payments`, { shopCustomerId: acct, amount: 999999, method: 'cash' }),
  422,
);
const tomorrow = new Date(Date.now() + 86400e3 * 3).toISOString().slice(0, 10);
await check(
  'promise',
  owner.post(`${S}/promises`, { shopCustomerId: acct, promisedAmount: 50, promisedDate: tomorrow }),
  201,
);
const dispute = await check(
  'dispute at counter',
  owner.post(`${S}/disputes`, {
    saleId: sale.saleId,
    reason: 'Customer says one item was not taken',
  }),
  201,
);
await check(
  'second open dispute',
  owner.post(`${S}/disputes`, { saleId: sale.saleId, reason: 'again again' }),
  409,
);
await check('sale is disputed', owner.get(`${S}/sales/${sale.saleId}`), 200, (d) =>
  d.sale.status === 'disputed' ? '' : d.sale.status,
);
await check(
  'resolve dispute',
  owner.patch(`${S}/disputes/${dispute.disputeId}`, {
    status: 'rejected',
    resolution: 'Checked the bill, it is right',
  }),
  200,
);
await check(
  'adjustment',
  owner.post(`${S}/adjustments`, {
    saleId: sale.saleId,
    type: 'discount',
    amount: 1,
    reason: 'smoke test',
  }),
  201,
);
await check(
  'adjustment too big',
  owner.post(`${S}/adjustments`, {
    saleId: sale.saleId,
    type: 'discount',
    amount: 99999,
    reason: 'too much',
  }),
  422,
);
const later = new Date(Date.now() + 86400e3 * 40).toISOString().slice(0, 10);
await check(
  'extend due date',
  owner.patch(`${S}/sales/${sale.saleId}/due-date`, { dueDate: later }),
  200,
);
await check(
  'due date earlier',
  owner.patch(`${S}/sales/${sale.saleId}/due-date`, { dueDate: '2020-01-01' }),
  422,
);
await check(
  'change credit limit',
  owner.patch(`${S}/customers/${acct}`, { creditLimit: 3500 }),
  200,
);
await check(
  'block without reason',
  owner.patch(`${S}/customers/${acct}`, { status: 'blocked' }),
  400,
);
await check(
  'block account',
  owner.patch(`${S}/customers/${acct}`, { status: 'blocked', blockedReason: 'smoke test' }),
  200,
);
await check(
  'sale on blocked account',
  owner.post(`${S}/sales`, {
    shopCustomerId: acct,
    items: [{ shopProductId: item.shopProductId, qty: 1 }],
  }),
  422,
);
await check('unblock account', owner.patch(`${S}/customers/${acct}`, { status: 'active' }), 200);
await check(
  'guarantor',
  owner.post(`${S}/customers/${acct}/guarantors`, {
    guarantorCustomerId: someone.customerId,
    guaranteeLimit: 1000,
  }),
  201,
);
await check(
  'self guarantor',
  owner.post(`${S}/customers/${someone.shopCustomerId}/guarantors`, {
    guarantorCustomerId: someone.customerId,
    guaranteeLimit: 10,
  }),
  422,
);
const staffPhone = newPhone();
const staff = await check(
  'add staff',
  owner.post(`${S}/staff`, { phone: staffPhone, fullName: 'Smoke Cashier', password: 'password1' }),
  201,
);
await check(
  'staff can give credit',
  owner.patch(`${S}/staff/${staff.userId}`, { canGiveCredit: true }),
  200,
);
if (catalog.length) {
  const added = await check(
    'add catalog product',
    owner.post(`${S}/products`, { productId: catalog[0].productId, sellPrice: 99, stockQty: 10 }),
    201,
  );
  await check(
    'change price',
    owner.patch(`${S}/products/${added.shopProductId}`, { sellPrice: 101 }),
    200,
  );
  await check(
    'add same product again',
    owner.post(`${S}/products`, { productId: catalog[0].productId, sellPrice: 99 }),
    409,
  );
}
const rem = await owner.get(`${S}/reminders?status=queued`);
if (rem.data?.length)
  await check(
    'mark reminder sent',
    owner.patch(`${S}/reminders/${rem.data[0].reminderId}`, { status: 'sent' }),
    200,
  );
await check('generate statements', owner.post(`${S}/statements/generate`, {}), 200);
await check('update settings', owner.patch(`${S}/settings`, { defaultDueDays: 15 }), 200);

// ---------------------------------------------------------------- staff permissions
const cashier = await login('01622889115'); // shop 2, can't give credit
await check(
  'cashier sale without permission',
  cashier.post('/shops/2/sales', { shopCustomerId: 1, items: [{ shopProductId: 1, qty: 1 }] }),
  403,
);
await check(
  'cashier changing a limit',
  cashier.patch('/shops/2/customers/1', { creditLimit: 1 }),
  403,
);
await check('cashier at another shop', cashier.get(`${S}/customers`), 403);
await check('cashier staff report', cashier.get('/shops/2/reports/staff'), 403);

// ---------------------------------------------------------------- customer portal
const cust = await login('01394132777'); // Fahim Sikder, the demo customer
const bal = await check('portal balances', cust.get('/portal/balances'), 200, (d) =>
  d.accounts.length ? '' : 'no accounts',
);
const mine = bal.accounts[0];
await check('portal statement', cust.get(`/portal/statement/${mine.shopCustomerId}`), 200);
await check('portal someone else statement', cust.get(`/portal/statement/${acct}`), 404);
await check('portal trust (Q5, Q17)', cust.get('/portal/trust'), 200);
const mySales = await check('portal sales', cust.get(`/portal/sales/${mine.shopCustomerId}`), 200);
const disputable = mySales.find((s) => !s.hasOpenDispute);
if (disputable)
  await check(
    'portal dispute',
    cust.post('/portal/disputes', { saleId: disputable.saleId, reason: 'I did not buy this one' }),
    201,
  );
await check(
  'portal dispute on other sale',
  cust.post('/portal/disputes', { saleId: sale.saleId, reason: 'not mine at all' }),
  404,
);
const owing = bal.accounts.find((a) => a.balance >= 2);
if (owing)
  await check(
    'portal pay (prototype)',
    cust.post('/portal/pay', { shopCustomerId: owing.shopCustomerId, amount: 1, method: 'bkash' }),
    [201, 422],
  );
await check('customer on shop route', cust.get(`${S}/customers`), 403);
await check('customer on admin route', cust.get('/admin/overview'), 403);

// ---------------------------------------------------------------- admin
const admin = await login('01927948204');
await check('admin overview', admin.get('/admin/overview'), 200);
await check('admin shops', admin.get('/admin/shops'), 200);
await check('admin users', admin.get('/admin/users?role=staff'), 200);
await check('admin audit log', admin.get('/admin/audit-log'), 200, (d) =>
  d.rows.some((r) => r.changedBy === 'Rahim Uddin')
    ? ''
    : 'credit limit change not logged with the owner name',
);
for (const level of ['area', 'thana', 'district'])
  await check(
    `admin area risk ${level} (Q14)`,
    admin.get(`/admin/reports/area-risk?level=${level}`),
    200,
  );
await check('admin exposure (Q3)', admin.get('/admin/reports/exposure?minShops=2'), 200);
await check('admin suspend self', admin.patch('/admin/users/1', { status: 'suspended' }), 422);

// ---------------------------------------------------------------- register a shop -> approve
const newOwner = session();
const ownerPhone = newPhone();
const reg = await check(
  'register shop',
  newOwner.post('/auth/register-shop', {
    owner: { fullName: 'Smoke Owner', phone: ownerPhone, password: 'password1' },
    shop: {
      name: 'Smoke Test Store',
      shopType: 'grocery',
      areaId: areas[0].areaId,
      address: 'House 1, Road 2, Mirpur',
    },
  }),
  201,
  (d) => (d.shops[0]?.shopStatus === 'pending' ? '' : 'shop not pending'),
);
const newShop = reg.shops[0].shopId;
await check(
  'register same phone',
  session().post('/auth/register-shop', {
    owner: { fullName: 'Again', phone: ownerPhone, password: 'password1' },
    shop: {
      name: 'Again Store',
      shopType: 'grocery',
      areaId: areas[0].areaId,
      address: 'Somewhere far away',
    },
  }),
  409,
);
const c2 = await check(
  'pending shop adds customer',
  newOwner.post(`/shops/${newShop}/customers`, { phone: newPhone(), fullName: 'First Customer' }),
  201,
);
await check(
  'pending shop sale refused',
  newOwner.post(`/shops/${newShop}/sales`, {
    shopCustomerId: c2.shopCustomerId,
    items: [{ shopProductId: 1, qty: 1 }],
  }),
  403,
);
await check(
  'admin approves shop',
  admin.patch(`/admin/shops/${newShop}/verify`, { action: 'approve' }),
  200,
);
await check(
  'approve twice',
  admin.patch(`/admin/shops/${newShop}/verify`, { action: 'approve' }),
  422,
);
await check(
  'admin suspends shop',
  admin.patch(`/admin/shops/${newShop}/verify`, { action: 'suspend' }),
  200,
);
await check(
  'admin reactivates shop',
  admin.patch(`/admin/shops/${newShop}/verify`, { action: 'reactivate' }),
  200,
);

// suspend a user -> their session dies
await check(
  'admin suspends owner',
  admin.patch(`/admin/users/${reg.userId}`, { status: 'suspended' }),
  200,
);
await check('suspended owner session gone', newOwner.get('/auth/me'), 401);
await check(
  'admin reactivates owner',
  admin.patch(`/admin/users/${reg.userId}`, { status: 'active' }),
  200,
);

// ---------------------------------------------------------------- claim a customer login
const claimer = session();
await check('claim start', claimer.post('/auth/claim/start', { phone }), 200, (d) =>
  d.demoCode ? '' : 'no demo code in dev',
);
await check(
  'claim wrong code',
  claimer.post('/auth/claim', { phone, otp: '000000', password: 'password1' }),
  422,
);
await check(
  'claim',
  claimer.post('/auth/claim', { phone, otp: '123456', password: 'password1' }),
  201,
);
await check('claimed customer sees balance', claimer.get('/portal/balances'), 200, (d) =>
  d.accounts.length === 1 ? '' : 'expected 1 account',
);
await check('claim again', session().post('/auth/claim/start', { phone }), 409);
await check(
  'claim unknown number',
  session().post('/auth/claim/start', { phone: '01799999998' }),
  404,
);

// ---------------------------------------------------------------- summary
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log('failed:\n' + failed.map((f) => `  - ${f.name}: ${f.why}`).join('\n'));
  process.exit(1);
}
console.log('remember to run npm run db:reset to clear the test data');
