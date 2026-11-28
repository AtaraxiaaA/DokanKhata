#!/usr/bin/env python3
"""
check_seed.py: checks db/database/seed.sql without a MySQL server.
(npm run db:seed runs it for you after generating.)

1. Reads seed.sql itself and works out every value (including the
   @today - INTERVAL ... dates) for a chosen import day.
2. Checks each value against its column in schema.sql: ENUM members,
   VARCHAR lengths, DECIMAL digits, INT ranges, NOT NULL, dates, and that
   generated columns are never inserted (strict mode would refuse these).
3. Loads everything into SQLite with every PRIMARY/UNIQUE/FOREIGN KEY and
   CHECK constraint from schema.sql, plus the six views.
4. Replays the ledger in time order and checks the rules the triggers and
   procedures enforce: credit limit, blocked accounts, who may give credit,
   FIFO payment allocation, adjustment limits, sale status, promise
   outcome, reminder queueing, audit trail.
5. Mirrors sp_generate_statements and sp_calculate_trust_score to show the
   numbers the CALLs at the end of seed.sql will produce.
6. Verifies every password hash with PHP password_verify().

Usage: python3 check_seed.py schema.sql seed.sql [YYYY-MM-DD import day]
"""
import re
import sys
import json
import sqlite3
import subprocess
import datetime as dt
from decimal import Decimal as Dec
from collections import defaultdict

schema_path, seed_path = sys.argv[1], sys.argv[2]
TODAY = dt.date.fromisoformat(sys.argv[3]) if len(sys.argv) > 3 else dt.date(2026, 11, 12)
NOW = dt.datetime.combine(TODAY, dt.time(0, 30))
schema = open(schema_path, encoding='utf-8').read()
seed = open(seed_path, encoding='utf-8').read()
problems = []


def bad(msg):
    problems.append(msg)


# ----------------------------------------------------------------------------
# 1. parse seed.sql
# ----------------------------------------------------------------------------
class Parser:
    def __init__(self, s, i):
        self.s, self.i = s, i

    def ws(self):
        while self.i < len(self.s) and self.s[self.i] in ' \t\r\n':
            self.i += 1

    def take(self, word):
        self.ws()
        if self.s.startswith(word, self.i):
            self.i += len(word)
            return True
        return False

    def need(self, word):
        if not self.take(word):
            raise SyntaxError(f'expected {word!r} at {self.s[self.i:self.i + 60]!r}')

    def string(self):
        self.need("'")
        out = []
        while True:
            j = self.s.index("'", self.i)
            out.append(self.s[self.i:j])
            if self.s.startswith("''", j):
                out.append("'")
                self.i = j + 2
            else:
                self.i = j + 1
                break
        v = ''.join(out)
        if '\\' in v:
            raise SyntaxError('backslash inside a string')
        return v

    def date_expr(self):
        self.need('@today')
        d, t = TODAY, None
        while True:
            self.ws()
            if self.s[self.i] not in '+-':
                break
            sign = 1 if self.s[self.i] == '+' else -1
            self.i += 1
            self.need('INTERVAL')
            self.ws()
            if self.s[self.i] == "'":
                hm = self.string()
                self.need('HOUR_MINUTE')
                h, mi = map(int, hm.split(':'))
                if sign != 1 or t is not None:
                    raise SyntaxError('time must be added once')
                t = dt.time(h, mi)
            else:
                n = int(re.match(r'\d+', self.s[self.i:]).group())
                self.i += len(str(n))
                self.need('DAY')
                if t is not None:
                    raise SyntaxError('days after time')
                d = d + dt.timedelta(days=sign * n)
        return dt.datetime.combine(d, t).strftime('%Y-%m-%d %H:%M:%S') if t else d.isoformat()

    def value(self):
        self.ws()
        c = self.s[self.i]
        if c == "'":
            return self.string()
        if self.take('NULL'):
            return None
        if self.s.startswith('@today', self.i):
            return self.date_expr()
        if self.take('CONCAT('):
            parts = [self.value()]
            while self.take(','):
                parts.append(self.value())
            self.need(')')
            return ''.join(parts)
        if self.take('DATE_FORMAT('):
            d = self.date_expr()
            self.need(',')
            fmt = self.string()
            self.need(')')
            return dt.date.fromisoformat(d[:10]).strftime(fmt.replace('%d', '%d').replace('%b', '%b'))
        mnum = re.match(r'-?\d+(\.\d+)?', self.s[self.i:])
        if mnum:
            self.i += len(mnum.group())
            return mnum.group()
        raise SyntaxError(f'unknown value at {self.s[self.i:self.i + 60]!r}')

    def tuple_(self):
        self.need('(')
        vals = [self.value()]
        while self.take(','):
            vals.append(self.value())
        self.need(')')
        return vals


