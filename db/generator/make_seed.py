#!/usr/bin/env python3
"""
make_seed.py: writes database/seed.sql, the sample data for DokanKhata.

It simulates about nine months of baki (shop credit) at nine shops and
follows the same rules the database enforces in schema.sql:
  * a sale is refused if the account is blocked or would pass its credit
    limit                                               (trg_credit_sales_bi)
  * only the owner, or staff allowed to give credit, records a sale
                                                        (sp_record_credit_sale)
  * a payment pays the oldest unpaid, undisputed sale first (FIFO) and is
    never more than what is owed                        (sp_record_payment)
  * adjustments are approved by the owner or a manager and never exceed the
    sale balance                                        (sp_add_adjustment)
  * each sale's status is worked out like sp_refresh_sale_status
  * promises are settled like ev_check_promises and due-date reminders are
    queued like ev_queue_reminders
Monthly statements and trust scores are NOT written here: seed.sql calls
sp_generate_statements and sp_refresh_all_trust_scores after loading, so
those numbers come from the database's own logic.

Every date is written relative to the day of import, for example
    @today - INTERVAL 12 DAY + INTERVAL '10:30' HOUR_MINUTE
so overdue sales, reminders and promises always match the real calendar.

On top of the random customers there are a few storylines so every report
has something to show (see "storylines the reports need" below): people who
owe 3+ shops, people who vanished, limits cut below what someone owes, a
cashier with too many disputes, and busier weeks before each festival.

Usage:  npm run db:seed
   or:  python3 make_seed.py [--today YYYY-MM-DD] > ../database/seed.sql

--today is the day the data "ends". Everything is relative to the import day
anyway, but the festival rush is placed before the real festival dates, so
regenerate with the demo day if you want the Eid/Puja spike to line up exactly.
"""
import re
import sys
import random
import argparse
import subprocess
import datetime as dt
from pathlib import Path
from decimal import Decimal as Dec, ROUND_HALF_UP, ROUND_DOWN

_args = argparse.ArgumentParser()
_args.add_argument('--today', default='2026-11-28', help='simulation anchor, YYYY-MM-DD')
ARGS = _args.parse_args()

random.seed(311)                     # CSE311: same data every run
story = random.Random(2026)          # separate stream for the planted storylines, so tuning them
                                     # doesn't reshuffle every other customer
TODAY = dt.date.fromisoformat(ARGS.today)   # simulation anchor; seed.sql uses CURDATE() instead
HISTORY_DAYS = 270                   # how far back the ledger goes (about 9 months)
SHIFT = HISTORY_DAYS - 150           # the shop/staff dates below were written for 150 days of history

# festival dates come from the festivals table in schema.sql so they can't drift apart
_schema = (Path(__file__).resolve().parent.parent / 'database' / 'schema.sql').read_text(encoding='utf-8')
FESTIVALS = [(name, dt.date.fromisoformat(day))
             for name, day in re.findall(r"\('([^']+)',\s*'[^']*',\s*'(\d{4}-\d{2}-\d{2})'\)", _schema)]
assert FESTIVALS, 'could not read the festivals from schema.sql'
REMINDER_DAYS = 60                   # SMS reminders were switched on 60 days ago
PASSWORD = 'dokan123'                # every demo account uses this password


# ----------------------------------------------------------------------------
# small helpers
# ----------------------------------------------------------------------------
def D(n):
    """the date n days ago (n < 0 = in the future)"""
    return TODAY - dt.timedelta(days=n)


