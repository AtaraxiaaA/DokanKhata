// shapes of what the API sends back. same names as the SQL columns, just camelCase
import type { AccountStatus, SaleStatus } from './enums';

// every error response looks like this
export interface ApiErrorBody {
  error: {
    // VALIDATION, BUSINESS_RULE, DUPLICATE, UNAUTHORIZED, FORBIDDEN, NOT_FOUND ...
    code: string;
    message: string;
    details?: unknown;
  };
}

// one row of v_customer_balance plus the trust score
export interface CustomerBalanceRow {
  shopCustomerId: number;
  customerId: number;
  fullName: string;
  phone: string;
  creditLimit: number;
  status: AccountStatus;
  totalSales: number;
  totalCredit: number;
  totalPaid: number;
  totalAdjusted: number;
  balance: number;
  availableCredit: number;
  unpaidSales: number;
  oldestUnpaidDue: string | null;
  maxDaysOverdue: number;
  lastPurchaseAt: string | null;
  trustScore: number | null;
}

// what the counter sees before giving credit
export interface CustomerLookup {
  customerId: number;
  fullName: string;
  phone: string;
  // null if they're on DokanKhata but haven't bought from this shop yet
  account: {
    shopCustomerId: number;
    creditLimit: number;
    dueDays: number;
    status: AccountStatus;
    balance: number;
    availableCredit: number;
    maxDaysOverdue: number;
  } | null;
  trust: {
    score: number;
    onTimePct: number | null;
    avgDaysLate: number;
    brokenPromises: number;
    shopsOwed: number;
    totalOutstanding: number;
  } | null;
  // what they owe at other shops
  otherShops: { shopsOwed: number; outstanding: number };
}

export interface ShopProductRow {
  shopProductId: number;
  productId: number;
  name: string;
  banglaName: string | null;
  brand: string;
  unit: string;
  category: string;
  sellPrice: number;
  stockQty: number;
  trackStock: boolean;
}

export interface SaleRow {
  saleId: number;
  soldAt: string;
  dueDate: string;
  totalAmount: number;
  paidAmount: number;
  adjustedAmount: number;
  balance: number;
  status: SaleStatus;
}