data = defaultdict(list)          # table -> list of dict rows (string values)
order = []
for mm in re.finditer(r'^INSERT INTO (\w+) \(([^)]*)\) VALUES', seed, re.M):
    table, cols = mm.group(1), [c.strip() for c in mm.group(2).split(',')]
    p = Parser(seed, mm.end())
    while True:
        vals = p.tuple_()
        if len(vals) != len(cols):
            bad(f'{table}: {len(vals)} values for {len(cols)} columns')
        data[table].append(dict(zip(cols, vals)))
        if p.take(','):
            continue
        p.need(';')
        break
    if table not in order:
        order.append(table)
statements = [l for l in seed.splitlines() if l and not l.startswith('--') and not l.startswith('  (')]
print(f'parsed {sum(len(v) for v in data.values())} rows in {len(data)} tables')

# ----------------------------------------------------------------------------
# 2. column-level checks against schema.sql
# ----------------------------------------------------------------------------
cols_spec = {}
for mt in re.finditer(r'CREATE TABLE (\w+) \((.*?)\n\) ENGINE', schema, re.S):
    t, body = mt.group(1), mt.group(2)
    body = re.sub(r'--[^\n]*', '', body)
    spec = {}
    for mc in re.finditer(r'^\s*(\w+)\s+(TINYINT|SMALLINT|BIGINT|INT|DECIMAL|VARCHAR|DATETIME|DATE|ENUM|LONGTEXT)\b'
                          r'(\([^)]*\))?([^,]*(?:,(?=[^()]*\))[^,]*)*)', body, re.M):
        name, typ, arg, rest = mc.group(1), mc.group(2), (mc.group(3) or '')[1:-1], mc.group(4)
        if name in ('PRIMARY', 'UNIQUE', 'KEY', 'CONSTRAINT'):
            continue
        spec[name] = dict(type=typ, arg=arg, unsigned='UNSIGNED' in rest, notnull='NOT NULL' in rest,
                          generated=' AS (' in rest or rest.strip().startswith('AS ('),
                          default='DEFAULT' in rest or 'AUTO_INCREMENT' in rest)
    cols_spec[t] = spec

