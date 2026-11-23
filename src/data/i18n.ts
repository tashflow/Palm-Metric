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
    heroEyebrow: string;
    heroHeadline: string;
    heroExploreBtn: string;
    heroStoryBtn: string;
    heroPrepBadge: string;
    heroVisitBtn: string;
    shortcutAllMenu: string;
    shortcutV60: string;
    shortcutSeasonal: string;
    shortcutContact: string;
    featuredKicker: string;
    featuredTitle: string;
    featuredSubtitle: string;
    viewDetailsBtn: string;
    categoriesKicker: string;
    categoriesTitle: string;
    categoriesSubtitle: string;
    categoryItemsSuffix: string;
    fullMenuTitle: string;
    fullMenuSubtitle: string;
    storyKicker: string;
    storyTitle: string;
    storyBody: string;
    storyHighlight1: string;
    storyHighlight2: string;
    storyHighlight3: string;
    storyContactBtn: string;
    navCart: string;
    allCategories: string;
    offersTab: string;
    specialOfferBadge: string;
    seasonalTitle: string;
    seasonalSubtitle: string;
    seasonalKicker: string;
    seasonalExploreBtn: string;
    seasonalMenuBtn: string;
    menuSearchPlaceholder: string;
    clearSearchLabel: string;
    filtersBtn: string;
    clearAllFiltersBtn: string;
    sortLabel: string;
    sortDefault: string;
    sortPriceAsc: string;
    sortPriceDesc: string;
    sortNameAsc: string;
    sortNameDesc: string;
    filterOriginLabel: string;
    filterProcessLabel: string;
    filterRoastLabel: string;
    filterPriceLabel: string;
    filterMinPricePlaceholder: string;
    filterMaxPricePlaceholder: string;
    filterAvailabilityLabel: string;
    availabilityAll: string;
    availabilityInStock: string;
    availabilityOutOfStock: string;
    resultsCountLabel: string;
    emptySearchTitle: string;
    emptySearchDesc: string;
    inStockLabel: string;
    originLabel: string;
    regionLabel: string;
    processLabel: string;
    roastLabel: string;
    altitudeLabel: string;
    varietyLabel: string;
    tastingNotesLabel: string;
    brewMethodsLabel: string;
    producerLabel: string;
    coffeeProfileHeading: string;
    infoComingSoon: string;
    customizationsHeading: string;
    customizationRequiredBadge: string;
    customizationOptionalBadge: string;
    customizationLoading: string;
    customizationUnavailableNotice: string;
    customizationSelectOne: string;
    customizationSelectMin: string;
    customizationSelectMax: string;
    customizationSelectRange: string;
    customizationErrRequired: string;
    customizationErrMin: string;
    customizationErrMax: string;
    customizationErrUnavailable: string;
    basePriceLabel: string;
    addonsPriceLabel: string;
    estimatedTotalLabel: string;
    freeOptionLabel: string;
    specialInstructionsLabel: string;
    cartReviewRequiredTitle: string;
    cartReviewPriceChanged: string;
    cartReviewOptionDisabled: string;
    cartReviewItemUnavailable: string;
    cartReviewConfigDisabled: string;
    cartReviewRefreshBtn: string;
    cartReviewSubmitBlocked: string;
    payAtBranchBadge: string;
    trackPermissionDenied: string;
    errSessionRequired: string;
    errBackendUnavailable: string;
    errBackendValidationFailed: string;
    errOutOfStockCheckout: string;
    serverVerifiedNote: string;
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
    myOrdersTitle: string;
    reorderBtn: string;
    noPastOrders: string;
    enablePushBtn: string;
    pushEnabledMsg: string;
    requestCheckoutTitle: string;
    requestPickupNoticeDesc: string;
    estimatedSubtotalLabel: string;
    estimatedCheckoutTotalLabel: string;
    estimatedPriceDisclaimer: string;
    submitOrderRequestBtn: string;
    submittingOrderRequestBtn: string;
    requestSubmittedTitle: string;
    requestSubmittedSubtitle: string;
    requestReferenceLabel: string;
    requestAwaitingAdminBadge: string;
    requestSendWhatsappBtn: string;
    requestTrackStatusBtn: string;
    requestDuplicateNotice: string;
    requestSectionLabel: string;
    requestStepSubmitted: string;
    requestStepReview: string;
    requestStepVerified: string;
    requestStepOrderCreated: string;
    requestStepSubmittedHint: string;
    requestStepReviewHint: string;
    requestStepVerifiedHint: string;
    requestStepOrderCreatedHint: string;
    requestStatusPendingTitle: string;
    requestStatusReviewingTitle: string;
    requestStatusApprovedTitle: string;
    requestStatusRejectedTitle: string;
    requestStatusCancelledTitle: string;
    requestViewFinalOrderBtn: string;
    requestPendingPriceNotice: string;
    requestTypeBadge: string;
    orderTypeBadge: string;
    errInvalidItem: string;
    errInvalidQuantity: string;
    errRequestSubmitFailed: string;
    requestStatusVerifiedTitle: string;
    requestVerifiedTotalLabel: string;
    requestVerifiedBreakdownTitle: string;
    requestDiscountLabel: string;
    requestTaxLabel: string;
    navAdmin: string;
    adminDashboardTitle: string;
    adminDashboardSubtitle: string;
    adminFilterAll: string;
    adminFilterPending: string;
    adminFilterReviewing: string;
    adminFilterVerified: string;
    adminFilterRejected: string;
    adminFilterCreated: string;
    adminSearchPlaceholder: string;
    adminSortNewest: string;
    adminSortOldest: string;
    adminStartReviewBtn: string;
    adminVerifyRequestBtn: string;
    adminApprovePromoteBtn: string;
    adminRejectBtn: string;
    adminConfirmApproveTitle: string;
    adminConfirmApproveDesc: string;
    adminConfirmApproveBtn: string;
    adminCancelBtn: string;
    adminRejectReasonLabel: string;
    adminRejectReasonPlaceholder: string;
    adminRejectReasonRequiredErr: string;
    adminCatalogCheckPassed: string;
    adminCatalogCheckBlocked: string;
    adminVerificationBreakdownHeading: string;
    adminAuditTrailHeading: string;
    adminNoRequestsTitle: string;
    adminNoRequestsDesc: string;
    adminOrderCreatedBanner: string;
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
    heroEyebrow: 'الاستلام من الفرع · قهوة مختصة',
    heroHeadline: 'لحظات قهوة موزونة بدقة',
    heroExploreBtn: 'استكشف القهوة',
    heroStoryBtn: 'قصتنا',
    heroPrepBadge: 'جاهز للاستلام خلال ١٠–١٥ دقيقة',
    heroVisitBtn: 'موقع الفرع والتواصل',
    shortcutAllMenu: 'تصفح القائمة',
    shortcutV60: 'قهوة V60',
    shortcutSeasonal: 'إضاءة الموسم',
    shortcutContact: 'تواصل معنا',
    featuredKicker: 'اختيارات بالم مترك',
    featuredTitle: 'القهوة المميزة',
    featuredSubtitle: 'تشكيلة مختارة من مشروبات بالم مترك والمخبوزات الطازجة للاستلام السريع من الفرع',
    viewDetailsBtn: 'التفاصيل',
    categoriesKicker: 'أقسام القائمة',
    categoriesTitle: 'تصفح حسب الفئة',
    categoriesSubtitle: 'سبع فئات متكاملة من قهوة اليوم و V60 والإسبريسو إلى الماتشا والمخبوزات',
    categoryItemsSuffix: 'أصناف',
    fullMenuTitle: 'القائمة الكاملة',
    fullMenuSubtitle: 'اختر مشروبك أو مخبوزاتك المفضلة وخصص درجة الحرارة والملاحظات قبل الإضافة للسلة',
    storyKicker: 'عن بالم مترك',
    storyTitle: 'وجهة للقهوة المختصة والماتشا الأصيلة',
    storyBody: 'في بالم مترك نركز على دقة التحضير وجودة المكونات في كل كوب — من تقطير V60 وإسبريسو متوازن إلى الماتشا والمخبوزات الطازجة، تُحضّر كل طلبية عند الطلب لتكون جاهزة للاستلام من الفرع.',
    storyHighlight1: 'تحضير طازج عند الطلب',
    storyHighlight2: 'استلام سريع خلال ١٠–١٥ دقيقة',
    storyHighlight3: 'تقطير V60 · إسبريسو · ماتشا',
    storyContactBtn: 'زيارة الفرع والتواصل',
    navCart: 'السلة',
    allCategories: 'الكل',
    offersTab: 'العروض',
    specialOfferBadge: 'عرض خاص',
    seasonalTitle: 'إضاءة الموسم',
    seasonalSubtitle: 'اختيارات موسمية وعروض مميزة محدثة مباشرة من لوحة بالم مترك',
    seasonalKicker: 'اختيار الموسم',
    seasonalExploreBtn: 'استكشاف القسم',
    seasonalMenuBtn: 'عرض القائمة',
    menuSearchPlaceholder: 'ابحث بالاسم أو المصدر أو المعالجة أو الإيحاءات...',
    clearSearchLabel: 'مسح البحث',
    filtersBtn: 'الفلاتر',
    clearAllFiltersBtn: 'إعادة ضبط الفلاتر',
    sortLabel: 'ترتيب',
    sortDefault: 'الموصى به (الافتراضي)',
    sortPriceAsc: 'السعر: من الأقل إلى الأعلى',
    sortPriceDesc: 'السعر: من الأعلى إلى الأقل',
    sortNameAsc: 'الاسم: أ – ي',
    sortNameDesc: 'الاسم: ي – أ',
    filterOriginLabel: 'المصدر / الدولة',
    filterProcessLabel: 'طريقة المعالجة',
    filterRoastLabel: 'درجة التحميص',
    filterPriceLabel: 'نطاق السعر (ريال)',
    filterMinPricePlaceholder: 'الحد الأدنى',
    filterMaxPricePlaceholder: 'الحد الأقصى',
    filterAvailabilityLabel: 'التوفر',
    availabilityAll: 'الكل',
    availabilityInStock: 'متوفر',
    availabilityOutOfStock: 'غير متوفر',
    resultsCountLabel: 'نتيجة',
    emptySearchTitle: 'لا توجد أصناف مطابقة للبحث أو الفلاتر',
    emptySearchDesc: 'جرّب تغيير كلمات البحث أو إزالة بعض الفلاتر لاستعراض جميع أصناف بالم مترك.',
    inStockLabel: 'متوفر',
    originLabel: 'المصدر',
    regionLabel: 'المنطقة',
    processLabel: 'المعالجة',
    roastLabel: 'التحميص',
    altitudeLabel: 'الارتفاع',
    varietyLabel: 'السلالة',
    tastingNotesLabel: 'الإيحاءات',
    brewMethodsLabel: 'طرق التحضير',
    producerLabel: 'المزرعة / المنتج',
    coffeeProfileHeading: 'ملف القهوة والمواصفات',
    infoComingSoon: 'ستتوفر التفاصيل قريباً',
    customizationsHeading: 'تخصيص المشروب أو الصنف',
    customizationRequiredBadge: 'إجباري',
    customizationOptionalBadge: 'اختياري',
    customizationLoading: 'جاري تحميل خيارات التخصيص...',
    customizationUnavailableNotice: 'خيارات التخصيص الإضافية غير متاحة حالياً — يمكنك إضافة الصنف بالسعر الأساسي.',
    customizationSelectOne: 'اختر خياراً واحداً',
    customizationSelectMin: 'اختر على الأقل',
    customizationSelectMax: 'حد أقصى',
    customizationSelectRange: 'اختر من {min} إلى {max}',
    customizationErrRequired: 'يرجى اختيار أحد الخيارات المطلوبة',
    customizationErrMin: 'يرجى استيفاء الحد الأدنى للاختيارات ({min})',
    customizationErrMax: 'يمكنك اختيار {max} كحد أقصى في هذه المجموعة',
    customizationErrUnavailable: 'بعض الخيارات في هذه المجموعة غير متوفرة حالياً',
    basePriceLabel: 'السعر الأساسي',
    addonsPriceLabel: 'إضافات التخصيص',
    estimatedTotalLabel: 'الإجمالي التقديري',
    freeOptionLabel: 'مجاني',
    specialInstructionsLabel: 'ملاحظات التحضير (اختياري)',
    cartReviewRequiredTitle: 'تنبيه: تغيرت إعدادات أو أسعار هذا الصنف في القائمة',
    cartReviewPriceChanged: 'تم تحديث السعر في القائمة من {old} إلى {new} ﷼ — يرجى المراجعة قبل إرسال الطلب.',
    cartReviewOptionDisabled: 'أحد الخيارات المحددة لم يعد متاحاً لدى المتجر.',
    cartReviewItemUnavailable: 'هذا الصنف غير متوفر حالياً في القائمة.',
    cartReviewConfigDisabled: 'تم إيقاف خيارات التخصيص المخصصة لهذا الصنف.',
    cartReviewRefreshBtn: 'تحديث للسعر الحالي',
    cartReviewSubmitBlocked: 'يرجى مراجعة أو إزالة الأصناف المتغيرة في السلة قبل تأكيد الطلب.',
    payAtBranchBadge: 'الدفع عند الاستلام من الفرع',
    trackPermissionDenied: 'يمكنك تتبع الطلبات التي تم إنشاؤها من جلستك الحالية فقط.',
    errSessionRequired: 'تعذر بدء جلسة ضيف آمنة مع Firebase. يرجى المحاولة مرة أخرى.',
    errBackendUnavailable: 'خدمة التحقق من الطلبات غير متوفرة حالياً. يرجى المحاولة بعد لحظات — لم يتم إرسال طلبك بعد.',
    errBackendValidationFailed: 'تعذر التحقق من صحة الطلب أو توفر الأصناف الحالية. يرجى مراجعة السلة والمحاولة مرة أخرى.',
    errOutOfStockCheckout: 'أحد الأصناف أو خيارات التخصيص في سلتك لم يعد متوفراً. يرجى تحديث السلة.',
    serverVerifiedNote: 'يتم التحقق من الأسعار وتأكيد الطلب تلقائياً عبر الخادم الآمن بالريال السعودي',
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
    checkoutTitle: 'إتمام طلب الاستلام',
    estimatedTimeTitle: 'الوقت المتوقع للتحضير',
    estimatedTimeVal: '١٠–١٥ دقيقة',
    orderTypeTitle: 'طريقة استلام الطلب',
    pickupLabel: 'استلام من الفرع (Pickup)',
    deliveryLabel: 'توصيل (Delivery)',
    itemsInOrder: 'المنتجات المختارة',
    emptyCartTitle: 'سلتك فارغة حالياً',
    emptyCartDesc: 'أضف مشروبك المفضل أو المخبوزات من القائمة للبدء.',
    browseMenuBtn: 'تصفح القائمة',
    pickupNoticeTitle: 'الاستلام من فرع بالم مترك',
    pickupNoticeDesc: 'يُحفظ طلبك مباشرة في لوحة التحضير ويُرسل ملخصه عبر واتساب للاستلام خلال ١٠–١٥ دقيقة.',
    savedDeliveryTitle: 'تم تعبئة بياناتك من حسابك',
    editInAccount: 'تعديل الحساب',
    customerDetailsTitle: 'بيانات العميل للاستلام',
    nameLabel: 'اسم العميل',
    namePlaceholder: 'مثال: محمد العتيبي',
    phoneLabel: 'رقم الجوال',
    phonePlaceholder: '05XXXXXXXX',
    deliveryLocationLabel: 'الموقع / العنوان المحفوظ',
    deliveryLocationPlaceholder: 'ملاحظة الموقع',
    manualMapsLabel: 'أو الصق رابط خرائط جوجل يدوياً (اختياري)',
    manualMapsPlaceholder: 'https://maps.google.com/?q=...',
    notesLabel: 'ملاحظات الطلب (اختياري)',
    notesPlaceholder: 'مثال: سكر أقل، ثلج خفيف، أو وقت الوصول...',
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
    myOrdersTitle: 'طلباتي السابقة',
    reorderBtn: 'إعادة الطلب',
    noPastOrders: 'لا توجد طلبات سابقة بعد',
    enablePushBtn: 'تفعيل إشعارات الفورية للطلب',
    pushEnabledMsg: 'تم تفعيل إشعارات الطلب بنجاح',
    requestCheckoutTitle: 'إرسال طلب استلام مبدئي',
    requestPickupNoticeDesc: 'يُرسل طلبك للمراجعة من إدارة بالم مترك والتحقق من الأسعار وتوفر الأصناف قبل اعتماد الطلب وبدء التحضير.',
    estimatedSubtotalLabel: 'المجموع الفرعي التقديري (غير مؤكد)',
    estimatedCheckoutTotalLabel: 'الإجمالي التقديري (بانتظار تأكيد الإدارة)',
    estimatedPriceDisclaimer: 'الأسعار المعروضة تقديرية فقط وليست فاتورة نهائية. سيتم التحقق من السعر بالريال السعودي وتأكيد الطلب من الإدارة.',
    submitOrderRequestBtn: 'إرسال طلب مبدئي عبر واتساب',
    submittingOrderRequestBtn: 'جاري إرسال الطلب المبدئي...',
    requestSubmittedTitle: 'تم استلام طلبك المبدئي — بانتظار تأكيد الإدارة',
    requestSubmittedSubtitle: 'لم يتم اعتماد الطلب أو بدء التحضير بعد. ستقوم إدارة بالم مترك بمراجعة الأصناف وتأكيد السعر النهائي بالريال السعودي.',
    requestReferenceLabel: 'مرجع الطلب المبدئي',
    requestAwaitingAdminBadge: 'بانتظار مراجعة وتأكيد الإدارة',
    requestSendWhatsappBtn: 'إرسال ملخص الطلب المبدئي عبر واتساب',
    requestTrackStatusBtn: 'تتبع حالة الطلب المبدئي',
    requestDuplicateNotice: 'تم تسجيل هذا الطلب المبدئي مسبقاً — نعرض لك نفس المرجع لمنع التكرار.',
    requestSectionLabel: 'طلب مبدئي',
    requestStepSubmitted: 'تم الإرسال',
    requestStepReview: 'مراجعة الإدارة',
    requestStepVerified: 'تم التحقق',
    requestStepOrderCreated: 'اعتماد الطلب',
    requestStepSubmittedHint: 'وصل الطلب المبدئي',
    requestStepReviewHint: 'بانتظار التأكيد',
    requestStepVerifiedHint: 'تأكيد السعر والتوفر',
    requestStepOrderCreatedHint: 'نُقل للتحضير',
    requestStatusPendingTitle: 'تم إرسال الطلب المبدئي — بانتظار مراجعة الإدارة',
    requestStatusReviewingTitle: 'الإدارة تراجع طلبك وتتحقق من السعر',
    requestStatusApprovedTitle: 'تمت الموافقة وإنشاء الطلب النهائي!',
    requestStatusRejectedTitle: 'تعذر اعتماد الطلب المبدئي',
    requestStatusCancelledTitle: 'تم إلغاء الطلب المبدئي',
    requestViewFinalOrderBtn: 'متابعة تحضير الطلب المعتمد',
    requestPendingPriceNotice: 'السعر النهائي بالريال السعودي يُؤكد من الإدارة بعد المراجعة — القيمة التقديرية السابقة غير معتمدة للدفع.',
    requestTypeBadge: 'طلب مبدئي',
    orderTypeBadge: 'طلب مؤكد',
    errInvalidItem: 'أحد الأصناف في السلة غير صالح أو مفقود. يرجى مراجعة السلة.',
    errInvalidQuantity: 'الكمية يجب أن تكون رقماً صحيحاً بين ١ و ٩٩.',
    errRequestSubmitFailed: 'تعذر إرسال الطلب المبدئي إلى Firestore. سلتك محفوظة — يرجى المحاولة مرة أخرى.',
    requestStatusVerifiedTitle: 'تم التحقق من الأصناف والسعر — جاهز للاعتماد',
    requestVerifiedTotalLabel: 'الإجمالي النهائي المعتمد (ريال سعودي)',
    requestVerifiedBreakdownTitle: 'تفاصيل الأسعار المؤكدة من الإدارة',
    requestDiscountLabel: 'الخصم',
    requestTaxLabel: 'الضريبة',
    navAdmin: 'طلبات الإدارة',
    adminDashboardTitle: 'لوحة مراجعة واعتماد الطلبات المبدئية',
    adminDashboardSubtitle: 'تحقق من توفر الأصناف والأسعار الرسمية في Firestore قبل اعتماد وإنشاء الطلب النهائي.',
    adminFilterAll: 'الكل',
    adminFilterPending: 'قيد الانتظار',
    adminFilterReviewing: 'قيد المراجعة',
    adminFilterVerified: 'تم التحقق',
    adminFilterRejected: 'مرفوض',
    adminFilterCreated: 'تم إنشاء الطلب',
    adminSearchPlaceholder: 'ابحث بمرجع REQ أو اسم العميل أو رقم الجوال...',
    adminSortNewest: 'الأحدث أولاً',
    adminSortOldest: 'الأقدم أولاً',
    adminStartReviewBtn: 'بدء المراجعة',
    adminVerifyRequestBtn: 'التحقق من الأصناف والسعر',
    adminApprovePromoteBtn: 'اعتماد وإنشاء الطلب',
    adminRejectBtn: 'رفض الطلب',
    adminConfirmApproveTitle: 'تأكيد اعتماد وإنشاء الطلب النهائي',
    adminConfirmApproveDesc: 'سيتم احتساب السعر الرسمي النهائي بالريال السعودي داخل معاملة Firestore ذرية وإنشاء وثيقة الطلب النهائي.',
    adminConfirmApproveBtn: 'تأكيد وإنشاء الطلب الآن',
    adminCancelBtn: 'إلغاء',
    adminRejectReasonLabel: 'سبب الرفض (إلزامي)',
    adminRejectReasonPlaceholder: 'اكتب سبباً واضحاً للعميل (مثال: الصنف غير متوفر حالياً)...',
    adminRejectReasonRequiredErr: 'يرجى كتابة سبب واضح للرفض (٣ أحرف على الأقل).',
    adminCatalogCheckPassed: 'تمت مطابقة جميع الأصناف والإضافات والتوفر مع قاعدة البيانات الرسمية.',
    adminCatalogCheckBlocked: 'يوجد تعارض يمنع الاعتماد: أحد الأصناف أو الإضافات غير متوفر أو محذوف.',
    adminVerificationBreakdownHeading: 'الحسبة الرسمية المعتمدة بالهللة والريال (SAR)',
    adminAuditTrailHeading: 'سجل التدقيق الإداري',
    adminNoRequestsTitle: 'لا توجد طلبات مبدئية مطابقة',
    adminNoRequestsDesc: 'عند إرسال طلبات استلام مبدئية من تطبيق العميل ستظهر هنا مباشرة.',
    adminOrderCreatedBanner: 'تم اعتماد الطلب المبدئي وإنشاء الطلب الرسمي بنجاح',
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
    heroEyebrow: 'Branch Pickup · Specialty Coffee',
    heroHeadline: 'Measured Moments in Every Pour',
    heroExploreBtn: 'Explore Coffee',
    heroStoryBtn: 'Our Story',
    heroPrepBadge: 'Ready for pickup in 10–15 min',
    heroVisitBtn: 'Location & Info',
    shortcutAllMenu: 'Explore Menu',
    shortcutV60: 'V60 Coffee',
    shortcutSeasonal: 'Seasonal Highlights',
    shortcutContact: 'Contact Palm Metric',
    featuredKicker: 'Curated Selection',
    featuredTitle: 'Featured Coffee',
    featuredSubtitle: 'Signature pours and fresh bakes from the Palm Metric bar, prepared to order for branch pickup',
    viewDetailsBtn: 'Details',
    categoriesKicker: 'Menu Categories',
    categoriesTitle: 'Browse by Category',
    categoriesSubtitle: 'Seven distinct collections spanning Coffee of the Day, V60 pour-over, espresso, matcha, and fresh food',
    categoryItemsSuffix: 'items',
    fullMenuTitle: 'The Complete Menu',
    fullMenuSubtitle: 'Filter by category, select hot or cold, and customize notes before adding to your pickup bag',
    storyKicker: 'Our Philosophy',
    storyTitle: 'A Destination for Measured Specialty Coffee',
    storyBody: 'At Palm Metric, craft begins with precision — balancing clean V60 filter brews, structured espresso, ceremonial matcha, and warm bakery pairings prepared to order for seamless branch pickup.',
    storyHighlight1: 'Crafted Fresh to Order',
    storyHighlight2: 'Ready for Pickup in 10–15 Min',
    storyHighlight3: 'V60 · Espresso · Matcha',
    storyContactBtn: 'Visit & Contact Branch',
    navCart: 'Cart',
    allCategories: 'All',
    offersTab: 'Offers',
    specialOfferBadge: 'Offer',
    seasonalTitle: 'Seasonal Spotlight',
    seasonalSubtitle: 'Featured seasonal pours and curated highlights synced live from our billboard showcase',
    seasonalKicker: 'Seasonal Spotlight',
    seasonalExploreBtn: 'Explore Category',
    seasonalMenuBtn: 'Browse Selection',
    menuSearchPlaceholder: 'Search coffee, Arabic name, origin, process, or notes...',
    clearSearchLabel: 'Clear search',
    filtersBtn: 'Filters',
    clearAllFiltersBtn: 'Clear All',
    sortLabel: 'Sort',
    sortDefault: 'Recommended (Default)',
    sortPriceAsc: 'Price: Low to High',
    sortPriceDesc: 'Price: High to Low',
    sortNameAsc: 'Name: A–Z',
    sortNameDesc: 'Name: Z–A',
    filterOriginLabel: 'Origin',
    filterProcessLabel: 'Processing Method',
    filterRoastLabel: 'Roast Level',
    filterPriceLabel: 'Price Range (SAR)',
    filterMinPricePlaceholder: 'Min',
    filterMaxPricePlaceholder: 'Max',
    filterAvailabilityLabel: 'Availability',
    availabilityAll: 'All',
    availabilityInStock: 'In Stock',
    availabilityOutOfStock: 'Out of Stock',
    resultsCountLabel: 'results',
    emptySearchTitle: 'No matching coffee or items found',
    emptySearchDesc: 'Try adjusting your search keywords or clearing active filters to explore the full menu.',
    inStockLabel: 'In Stock',
    originLabel: 'Origin',
    regionLabel: 'Region',
    processLabel: 'Processing Method',
    roastLabel: 'Roast Level',
    altitudeLabel: 'Altitude',
    varietyLabel: 'Variety',
    tastingNotesLabel: 'Tasting Notes',
    brewMethodsLabel: 'Brew Methods',
    producerLabel: 'Producer',
    coffeeProfileHeading: 'Coffee Profile & Specifications',
    infoComingSoon: 'Information coming soon',
    customizationsHeading: 'Customize Your Order',
    customizationRequiredBadge: 'Required',
    customizationOptionalBadge: 'Optional',
    customizationLoading: 'Loading customization options...',
    customizationUnavailableNotice: 'Additional customization options are temporarily unavailable — base item ordering remains active.',
    customizationSelectOne: 'Choose 1',
    customizationSelectMin: 'Select at least',
    customizationSelectMax: 'Up to',
    customizationSelectRange: 'Choose {min}–{max}',
    customizationErrRequired: 'Please select an option to continue',
    customizationErrMin: 'Please select at least {min} option(s)',
    customizationErrMax: 'You can select up to {max} option(s)',
    customizationErrUnavailable: 'This required group currently has no enabled options',
    basePriceLabel: 'Base Price',
    addonsPriceLabel: 'Customizations',
    estimatedTotalLabel: 'Estimated Total',
    freeOptionLabel: 'Included',
    specialInstructionsLabel: 'Special Instructions (Optional)',
    cartReviewRequiredTitle: 'Review needed: menu configuration or price updated',
    cartReviewPriceChanged: 'Updated in menu from {old} to {new} SAR — please review before placing your order.',
    cartReviewOptionDisabled: 'One of your selected options is no longer active in the menu.',
    cartReviewItemUnavailable: 'This item is currently unavailable in the menu.',
    cartReviewConfigDisabled: 'Customizations for this item were disabled by the store.',
    cartReviewRefreshBtn: 'Update to Live Price',
    cartReviewSubmitBlocked: 'Please review or remove updated items in your cart before placing the order.',
    payAtBranchBadge: 'Pay upon pickup at branch',
    trackPermissionDenied: 'You can only view orders placed from your active guest or signed-in session.',
    errSessionRequired: 'Could not start a secure guest session with Firebase. Please try again.',
    errBackendUnavailable: 'The secure order verification service is currently unavailable. Your cart is preserved — please try again shortly.',
    errBackendValidationFailed: 'Could not verify current catalog prices or selections for this order. Please review your cart and try again.',
    errOutOfStockCheckout: 'One or more items or customization options in your cart are currently unavailable.',
    serverVerifiedNote: 'Prices and pickup availability are verified securely on the server in SAR',
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
    checkoutTitle: 'Pickup Checkout',
    estimatedTimeTitle: 'Estimated preparation time',
    estimatedTimeVal: '10–15 min',
    orderTypeTitle: 'Order Type',
    pickupLabel: 'Branch Pickup (استلام)',
    deliveryLabel: 'Delivery (توصيل)',
    itemsInOrder: 'Your Items',
    emptyCartTitle: 'Your cart is empty',
    emptyCartDesc: 'Add your favorite coffee, matcha, or pastry from the menu to get started.',
    browseMenuBtn: 'Browse Menu',
    pickupNoticeTitle: 'Branch Pickup Order',
    pickupNoticeDesc: 'Your order is saved to the live dashboard and sent via WhatsApp for pickup in 10–15 min.',
    savedDeliveryTitle: 'Pre-filled from your account',
    editInAccount: 'View Account',
    customerDetailsTitle: 'Customer Details for Pickup',
    nameLabel: 'Customer Name',
    namePlaceholder: 'e.g., Sarah Al-Harbi',
    phoneLabel: 'Mobile Number',
    phonePlaceholder: '05XXXXXXXX',
    deliveryLocationLabel: 'Saved Location / Note',
    deliveryLocationPlaceholder: 'Saved note',
    manualMapsLabel: 'Or paste a Google Maps link manually (Optional)',
    manualMapsPlaceholder: 'https://maps.google.com/?q=...',
    notesLabel: 'Order Notes (Optional)',
    notesPlaceholder: 'Less sugar, light ice, pickup arrival note...',
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
    myOrdersTitle: 'My Past Orders',
    reorderBtn: 'Reorder',
    noPastOrders: 'No past orders yet',
    enablePushBtn: 'Enable Order Push Notifications',
    pushEnabledMsg: 'Push notifications enabled successfully',
    requestCheckoutTitle: 'Pickup Order Request',
    requestPickupNoticeDesc: 'Your order request is submitted for Admin review and price verification before preparation begins.',
    estimatedSubtotalLabel: 'Estimated Subtotal (Unverified)',
    estimatedCheckoutTotalLabel: 'Estimated Total (Pending Admin Verification)',
    estimatedPriceDisclaimer: 'Prices shown are estimates only and not a confirmed invoice. Final SAR prices and availability are verified by Palm Metric Admin.',
    submitOrderRequestBtn: 'Submit Order Request',
    submittingOrderRequestBtn: 'Submitting Order Request...',
    requestSubmittedTitle: 'Order Request Submitted — Awaiting Admin Confirmation',
    requestSubmittedSubtitle: 'Your order is not confirmed or in preparation yet. Palm Metric Admin will review your items and verify the final SAR total.',
    requestReferenceLabel: 'Request Reference',
    requestAwaitingAdminBadge: 'Awaiting Admin Verification',
    requestSendWhatsappBtn: 'Send Order Request via WhatsApp',
    requestTrackStatusBtn: 'Track Request Status',
    requestDuplicateNotice: 'This order request was already submitted — showing your existing reference to prevent duplicates.',
    requestSectionLabel: 'Order Request',
    requestStepSubmitted: 'Submitted',
    requestStepReview: 'Admin Review',
    requestStepVerified: 'Verified',
    requestStepOrderCreated: 'Order Created',
    requestStepSubmittedHint: 'Request logged',
    requestStepReviewHint: 'Awaiting Admin',
    requestStepVerifiedHint: 'Price checked',
    requestStepOrderCreatedHint: 'Final order live',
    requestStatusPendingTitle: 'Request submitted — Awaiting Admin review',
    requestStatusReviewingTitle: 'Admin is reviewing your request',
    requestStatusApprovedTitle: 'Verified — Final order created!',
    requestStatusRejectedTitle: 'Order request could not be approved',
    requestStatusCancelledTitle: 'Order request cancelled',
    requestViewFinalOrderBtn: 'Track Final Confirmed Order',
    requestPendingPriceNotice: 'Final payable total in SAR will be verified by Palm Metric Admin upon approval.',
    requestTypeBadge: 'Request',
    orderTypeBadge: 'Confirmed Order',
    errInvalidItem: 'One or more items in your cart has an invalid or missing item ID.',
    errInvalidQuantity: 'Item quantity must be a whole number between 1 and 99.',
    errRequestSubmitFailed: 'Could not submit your order request. Your cart is preserved — please try again.',
    requestStatusVerifiedTitle: 'Items & price verified — Ready for final order creation',
    requestVerifiedTotalLabel: 'Verified Final Order Total (SAR)',
    requestVerifiedBreakdownTitle: 'Admin-Verified Price Breakdown',
    requestDiscountLabel: 'Discount',
    requestTaxLabel: 'Tax',
    navAdmin: 'Admin Requests',
    adminDashboardTitle: 'Admin Order Request Approval & Verification',
    adminDashboardSubtitle: 'Verify live Firestore menu availability, customizations, and authoritative SAR totals before promoting to /orders.',
    adminFilterAll: 'All',
    adminFilterPending: 'Pending Review',
    adminFilterReviewing: 'Under Review',
    adminFilterVerified: 'Verified',
    adminFilterRejected: 'Rejected',
    adminFilterCreated: 'Order Created',
    adminSearchPlaceholder: 'Search by REQ ref, customer name, or phone...',
    adminSortNewest: 'Newest First',
    adminSortOldest: 'Oldest First',
    adminStartReviewBtn: 'Start Review',
    adminVerifyRequestBtn: 'Verify Items & Prices',
    adminApprovePromoteBtn: 'Approve & Create Order',
    adminRejectBtn: 'Reject Request',
    adminConfirmApproveTitle: 'Confirm Final Order Approval & Creation',
    adminConfirmApproveDesc: 'This runs an atomic Firestore transaction that re-verifies catalog availability/prices, creates the official /orders record, and updates this request.',
    adminConfirmApproveBtn: 'Confirm & Create Order',
    adminCancelBtn: 'Cancel',
    adminRejectReasonLabel: 'Rejection Reason (Required)',
    adminRejectReasonPlaceholder: 'Explain clearly why this request cannot be fulfilled...',
    adminRejectReasonRequiredErr: 'Please provide a clear rejection reason (at least 3 characters).',
    adminCatalogCheckPassed: 'All items, stock flags, and customizations verified against live Firestore catalog.',
    adminCatalogCheckBlocked: 'Verification blocked: one or more items or options are missing, disabled, or out of stock.',
    adminVerificationBreakdownHeading: 'Authoritative SAR Breakdown (Halala-Exact)',
    adminAuditTrailHeading: 'Admin Audit Trail',
    adminNoRequestsTitle: 'No matching order requests',
    adminNoRequestsDesc: 'Incoming customer pickup order requests will appear here in real time.',
    adminOrderCreatedBanner: 'Request approved and promoted to official order',
  },
};
