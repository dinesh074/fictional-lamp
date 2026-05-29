export type Role = 'owner' | 'manager';
export type PaymentStatus = 'paid' | 'pending' | 'overdue';
export type PaymentMode = 'cash' | 'upi' | 'bank_transfer' | 'card' | 'other';
export type TenantStatus = 'active' | 'inactive';
export type LedgerType = 'charge' | 'payment' | 'adjustment' | 'store_purchase' | 'refund';
export type StorePaymentMethod = 'cash' | 'upi' | 'ledger' | 'card' | 'other';
export type NotificationChannel = 'whatsapp' | 'sms' | 'email' | 'manual';
export type ExpenseCategory =
  | 'purchase'
  | 'utility_bill'
  | 'salary'
  | 'rent'
  | 'maintenance'
  | 'tax'
  | 'other';
export type ExpensePaymentMethod =
  | 'cash'
  | 'upi'
  | 'bank_transfer'
  | 'card'
  | 'cheque'
  | 'other';
export type ExpenseStatus = 'paid' | 'pending' | 'scheduled';
export type RecurringPeriod = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface Profile {
  id: string;
  name: string;
  phone: string | null;
  role: Role;
  created_by: string | null;
  created_at: string;
}

export interface Building {
  id: string;
  name: string;
  address: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Room {
  id: string;
  building_id: string;
  room_number: string;
  capacity: number;
  monthly_rent: number;
  created_at: string;
  building?: Building;
}

export interface Tenant {
  id: string;
  room_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  aadhar: string | null;
  pan: string | null;
  gst_number: string | null;
  emergency_contact: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  status: TenantStatus;
  payment_due_day: number | null;
  auto_due_day: boolean;
  photo_url: string | null;
  payment_hold: boolean;
  payment_hold_reason: string | null;
  payment_hold_until: string | null;
  created_at: string;
  room?: Room & { building?: Building };
}

export interface Payment {
  id: string;
  tenant_id: string;
  amount: number;
  period_month: string;
  due_date: string;
  paid_date: string | null;
  payment_mode: PaymentMode | null;
  status: PaymentStatus;
  notes: string | null;
  created_at: string;
  tenant?: Tenant;
}

export interface Invoice {
  id: string;
  payment_id: string;
  invoice_number: string;
  gst_details: Record<string, unknown> | null;
  created_at: string;
  payment?: Payment;
}

export interface Settings {
  id: number;
  hostel_name: string;
  hostel_address: string | null;
  hostel_gst: string | null;
  hostel_pan: string | null;
  hostel_phone: string | null;
  hostel_email: string | null;
  payment_due_day: number;
  invoice_prefix: string;
  invoice_counter: number;
  upi_vpa?: string | null;
  upi_payee_name?: string | null;
}

export interface LedgerEntry {
  id: string;
  tenant_id: string;
  building_id: string | null;
  entry_date: string;
  type: LedgerType;
  reference_id: string | null;
  reference_type: string | null;
  amount: number;
  balance_after: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  tenant?: Tenant;
}

export interface Product {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  unit: string;
  cost_price: number;
  sell_price: number;
  stock_qty: number;
  low_stock_threshold: number;
  photo_url: string | null;
  active: boolean;
  created_at: string;
}

export interface StoreSaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  qty: number;
  unit_price: number;
  unit_cost: number;
  line_total: number;
  product?: Product;
}

export interface StoreSale {
  id: string;
  tenant_id: string | null;
  sale_date: string;
  subtotal: number;
  discount: number;
  total: number;
  payment_method: StorePaymentMethod;
  notes: string | null;
  created_at: string;
  tenant?: Tenant;
  items?: StoreSaleItem[];
}

export interface NotificationLog {
  id: string;
  tenant_id: string | null;
  channel: NotificationChannel;
  template: string | null;
  message: string | null;
  status: 'queued' | 'sent' | 'clicked' | 'failed' | 'skipped';
  error: string | null;
  created_at: string;
}

export interface Expense {
  id: string;
  expense_date: string;
  category: ExpenseCategory;
  subcategory: string | null;
  vendor_name: string | null;
  staff_id: string | null;
  building_id: string | null;
  amount: number;
  payment_method: ExpensePaymentMethod | null;
  status: ExpenseStatus;
  paid_date: string | null;
  description: string | null;
  receipt_url: string | null;
  recurring: boolean;
  recurring_period: RecurringPeriod | null;
  next_due_date: string | null;
  parent_expense_id: string | null;
  created_by: string | null;
  created_at: string;
  building?: Building;
  staff?: Profile;
}