INT_MAX = {'TINYINT': 255, 'SMALLINT': 65535, 'INT': 4294967295, 'BIGINT': 2 ** 64 - 1}
for t, rows in data.items():
    spec = cols_spec[t]
    for c in rows[0]:
        if c not in spec:
            bad(f'{t}.{c}: not a column')
        elif spec[c]['generated']:
            bad(f'{t}.{c}: generated column must not be inserted')
    for name, sp in spec.items():
        if sp['notnull'] and not sp['default'] and not sp['generated'] and name not in rows[0]:
            bad(f'{t}.{name}: NOT NULL column without default is missing')
    for r in rows:
        for c, v in r.items():
            sp = spec[c]
            if v is None:
                if sp['notnull']:
                    bad(f'{t}.{c}: NULL in NOT NULL column')
                continue
            typ = sp['type']
            if typ == 'VARCHAR' and len(v) > int(sp['arg']):
                bad(f'{t}.{c}: {len(v)} chars > VARCHAR({sp["arg"]}): {v!r}')
            elif typ == 'ENUM':
                allowed = re.findall(r"'([^']*)'", sp['arg'])
                if v not in allowed:
                    bad(f'{t}.{c}: {v!r} not in ENUM')
            elif typ == 'DECIMAL':
                p_, s_ = map(int, sp['arg'].split(','))
                d = Dec(v)
                if d != d.quantize(Dec(1).scaleb(-s_)) or abs(d) >= Dec(10) ** (p_ - s_):
                    bad(f'{t}.{c}: {v} does not fit DECIMAL({sp["arg"]})')
            elif typ in INT_MAX:
                if not re.fullmatch(r'-?\d+', v) or int(v) > INT_MAX[typ] or (sp['unsigned'] and int(v) < 0):
                    bad(f'{t}.{c}: {v} does not fit {typ}')
                if sp['arg'] == '1' and v not in ('0', '1'):
                    bad(f'{t}.{c}: flag must be 0/1')
            elif typ == 'DATE':
                dt.date.fromisoformat(v)
            elif typ == 'DATETIME':
                x = dt.datetime.fromisoformat(v)
                if x > NOW and c not in ():
                    bad(f'{t}.{c}: {v} is in the future')
print('column checks done')

# ----------------------------------------------------------------------------
# 3. SQLite copy of the schema (keys, CHECKs, ENUMs, views)
# ----------------------------------------------------------------------------
con = sqlite3.connect(':memory:')
con.create_function('CURDATE', 0, lambda: TODAY.isoformat())
con.create_function('DATEDIFF', 2, lambda a, b: (dt.date.fromisoformat(a[:10]) - dt.date.fromisoformat(b[:10])).days)
con.create_function('DAYOFMONTH', 1, lambda d: int(d[8:10]), deterministic=True)
con.create_function('IF', 3, lambda c, a, b: a if c else b, deterministic=True)
con.create_function('REGEXP', 2, lambda pat, s: 1 if s is not None and re.search(pat, s) else 0,
                    deterministic=True)


def to_sqlite(sql):
    sql = re.sub(r'--[^\n]*', '', sql)
    sql = re.sub(r'\) ENGINE=InnoDB', ')', sql)
    sql = re.sub(r'(\w+)(\s+)ENUM\(([^)]*)\)', r'\1\2TEXT CHECK (\1 IN (\3))', sql)
    sql = re.sub(r'(?:BIG)?INT UNSIGNED NOT NULL AUTO_INCREMENT', 'INTEGER PRIMARY KEY', sql)
    sql = sql.replace('ON UPDATE CURRENT_TIMESTAMP', '')
    sql = re.sub(r'AS \(([^\n]*)\) PERSISTENT', r'GENERATED ALWAYS AS (\1) STORED', sql)
    sql = re.sub(r'UNIQUE KEY (\w+) \(', r'UNIQUE (', sql)
    sql = re.sub(r',\s*KEY \w+ \([^)]*\)', '', sql)
    sql = re.sub(r'CAST\((\w+) AS DATE\)', r'substr(\1,1,10)', sql)
    sql = re.sub(r'CONSTRAINT \w+ ', '', sql)
    return sql


for mt in re.finditer(r'CREATE TABLE \w+ \(.*?\n\) ENGINE=InnoDB;', schema, re.S):
    t = to_sqlite(mt.group(0))
    if 'INTEGER PRIMARY KEY' in t:
        t = re.sub(r'\n\s*PRIMARY KEY \(\w+\),?', '\n', t)
        t = re.sub(r',\s*\n\s*\)\s*;', '\n);', t)
    con.execute(t)
for mv in re.finditer(r'CREATE VIEW .*?;\n', schema, re.S):
    con.execute(to_sqlite(mv.group(0)))
con.execute('PRAGMA foreign_keys = ON')
for t in order:
    rows = data[t]
    cols = list(rows[0])
    for r in rows:
        try:
            con.execute(f"INSERT INTO {t} ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})",
                        [r[c] for c in cols])
        except sqlite3.Error as e:
            bad(f'{t}: {e} in {r}')
            break
print('loaded into SQLite with keys and CHECKs')


