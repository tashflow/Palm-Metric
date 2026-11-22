export type Language = 'ar' | 'en';

export type PageView = 'menu' | 'checkout' | 'track' | 'account' | 'info';

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

export type LegacyMilkOption = 'none' | 'regular' | 'coconut';
export type LegacyTemperatureOption = 'Hot' | 'Cold';

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
  total: number;
  currency?: 'SAR';
  pricingVersion?: number;
  idempotentReplay?: boolean;
  status: OrderStatus;
  createdAtMs?: number;
  updatedAtMs?: number;
}

export interface TrackedOrderMeta {
  id: string;
  orderNumber: string;
  whatsappUrl?: string;
  receiptSnapshot?: Order;
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
