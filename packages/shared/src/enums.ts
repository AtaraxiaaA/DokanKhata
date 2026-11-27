// copies of every ENUM in schema.sql. if you change one there, change it here in the same PR

export const USER_ROLES = ['owner', 'staff', 'customer', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['active', 'suspended'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const DIVISIONS = [
  'Dhaka',
  'Chattogram',
  'Rajshahi',
  'Khulna',
  'Barishal',
  'Sylhet',
  'Rangpur',
  'Mymensingh',
] as const;
export type Division = (typeof DIVISIONS)[number];

export const SHOP_TYPES = [
  'grocery',
  'pharmacy',
  'hardware',
  'stationery',
  'tea_stall',
  'cosmetics',
  'electronics',
  'other',
] as const;
export type ShopType = (typeof SHOP_TYPES)[number];

export const SHOP_STATUSES = ['pending', 'active', 'suspended', 'closed'] as const;
export type ShopStatus = (typeof SHOP_STATUSES)[number];

export const STAFF_ROLES = ['manager', 'cashier'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const ACCOUNT_STATUSES = ['active', 'blocked', 'closed'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const UNITS = [
  'kg',
  'g',
  'litre',
  'ml',
  'piece',
  'packet',
  'dozen',
  'box',
  'strip',
  'bottle',
] as const;
export type Unit = (typeof UNITS)[number];

export const SALE_STATUSES = [
  'open',
  'partially_paid',
  'paid',
  'overdue',
  'disputed',
  'written_off',
] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

export const PAYMENT_METHODS = ['cash', 'bkash', 'nagad', 'rocket'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const ADJUSTMENT_TYPES = ['return', 'discount', 'correction', 'write_off'] as const;
export type AdjustmentType = (typeof ADJUSTMENT_TYPES)[number];

export const PROMISE_STATUSES = ['pending', 'kept', 'broken'] as const;
export type PromiseStatus = (typeof PROMISE_STATUSES)[number];

export const DISPUTE_STATUSES = ['open', 'accepted', 'rejected'] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

export const REMINDER_TYPES = ['before_due', 'on_due', 'overdue', 'promise'] as const;
export type ReminderType = (typeof REMINDER_TYPES)[number];

export const REMINDER_CHANNELS = ['sms', 'app'] as const;
export type ReminderChannel = (typeof REMINDER_CHANNELS)[number];

export const REMINDER_STATUSES = ['queued', 'sent', 'failed', 'cancelled'] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

// labels for badges and dropdowns
export const SALE_STATUS_LABEL: Record<SaleStatus, string> = {
  open: 'Open',
  partially_paid: 'Partially paid',
  paid: 'Paid',
  overdue: 'Overdue',
  disputed: 'Disputed',
  written_off: 'Written off',
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Cash',
  bkash: 'bKash',
  nagad: 'Nagad',
  rocket: 'Rocket',
};