def q(sql, *a):
    return con.execute(sql, a).fetchall()


fk = q('PRAGMA foreign_key_check')
if fk:
    bad(f'foreign key problems: {fk[:5]}')

# ----------------------------------------------------------------------------
# 4. replay the ledger
# ----------------------------------------------------------------------------
P = lambda s: dt.datetime.fromisoformat(s)
M = lambda s: Dec(s)
shops = {int(r['shop_id']): r for r in data['shops']}
users = {int(r['user_id']): r for r in data['users']}
staff = defaultdict(list)
for r in data['shop_staff']:
    staff[int(r['shop_id'])].append(r)
accts = {int(r['shop_customer_id']): r for r in data['shop_customers']}
sp_rows = {int(r['shop_product_id']): r for r in data['shop_products']}
custs = {int(r['customer_id']): r for r in data['customers']}

# account terms over time, rebuilt from the audit trail
terms = {}
audit_by_acc = defaultdict(list)
for r in data['audit_log']:
    audit_by_acc[int(r['record_id'])].append(r)
for aid, a in accts.items():
    rows = sorted(audit_by_acc[aid], key=lambda r: P(r['changed_at']))
    if rows:
        o = json.loads(rows[0]['old_value'])
        cur = (M(str(o['credit_limit'])), o['due_days'], o['status'])
    else:
        cur = (M(a['credit_limit']), int(a['due_days']), a['status'])
    tl = [(None, cur)]
    for r in rows:
        o, n = json.loads(r['old_value']), json.loads(r['new_value'])
        if (M(str(o['credit_limit'])), o['due_days'], o['status']) != tl[-1][1]:
            bad(f'audit chain broken for account {aid}')
        nv = (M(str(n['credit_limit'])), n['due_days'], n['status'])
        tl.append((P(r['changed_at']), nv))
        if r['changed_by'] not in {u['full_name'] for u in users.values()}:
            bad(f'audit changed_by {r["changed_by"]!r} is not a user')
    if tl[-1][1] != (M(a['credit_limit']), int(a['due_days']), a['status']):
        bad(f'account {aid}: final terms do not match the audit trail')
    if (a['status'] == 'blocked') != (a['blocked_reason'] is not None):
        bad(f'account {aid}: blocked_reason mismatch')
    terms[aid] = tl


def terms_at(aid, t):
    cur = terms[aid][0][1]
    for when, v in terms[aid][1:]:
        if when <= t:
            cur = v
    return cur


def works_at(uid, shop_id, day, need_credit=False, need_manager=False):
    if int(shops[shop_id]['owner_user_id']) == uid:
        return True
    for r in staff[shop_id]:
        if int(r['user_id']) == uid and dt.date.fromisoformat(r['joined_on']) <= day and \
                (r['left_on'] is None or dt.date.fromisoformat(r['left_on']) > day):
            if need_credit and r['can_give_credit'] != '1':
                return False
            if need_manager and r['staff_role'] != 'manager':
                return False
            return True
    return False


class S:
    pass


sales = {}
for r in data['credit_sales']:
    s = S()
    s.id, s.acc, s.t, s.total, s.due = int(r['sale_id']), int(r['shop_customer_id']), P(r['sold_at']), \
        M(r['total_amount']), dt.date.fromisoformat(r['due_date'])
    s.staff, s.status, s.ev, s.items = int(r['staff_user_id']), r['status'], [], []
    sales[s.id] = s
for r in data['credit_sale_items']:
    sales[int(r['sale_id'])].items.append(r)
allocs = defaultdict(list)
for r in data['payment_allocations']:
    allocs[int(r['payment_id'])].append((int(r['sale_id']), M(r['amount']), P(r['allocated_at'])))
disp = defaultdict(list)
for r in data['disputes']:
    disp[int(r['sale_id'])].append(r)

events = []
for s in sales.values():
    events.append((s.t, 0, 'sale', s))
for r in data['disputes']:
    events.append((P(r['raised_at']), 1, 'raise', r))
    if r['resolved_at']:
        events.append((P(r['resolved_at']), 2, 'resolve', r))