def T(n, minute):
    """a datetime n days ago, minute = minutes after midnight"""
    return dt.datetime.combine(D(n), dt.time(minute // 60, minute % 60))


def m(x):
    return Dec(str(x)).quantize(Dec('0.01'), ROUND_HALF_UP)


ZERO = m(0)


def round_down(x, step):
    return (Dec(x) / step).to_integral_value(ROUND_DOWN) * step


def fmt0(x):
    """MySQL FORMAT(x, 0): 1,250"""
    return f"{int(Dec(x).quantize(Dec('1'), ROUND_HALF_UP)):,}"


def pick_weighted(items, weights, k):
    items, weights, out = list(items), list(weights), []
    for _ in range(min(k, len(items))):
        i = random.choices(range(len(items)), weights)[0]
        out.append(items.pop(i))
        weights.pop(i)
    return out


class Msg:
    """a reminder message that contains dates: rendered with DATE_FORMAT"""
    def __init__(self, *parts):
        self.parts = parts


# ----------------------------------------------------------------------------
# reference data
# ----------------------------------------------------------------------------
AREAS = [
    ('Mirpur 10', 'Mirpur', 'Dhaka', 'Dhaka'),
    ('Mirpur 1', 'Mirpur', 'Dhaka', 'Dhaka'),
    ('Mohammadpur Town Hall', 'Mohammadpur', 'Dhaka', 'Dhaka'),
    ('Dhanmondi 27', 'Dhanmondi', 'Dhaka', 'Dhaka'),
    ('Uttara Sector 7', 'Uttara West', 'Dhaka', 'Dhaka'),
    ('Middle Badda', 'Badda', 'Dhaka', 'Dhaka'),
    ('Rampura Bazar', 'Rampura', 'Dhaka', 'Dhaka'),
    ('Jatrabari', 'Jatrabari', 'Dhaka', 'Dhaka'),
    ('Lalbagh', 'Lalbagh', 'Dhaka', 'Dhaka'),
    ('Tongi Bazar', 'Tongi', 'Gazipur', 'Dhaka'),
    ('Chashara', 'Narayanganj Sadar', 'Narayanganj', 'Dhaka'),
    ('Agrabad', 'Double Mooring', 'Chattogram', 'Chattogram'),
    ('Halishahar', 'Halishahar', 'Chattogram', 'Chattogram'),
    ('Zindabazar', 'Kotwali', 'Sylhet', 'Sylhet'),
    ('Shaheb Bazar', 'Boalia', 'Rajshahi', 'Rajshahi'),
    ('Sonadanga', 'Sonadanga', 'Khulna', 'Khulna'),
    ('Ganginarpar', 'Kotwali', 'Mymensingh', 'Mymensingh'),
    ('Band Road', 'Kotwali', 'Barishal', 'Barishal'),
    ('Jahaj Company Mor', 'Kotwali', 'Rangpur', 'Rangpur'),
]
NEAR = {1: [1, 1, 1, 2], 2: [2, 2, 1], 3: [3, 3, 3, 4], 7: [7, 7, 6, 8], 12: [12, 12, 13], 14: [14]}

CATEGORIES = [
    ('Rice & Grains', 'চাল ও শস্য'), ('Sugar & Flour', 'চিনি ও আটা'), ('Pulses', 'ডাল'),
    ('Edible Oil', 'ভোজ্য তেল'), ('Spices & Salt', 'মসলা ও লবণ'), ('Vegetables', 'সবজি'),
    ('Dairy & Eggs', 'দুধ ও ডিম'), ('Snacks & Biscuits', 'বিস্কুট ও নাস্তা'), ('Beverages', 'পানীয়'),
    ('Personal Care', 'ব্যক্তিগত যত্ন'), ('Household Cleaning', 'ঘর পরিষ্কার'), ('Medicine', 'ওষুধ'),
    ('Stationery', 'স্টেশনারি'), ('Hardware & Electrical', 'হার্ডওয়্যার ও ইলেকট্রিক'),
    ('Tea Stall', 'চা ও নাস্তা'),
]

# (key, category no., name, bangla, brand, unit, price, popularity, qty choices)
PRODUCTS = [
    ('miniket', 1, 'Miniket Rice', 'মিনিকেট চাল', 'Loose', 'kg', 78, 9, [2, 3, 5, 5, 10]),
    ('nazirshail', 1, 'Nazirshail Rice', 'নাজিরশাইল চাল', 'Loose', 'kg', 86, 5, [2, 5, 5, 10]),
    ('coarse', 1, 'Coarse Rice', 'মোটা চাল', 'Loose', 'kg', 58, 6, [3, 5, 10]),
    ('chinigura', 1, 'Chinigura Rice 1 kg', 'চিনিগুড়া চাল', 'Pran', 'packet', 165, 2, [1, 1, 2]),
    ('chira', 1, 'Flattened Rice', 'চিড়া', 'Loose', 'kg', 80, 2, [0.5, 1]),
    ('muri', 1, 'Puffed Rice', 'মুড়ি', 'Loose', 'kg', 90, 3, [0.5, 1]),
    ('sugar', 2, 'Sugar', 'চিনি', 'Loose', 'kg', 128, 7, [0.5, 1, 1, 2]),
    ('atta', 2, 'Atta', 'আটা', 'Loose', 'kg', 55, 6, [1, 2, 2, 3]),
    ('atta2', 2, 'Atta 2 kg', 'প্যাকেট আটা', 'Teer', 'packet', 135, 4, [1, 1, 2]),
    ('maida', 2, 'Maida', 'ময়দা', 'Loose', 'kg', 68, 3, [1, 2]),
    ('suji', 2, 'Suji', 'সুজি', 'Loose', 'kg', 70, 2, [0.5, 1]),
    ('masoor', 3, 'Masoor Dal', 'মসুর ডাল', 'Loose', 'kg', 140, 7, [0.5, 1, 1, 2]),
    ('motadal', 3, 'Coarse Masoor Dal', 'মোটা মসুর ডাল', 'Loose', 'kg', 110, 5, [1, 1, 2]),
    ('mung', 3, 'Mung Dal', 'মুগ ডাল', 'Loose', 'kg', 165, 3, [0.5, 1]),
    ('chola', 3, 'Chickpeas', 'ছোলা', 'Loose', 'kg', 120, 3, [0.5, 1, 2]),
    ('teer1', 4, 'Soybean Oil 1 L', 'সয়াবিন তেল ১ লিটার', 'Teer', 'bottle', 190, 7, [1, 1, 2]),
    ('teer5', 4, 'Soybean Oil 5 L', 'সয়াবিন তেল ৫ লিটার', 'Teer', 'bottle', 920, 4, [1]),
    ('rup1', 4, 'Soybean Oil 1 L', 'সয়াবিন তেল ১ লিটার', 'Rupchanda', 'bottle', 192, 4, [1, 2]),
    ('looseoil', 4, 'Loose Soybean Oil', 'খোলা সয়াবিন তেল', 'Loose', 'litre', 168, 5, [0.5, 1, 2]),
    ('mustard', 4, 'Mustard Oil 1 L', 'সরিষার তেল', 'Radhuni', 'bottle', 280, 2, [1]),
    ('salt', 5, 'Iodized Salt 1 kg', 'লবণ', 'ACI', 'packet', 42, 5, [1, 1, 2]),
    ('turmeric', 5, 'Turmeric Powder 200 g', 'হলুদ গুঁড়া', 'Radhuni', 'packet', 110, 3, [1]),
    ('chili', 5, 'Chili Powder 200 g', 'মরিচ গুঁড়া', 'Radhuni', 'packet', 120, 3, [1]),
    ('cumin', 5, 'Cumin', 'জিরা', 'Loose', 'kg', 760, 2, [0.1, 0.1, 0.25]),
    ('garam', 5, 'Garam Masala 50 g', 'গরম মসলা', 'Radhuni', 'packet', 65, 2, [1]),
    ('potato', 6, 'Potato', 'আলু', 'Loose', 'kg', 35, 8, [1, 2, 3, 5]),
    ('onion', 6, 'Onion', 'পেঁয়াজ', 'Loose', 'kg', 80, 8, [1, 1, 2, 3]),
    ('garlic', 6, 'Garlic', 'রসুন', 'Loose', 'kg', 220, 4, [0.25, 0.5, 1]),
    ('ginger', 6, 'Ginger', 'আদা', 'Loose', 'kg', 240, 3, [0.25, 0.5]),
    ('greenchili', 6, 'Green Chili', 'কাঁচা মরিচ', 'Loose', 'kg', 160, 4, [0.25, 0.25, 0.5]),
    ('eggs', 7, 'Eggs', 'ডিম', 'Loose', 'dozen', 150, 7, [0.5, 1, 1, 2]),
    ('milk', 7, 'Liquid Milk 1 L', 'তরল দুধ', 'Milk Vita', 'packet', 100, 4, [1, 1, 2]),
    ('dano', 7, 'Milk Powder 500 g', 'গুঁড়া দুধ', 'Dano', 'packet', 450, 3, [1]),
    ('energy', 8, 'Energy Plus Biscuit', 'এনার্জি বিস্কুট', 'Olympic', 'packet', 20, 4, [1, 2, 3]),
    ('chanachur', 8, 'Chanachur 150 g', 'চানাচুর', 'Pran', 'packet', 45, 3, [1, 2]),
    ('toast', 8, 'Toast Biscuit', 'টোস্ট বিস্কুট', 'Pran', 'packet', 60, 3, [1]),
    ('cake', 8, 'Slice Cake', 'স্লাইস কেক', 'Pran', 'piece', 15, 3, [1, 2]),
    ('tealeaf', 9, 'Tea Leaves 400 g', 'চা পাতা', 'Ispahani', 'packet', 230, 4, [1]),
    ('frooto', 9, 'Mango Drink 250 ml', 'আমের জুস', 'Pran', 'bottle', 30, 3, [1, 2, 3]),
    ('water', 9, 'Drinking Water 500 ml', 'পানি', 'Mum', 'bottle', 20, 3, [1, 2]),
    ('lux', 10, 'Beauty Soap 100 g', 'সাবান', 'Lux', 'piece', 75, 4, [1, 2]),
    ('lifebuoy', 10, 'Health Soap 100 g', 'সাবান', 'Lifebuoy', 'piece', 65, 4, [1, 2]),
    ('pepsodent', 10, 'Toothpaste 100 g', 'টুথপেস্ট', 'Pepsodent', 'piece', 95, 3, [1]),
    ('shampoo', 10, 'Shampoo 180 ml', 'শ্যাম্পু', 'Sunsilk', 'bottle', 300, 2, [1]),
    ('coconut', 10, 'Coconut Oil 200 ml', 'নারকেল তেল', 'Parachute', 'bottle', 160, 3, [1]),
    ('wheel', 11, 'Detergent Powder 1 kg', 'ডিটারজেন্ট', 'Wheel', 'packet', 140, 4, [1]),
    ('vim', 11, 'Dishwash Bar', 'ভিম বার', 'Vim', 'piece', 40, 3, [1, 2]),
    ('harpic', 11, 'Toilet Cleaner 500 ml', 'টয়লেট ক্লিনার', 'Harpic', 'bottle', 180, 2, [1]),
    ('coil', 11, 'Mosquito Coil', 'মশার কয়েল', 'ACI', 'box', 130, 3, [1]),
    ('napa', 12, 'Napa 500 mg', 'নাপা', 'Beximco', 'strip', 12, 9, [1, 2, 3]),
    ('napaext', 12, 'Napa Extra', 'নাপা এক্সট্রা', 'Beximco', 'strip', 25, 6, [1, 2]),
    ('ace', 12, 'Ace 500 mg', 'এইস', 'Square', 'strip', 12, 5, [1, 2]),
    ('seclo', 12, 'Seclo 20 mg', 'সেকলো', 'Square', 'strip', 70, 6, [1, 2, 3]),
    ('maxpro', 12, 'Maxpro 20 mg', 'ম্যাক্সপ্রো', 'Renata', 'strip', 70, 4, [1, 2]),
    ('fexo', 12, 'Fexo 120 mg', 'ফেক্সো', 'Square', 'strip', 90, 4, [1]),
    ('monas', 12, 'Monas 10 mg', 'মোনাস', 'ACME', 'strip', 160, 3, [1, 2]),
    ('antacid', 12, 'Antacid Plus', 'এন্টাসিড প্লাস', 'Square', 'strip', 25, 4, [1, 2]),
    ('orsaline', 12, 'Orsaline-N', 'ওরস্যালাইন', 'SMC', 'packet', 6, 5, [2, 4, 5]),
    ('savlon', 12, 'Antiseptic Liquid 100 ml', 'স্যাভলন', 'ACI', 'bottle', 90, 2, [1]),
    ('pen', 13, 'Ballpoint Pen', 'কলম', 'Matador', 'piece', 10, 8, [2, 3, 5]),
    ('khata', 13, 'Exercise Khata 120 pages', 'খাতা', 'Loose', 'piece', 60, 7, [1, 2, 3]),
    ('pencil', 13, 'Pencil', 'পেন্সিল', 'Matador', 'piece', 10, 4, [2, 3]),
    ('eraser', 13, 'Eraser', 'রাবার', 'Matador', 'piece', 5, 3, [1, 2]),
    ('a4', 13, 'A4 Paper Ream', 'এ-ফোর কাগজ', 'Double A', 'packet', 580, 2, [1]),
    ('geometry', 13, 'Geometry Box', 'জ্যামিতি বক্স', 'Matador', 'box', 150, 2, [1]),
    ('glue', 13, 'Glue Stick', 'গ্লু স্টিক', 'Matador', 'piece', 40, 2, [1]),
    ('cement', 14, 'Cement 50 kg Bag', 'সিমেন্ট', 'Shah Cement', 'piece', 540, 5, [2, 3, 5, 8, 10]),
    ('pipe', 14, 'PVC Pipe 1 inch', 'পিভিসি পাইপ', 'RFL', 'piece', 260, 4, [2, 4, 6]),
    ('bulb', 14, 'LED Bulb 12 W', 'এলইডি বাল্ব', 'Super Star', 'piece', 220, 5, [1, 2, 4]),
    ('paint', 14, 'Wall Paint 1 L', 'দেয়ালের রং', 'Berger', 'bottle', 450, 3, [1, 2, 4]),
    ('screws', 14, 'Wood Screws', 'স্ক্রু', 'Loose', 'box', 120, 3, [1, 2]),
    ('wire', 14, 'Electric Wire 1.5 rm Coil', 'বৈদ্যুতিক তার', 'BRB', 'piece', 2900, 2, [1]),
    ('tap', 14, 'Water Tap', 'পানির কল', 'RFL', 'piece', 350, 3, [1, 2]),
    ('padlock', 14, 'Padlock', 'তালা', 'Loose', 'piece', 180, 2, [1]),
    ('milktea', 15, 'Milk Tea', 'দুধ চা', 'Loose', 'piece', 15, 9, [1, 1, 2, 3]),
    ('blacktea', 15, 'Black Tea', 'রং চা', 'Loose', 'piece', 10, 6, [1, 2]),
    ('bun', 15, 'Bun', 'বনরুটি', 'Loose', 'piece', 15, 5, [1, 2]),
    ('banana', 15, 'Banana', 'কলা', 'Loose', 'piece', 10, 5, [1, 2]),
    ('singara', 15, 'Singara', 'সিঙ্গারা', 'Loose', 'piece', 10, 5, [1, 2, 4]),
]
PKEY = {p[0]: i + 1 for i, p in enumerate(PRODUCTS)}
GROCERY = [p[0] for p in PRODUCTS if p[1] <= 11]
ASSORTMENT = {
    'grocery': GROCERY,
    'pharmacy': [p[0] for p in PRODUCTS if p[1] == 12] + ['lux', 'lifebuoy', 'pepsodent', 'coconut', 'water'],
    'stationery': [p[0] for p in PRODUCTS if p[1] == 13] + ['energy', 'frooto', 'water', 'cake'],
    'hardware': [p[0] for p in PRODUCTS if p[1] == 14] + ['harpic', 'coil'],
    'tea_stall': [p[0] for p in PRODUCTS if p[1] == 15] + ['energy', 'cake', 'water', 'frooto'],
    'cosmetics': ['lux', 'lifebuoy', 'pepsodent', 'shampoo', 'coconut'],
}
# price changes: key -> (days ago the price changed, old price)
PRICE_CHANGES = {'onion': (35, 110), 'teer1': (60, 175), 'eggs': (20, 165), 'teer5': (60, 860)}
FIXED_PRICE_CATS = {12}   # medicines sell at the printed MRP everywhere

SHOPS = [
    dict(name='Rahim General Store', type='grocery', area=1, owner='Rahim Uddin',
         licence='DNCC/TL/2024/031457', address='Shop 4, Block C Market, Mirpur 10, Dhaka',
         limit=8000, due=15, created=185+SHIFT, hours=(480, 1320)),
    dict(name='Shapla Pharmacy', type='pharmacy', area=1, owner='Shafiqul Alam',
         licence='DNCC/TL/2023/018832', address='Plot 7, Main Road, Mirpur 10, Dhaka',
         limit=4000, due=30, created=182+SHIFT, hours=(540, 1380)),
    dict(name='Bismillah Departmental Store', type='grocery', area=3, owner='Abdul Haque',
         licence='DNCC/TL/2024/045120', address='22 Town Hall Market, Mohammadpur, Dhaka',
         limit=10000, due=15, created=178+SHIFT, hours=(480, 1320)),
    dict(name='Bhuiyan Hardware & Sanitary', type='hardware', area=7, owner='Delwar Bhuiyan',
         licence='DNCC/TL/2022/009784', address='Rampura Bazar Road, Rampura, Dhaka',
         limit=25000, due=30, created=176+SHIFT, hours=(570, 1200)),
    dict(name='Nabil Stationery', type='stationery', area=2, owner='Mizanur Rahman',
         licence='DNCC/TL/2025/052301', address='Opposite Mirpur Girls School, Mirpur 1, Dhaka',
         limit=2000, due=15, created=172+SHIFT, hours=(480, 1200)),
    dict(name='Mamun Tea Stall', type='tea_stall', area=1, owner='Mamunur Rashid',
         licence=None, address='Beside Mirpur 10 Bus Stand, Dhaka',
         limit=800, due=7, created=170+SHIFT, hours=(390, 1410)),
    dict(name='Al-Amin Store', type='grocery', area=14, owner='Shamsul Amin',
         licence='SCC/TL/2024/007412', address='Zindabazar Point, Sylhet',
         limit=6000, due=15, created=168+SHIFT, hours=(480, 1320)),
    dict(name='Bhai Bhai Store', type='grocery', area=12, owner='Jashim Uddin Chowdhury',
         licence='CCC/TL/2023/021956', address='Agrabad Access Road, Chattogram',
         limit=7000, due=15, created=165+SHIFT, hours=(480, 1320)),
    dict(name='Ma Cosmetics & Gift Corner', type='cosmetics', area=5, owner='Farzana Yasmin',
         licence='DNCC/TL/2026/060118', address='Sector 7 Market, Uttara, Dhaka',
         limit=3000, due=15, created=4, hours=(600, 1290), pending=True),
]
ACCOUNTS_PER_SHOP = [30, 18, 20, 10, 12, 15, 14, 14, 0]
MIRPUR_SHOPS = {1, 2, 5, 6}

STAFF = [  # shop no., name, role, can give credit, joined (days ago), left (days ago)
    (1, 'Jamal Hossain', 'manager', 1, 180 + SHIFT, None),
    (1, 'Sumon Mia', 'cashier', 1, 120, None),
    (1, 'Rakib Hasan', 'cashier', 0, 175 + SHIFT, 40),
    (2, 'Nasrin Akter', 'cashier', 0, 178 + SHIFT, None),
    (3, 'Habibur Rahman', 'manager', 1, 176 + SHIFT, None),
    (3, 'Sabbir Ahmed', 'cashier', 1, 90, None),      # the one with too many disputes, see storylines
    (4, 'Liton Das', 'cashier', 1, 170 + SHIFT, None),
    (7, 'Faruk Ahmed', 'manager', 1, 165 + SHIFT, None),
    (8, 'Mohammad Rubel', 'cashier', 1, 160 + SHIFT, None),
]

M_FIRST = ['Rafiq', 'Selim', 'Jahangir', 'Habib', 'Kamrul', 'Mizan', 'Shahin', 'Rubel', 'Sohel', 'Masud',
           'Faruk', 'Anwar', 'Delwar', 'Babul', 'Liton', 'Monir', 'Shafiq', 'Alamgir', 'Jewel', 'Rasel',
           'Arif', 'Tarek', 'Imran', 'Nayeem', 'Fahim', 'Belal', 'Harun', 'Kabir', 'Saiful', 'Zahid',
           'Ripon', 'Milon', 'Mostafa', 'Shahjahan', 'Aminul', 'Nasir', 'Jakir', 'Sharif', 'Ruhul', 'Ashraf']
M_LAST = ['Hossain', 'Islam', 'Rahman', 'Ahmed', 'Uddin', 'Mia', 'Sarkar', 'Chowdhury', 'Haque', 'Molla',
          'Talukder', 'Bhuiyan', 'Khan', 'Akand', 'Mondal', 'Howlader', 'Gazi', 'Prodhan', 'Majumder', 'Sikder']
F_FIRST = ['Fatema', 'Nasrin', 'Shirin', 'Salma', 'Sumaiya', 'Jesmin', 'Parvin', 'Rina', 'Shahnaz', 'Lipi',
           'Nazma', 'Rupa', 'Sharmin', 'Farzana', 'Tania', 'Mitu', 'Ayesha', 'Kulsum', 'Mahmuda', 'Nilufar',
           'Ruma', 'Bithi', 'Mukta', 'Sathi', 'Shanta', 'Morium', 'Halima', 'Asma', 'Sadia', 'Laboni']
F_LAST = ['Begum', 'Akter', 'Khatun', 'Sultana', 'Islam', 'Rahman', 'Parvin', 'Jahan', 'Yasmin', 'Chowdhury']
H_M_FIRST = ['Gopal', 'Shyamal', 'Pradip', 'Ratan', 'Bishwajit', 'Subrata', 'Tapan', 'Nikhil', 'Sanjoy', 'Uttam']
H_F_FIRST = ['Anjali', 'Puja', 'Shampa', 'Mitali', 'Sonali', 'Rakhi']
H_LAST = ['Das', 'Saha', 'Paul', 'Roy', 'Dey', 'Ghosh', 'Barua']

used_names = {s['owner'] for s in SHOPS} | {s[1] for s in STAFF}
used_phones, used_nids, used_trx = set(), set(), set()


def person_name():
    while True:
        r = random.random()
        if r < 0.45:
            n = random.choice(M_FIRST) + ' ' + random.choice(M_LAST)
            if random.random() < 0.3:
                n = random.choice(['Mohammad', 'Md.', 'Abdul']) + ' ' + n
        elif r < 0.85:
            n = random.choice(F_FIRST) + ' ' + random.choice(F_LAST)
        elif r < 0.95:
            n = random.choice(H_M_FIRST) + ' ' + random.choice(H_LAST)
        else:
            n = random.choice(H_F_FIRST) + ' Rani ' + random.choice(H_LAST)
        if n not in used_names:
            used_names.add(n)
            return n


def new_phone():
    while True:
        p = '01' + random.choice('3456789') + ''.join(random.choices('0123456789', k=8))
        if p not in used_phones:
            used_phones.add(p)
            return p


def new_nid():
    while True:
        k = random.choice([10, 10, 13, 17])
        n = random.choice('123456789') + ''.join(random.choices('0123456789', k=k - 1))
        if n not in used_nids:
            used_nids.add(n)
            return n


def new_trx(method):
    while True:
        if method == 'bkash':
            t = ''.join(random.choices('ABCDEFGHJKLMNPQRSTUVWXYZ0123456789', k=10))
        elif method == 'nagad':
            t = ''.join(random.choices('ABCDEFGHJKLMNPQRSTUVWXYZ0123456789', k=8))
        else:
            t = ''.join(random.choices('0123456789', k=10))
        if t not in used_trx:
            used_trx.add(t)
            return t


def email_for(name):
    return name.lower().replace('md. ', '').replace(' ', '.').replace("'", '') + '@example.com'


# ----------------------------------------------------------------------------
# platform: users, shops, staff
# ----------------------------------------------------------------------------
users = []


def add_user(name, role, created, last_login, email=True, phone=None, status='active'):
    u = dict(user_id=len(users) + 1, full_name=name, phone=phone or new_phone(),
             email=email_for(name) if email else None, password_hash=None, role=role,
             status=status, last_login_at=last_login, created_at=created,
             updated_at=max(created, last_login) if last_login else created)
    users.append(u)
    return u


admins = [add_user('Tanvir Ahmed', 'admin', T(200 + SHIFT, 610), T(1, 650)),
          add_user('Nusrat Jahan', 'admin', T(198 + SHIFT, 660), T(2, 1000))]

shops = []
for i, s in enumerate(SHOPS, 1):
    created = T(s['created'], 600 + i * 7)
    owner = add_user(s['owner'], 'owner', created,
                     T(random.randint(1, 2), random.randint(420, 1300)) if i != 9 else T(3, 1250),
                     email=(i % 3 != 0))
    pending = s.get('pending', False)
    verifier = random.choice(admins)
    shops.append(dict(
        shop_id=i, owner_user_id=owner['user_id'], area_id=s['area'], name=s['name'], shop_type=s['type'],
        trade_licence_no=s['licence'], address=s['address'], phone=owner['phone'],
        default_credit_limit=m(s['limit']), default_due_days=s['due'],
        status='pending' if pending else 'active',
        verified_by=None if pending else verifier['user_id'],
        verified_at=None if pending else T(s['created'] - random.randint(1, 2), random.randint(600, 1080)),
        created_at=created, updated_at=created, _owner=owner, _spec=s, _staff=[], _products=[]))
for s in shops:
    if s['verified_at']:
        s['updated_at'] = s['verified_at']

shop_staff = []
for shop_no, name, role, credit, joined, left in STAFF:
    shop = shops[shop_no - 1]
    u = add_user(name, 'staff', T(joined, random.randint(540, 700)),
                 T(left, 1290) if left else T(random.randint(1, 4), random.randint(480, 1300)),
                 email=random.random() < 0.5, status='suspended' if left else 'active')
    row = dict(shop_id=shop_no, user_id=u['user_id'], staff_role=role, can_give_credit=credit,
               joined_on=D(joined), left_on=D(left) if left else None, _user=u, _joined=joined, _left=left)
    shop_staff.append(row)
    shop['_staff'].append(row)


def working(shop, d):
    """staff rows working at the shop on day d (days ago)"""
    return [r for r in shop['_staff'] if r['_joined'] >= d and (r['_left'] is None or r['_left'] < d)]


def credit_givers(shop, d):
    return [shop['_owner']] + [r['_user'] for r in working(shop, d) if r['can_give_credit']]


def cashiers(shop, d):
    return [shop['_owner']] + [r['_user'] for r in working(shop, d)]


def approvers(shop, d):
    return [shop['_owner']] + [r['_user'] for r in working(shop, d) if r['staff_role'] == 'manager']


# ----------------------------------------------------------------------------
# catalogue and shop price lists
# ----------------------------------------------------------------------------
categories = [dict(category_id=i, name=n, bangla_name=b) for i, (n, b) in enumerate(CATEGORIES, 1)]
products = [dict(product_id=i, category_id=p[1], name=p[2], bangla_name=p[3], brand=p[4], unit=p[5],
                 created_at=T(205 + SHIFT, 540 + i), _key=p[0], _price=p[6], _pop=p[7], _qty=p[8])
            for i, p in enumerate(PRODUCTS, 1)]
PROD = {p['_key']: p for p in products}

shop_products = []
for s in shops:
    factor = random.uniform(0.97, 1.06)
    keys = ASSORTMENT[s['shop_type']]
    if s['shop_type'] == 'grocery':
        keys = [k for k in keys if random.random() < 0.9 or PROD[k]['_pop'] >= 6]
    for k in keys:
        p = PROD[k]
        fixed = p['category_id'] in FIXED_PRICE_CATS or s['shop_type'] == 'tea_stall'
        price = m(p['_price'] if fixed else round(p['_price'] * factor))
        old = None
        if k in PRICE_CHANGES and s['shop_type'] == 'grocery':
            ago, old_p = PRICE_CHANGES[k]
            old = (ago, m(round(old_p * factor)))
        track = 0 if s['shop_type'] == 'tea_stall' else 1
        sp = dict(shop_product_id=None, shop_id=s['shop_id'], product_id=p['product_id'], sell_price=price,
                  stock_qty=ZERO, reorder_level=ZERO, track_stock=track, is_active=1,
                  updated_at=s['created_at'], _p=p, _old=old, _last_sold=None)
        s['_products'].append(sp)
        shop_products.append(sp)
# a couple of discontinued items (never sold in this history)
for sp in random.sample([x for x in shop_products if x['shop_id'] in (1, 3, 7)], 3):
    sp['is_active'] = 0
for i, sp in enumerate(shop_products, 1):
    sp['shop_product_id'] = i


def price_on(sp, d):
    if sp['_old'] and d > sp['_old'][0]:
        return sp['_old'][1]
    return sp['sell_price']


# ----------------------------------------------------------------------------
# customers and their accounts
# ----------------------------------------------------------------------------
PERSONAS = ['reliable', 'average', 'late', 'defaulter', 'new']
PERSONA_W = [44, 28, 15, 7, 6]
customers = []


def add_customer(home_area, persona):
    c = dict(customer_id=None, phone=new_phone(), full_name=person_name(),
             nid=new_nid() if random.random() < 0.7 else None, area_id=home_area,
             address=None, user_id=None, created_at=None, updated_at=None,
             _persona=persona, _accounts=[],
             _method=random.choices(['cash', 'bkash', 'nagad', 'rocket'], [55, 30, 12, 3])[0])
    a = AREAS[home_area - 1]
    c['address'] = random.choice([
        f"House {random.randint(1, 120)}, Road {random.randint(1, 15)}, {a[0]}, {a[2]}",
        f"{random.randint(1, 60)}/{random.choice('ABCD')} {a[0]}, {a[2]}",
        f"Flat {random.randint(1, 6)}{random.choice('ABC')}, House {random.randint(1, 80)}, {a[0]}, {a[2]}"])
    if random.random() < 0.08:
        c['address'] = None
    customers.append(c)
    return c


mirpur_pool = [add_customer(random.choice(NEAR[1]), random.choices(PERSONAS, PERSONA_W)[0]) for _ in range(42)]
accounts = []

# storyline (Q3): about a dozen Mirpur people buy on baki at 3 or 4 of the Mirpur shops.
# they're mostly late payers so they still owe all of those shops at the end
MIRPUR_SHARE = {1: 26, 2: 16, 5: 10, 6: 14}          # how many accounts each Mirpur shop takes from the pool
forced = {sid: [] for sid in MIRPUR_SHARE}
for c in story.sample(mirpur_pool, 17):
    c['_persona'] = 'late'
    c['_multi'] = True
    for sid in [1] + story.sample([2, 5, 6], story.choice([2, 3, 3])):
        if len(forced[sid]) < MIRPUR_SHARE[sid] - 2:
            forced[sid].append(c)


def shop_due(shop):
    return shop['default_due_days']


for s, n in zip(shops, ACCOUNTS_PER_SHOP):
    if n == 0:
        continue
    if s['shop_id'] in MIRPUR_SHOPS:
        share = MIRPUR_SHARE[s['shop_id']]
        rest = [c for c in mirpur_pool if c not in forced[s['shop_id']]]
        members = forced[s['shop_id']] + random.sample(rest, share - len(forced[s['shop_id']]))
        members += [add_customer(random.choice(NEAR.get(s['area_id'], [s['area_id']])),
                                 random.choices(PERSONAS, PERSONA_W)[0]) for _ in range(n - share)]
    else:
        members = [add_customer(random.choice(NEAR.get(s['area_id'], [s['area_id']])),
                                random.choices(PERSONAS, PERSONA_W)[0]) for _ in range(n)]
    for c in members:
        persona = c['_persona']
        if persona == 'new':
            join = random.randint(5, 25)
        elif random.random() < 0.6:
            join = random.randint(HISTORY_DAYS - 45, HISTORY_DAYS)   # added in the shop's first weeks on DokanKhata
        else:
            join = random.randint(60, HISTORY_DAYS)
        base = float(s['default_credit_limit'])
        limit = m(round(base * random.choice([0.5, 0.75, 1, 1, 1, 1.25, 1.5]) / 100) * 100)
        if persona in ('late', 'defaulter'):
            limit = m(max(round(float(limit) * 0.75 / 100) * 100, 300))
        due = shop_due(s)
        if s['shop_type'] == 'grocery' and random.random() < 0.15:
            due = random.choice([7, 10, 20])
        a = dict(shop=s, cust=c, persona=persona, join=join, join_min=random.randint(*s['_spec']['hours']),
                 limit=limit, due=due, sales=[], payments=[], promises=[], agenda={},
                 limit_tl=[], due_tl=[], status_tl=[], next_buy=None, next_pay=None,
                 stop=None, writeoff=None, block_at=None, close_at=None, raise_at=None,
                 due_change_at=None, unblock_plan=None, vanish=None, cut_at=None)
        c['_accounts'].append(a)
        accounts.append(a)

# account-level storylines
rel = [a for a in accounts if a['persona'] == 'reliable']
for a in random.sample(rel, 9):                       # trusted regulars get a higher limit
    a['raise_at'] = random.randint(20, min(80, a['join'] - 20)) if a['join'] > 45 else None
for a in random.sample([x for x in rel if x['shop']['shop_id'] == 3 and x['join'] > 70], 2):
    a['due_change_at'] = random.randint(25, 60)       # Bismillah gives two regulars 30 days
for a in random.sample([x for x in rel if x['shop']['shop_id'] in (7, 8) and x['join'] > 80
                        and not x['raise_at']], 2):
    a['close_at'] = random.randint(10, 30)            # moved away; account closed
for a in accounts:
    if a['persona'] == 'defaulter':
        a['stop'] = random.randint(55, min(95, a['join'] - 15)) if a['join'] > 70 else random.randint(20, 40)
        a['must_writeoff'] = False
# storylines the demo needs every time: three bad debts written off, and two
# customers who stopped paying more than three months ago
long_defaulters = sorted([a for a in accounts if a['persona'] == 'defaulter' and a['join'] > 110],
                         key=lambda a: -a['join'])
for a in long_defaulters[:3]:
    a['stop'], a['must_writeoff'] = random.randint(85, min(100, a['join'] - 10)), True
for a in long_defaulters[3:5]:
    a['stop'] = random.randint(min(105, a['join'] - 10), min(125, a['join'] - 5))
open_disputes_wanted = 2
late_candidates = [a for a in accounts if a['persona'] == 'late' and a['join'] > 100]
if late_candidates:
    random.choice(late_candidates)['unblock_plan'] = True

# ---- storylines the reports need (all picked with the separate `story` stream)
taken = {id(a) for a in long_defaulters[:5]} | {id(a) for a in accounts
         if a['raise_at'] or a['close_at'] or a['due_change_at'] or a['unblock_plan'] or a['cust'].get('_multi')}

# Q4 vanished debtors: they stop coming AND stop paying 2 to 4 months ago, still owing.
# no write-off for them, the shop just hasn't seen them since
gone_pool = [a for a in accounts if id(a) not in taken and a['persona'] in ('average', 'late', 'defaulter')
             and a['join'] > 110 and a['shop']['shop_type'] != 'tea_stall']
for a in story.sample(gone_pool, min(24, len(gone_pool))):
    a['vanish'] = story.randint(65, min(130, a['join'] - 30))
    taken.add(id(a))

# Q2 over-limit: the owner cuts the limit of a few slow payers below what they already owe
# (in the last couple of weeks, so it's still true today). the trigger then refuses their next sale
cut_pool = [a for a in accounts if id(a) not in taken and a['persona'] in ('average', 'late')
            and a['join'] > 60 and a['shop']['shop_type'] in ('grocery', 'hardware', 'pharmacy')]
for a in story.sample(cut_pool, min(8, len(cut_pool))):
    a['cut_at'] = story.randint(2, 7)
    taken.add(id(a))

# Q13 suspicious staff: Sabbir at Bismillah gets a lot more disputes than anyone else
FLAGGED_STAFF = next(u for u in users if u['full_name'] == 'Sabbir Ahmed')

# Q9 festival rush: people buy more often (and more) in the 14 days before Eid and Durga Puja
FEST_DAYS = [((TODAY - day).days, name) for name, day in FESTIVALS if 0 < (TODAY - day).days <= HISTORY_DAYS + 14]


def festival_rush(d):
    """how much shorter the gap between visits is on day d (1.0 = a normal day)"""
    for ago, name in FEST_DAYS:
        if ago < d <= ago + 14:
            if name.startswith('Eid'):
                return 0.45
            if name == 'Durga Puja':
                return 0.6
            # Pohela Boishakh is halkhata, the day people settle their khata, not a buying rush
    return 1.0


# ----------------------------------------------------------------------------
# the ledger simulation
# ----------------------------------------------------------------------------
class Sale:
    def __init__(self, acc, t, staff, lines, due):
        self.acc, self.t, self.staff, self.lines, self.due = acc, t, staff, lines, due
        self.total = sum((m(q * p) for _, q, p in lines), ZERO)
        self.allocs, self.adjs, self.disputes = [], [], []
        self.note, self.plan, self.id = None, None, None
        self.flagged = False                          # sold by the suspicious cashier

    def balance(self, t):
        return (self.total - sum((x['amount'] for x in self.allocs if x['t'] <= t), ZERO)
                - sum((x['amount'] for x in self.adjs if x['t'] <= t), ZERO))

    def disputed(self, t):
        return any(x['t'] <= t and (x['resolved_t'] is None or x['resolved_t'] > t) for x in self.disputes)


payments_all, adjustments_all, disputes_all, promises_all, audit_all = [], [], [], [], []


def limit_at(a, t):
    v = a['limit0']
    for when, old, new in a['limit_tl']:
        if when <= t:
            v = new
    return v


def status_at(a, t):
    v = 'active'
    for when, st, reason in a['status_tl']:
        if when <= t:
            v = st
    return v


def due_days_at(a, t):
    v = a['due0']
    for when, old, new in a['due_tl']:
        if when <= t:
            v = new
    return v


def acc_balance(a, t):
    return sum((s.balance(t) for s in a['sales']), ZERO)


def payable(a, t):
    return sum((s.balance(t) for s in a['sales'] if s.balance(t) > 0 and not s.disputed(t)), ZERO)


def do_pay(a, t, amount, d, note=None):
    amount = m(amount)
    assert ZERO < amount <= payable(a, t), (amount, payable(a, t))
    c = a['cust']
    method = c['_method'] if random.random() < 0.75 else 'cash'
    if a['shop']['shop_type'] == 'tea_stall' and random.random() < 0.8:
        method = 'cash'
    p = dict(payment_id=None, shop_customer_id=None, amount=amount, method=method,
             trx_ref=None if method == 'cash' else new_trx(method),
             received_by=random.choice(cashiers(a['shop'], d))['user_id'], paid_at=t, note=note,
             _acc=a, _allocs=[])
    left = amount
    for s in sorted(a['sales'], key=lambda s: s.t):           # FIFO, like sp_record_payment
        if left <= 0:
            break
        if s.disputed(t):
            continue
        b = s.balance(t)
        if b <= 0:
            continue
        take = min(left, b)
        s.allocs.append(dict(amount=take, t=t, p=p))
        p['_allocs'].append((s, take))
        left -= take
    assert left == 0
    a['payments'].append(p)
    payments_all.append(p)
    return p


def do_adjust(s, t, typ, amount, reason, by):
    amount = m(amount)
    assert ZERO < amount <= s.balance(t), (typ, amount, s.balance(t))
    j = dict(adjustment_id=None, sale=s, adj_type=typ, amount=amount, reason=reason,
             approved_by=by['user_id'], created_at=t, t=t)
    s.adjs.append(j)
    adjustments_all.append(j)
    return j


def log_change(a, t, by, **changes):
    """an audit_log row exactly like trg_shop_customers_au writes it"""
    audit_all.append(dict(acc=a, t=t, by=by, changes=changes))


def free_minute(a, d, used, lo=None, hi=None):
    h = a['shop']['_spec']['hours']
    lo, hi = lo or h[0], hi or h[1]
    while True:
        x = random.randint(lo, hi)
        if x not in used:
            used.add(x)
            return x


GAPS = {'reliable': (5, 11), 'average': (6, 13), 'late': (7, 14), 'defaulter': (6, 12), 'new': (3, 8)}
SHOP_GAP = {'tea_stall': (2, 5), 'hardware': (12, 25), 'pharmacy': (9, 22), 'stationery': (7, 15)}
NOTES = ['Phone order, delivered home', 'Sent son to pick up', 'Monthly bazar', 'Took for a guest dinner',
         'Wife came to buy', 'Bought on the way to work']
RETURN_WHY = ['damaged packet', 'expired', 'wrong item given', 'not needed', 'bad quality']


def gap(a):
    lo, hi = SHOP_GAP.get(a['shop']['shop_type'], GAPS[a['persona']])
    return random.randint(lo, hi)


def make_basket(a, d):
    sps = [sp for sp in a['shop']['_products'] if sp['is_active']]
    k = random.choice({'grocery': [1, 2, 2, 3, 3, 4, 4, 5, 6], 'pharmacy': [1, 1, 2, 2, 3],
                       'hardware': [1, 1, 2, 3], 'stationery': [1, 2, 2, 3, 4],
                       'tea_stall': [1, 2, 2, 3]}[a['shop']['shop_type']])
    if a['shop']['shop_type'] == 'grocery' and festival_rush(d) < 0.5:
        k += 1                                        # Eid shopping: one more thing in the bag
    chosen = pick_weighted(sps, [sp['_p']['_pop'] for sp in sps], k)
    return [(sp, Dec(str(random.choice(sp['_p']['_qty']))), price_on(sp, d)) for sp in chosen]


def simulate(a):
    s_shop = a['shop']
    a['limit0'], a['due0'] = a['limit'], a['due']
    if a['raise_at']:
        a['raise_to'] = m(round(float(a['limit']) * 1.5 / 500) * 500)
    a['next_buy'] = a['join'] - random.randint(0, 3)
    a['next_pay'] = a['join'] - random.randint(8, 20)
    promise_open = None
    for d in range(a['join'], 0, -1):
        used = set()
        acts = []
        if d == a['join']:
            used.add(a['join_min'])
        st = status_at(a, T(d, 0))
        stopped = a['stop'] is not None and d < a['stop']
        gone = a['vanish'] is not None and d < a['vanish']     # vanished: no visits, no payments
        # --- planned storyline events
        if a['cut_at'] == d:
            acts.append((free_minute(a, d, used), 'cut'))
        if a['vanish'] == d and st == 'active':
            acts.append((free_minute(a, d, used), 'buy'))      # one last bag of shopping, then gone
        if a['raise_at'] == d:
            acts.append((free_minute(a, d, used), 'raise'))
        if a['due_change_at'] == d:
            acts.append((free_minute(a, d, used), 'due_change'))
        if a['close_at'] == d:
            acts.append((free_minute(a, d, used, hi=a['shop']['_spec']['hours'][1] - 30), 'close'))
        if a['writeoff'] == d:
            acts.append((free_minute(a, d, used), 'writeoff'))
        for x in a['agenda'].pop(d, []):
            acts.append((free_minute(a, d, used), ) + x)
        # --- buying
        if (st == 'active' and not stopped and not gone and d <= a['next_buy']
                and (a['close_at'] is None or d > a['close_at'])):
            acts.append((free_minute(a, d, used), 'buy'))
            a['next_buy'] = d - max(1, round(gap(a) * festival_rush(d)))
        # --- paying
        if not gone and (not stopped or random.random() < 0.01):
            if a['persona'] in ('reliable', 'new', 'average'):
                acts.append((free_minute(a, d, used), 'pay_plan'))
            if a['persona'] != 'reliable' and a['persona'] != 'new' and d <= a['next_pay']:
                acts.append((free_minute(a, d, used), 'pay_lump'))
                every = {'average': (10, 20), 'late': (18, 35), 'defaulter': (25, 40)}[a['persona']]
                a['next_pay'] = d - random.randint(*every)
        # --- promises when money is late
        p_promise = {'late': 0.07, 'defaulter': 0.05 if not stopped else 0.03, 'average': 0.015}.get(a['persona'], 0)
        if d <= 8:
            p_promise *= 5                       # chasing dues before month end: fresh promises
        if not gone and p_promise and promise_open is None and random.random() < p_promise:
            acts.append((free_minute(a, d, used), 'promise'))
        # --- blocking rules for bad payers
        acts.sort(key=lambda x: x[0])
        for act in acts:
            minute, kind = act[0], act[1]
            t = T(d, minute)
            if kind == 'buy':
                if status_at(a, t) != 'active':
                    continue
                lines = make_basket(a, d)
                room = limit_at(a, t) - acc_balance(a, t)
                while lines and sum((m(q * p) for _, q, p in lines), ZERO) > room:
                    lines.remove(max(lines, key=lambda l: l[1] * l[2]))
                if not lines:
                    continue                                   # the trigger would refuse it
                staff = random.choice(credit_givers(s_shop, d))
                sale = Sale(a, t, staff, lines, D(d) + dt.timedelta(days=due_days_at(a, t)))
                if random.random() < 0.05:
                    sale.note = random.choice(NOTES)
                a['sales'].append(sale)
                for sp, q, p in lines:
                    sp['_last_sold'] = max(sp['_last_sold'] or t, t)
                due_days = due_days_at(a, t)
                if a['persona'] in ('reliable', 'new'):
                    sale.plan = d - random.randint(1, max(1, int(due_days * 0.8)))
                elif a['persona'] == 'average' and random.random() < 0.3:
                    sale.plan = d - random.randint(3, due_days + 5)
                # a few returns and disputes
                global open_disputes_wanted
                if (open_disputes_wanted and 3 <= d <= 7 and s_shop['shop_type'] in ('grocery', 'hardware')
                        and random.random() < 0.2):
                    open_disputes_wanted -= 1
                    a['agenda'].setdefault(d - 1, []).append(('dispute', sale, 'stay_open'))
                elif s_shop['shop_type'] != 'tea_stall':
                    if random.random() < 0.03:
                        a['agenda'].setdefault(d - random.randint(0, 2), []).append(('return', sale))
                    elif random.random() < 0.014:
                        a['agenda'].setdefault(d - random.randint(1, 4), []).append(('dispute', sale))
                # Sabbir's sales get disputed about 1 time in 6, and most of those turn out to be right
                if staff is FLAGGED_STAFF and d > 2 and story.random() < 0.17:
                    sale.flagged = True
                    a['agenda'].setdefault(d - story.randint(1, 2), []).append(('dispute', sale))
            elif kind in ('pay_plan', 'pay_lump', 'pay_promise'):
                pay = payable(a, t)
                if pay <= 0:
                    continue
                if kind == 'pay_plan':
                    amt = sum((s.balance(t) for s in a['sales']
                               if s.plan is not None and s.plan >= d and s.balance(t) > 0
                               and not s.disputed(t)), ZERO)
                    if amt <= 0:
                        continue
                elif kind == 'pay_promise':
                    amt = min(max(act[2]['promised_amount'], round_down(pay * Dec('0.5'), 50)), pay)
                else:
                    frac = Dec(str(random.uniform(*{'average': (0.6, 1.0), 'late': (0.3, 0.7),
                                                     'defaulter': (0.1, 0.3)}[a['persona']])))
                    amt = pay if (pay < 500 and random.random() < 0.7) else round_down(pay * frac, 50)
                    if a['persona'] == 'average' and random.random() < 0.3:
                        amt = pay
                    if amt <= 0:
                        continue
                    # an average payer with a planned sale pays it off on time too
                amt = min(m(amt), pay)
                rounded = round_down(amt, 10)
                give_discount = (amt != rounded and amt - rounded <= 20 and rounded > 0 and random.random() < 0.12)
                note = random.choice([None] * 12 + ['Paid by son', 'Partial payment', 'Sent from wife\'s number'])
                p = do_pay(a, t, rounded if give_discount else amt, d, note=note)
                if give_discount:
                    for s, take in p['_allocs']:
                        b = s.balance(t)
                        if ZERO < b <= 20:
                            do_adjust(s, t + dt.timedelta(minutes=1), 'discount', b,
                                      'Rounded off at payment', s_shop['_owner'])
            elif kind == 'promise':
                tt = t
                overdue = sum((s.balance(tt) for s in a['sales'] if s.due < D(d) and s.balance(tt) > 0
                               and not s.disputed(tt)), ZERO)
                pay = payable(a, tt)
                if overdue < 100 or pay < 100:
                    continue
                amt = min(max(m(round_down(overdue * Dec(str(random.uniform(0.3, 0.6))), 100)), m(100)),
                          m(round_down(pay, 100)))
                when = d - random.randint(2, 7)
                pr = dict(promise_id=None, acc=a, promised_amount=amt, promised_date=D(when), status=None,
                          recorded_by=random.choice(cashiers(s_shop, d))['user_id'], created_at=tt,
                          resolved_at=None, _when=when)
                a['promises'].append(pr)
                promises_all.append(pr)
                promise_open = pr
                keep = random.random() < {'late': 0.65, 'average': 0.8,
                                          'defaulter': 0.2 if not stopped else 0.05}[a['persona']]
                if keep:
                    day = random.randint(max(when, 0), d - 1) if d - 1 >= max(when, 0) else 0
                    if day >= 1:
                        a['agenda'].setdefault(day, []).append(('pay_promise', pr))
            elif kind == 'return':
                sale = act[2]
                sp, q, p = random.choice(sale.lines)
                amt = m(q * p)
                if amt <= sale.balance(t) and not sale.disputed(t):
                    unit = sp['_p']['unit']
                    qty = f"{q.normalize():f}"
                    what = (f"{qty} {unit} {sp['_p']['name']}" if unit in ('kg', 'litre', 'dozen')
                            else f"{qty} x {sp['_p']['name']}")
                    do_adjust(sale, t, 'return', amt, f"Returned {what} ({random.choice(RETURN_WHY)})",
                              random.choice(approvers(s_shop, d)))
            elif kind == 'dispute':
                sale = act[2]
                if sale.balance(t) <= 0 or sale.disputed(t):
                    continue
                sp, q, p = random.choice(sale.lines)
                why = random.choice([f"I did not take the {sp['_p']['name']}",
                                     f"Quantity of {sp['_p']['name']} is wrong",
                                     'This bill was written twice', 'Price is higher than what was said'])
                dp = dict(dispute_id=None, sale=sale, raised_by_customer_id=None, reason=why, status='open',
                          resolved_by=None, resolution=None, raised_at=t, resolved_at=None, t=t, resolved_t=None,
                          _line=(sp, q, p))
                sale.disputes.append(dp)
                disputes_all.append(dp)
                rd = d - random.randint(2, 8)
                if rd >= 1 and len(act) < 4:
                    a['agenda'].setdefault(rd, []).append(('resolve', dp))
            elif kind == 'resolve':
                dp = act[2]
                sale = dp['sale']
                by = random.choice(approvers(s_shop, d))
                sp, q, p = dp['_line']
                accept = random.random() < 0.55
                if sale.flagged:
                    accept = story.random() < 0.85
                dp['resolved_t'] = t
                dp['resolved_at'] = t
                dp['resolved_by'] = by['user_id']
                if accept:
                    amt = min(m(q * p), sale.balance(t))
                    dp['status'] = 'accepted'
                    dp['resolution'] = f"Checked the khata; removed {sp['_p']['name']} (Tk {fmt0(amt)})"
                    if amt > 0:
                        do_adjust(sale, t, 'correction', amt, f"Dispute accepted: {dp['reason']}", by)
                else:
                    dp['status'] = 'rejected'
                    dp['resolution'] = random.choice(['Customer confirmed the items after seeing the khata',
                                                      'Staff remembers the sale; bill is correct'])
            elif kind == 'cut':
                # owner cuts the limit to half of what they owe right now
                bal, old = acc_balance(a, t), limit_at(a, t)
                new = m(max(round_down(bal * Dec('0.5'), 100), 100))
                if status_at(a, t) != 'active' or bal < 300 or new >= old:
                    continue
                a['limit_tl'].append((t, old, new))
                log_change(a, t, s_shop['_owner'], credit_limit=(old, new))
            elif kind == 'raise':
                old = limit_at(a, t)
                a['limit_tl'].append((t, old, a['raise_to']))
                log_change(a, t, s_shop['_owner'], credit_limit=(old, a['raise_to']))
            elif kind == 'due_change':
                a['due_tl'].append((t, a['due0'], 30))
                log_change(a, t, s_shop['_owner'], due_days=(a['due0'], 30))
            elif kind == 'close':
                pay = payable(a, t)
                if acc_balance(a, t) != pay:
                    continue                                   # something disputed: keep it open
                if pay > 0:
                    do_pay(a, t, pay, d, note='Final payment before moving away')
                a['status_tl'].append((t + dt.timedelta(minutes=5), 'closed', None))
                log_change(a, t + dt.timedelta(minutes=5), s_shop['_owner'], status=('active', 'closed'))
            elif kind == 'writeoff':
                bad = [s for s in a['sales'] if s.balance(t) > 0 and not s.disputed(t)
                       and (D(d) - s.due).days > 60]
                if not bad:
                    continue
                for s in bad:
                    do_adjust(s, t, 'write_off', s.balance(t),
                              'Customer unreachable for over 60 days; written off as bad debt', s_shop['_owner'])
                tb = t + dt.timedelta(minutes=5)
                reason = 'Bad debt written off; no further credit'
                a['status_tl'].append((tb, 'blocked', reason))
                log_change(a, tb, s_shop['_owner'], status=('active', 'blocked'), blocked_reason=(None, reason))
            elif kind == 'unblock':
                a['status_tl'].append((t, 'active', None))
                log_change(a, t, s_shop['_owner'], status=('blocked', 'active'),
                           blocked_reason=(act[2], None))
        # promise bookkeeping (resolved the way ev_check_promises does it, at 00:10 next day)
        if promise_open is not None:
            pr = promise_open
            got = sum((p['amount'] for p in a['payments'] if p['paid_at'] >= pr['created_at']
                       and p['paid_at'].date() <= pr['promised_date']), ZERO)
            if got >= pr['promised_amount']:
                pr['status'], pr['resolved_at'] = 'kept', T(d - 1, 10)
                promise_open = None
            elif pr['_when'] >= d:                              # promised date is today: broken tonight
                pr['status'], pr['resolved_at'] = 'broken', T(d - 1, 10)
                promise_open = None
        # bad payers get blocked once a sale is 45+ days late
        if a['persona'] in ('defaulter', 'late') and status_at(a, T(d, 1439)) == 'active':
            worst = max(((D(d) - s.due).days for s in a['sales'] if s.balance(T(d, 1439)) > 0), default=0)
            limit_days = 45 if a['persona'] == 'defaulter' else (40 if a['unblock_plan'] else 10 ** 6)
            if worst > limit_days and d > 2:
                tb = T(d, a['shop']['_spec']['hours'][1] - 15)
                reason = ('More than 45 days overdue; credit stopped until dues are cleared'
                          if a['persona'] == 'defaulter' else 'Over 40 days late; credit paused')
                a['status_tl'].append((tb, 'blocked', reason))
                log_change(a, tb, s_shop['_owner'], status=('active', 'blocked'), blocked_reason=(None, reason))
                if (a['persona'] == 'defaulter' and (a['must_writeoff'] or random.random() < 0.3) and d > 20
                        and a['vanish'] is None):
                    a['writeoff'] = max(d - random.randint(18, 35), 2)   # 60+ days late by then
                if a['unblock_plan']:
                    # pays most of it a week later and gets credit back
                    payday = max(d - random.randint(5, 9), 2)
                    a['agenda'].setdefault(payday, []).append(('pay_promise', dict(promised_amount=m(10 ** 6))))
                    a['agenda'].setdefault(payday - 1, []).append(('unblock', reason))
                    a['persona'] = 'average'
    # promises still open are pending (their date is today or later)
    if promise_open is not None:
        promise_open['status'] = 'pending'


for a in accounts:
    simulate(a)

# write-off rows mark the account blocked; the 'blocked' row that came first already exists,
# so a second block on a blocked account must not be logged twice
for a in accounts:
    seen, clean = 'active', []
    for row in sorted(a['status_tl'], key=lambda r: r[0]):
        if row[1] == seen:
            continue
        clean.append(row)
        seen = row[1]
    a['status_tl'] = clean
kept_audit = []
for r in sorted(audit_all, key=lambda r: r['t']):
    if 'status' in r['changes']:
        old, new = r['changes']['status']
        if not any(when == r['t'] and st == new for when, st, _ in r['acc']['status_tl']):
            continue
    kept_audit.append(r)
audit_all = kept_audit

# ----------------------------------------------------------------------------
# give everything its ids (oldest first) and final values
# ----------------------------------------------------------------------------
NOW = dt.datetime.combine(TODAY, dt.time(0, 30))    # the nightly jobs ran at 00:05-00:30 today

# customers: id in the order they first joined a shop
for c in customers:
    c['_first'] = min((T(a['join'], a['join_min']) for a in c['_accounts']), default=None)
customers = [c for c in customers if c['_first'] is not None]
customers.sort(key=lambda c: c['_first'])
for i, c in enumerate(customers, 1):
    c['customer_id'] = i
    c['created_at'] = c['updated_at'] = c['_first']

# shop_customers: by shop, then join date
shop_customers = []
for s in shops:
    accs = sorted([a for a in accounts if a['shop'] is s], key=lambda a: (-a['join'], a['join_min']))
    for a in accs:
        a['shop_customer_id'] = len(shop_customers) + 1
        final_status, reason = 'active', None
        for when, st, rsn in a['status_tl']:
            final_status, reason = st, rsn
        changes = [r['t'] for r in audit_all if r['acc'] is a]
        created = T(a['join'], a['join_min'])
        a['row'] = dict(shop_customer_id=a['shop_customer_id'], shop_id=s['shop_id'],
                        customer_id=a['cust']['customer_id'],
                        credit_limit=limit_at(a, NOW), due_days=due_days_at(a, NOW), status=final_status,
                        blocked_reason=reason if final_status == 'blocked' else None,
                        joined_on=D(a['join']), created_at=created,
                        updated_at=max(changes) if changes else created)
        shop_customers.append(a['row'])

# customer portal logins (customers who claimed their account)
portal = random.sample([c for c in customers if c['_persona'] in ('reliable', 'average')
                        and (TODAY - c['_first'].date()).days > 40], 9)
portal += random.sample([c for c in customers if c['_persona'] == 'late'
                         and (TODAY - c['_first'].date()).days > 40], 1)
# the demo customer login: a good payer with accounts at 2+ shops, so the portal has something to show
demo_pool = [c for c in customers if c['_persona'] == 'reliable' and len(c['_accounts']) >= 2
             and (TODAY - c['_first'].date()).days > 120]
demo_customer = story.choice(demo_pool)
if demo_customer not in portal:
    portal[0] = demo_customer
for c in sorted(portal, key=lambda c: c['_first']):
    first_day = (TODAY - c['_first'].date()).days
    created_day = random.randint(max(first_day - 30, 8), first_day - 5)
    u = add_user(c['full_name'], 'customer', T(created_day, random.randint(600, 1320)),
                 T(random.randint(1, 6), random.randint(420, 1380)), email=random.random() < 0.6,
                 phone=c['phone'])
    c['user_id'] = u['user_id']
    c['updated_at'] = u['created_at']

# guarantors: a reliable customer of the same shop stands surety for a riskier one
guarantors = []
for a in random.sample([x for x in accounts if x['persona'] in ('late', 'average', 'new')
                        and x['shop']['shop_type'] in ('grocery', 'hardware')], 10):
    others = [x for x in accounts if x['shop'] is a['shop'] and x['persona'] == 'reliable' and x is not a]
    if not others:
        continue
    g = random.choice(others)
    when = min(a['join'], g['join'])
    created = T(when, random.randint(600, 1200))
    created = max(created, T(a['join'], a['join_min']) + dt.timedelta(minutes=5),
                  T(g['join'], g['join_min']) + dt.timedelta(minutes=5))
    guarantors.append(dict(shop_customer_id=a['shop_customer_id'], guarantor_customer_id=g['cust']['customer_id'],
                           guarantee_limit=m(max(500, round(float(a['row']['credit_limit']) *
                                                            random.uniform(0.5, 1.0) / 500) * 500)),
                           created_at=created))
guarantors.sort(key=lambda r: (r['shop_customer_id'], r['guarantor_customer_id']))

# sales, items
sales = sorted([s for a in accounts for s in a['sales']], key=lambda s: (s.t, s.acc['shop_customer_id']))
items = []
for i, s in enumerate(sales, 1):
    s.id = i
for s in sales:
    for sp, q, p in s.lines:
        items.append(dict(item_id=len(items) + 1, sale_id=s.id, shop_product_id=sp['shop_product_id'],
                          qty=m(q), unit_price=p))


def sale_status(s, t=NOW):
    """sp_refresh_sale_status"""
    paid = sum((x['amount'] for x in s.allocs if x['t'] <= t), ZERO)
    adj = sum((x['amount'] for x in s.adjs if x['t'] <= t), ZERO)
    bal = s.total - paid - adj
    if s.disputed(t):
        return 'disputed'
    if bal <= 0 and any(x['adj_type'] == 'write_off' for x in s.adjs):
        return 'written_off'
    if bal <= 0:
        return 'paid'
    if s.due < t.date():
        return 'overdue'
    if paid + adj > 0:
        return 'partially_paid'
    return 'open'


sale_rows = [dict(sale_id=s.id, shop_customer_id=s.acc['shop_customer_id'], staff_user_id=s.staff['user_id'],
                  sold_at=s.t, total_amount=s.total, due_date=s.due, status=sale_status(s), note=s.note)
             for s in sales]

payments_all.sort(key=lambda p: (p['paid_at'], p['_acc']['shop_customer_id']))
alloc_rows = []
for i, p in enumerate(payments_all, 1):
    p['payment_id'] = i
    p['shop_customer_id'] = p['_acc']['shop_customer_id']
    for s, take in p['_allocs']:
        alloc_rows.append(dict(payment_id=i, sale_id=s.id, amount=take, allocated_at=p['paid_at']))

adjustments_all.sort(key=lambda j: (j['created_at'], j['sale'].id))
for i, j in enumerate(adjustments_all, 1):
    j['adjustment_id'] = i
    j['sale_id'] = j['sale'].id

disputes_all.sort(key=lambda x: x['raised_at'])
for i, x in enumerate(disputes_all, 1):
    x['dispute_id'] = i
    x['sale_id'] = x['sale'].id
    x['raised_by_customer_id'] = x['sale'].acc['cust']['customer_id']

promises_all.sort(key=lambda x: x['created_at'])
for i, x in enumerate(promises_all, 1):
    x['promise_id'] = i
    x['shop_customer_id'] = x['acc']['shop_customer_id']
    if x['status'] is None:
        x['status'] = 'pending'
    if x['status'] == 'pending':
        x['resolved_at'] = None

# ----------------------------------------------------------------------------
# reminders, the way ev_queue_reminders makes them (plus promise reminders
# the app queues when a promise is recorded)
# ----------------------------------------------------------------------------
reminders = []
seen = set()
for day in range(REMINDER_DAYS, -1, -1):
    t = T(day, 15)
    today_d = D(day)
    batch = []
    for s in sales:
        if s.t >= t:
            continue
        b = s.balance(t)
        if b <= 0 or s.disputed(t):
            continue
        shop = s.acc['shop']['name']
        if today_d + dt.timedelta(days=1) <= s.due <= today_d + dt.timedelta(days=3):
            batch.append((s, 'before_due', Msg(f"{shop}: Tk {fmt0(b)} baki is due on ", s.due, '.')))
        if today_d - dt.timedelta(days=6) <= s.due <= today_d:
            batch.append((s, 'on_due', Msg(f"{shop}: Tk {fmt0(b)} baki is due today.")))
        late = (today_d - s.due).days
        if late >= 7:
            batch.append((s, 'overdue', Msg(f"{shop}: Tk {fmt0(b)} baki is {late} days late. Please pay soon.")))
    for s, typ, msg in batch:
        if (s.id, typ) in seen:
            continue
        seen.add((s.id, typ))
        app = s.acc['cust']['user_id'] is not None
        if day == 0:
            status, sent = 'queued', None
        elif not app and random.random() < 0.04:
            status, sent = 'failed', None
        else:
            status, sent = 'sent', T(day, random.randint(540, 560))
        reminders.append(dict(reminder_id=None, shop_customer_id=s.acc['shop_customer_id'], sale_id=s.id,
                              reminder_type=typ, channel='app' if app else 'sms', message=msg,
                              scheduled_for=today_d, status=status, sent_at=sent, created_at=t))
for pr in promises_all:
    created_day = (TODAY - pr['created_at'].date()).days
    if created_day > REMINDER_DAYS:
        continue
    sched = pr['promised_date'] - dt.timedelta(days=1)
    if sched < pr['created_at'].date():
        continue
    sched_day = (TODAY - sched).days
    sched_t = T(sched_day, 540) if sched_day >= 0 else None
    if pr['status'] == 'kept' and pr['resolved_at'] <= dt.datetime.combine(sched, dt.time(9, 0)):
        status, sent = 'cancelled', None
    elif sched_day <= 0:
        status, sent = 'queued', None
    else:
        status, sent = 'sent', sched_t
    shop = pr['acc']['shop']['name']
    app = pr['acc']['cust']['user_id'] is not None
    reminders.append(dict(reminder_id=None, shop_customer_id=pr['shop_customer_id'], sale_id=None,
                          reminder_type='promise', channel='app' if app else 'sms',
                          message=Msg(f"{shop}: You promised to pay Tk {fmt0(pr['promised_amount'])} on ",
                                      pr['promised_date'], '. Please keep your word.'),
                          scheduled_for=sched, status=status, sent_at=sent,
                          created_at=pr['created_at'] + dt.timedelta(minutes=1)))
reminders.sort(key=lambda r: (r['scheduled_for'], r['created_at'], r['shop_customer_id']))
for i, r in enumerate(reminders, 1):
    r['reminder_id'] = i

# ----------------------------------------------------------------------------
# audit log rows, in the JSON format JSON_OBJECT() produces in MariaDB
# ----------------------------------------------------------------------------
def json_obj(limit, due, status, reason):
    r = 'null' if reason is None else '"' + reason + '"'
    return f'{{"credit_limit": {limit:.2f}, "due_days": {due}, "status": "{status}", "blocked_reason": {r}}}'


audit_rows = []
for r in sorted(audit_all, key=lambda r: r['t']):
    a, t = r['acc'], r['t']
    before = t - dt.timedelta(seconds=1)
    old_reason = next((rs for w, st, rs in reversed(a['status_tl']) if w <= before), None)
    old = (limit_at(a, before), due_days_at(a, before), status_at(a, before),
           old_reason if status_at(a, before) == 'blocked' else None)
    new_reason = next((rs for w, st, rs in reversed(a['status_tl']) if w <= t), None)
    new = (limit_at(a, t), due_days_at(a, t), status_at(a, t),
           new_reason if status_at(a, t) == 'blocked' else None)
    if old == new:
        continue
    audit_rows.append(dict(log_id=len(audit_rows) + 1, table_name='shop_customers', record_id=a['shop_customer_id'],
                           action='UPDATE', old_value=json_obj(*old), new_value=json_obj(*new),
                           changed_by=r['by']['full_name'], changed_at=t))

# ----------------------------------------------------------------------------
# stock left on the shelf, and when each price-list row last changed
# ----------------------------------------------------------------------------
for sp in shop_products:
    p = sp['_p']
    if not sp['track_stock']:
        sp['stock_qty'], sp['reorder_level'] = ZERO, ZERO
    else:
        unit = p['unit']
        if p['_key'] == 'cement':
            reorder, stock = 40, random.randint(15, 39) if random.random() < 0.3 else random.randint(60, 300)
        elif unit in ('kg', 'litre'):
            reorder = random.choice([10, 15, 20, 25])
            stock = random.randint(2, reorder) if random.random() < 0.12 else random.randint(30, 220)
            if p['_key'] in ('cumin', 'garlic', 'ginger', 'greenchili'):
                reorder, stock = 2, random.randint(1, 15) if random.random() < 0.15 else random.randint(4, 15)
        else:
            reorder = random.choice([5, 6, 10, 12, 20])
            stock = random.randint(0, reorder) if random.random() < 0.12 else random.randint(reorder + 8, 140)
        sp['reorder_level'], sp['stock_qty'] = m(reorder), m(stock)
    shop = shops[sp['shop_id'] - 1]
    changes = [shop['created_at']]
    if sp['_last_sold']:
        changes.append(sp['_last_sold'])
    if sp['_old']:
        changes.append(T(sp['_old'][0], 480))
    sp['updated_at'] = max(changes) if sp['track_stock'] else max(c for c in changes if c)

# ----------------------------------------------------------------------------
# PHP-compatible bcrypt hashes for the demo password
# ----------------------------------------------------------------------------
php = ('$n = (int)$argv[1]; for ($i = 0; $i < $n; $i++) '
       'echo password_hash($argv[2], PASSWORD_BCRYPT, ["cost" => 10]), "\\n";')
hashes = subprocess.run(['php', '-r', php, str(len(users)), PASSWORD], capture_output=True, text=True,
                        check=True).stdout.split()
assert len(hashes) == len(users)
for u, h in zip(users, hashes):
    u['password_hash'] = h


# ----------------------------------------------------------------------------
# write seed.sql
# ----------------------------------------------------------------------------
def rel_date(x):
    n = (TODAY - x).days
    if n > 0:
        return f"@today - INTERVAL {n} DAY"
    if n < 0:
        return f"@today + INTERVAL {-n} DAY"
    return "@today"


def sql(v):
    if v is None:
        return 'NULL'
    if isinstance(v, bool):
        return '1' if v else '0'
    if isinstance(v, int):
        return str(v)
    if isinstance(v, Dec):
        return f'{v:.2f}'
    if isinstance(v, dt.datetime):
        assert v <= NOW, v
        return f"{rel_date(v.date())} + INTERVAL '{v:%H:%M}' HOUR_MINUTE"
    if isinstance(v, dt.date):
        return rel_date(v)
    if isinstance(v, Msg):
        parts = [f"DATE_FORMAT({rel_date(p)}, '%d %b')" if isinstance(p, dt.date) else sql(p) for p in v.parts]
        return parts[0] if len(parts) == 1 else 'CONCAT(' + ', '.join(parts) + ')'
    s = str(v)
    assert '\\' not in s
    return "'" + s.replace("'", "''") + "'"


out = []
w = out.append


def insert(table, cols, rows, chunk=200, note=None):
    if note:
        w(f"-- {note}")
    for i in range(0, len(rows), chunk):
        w(f"INSERT INTO {table} ({', '.join(cols)}) VALUES")
        w(',\n'.join('  (' + ', '.join(sql(r[c]) for c in cols) + ')' for r in rows[i:i + chunk]) + ';')
    w('')


owner1 = shops[0]['_owner']
staff1 = next(r['_user'] for r in shop_staff if r['shop_id'] == 1 and r['staff_role'] == 'manager')
portal_user = next(u for u in users if u['role'] == 'customer' and u['phone'] == demo_customer['phone'])
w(f"""-- =====================================================================
--  DokanKhata: Intelligent Baki Management & Credit Tracking
--              Infrastructure for Small Retailers
--  File: seed.sql  (sample data)
--
--  Import AFTER schema.sql, in the same phpMyAdmin window:
--    phpMyAdmin > dokankhata > Import > choose seed.sql > Go
--  (dokankhata_full.sql already contains schema.sql + this file.)
--
--  What is inside: about nine months of baki at {len(shops)} shops in
--  {len({s['area_id'] for s in shops})} areas: {len(customers)} customers with {len(shop_customers)} shop accounts,
--  {len(sale_rows)} credit sales, {len(payments_all)} payments (cash, bKash, Nagad, Rocket), returns,
--  discounts, disputes, promises, write-offs and SMS reminders.
--
--  Dates: every date is written relative to the day you import, e.g.
--    @today - INTERVAL 12 DAY + INTERVAL '10:30' HOUR_MINUTE
--  so "overdue", "due tomorrow" and "promised for Friday" always match
--  the real calendar, whenever the file is imported.
--
--  Demo logins (phone or email + password  {PASSWORD}  for EVERY user):
--    admin     {admins[0]['full_name']:<20} {admins[0]['phone']}  {admins[0]['email']}
--    owner     {owner1['full_name']:<20} {owner1['phone']}  ({shops[0]['name']})
--    manager   {staff1['full_name']:<20} {staff1['phone']}  ({shops[0]['name']})
--    customer  {portal_user['full_name']:<20} {portal_user['phone']}  (customer portal)
--  Hashes are real PHP password_hash() (bcrypt) output, so
--  password_verify('{PASSWORD}', $hash) returns true in the PHP API.
--
--  Generated by db/generator/make_seed.py (npm run db:seed); rerun it instead of editing by hand.
-- =====================================================================

USE dokankhata;
SET NAMES utf8mb4;
-- Fail loudly instead of silently cutting or zeroing a bad value.
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
-- This history was already checked by the generator, so the triggers skip
-- their checks while it loads (see schema.sql, "Bulk loading").
SET @disable_triggers = 1;
SET @today = DATE_FORMAT(CURDATE(), '%Y-%m-%d');

START TRANSACTION;
""")

w("-- ---------------------------------------------------------------------\n-- Module A. Platform & access\n-- ---------------------------------------------------------------------\n")
insert('areas', ['area_id', 'name', 'thana', 'district', 'division'],
       [dict(area_id=i, name=a[0], thana=a[1], district=a[2], division=a[3]) for i, a in enumerate(AREAS, 1)])
insert('users', ['user_id', 'full_name', 'phone', 'email', 'password_hash', 'role', 'status', 'last_login_at',
                 'created_at', 'updated_at'], users,
       note='users: 2 admins, 9 shop owners, 9 staff (1 has left), 10 customers with a portal login')
insert('shops', ['shop_id', 'owner_user_id', 'area_id', 'name', 'shop_type', 'trade_licence_no', 'address',
                 'phone', 'default_credit_limit', 'default_due_days', 'status', 'verified_by', 'verified_at',
                 'created_at', 'updated_at'], shops,
       note='shops: 8 verified and trading, 1 still waiting for admin verification')
insert('shop_staff', ['shop_id', 'user_id', 'staff_role', 'can_give_credit', 'joined_on', 'left_on'], shop_staff)

w("-- ---------------------------------------------------------------------\n-- Module B. Customers\n-- ---------------------------------------------------------------------\n")
insert('customers', ['customer_id', 'phone', 'full_name', 'nid', 'area_id', 'address', 'user_id', 'created_at',
                     'updated_at'], customers,
       note='customers: one identity per phone number, shared by every shop they buy from')
insert('shop_customers', ['shop_customer_id', 'shop_id', 'customer_id', 'credit_limit', 'due_days', 'status',
                          'blocked_reason', 'joined_on', 'created_at', 'updated_at'], shop_customers,
       note='shop_customers: final account terms (history of changes is in audit_log)')
insert('customer_guarantors', ['shop_customer_id', 'guarantor_customer_id', 'guarantee_limit', 'created_at'],
       guarantors, note='customer_guarantors: a regular customer of the same shop stands surety (jamindar)')

w("-- ---------------------------------------------------------------------\n-- Module C. Products\n-- ---------------------------------------------------------------------\n")
insert('categories', ['category_id', 'name', 'bangla_name'], categories)
insert('products', ['product_id', 'category_id', 'name', 'bangla_name', 'brand', 'unit', 'created_at'], products)
insert('shop_products', ['shop_product_id', 'shop_id', 'product_id', 'sell_price', 'stock_qty', 'reorder_level',
                         'track_stock', 'is_active', 'updated_at'], shop_products,
       note='shop_products: each shop\'s own prices and stock (tea stall does not count stock)')

w("-- ---------------------------------------------------------------------\n-- Module D. Credit ledger\n-- ---------------------------------------------------------------------\n")
insert('credit_sales', ['sale_id', 'shop_customer_id', 'staff_user_id', 'sold_at', 'total_amount', 'due_date',
                        'status', 'note'], sale_rows,
       note='credit_sales: status is what sp_refresh_sale_status gives on the import day')
insert('credit_sale_items', ['item_id', 'sale_id', 'shop_product_id', 'qty', 'unit_price'], items, chunk=300,
       note='credit_sale_items: line_total is a generated column, so it is not listed')
insert('payments', ['payment_id', 'shop_customer_id', 'amount', 'method', 'trx_ref', 'received_by', 'paid_at',
                    'note'], payments_all)
insert('payment_allocations', ['payment_id', 'sale_id', 'amount', 'allocated_at'], alloc_rows, chunk=300,
       note='payment_allocations: each payment split over the oldest unpaid, undisputed sales first (FIFO)')
insert('adjustments', ['adjustment_id', 'sale_id', 'adj_type', 'amount', 'reason', 'approved_by', 'created_at'],
       adjustments_all)
insert('promises', ['promise_id', 'shop_customer_id', 'promised_amount', 'promised_date', 'status', 'recorded_by',
                    'created_at', 'resolved_at'], promises_all,
       note='promises: kept/broken exactly as ev_check_promises decides at 00:10 each night')
insert('disputes', ['dispute_id', 'sale_id', 'raised_by_customer_id', 'reason', 'status', 'resolved_by',
                    'resolution', 'raised_at', 'resolved_at'], disputes_all,
       note='disputes: open_sale_id is a generated column, so it is not listed')

w("-- ---------------------------------------------------------------------\n-- Module E. Communication & records\n-- ---------------------------------------------------------------------\n")
insert('reminders', ['reminder_id', 'shop_customer_id', 'sale_id', 'reminder_type', 'channel', 'message',
                     'scheduled_for', 'status', 'sent_at', 'created_at'], reminders,
       note=f'reminders: queued each night by ev_queue_reminders over the last {REMINDER_DAYS} days, plus promise reminders')
insert('audit_log', ['log_id', 'table_name', 'record_id', 'action', 'old_value', 'new_value', 'changed_by',
                     'changed_at'], audit_rows,
       note='audit_log: credit-limit, due-day and block/unblock changes, as trg_shop_customers_au logs them')

w("""COMMIT;

SET @disable_triggers = NULL;

-- ---------------------------------------------------------------------
-- Derived data: built by the same procedures the scheduled events run,
-- so the numbers come from the database's own rules.
-- ---------------------------------------------------------------------

-- month-end statements for the last five finished months (ev_monthly_statements)
CALL sp_generate_statements(DATE_FORMAT(@today - INTERVAL 5 MONTH, '%Y-%m-01'));
CALL sp_generate_statements(DATE_FORMAT(@today - INTERVAL 4 MONTH, '%Y-%m-01'));
CALL sp_generate_statements(DATE_FORMAT(@today - INTERVAL 3 MONTH, '%Y-%m-01'));
CALL sp_generate_statements(DATE_FORMAT(@today - INTERVAL 2 MONTH, '%Y-%m-01'));
CALL sp_generate_statements(DATE_FORMAT(@today - INTERVAL 1 MONTH, '%Y-%m-01'));

-- trust score for every customer (ev_trust_scores)
CALL sp_refresh_all_trust_scores();

-- ---------------------------------------------------------------------
-- Quick check: phpMyAdmin shows this table when the import finishes.
-- ---------------------------------------------------------------------
SELECT 'areas' AS table_name, COUNT(*) AS row_count FROM areas
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'shops', COUNT(*) FROM shops
UNION ALL SELECT 'shop_staff', COUNT(*) FROM shop_staff
UNION ALL SELECT 'customers', COUNT(*) FROM customers
UNION ALL SELECT 'shop_customers', COUNT(*) FROM shop_customers
UNION ALL SELECT 'customer_guarantors', COUNT(*) FROM customer_guarantors
UNION ALL SELECT 'customer_trust_scores', COUNT(*) FROM customer_trust_scores
UNION ALL SELECT 'categories', COUNT(*) FROM categories
UNION ALL SELECT 'products', COUNT(*) FROM products
UNION ALL SELECT 'shop_products', COUNT(*) FROM shop_products
UNION ALL SELECT 'credit_sales', COUNT(*) FROM credit_sales
UNION ALL SELECT 'credit_sale_items', COUNT(*) FROM credit_sale_items
UNION ALL SELECT 'payments', COUNT(*) FROM payments
UNION ALL SELECT 'payment_allocations', COUNT(*) FROM payment_allocations
UNION ALL SELECT 'adjustments', COUNT(*) FROM adjustments
UNION ALL SELECT 'promises', COUNT(*) FROM promises
UNION ALL SELECT 'disputes', COUNT(*) FROM disputes
UNION ALL SELECT 'reminders', COUNT(*) FROM reminders
UNION ALL SELECT 'monthly_statements', COUNT(*) FROM monthly_statements
UNION ALL SELECT 'audit_log', COUNT(*) FROM audit_log;

-- End of seed.sql""")

print('\n'.join(out))
