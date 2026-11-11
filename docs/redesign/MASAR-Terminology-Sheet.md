# MASAR copy and terminology sheet (Phase 0)

Generated from the code on 12 Nov 2026 by scanning every `.ts/.tsx` file under `src` (tests excluded) for English and Arabic pairs.

**Status: NOT APPROVED.** Plan D10: this sheet needs the named Arabic reviewer's signature. The Arabic below is what the code contains today. Most of it is unreviewed.

## How to review
- Fill **Decision**: `OK` or `Change`. When `Change`, write the corrected Arabic in **Reviewed Arabic**.
- A row flagged `NO ARABIC` shows English in Arabic mode today. A row flagged `SAME AS EN` may be a name or an identifier that should stay Latin; say which.
- A value with `{...}` or a number is a template; the reviewer should check that the sentence still reads right with a count (for example one, two, eleven).
- The Arabic UI uses Arabic-Indic digits for display (D6). Identifiers (references, plates, phone, email) stay Latin.

## Totals
| Group | Rows | No Arabic | Same as English |
|---|---|---|---|
| Status labels | 29 | 0 | 0 |
| Navigation and shell | 21 | 0 | 0 |
| Design-system chrome | 37 | 0 | 0 |
| Company dashboard | 319 | 0 | 0 |
| Passenger marketplace | 461 | 0 | 3 |
| Other | 40 | 0 | 0 |
| **Total** | 907 | 0 | 3 |

**Not covered:** the platform admin and driver screens are English only (no Arabic exists); strings built from several parts at run time; text inside images; email and error text that comes from the database or Supabase. Those need a separate pass.

**Sign-off:** Reviewer name: ____________   Date: ____________   Signature: ____________

## Status labels

| # | English | Arabic (current) | Flag | Where | Decision | Reviewed Arabic |
|---|---|---|---|---|---|---|
| 1 | Boarded | صعد |  | `ds/data/status-map.ts › STATUS_MAP.boarding.boarded.label` +3 | | |
| 2 | Not boarded | لم يصعد |  | `ds/data/status-map.ts › STATUS_MAP.boarding.not_boarded.label` +2 | | |
| 3 | Partly boarded | صعد جزء منهم |  | `ds/data/status-map.ts › STATUS_MAP.boarding.partial.label` +2 | | |
| 4 | Cancelled | ملغي |  | `ds/data/status-map.ts › STATUS_MAP.booking.cancelled.label` +3 | | |
| 5 | Completed | مكتمل |  | `ds/data/status-map.ts › STATUS_MAP.booking.completed.label` +1 | | |
| 6 | Confirmed | مؤكد |  | `ds/data/status-map.ts › STATUS_MAP.booking.confirmed.label` +2 | | |
| 7 | No show | لم يحضر |  | `ds/data/status-map.ts › STATUS_MAP.booking.no_show.label` +1 | | |
| 8 | Pending | قيد الانتظار |  | `ds/data/status-map.ts › STATUS_MAP.booking.pending.label` +2 | | |
| 9 | Active | نشط |  | `ds/data/status-map.ts › STATUS_MAP.bus.active.label` +7 | | |
| 10 | Inactive | متوقف |  | `ds/data/status-map.ts › STATUS_MAP.bus.inactive.label` +2 | | |
| 11 | Maintenance | صيانة |  | `ds/data/status-map.ts › STATUS_MAP.bus.maintenance.label` +1 | | |
| 12 | Trial | تجريبي |  | `ds/data/status-map.ts › STATUS_MAP.company.trial.label` +1 | | |
| 13 | Accepted | مقبولة |  | `ds/data/status-map.ts › STATUS_MAP.invite.accepted.label` | | |
| 14 | Expired | منتهية |  | `ds/data/status-map.ts › STATUS_MAP.invite.expired.label` | | |
| 15 | Revoked | ملغاة |  | `ds/data/status-map.ts › STATUS_MAP.invite.revoked.label` | | |
| 16 | Suspended | موقوف |  | `ds/data/status-map.ts › STATUS_MAP.member.suspended.label` +2 | | |
| 17 | Paid | مدفوع |  | `ds/data/status-map.ts › STATUS_MAP.payment.paid.label` +1 | | |
| 18 | Partly paid | مدفوع جزئياً |  | `ds/data/status-map.ts › STATUS_MAP.payment.partial.label` +1 | | |
| 19 | Refunded | مسترد |  | `ds/data/status-map.ts › STATUS_MAP.payment.refunded.label` +2 | | |
| 20 | Unpaid | غير مدفوع |  | `ds/data/status-map.ts › STATUS_MAP.payment.unpaid.label` +2 | | |
| 21 | Expired | منتهي |  | `ds/data/status-map.ts › STATUS_MAP.subscription.expired.label` | | |
| 22 | Past due | متأخر السداد |  | `ds/data/status-map.ts › STATUS_MAP.subscription.past_due.label` | | |
| 23 | Trialing | فترة تجريبية |  | `ds/data/status-map.ts › STATUS_MAP.subscription.trialing.label` | | |
| 24 | Boarding | جارٍ الصعود |  | `ds/data/status-map.ts › STATUS_MAP.trip.boarding.label` | | |
| 25 | Cancelled | ملغاة |  | `ds/data/status-map.ts › STATUS_MAP.trip.cancelled.label` +3 | | |
| 26 | Completed | مكتملة |  | `ds/data/status-map.ts › STATUS_MAP.trip.completed.label` +3 | | |
| 27 | Draft | مسودة |  | `ds/data/status-map.ts › STATUS_MAP.trip.draft.label` +1 | | |
| 28 | In progress | قيد التنفيذ |  | `ds/data/status-map.ts › STATUS_MAP.trip.in_progress.label` | | |
| 29 | Scheduled | مجدولة |  | `ds/data/status-map.ts › STATUS_MAP.trip.scheduled.label` +2 | | |

## Navigation and shell

| # | English | Arabic (current) | Flag | Where | Decision | Reviewed Arabic |
|---|---|---|---|---|---|---|
| 1 | Account menu | قائمة الحساب |  | `ds/shell/text.ts › SHELL_TEXT.account` | | |
| 2 | Close navigation | إغلاق التنقل |  | `ds/shell/text.ts › SHELL_TEXT.closeNav` | | |
| 3 | Collapse sidebar | تصغير القائمة |  | `ds/shell/text.ts › SHELL_TEXT.collapse` | | |
| 4 | Expand sidebar | توسيع القائمة |  | `ds/shell/text.ts › SHELL_TEXT.expand` | | |
| 5 | Main navigation | التنقل الرئيسي |  | `ds/shell/text.ts › SHELL_TEXT.mainNav` | | |
| 6 | Menu | القائمة |  | `ds/shell/text.ts › SHELL_TEXT.menu` | | |
| 7 | Open navigation | فتح التنقل |  | `ds/shell/text.ts › SHELL_TEXT.openNav` | | |
| 8 | Platform | المنصة |  | `ds/shell/text.ts › SHELL_TEXT.platform` | | |
| 9 | Changes here affect every company. | التغييرات هنا تؤثر على كل الشركات. |  | `ds/shell/text.ts › SHELL_TEXT.platformNote` | | |
| 10 | Powered by MALAKY Studio | بدعم من MALAKY Studio |  | `ds/shell/text.ts › SHELL_TEXT.poweredBy` | | |
| 11 | MASAR | مسار |  | `ds/shell/text.ts › SHELL_TEXT.productName` | | |
| 12 | Sign out | تسجيل الخروج |  | `ds/shell/text.ts › SHELL_TEXT.signOut` | | |
| 13 | Skip to main content | تخطي إلى المحتوى الرئيسي |  | `ds/shell/text.ts › SHELL_TEXT.skip` | | |
| 14 | soon | قريباً |  | `ds/shell/text.ts › SHELL_TEXT.soon` | | |
| 15 | Toggle theme | تبديل المظهر |  | `ds/shell/text.ts › SHELL_TEXT.theme` | | |
| 16 | Workspace | مساحة العمل |  | `ds/shell/text.ts › SHELL_TEXT.workspace` +1 | | |
| 17 | That driver record is no longer available. Reload the page. | سجل السائق لم يعد متاحاً. أعد تحميل الصفحة. |  | `features/dashboard/messages.ts › GENERIC.driver_unavailable` | | |
| 18 | Search Trips | ابحث عن رحلة |  | `ui/lib/i18n.ts › translations.navSearchTrips` | | |
| 19 | Not enough seats are left on this trip. | لا توجد مقاعد كافية في هذه الرحلة. |  | `ui/lib/real/customerBackend.ts › MESSAGES.seats_unavailable` | | |
| 20 | Tickets are not available for this booking (it may be cancelled or the trip has closed). | التذاكر غير متاحة لهذا الحجز (قد يكون ملغى أو أُغلقت الرحلة). |  | `ui/lib/real/customerBackend.ts › MESSAGES.tickets_unavailable` | | |
| 21 | This trip is no longer available for booking. | هذه الرحلة لم تعد متاحة للحجز. |  | `ui/lib/real/customerBackend.ts › MESSAGES.trip_unavailable` | | |

## Design-system chrome

| # | English | Arabic (current) | Flag | Where | Decision | Reviewed Arabic |
|---|---|---|---|---|---|---|
| 1 | EGP | ج.م |  | `ds/format/index.ts › CURRENCY_SYMBOL.EGP` +1 | | |
| 2 | en-GB-u-ca-gregory-nu-latn | ar-EG-u-ca-gregory-nu-arab |  | `ds/format/index.ts › LOCALE` | | |
| 3 | No bookings yet | لا توجد حجوزات بعد | empty/guidance | `ds/gallery/Gallery.tsx › SAMPLE.empty` | | |
| 4 | Full name | الاسم الكامل |  | `ds/gallery/Gallery.tsx › SAMPLE.name` +1 | | |
| 5 | Delta Express | دلتا إكسبرس |  | `ds/gallery/Gallery.tsx › SAMPLE.operator` | | |
| 6 | Omar Hassan | عمر حسن |  | `ds/gallery/Gallery.tsx › SAMPLE.person` | | |
| 7 | Phone | رقم الهاتف |  | `ds/gallery/Gallery.tsx › SAMPLE.phone` +2 | | |
| 8 | Free cancellation up to 6 hours before departure. | إلغاء مجاني حتى ٦ ساعات قبل المغادرة. |  | `ds/gallery/Gallery.tsx › SAMPLE.pol` | | |
| 9 | Save changes | حفظ التغييرات |  | `ds/gallery/Gallery.tsx › SAMPLE.save` +1 | | |
| 10 | Student ID | الرقم الجامعي |  | `ds/gallery/Gallery.tsx › SAMPLE.student` +1 | | |
| 11 | Cairo to Alexandria | القاهرة إلى الإسكندرية |  | `ds/gallery/Gallery.tsx › SAMPLE.trip` | | |
| 12 | University | الجامعة |  | `ds/gallery/Gallery.tsx › SAMPLE.uni` +1 | | |
| 13 | Booked | محجوز |  | `ds/messages.ts › DS_TEXT.booked` | | |
| 14 | Breadcrumb | مسار التنقل |  | `ds/messages.ts › DS_TEXT.breadcrumb` | | |
| 15 | Cancel | إلغاء |  | `ds/messages.ts › DS_TEXT.cancel` +2 | | |
| 16 | Choose file | اختيار ملف |  | `ds/messages.ts › DS_TEXT.chooseFile` | | |
| 17 | Clear all | مسح الكل |  | `ds/messages.ts › DS_TEXT.clearAll` +2 | | |
| 18 | Close | إغلاق |  | `ds/messages.ts › DS_TEXT.close` +1 | | |
| 19 | Confirm | تأكيد |  | `ds/messages.ts › DS_TEXT.confirm` +1 | | |
| 20 | Copied | تم النسخ |  | `ds/messages.ts › DS_TEXT.copied` | | |
| 21 | Copy | نسخ |  | `ds/messages.ts › DS_TEXT.copy` | | |
| 22 | The page could not be loaded. Try again. | تعذر تحميل الصفحة. حاول مرة أخرى. |  | `ds/messages.ts › DS_TEXT.errorBody` | | |
| 23 | Something went wrong | حدث خطأ ما |  | `ds/messages.ts › DS_TEXT.errorTitle` | | |
| 24 | Loading | جارٍ التحميل |  | `ds/messages.ts › DS_TEXT.loading` | | |
| 25 | Next | التالي |  | `ds/messages.ts › DS_TEXT.next` +1 | | |
| 26 | No file chosen | لم يتم اختيار ملف |  | `ds/messages.ts › DS_TEXT.noFile` | | |
| 27 | Notifications | الإشعارات |  | `ds/messages.ts › DS_TEXT.notifications` | | |
| 28 | Pagination | التنقل بين الصفحات |  | `ds/messages.ts › DS_TEXT.pagination` | | |
| 29 | Previous | السابق |  | `ds/messages.ts › DS_TEXT.previous` +1 | | |
| 30 | required | مطلوب |  | `ds/messages.ts › DS_TEXT.required` | | |
| 31 | Try again | حاول مرة أخرى | empty/guidance | `ds/messages.ts › DS_TEXT.retry` | | |
| 32 | Saved | تم الحفظ |  | `ds/messages.ts › DS_TEXT.saved` | | |
| 33 | Saving | جارٍ الحفظ |  | `ds/messages.ts › DS_TEXT.saving` | | |
| 34 | Select all rows | تحديد كل الصفوف |  | `ds/messages.ts › DS_TEXT.selectAll` | | |
| 35 | Select row | تحديد الصف |  | `ds/messages.ts › DS_TEXT.selectRow` | | |
| 36 | sorted ascending | مرتب تصاعدياً |  | `ds/messages.ts › DS_TEXT.sortedAsc` | | |
| 37 | sorted descending | مرتب تنازلياً |  | `ds/messages.ts › DS_TEXT.sortedDesc` | | |

## Company dashboard