for r in data['adjustments']:
    events.append((P(r['created_at']), 3, 'adj', r))
for r in data['payments']:
    events.append((P(r['paid_at']), 4, 'pay', r))
events.sort(key=lambda e: (e[0], e[1]))

bal = {sid: s.total for sid, s in sales.items()}
paid = defaultdict(lambda: Dec(0))
adjd = defaultdict(lambda: Dec(0))
writeoff = set()
open_disp = set()
seen_sale = set()
last_paid = {}
for t, _, kind, r in events:
    if kind == 'sale':
        s = r
        a = accts[s.acc]
        lim, _, st = terms_at(s.acc, t)
        owed = sum(bal[x] for x in seen_sale if sales[x].acc == s.acc)
        if st != 'active':
            bad(f'sale {s.id}: account {s.acc} is {st}')
        if owed + s.total > lim:
            bad(f'sale {s.id}: over credit limit ({owed} + {s.total} > {lim})')
        if not works_at(s.staff, int(a['shop_id']), t.date(), need_credit=True):
            bad(f'sale {s.id}: user {s.staff} may not give credit')
        if t.date() < dt.date.fromisoformat(a['joined_on']):
            bad(f'sale {s.id}: before the account was opened')
        line_sum = sum(Dec(i['qty']) * Dec(i['unit_price']) for i in s.items)
        if line_sum.quantize(Dec('0.01')) != s.total:
            bad(f'sale {s.id}: total {s.total} != items {line_sum}')
        if (s.due - t.date()).days != terms_at(s.acc, t)[1]:
            bad(f'sale {s.id}: due date does not match the account due days')
        for i in s.items:
            sp = sp_rows[int(i['shop_product_id'])]
            if sp['shop_id'] != a['shop_id']:
                bad(f'sale {s.id}: product from another shop')
            if sp['is_active'] != '1':
                bad(f'sale {s.id}: inactive product')
        seen_sale.add(s.id)
    elif kind == 'raise':
        sid = int(r['sale_id'])
        if sid in open_disp:
            bad(f'sale {sid}: two open disputes')
        open_disp.add(sid)
        if custs[int(r['raised_by_customer_id'])]['customer_id'] != accts[sales[sid].acc]['customer_id']:
            bad(f'dispute {r["dispute_id"]}: raised by someone else')
    elif kind == 'resolve':
        open_disp.discard(int(r['sale_id']))
        if not works_at(int(r['resolved_by']), int(accts[sales[int(r['sale_id'])].acc]['shop_id']), t.date(),
                        need_manager=True):
            bad(f'dispute {r["dispute_id"]}: resolver is not owner/manager')
    elif kind == 'adj':
        sid, amt = int(r['sale_id']), M(r['amount'])
        if amt > bal[sid]:
            bad(f'adjustment {r["adjustment_id"]}: {amt} > balance {bal[sid]}')
        if not works_at(int(r['approved_by']), int(accts[sales[sid].acc]['shop_id']), t.date(), need_manager=True):
            bad(f'adjustment {r["adjustment_id"]}: approver is not owner/manager')
        bal[sid] -= amt
        adjd[sid] += amt
        if r['adj_type'] == 'write_off':
            writeoff.add(sid)
    elif kind == 'pay':
        pid, aid, amt = int(r['payment_id']), int(r['shop_customer_id']), M(r['amount'])
        if not works_at(int(r['received_by']), int(accts[aid]['shop_id']), t.date()):
            bad(f'payment {pid}: receiver does not work at the shop')
        if (r['method'] == 'cash') == (r['trx_ref'] is not None) and r['method'] != 'cash':
            bad(f'payment {pid}: trx_ref rule')
        queue = sorted((sales[x] for x in seen_sale if sales[x].acc == aid and bal[x] > 0 and x not in open_disp),
                       key=lambda s: (s.t, s.id))
        if amt > sum(bal[s.id] for s in queue):
            bad(f'payment {pid}: more than owed')
        expect, left = [], amt
        for s in queue:
            if left <= 0:
                break
            take = min(left, bal[s.id])
            expect.append((s.id, take))
            left -= take
        got = [(sid, a_) for sid, a_, at in allocs[pid]]
        if sorted(got) != sorted(expect):
            bad(f'payment {pid}: allocation {got} is not FIFO {expect}')
        for sid, a_, at in allocs[pid]:
            if at != t:
                bad(f'payment {pid}: allocated_at differs from paid_at')
            bal[sid] -= a_
            paid[sid] += a_
            last_paid[sid] = t

