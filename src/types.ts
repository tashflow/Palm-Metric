export type Language = 'ar' | 'en';

export type PageView = 'menu' | 'checkout' | 'track' | 'account' | 'info' | 'admin';

export type OrderType = 'pickup' | 'delivery';

export type TempChoice = 'hot' | 'cold';

export type MediaType = 'image' | 'video';

export type MenuSortOption = 'default' | 'price-asc' | 'price-desc' | 'name-asc' | 'name-desc';

export type AvailabilityFilter = 'all' | 'in-stock' | 'out-of-stock';

export interface Billboard {
  id: string;
  title: string;
  titleAr?: string;
  titleEn?: string;
  subtitle?: string;
  subtitleAr?: string;
  subtitleEn?: string;
  mediaUrl: string;
  mediaType: MediaType;
  posterUrl?: string;
  active: boolean;
  order: number;
  category?: string;
  ctaLabel?: string;
  badge?: string;
  isOffer?: boolean;
  sourceCollection?: string;
  itemId?: string;
  itemIds?: string[];
}

export interface CoffeeOptionsSettings {
  milkSelectionEnabled: boolean;
  coconutMilkExtraPrice: number;
  hotColdSelectionEnabled: boolean;
  updatedAtMs?: number;
}

export interface MenuItem {
  id: string;
  name: string;
  nameAr?: string;
  nameEn?: string;
  description: string;
  descriptionAr?: string;
  price: number;
  originalPrice?: number;
  isOffer?: boolean;
  offerLabel?: string;
  category: string;
  categoryAr?: string;
  imageUrl: string;
  inStock: boolean;
  isAvailable?: boolean;
  available?: boolean;
  outOfStock?: boolean;
  stockQuantity?: number;
  prepTime?: string;
  supportsTemp?: boolean;
  supportsCustomization?: boolean;
  allowMilkOption?: boolean;
  coconutMilkPrice?: number;
  allowTemperature?: boolean;
  order?: number;
  origin?: string;
  originAr?: string;
  region?: string;
  regionAr?: string;
  country?: string;
  countryAr?: string;
  processingMethod?: string;
  processingMethodAr?: string;
  roastLevel?: string;
  altitude?: string;
  variety?: string;
  tastingNotes?: string[];
  tastingNotesAr?: string[];
  brewMethods?: string[];
  producer?: string;
}

export type CustomizationGroupType = 'single' | 'multiple';

export interface CustomizationOption {
  id: string;
  name: string;
  nameAr?: string;
  additionalPrice: number;
  enabled: boolean;
  isDefault?: boolean;
  displayOrder: number;
}

export interface CustomizationGroup {
  id: string;
  name: string;
  nameAr?: string;
  type: CustomizationGroupType;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  displayOrder: number;
  enabled: boolean;
  options: CustomizationOption[];
}

export interface ProductCustomizationConfig {
  productId: string;
  enabled: boolean;
  groups: CustomizationGroup[];
  updatedAtMs?: number;
  updatedBy?: string;
  schemaVersion: number;
  allowSpecialInstructions?: boolean;
}

export interface SelectedCustomizationItem {
  groupId: string;
  groupName: string;
  groupNameAr?: string;
  optionId: string;
  optionName: string;
  optionNameAr?: string;
  additionalPrice: number;
}

export interface CartItem {
  cartKey: string;
  itemId: string;
  name: string;
  nameAr?: string;
  nameEn?: string;
  price: number;
  basePrice?: number;
  customizationTotal?: number;
  customizations?: SelectedCustomizationItem[];
  customizationUpdatedAtMs?: number;
  imageUrl: string;
  quantity: number;
  note: string;
  temp?: TempChoice;
}

export type OrderStatus = 'Pending' | 'Preparing' | 'Ready' | 'Completed' | 'Cancelled';

export type OrderRequestStatus =
  | 'pending_review'
  | 'reviewing'
  | 'verified'
  | 'order_created'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export type LegacyMilkOption = 'none' | 'regular' | 'coconut';
export type LegacyTemperatureOption = 'Hot' | 'Cold';

export interface OrderRequestCustomizationSelection {
  groupId: string;
  optionId: string;
}

export interface OrderRequestItem {
  itemId: string;
  quantity: number;
  selectedSizeId?: string;
  selectedCustomizations?: OrderRequestCustomizationSelection[];
  temperature?: LegacyTemperatureOption;
  milkOption?: LegacyMilkOption;
  specialInstructions?: string;
  name?: string;
  nameAr?: string;
}

