import { transportService } from '../lib/transportService';
import { authService } from '../lib/authService';

async function runTests() {
  console.log('--- STARTING MALAKY VERIFICATION SUITE ---');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}`);
      failed++;
    }
  }

  // Reset to default data before tests
  await transportService.resetToDefaults();

  // 1. Search Filtering by Canonical Location across companies
  const cairoTrips = await transportService.searchMarketplaceTrips({
    originLocationId: 'loc_cairo_nasr_city',
    destLocationId: 'loc_galala_univ',
    date: '2026-10-14',
  });
  assert(
    cairoTrips.length >= 2,
    `Search by canonical location returns trips across companies (found ${cairoTrips.length} trips)`
  );
  const companyIdsInCairo = new Set(cairoTrips.map((t) => t.companyId));
  assert(
    companyIdsInCairo.has('comp_galala_connect') && companyIdsInCairo.has('comp_sinai_express'),
    'Multi-tenant aggregation: contains both Galala Connect and Sinai Express'
  );

  // 2. Company Isolation
  const gcOnly = await transportService.searchMarketplaceTrips({
    companyId: 'comp_galala_connect',
  });
  const allGc = gcOnly.every((t) => t.companyId === 'comp_galala_connect');
  assert(allGc && gcOnly.length > 0, 'Company filter isolates only trips belonging to that company');

  // 3. Cancelled Trips Exclusion
  const cancelledTrip = cairoTrips.find((t) => t.id === 'trip_gc_cancelled');
  assert(cancelledTrip === undefined, 'Cancelled trips are strictly excluded from marketplace discovery');

  // 4. Unpublished Trips Exclusion
  const suezTrips = await transportService.searchMarketplaceTrips({
    originLocationId: 'loc_suez',
    destLocationId: 'loc_galala_univ',
    date: '2026-10-14',
  });
  const unpubTrip = suezTrips.find((t) => t.id === 'trip_se_unpublished');
  assert(unpubTrip === undefined, 'Unpublished trips are excluded from search results');

  // 5. Date Filtering
  const tripsToday = await transportService.searchMarketplaceTrips({
    date: '2026-10-14',
  });
  const allToday = tripsToday.every((t) => t.departureDate === '2026-10-14');
  assert(allToday && tripsToday.length > 0, 'Trips filtered for 2026-10-14 only include that date');

  const tripsTomorrow = await transportService.searchMarketplaceTrips({
    date: '2026-10-15',
  });
  assert(
    tripsTomorrow.length === 1 && tripsTomorrow[0]!.departureDate === '2026-10-15',
    `Trips filtered for tomorrow (2026-10-15) only include tomorrow (found ${tripsTomorrow.length})`
  );

  // 6. Capacity Validation: Fully Booked Trip
  const fullyBookedItem = suezTrips.find((t) => t.id === 'trip_rst_fully_booked');
  assert(
    fullyBookedItem !== undefined && fullyBookedItem.isFullyBooked && fullyBookedItem.availableSeats === 0,
    'Fully booked trip is identified with isFullyBooked=true and availableSeats=0'
  );

  // Try to book a fully booked trip -> must reject
  let rejected = false;
  try {
    await transportService.createBooking({
      companyId: 'comp_red_sea_transit',
      tripId: 'trip_rst_fully_booked',
      passengerName: 'Test Student',
      passengerPhone: '01012345678',
      passengerCount: 1,
      fareEgp: 80,
      status: 'confirmed',
      pickupStopId: 'stop_gc_suez',
      dropoffStopId: 'stop_gc_galala_main',
    });
  } catch (err: any) {
    rejected = true;
  }
  assert(rejected, 'Service rejects booking when trip capacity is exhausted');

  // 7. Booking Capacity decrement & cancellation idempotency
  const tripBefore = await transportService.getTripById('trip_gc_cairo_morning_2');
  const initialBookedSeats = tripBefore!.bookedSeats;

  const newBooking = await transportService.createBooking({
    companyId: 'comp_galala_connect',
    tripId: 'trip_gc_cairo_morning_2',
    passengerName: 'Ziad Ahmed',
    passengerPhone: '01012345678',
    passengerCount: 2,
    fareEgp: 280,
    status: 'confirmed',
    pickupStopId: 'stop_gc_cairo_nasr_city',
    dropoffStopId: 'stop_gc_galala_main',
  });

  const tripAfterBooking = await transportService.getTripById('trip_gc_cairo_morning_2');
  assert(
    tripAfterBooking!.bookedSeats === initialBookedSeats + 2,
    `Booking successfully reserved 2 seats (was ${initialBookedSeats}, now ${tripAfterBooking!.bookedSeats})`
  );

  // Cancel booking
  await transportService.updateBookingStatus(newBooking.id, 'cancelled');
  const tripAfterCancel = await transportService.getTripById('trip_gc_cairo_morning_2');
  assert(
    tripAfterCancel!.bookedSeats === initialBookedSeats,
    `Cancelling booking restored capacity (now ${tripAfterCancel!.bookedSeats})`
  );

  // Repeated cancel call should not decrement again
  await transportService.updateBookingStatus(newBooking.id, 'cancelled');
  const tripAfterRepeatCancel = await transportService.getTripById('trip_gc_cairo_morning_2');
  assert(
    tripAfterRepeatCancel!.bookedSeats === initialBookedSeats,
    `Idempotent cancellation: repeated cancellation call does NOT decrement capacity further (${tripAfterRepeatCancel!.bookedSeats})`
  );

  // --- PHASE B VERIFICATIONS ---
  console.log('\n--- VERIFYING PHASE B CORRECTIONS ---');

  // 8. Rule #1: Customer Auth & Supabase Auth Session
  const authRes = await authService.signInWithPassword({
    email: 'karim.galala@student.gu.edu.eg',
    password: 'Pass1234!',
  });
  assert(
    authRes.user.email === 'karim.galala@student.gu.edu.eg' &&
      authRes.session.accessToken.startsWith('sb_') &&
      authRes.session.expiresAt > Date.now(),
    'Rule #1: Supabase Auth session successfully established with valid token and expiration'
  );

  // 9. Rule #2 & #4: Multi-Passenger Booking & Cryptographic Opaque Tokens
  const multiPassBooking = await transportService.createBooking({
    companyId: 'comp_galala_connect',
    customerId: authRes.user.id,
    tripId: 'trip_gc_cairo_morning_1',
    passengerName: 'Karim El-Sayed',
    passengerPhone: '+20 100 234 5678',
    passengerCount: 3,
    fareEgp: 357,
    status: 'confirmed',
    pickupStopId: 'stop_gc_cairo_nasr_city',
    dropoffStopId: 'stop_gc_galala_main',
    passengerNames: ['Karim El-Sayed', 'Ahmed Tarek', 'Mostafa Essam'],
  });

  assert(
    multiPassBooking.qrTicketToken.startsWith('malaky_sec_tk_') &&
      !multiPassBooking.qrTicketToken.includes(multiPassBooking.id),
    'Rule #2: Master QR ticket token is cryptographically opaque and does not expose predictable booking IDs'
  );

  assert(
    multiPassBooking.passengers &&
      multiPassBooking.passengers.length === 3 &&
      multiPassBooking.passengers[0]!.passengerName === 'Karim El-Sayed' &&
      multiPassBooking.passengers[1]!.passengerName === 'Ahmed Tarek' &&
      multiPassBooking.passengers[2]!.passengerName === 'Mostafa Essam' &&
      multiPassBooking.passengers[0]!.qrOpaqueToken !== multiPassBooking.passengers[1]!.qrOpaqueToken,
    'Rule #4: Multi-passenger booking generates distinct individual passenger tickets with unique opaque tokens'
  );

  // 10. Rule #6: Driver Scanner with Atomic Duplicate-Scan Protection
  const pass1 = multiPassBooking.passengers[0]!;
  const boardRes = await transportService.verifyAndBoardPassengerTicket({
    ticketToken: pass1.qrOpaqueToken,
    tripId: 'trip_gc_cairo_morning_1',
    operatorId: 'comp_galala_connect',
    driverId: 'drv_gc_1',
  });
  assert(
    boardRes.ticket.status === 'boarded' && !!boardRes.ticket.boardedAt,
    'Rule #6: Driver scan verifies company membership, trip assignment, and marks passenger ticket boarded'
  );

  // Duplicate scan attempt on the same ticket token must be blocked atomically
  let duplicateBlocked = false;
  try {
    await transportService.verifyAndBoardPassengerTicket({
      ticketToken: pass1.qrOpaqueToken,
      tripId: 'trip_gc_cairo_morning_1',
      operatorId: 'comp_galala_connect',
      driverId: 'drv_gc_1',
    });
  } catch (err: any) {
    if (err.message.includes('Atomic Duplicate Boarding Blocked')) {
      duplicateBlocked = true;
    }
  }
  assert(duplicateBlocked, 'Rule #6: Atomic duplicate-scan protection successfully blocks re-boarding the same passenger ticket');

  // Mismatched operator scan must be blocked
  let operatorMismatchBlocked = false;
  try {
    await transportService.verifyAndBoardPassengerTicket({
      ticketToken: multiPassBooking.passengers[1]!.qrOpaqueToken,
      tripId: 'trip_gc_cairo_morning_1',
      operatorId: 'comp_sinai_express', // wrong operator
      driverId: 'drv_se_1',
    });
  } catch (err: any) {
    if (err.message.includes('Operator Mismatch')) {
      operatorMismatchBlocked = true;
    }
  }
  assert(operatorMismatchBlocked, 'Rule #6: Driver scan rejects ticket belonging to another operator');

  // 11. Rule #8: Cancellation Request vs Confirmed Cancellation Distinction
  const reqCancelBooking = await transportService.requestBookingCancellation(
    multiPassBooking.id,
    'Class postponed by professor'
  );
  assert(
    reqCancelBooking.status === 'cancellation_requested' &&
      reqCancelBooking.cancellationReason === 'Class postponed by professor',
    'Rule #8: Booking marked as cancellation_requested with reason, keeping distinction from confirmed cancellations'
  );

  const approvedBooking = await transportService.approveBookingCancellation(multiPassBooking.id);
  assert(
    approvedBooking.status === 'cancelled',
    'Rule #8: Operator approves cancellation, transitioning status to cancelled'
  );

  // 12. Rule #5: Separate Draft and Published Website Configurations
  const initialPublished = await transportService.getPublishedWebsiteConfig('comp_galala_connect');
  await transportService.saveDraftWebsiteConfig('comp_galala_connect', {
    ...initialPublished,
    heroTitleEn: 'New Experimental Draft Headline 2026',
    heroTitleAr: 'عنوان تجريبي غير منشور ٢٠٢٦',
  });

  const publicReadBeforePublish = await transportService.getPublishedWebsiteConfig('comp_galala_connect');
  assert(
    publicReadBeforePublish.heroTitleEn !== 'New Experimental Draft Headline 2026',
    'Rule #5: Public reads return published content only; draft edits are strictly isolated'
  );

  await transportService.publishWebsiteConfig('comp_galala_connect');
  const publicReadAfterPublish = await transportService.getPublishedWebsiteConfig('comp_galala_connect');
  assert(
    publicReadAfterPublish.heroTitleEn === 'New Experimental Draft Headline 2026',
    'Rule #5: Publishing website updates published configuration atomically'
  );

  console.log(`\n--- ALL VERIFICATIONS COMPLETE: ${passed} PASSED, ${failed} FAILED ---`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Fatal error in tests:', e);
  process.exit(1);
});