# final status of every sale = sp_refresh_sale_status on the import day
status_count = defaultdict(int)
for s in sales.values():
    b = bal[s.id]
    if s.id in open_disp:
        st = 'disputed'
    elif b <= 0 and s.id in writeoff:
        st = 'written_off'
    elif b <= 0:
        st = 'paid'
    elif s.due < TODAY:
        st = 'overdue'
    elif paid[s.id] + adjd[s.id] > 0:
        st = 'partially_paid'
    else:
        st = 'open'
    status_count[s.status] += 1
    if st != s.status:
        bad(f'sale {s.id}: stored status {s.status}, rules give {st}')
    if b < 0:
        bad(f'sale {s.id}: negative balance')
view_bal = dict(q('SELECT sale_id, balance FROM v_sale_balance'))
for sid, b in bal.items():
    if Dec(str(view_bal[sid])).quantize(Dec('0.01')) != b:
        bad(f'sale {sid}: view balance {view_bal[sid]} != replay {b}')
for sid, rows in disp.items():
    for r in rows:
        if r['status'] == 'open' and sales[sid].status != 'disputed':
            bad(f'dispute {r["dispute_id"]} open but sale not disputed')

# promises, the way ev_check_promises settles them
pays_by_acc = defaultdict(list)
for r in data['payments']:
    pays_by_acc[int(r['shop_customer_id'])].append((P(r['paid_at']), M(r['amount'])))
prom_count = defaultdict(int)
for r in data['promises']:
    created, pdate, amt = P(r['created_at']), dt.date.fromisoformat(r['promised_date']), M(r['promised_amount'])
    run = created.date() + dt.timedelta(days=1)
    outcome = ('pending', None)
    while run <= TODAY:
        got = sum(a for t, a in pays_by_acc[int(r['shop_customer_id'])]
                  if created <= t < dt.datetime.combine(min(pdate + dt.timedelta(days=1), run), dt.time(0, 10))
                  and t.date() <= pdate)
        if got >= amt:
            outcome = ('kept', dt.datetime.combine(run, dt.time(0, 10)))
            break
        if pdate < run:
            outcome = ('broken', dt.datetime.combine(run, dt.time(0, 10)))
            break
        run += dt.timedelta(days=1)
    prom_count[r['status']] += 1
    if (r['status'], P(r['resolved_at']) if r['resolved_at'] else None) != outcome:
        bad(f'promise {r["promise_id"]}: stored {r["status"]} {r["resolved_at"]}, event gives {outcome}')

# reminders: each sale reminder must be the first day ev_queue_reminders would queue it
seen_rem = set()
for r in data['reminders']:
    if r['reminder_type'] == 'promise':
        continue
    sid, typ, day = int(r['sale_id']), r['reminder_type'], dt.date.fromisoformat(r['scheduled_for'])
    if (sid, typ) in seen_rem:
        bad(f'reminder duplicated for sale {sid} {typ}')
    seen_rem.add((sid, typ))
    s = sales[sid]
    if typ == 'before_due' and not (1 <= (s.due - day).days <= 3):
        bad(f'reminder {r["reminder_id"]}: before_due on the wrong day')
    if typ == 'on_due' and not (0 <= (day - s.due).days <= 6):
        bad(f'reminder {r["reminder_id"]}: on_due on the wrong day')
    if typ == 'overdue' and (day - s.due).days < 7:
        bad(f'reminder {r["reminder_id"]}: overdue too early')
    if (r['status'] == 'sent') != (r['sent_at'] is not None):
        bad(f'reminder {r["reminder_id"]}: sent_at rule')
    if day == TODAY and r['status'] != 'queued':
        bad(f'reminder {r["reminder_id"]}: today but not queued')