export interface VerifiedPricingLineItem {
  itemId: string;
  name: string;
  nameAr?: string;
  quantity: number;
  basePriceSar: number;
  customizationTotalSar: number;
  unitPriceSar: number;
  lineTotalSar: number;
  selectedCustomizations?: SelectedCustomizationItem[];
  temperature?: LegacyTemperatureOption;
  milkOption?: LegacyMilkOption;
  milkExtraPrice?: number;
  specialInstructions?: string;
  note: string;
  imageUrl: string;
  inStock: boolean;
}

export interface VerifiedPricingBreakdown {
  currency: 'SAR';
  orderType: 'pickup';
  pricingVersion: number;
  subtotalSar: number;
  discountSar: number;
  taxSar: number;
  totalBillSar: number;
  itemCount: number;
  verifiedAtMs: number;
  verifiedByUid: string;
  verifiedByEmail?: string;
  items: VerifiedPricingLineItem[];
}

export interface OrderRequest {
  id: string;
  requestId: string;
  requestNumber: string;
  customerUid: string;
  customerName: string;
  customerContact: string;
  orderType: 'pickup';
  currency: 'SAR';
  lang?: Language;
  orderNote?: string;
  items: OrderRequestItem[];
  status: OrderRequestStatus;
  requestSource?: string;
  reviewedBy?: string;
  reviewedAtMs?: number;
  verifiedBy?: string;
  verifiedAtMs?: number;
  verifiedTotalSar?: number;
  verifiedPricing?: VerifiedPricingBreakdown;
  approvedBy?: string;
  approvedAtMs?: number;
  approvedOrderId?: string;
  approvedOrderNumber?: string;
  rejectedBy?: string;
  rejectedAtMs?: number;
  rejectionReason?: string;
  createdAtMs?: number;
  updatedAtMs?: number;
  duplicatePrevented?: boolean;
}

export type AdminOrderRequestAuditAction =
  | 'start_review'
  | 'verify_request'
  | 'price_verification'
  | 'approve_and_promote'
  | 'reject_request'
  | 'order_promotion'
  | 'duplicate_approval_blocked'
  | 'verification_blocked';

export interface OrderRequestAuditEntry {
  id: string;
  requestId: string;
  action: AdminOrderRequestAuditAction;
  adminUid: string;
  adminEmail?: string;
  previousStatus?: OrderRequestStatus;
  newStatus?: OrderRequestStatus;
  approvedOrderId?: string;
  approvedOrderNumber?: string;
  verifiedTotalSar?: number;
  reason?: string;
  details?: string;
  createdAtMs?: number;
}

export interface OrderLineItem {
  itemId: string;
  name: string;
  nameAr?: string;
  price: number;
  basePrice?: number;
  customizationTotal?: number;
  quantity: number;
  selectedCustomizations?: SelectedCustomizationItem[];
  specialInstructions?: string;
  note: string;
  imageUrl: string;
  temperature?: LegacyTemperatureOption;
  milkOption?: LegacyMilkOption;
  milkExtraPrice?: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerUid?: string;
  orderType?: OrderType;
  customerName: string;
  customerPhone: string;
  deliveryLocation?: string;
  mapsLink?: string;
  orderNote?: string;
  items: OrderLineItem[];
  subtotal?: number;
  discountTotal?: number;
  taxTotal?: number;
  total: number;
  currency?: 'SAR';
  pricingVersion?: number;
  sourceRequestId?: string;
  paymentMethod?: 'pay_on_pickup';
  paymentStatus?: 'unpaid' | 'paid';
  approvedBy?: string;
  approvedAtMs?: number;
  idempotentReplay?: boolean;
  status: OrderStatus;
  createdAtMs?: number;
  updatedAtMs?: number;
}

export interface TrackedOrderMeta {
  id: string;
  kind?: 'order' | 'request';
  orderNumber: string;
  whatsappUrl?: string;
  receiptSnapshot?: Order;
  requestSnapshot?: OrderRequest;
}

export interface GeoLocation {
  lat: number;
  lng: number;
}

export interface UserAccount {
  id: string;
  name: string;
  phone: string;
  password: string;
  address: string;
  location?: GeoLocation;
}

export interface StoreSettings {
  storeOpen: boolean;
  prepTime?: string;
  whatsappNumber?: string;
  announcement?: string;
  announcementAr?: string;
  heroTitle?: string;
  heroTitleAr?: string;
  heroSubtitle?: string;
  heroSubtitleAr?: string;
  coffeeOptions?: CoffeeOptionsSettings;
}

export type ReportType = 'order' | 'feedback' | 'customer_signup' | 'issue';

export interface AppReportInput {
  type: ReportType;
  title: string;
  message?: string;
  orderId?: string;
  orderNumber?: string;
  orderType?: OrderType;
  customerName?: string;
  customerPhone?: string;
  deliveryLocation?: string;
  mapsLink?: string;
  itemCount?: number;
  total?: number;
}
