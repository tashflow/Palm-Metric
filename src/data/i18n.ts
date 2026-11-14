import type { Language } from '../types';

export const COPY: Record<
  Language,
  {
    brandName: string;
    brandTagline: string;
    navMenu: string;
    navTrack: string;
    navInfo: string;
    navLogin: string;
    langSwitch: string;
    heroGreeting: string;
    heroPrepBadge: string;
    heroVisitBtn: string;
    allCategories: string;
    offersTab: string;
    specialOfferBadge: string;
    seasonalTitle: string;
    seasonalSubtitle: string;
    seasonalKicker: string;
    seasonalExploreBtn: string;
    seasonalMenuBtn: string;
    addBtn: string;
    customizeBtn: string;
    outOfStockLabel: string;
    unavailableBtn: string;
    hotLabel: string;
    coldLabel: string;
    currency: string;
    itemSingular: string;
    itemPlural: string;
    viewCartCheckout: string;
    backToMenu: string;
    checkoutTitle: string;
    estimatedTimeTitle: string;
    estimatedTimeVal: string;
    orderTypeTitle: string;
    pickupLabel: string;
    deliveryLabel: string;
    itemsInOrder: string;
    emptyCartTitle: string;
    emptyCartDesc: string;
    browseMenuBtn: string;
    pickupNoticeTitle: string;
    pickupNoticeDesc: string;
    savedDeliveryTitle: string;
    editInAccount: string;
    customerDetailsTitle: string;
    nameLabel: string;
    namePlaceholder: string;
    phoneLabel: string;
    phonePlaceholder: string;
    deliveryLocationLabel: string;
    deliveryLocationPlaceholder: string;
    manualMapsLabel: string;
    manualMapsPlaceholder: string;
    notesLabel: string;
    notesPlaceholder: string;
    getCurrentLocationBtn: string;
    locatingBtn: string;
    locationCaptured: string;
    openMapPreview: string;
    locationErrorDenied: string;
    locationErrorUnsupported: string;
    subtotalLabel: string;
    totalLabel: string;
    cashOnDeliveryBadge: string;
    placeOrderWhatsappBtn: string;
    submittingOrderBtn: string;
    errEmptyCart: string;
    errNameRequired: string;
    errPhoneRequired: string;
    errDeliveryLocationRequired: string;
    loginTab: string;
    registerTab: string;
    passwordLabel: string;
    passwordPlaceholder: string;
    loginSubmit: string;
    registerSubmit: string;
    errPhonePasswordRequired: string;
    errInvalidCredentials: string;
    errPhoneExists: string;
    errAllFieldsRequired: string;
    accountWelcome: string;
    savedProfileHeading: string;
    noMapSaved: string;
    updateLocationBtn: string;
    logoutBtn: string;
    infoTitle: string;
    infoSubtitle: string;
    locationCardTitle: string;
    locationCardDesc: string;
    openGoogleMaps: string;
    contactCardTitle: string;
    phoneRow: string;
    whatsappRow: string;
    emailRow: string;
    socialCardTitle: string;
    trackTitle: string;
    trackLookupPlaceholder: string;
    trackLookupBtn: string;
    noActiveOrderTitle: string;
    noActiveOrderDesc: string;
    startOrderBtn: string;
    orderNotFoundTitle: string;
    orderNotFoundDesc: string;
    openWhatsappSummaryBtn: string;
    statusPendingTitle: string;
    statusPreparingTitle: string;
    statusReadyTitle: string;
    statusCompletedTitle: string;
    statusCancelledTitle: string;
    stepPending: string;
    stepPreparing: string;
    stepReady: string;
    stepCompleted: string;
    stepPendingHint: string;
    stepPreparingHint: string;
    stepReadyHint: string;
    stepCompletedHint: string;
    menuEmptyTitle: string;
    menuEmptyDesc: string;
    seedMenuBtn: string;
    seedingMenuBtn: string;
    adminSignInSeedBtn: string;
    storeClosedBanner: string;
    reportCardTitle: string;
    reportTypeLabel: string;
    reportTypeFeedback: string;
    reportTypeIssue: string;
    reportTitleLabel: string;
    reportTitlePlaceholder: string;
    reportMessageLabel: string;
    reportMessagePlaceholder: string;
    reportSubmitBtn: string;
    reportSendingBtn: string;
    reportSentMsg: string;
    footerNote: string;
  }