# guarantors, customer logins, shops
for r in data['customer_guarantors']:
    a = accts[int(r['shop_customer_id'])]
    if a['customer_id'] == r['guarantor_customer_id']:
        bad('guarantor guarantees themselves')
    if not any(x['shop_id'] == a['shop_id'] and x['customer_id'] == r['guarantor_customer_id']
               for x in accts.values()):
        bad('guarantor is not a customer of the same shop')
for c in custs.values():
    if c['user_id']:
        u = users[int(c['user_id'])]
        if u['role'] != 'customer' or u['phone'] != c['phone']:
            bad(f'customer {c["customer_id"]}: login does not match')
for s in shops.values():
    if users[int(s['owner_user_id'])]['role'] != 'owner':
        bad(f'shop {s["shop_id"]}: owner is not an owner')
    if s['verified_by'] and users[int(s['verified_by'])]['role'] != 'admin':
        bad(f'shop {s["shop_id"]}: verified by a non-admin')

# ----------------------------------------------------------------------------
# 5. what the CALLs at the end of seed.sql will produce
# ----------------------------------------------------------------------------
def month_start(k):
    y, mo = TODAY.year, TODAY.month - k
    while mo <= 0:
        mo += 12
        y -= 1
    return dt.date(y, mo, 1)


stmt_rows = 0
for k in range(5, 0, -1):
    st = month_start(k)
    en = month_start(k - 1)
    rows = q("""
      SELECT sc.shop_customer_id,
        (SELECT COALESCE(SUM(total_amount),0) FROM credit_sales WHERE shop_customer_id=sc.shop_customer_id AND sold_at < ?),
        (SELECT COALESCE(SUM(amount),0) FROM payments WHERE shop_customer_id=sc.shop_customer_id AND paid_at < ?),
        (SELECT COALESCE(SUM(a.amount),0) FROM adjustments a JOIN credit_sales cs ON cs.sale_id=a.sale_id
          WHERE cs.shop_customer_id=sc.shop_customer_id AND a.created_at < ?),
        (SELECT COALESCE(SUM(total_amount),0) FROM credit_sales WHERE shop_customer_id=sc.shop_customer_id AND sold_at >= ? AND sold_at < ?)
      FROM shop_customers sc""", st.isoformat(), st.isoformat(), st.isoformat(), st.isoformat(), en.isoformat())
    for sid, cb, pb, ab, ci in rows:
        if cb + ci > 0:
            stmt_rows += 1
            if round(cb - pb - ab, 2) < 0:
                bad(f'statement {sid} {st}: negative opening balance')

scores = []
for (cid,) in q('SELECT DISTINCT customer_id FROM shop_customers'):
    sb = q("""SELECT status, sold_at, due_date, last_paid_at, days_overdue, balance, shop_id
              FROM v_sale_balance WHERE customer_id = ?""", cid)
    settled = [r for r in sb if r[0] == 'paid']
    on_time = sum(1 for r in settled if (r[3] or r[2])[:10] <= r[2])
    late_days = sum(max((dt.date.fromisoformat(r[3][:10]) - dt.date.fromisoformat(r[2])).days, 0)
                    for r in settled if r[3])
    overdue = [r for r in sb if r[4] > 0]
    broken = q("""SELECT COUNT(*) FROM promises pr JOIN shop_customers sc ON sc.shop_customer_id = pr.shop_customer_id
                  WHERE sc.customer_id = ? AND pr.status = 'broken' AND pr.promised_date >= ?""",
               cid, (TODAY - dt.timedelta(days=180)).isoformat())[0][0]
    shops_owed = len({r[6] for r in sb if r[5] > 0})
    wo = q("""SELECT COUNT(*) FROM adjustments a JOIN credit_sales cs ON cs.sale_id = a.sale_id
              JOIN shop_customers sc ON sc.shop_customer_id = cs.shop_customer_id
              WHERE sc.customer_id = ? AND a.adj_type = 'write_off'""", cid)[0][0]
    pct = None if not settled else round(100 * on_time / len(settled), 2)
    n = len(settled) + len(overdue)
    avg = 0 if n == 0 else round((late_days + sum(r[4] for r in overdue)) / n, 2)
    sc = (pct if pct is not None else 60) - min(avg, 30) * 0.8 - min(broken, 5) * 4 \
        - min(max(shops_owed - 1, 0), 3) * 5 - min(len(overdue), 5) * 3 - min(wo, 3) * 10
    scores.append(max(0, min(100, round(sc))))

