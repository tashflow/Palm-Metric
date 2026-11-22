export const PRICING_VERSION = 1;
export const SUPPORTED_CURRENCY = 'SAR' as const;
export const MAX_ORDER_ITEMS = 50;
export const MAX_ITEM_QUANTITY = 99;
export const MAX_CUSTOMIZATIONS_PER_ITEM = 30;
export const MAX_AMOUNT_SAR = 100_000;
export const MAX_CUSTOMIZATION_OPTION_PRICE_SAR = 5_000;

export type BackendErrorCode =
  | 'unauthenticated'
  | 'permission-denied'
  | 'invalid-argument'
  | 'not-found'
  | 'failed-precondition'
  | 'already-exists'
  | 'resource-exhausted'
  | 'internal';

export class OrderBackendError extends Error {
  readonly code: BackendErrorCode;
  readonly reasonCode?: string;

  constructor(code: BackendErrorCode, message: string, reasonCode?: string) {
    super(message);
    this.name = 'OrderBackendError';
    this.code = code;
    this.reasonCode = reasonCode;
  }
}

export interface OrderInputCustomizationSelection {
  groupId: string;
  optionId: string;
}

export interface OrderInputItem {
  itemId: string;
  quantity: number;
  temperature?: 'Hot' | 'Cold';
  specialInstructions?: string;
  selectedCustomizations?: OrderInputCustomizationSelection[];
}

export interface CreateOrderRequest {
  idempotencyKey: string;
  orderType: 'pickup';
  currency?: 'SAR';
  lang?: 'ar' | 'en';
  customerName: string;
  customerContact: string;
  orderNote?: string;
  items: OrderInputItem[];
}

export interface MenuCatalogDoc {
  id: string;
  name?: string;
  nameAr?: string;
  nameEn?: string;
  price?: number;
  category?: string;
  imageUrl?: string;
  inStock?: boolean;
  isAvailable?: boolean;
  available?: boolean;
  outOfStock?: boolean;
  allowMilkOption?: boolean;
  coconutMilkPrice?: number;
  allowTemperature?: boolean;
  supportsTemp?: boolean;
}

export interface CustomizationOptionDoc {
  id: string;
  name: string;
  nameAr?: string;
  additionalPrice: number;
  enabled: boolean;
  isDefault?: boolean;
  displayOrder: number;
}

export interface CustomizationGroupDoc {
  id: string;
  name: string;
  nameAr?: string;
  type: 'single' | 'multiple';
  required: boolean;
  minSelections: number;
  maxSelections: number;
  displayOrder: number;
  enabled: boolean;
  options: CustomizationOptionDoc[];
}

export interface ProductCustomizationDoc {
  productId: string;
  enabled: boolean;
  groups: CustomizationGroupDoc[];
  schemaVersion: number;
  allowSpecialInstructions?: boolean;
}

export interface CoffeeOptionsDoc {
  milkSelectionEnabled: boolean;
  coconutMilkExtraPrice: number;
  hotColdSelectionEnabled: boolean;
}

export interface AuthoritativeSelectedCustomization {
  groupId: string;
  groupName: string;
  groupNameAr?: string;
  optionId: string;
  optionName: string;
  optionNameAr?: string;
  additionalPrice: number;
}

export interface AuthoritativeOrderLineItem {
  itemId: string;
  name: string;
  nameAr?: string;
  price: number;
  basePrice: number;
  customizationTotal: number;
  quantity: number;
  selectedCustomizations?: AuthoritativeSelectedCustomization[];
  specialInstructions?: string;
  note: string;
  imageUrl: string;
  temperature?: 'Hot' | 'Cold';
  milkOption?: 'regular' | 'coconut';
  milkExtraPrice?: number;
}

export interface CanonicalOrderDoc {
  orderNumber: string;
  customerUid: string;
  customerName: string;
  customerContact: string;
  items: AuthoritativeOrderLineItem[];
  subtotal: number;
  totalBill: number;
  currency: 'SAR';
  orderType: 'pickup';
  status: 'Pending';
  notes: string;
  sourceApp: 'palm-metric-customer';
  lang?: 'ar' | 'en';
  idempotencyKey: string;
  pricingVersion: number;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface CreateOrderResponse {
  orderId: string;
  orderNumber: string;
  customerUid: string;
  customerName: string;
  customerContact: string;
  orderType: 'pickup';
  currency: 'SAR';
  status: 'Pending';
  notes: string;
  subtotal: number;
  totalBill: number;
  pricingVersion: number;
  idempotentReplay: boolean;
  items: AuthoritativeOrderLineItem[];
}

export interface IdempotencyRecord {
  customerUid: string;
  idempotencyKey: string;
  requestDigest: string;
  orderId: string;
  orderNumber: string;
  responseSnapshot: CreateOrderResponse;
  createdAt: unknown;
}