| # | English | Arabic (current) | Flag | Where | Decision | Reviewed Arabic |
|---|---|---|---|---|---|---|
| 1 | Search reservations, track what each passenger has paid and who has boarded. | ابحث في الحجوزات وتتبّع ما دفعه كل راكب ومن صعد إلى الحافلة. |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 2 | Login | حساب الدخول |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 3 | Fleet operations | عمليات الأسطول |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 4 | Fleet management | إدارة الأسطول |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 5 | Manage your vehicles, registration details and seating capacity. | أدر مركباتك وبيانات تسجيلها وسعة المقاعد. |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 6 | Network management | إدارة الشبكة |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 7 | Routes & destinations | المسارات والوجهات |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 8 | Scheduling & dispatch | الجدولة والتشغيل |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 9 | Create trip drafts, assign available resources and manage the trip lifecycle. | أنشئ مسودات الرحلات وخصص الموارد المتاحة وأدر دورة حياة الرحلة. |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 10 | People & compliance | الأفراد والامتثال |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 11 | Keep driver contact details, license records and availability up to date. | حدّث بيانات تواصل السائقين وسجلات الرخص والتوافر. |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 12 | Passenger operations | عمليات الركاب |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 13 | Review reservations, passenger details and payment status. | راجع الحجوزات وبيانات الركاب وحالة الدفع. |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 14 | Brand presence | الهوية والحضور |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 15 | Website settings | إعدادات الموقع |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 16 | Configure your operator website identity, brand colours and customer contact details. | اضبط هوية موقع شركتك وألوان العلامة وبيانات تواصل العملاء. |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 17 | Operator workspace | مساحة عمل المشغل |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 18 | Here is your operations workspace. Choose a module to get started. | هذه مساحة عمل عملياتك. اختر وحدة للبدء. |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 19 | Name the route, then list its stops in the order the bus visits them. | سمِّ المسار ثم اذكر محطاته بترتيب مرور الحافلة. |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 20 | Vehicle | المركبة |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 21 | Update | تحديث |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 22 | Origin | الانطلاق |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 23 | License | الرخصة |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 24 | Assignment | التخصيص |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 25 | Transition | الانتقال |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 26 | Reference | المرجع |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 27 | Booking status | حالة الحجز |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 28 | Total | الإجمالي |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 29 | Fleet | الأسطول |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 30 | Routes | المسارات |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 31 | Nothing here yet | لا يوجد شيء بعد | empty/guidance | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 32 | Records will appear here when you add them. | ستظهر السجلات هنا عند إضافتها. |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 33 | Save | حفظ |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 34 | Inactive | غير نشط |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 35 | Deactivate | تعطيل |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 36 | Activate | تفعيل |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 37 | No route code | بلا رمز |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 38 | Create and maintain your company's travel corridors and their stops. | أنشئ ممرات سفر شركتك وحافظ عليها مع محطاتها. |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 39 | Create a trip draft and assign an available bus and driver. | أنشئ مسودة رحلة وخصص لها حافلة وسائقاً متاحين. |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 40 | Customer details and booking history. | بيانات العميل وسجل حجوزاته. |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 41 | People who booked with your company. Search by name, phone, email or student number. | الأشخاص الذين حجزوا لدى شركتك. ابحث بالاسم أو الهاتف أو البريد أو الرقم الجامعي. |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 42 | People who can sign in to this company, their roles, and pending invitations. | الأشخاص الذين يمكنهم الدخول إلى هذه الشركة وأدوارهم والدعوات المعلّقة. |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 43 | Review scheduled trips, assignments and the trip lifecycle. | راجع الرحلات المجدولة والتخصيصات ودورة حياة الرحلة. |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 44 | Your company profile and how booking and scheduling behave. | ملف شركتك وكيفية عمل الحجز والجدولة. |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 45 | Edit the route and its stops. | عدّل المسار ومحطاته. |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 46 | Route details and stops. | تفاصيل المسار ومحطاته. |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 47 | This customer has no bookings yet. | ليس لهذا العميل حجوزات بعد. |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 48 | No bookings | لا توجد حجوزات | empty/guidance | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 49 | Try a different name, phone or email. | جرّب اسماً أو هاتفاً أو بريداً آخر. | empty/guidance | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 50 | Customers appear here after their first booking. | يظهر العملاء هنا بعد أول حجز لهم. |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 51 | No matching customers | لا يوجد عملاء مطابقون |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 52 | No customers yet | لا يوجد عملاء بعد | empty/guidance | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 53 | Email | البريد الإلكتروني |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 54 | Expires | ينتهي |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 55 | Role | الدور |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 56 | Since | منذ |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 57 | Add a trip | إضافة رحلة |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 58 | Prices | الأسعار |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 59 | Time | الوقت |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 60 | No trips match | لا توجد رحلات مطابقة | empty/guidance | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 61 | Try another period or clear the filters. | جرّب فترة أخرى أو امسح عوامل التصفية. | empty/guidance | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 62 | Regular trips | الرحلات المنتظمة |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 63 | Regular trip | رحلة منتظمة |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 64 | Upcoming | القادمة |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 65 | Past | السابقة |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 66 | Schedule | الجدول |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 67 | Period | الفترة |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 68 | No regular trips yet | لا توجد رحلات منتظمة بعد | empty/guidance | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 69 | Add one above to repeat a trip every week. | أضف رحلة بالأعلى لتتكرر كل أسبوع. |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 70 | Trips that repeat on the same days every week. Each one creates normal trips you can book, assign and cancel. | رحلات تتكرر في نفس الأيام كل أسبوع. كل واحدة تنشئ رحلات عادية يمكنك حجزها وتخصيصها وإلغاءها. |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 71 | Customers | العملاء |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 72 | Settings | الإعدادات |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 73 | Team members | أعضاء الفريق |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 74 | Back to customers | العودة إلى العملاء |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 75 | Back to trips | العودة إلى الرحلات |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 76 | Search customers | ابحث في العملاء |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 77 | Clear search | مسح البحث |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 78 | Previous page | الصفحة السابقة |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 79 | Next page | الصفحة التالية |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 80 | Details | التفاصيل |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 81 | Student number | الرقم الجامعي |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 82 | Customer since | عميل منذ |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 83 | Staff notes | ملاحظات الموظفين |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 84 | Members | الأعضاء |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 85 | Pending invitations | الدعوات المعلّقة |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 86 | No pending invitations. | لا توجد دعوات معلّقة. |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 87 | (you) | (أنت) |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 88 | Name, legal details and contact data are managed by the platform team. Ask MALAKY support to change them. | الاسم والبيانات القانونية وبيانات التواصل يديرها فريق المنصة. اطلب من دعم MALAKY تغييرها. |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 89 | Contact email | بريد التواصل |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 90 | Booking and operations | الحجز والعمليات |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 91 | You can see the team, but only the company owner can change it. | يمكنك رؤية الفريق لكن مالك الشركة وحده يستطيع تغييره. |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 92 | Accept online bookings | قبول الحجوزات عبر الإنترنت |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 93 | Seats per booking (max) | أقصى عدد مقاعد للحجز |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 94 | Turnaround time between trips (minutes) | الفاصل بين الرحلات (دقائق) |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 95 | Create a trip | إنشاء رحلة |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 96 | Your workspace | مساحتك |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 97 | Your company data is isolated from other operators. Access to each module is controlled by your assigned permissions. | بيانات شركتك معزولة عن بقية المشغّلين. الوصول إلى كل وحدة تحدده صلاحياتك. |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 98 | Manage destinations and lines | إدارة الوجهات والخطوط |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 99 | Vehicles and capacity | المركبات والسعة |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 100 | Driver profiles and licenses | ملفات السائقين ورخصهم |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 101 | Schedules and assignments | الجداول والتخصيصات |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 102 | Passengers and payments | الركاب والمدفوعات |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 103 | Brand and contact settings | الهوية وإعدادات التواصل |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 104 | No bus | بلا حافلة |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 105 | Restricted | مقيّد |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 106 | Customer | العميل |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 107 | trial | تجريبي |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 108 | active | نشط |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 109 | suspended | موقوف |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 110 | cancelled | ملغى |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 111 | inactive | غير نشط |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 112 | scheduled | مجدولة |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 113 | confirmed | مؤكد |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 114 | paid | مدفوع |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 115 | completed | مكتملة |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 116 | boarding | جارٍ الصعود |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 117 | no show | لم يحضر |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 118 | refunded | مسترد |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 119 | pending | معلّق |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 120 | draft | مسودة |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 121 | maintenance | صيانة |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 122 | unpaid | غير مدفوع |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 123 | partial | جزئي |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 124 | departed | انطلقت |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 125 | open | مفتوحة |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 126 | in progress | قيد التنفيذ |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 127 | Website identity | هوية الموقع |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 128 | Customer contact | بيانات تواصل العملاء |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 129 | Website title (English) | عنوان الموقع (بالإنجليزية) |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 130 | Website title (Arabic) | عنوان الموقع (بالعربية) |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 131 | Primary colour | اللون الأساسي |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 132 | Secondary colour | اللون الثانوي |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 133 | Footer text (English) | نص التذييل (بالإنجليزية) |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 134 | Footer text (Arabic) | نص التذييل (بالعربية) |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 135 | Email address | البريد الإلكتروني |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 136 | Phone number | رقم الهاتف |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 137 | WhatsApp number | رقم واتساب |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 138 | Publishing, custom domains, logo uploads and multi-page content editing are separate workflows and are not enabled by this settings form. | النشر والنطاقات المخصصة ورفع الشعار وتحرير المحتوى متعدد الصفحات مسارات منفصلة وغير مفعّلة في نموذج الإعدادات هذا. |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 139 | Save website settings | حفظ إعدادات الموقع |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 140 | No driver | بلا سائق |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 141 | Welcome back | أهلاً بعودتك |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 142 | Partial | جزئي |  | `features/dashboard/messages.ts › PAGE_AR (page chrome dictionary)` | | |
| 143 | Active filters | عوامل التصفية |  | `features/dashboard/BookingFilters.tsx › TXT.active` +1 | | |
| 144 | Any | الكل |  | `features/dashboard/BookingFilters.tsx › TXT.any` +1 | | |
| 145 | Apply | تطبيق |  | `features/dashboard/BookingFilters.tsx › TXT.apply` +1 | | |
| 146 | Trip from | الرحلة من |  | `features/dashboard/BookingFilters.tsx › TXT.from` | | |
| 147 | More filters | مزيد من عوامل التصفية |  | `features/dashboard/BookingFilters.tsx › TXT.more` | | |
| 148 | Payment | الدفع |  | `features/dashboard/BookingFilters.tsx › TXT.payment` +1 | | |
| 149 | Paid in full | مدفوع بالكامل |  | `features/dashboard/BookingFilters.tsx › TXT.pays.paid` +1 | | |
| 150 | Reference / ticket no., name, phone, student ID, university… | رقم الحجز / التذكرة، الاسم، الهاتف، الرقم الجامعي، الجامعة… |  | `features/dashboard/BookingFilters.tsx › TXT.placeholder` | | |
| 151 | Route | المسار |  | `features/dashboard/BookingFilters.tsx › TXT.route` +2 | | |
| 152 | Search | بحث |  | `features/dashboard/BookingFilters.tsx › TXT.search` +1 | | |
| 153 | Searching covers all trips unless you pick a view. | البحث يشمل كل الرحلات ما لم تختر عرضاً محدداً. |  | `features/dashboard/BookingFilters.tsx › TXT.searchHint` | | |
| 154 | Sort by | ترتيب حسب |  | `features/dashboard/BookingFilters.tsx › TXT.sort` | | |
| 155 | Passenger name A–Z | اسم الراكب أ–ي |  | `features/dashboard/BookingFilters.tsx › TXT.sorts.name` | | |
| 156 | Booked: newest first | تاريخ الحجز: الأحدث |  | `features/dashboard/BookingFilters.tsx › TXT.sorts.newest` | | |
| 157 | Booked: oldest first | تاريخ الحجز: الأقدم |  | `features/dashboard/BookingFilters.tsx › TXT.sorts.oldest` | | |
| 158 | Trip time: earliest first | وقت الرحلة: الأقرب أولاً |  | `features/dashboard/BookingFilters.tsx › TXT.sorts.trip_asc` | | |
| 159 | Trip time: latest first | وقت الرحلة: الأبعد أولاً |  | `features/dashboard/BookingFilters.tsx › TXT.sorts.trip_desc` | | |
| 160 | Booked via | طريقة الحجز |  | `features/dashboard/BookingFilters.tsx › TXT.source` | | |
| 161 | Staff | الموظفون |  | `features/dashboard/BookingFilters.tsx › TXT.staff` | | |
| 162 | Search and filter bookings | بحث وتصفية الحجوزات |  | `features/dashboard/BookingFilters.tsx › TXT.title` | | |
| 163 | Trip to | الرحلة إلى |  | `features/dashboard/BookingFilters.tsx › TXT.to` | | |
| 164 | One trip only | رحلة واحدة فقط |  | `features/dashboard/BookingFilters.tsx › TXT.tripOnly` | | |
| 165 | All trips | كل الرحلات |  | `features/dashboard/BookingFilters.tsx › TXT.views.all` | | |
| 166 | Past trips | الرحلات السابقة |  | `features/dashboard/BookingFilters.tsx › TXT.views.past` | | |
| 167 | Upcoming trips | الرحلات القادمة |  | `features/dashboard/BookingFilters.tsx › TXT.views.upcoming` | | |
| 168 | Website | الموقع |  | `features/dashboard/BookingFilters.tsx › TXT.web` +1 | | |
| 169 | Amount paid | المبلغ المدفوع |  | `features/dashboard/BookingParts.tsx › TXT.amount` | | |
| 170 | Cancel booking | إلغاء الحجز |  | `features/dashboard/BookingParts.tsx › TXT.cancel` | | |
| 171 | Keep | إبقاء |  | `features/dashboard/BookingParts.tsx › TXT.keep` +1 | | |
| 172 | Remaining | المتبقي |  | `features/dashboard/BookingParts.tsx › TXT.left` | | |
| 173 | No ticket | بدون تذكرة |  | `features/dashboard/BookingParts.tsx › TXT.noTicket` | | |
| 174 | Refund | استرداد |  | `features/dashboard/BookingParts.tsx › TXT.refund` | | |
| 175 | Cancel this booking and release its seats? | إلغاء هذا الحجز وتحرير مقاعده؟ |  | `features/dashboard/BookingParts.tsx › TXT.sure` | | |
| 176 | Yes, cancel | نعم، إلغاء |  | `features/dashboard/BookingParts.tsx › TXT.yes` | | |
| 177 | Assign a bus and a driver before scheduling this trip. | عيّن حافلة وسائقًا قبل جدولة هذه الرحلة. |  | `features/dashboard/messages.ts › GENERIC.bus_and_driver_required` | | |
| 178 | This bus is already on another trip that overlaps this time (a 30 minute turnaround is kept after every trip). | هذه الحافلة مخصصة لرحلة أخرى تتداخل مع هذا الوقت (تُحفظ فترة 30 دقيقة بعد كل رحلة). |  | `features/dashboard/messages.ts › GENERIC.bus_conflict` | | |
| 179 | This bus is not active. | هذه الحافلة غير نشطة. |  | `features/dashboard/messages.ts › GENERIC.bus_inactive` | | |
| 180 | This action is not allowed. | هذا الإجراء غير مسموح. |  | `features/dashboard/messages.ts › GENERIC.business_rule` | | |
| 181 | You cannot change your own role or status. | لا يمكنك تغيير دورك أو حالتك بنفسك. |  | `features/dashboard/messages.ts › GENERIC.cannot_change_self` | | |
| 182 | Trip capacity is larger than the bus capacity. | سعة الرحلة أكبر من سعة الحافلة. |  | `features/dashboard/messages.ts › GENERIC.capacity_exceeds_bus` | | |
| 183 | This conflicts with existing data. | هذا يتعارض مع بيانات موجودة. |  | `features/dashboard/messages.ts › GENERIC.conflict` | | |
| 184 | This driver is already on another trip that overlaps this time (a 30 minute turnaround is kept after every trip). | هذا السائق مخصص لرحلة أخرى تتداخل مع هذا الوقت (تُحفظ فترة 30 دقيقة بعد كل رحلة). |  | `features/dashboard/messages.ts › GENERIC.driver_conflict` | | |
| 185 | This driver already has a login. | هذا السائق لديه حساب دخول بالفعل. |  | `features/dashboard/messages.ts › GENERIC.driver_has_login` | | |
| 186 | This driver is not active. | هذا السائق غير نشط. |  | `features/dashboard/messages.ts › GENERIC.driver_inactive` | | |
| 187 | A driver login must belong to a driver record. Pick the driver record first. | يجب أن يرتبط حساب السائق بسجل سائق. اختر سجل السائق أولاً. |  | `features/dashboard/messages.ts › GENERIC.driver_needs_record` | | |
| 188 | You do not have permission to do this. | ليست لديك صلاحية للقيام بذلك. |  | `features/dashboard/messages.ts › GENERIC.forbidden` | | |
| 189 | Something went wrong on our side. Nothing was lost; try again. | حدث خطأ من جانبنا. لم يضع شيء، حاول مجدداً. |  | `features/dashboard/messages.ts › GENERIC.internal` | | |
| 190 | There is already a pending invitation for this email. | توجد دعوة معلقة لهذا البريد بالفعل. |  | `features/dashboard/messages.ts › GENERIC.invite_pending` | | |
| 191 | A company must keep at least one active owner. | يجب أن تحتفظ الشركة بمالك نشط واحد على الأقل. |  | `features/dashboard/messages.ts › GENERIC.last_owner` | | |
| 192 | This team member is already linked to a driver record. | عضو الفريق هذا مرتبط بسجل سائق بالفعل. |  | `features/dashboard/messages.ts › GENERIC.member_has_driver` | | |
| 193 | This item no longer exists. Reload the page. | لم يعد هذا العنصر موجوداً. أعد تحميل الصفحة. |  | `features/dashboard/messages.ts › GENERIC.not_found` | | |
| 194 | The company owner cannot be a driver login. | لا يمكن أن يكون مالك الشركة حساب سائق. |  | `features/dashboard/messages.ts › GENERIC.owner_not_driver` | | |
| 195 | A bus with this plate number already exists. | توجد حافلة بنفس رقم اللوحة. |  | `features/dashboard/messages.ts › GENERIC.plate_number_taken` | | |
| 196 | Too many requests. Wait a moment and try again. | طلبات كثيرة. انتظر قليلاً ثم حاول مجدداً. |  | `features/dashboard/messages.ts › GENERIC.rate_limited` | | |
| 197 | Another route already uses this code. | مسار آخر يستخدم هذا الرمز. |  | `features/dashboard/messages.ts › GENERIC.route_code_taken` | | |
| 198 | The seats booked are more than the trip capacity. | عدد المقاعد المحجوزة أكبر من سعة الرحلة. |  | `features/dashboard/messages.ts › GENERIC.seats_exceed_capacity` | | |
| 199 | This trip was changed by someone else. Reload the page and try again. | تم تغيير هذه الرحلة بواسطة شخص آخر. أعد تحميل الصفحة وحاول مجدداً. |  | `features/dashboard/messages.ts › GENERIC.trip_changed` | | |
| 200 | The departure time has already passed, so the trip cannot be scheduled. Change the departure time first. | مر وقت الانطلاق بالفعل فلا يمكن جدولة الرحلة. غيّر وقت الانطلاق أولاً. |  | `features/dashboard/messages.ts › GENERIC.trip_departed` | | |
| 201 | The trip status could not be changed. Check the trip and try again. | تعذر تغيير حالة الرحلة. راجع الرحلة وحاول مرة أخرى. |  | `features/dashboard/messages.ts › GENERIC.trip_failed` | | |
| 202 | This trip is already finished or cancelled; it has no next step. | هذه الرحلة منتهية أو ملغاة وليس لها خطوة تالية. |  | `features/dashboard/messages.ts › GENERIC.trip_final` | | |
| 203 | This trip has bookings or booking history, so it cannot be deleted. Cancel it instead. | لهذه الرحلة حجوزات أو سجل حجوزات فلا يمكن حذفها. ألغِها بدلاً من ذلك. |  | `features/dashboard/messages.ts › GENERIC.trip_has_bookings` | | |
| 204 | Only a draft trip can be deleted. Cancel it instead. | يمكن حذف المسودات فقط. ألغِ الرحلة بدلاً من ذلك. |  | `features/dashboard/messages.ts › GENERIC.trip_not_draft` | | |
| 205 | The trip cannot be completed before its departure time. | لا يمكن إكمال الرحلة قبل وقت انطلاقها. |  | `features/dashboard/messages.ts › GENERIC.trip_not_started` | | |
| 206 | That status change is not allowed from the current status. | تغيير الحالة هذا غير مسموح من الحالة الحالية. |  | `features/dashboard/messages.ts › GENERIC.trip_transition_invalid` | | |
| 207 | Your session has ended. Sign in again. | انتهت جلستك. سجّل الدخول مجدداً. |  | `features/dashboard/messages.ts › GENERIC.unauthenticated` | | |
| 208 | This person already belongs to a company. | هذا الشخص ينتمي بالفعل إلى شركة. |  | `features/dashboard/messages.ts › GENERIC.user_already_member` | | |
| 209 | Some of the information is not valid. Check the highlighted fields. | بعض المعلومات غير صالحة. راجع الحقول المحددة. |  | `features/dashboard/messages.ts › GENERIC.validation` | | |
| 210 | Add a vehicle | إضافة مركبة |  | `features/dashboard/messages.ts › LABELS.addBus` | | |
| 211 | Add vehicle | إضافة مركبة |  | `features/dashboard/messages.ts › LABELS.addBusBtn` | | |
| 212 | Add a driver | إضافة سائق |  | `features/dashboard/messages.ts › LABELS.addDriver` | | |
| 213 | Add driver | إضافة سائق |  | `features/dashboard/messages.ts › LABELS.addDriverBtn` | | |
| 214 | Name | الاسم |  | `features/dashboard/messages.ts › LABELS.busName` +2 | | |
| 215 | License number | رقم الرخصة |  | `features/dashboard/messages.ts › LABELS.license` | | |
| 216 | License expiry | انتهاء الرخصة |  | `features/dashboard/messages.ts › LABELS.licenseExpiry` +1 | | |
| 217 | Make | الصانع |  | `features/dashboard/messages.ts › LABELS.make` | | |
| 218 | Model | الطراز |  | `features/dashboard/messages.ts › LABELS.model` | | |
| 219 | Phone | الهاتف |  | `features/dashboard/messages.ts › LABELS.phone` +1 | | |
| 220 | Plate number | رقم اللوحة |  | `features/dashboard/messages.ts › LABELS.plate` | | |
| 221 | Fields marked * are required. | الحقول المميزة بـ * مطلوبة. |  | `features/dashboard/messages.ts › LABELS.required` | | |
| 222 | Seats | المقاعد |  | `features/dashboard/messages.ts › LABELS.seats` +1 | | |
| 223 | Ask the company owner to upgrade the plan, or contact MALAKY Studio support. You can also free up room by removing or deactivating items you no longer need. | اطلب من مالك الشركة ترقية الباقة أو تواصل مع دعم MALAKY Studio. يمكنك أيضاً توفير مساحة بإزالة العناصر غير المستخدمة أو تعطيلها. |  | `features/dashboard/messages.ts › NEXT` | | |
| 224 | buses | الحافلات |  | `features/dashboard/messages.ts › RES.max_buses.name` | | |
| 225 | bus | حافلة |  | `features/dashboard/messages.ts › RES.max_buses.short` | | |
| 226 | drivers | السائقين |  | `features/dashboard/messages.ts › RES.max_drivers.name` | | |
| 227 | driver | سائق |  | `features/dashboard/messages.ts › RES.max_drivers.short` | | |
| 228 | routes | المسارات |  | `features/dashboard/messages.ts › RES.max_routes.name` | | |
| 229 | route | مسار |  | `features/dashboard/messages.ts › RES.max_routes.short` | | |
| 230 | trips this month | الرحلات هذا الشهر |  | `features/dashboard/messages.ts › RES.max_trips_per_month.name` | | |
| 231 | trip | رحلة |  | `features/dashboard/messages.ts › RES.max_trips_per_month.short` | | |
| 232 | team members | أعضاء الفريق |  | `features/dashboard/messages.ts › RES.max_users.name` | | |
| 233 | team member | عضو فريق |  | `features/dashboard/messages.ts › RES.max_users.short` | | |
| 234 | Add a route | إضافة مسار |  | `features/dashboard/messages.ts › ROUTE_UI.addRoute` +1 | | |
| 235 | Back to routes | العودة إلى المسارات |  | `features/dashboard/messages.ts › ROUTE_UI.back` +1 | | |
| 236 | Route code | رمز المسار |  | `features/dashboard/messages.ts › ROUTE_UI.code` | | |
| 237 | Create route | إنشاء المسار |  | `features/dashboard/messages.ts › ROUTE_UI.create` | | |
| 238 | Description | الوصف |  | `features/dashboard/messages.ts › ROUTE_UI.description` | | |
| 239 | Destination | الوجهة |  | `features/dashboard/messages.ts › ROUTE_UI.destination` +2 | | |
| 240 | Edit route | تعديل المسار |  | `features/dashboard/messages.ts › ROUTE_UI.editRoute` | | |
| 241 | Route name | اسم المسار |  | `features/dashboard/messages.ts › ROUTE_UI.name` | | |
| 242 | Origin | نقطة الانطلاق |  | `features/dashboard/messages.ts › ROUTE_UI.origin` | | |
| 243 | You can view this route but not change it. | يمكنك عرض هذا المسار لكن لا يمكنك تغييره. |  | `features/dashboard/messages.ts › ROUTE_UI.readOnly` | | |
| 244 | Allow booking without an account | السماح بالحجز بدون حساب |  | `features/dashboard/messages.ts › SETTINGS_UI.allowGuestBooking` +1 | | |
| 245 | Arabic | العربية |  | `features/dashboard/messages.ts › SETTINGS_UI.ar` +1 | | |
| 246 | Booking and operations | الحجز والتشغيل |  | `features/dashboard/messages.ts › SETTINGS_UI.booking` | | |
| 247 | Accept online bookings | قبول الحجز عبر الإنترنت |  | `features/dashboard/messages.ts › SETTINGS_UI.bookingEnabled` | | |
| 248 | Turnaround time between trips (minutes) | الوقت بين الرحلات (دقائق) |  | `features/dashboard/messages.ts › SETTINGS_UI.buffer` | | |
| 249 | Applies to new trips only. | يسري على الرحلات الجديدة فقط. |  | `features/dashboard/messages.ts › SETTINGS_UI.bufferHint` | | |
| 250 | Cancellation window (hours before departure) | مهلة الإلغاء (ساعات قبل الانطلاق) |  | `features/dashboard/messages.ts › SETTINGS_UI.cancelWindow` +1 | | |
| 251 | Company profile | ملف الشركة |  | `features/dashboard/messages.ts › SETTINGS_UI.company` +1 | | |
| 252 | Name, legal details and contact data are managed by the platform team. Ask MALAKY support to change them. | الاسم والبيانات القانونية وبيانات التواصل يديرها فريق المنصة. تواصل مع دعم MALAKY لتغييرها. |  | `features/dashboard/messages.ts › SETTINGS_UI.companyNote` | | |
| 253 | Contact email | البريد الإلكتروني |  | `features/dashboard/messages.ts › SETTINGS_UI.contactEmail` | | |
| 254 | Contact phone | هاتف التواصل |  | `features/dashboard/messages.ts › SETTINGS_UI.contactPhone` +1 | | |
| 255 | Country | الدولة |  | `features/dashboard/messages.ts › SETTINGS_UI.country` +1 | | |
| 256 | Currency | العملة |  | `features/dashboard/messages.ts › SETTINGS_UI.currency` +1 | | |
| 257 | Three capital letters, for example EGP. | ثلاثة أحرف كبيرة، مثل EGP. |  | `features/dashboard/messages.ts › SETTINGS_UI.currencyHint` | | |
| 258 | Booking cut-off (minutes before departure) | إغلاق الحجز (دقائق قبل الانطلاق) |  | `features/dashboard/messages.ts › SETTINGS_UI.cutoff` +1 | | |
| 259 | Default language | اللغة الافتراضية |  | `features/dashboard/messages.ts › SETTINGS_UI.defaultLocale` +1 | | |
| 260 | English | الإنجليزية |  | `features/dashboard/messages.ts › SETTINGS_UI.en` +1 | | |
| 261 | Legal name | الاسم القانوني |  | `features/dashboard/messages.ts › SETTINGS_UI.legalName` +1 | | |
| 262 | Seats per booking (max) | الحد الأقصى للمقاعد في الحجز |  | `features/dashboard/messages.ts › SETTINGS_UI.maxSeats` | | |
| 263 | No | لا |  | `features/dashboard/messages.ts › SETTINGS_UI.no` +1 | | |
| 264 | You can view these settings but not change them. | يمكنك عرض هذه الإعدادات لكن لا يمكنك تغييرها. |  | `features/dashboard/messages.ts › SETTINGS_UI.readOnly` +1 | | |
| 265 | Save settings | حفظ الإعدادات |  | `features/dashboard/messages.ts › SETTINGS_UI.save` | | |
| 266 | Address name | اسم العنوان |  | `features/dashboard/messages.ts › SETTINGS_UI.slug` +1 | | |
| 267 | Supported languages | اللغات المدعومة |  | `features/dashboard/messages.ts › SETTINGS_UI.supportedLocales` +1 | | |
| 268 | Tax number | الرقم الضريبي |  | `features/dashboard/messages.ts › SETTINGS_UI.taxNumber` +1 | | |
| 269 | Time zone | المنطقة الزمنية |  | `features/dashboard/messages.ts › SETTINGS_UI.timezone` +1 | | |
| 270 | An IANA name, for example Africa/Cairo. | اسم IANA، مثل Africa/Cairo. |  | `features/dashboard/messages.ts › SETTINGS_UI.timezoneHint` | | |
| 271 | Yes | نعم |  | `features/dashboard/messages.ts › SETTINGS_UI.yes` +1 | | |
| 272 | The address is too long (300 characters at most). | العنوان طويل جداً (300 حرف كحد أقصى). |  | `features/dashboard/messages.ts › STOP_ISSUES.stop_address_invalid` | | |
| 273 | Give both latitude (-90 to 90) and longitude (-180 to 180), or leave both empty. | أدخل خط العرض (-90 إلى 90) وخط الطول (-180 إلى 180) معاً أو اتركهما فارغين. |  | `features/dashboard/messages.ts › STOP_ISSUES.stop_coords_invalid` | | |
| 274 | A stop that has bookings cannot be removed. Mark it inactive instead. | لا يمكن حذف محطة لديها حجوزات. عطّلها بدلاً من ذلك. |  | `features/dashboard/messages.ts › STOP_ISSUES.stop_has_bookings` | | |
| 275 | A stop is not valid. Reload the page and try again. | إحدى المحطات غير صالحة. أعد تحميل الصفحة وحاول مجدداً. |  | `features/dashboard/messages.ts › STOP_ISSUES.stop_invalid` | | |
| 276 | This name is already used by another stop on the route. | هذا الاسم مستخدم في محطة أخرى بالمسار. |  | `features/dashboard/messages.ts › STOP_ISSUES.stop_name_duplicate` | | |
| 277 | Enter a stop name of 2 to 120 characters. | أدخل اسم محطة من 2 إلى 120 حرفاً. |  | `features/dashboard/messages.ts › STOP_ISSUES.stop_name_invalid` | | |
| 278 | Minutes after departure must be a whole number from 0 to 32767. | الدقائق بعد الانطلاق يجب أن تكون عدداً صحيحاً من 0 إلى 32767. |  | `features/dashboard/messages.ts › STOP_ISSUES.stop_offset_invalid` | | |
| 279 | Minutes cannot be lower than the stop before it. | الدقائق لا يمكن أن تقل عن المحطة التي قبلها. |  | `features/dashboard/messages.ts › STOP_ISSUES.stop_offset_order` | | |
| 280 | A stop no longer exists. Reload the page and try again. | لم تعد إحدى المحطات موجودة. أعد تحميل الصفحة وحاول مجدداً. |  | `features/dashboard/messages.ts › STOP_ISSUES.stop_unknown_id` | | |
| 281 | Add at least two stops. | أضف محطتين على الأقل. |  | `features/dashboard/messages.ts › STOP_ISSUES.stops_min_two` | | |
| 282 | At least two stops must be active. | يجب أن تكون محطتان على الأقل نشطتين. |  | `features/dashboard/messages.ts › STOP_ISSUES.stops_min_two_active` | | |
| 283 | Active stops need at least one pick-up and one drop-off. | تحتاج المحطات النشطة إلى محطة صعود واحدة ومحطة نزول واحدة على الأقل. |  | `features/dashboard/messages.ts › STOP_ISSUES.stops_need_pickup_and_dropoff` | | |
| 284 | The stop list is not valid. Reload the page and try again. | قائمة المحطات غير صالحة. أعد تحميل الصفحة وحاول مجدداً. |  | `features/dashboard/messages.ts › STOP_ISSUES.stops_not_a_list` | | |
| 285 | A route can have at most 200 stops. | الحد الأقصى للمحطات في المسار 200. |  | `features/dashboard/messages.ts › STOP_ISSUES.stops_too_many` | | |
| 286 | Trip actions | إجراءات الرحلة |  | `features/dashboard/messages.ts › TRIP_UI.actions` | | |
| 287 | Cancel trip | إلغاء الرحلة |  | `features/dashboard/messages.ts › TRIP_UI.cancel` | | |
| 288 | Cancel this trip? Every booking on it will be cancelled too. | إلغاء هذه الرحلة؟ ستُلغى كل الحجوزات عليها أيضاً. |  | `features/dashboard/messages.ts › TRIP_UI.confirmCancel` | | |
| 289 | Delete this draft permanently? | حذف هذه المسودة نهائياً؟ |  | `features/dashboard/messages.ts › TRIP_UI.confirmDelete` | | |
| 290 | Delete | حذف |  | `features/dashboard/messages.ts › TRIP_UI.del` +1 | | |
| 291 | Status updated. | تم تحديث الحالة. |  | `features/dashboard/messages.ts › TRIP_UI.done.advanced` | | |
| 292 | Trip cancelled. | تم إلغاء الرحلة. |  | `features/dashboard/messages.ts › TRIP_UI.done.cancelled` | | |
| 293 | Trip deleted. | تم حذف الرحلة. |  | `features/dashboard/messages.ts › TRIP_UI.done.deleted` | | |
| 294 | Draft → Scheduled → Boarding → On the road → Completed | مسودة ← مجدولة ← صعود ← على الطريق ← مكتملة |  | `features/dashboard/messages.ts › TRIP_UI.flow` | | |
| 295 | Start trip | بدء الرحلة |  | `features/dashboard/messages.ts › TRIP_UI.next.boarding` | | |
| 296 | Schedule | جدولة |  | `features/dashboard/messages.ts › TRIP_UI.next.draft` | | |
| 297 | Complete trip | إكمال الرحلة |  | `features/dashboard/messages.ts › TRIP_UI.next.in_progress` | | |
| 298 | Open boarding | فتح الصعود |  | `features/dashboard/messages.ts › TRIP_UI.next.scheduled` | | |
| 299 | Working… | جارٍ التنفيذ… |  | `features/dashboard/messages.ts › TRIP_UI.working` | | |
| 300 | Yes, cancel trip | نعم، ألغِ الرحلة |  | `features/dashboard/messages.ts › TRIP_UI.yesCancel` | | |
| 301 | Yes, delete | نعم، احذف |  | `features/dashboard/messages.ts › TRIP_UI.yesDelete` | | |
| 302 | Apply filters | تطبيق |  | `features/dashboard/TripFilters.tsx › TXT.apply` | | |
| 303 | Bus | الحافلة |  | `features/dashboard/TripFilters.tsx › TXT.bus` | | |
| 304 | Driver | السائق |  | `features/dashboard/TripFilters.tsx › TXT.driver` +2 | | |
| 305 | From date | من تاريخ |  | `features/dashboard/TripFilters.tsx › TXT.from` | | |
| 306 | One-off trips | رحلات منفردة |  | `features/dashboard/TripFilters.tsx › TXT.manual` | | |
| 307 | Next week | الأسبوع القادم |  | `features/dashboard/TripFilters.tsx › TXT.quick.nextweek` | | |
| 308 | Today | اليوم |  | `features/dashboard/TripFilters.tsx › TXT.quick.today` | | |
| 309 | Tomorrow | غداً |  | `features/dashboard/TripFilters.tsx › TXT.quick.tomorrow` | | |
| 310 | This week | هذا الأسبوع |  | `features/dashboard/TripFilters.tsx › TXT.quick.week` | | |
| 311 | Regular trips | رحلات منتظمة |  | `features/dashboard/TripFilters.tsx › TXT.regular` | | |
| 312 | Type | النوع |  | `features/dashboard/TripFilters.tsx › TXT.source` | | |
| 313 | Boarding | صعود |  | `features/dashboard/TripFilters.tsx › TXT.st.boarding` | | |
| 314 | On the road | على الطريق |  | `features/dashboard/TripFilters.tsx › TXT.st.in_progress` | | |
| 315 | Status | الحالة |  | `features/dashboard/TripFilters.tsx › TXT.status` +3 | | |
| 316 | Filter trips | تصفية الرحلات |  | `features/dashboard/TripFilters.tsx › TXT.title` | | |
| 317 | To date | إلى تاريخ |  | `features/dashboard/TripFilters.tsx › TXT.to` | | |
| 318 | No bus | بدون حافلة |  | `features/dashboard/TripFilters.tsx › TXT.unassignedBus` | | |
| 319 | No driver | بدون سائق |  | `features/dashboard/TripFilters.tsx › TXT.unassignedDriver` | | |