# ----------------------------------------------------------------------------
# 6. password hashes
# ----------------------------------------------------------------------------
pw = re.search(r"password\s+(\w+)\s+for EVERY user", seed).group(1)
php = 'foreach (array_slice($argv, 2) as $h) echo password_verify($argv[1], $h) ? "1" : "0";'
res = subprocess.run(['php', '-r', php, pw] + [u['password_hash'] for u in data['users']],
                     capture_output=True, text=True).stdout
if res != '1' * len(data['users']):
    bad(f'password_verify failed for some users: {res}')

# ----------------------------------------------------------------------------
# report
# ----------------------------------------------------------------------------
print()
print(f'import day {TODAY}')
for t in order:
    print(f'  {t:22} {len(data[t]):6} rows')
print('  sale status        ', dict(sorted(status_count.items())))
print('  promise status     ', dict(sorted(prom_count.items())))
print('  account status     ', dict(q('SELECT status, COUNT(*) FROM shop_customers GROUP BY status')))
print('  adjustment types   ', dict(q('SELECT adj_type, COUNT(*) FROM adjustments GROUP BY adj_type')))
print('  dispute status     ', dict(q('SELECT status, COUNT(*) FROM disputes GROUP BY status')))
print('  payment methods    ', dict(q('SELECT method, COUNT(*) FROM payments GROUP BY method')))
print('  reminder types     ', dict(q('SELECT reminder_type, COUNT(*) FROM reminders GROUP BY reminder_type')))
print('  reminder status    ', dict(q('SELECT status, COUNT(*) FROM reminders GROUP BY status')))
print('  statements (CALL)  ', stmt_rows, 'rows')
buckets = defaultdict(int)
for s_ in scores:
    buckets['90-100' if s_ >= 90 else '70-89' if s_ >= 70 else '40-69' if s_ >= 40 else '0-39'] += 1
print('  trust scores (CALL)', dict(buckets))
print('  shop outstanding:')
for r in q('SELECT shop_id, shop_name, customers_owing, total_outstanding, overdue_amount FROM v_shop_outstanding'):
    print(f'     {r[0]} {r[1]:28} owing {r[2]:3}  outstanding {r[3]:10.2f}  overdue {r[4]:10.2f}')
print('  aging, all shops (not due / 1-30 / 31-60 / 61-90 / 90+):',
      q('SELECT SUM(not_yet_due), SUM(overdue_1_30), SUM(overdue_31_60), SUM(overdue_61_90), SUM(overdue_90_plus) FROM v_aging')[0])
print('  worst payers:', q('SELECT full_name, max_days_overdue, overdue_amount FROM v_customer_exposure ORDER BY max_days_overdue DESC LIMIT 4'))
print('  top cross-shop exposure:', q('SELECT full_name, shops_owed, total_outstanding FROM v_customer_exposure ORDER BY shops_owed DESC, total_outstanding DESC LIMIT 3'))
print('  low stock items    ', q('SELECT COUNT(*) FROM shop_products WHERE track_stock = 1 AND stock_qty <= reorder_level')[0][0])
print()
if problems:
    print(f'{len(problems)} PROBLEMS')
    for p_ in problems[:40]:
        print('  -', p_)
    sys.exit(1)
print('ALL CHECKS PASSED')
