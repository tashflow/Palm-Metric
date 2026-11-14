export interface StarterCategory {
  id: string;
  ar: string;
  en: string;
}

export interface StarterMenuItem {
  id: string;
  categoryId: string;
  nameAr: string;
  nameEn: string;
  price: number;
  supportsTemp?: boolean;
}

export const BUSINESS = {
  nameEn: 'Palm Metric',
  nameAr: 'بالم مترك',
  phoneDisplay: '+966 50 643 9172',
  whatsappNumber: '966506439172',
  email: 'palmmatric1@gmail.com',
  mapsUrl: 'https://maps.app.goo.gl/NUSopb1BnQJYNyKd8',
  instagramUrl: 'https://www.instagram.com/palm_metric',
  tiktokUrl: 'https://www.tiktok.com/@palm_metric',
  snapchatUrl: 'https://www.snapchat.com/add/palm_metric',
  logoSrc: './assets/aistudio/IMG-20261021-WA0006_53f18f59.jpg',
  mascotSrc: './assets/aistudio/file_00000000feb482109f398277360d668c_b4ac5f5f.png',
};

export const CATEGORIES: StarterCategory[] = [
  { id: 'coffee-of-the-day', ar: 'قهوة اليوم', en: 'Coffee of the Day' },
  { id: 'v60', ar: 'V60', en: 'V60' },
  { id: 'espresso', ar: 'إسبريسو', en: 'Espresso' },
  { id: 'matcha', ar: 'ماتشا', en: 'Matcha' },
  { id: 'specialty', ar: 'مشروبات مختصة', en: 'Specialty' },
  { id: 'cold-drinks', ar: 'مشروبات باردة', en: 'Cold Drinks' },
  { id: 'food', ar: 'المخبوزات والحلويات', en: 'Food' },
];

export const MENU_ITEMS: StarterMenuItem[] = [
  // Coffee of the Day
  {
    id: 'cotd-small',
    categoryId: 'coffee-of-the-day',
    nameAr: 'قهوة اليوم – صغير',
    nameEn: 'Coffee of the Day – Small',
    price: 6,
    supportsTemp: true,
  },
  {
    id: 'cotd-large',
    categoryId: 'coffee-of-the-day',
    nameAr: 'قهوة اليوم – كبير',
    nameEn: 'Coffee of the Day – Large',
    price: 8,
    supportsTemp: true,
  },

  // V60
  {
    id: 'v60-ethiopia',
    categoryId: 'v60',
    nameAr: 'إثيوبيا (حار / بارد)',
    nameEn: 'Ethiopia Hot / Cold',
    price: 12,
    supportsTemp: true,
  },
  {
    id: 'v60-colombia',
    categoryId: 'v60',
    nameAr: 'كولومبيا (حار / بارد)',
    nameEn: 'Colombia Hot / Cold',
    price: 12,
    supportsTemp: true,
  },
  {
    id: 'v60-yemen',
    categoryId: 'v60',
    nameAr: 'اليمن (حار / بارد)',
    nameEn: 'Yemen Hot / Cold',
    price: 15,
    supportsTemp: true,
  },

  // Espresso
  {
    id: 'esp-flat-white',
    categoryId: 'espresso',
    nameAr: 'فلات وايت',
    nameEn: 'Flat White',
    price: 14,
  },
  {
    id: 'esp-cappuccino',
    categoryId: 'espresso',
    nameAr: 'كابتشينو',
    nameEn: 'Cappuccino',
    price: 14,
  },

  // Matcha
  {
    id: 'mat-palm-regular',
    categoryId: 'matcha',
    nameAr: 'بالم ماتشا (حليب عادي)',
    nameEn: 'Palm Matcha (Regular milk)',
    price: 19,
  },
  {
    id: 'mat-palm-coconut',
    categoryId: 'matcha',
    nameAr: 'بالم ماتشا (حليب جوز الهند)',
    nameEn: 'Palm Matcha (Coconut milk)',
    price: 19,
  },
  {
    id: 'mat-iced',
    categoryId: 'matcha',
    nameAr: 'آيس ماتشا',
    nameEn: 'Iced Matcha',
    price: 17,
  },

  // Specialty
  {
    id: 'spec-spanish-latte',
    categoryId: 'specialty',
    nameAr: 'آيس سبانش لاتيه',
    nameEn: 'Iced Spanish Latte',
    price: 16,
  },
  {
    id: 'spec-white-mocha',
    categoryId: 'specialty',
    nameAr: 'آيس وايت موكا',
    nameEn: 'Iced White Mocha',
    price: 17,
  },

  // Cold Drinks
  {
    id: 'cold-hibiscus-small',
    categoryId: 'cold-drinks',
    nameAr: 'كركديه صغير',
    nameEn: 'Hibiscus Small',
    price: 8,
  },
  {
    id: 'cold-hibiscus-large',
    categoryId: 'cold-drinks',
    nameAr: 'كركديه كبير',
    nameEn: 'Hibiscus Large',
    price: 10,
  },
  {
    id: 'cold-peach-tea',
    categoryId: 'cold-drinks',
    nameAr: 'آيس تي خوخ',
    nameEn: 'Iced Tea Peach',
    price: 10,
  },

  // Food
  {
    id: 'food-palm-muffin',
    categoryId: 'food',
    nameAr: 'بالم مافن',
    nameEn: 'Palm Muffin',
    price: 9,
  },
  {
    id: 'food-cookies',
    categoryId: 'food',
    nameAr: 'كوكيز',
    nameEn: 'Cookies',
    price: 10,
  },
  {
    id: 'food-golden-crown',
    categoryId: 'food',
    nameAr: 'جولدن كراون',
    nameEn: 'Golden Crown',
    price: 18,
  },
  {
    id: 'food-pudding',
    categoryId: 'food',
    nameAr: 'بودينغ',
    nameEn: 'Pudding',
    price: 16,
  },
  {
    id: 'food-croissant',
    categoryId: 'food',
    nameAr: 'كرواسون',
    nameEn: 'Croissant',
    price: 6,
  },
];