## Passenger marketplace

| # | English | Arabic (current) | Flag | Where | Decision | Reviewed Arabic |
|---|---|---|---|---|---|---|
| 1 | Brand Accent Color | اللون الثانوي |  | `ui/lib/i18n.ts › translations.accentColor` | | |
| 2 | Action Executed | الإجراء المنفذ |  | `ui/lib/i18n.ts › translations.actionExecuted` | | |
| 3 | Actions | الإجراءات |  | `ui/lib/i18n.ts › translations.actions` +1 | | |
| 4 | fleet vehicles in active deployment. | حافلات في الخدمة الميدانية النشطة. |  | `ui/lib/i18n.ts › translations.activeBusesDeployed` | | |
| 5 | Active (Full Platform Access) | نشط (صلاحية كاملة للمنصة) |  | `ui/lib/i18n.ts › translations.activeFullAccess` | | |
| 6 | Active Routes | خطوط السير النشطة |  | `ui/lib/i18n.ts › translations.activeRoutes` | | |
| 7 | Active Rule | قاعدة نشطة |  | `ui/lib/i18n.ts › translations.activeRule` | | |
| 8 | Active Status | حالة النشاط |  | `ui/lib/i18n.ts › translations.activeStatus` | | |
| 9 | Active Trips Today | رحلات اليوم النشطة |  | `ui/lib/i18n.ts › translations.activeTripsToday` | | |
| 10 | Actor | المستخدم |  | `ui/lib/i18n.ts › translations.actor` | | |
| 11 | Add New | إضافة جديد |  | `ui/lib/i18n.ts › translations.add` | | |
| 12 | Add Coach | إضافة حافلة |  | `ui/lib/i18n.ts › translations.addCoach` | | |
| 13 | Add Travel Companion | إضافة مرافق سفر |  | `ui/lib/i18n.ts › translations.addCompanion` | | |
| 14 | Route a white-label domain name to an operator's public booking portal. | توجيه اسم نطاق خاص لموقع حجز التذاكر المستقل للشركة. |  | `ui/lib/i18n.ts › translations.addCustomDomainDesc` | | |
| 15 | Add Tenant Custom Domain | ربط نطاق مخصص للشركة |  | `ui/lib/i18n.ts › translations.addCustomDomainTitle` | | |
| 16 | Add Captain | إضافة كابتن |  | `ui/lib/i18n.ts › translations.addDriver` | | |
| 17 | Afternoon | ظهراً |  | `ui/lib/i18n.ts › translations.afternoon` | | |
| 18 | Afternoon (12:00 - 16:59) | ظهراً (١٢:٠٠ - ١٦:٥٩) |  | `ui/lib/i18n.ts › translations.afternoonSlot` | | |
| 19 | Alexandria ↔ Galala University | الإسكندرية ↔ جامعة الجلالة |  | `ui/lib/i18n.ts › translations.alexGalala` | | |
| 20 | All | الكل |  | `ui/lib/i18n.ts › translations.all` +1 | | |
| 21 | Any Time | أي وقت |  | `ui/lib/i18n.ts › translations.allDay` | | |
| 22 | All Destinations | كافة الوجهات |  | `ui/lib/i18n.ts › translations.allDestinations` +1 | | |
| 23 | All Bus Operators | كافة شركات النقل |  | `ui/lib/i18n.ts › translations.allOperators` | | |
| 24 | All Origin Cities | كافة مدن ومحافظات الانطلاق |  | `ui/lib/i18n.ts › translations.allOrigins` +1 | | |
| 25 | All Passengers Boarded | صعد جميع الركاب |  | `ui/lib/i18n.ts › translations.allPassengersBoarded` | | |
| 26 | All rights reserved. Fictional transit demonstration. | جميع الحقوق محفوظة. نموذج نقل توضيحي تجريبي. |  | `ui/lib/i18n.ts › translations.allRightsReserved` | | |
| 27 | Coach Amenities | ميزات وخدمات الحافلة |  | `ui/lib/i18n.ts › translations.amenities` | | |
| 28 | Amenities & Luggage Rules | خدمات الحافلة وسياسة الأمتعة |  | `ui/lib/i18n.ts › translations.amenitiesRules` | | |
| 29 | Announcement Notice | شريط الإعلانات والتنبيهات |  | `ui/lib/i18n.ts › translations.announcementBanner` | | |
| 30 | Any Price | أي سعر |  | `ui/lib/i18n.ts › translations.anyPrice` | | |
| 31 | Arrival Time | وقت الوصول |  | `ui/lib/i18n.ts › translations.arrivalTime` | | |
| 32 | Assigned Bus: | الحافلة المعينة: |  | `ui/lib/i18n.ts › translations.assignedBusLabel` | | |
| 33 | Assigned Coach | الحافلة المعينة |  | `ui/lib/i18n.ts › translations.assignedCoach` | | |
| 34 | Assigned Operator | مشغل الحافلات |  | `ui/lib/i18n.ts › translations.assignedOperator` | | |
| 35 | at | الساعة |  | `ui/lib/i18n.ts › translations.atTime` | | |
| 36 | Platform Audit Logs | سجل نشاط النظام |  | `ui/lib/i18n.ts › translations.auditLogs` | | |
| 37 | Account details autofilled for fast checkout. | تم تعبئة بيانات الحساب تلقائياً لتسريع الحجز. |  | `ui/lib/i18n.ts › translations.autofillApplied` | | |
| 38 | Available Capacity | السعة المتاحة |  | `ui/lib/i18n.ts › translations.availableCapacity` | | |
| 39 | Base Fare | السعر الأساسي |  | `ui/lib/i18n.ts › translations.baseFare` | | |
| 40 | Base Fare (EGP) | السعر الأساسي (ج.م) |  | `ui/lib/i18n.ts › translations.baseFareLabel` | | |
| 41 | Boarded | صعد الحافلة |  | `ui/lib/i18n.ts › translations.boarded` | | |
| 42 | Boarding | صعود الركاب |  | `ui/lib/i18n.ts › translations.boarding` | | |
| 43 | Boarding Origin | نقطة الانطلاق |  | `ui/lib/i18n.ts › translations.boardingOrigin` | | |
| 44 | Booked / Capacity | المحجوز / السعة |  | `ui/lib/i18n.ts › translations.bookedRatio` | | |
| 45 | Seats Booked | مقعد محجوز |  | `ui/lib/i18n.ts › translations.bookedSeatsCount` | | |
| 46 | Book for someone else | الحجز لشخص آخر |  | `ui/lib/i18n.ts › translations.bookForSomeoneElse` | | |
| 47 | Booking Reference | رقم الحجز المرجعي |  | `ui/lib/i18n.ts › translations.bookingRef` | | |
| 48 | Booking Ref | رقم الحجز |  | `ui/lib/i18n.ts › translations.bookingRefHeader` | | |
| 49 | Bookings | الحجوزات |  | `ui/lib/i18n.ts › translations.bookings` +1 | | |
| 50 | Book Seat | احجز مقعدك |  | `ui/lib/i18n.ts › translations.bookNow` | | |
| 51 | Book with Operator | حجز المقعد مع المشغل |  | `ui/lib/i18n.ts › translations.bookViaOperator` | | |
| 52 | Book Your Seat | احجز مقعدك الآن |  | `ui/lib/i18n.ts › translations.bookYourSeat` | | |
| 53 | Brand Primary Color | اللون الأساسي للعلامة |  | `ui/lib/i18n.ts › translations.brandColor` | | |
| 54 | Configure colors, logo typography, hero text, and public notices visible to passengers. | تحكم في ألوان الموقع، الشعار، نصوص الواجهة والإعلانات التي تظهر للركاب والطلاب. |  | `ui/lib/i18n.ts › translations.brandingDesc` | | |
| 55 | Website branding successfully updated! | تم حفظ هوية الموقع بنجاح! |  | `ui/lib/i18n.ts › translations.brandingSaved` | | |
| 56 | White-Label Branding & Public Site | تخصيص الهوية والموقع العام |  | `ui/lib/i18n.ts › translations.brandingSettings` | | |
| 57 | Buses | أسطول الحافلات |  | `ui/lib/i18n.ts › translations.buses` | | |
| 58 | Coach Plate | رقم لوحة الحافلة |  | `ui/lib/i18n.ts › translations.busPlate` | | |
| 59 | Fleet Availability | جاهزية الأسطول |  | `ui/lib/i18n.ts › translations.busUtilization` | | |
| 60 | Cairo ↔ Galala University | القاهرة ↔ جامعة الجلالة |  | `ui/lib/i18n.ts › translations.cairoGalala` | | |
| 61 | Call Operations | اتصل بغرفة العمليات |  | `ui/lib/i18n.ts › translations.callSupport` | | |
| 62 | Campus Gate | بوابة الحرم الجامعي |  | `ui/lib/i18n.ts › translations.campusGate` | | |
| 63 | Cancellation up to 3 hrs prior | إمكانية الإلغاء حتى ٣ ساعات قبل الانطلاق |  | `ui/lib/i18n.ts › translations.cancellation3hrs` | | |
| 64 | Reason for Cancellation | سبب طلب الإلغاء |  | `ui/lib/i18n.ts › translations.cancellationReasonLabel` | | |
| 65 | e.g., Exam schedule changed, personal emergency... | مثال: تغيير جدول المحاضرات، ظرف طارئ... |  | `ui/lib/i18n.ts › translations.cancellationReasonPlaceholder` | | |
| 66 | Cancellation Requested | طلب إلغاء قيد المراجعة |  | `ui/lib/i18n.ts › translations.cancellationRequested` | | |
| 67 | Pending Review | قيد المراجعة |  | `ui/lib/i18n.ts › translations.cancellationRequestedBadge` | | |
| 68 | Cancellation request submitted. An operator will review it shortly. | تم تقديم طلب الإلغاء بنجاح وسيتم تدقيقه من إدارة المشغل. |  | `ui/lib/i18n.ts › translations.cancellationRequestSubmitted` | | |
| 69 | Cancel Trip | إلغاء الرحلة |  | `ui/lib/i18n.ts › translations.cancelTrip` | | |
| 70 | Capacity based reservation (V1) | حجز فوري حسب السعة المتاحة |  | `ui/lib/i18n.ts › translations.capacityBasedV1` | | |
| 71 | Captain | الكابتن |  | `ui/lib/i18n.ts › translations.captain` | | |
| 72 | Captains | السائقون |  | `ui/lib/i18n.ts › translations.captains` | | |
| 73 | Cash & POS on-board payments | دفع نقدي أو بالبطاقة عند الصعود |  | `ui/lib/i18n.ts › translations.cashAndPosPayments` | | |
| 74 | Climate Controlled AC | تكييف هواء مركزي |  | `ui/lib/i18n.ts › translations.climateAc` | | |
| 75 | Coach Model & Specification | موديل الحافلة والمواصفات |  | `ui/lib/i18n.ts › translations.coachModelSpec` | | |
| 76 | Commuter | مسافر |  | `ui/lib/i18n.ts › translations.commuter` | | |
| 77 | Registered Bus Companies | دليل شركات النقل |  | `ui/lib/i18n.ts › translations.companiesDirectory` | | |
| 78 | Companion Name | اسم المرافق |  | `ui/lib/i18n.ts › translations.companionName` | | |
| 79 | Operator Dashboard | لوحة تحكم مشغل الرحلات |  | `ui/lib/i18n.ts › translations.companyDashboard` | | |
| 80 | Company Name | اسم الشركة |  | `ui/lib/i18n.ts › translations.companyName` | | |
| 81 | Company Arabic Name | اسم الشركة بالعربية |  | `ui/lib/i18n.ts › translations.companyNameAr` | | |
| 82 | Company English Name | اسم الشركة بالإنجليزية |  | `ui/lib/i18n.ts › translations.companyNameEn` | | |
| 83 | Operator Settings | إعدادات الشركة |  | `ui/lib/i18n.ts › translations.companySettings` | | |
| 84 | Available Cross-Operator Departures | الرحلات المتاحة عبر كافة الشركات |  | `ui/lib/i18n.ts › translations.compareTripsFound` | | |
| 85 | Confirm & Issue Boarding Pass | تأكيد الحجز وإصدار التذكرة |  | `ui/lib/i18n.ts › translations.confirmBookingButton` | | |
| 86 | Need Assistance? | هل تحتاج إلى مساعدة؟ |  | `ui/lib/i18n.ts › translations.contactSupport` | | |
| 87 | Continue as Guest | المتابعة كزائر |  | `ui/lib/i18n.ts › translations.continueAsGuest` | | |
| 88 | Corridor / Route | خط السير |  | `ui/lib/i18n.ts › translations.corridorRoute` | | |
| 89 | Create | إنشاء |  | `ui/lib/i18n.ts › translations.create` | | |
| 90 | Add a new passenger route between university and Egyptian cities. | إضافة خط سير لنقل الركاب بين الجامعة والمحافظات المصرية. |  | `ui/lib/i18n.ts › translations.createNewRouteDesc` | | |
| 91 | Create New Intercity Route | إضافة خط سير جديد |  | `ui/lib/i18n.ts › translations.createNewRouteModal` | | |
| 92 | Schedule New Trip | جدولة رحلة جديدة |  | `ui/lib/i18n.ts › translations.createNewTrip` | | |
| 93 | Automates daily departure creation according to university calendar. | أتمتة إنشاء الرحلات اليومية وفقاً للتقويم الدراسي للجامعة. |  | `ui/lib/i18n.ts › translations.createRecurringScheduleDesc` | | |
| 94 | Create Recurring Schedule | إنشاء جدول دوري جديد |  | `ui/lib/i18n.ts › translations.createRecurringScheduleTitle` | | |
| 95 | Current Semester | الفصل الدراسي الحالي |  | `ui/lib/i18n.ts › translations.currentSemester` | | |
| 96 | Custom Domain Hostname | اسم النطاق المخصص |  | `ui/lib/i18n.ts › translations.customDomainHostname` | | |
| 97 | Custom Domain Routing | ربط النطاقات الخاصة |  | `ui/lib/i18n.ts › translations.customDomains` | | |
| 98 | Customer Portal | بوابة الراكب |  | `ui/lib/i18n.ts › translations.customerPortal` | | |
| 99 | Customers | الركاب والطلاب |  | `ui/lib/i18n.ts › translations.customers` | | |
| 100 | Daily departure at | انطلاق يومي في الساعة |  | `ui/lib/i18n.ts › translations.dailyDepartureAt` | | |
| 101 | Daily scheduled direct intercity bus links operated by | رحلات مباشرة يومية مجدولة مشغلة بواسطة |  | `ui/lib/i18n.ts › translations.dailyScheduledDirectLinks` | | |
| 102 | Dark | ليلي |  | `ui/lib/i18n.ts › translations.darkMode` | | |
| 103 | Overview | نظرة عامة |  | `ui/lib/i18n.ts › translations.dashboard` | | |
| 104 | Dashboard | لوحة المشغل |  | `ui/lib/i18n.ts › translations.dashboardJump` | | |
| 105 | Days of Week | أيام الأسبوع |  | `ui/lib/i18n.ts › translations.daysOfWeek` | | |
| 106 | Fictional transit demonstration data for platform testing. | بيانات ونماذج توضيحية تجريبية لاختبار المنصة. |  | `ui/lib/i18n.ts › translations.demoDataNotice` | | |
| 107 | Simulated Demonstration Data: Schedules, fares, and fleet details are fictional examples for platform testing. | بيانات تجريبية توضيحية: المواعيد والأسعار والشركات هي نماذج لاختبار النظام وليست خدمات واقعية. |  | `ui/lib/i18n.ts › translations.demoDisclaimer` | | |
| 108 | Departure | موعد الإقلاع |  | `ui/lib/i18n.ts › translations.departure` | | |
| 109 | Departure Fully Booked | الرحلة مكتملة العدد |  | `ui/lib/i18n.ts › translations.departureFullyBooked` | | |
| 110 | Departure | الانطلاق |  | `ui/lib/i18n.ts › translations.departureLabel` +1 | | |
| 111 | Departures | رحلات |  | `ui/lib/i18n.ts › translations.departures` | | |
| 112 | Departure Time | وقت الانطلاق |  | `ui/lib/i18n.ts › translations.departureTimeOfDay` +1 | | |
| 113 | Destination | نقطة الوصول |  | `ui/lib/i18n.ts › translations.destination` | | |
| 114 | Destination Station | محطة الوصول |  | `ui/lib/i18n.ts › translations.destStationLabel` | | |
| 115 | Details | تفاصيل الإجراء |  | `ui/lib/i18n.ts › translations.details` | | |
| 116 | Dev Switcher: Switch between Master Marketplace, White-Label Tenant Sites, Operator Dashboard, and Super Admin. In production, routing is controlled by subdomains and auth. | شريط المعاينة للمطورين: تنقل بين سوق الرحلات المجمع ومواقع الشركات ولوحة المشغل والإدارة العليا. |  | `ui/lib/i18n.ts › translations.devNotice` | | |
| 117 | MASAR DEV: | ملاكي تجريبي: |  | `ui/lib/i18n.ts › translations.devSwitcherBadge` | | |
| 118 | Dev Switcher | مبدل المعاينة |  | `ui/lib/i18n.ts › translations.devSwitcherTitle` | | |
| 119 | Direct | مباشر |  | `ui/lib/i18n.ts › translations.direct` | | |
| 120 | Direct Intercity Transit | نقل مباشر بين المدن |  | `ui/lib/i18n.ts › translations.directIntercityTransit` | | |
| 121 | Direct Routes | خطوط السير المباشرة |  | `ui/lib/i18n.ts › translations.directRoutesFooter` | | |
| 122 | Dispatch Status | حالة الرحلة |  | `ui/lib/i18n.ts › translations.dispatchStatus` | | |
| 123 | Distance (km) | المسافة (كم) |  | `ui/lib/i18n.ts › translations.distanceKmLabel` | | |
| 124 | Distance | المسافة |  | `ui/lib/i18n.ts › translations.distanceLabel` | | |
| 125 | DNS Status | حالة الربط |  | `ui/lib/i18n.ts › translations.dnsStatus` | | |
| 126 | Target CNAME | هدف CNAME |  | `ui/lib/i18n.ts › translations.dnsTarget` | | |
| 127 | Domain Hostname (FQDN) | اسم النطاق (FQDN) |  | `ui/lib/i18n.ts › translations.domainFqdnLabel` | | |
| 128 | The operator must add a CNAME record pointing to cname.malakybus.com | يجب على المشغل إضافة سجل CNAME يشير إلى cname.malakybus.com |  | `ui/lib/i18n.ts › translations.domainHelperText` | | |
| 129 | Draft Version | مسودة العمل |  | `ui/lib/i18n.ts › translations.draftVersion` | | |
| 130 | Captain Full Name (Arabic) | اسم الكابتن بالعربية |  | `ui/lib/i18n.ts › translations.driverFullNameAr` | | |
| 131 | Captain Full Name (English) | اسم الكابتن بالإنجليزية |  | `ui/lib/i18n.ts › translations.driverFullNameEn` | | |
| 132 | Driver: | السائق: |  | `ui/lib/i18n.ts › translations.driverLabel` | | |
| 133 | Commercial Driver License Number | رقم رخصة القيادة المهنية |  | `ui/lib/i18n.ts › translations.driverLicenseLabel` | | |
| 134 | Driver Mobile (+20) | رقم هاتف السائق (+20) |  | `ui/lib/i18n.ts › translations.driverPhoneLabel` | | |
| 135 | Drivers | السائقون |  | `ui/lib/i18n.ts › translations.drivers` +1 | | |
| 136 | Driver Boarding Scanner | ماسح صعود الركاب للسائق |  | `ui/lib/i18n.ts › translations.driverScannerTitle` | | |
| 137 | Drop-off Stop | نقطة النزول |  | `ui/lib/i18n.ts › translations.dropoffPoint` | | |
| 138 | Duplicate Boarding Alert | تنبيه: محاولة صعود مكررة |  | `ui/lib/i18n.ts › translations.duplicateBoardingWarning` | | |
| 139 | Duration | المدة |  | `ui/lib/i18n.ts › translations.duration` | | |
| 140 | Duration (min) | المدة (دقيقة) |  | `ui/lib/i18n.ts › translations.durationMinLabel` | | |
| 141 | Edit | تعديل |  | `ui/lib/i18n.ts › translations.edit` +1 | | |
| 142 | Egyptian License Plate | رقم اللوحة المعدنية المصرية |  | `ui/lib/i18n.ts › translations.egyptianLicensePlate` | | |
| 143 | 01012345678 | 01012345678 | SAME AS EN | `ui/lib/i18n.ts › translations.egyptianPhonePlaceholder` | | |
| 144 | Email Address | البريد الإلكتروني |  | `ui/lib/i18n.ts › translations.emailLabel` | | |
| 145 | Email Support | تواصل عبر البريد |  | `ui/lib/i18n.ts › translations.emailSupport` | | |
| 146 | Get started by creating your first entry. | ابدأ بإضافة أول عنصر في النظام. |  | `ui/lib/i18n.ts › translations.emptyDesc` | | |
| 147 | No records found | لا توجد بيانات مسجلة | empty/guidance | `ui/lib/i18n.ts › translations.emptyTitle` | | |
| 148 | Enrolled Galala University students and frequent commuters using this service. | طلاب جامعة الجلالة والمسافرون الدائمون المسجلون بالخدمة. |  | `ui/lib/i18n.ts › translations.enrolledStudentsDesc` | | |
| 149 | Est. Arrival | الوصول المتوقع |  | `ui/lib/i18n.ts › translations.estArrival` +1 | | |
| 150 | Est. Duration | المدة المتوقعة |  | `ui/lib/i18n.ts › translations.estDuration` | | |
| 151 | Evening | مساءً |  | `ui/lib/i18n.ts › translations.evening` | | |
| 152 | Evening (17:00 - 23:59) | مساءً (١٧:٠٠ - ٢٣:٥٩) |  | `ui/lib/i18n.ts › translations.eveningSlot` | | |
| 153 | Export CSV Report | تصدير تقرير CSV |  | `ui/lib/i18n.ts › translations.exportCsv` | | |
| 154 | Frequently Asked Questions | الأسئلة الشائعة |  | `ui/lib/i18n.ts › translations.faqsTitle` | | |
| 155 | Fare | الأجرة |  | `ui/lib/i18n.ts › translations.fare` +1 | | |
| 156 | Filter | تصفية |  | `ui/lib/i18n.ts › translations.filter` | | |
| 157 | Filter by Company | تصفية حسب الشركة |  | `ui/lib/i18n.ts › translations.filterByCompany` | | |
| 158 | Search Available Routes | ابحث عن الرحلات المتاحة |  | `ui/lib/i18n.ts › translations.findRoute` | | |
| 159 | Fleet Buses | أسطول الحافلات |  | `ui/lib/i18n.ts › translations.fleetBuses` | | |
| 160 | Fleet coaches | حافلات الأسطول |  | `ui/lib/i18n.ts › translations.fleetCoaches` | | |
| 161 | Fleet Size | عدد الحافلات |  | `ui/lib/i18n.ts › translations.fleetSize` | | |
| 162 | Forgot Password? | نسيت كلمة المرور؟ |  | `ui/lib/i18n.ts › translations.forgotPassword` | | |
| 163 | Free 25kg Campus Dorm Luggage | حقيبة سكن مجانية وزن ٢٥ كجم |  | `ui/lib/i18n.ts › translations.freeLuggage25kg` | | |
| 164 | Free Student Wi-Fi | إنترنت مجاني للطلاب |  | `ui/lib/i18n.ts › translations.freeStudentWifi` | | |
| 165 | Fri | الجمعة |  | `ui/lib/i18n.ts › translations.fri` | | |
| 166 | From (City / Location) | محطة الانطلاق (المدينة) |  | `ui/lib/i18n.ts › translations.fromOrigin` | | |
| 167 | Full Audit Log → | عرض كامل سجل النشاط ← |  | `ui/lib/i18n.ts › translations.fullAuditLog` | | |
| 168 | Full Name | الاسم بالكامل |  | `ui/lib/i18n.ts › translations.fullNameLabel` | | |
| 169 | e.g. Omar Khaled Al-Attar | مثال: عمر خالد العطار |  | `ui/lib/i18n.ts › translations.fullNamePlaceholder` | | |
| 170 | Fully Booked | مكتمل العدد |  | `ui/lib/i18n.ts › translations.fullyBooked` | | |
| 171 | All seats on this coach have been reserved. Please select another departure time. | اكتمل حجز كافة المقاعد في هذه الحافلة، يرجى اختيار موعد آخر. |  | `ui/lib/i18n.ts › translations.fullyBookedNotice` | | |
| 172 | Galala Certified | معتمد لخطوط الجلالة |  | `ui/lib/i18n.ts › translations.galalaCertified` | | |
| 173 | Galala Verified Student | طالب موثق بجامعة الجلالة |  | `ui/lib/i18n.ts › translations.galalaVerifiedStudent` | | |
| 174 | GPS Monitored | مراقب بنظام GPS |  | `ui/lib/i18n.ts › translations.gpsMonitored` | | |
| 175 | Monthly Revenue | إيرادات الشهر (ج.م) |  | `ui/lib/i18n.ts › translations.grossRevenue` | | |
| 176 | Guest Checkout | المتابعة كزائر |  | `ui/lib/i18n.ts › translations.guestCheckout` | | |
| 177 | Continue without an account, or sign in to save your trip and autofill passenger details. | يمكنك إتمام الحجز بدون تسجيل، أو تسجيل الدخول لحفظ التذكرة والتعبئة التلقائية للبيانات. |  | `ui/lib/i18n.ts › translations.guestCheckoutNotice` | | |
| 178 | Hero Headline | عنوان الواجهة الرئيسية |  | `ui/lib/i18n.ts › translations.heroHeadline` | | |
| 179 | Hero Subtitle | الوصف التعريفي للخدمة |  | `ui/lib/i18n.ts › translations.heroSubheadline` | | |
| 180 | Hide Bar | إخفاء الشريط |  | `ui/lib/i18n.ts › translations.hidePreview` | | |
| 181 | Highest Yield Route | أعلى خط سير عائداً |  | `ui/lib/i18n.ts › translations.highestYieldRoute` | | |
| 182 | 140 EGP/seat · 4 trips daily | ١٤٠ ج.م / مقعد · ٤ رحلات يومياً |  | `ui/lib/i18n.ts › translations.highestYieldRouteStats` | | |
| 183 | High-Speed Wi-Fi | إنترنت فائق السرعة |  | `ui/lib/i18n.ts › translations.highSpeedWifi` | | |
| 184 | Homepage & Hero Copy | نصوص واجهة الموقع |  | `ui/lib/i18n.ts › translations.homepageCopySection` | | |
| 185 | Hotline | الخط الساخن |  | `ui/lib/i18n.ts › translations.hotline` | | |
| 186 | How to Book | كيف تحجز مقعدك؟ |  | `ui/lib/i18n.ts › translations.howToBook` | | |
| 187 | Effortless 3-step student transport reservation with zero upfront payment. | حجز مقعد بثلاث خطوات سهلة دون دفع مسبق. |  | `ui/lib/i18n.ts › translations.howToBookSubtitle` | | |
| 188 | Idle | متوقفة |  | `ui/lib/i18n.ts › translations.idle` | | |
| 189 | Immutable platform event ledger recording security, dispatch mutations, and billing adjustments. | سجل موثوق وغير قابل للتعديل يوثق أمان المنصة والرحلات والعمليات المالية. |  | `ui/lib/i18n.ts › translations.immutableLedgerNotice` | | |
| 190 | In Transit | في الطريق |  | `ui/lib/i18n.ts › translations.in_transit` | | |
| 191 | Included Capabilities | الميزات المشمولة |  | `ui/lib/i18n.ts › translations.includedCapabilities` | | |
| 192 | Installed Amenities | الخدمات والتجهيزات |  | `ui/lib/i18n.ts › translations.installedAmenities` | | |
| 193 | Ismailia ↔ Galala University | الإسماعيلية ↔ جامعة الجلالة |  | `ui/lib/i18n.ts › translations.ismailiaGalala` | | |
| 194 | Brand customizations strictly apply to this tenant. Other operators maintain their own isolated logos, colors, and DNS routes. | التخصيصات تطبق على هذه الشركة حصراً، وتحتفظ بقية الشركات بهويتها وألوانها ونطاقاتها المستقلة. |  | `ui/lib/i18n.ts › translations.isolationGuaranteeDesc` | | |
| 195 | Landmark: | المعلم المميز: |  | `ui/lib/i18n.ts › translations.landmarkLabel` | | |
| 196 | عربي | English |  | `ui/lib/i18n.ts › translations.langToggle` | | |
| 197 | Language | اللغة |  | `ui/lib/i18n.ts › translations.languageLabel` | | |
| 198 | Licensed Coach Fleet | أسطول حافلات سياحية مرخصة |  | `ui/lib/i18n.ts › translations.licensedCoachFleet` | | |
| 199 | Plate: | اللوحة: |  | `ui/lib/i18n.ts › translations.licensePlateLabel` | | |
| 200 | Light | نهاري |  | `ui/lib/i18n.ts › translations.lightMode` | | |
| 201 | Live operational manifest for coaches on Galala highway. | جدول الحركة المباشر للحافلات على طريق هضبة الجلالة. |  | `ui/lib/i18n.ts › translations.liveDispatchQueueSubtitle` | | |
| 202 | Live White-Label Preview | معاينة مباشرة للموقع المستقل |  | `ui/lib/i18n.ts › translations.livePreview` | | |
| 203 | Live student reservations made online. | حجوزات الطلاب المباشرة عبر الإنترنت. |  | `ui/lib/i18n.ts › translations.liveStudentReservations` | | |
| 204 | Loading... | جاري التحميل... |  | `ui/lib/i18n.ts › translations.loading` | | |
| 205 | Logged in as | مسجل الدخول باسم |  | `ui/lib/i18n.ts › translations.loggedInAs` | | |
| 206 | Log In | تسجيل الدخول |  | `ui/lib/i18n.ts › translations.logIn` | | |
| 207 | Karim (Galala CS Student) | كريم (طالب حاسبات ومعلومات بالجلالة) |  | `ui/lib/i18n.ts › translations.loginAsKarim` | | |
| 208 | Nourhan (Regular Commuter) | نورهان (مسافرة منتظمة) |  | `ui/lib/i18n.ts › translations.loginAsNourhan` | | |
| 209 | 1 Bag (25kg) + 1 Backpack | حقيبة سفر (٢٥ كجم) + حقيبة ظهر |  | `ui/lib/i18n.ts › translations.luggagePolicy` | | |
| 210 | Maintenance | تحت الصيانة |  | `ui/lib/i18n.ts › translations.maintenance` | | |
| 211 | Manage | إدارة |  | `ui/lib/i18n.ts › translations.manageCompany` +1 | | |
| 212 | Manage Directory → | إدارة دليل الشركات ← |  | `ui/lib/i18n.ts › translations.manageDirectory` | | |
| 213 | Manage Operator Account | إدارة حساب مشغل الحافلات |  | `ui/lib/i18n.ts › translations.manageOperatorModal` | | |
| 214 | Edit Status & Plan | تعديل الحالة والباقة |  | `ui/lib/i18n.ts › translations.manageStatusPlan` | | |
| 215 | Manufacture Year | سنة الصنع |  | `ui/lib/i18n.ts › translations.manufactureYearLabel` | | |
| 216 | Mark Active | تفعيل الحافلة |  | `ui/lib/i18n.ts › translations.markActive` | | |
| 217 | Mark Boarded | تأكيد الصعود |  | `ui/lib/i18n.ts › translations.markBoarded` | | |
| 218 | Open Boarding | فتح الصعود |  | `ui/lib/i18n.ts › translations.markBoarding` | | |
| 219 | Mark Completed | إنهاء الرحلة (وصلت) |  | `ui/lib/i18n.ts › translations.markCompleted` | | |
| 220 | Mark In Transit | بدء الرحلة (في الطريق) |  | `ui/lib/i18n.ts › translations.markDeparted` | | |
| 221 | Search aggregated daily intercity departures across all vetted Egyptian bus operators connecting Cairo, Canal cities, and Alexandria with Galala campus. | ابحث في كافة مواعيد الحافلات المكيفة اليومية التابعة لشركات النقل المعتمدة الرابطة بين القاهرة ومدن القناة والإسكندرية وهضبة الجلالة. |  | `ui/lib/i18n.ts › translations.marketplaceHeroSubtitle` | | |
| 222 | Find & Compare Buses to Galala University | قارن واحجز رحلات جامعة الجلالة بين كافة الشركات |  | `ui/lib/i18n.ts › translations.marketplaceHeroTitle` | | |
| 223 | Master Marketplace | سوق الرحلات المجمع |  | `ui/lib/i18n.ts › translations.marketplaceView` | | |
| 224 | Mark In Maintenance | تحويل للصيانة |  | `ui/lib/i18n.ts › translations.markInMaintenance` | | |
| 225 | Min. Available Seats | أقل عدد مقاعد شاغرة |  | `ui/lib/i18n.ts › translations.minAvailableCapacity` | | |
| 226 | min | دقيقة |  | `ui/lib/i18n.ts › translations.minDuration` | | |
| 227 | At least 1 seat available | مقعد واحد شاغر على الأقل |  | `ui/lib/i18n.ts › translations.minSeats1` | | |
| 228 | At least 10 seats available | ١٠ مقاعد شاغرة على الأقل |  | `ui/lib/i18n.ts › translations.minSeats10` | | |
| 229 | At least 3 seats available | ٣ مقاعد شاغرة على الأقل |  | `ui/lib/i18n.ts › translations.minSeats3` | | |
| 230 | At least 5 seats available | ٥ مقاعد شاغرة على الأقل |  | `ui/lib/i18n.ts › translations.minSeats5` | | |
| 231 | Model Year | سنة الصنع |  | `ui/lib/i18n.ts › translations.modelYear` | | |
| 232 | Mon | الإثنين |  | `ui/lib/i18n.ts › translations.mon` | | |
| 233 | Monthly Total Commute Revenue | إجمالي إيرادات النقل الشهرية |  | `ui/lib/i18n.ts › translations.monthlyCommuteRevenue` | | |
| 234 | Route profitability, passenger commuter volume, and revenue analytics. | تحليلات أرباح خطوط السير وكثافة ركاب الطلاب والإيرادات. |  | `ui/lib/i18n.ts › translations.monthlyCommuteRevenueDesc` | | |
| 235 | +18.4% compared to previous month | +١٨.٤٪ مقارنة بالشهر السابق |  | `ui/lib/i18n.ts › translations.monthRevenueComp` | | |
| 236 | Morning | صباحاً |  | `ui/lib/i18n.ts › translations.morning` | | |
| 237 | Morning (05:00 - 11:59) | صباحاً (٠٥:٠٠ - ١١:٥٩) |  | `ui/lib/i18n.ts › translations.morningSlot` | | |
| 238 | Most Popular | الأكثر طلباً |  | `ui/lib/i18n.ts › translations.mostPopular` | | |
| 239 | Multi-Tenant Core Active | نظام إدارة الشركات المتعددة نشط |  | `ui/lib/i18n.ts › translations.multiTenantCore` | | |
| 240 | My Account | حسابي |  | `ui/lib/i18n.ts › translations.myAccount` | | |
| 241 | My Trips & Bookings | رحلاتي وحجوزاتي |  | `ui/lib/i18n.ts › translations.myBookings` | | |
| 242 | Book Another Trip | حجز رحلة أخرى |  | `ui/lib/i18n.ts › translations.newBooking` | | |
| 243 | New Cairo ↔ Galala University | القاهرة الجديدة ↔ جامعة الجلالة |  | `ui/lib/i18n.ts › translations.newCairoGalala` | | |
| 244 | New Route | خط سير جديد |  | `ui/lib/i18n.ts › translations.newRoute` | | |
| 245 | No-show | لم يحضر |  | `ui/lib/i18n.ts › translations.no_show` | | |
| 246 | No active departures currently listed. | لا توجد رحلات مجدولة حالياً. |  | `ui/lib/i18n.ts › translations.noActiveDepartures` | | |
| 247 | No bookings found matching current filters. | لا توجد حجوزات تطابق الفلتر الحالي. | empty/guidance | `ui/lib/i18n.ts › translations.noBookingsMatchFilter` | | |
| 248 | Normalized Location Search across Cairo, Suez, Ismailia & Alex | بحث موحد للمحطات عبر القاهرة والسويس والإسماعيلية والإسكندرية |  | `ui/lib/i18n.ts › translations.normalizedSearchBadge` | | |
| 249 | No trips scheduled for the selected date and route. | لا توجد رحلات مجدولة في هذا التاريخ للخط المحدد. | empty/guidance | `ui/lib/i18n.ts › translations.noTripsFound` | | |
| 250 | No trips match the current filter. | لا توجد رحلات تطابق البحث الحالي. | empty/guidance | `ui/lib/i18n.ts › translations.noTripsMatchFilter` | | |
| 251 | Occupancy | الإشغال |  | `ui/lib/i18n.ts › translations.occupancy` | | |
| 252 | Average Occupancy Rate | متوسط نسبة الإشغال |  | `ui/lib/i18n.ts › translations.occupancyRate` | | |
| 253 | Off Duty | خارج الخدمة |  | `ui/lib/i18n.ts › translations.off_duty` | | |
| 254 | On Trip | في رحلة |  | `ui/lib/i18n.ts › translations.on_trip` | | |
| 255 | Onboarded | تاريخ الانضمام |  | `ui/lib/i18n.ts › translations.onboardedDate` | | |
| 256 | 98.2% on-time lecture arrivals | ٩٨.٢٪ نسبة وصول قبل موعد المحاضرات |  | `ui/lib/i18n.ts › translations.onTimeArrivals` | | |
| 257 | Open Operator Dashboard | فتح لوحة المشغل |  | `ui/lib/i18n.ts › translations.openOperatorDashboard` | | |
| 258 | Operating Days | أيام التشغيل |  | `ui/lib/i18n.ts › translations.operatingDays` | | |
| 259 | Fleet Overview | نظرة عامة على الأسطول |  | `ui/lib/i18n.ts › translations.operatingFleet` | | |
| 260 | Operator Identity & Brand Colors | هوية المشغل وألوان العلامة التجارية |  | `ui/lib/i18n.ts › translations.operatorIdentityColors` | | |
| 261 | Operator Login | دخول المشغّلين |  | `ui/lib/i18n.ts › translations.operatorLogin` | | |
| 262 | Operator Profile | ملف مشغل الحافلات |  | `ui/lib/i18n.ts › translations.operatorProfile` | | |
| 263 | Bus operators currently provisioned on MASAR. | شركات النقل المعتمدة حالياً على منصة ملاكي. |  | `ui/lib/i18n.ts › translations.operatorsProvisionedNotice` | | |
| 264 | Student ID (Optional) | رقم كارنيه الطالب (اختياري) |  | `ui/lib/i18n.ts › translations.optionalStudentId` | | |
| 265 | Origin City | مدينة الانطلاق |  | `ui/lib/i18n.ts › translations.originCity` | | |
| 266 | Origin Station | محطة الانطلاق |  | `ui/lib/i18n.ts › translations.originStationLabel` | | |
| 267 | Participating Operators | شركات النقل المشاركة |  | `ui/lib/i18n.ts › translations.participatingOperators` | | |
| 268 | Passenger | اسم المسافر |  | `ui/lib/i18n.ts › translations.passenger` | | |
| 269 | Passenger Capacity | سعة الركاب |  | `ui/lib/i18n.ts › translations.passengerCapacity` | | |
| 270 | Number of Passengers | عدد المقاعد المطلوبة |  | `ui/lib/i18n.ts › translations.passengerCount` | | |
| 271 | Passenger Information | بيانات المسافر |  | `ui/lib/i18n.ts › translations.passengerDetails` | | |
| 272 | Passenger Name | اسم المسافر |  | `ui/lib/i18n.ts › translations.passengerNameHeader` | | |
| 273 | Passenger | الراكب |  | `ui/lib/i18n.ts › translations.passengerNumber` +1 | | |
| 274 | Passenger Rating: | تقييم الركاب: |  | `ui/lib/i18n.ts › translations.passengerRating` | | |
| 275 | Passenger Manifest | بيانات الركاب |  | `ui/lib/i18n.ts › translations.passengersDetailsTitle` | | |
| 276 | passengers | ركاب |  | `ui/lib/i18n.ts › translations.passengersText` | | |
| 277 | Passenger Ticket | تذكرة الراكب |  | `ui/lib/i18n.ts › translations.passengerTicketPass` | | |
| 278 | Passenger Volume | عدد الركاب |  | `ui/lib/i18n.ts › translations.passengerVolume` | | |
| 279 | Password | كلمة المرور |  | `ui/lib/i18n.ts › translations.passwordLabel` | | |
| 280 | Pay in cash or credit card directly upon boarding the coach. | يتم السداد نقداً أو عبر بطاقة الدفع مباشرة عند الصعود إلى الحافلة. |  | `ui/lib/i18n.ts › translations.payAtBoardingNotice` | | |
| 281 | Cash or POS on Boarding | نقداً أو عبر بطاقة الدفع عند الصعود |  | `ui/lib/i18n.ts › translations.payCashPos` | | |
| 282 | Pay on Boarding | الدفع عند الصعود |  | `ui/lib/i18n.ts › translations.payOnBoarding` | | |
| 283 | +3 peak today | +٣ في أوقات الذروة اليوم |  | `ui/lib/i18n.ts › translations.peakTodayCount` | | |
| 284 | / month | / شهرياً |  | `ui/lib/i18n.ts › translations.perMonth` | | |
| 285 | Phone Contact: | رقم الهاتف: |  | `ui/lib/i18n.ts › translations.phoneContact` | | |
| 286 | Mobile Phone (+20) | رقم الهاتف المحمول (+20) |  | `ui/lib/i18n.ts › translations.phoneLabel` | | |
| 287 | 0100 000 0000 | 0100 000 0000 | SAME AS EN | `ui/lib/i18n.ts › translations.phonePlaceholder` | | |
| 288 | Boarding Stop | نقطة الركوب |  | `ui/lib/i18n.ts › translations.pickupPoint` | | |
| 289 | Plan Tier | باقة الاشتراك |  | `ui/lib/i18n.ts › translations.plan` | | |
| 290 | Platform MRR (Subscriptions) | إيرادات الاشتراكات الشهرية |  | `ui/lib/i18n.ts › translations.platformMonthlyMrr` | | |
| 291 | MASAR | منصة ملاكي باص |  | `ui/lib/i18n.ts › translations.platformName` | | |
| 292 | Multi-Tenant Intercity Bus Management | منصة إدارة النقل الجماعي للجامعات والمدن |  | `ui/lib/i18n.ts › translations.platformTagline` | | |
| 293 | Plus platform transaction fee per ticket | بالإضافة إلى رسوم المعاملة للمنصة |  | `ui/lib/i18n.ts › translations.plusPlatformFee` | | |
| 294 | Popular Campus Routes | أهم خطوط جامعة الجلالة |  | `ui/lib/i18n.ts › translations.popularRoutes` | | |
| 295 | Direct, air-conditioned scheduled lines to and from Galala University. | حافلات سريعة ومكيفة ومباشرة تربط محافظات مصر بالحرم الجامعي. |  | `ui/lib/i18n.ts › translations.popularRoutesDesc` | | |
| 296 | Powered by MALAKY Studio | مشغل بواسطة منصة ملاكي باص · نظام النقل الجماعي الموحد |  | `ui/lib/i18n.ts › translations.poweredByMalaky` | | |
| 297 | Preview Public Website | معاينة الموقع العام |  | `ui/lib/i18n.ts › translations.previewLiveSite` | | |
| 298 | PREVIEW ROLE | وضع المعاينة |  | `ui/lib/i18n.ts › translations.previewModeLabel` | | |
| 299 | Highest Price | الأعلى سعراً |  | `ui/lib/i18n.ts › translations.priceHighest` | | |
| 300 | Lowest Price | الأقل سعراً |  | `ui/lib/i18n.ts › translations.priceLowest` | | |
| 301 | Max Price (EGP) | الحد الأقصى للسعر (ج.م) |  | `ui/lib/i18n.ts › translations.priceRange` | | |
| 302 | Primary Passenger | الراكب الأساسي |  | `ui/lib/i18n.ts › translations.primaryPassenger` | | |
| 303 | Print Boarding Pass | طباعة تذكرة الصعود |  | `ui/lib/i18n.ts › translations.printBoardingPass` +1 | | |
| 304 | Profile | الملف الشخصي |  | `ui/lib/i18n.ts › translations.profile` | | |
| 305 | Public Passenger Site | موقع الركاب للشركة |  | `ui/lib/i18n.ts › translations.publicSite` | | |
| 306 | Published Departures | الرحلات المجدولة |  | `ui/lib/i18n.ts › translations.publishedDepartures` | | |
| 307 | Published Version | النسخة المنشورة |  | `ui/lib/i18n.ts › translations.publishedVersion` | | |
| 308 | Publish Changes to Live Site | نشر التعديلات على الموقع العام |  | `ui/lib/i18n.ts › translations.publishNow` | | |
| 309 | Captain will scan this code before departure | سيقوم كابتن الرحلة بمسح الرمز للتحقق قبل التحرك |  | `ui/lib/i18n.ts › translations.qrNotice` | | |
| 310 | Quick Demo Login (Evaluator Testing) | دخول تجريبي سريع للمعاينة والتقييم |  | `ui/lib/i18n.ts › translations.quickDemoLogin` | | |
| 311 | Recent Passenger Bookings | آخر الحجوزات المسجلة |  | `ui/lib/i18n.ts › translations.recentBookings` | | |
| 312 | Recurring Schedules | الجداول الدورية |  | `ui/lib/i18n.ts › translations.recurringSchedules` | | |
| 313 | Register | إنشاء حساب |  | `ui/lib/i18n.ts › translations.register` | | |
| 314 | Register Coach | تسجيل الحافلة |  | `ui/lib/i18n.ts › translations.registerCoach` | | |
| 315 | Add an inspected intercity passenger coach to the company fleet. | إضافة حافلة سياحية معتمدة ومفحوصة لأسطول الشركة. |  | `ui/lib/i18n.ts › translations.registerCoachDesc` | | |
| 316 | Register New Fleet Coach | تسجيل حافلة جديدة في الأسطول |  | `ui/lib/i18n.ts › translations.registerCoachModal` | | |
| 317 | Register Captain | تسجيل الكابتن |  | `ui/lib/i18n.ts › translations.registerDriver` | | |
| 318 | Add a licensed and vetted driver to the company dispatch roster. | إضافة سائق معتمد ومرخص لجدول تشغيل الشركة. |  | `ui/lib/i18n.ts › translations.registerDriverDesc` | | |
| 319 | Register New Captain | تسجيل كابتن جديد |  | `ui/lib/i18n.ts › translations.registerDriverModal` | | |
| 320 | Regular | عادي |  | `ui/lib/i18n.ts › translations.regularStudent` | | |
| 321 | Relationship | صلة القرابة / العلاقة |  | `ui/lib/i18n.ts › translations.relationshipLabel` | | |
| 322 | Financial Reports | التقارير المالية |  | `ui/lib/i18n.ts › translations.reports` | | |
| 323 | Request Trip Cancellation | طلب إلغاء الرحلة |  | `ui/lib/i18n.ts › translations.requestCancellationTitle` | | |
| 324 | Reset | إعادة ضبط |  | `ui/lib/i18n.ts › translations.reset` | | |
| 325 | Password reset link sent to your email address. | تم إرسال رابط استعادة كلمة المرور إلى بريدك الإلكتروني. |  | `ui/lib/i18n.ts › translations.resetInstructionsSent` | | |
| 326 | Reset Password | استعادة كلمة المرور |  | `ui/lib/i18n.ts › translations.resetPasswordTitle` | | |
| 327 | Reset Search Filters | إعادة ضبط فلاتر البحث |  | `ui/lib/i18n.ts › translations.resetSearchFilters` | | |
| 328 | Results | نتائج |  | `ui/lib/i18n.ts › translations.results` | | |
| 329 | Return to Homepage | العودة للرئيسية |  | `ui/lib/i18n.ts › translations.returnToHome` | | |
| 330 | rides | رحلات |  | `ui/lib/i18n.ts › translations.ridesCount` | | |
| 331 | Route & Date | خط السير والتاريخ |  | `ui/lib/i18n.ts › translations.routeAndDate` | | |
| 332 | Intercity Route Profitability Matrix | مصفوفة أرباح خطوط السير |  | `ui/lib/i18n.ts › translations.routeProfitabilityMatrix` | | |
| 333 | Routes & Stops | الخطوط والمحطات |  | `ui/lib/i18n.ts › translations.routesAndStops` | | |
| 334 | Route Stations & Boarding | محطات خط السير ونقاط الصعود |  | `ui/lib/i18n.ts › translations.routeTimeline` | | |
| 335 | Route Verification: | اعتماد خط السير: |  | `ui/lib/i18n.ts › translations.routeVerification` | | |
| 336 | runs | رحلات |  | `ui/lib/i18n.ts › translations.runsCount` | | |
| 337 | Sat | السبت |  | `ui/lib/i18n.ts › translations.sat` | | |
| 338 | Save Changes | حفظ التعديلات |  | `ui/lib/i18n.ts › translations.save` | | |
| 339 | Publish Website Changes | نشر التحديثات على الموقع |  | `ui/lib/i18n.ts › translations.saveBranding` | | |
| 340 | Saved Travel Companions | المسافرون المحفوظون |  | `ui/lib/i18n.ts › translations.savedCompanionsTitle` | | |
| 341 | Save Draft | حفظ كمسودة |  | `ui/lib/i18n.ts › translations.saveDraftOnly` | | |
| 342 | Save Route | حفظ خط السير |  | `ui/lib/i18n.ts › translations.saveRouteBtn` | | |
| 343 | Scan or Enter Ticket Security Token | مسح أو إدخال رمز الأمان للتذكرة |  | `ui/lib/i18n.ts › translations.scanOrEnterToken` | | |
| 344 | Scheduled Runs | رحلات مجدولة |  | `ui/lib/i18n.ts › translations.scheduledRuns` | | |
| 345 | Scheduled Trips | الرحلات المجدولة |  | `ui/lib/i18n.ts › translations.scheduledTrips` | | |
| 346 | Schedule Trip | جدولة الرحلة |  | `ui/lib/i18n.ts › translations.scheduleTripBtn` | | |
| 347 | Search... | بحث... |  | `ui/lib/i18n.ts › translations.search` | | |
| 348 | Searching across operators... | جاري البحث بين كافة الشركات... |  | `ui/lib/i18n.ts › translations.searchingAcrossOperators` | | |
| 349 | Search reference, name or ID... | ابحث برقم الحجز أو الاسم أو الكارنيه... |  | `ui/lib/i18n.ts › translations.searchRefOrName` | | |
| 350 | Search route or time... | ابحث برقم الخط أو الوقت... |  | `ui/lib/i18n.ts › translations.searchRouteOrTime` | | |
| 351 | Find Scheduled Trips | بحث عن رحلات |  | `ui/lib/i18n.ts › translations.searchTrips` | | |
| 352 | Seat | مقعد |  | `ui/lib/i18n.ts › translations.seat` | | |
| 353 | Seat Capacity | سعة المقاعد |  | `ui/lib/i18n.ts › translations.seatCapacityLabel` | | |
| 354 | Seat | المقعد |  | `ui/lib/i18n.ts › translations.seatHeader` | | |
| 355 | Seats | مقاعد |  | `ui/lib/i18n.ts › translations.seats` +1 | | |
| 356 | Seats Available | مقاعد متاحة |  | `ui/lib/i18n.ts › translations.seatsAvailable` | | |
| 357 | seats left | مقاعد متبقية |  | `ui/lib/i18n.ts › translations.seatsLeft` | | |
| 358 | Seats Remaining | مقاعد متبقية |  | `ui/lib/i18n.ts › translations.seatsRemaining` | | |
| 359 | seats remaining | مقاعد متبقية |  | `ui/lib/i18n.ts › translations.seatsRemainingText` | | |
| 360 | Assign Bus | تعيين الحافلة |  | `ui/lib/i18n.ts › translations.selectBus` | | |
| 361 | Assign Driver | تعيين السائق |  | `ui/lib/i18n.ts › translations.selectDriver` | | |
| 362 | Select Route | اختر خط السير |  | `ui/lib/i18n.ts › translations.selectRoute` | | |
| 363 | Select Operator | اختر مشغل الحافلات |  | `ui/lib/i18n.ts › translations.selectTenant` | | |
| 364 | Showing | عرض |  | `ui/lib/i18n.ts › translations.showing` | | |
| 365 | Show Preview Bar | إظهار شريط المعاينة |  | `ui/lib/i18n.ts › translations.showPreview` | | |
| 366 | Sign In | تسجيل الدخول |  | `ui/lib/i18n.ts › translations.signIn` | | |
| 367 | Sign Out | تسجيل الخروج |  | `ui/lib/i18n.ts › translations.signOut` | | |
| 368 | Create Account | إنشاء حساب جديد |  | `ui/lib/i18n.ts › translations.signUp` | | |
| 369 | Sold Out | نفدت المقاعد |  | `ui/lib/i18n.ts › translations.soldOut` | | |
| 370 | Sort By | ترتيب حسب |  | `ui/lib/i18n.ts › translations.sortBy` | | |
| 371 | SSL Status | شهادة الأمان SSL |  | `ui/lib/i18n.ts › translations.sslCertificate` | | |
| 372 | Starting from | تبدأ من |  | `ui/lib/i18n.ts › translations.startingFrom` | | |
| 373 | Change Status | تغيير الحالة |  | `ui/lib/i18n.ts › translations.statusChange` | | |
| 374 | 01. Select Your Route | ٠١. حدد خط السير |  | `ui/lib/i18n.ts › translations.step1SelectRoute` | | |
| 375 | Choose your origin city and convenient departure slot. | اختر مدينة الانطلاق والوقت الأنسب لمحاضراتك. |  | `ui/lib/i18n.ts › translations.step1SelectRouteDesc` +1 | | |
| 376 | 02. Enter Student Details | ٠٢. أدخل بيانات الطالب |  | `ui/lib/i18n.ts › translations.step2EnterDetails` | | |
| 377 | Enter your passenger details and Galala University ID. | أدخل بيانات المسافر والرقم الجامعي للاستفادة من الخصم. |  | `ui/lib/i18n.ts › translations.step2EnterDetailsDesc` +1 | | |
| 378 | 03. Instant Boarding Pass | ٠٣. استلم تذكرة الصعود |  | `ui/lib/i18n.ts › translations.step3BoardingPass` | | |
| 379 | Receive your instant digital boarding pass with QR code. | استلم تذكرتك الرقمية فوراً مع رمز QR للصعود المباشر. |  | `ui/lib/i18n.ts › translations.step3BoardingPassDesc` +1 | | |
| 380 | Stops & Stations | المحطات والمواقف |  | `ui/lib/i18n.ts › translations.stopsAndStations` | | |
| 381 | Student Courtesy Discount | خصم طالب جامعة الجلالة |  | `ui/lib/i18n.ts › translations.studentDiscount` | | |
| 382 | 15% Verified Student ID Discount | خصم ١٥٪ ببطاقة طالب جامعة الجلالة |  | `ui/lib/i18n.ts › translations.studentDiscount15` | | |
| 383 | 15% Galala Student Discount Applied | تم تطبيق خصم طلاب جامعة الجلالة ١٥٪ |  | `ui/lib/i18n.ts › translations.studentDiscountApplied` | | |
| 384 | Student Discount Available | خصم خاص لطلاب جامعة الجلالة |  | `ui/lib/i18n.ts › translations.studentDiscountAvailable` | | |
| 385 | Student ID | رقم الكارنيه |  | `ui/lib/i18n.ts › translations.studentId` | | |
| 386 | Provides priority boarding and applies student tier pricing. | يمنحك أولوية في المقاعد ويطبق خصم الطالب التلقائي. |  | `ui/lib/i18n.ts › translations.studentIdHelp` | | |
| 387 | Enter your Galala University student ID to unlock a 15% transit discount. | أدخل رقم كارنيه جامعة الجلالة للحصول على خصم ١٥٪ على الرحلات. |  | `ui/lib/i18n.ts › translations.studentIdHint` | | |
| 388 | Galala University Student ID (Optional) | الرقم الجامعي لجامعة الجلالة (اختياري) |  | `ui/lib/i18n.ts › translations.studentIdLabel` | | |
| 389 | GU-ENG-2024-XXXX | GU-ENG-2024-XXXX | SAME AS EN | `ui/lib/i18n.ts › translations.studentIdPlaceholder` | | |
| 390 | Student Pass Applied | تم تطبيق خصم كارنيه الطالب |  | `ui/lib/i18n.ts › translations.studentPassApplied` | | |
| 391 | Student Policies | سياسات نقل الطلاب |  | `ui/lib/i18n.ts › translations.studentPoliciesFooter` | | |
| 392 | Students & Faculty | طلاب وهيئة تدريس |  | `ui/lib/i18n.ts › translations.studentsAndFaculty` | | |
| 393 | Domain / Subdomain | النطاق / النطاق الفرعي |  | `ui/lib/i18n.ts › translations.subdomain` | | |
| 394 | Submit Cancellation Request | إرسال طلب الإلغاء |  | `ui/lib/i18n.ts › translations.submitCancellationRequest` | | |
| 395 | Subscription Plans | باقات الاشتراك |  | `ui/lib/i18n.ts › translations.subscriptionPlans` | | |
| 396 | Suez ↔ Galala University | السويس ↔ جامعة الجلالة |  | `ui/lib/i18n.ts › translations.suezGalala` | | |
| 397 | Trip Summary | ملخص الحجز والسداد |  | `ui/lib/i18n.ts › translations.summaryAndPayment` | | |
| 398 | Sun | الأحد |  | `ui/lib/i18n.ts › translations.sun` | | |
| 399 | MASAR platform admin | لوحة الإدارة العليا (Super Admin) |  | `ui/lib/i18n.ts › translations.superAdmin` | | |
| 400 | Platform Control Center | مركز الإدارة العامة لمنصة ملاكي |  | `ui/lib/i18n.ts › translations.superAdminPortal` | | |
| 401 | Our 24/7 student transit dispatch hotline is ready to help. | فريق عمليات النقل مستعد لمساعدتك على مدار الساعة. |  | `ui/lib/i18n.ts › translations.supportNotice` | | |
| 402 | Suspended (Disabled Dispatch & Public Site) | موقوف (إيقاف التشغيل والموقع) |  | `ui/lib/i18n.ts › translations.suspendedMode` | | |
| 403 | Swap departure and destination | تبديل محطة الانطلاق والوصول |  | `ui/lib/i18n.ts › translations.swapDirection` | | |
| 404 | System Healthy | حالة النظام ممتازة |  | `ui/lib/i18n.ts › translations.systemHealthy` | | |
| 405 | System | تلقائي |  | `ui/lib/i18n.ts › translations.systemMode` | | |
| 406 | Target Entity | الهدف |  | `ui/lib/i18n.ts › translations.targetEntity` | | |
| 407 | Target Operator | مشغل الحافلات المعني |  | `ui/lib/i18n.ts › translations.targetOperatorLabel` | | |
| 408 | Tenant Status | حالة المشغل |  | `ui/lib/i18n.ts › translations.tenantStatus` | | |
| 409 | Theme | المظهر |  | `ui/lib/i18n.ts › translations.themeMode` | | |
| 410 | +24% this semester | +٢٤٪ هذا الفصل الدراسي |  | `ui/lib/i18n.ts › translations.thisSemesterPeak` | | |
| 411 | Thu | الخميس |  | `ui/lib/i18n.ts › translations.thu` | | |
| 412 | Standard Base Fare | سعر التذكرة الأساسي |  | `ui/lib/i18n.ts › translations.ticketFare` | | |
| 413 | Booking Confirmed Successfully! | تم تأكيد حجزك بنجاح! |  | `ui/lib/i18n.ts › translations.ticketIssuedSuccess` | | |
| 414 | Present this digital pass to the coach captain during boarding. | يرجى إبراز هذه التذكرة الرقمية لكابتن الحافلة عند الصعود. |  | `ui/lib/i18n.ts › translations.ticketSub` | | |
| 415 | Security Token | رمز الأمان الرقمي |  | `ui/lib/i18n.ts › translations.ticketTokenLabel` | | |
| 416 | Earliest Departure | الأبكر أولاً |  | `ui/lib/i18n.ts › translations.timeEarliest` | | |
| 417 | Latest Departure | المتأخر أولاً |  | `ui/lib/i18n.ts › translations.timeLatest` | | |
| 418 | Times | المواعيد |  | `ui/lib/i18n.ts › translations.times` | | |
| 419 | Timestamp | الوقت والتاريخ |  | `ui/lib/i18n.ts › translations.timestamp` | | |
| 420 | TLS/SSL Status | شهادة الأمان TLS |  | `ui/lib/i18n.ts › translations.tlsStatus` | | |
| 421 | Today's Live Dispatch Queue | جدول انطلاق الحافلات اليوم |  | `ui/lib/i18n.ts › translations.todayDispatches` | | |
| 422 | To (City / Location) | محطة الوصول |  | `ui/lib/i18n.ts › translations.toDestination` | | |
| 423 | Network Fleet Size | إجمالي أسطول الشبكة |  | `ui/lib/i18n.ts › translations.totalBusesNetwork` | | |
| 424 | Active Operators | الشركات المشتركة |  | `ui/lib/i18n.ts › translations.totalCompanies` | | |
| 425 | Total Gross Revenue | إجمالي الإيرادات |  | `ui/lib/i18n.ts › translations.totalGrossRevenue` | | |
| 426 | Total Manifest: | إجمالي القائمة: |  | `ui/lib/i18n.ts › translations.totalManifestText` | | |
| 427 | Monthly Passengers | ركاب الشهر الحالي |  | `ui/lib/i18n.ts › translations.totalPassengersThisMonth` | | |
| 428 | Total Spent | إجمالي الإنفاق |  | `ui/lib/i18n.ts › translations.totalSpent` | | |
| 429 | Total Amount | الإجمالي للدفع |  | `ui/lib/i18n.ts › translations.totalToPay` | | |
| 430 | Total Transported Students | إجمالي الطلاب المنقولين |  | `ui/lib/i18n.ts › translations.totalTransportedStudents` | | |
| 431 | Total Trips | إجمالي الرحلات |  | `ui/lib/i18n.ts › translations.totalTrips` | | |
| 432 | Monthly Dispatched Trips | رحلات الشبكة الشهرية |  | `ui/lib/i18n.ts › translations.totalTripsNetwork` | | |
| 433 | Travel Date | تاريخ السفر |  | `ui/lib/i18n.ts › translations.travelDate` | | |
| 434 | Trial Mode (Evaluation Period) | تجريبي (فترة تقييم واختبار) |  | `ui/lib/i18n.ts › translations.trialMode` | | |
| 435 | +1 trial pending | +١ بانتظار التفعيل |  | `ui/lib/i18n.ts › translations.trialPending` | | |
| 436 | Trip | الرحلة |  | `ui/lib/i18n.ts › translations.trip` +1 | | |
| 437 | Trips | الرحلات |  | `ui/lib/i18n.ts › translations.trips` +1 | | |
| 438 | Please try searching for another date or browse our active routes below. | يرجى اختيار تاريخ آخر أو استعراض الخطوط النشطة أدناه. |  | `ui/lib/i18n.ts › translations.tryDifferentDate` | | |
| 439 | Tue | الثلاثاء |  | `ui/lib/i18n.ts › translations.tue` | | |
| 440 | Upcoming Departures | الرحلات القادمة |  | `ui/lib/i18n.ts › translations.upcomingDepartures` | | |
| 441 | Updates dynamically | يتم التحديث فورياً |  | `ui/lib/i18n.ts › translations.updatesDynamically` | | |
| 442 | Up to | حتى |  | `ui/lib/i18n.ts › translations.upToCount` | | |
| 443 | USB Charging Ports | منافذ شحن USB |  | `ui/lib/i18n.ts › translations.usbPorts` | | |
| 444 | Please enter passenger full name | يرجى إدخال اسم المسافر بالكامل |  | `ui/lib/i18n.ts › translations.validationEnterName` | | |
| 445 | Please enter mobile number | يرجى إدخال رقم الهاتف المحمول |  | `ui/lib/i18n.ts › translations.validationEnterPhone` | | |
| 446 | This trip is currently fully booked and cannot accept new reservations. | هذه الرحلة مكتملة العدد بالكامل ولا تقبل حجوزات جديدة. |  | `ui/lib/i18n.ts › translations.validationFullyBooked` | | |
| 447 | Only available seat(s) on this departure. | المقاعد المتاحة لا تكفي للعدد المطلوب |  | `ui/lib/i18n.ts › translations.validationSeatsAvailableOnly` | | |
| 448 | Enter a valid Egyptian mobile (e.g. 0100 123 4567) | أدخل رقم محمول مصري صحيح (مثال: 01001234567) |  | `ui/lib/i18n.ts › translations.validationValidEgyptianPhone` | | |
| 449 | Verified | مفعل |  | `ui/lib/i18n.ts › translations.verified` | | |
| 450 | Vetted Operator | مشغل معتمد |  | `ui/lib/i18n.ts › translations.verifiedOperatorBadge` | | |
| 451 | Verify & Add Domain | التحقق وإضافة النطاق |  | `ui/lib/i18n.ts › translations.verifyAddDomainBtn` | | |
| 452 | Verify & Board Passenger | تحقق وتسجيل الصعود |  | `ui/lib/i18n.ts › translations.verifyAndBoardAction` | | |
| 453 | Vetted Captain | كابتن الرحلة |  | `ui/lib/i18n.ts › translations.vettedCaptain` | | |
| 454 | View | عرض |  | `ui/lib/i18n.ts › translations.view` +1 | | |
| 455 | View All Bookings → | عرض كافة الحجوزات ← |  | `ui/lib/i18n.ts › translations.viewAllBookings` | | |
| 456 | View Boarding Pass | عرض بطاقة الصعود والتذكرة |  | `ui/lib/i18n.ts › translations.viewBoardingPass` | | |
| 457 | Visit Operator Site | زيارة موقع الشركة المستقل |  | `ui/lib/i18n.ts › translations.viewCompanyPortal` | | |
| 458 | View Details | عرض التفاصيل |  | `ui/lib/i18n.ts › translations.viewDetails` | | |
| 459 | Website Branding | تخصيص الموقع والهوية |  | `ui/lib/i18n.ts › translations.websiteCustomizer` | | |
| 460 | Wed | الأربعاء |  | `ui/lib/i18n.ts › translations.wed` | | |
| 461 | White-Label Isolation Guarantee: | ضمان استقلالية الهوية: |  | `ui/lib/i18n.ts › translations.whiteLabelIsolation` | | |

