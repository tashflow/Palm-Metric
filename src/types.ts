export type Language = 'ar' | 'en';

export type PageView = 'menu' | 'checkout' | 'track' | 'account' | 'info';

export type OrderType = 'pickup' | 'delivery';

export type TempChoice = 'hot' | 'cold';

export type MediaType = 'image' | 'video';

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
  order?: number;
}

export interface CartItem {
  cartKey: string;
  itemId: string;
  name: string;
  nameAr?: string;
  nameEn?: string;
  price: number;
  imageUrl: string;
  quantity: number;
  note: string;
  temp?: TempChoice;
}

export type OrderStatus = 'Pending' | 'Preparing' | 'Ready' | 'Completed' | 'Cancelled';

export interface OrderLineItem {
  itemId: string;
  name: string;
  price: number;
  quantity: number;
  note: string;
  imageUrl: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  orderType?: OrderType;
  customerName: string;
  customerPhone: string;
  deliveryLocation?: string;
  mapsLink?: string;
  orderNote?: string;
  items: OrderLineItem[];
  total: number;
  status: OrderStatus;
  createdAtMs?: number;
  updatedAtMs?: number;
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