> = {
  ar: {
    brandName: 'بالم مترك',
    brandTagline: 'قهوة مختصة، ماتشا أصلية، ومخبوزات طازجة تُحضّر لحظة بلحظة',
    navMenu: 'القائمة',
    navTrack: 'تتبع الطلب',
    navInfo: 'عن الفرع',
    navLogin: 'دخول',
    langSwitch: 'EN',
    heroGreeting: 'أهلاً بك في بالم مترك',
    heroPrepBadge: 'التحضير خلال ١٠–١٥ دقيقة',
    heroVisitBtn: 'موقع الفرع والتواصل',
    allCategories: 'الكل',
    offersTab: 'العروض',
    specialOfferBadge: 'عرض خاص',
    seasonalTitle: 'إضاءة الموسم',
    seasonalSubtitle: 'اختيارات موسمية وعروض مميزة محدثة مباشرة من لوحة بالم مترك',
    seasonalKicker: 'اختيار الموسم',
    seasonalExploreBtn: 'استكشاف القسم',
    seasonalMenuBtn: 'عرض القائمة',
    addBtn: 'إضافة',
    customizeBtn: 'تخصيص',
    outOfStockLabel: 'غير متوفر حالياً',
    unavailableBtn: 'نفذت الكمية',
    hotLabel: 'حار',
    coldLabel: 'بارد',
    currency: '﷼',
    itemSingular: 'منتج',
    itemPlural: 'منتجات',
    viewCartCheckout: 'عرض السلة وإتمام الطلب',
    backToMenu: 'العودة للقائمة',
    checkoutTitle: 'إتمام الطلب',
    estimatedTimeTitle: 'الوقت المتوقع للتحضير',
    estimatedTimeVal: '١٠–١٥ دقيقة',
    orderTypeTitle: 'طريقة استلام الطلب',
    pickupLabel: 'استلام (Pickup)',
    deliveryLabel: 'توصيل (Delivery)',
    itemsInOrder: 'المنتجات المختارة',
    emptyCartTitle: 'سلتك فارغة حالياً',
    emptyCartDesc: 'أضف مشروبك المفضل أو المخبوزات من القائمة للبدء.',
    browseMenuBtn: 'تصفح القائمة',
    pickupNoticeTitle: 'تأكيد الاستلام من الفرع',
    pickupNoticeDesc: 'سيتم حفظ طلبك في لوحة المتابعة وتأكيده عبر واتساب للاستلام خلال ١٠–١٥ دقيقة.',
    savedDeliveryTitle: 'تم تعبئة بياناتك من حسابك',
    editInAccount: 'تعديل الحساب',
    customerDetailsTitle: 'بيانات العميل وموقع التوصيل',
    nameLabel: 'اسم العميل',
    namePlaceholder: 'مثال: محمد العتيبي',
    phoneLabel: 'رقم الجوال',
    phonePlaceholder: '05XXXXXXXX',
    deliveryLocationLabel: 'موقع التوصيل / العنوان',
    deliveryLocationPlaceholder: 'الحي، الشارع، رقم المبنى أو ملاحظة الوصول',
    manualMapsLabel: 'أو الصق رابط خرائط جوجل يدوياً (اختياري)',
    manualMapsPlaceholder: 'https://maps.google.com/?q=...',
    notesLabel: 'ملاحظات إضافية (اختياري)',
    notesPlaceholder: 'مثال: سكر أقل، ثلج خفيف، أو تعليمات التوصيل...',
    getCurrentLocationBtn: 'تحديد موقعي الحالي (GPS)',
    locatingBtn: 'جاري تحديد موقعك...',
    locationCaptured: 'تم توليد رابط خرائط جوجل بنجاح',
    openMapPreview: 'معاينة الرابط في خرائط جوجل',
    locationErrorDenied: 'تعذر الوصول للموقع. يرجى السماح بصلاحية الموقع أو لصق الرابط يدوياً.',
    locationErrorUnsupported: 'متصفحك لا يدعم تحديد الموقع. يمكنك لصق رابط خرائط جوجل يدوياً.',
    subtotalLabel: 'المجموع الفرعي',
    totalLabel: 'الإجمالي',
    cashOnDeliveryBadge: 'الدفع عند الاستلام (Cash on delivery)',
    placeOrderWhatsappBtn: 'إرسال الطلب عبر واتساب',
    submittingOrderBtn: 'جاري حفظ وإرسال الطلب...',
    errEmptyCart: 'السلة فارغة. أضف منتجات أولاً.',
    errNameRequired: 'يرجى كتابة اسم العميل.',
    errPhoneRequired: 'يرجى إدخال رقم الجوال (٤ أرقام على الأقل).',
    errDeliveryLocationRequired: 'يرجى كتابة موقع التوصيل أو تحديد/لصق رابط الخريطة.',
    loginTab: 'تسجيل الدخول',
    registerTab: 'حساب جديد',
    passwordLabel: 'كلمة المرور',
    passwordPlaceholder: '••••••',
    loginSubmit: 'دخول إلى حسابي',
    registerSubmit: 'إنشاء الحساب وحفظ العنوان',
    errPhonePasswordRequired: 'يرجى إدخال رقم الجوال وكلمة المرور.',
    errInvalidCredentials: 'رقم الجوال أو كلمة المرور غير صحيحة.',
    errPhoneExists: 'رقم الجوال مسجل مسبقاً. يمكنك تسجيل الدخول.',
    errAllFieldsRequired: 'يرجى تعبئة الاسم، الجوال، كلمة المرور، والعنوان.',
    accountWelcome: 'مرحباً بك',
    savedProfileHeading: 'بيانات التوصيل المسجلة',
    noMapSaved: 'لم يتم حفظ موقع على الخريطة بعد',
    updateLocationBtn: 'تحديث موقعي على الخريطة',
    logoutBtn: 'تسجيل الخروج',
    infoTitle: 'معلومات فرع بالم مترك',
    infoSubtitle: 'سعداء بخدمتكم يومياً — اطلب عبر الواتساب أو تفضل بزيارتنا',
    locationCardTitle: 'موقعنا على الخريطة',
    locationCardDesc: 'اضغط لفتح موقع بالم مترك مباشرة في خرائط جوجل',
    openGoogleMaps: 'فتح الموقع في خرائط جوجل',
    contactCardTitle: 'التواصل المباشر',
    phoneRow: 'الاتصال الهاتفي',
    whatsappRow: 'طلب واستفسار عبر واتساب',
    emailRow: 'البريد الإلكتروني',
    socialCardTitle: 'تابعنا على منصات التواصل',
    trackTitle: 'تتبع الطلب مباشرة',
    trackLookupPlaceholder: 'أدخل رقم مرجع الطلب (Order ID)',
    trackLookupBtn: 'بحث',
    noActiveOrderTitle: 'لا يوجد طلب نشط حالياً',
    noActiveOrderDesc: 'أرسل طلبك من القائمة لمتابعة حالته مباشرة لحظة بلحظة من الانتظار حتى الاكتمال.',
    startOrderBtn: 'اطلب الآن',
    orderNotFoundTitle: 'لم يتم العثور على الطلب',
    orderNotFoundDesc: 'تأكد من رقم الطلب وحاول مرة أخرى.',
    openWhatsappSummaryBtn: 'فتح ملخص الطلب في واتساب',
    statusPendingTitle: 'تم استلام الطلب — في انتظار التأكيد',
    statusPreparingTitle: 'جاري تحضير طلبك الآن',
    statusReadyTitle: 'طلبك جاهز الآن!',
    statusCompletedTitle: 'تم تسليم الطلب بنجاح',
    statusCancelledTitle: 'تم إلغاء الطلب',
    stepPending: 'قيد الانتظار',
    stepPreparing: 'قيد التحضير',
    stepReady: 'جاهز',
    stepCompleted: 'مكتمل',
    stepPendingHint: 'وصل للفرع',
    stepPreparingHint: 'يُحضّر الآن',
    stepReadyHint: 'جاهز للاستلام',
    stepCompletedHint: 'تم التسليم',
    menuEmptyTitle: 'القائمة متزامنة مع لوحة الإدارة',
    menuEmptyDesc: 'لا توجد منتجات منشورة في قاعدة البيانات بعد. أي منتجات أو عروض يضيفها الأدمن ستظهر هنا فوراً.',
    seedMenuBtn: 'نشر قائمة بالم مترك إلى Firestore',
    seedingMenuBtn: 'جاري النشر...',
    adminSignInSeedBtn: 'تسجيل دخول الأدمن لنشر القائمة المبدئية',
    storeClosedBanner: 'المتجر مغلق حالياً مؤقتاً — سنعاود استقبال الطلبات قريباً',
    reportCardTitle: 'إرسال ملاحظة أو بلاغ لإدارة المتجر',
    reportTypeLabel: 'نوع التقرير',
    reportTypeFeedback: 'اقتراح / ملاحظة',
    reportTypeIssue: 'بلاغ مشكلة',
    reportTitleLabel: 'العنوان',
    reportTitlePlaceholder: 'مثال: اقتراح مشروب أو ملاحظة على الطلب',
    reportMessageLabel: 'التفاصيل',
    reportMessagePlaceholder: 'اكتب رسالتك لتصل مباشرة إلى لوحة Palm Metric Admin...',
    reportSubmitBtn: 'إرسال إلى الإدارة',
    reportSendingBtn: 'جاري الإرسال...',
    reportSentMsg: 'تم إرسال التقرير إلى لوحة Palm Metric Admin بنجاح.',
    footerNote: 'بالم مترك · Palm Metric • Powered By Tashflow',
  },
  en: {
    brandName: 'Palm Metric',
    brandTagline: 'Specialty coffee, ceremonial matcha & fresh bakes made to order',
    navMenu: 'Menu',
    navTrack: 'Track Order',
    navInfo: 'Info',
    navLogin: 'Login',
    langSwitch: 'عربي',
    heroGreeting: 'Welcome to Palm Metric',
    heroPrepBadge: 'Ready in 10–15 min',
    heroVisitBtn: 'Location & Info',
    allCategories: 'All',
    offersTab: 'Offers',
    specialOfferBadge: 'Offer',
    seasonalTitle: 'Seasonal Spotlight',
    seasonalSubtitle: 'Featured seasonal pours and curated highlights synced live from our billboard showcase',
    seasonalKicker: 'Seasonal Spotlight',
    seasonalExploreBtn: 'Explore Category',
    seasonalMenuBtn: 'Browse Selection',
    addBtn: 'Add',
    customizeBtn: 'Customize',
    outOfStockLabel: 'Out of Stock',
    unavailableBtn: 'Unavailable',
    hotLabel: 'Hot',
    coldLabel: 'Cold',
    currency: '﷼',
    itemSingular: 'item',
    itemPlural: 'items',
    viewCartCheckout: 'View Cart & Checkout',
    backToMenu: 'Back to Menu',
    checkoutTitle: 'Checkout',
    estimatedTimeTitle: 'Estimated preparation time',
    estimatedTimeVal: '10–15 min',
    orderTypeTitle: 'Order Type',
    pickupLabel: 'Pickup (استلام)',
    deliveryLabel: 'Delivery (توصيل)',
    itemsInOrder: 'Your Items',
    emptyCartTitle: 'Your cart is empty',
    emptyCartDesc: 'Add your favorite coffee, matcha, or pastry from the menu to get started.',
    browseMenuBtn: 'Browse Menu',
    pickupNoticeTitle: 'Pickup Confirmation',
    pickupNoticeDesc: 'Your order is saved to the live dashboard and sent via WhatsApp for pickup in 10–15 min.',
    savedDeliveryTitle: 'Pre-filled from your account',
    editInAccount: 'View Account',
    customerDetailsTitle: 'Customer & Delivery Details',
    nameLabel: 'Customer Name',
    namePlaceholder: 'e.g., Sarah Al-Harbi',
    phoneLabel: 'Mobile Number',
    phonePlaceholder: '05XXXXXXXX',
    deliveryLocationLabel: 'Delivery Location / Address',
    deliveryLocationPlaceholder: 'District, street, building, or drop-off note',
    manualMapsLabel: 'Or paste a Google Maps link manually (Optional)',
    manualMapsPlaceholder: 'https://maps.google.com/?q=...',
    notesLabel: 'Notes (Optional)',
    notesPlaceholder: 'Less sugar, light ice, gate code, etc.',
    getCurrentLocationBtn: 'Get Current Location',
    locatingBtn: 'Getting your location...',
    locationCaptured: 'Google Maps link generated',
    openMapPreview: 'Open Google Maps link',
    locationErrorDenied: 'Location permission denied. Please allow GPS or paste a Maps link manually.',
    locationErrorUnsupported: 'Geolocation is not supported. Please paste a Google Maps link manually.',
    subtotalLabel: 'Subtotal',
    totalLabel: 'Total',
    cashOnDeliveryBadge: 'Cash on delivery',
    placeOrderWhatsappBtn: 'Place Order via WhatsApp',
    submittingOrderBtn: 'Saving & Opening WhatsApp...',
    errEmptyCart: 'Your cart is empty. Please add items first.',
    errNameRequired: 'Please enter the customer name.',
    errPhoneRequired: 'Please enter a valid mobile number (at least 4 digits).',
    errDeliveryLocationRequired: 'Please enter your delivery location or attach/paste a Google Maps link.',
    loginTab: 'Login',
    registerTab: 'Create Account',
    passwordLabel: 'Password',
    passwordPlaceholder: '••••••',
    loginSubmit: 'Sign In',
    registerSubmit: 'Create Account & Save Address',
    errPhonePasswordRequired: 'Please enter both phone number and password.',
    errInvalidCredentials: 'Invalid phone number or password.',
    errPhoneExists: 'An account with this phone number already exists.',
    errAllFieldsRequired: 'Please fill in Name, Phone, Password, and Delivery Address.',
    accountWelcome: 'Welcome back',
    savedProfileHeading: 'Saved Profile & Delivery Address',
    noMapSaved: 'No map pin saved yet',
    updateLocationBtn: 'Update my location on the map',
    logoutBtn: 'Logout',
    infoTitle: 'Palm Metric Info & Location',
    infoSubtitle: 'Order via WhatsApp or visit us in person',
    locationCardTitle: 'Store Location',
    locationCardDesc: 'Tap to open Palm Metric directly in Google Maps',
    openGoogleMaps: 'Open in Google Maps',
    contactCardTitle: 'Direct Contact',
    phoneRow: 'Phone Call',
    whatsappRow: 'WhatsApp Orders',
    emailRow: 'Email',
    socialCardTitle: 'Follow Us',
    trackTitle: 'Live Order Tracking',
    trackLookupPlaceholder: 'Enter Firestore Order ID',
    trackLookupBtn: 'Find',
    noActiveOrderTitle: 'No active order yet',
    noActiveOrderDesc: 'Place an order from the menu to watch its status update live from Pending to Completed.',
    startOrderBtn: 'Start an Order',
    orderNotFoundTitle: 'Order not found',
    orderNotFoundDesc: 'We could not find an order matching that ID.',
    openWhatsappSummaryBtn: 'Open Order Summary in WhatsApp',
    statusPendingTitle: 'Order received — Pending confirmation',
    statusPreparingTitle: 'Preparing your order now',
    statusReadyTitle: 'Your order is Ready!',
    statusCompletedTitle: 'Order Completed — enjoy',
    statusCancelledTitle: 'Order was cancelled',
    stepPending: 'Pending',
    stepPreparing: 'Preparing',
    stepReady: 'Ready',
    stepCompleted: 'Completed',
    stepPendingHint: 'Received',
    stepPreparingHint: 'In progress',
    stepReadyHint: 'Ready now',
    stepCompletedHint: 'Finished',
    menuEmptyTitle: 'Synced with Palm Metric Admin App',
    menuEmptyDesc: 'No menu items are published in Firestore yet. Any items or billboards added in your Admin App will appear here in real time.',
    seedMenuBtn: 'Publish Palm Metric Menu to Firestore',
    seedingMenuBtn: 'Publishing...',
    adminSignInSeedBtn: 'Admin Sign-In to Seed Palm Metric Menu',
    storeClosedBanner: 'Store is temporarily closed — back taking orders shortly',
    reportCardTitle: 'Send Feedback or Report to Palm Metric Admin',
    reportTypeLabel: 'Report Type',
    reportTypeFeedback: 'Feedback',
    reportTypeIssue: 'Issue Report',
    reportTitleLabel: 'Subject',
    reportTitlePlaceholder: 'e.g., Menu suggestion or delivery note',
    reportMessageLabel: 'Details',
    reportMessagePlaceholder: 'Write your message to send straight to Palm Metric Admin...',
    reportSubmitBtn: 'Send Report to Admin',
    reportSendingBtn: 'Sending...',
    reportSentMsg: 'Report sent to Palm Metric Admin successfully.',
    footerNote: 'Palm Metric • Powered By Tashflow',
  },
};