## Other

| # | English | Arabic (current) | Flag | Where | Decision | Reviewed Arabic |
|---|---|---|---|---|---|---|
| 1 | No bookings match these filters. | لا توجد حجوزات تطابق هذه العوامل. | empty/guidance | `app/dashboard/bookings/page.tsx › <Bi>` | | |
| 2 | Show this trip only | عرض هذه الرحلة فقط |  | `app/dashboard/bookings/page.tsx › <Bi>` | | |
| 3 | Boarding | الصعود |  | `app/dashboard/bookings/page.tsx › <Bi>` +1 | | |
| 4 | Action | الإجراء |  | `app/dashboard/bookings/page.tsx › <Bi>` | | |
| 5 | ← Previous | السابق → |  | `app/dashboard/bookings/page.tsx › <Bi>` | | |
| 6 | Page | صفحة |  | `app/dashboard/bookings/page.tsx › <Bi>` | | |
| 7 | Next → | ← التالي |  | `app/dashboard/bookings/page.tsx › <Bi>` | | |
| 8 | No customers match your search. | لا يوجد عملاء مطابقون لبحثك. | empty/guidance | `app/dashboard/customers/page.tsx › <Bi>` | | |
| 9 | No customers yet. | لا يوجد عملاء بعد. | empty/guidance | `app/dashboard/customers/page.tsx › <Bi>` | | |
| 10 | ${page.total} customer${page.total === 1 ? '' : 's'}${q ? ' found' : ''} · page ${page.page} of ${lastPage} | ${page.total} ${page.total === 1 ? 'عميل' : 'عملاء'}${q ? ' (نتائج البحث)' : ''} · الصفحة ${page.page} من ${lastPage} |  | `app/dashboard/customers/page.tsx › <Bi>` | | |
| 11 | Customer pages | صفحات العملاء |  | `app/dashboard/customers/page.tsx › <Bi>` | | |
| 12 | Welcome back, | أهلاً بعودتك، |  | `app/dashboard/page.tsx › <Bi>` | | |
| 13 | Go and return | ذهاب وعودة |  | `app/dashboard/trips/page.tsx › <Bi>` | | |
| 14 | Return trip | رحلة عودة |  | `app/dashboard/trips/page.tsx › <Bi>` | | |
| 15 | Go | ذهاب |  | `app/dashboard/trips/regular/page.tsx › <Bi>` | | |
| 16 | Return | عودة |  | `app/dashboard/trips/regular/page.tsx › <Bi>` | | |
| 17 | Both | الاثنين |  | `app/dashboard/trips/regular/page.tsx › <Bi>` | | |
| 18 | More than the booking total. | أكثر من إجمالي الحجز. |  | `components/dashboard/SaveStatus.tsx › EXTRA.amount_exceeds_total` | | |
| 19 | Enter a valid amount. | أدخل مبلغاً صحيحاً. |  | `components/dashboard/SaveStatus.tsx › EXTRA.amount_invalid` | | |
| 20 | This booking can no longer be cancelled. | لا يمكن إلغاء هذا الحجز بعد الآن. |  | `components/dashboard/SaveStatus.tsx › EXTRA.booking_cannot_be_cancelled` | | |
| 21 | Cancelled booking: use refund. | حجز ملغي: استخدم الاسترداد. |  | `components/dashboard/SaveStatus.tsx › EXTRA.booking_not_cancellable` | | |
| 22 | This trip is closed. | هذه الرحلة مغلقة. |  | `components/dashboard/SaveStatus.tsx › EXTRA.trip_closed` | | |
| 23 | Account created. Check your email to confirm it, then sign in. | تم إنشاء الحساب. تحقق من بريدك لتأكيده ثم سجّل الدخول. |  | `ui/lib/real/authService.real.ts › AUTH_MESSAGES.confirm_email` | | |
| 24 | Please confirm your email first. Check your inbox. | يرجى تأكيد بريدك الإلكتروني أولاً. تحقق من صندوق الوارد. |  | `ui/lib/real/authService.real.ts › AUTH_MESSAGES.email_not_confirmed` | | |
| 25 | Incorrect email or password. | البريد الإلكتروني أو كلمة المرور غير صحيحة. |  | `ui/lib/real/authService.real.ts › AUTH_MESSAGES.invalid_credentials` | | |
| 26 | Too many attempts. Please wait a moment and try again. | محاولات كثيرة. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى. |  | `ui/lib/real/authService.real.ts › AUTH_MESSAGES.rate_limited` | | |
| 27 | We could not create the account. Try again or sign in. | تعذّر إنشاء الحساب. حاول مرة أخرى أو سجّل الدخول. |  | `ui/lib/real/authService.real.ts › AUTH_MESSAGES.signup_failed` | | |
| 28 | Something went wrong. Please try again. | حدث خطأ ما. يرجى المحاولة مرة أخرى. |  | `ui/lib/real/authService.real.ts › AUTH_MESSAGES.unknown` +1 | | |
| 29 | That password is too weak. Use at least 8 characters with letters and numbers. | كلمة المرور ضعيفة. استخدم 8 أحرف على الأقل من حروف وأرقام. |  | `ui/lib/real/authService.real.ts › AUTH_MESSAGES.weak_password` | | |
| 30 | Please sign in to continue. | يرجى تسجيل الدخول للمتابعة. |  | `ui/lib/real/customerBackend.ts › MESSAGES.auth_required` | | |
| 31 | This booking can no longer be changed. | لا يمكن تعديل هذا الحجز بعد الآن. |  | `ui/lib/real/customerBackend.ts › MESSAGES.booking_closed` | | |
| 32 | Booking not found. | الحجز غير موجود. |  | `ui/lib/real/customerBackend.ts › MESSAGES.booking_not_found` | | |
| 33 | The free cancellation period for this trip has ended. | انتهت فترة الإلغاء المتاحة لهذه الرحلة. |  | `ui/lib/real/customerBackend.ts › MESSAGES.cancel_window_closed` | | |
| 34 | This request conflicts with an earlier one. Please start again. | يتعارض هذا الطلب مع طلب سابق. يرجى البدء من جديد. |  | `ui/lib/real/customerBackend.ts › MESSAGES.idempotency_conflict` | | |
| 35 | Some of the details are invalid. Please check and try again. | بعض البيانات غير صالحة. يرجى المراجعة والمحاولة مرة أخرى. |  | `ui/lib/real/customerBackend.ts › MESSAGES.invalid_input` | | |
| 36 | Enter a valid phone number. | أدخل رقم هاتف صالحاً. |  | `ui/lib/real/customerBackend.ts › MESSAGES.invalid_phone` | | |
| 37 | This phone number is already registered with this company. Verify your phone to link it. | رقم الهاتف مسجل بالفعل لدى هذه الشركة. قم بتأكيد رقمك لربطه. |  | `ui/lib/real/customerBackend.ts › MESSAGES.phone_registered` | | |
| 38 | This company cannot accept more bookings right now. | لا تستطيع هذه الشركة قبول المزيد من الحجوزات حالياً. |  | `ui/lib/real/customerBackend.ts › MESSAGES.plan_limit` | | |
| 39 | Too many requests. Please wait a moment and try again. | عدد كبير من الطلبات. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى. |  | `ui/lib/real/customerBackend.ts › MESSAGES.rate_limited` | | |
| 40 | You requested more seats than allowed per booking. | عدد المقاعد المطلوب يتجاوز الحد المسموح للحجز الواحد. |  | `ui/lib/real/customerBackend.ts › MESSAGES.seats_per_booking` | | |
