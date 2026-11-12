/**
 * Strings for the MASAR company screens (Phase 6a). English follows Appendix C: sentence case, verb-first buttons, no greeting titles.
 * Arabic is a DRAFT for the named reviewer (O1/D10).
 */
export const J6 = {
  en: {
    routes: 'Routes', routesText: "Your company's travel corridors and their stops.", addRoute: 'Add a route', route: 'Route', origin: 'Origin', destination: 'Destination', status: 'Status', manage: 'Manage',
    edit: 'Edit', view: 'View', noRoutes: 'No routes yet', noRoutesText: 'Add a route to start scheduling trips.',
    fleet: 'Buses', fleetText: 'Vehicles, registration details and seating capacity.', vehicle: 'Vehicle', seats: 'Seats', update: 'Update', busFallback: 'Vehicle', noBuses: 'No buses yet', noBusesText: 'Add a bus with the form.',
    drivers: 'Drivers', driversText: 'Contact details, licence records and availability.', driver: 'Driver', phone: 'Phone', licence: 'Licence', licenceExpiry: 'Licence expiry', login: 'Login',
    noDrivers: 'No drivers yet', noDriversText: 'Add a driver with the form.',
    customers: 'Customers', customersText: 'People who booked with your company. Search by name, phone, email or student number.', searchCustomers: 'Search customers', search: 'Search', clearSearch: 'Clear search',
    name: 'Name', email: 'Email', university: 'University', since: 'Since', noCustomers: 'No customers yet', noCustomersText: 'Customers appear here after their first booking.',
    noMatch: 'No matching customers', noMatchText: 'Try a different name, phone or email.', count: (n: string) => `${n} customers`,
  },
  ar: {
    routes: 'المسارات', routesText: 'خطوط السفر الخاصة بشركتك ومحطاتها.', addRoute: 'إضافة مسار', route: 'المسار', origin: 'من', destination: 'إلى', status: 'الحالة', manage: 'إدارة',
    edit: 'تعديل', view: 'عرض', noRoutes: 'لا توجد مسارات بعد', noRoutesText: 'أضف مساراً لتبدأ جدولة الرحلات.',
    fleet: 'الحافلات', fleetText: 'المركبات وبيانات التسجيل وعدد المقاعد.', vehicle: 'المركبة', seats: 'المقاعد', update: 'تحديث', busFallback: 'مركبة', noBuses: 'لا توجد حافلات بعد', noBusesText: 'أضف حافلة من النموذج.',
    drivers: 'السائقون', driversText: 'بيانات الاتصال وسجلات الرخص والتوافر.', driver: 'السائق', phone: 'الهاتف', licence: 'الرخصة', licenceExpiry: 'انتهاء الرخصة', login: 'الدخول',
    noDrivers: 'لا يوجد سائقون بعد', noDriversText: 'أضف سائقاً من النموذج.',
    customers: 'العملاء', customersText: 'من حجزوا لدى شركتك. ابحث بالاسم أو الهاتف أو البريد أو الرقم الجامعي.', searchCustomers: 'بحث في العملاء', search: 'بحث', clearSearch: 'مسح البحث',
    name: 'الاسم', email: 'البريد', university: 'الجامعة', since: 'منذ', noCustomers: 'لا يوجد عملاء بعد', noCustomersText: 'يظهر العملاء هنا بعد أول حجز.',
    noMatch: 'لا يوجد عملاء مطابقون', noMatchText: 'جرّب اسماً أو هاتفاً أو بريداً مختلفاً.', count: (n: string) => `${n} عميل`,
  },
} as const;
