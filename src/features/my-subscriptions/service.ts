import { parseInput } from '@/lib/errors';
import { idSchema } from '@/lib/validation/common';
import { memberSubscriptionRepository, type MemberDb, type MemberSubscriptionRepository } from './repository';
import { bookSchema, daySchema, phoneUpdateSchema, requestSchema, returnOptionsSchema } from './schema';

/** The caller is the signed-in member (route guards use requireCustomer). No permission keys: members only ever touch their own rows,
 *  and the database enforces that again. Order in every method: validate -> repository. */
export type MemberContext = MemberDb & { readonly userId: string };

export function makeMemberSubscriptionService(repo: MemberSubscriptionRepository) {
  return {
    profile: (c: MemberContext) => repo.profile(c, c.userId),
    savePhone: (c: MemberContext, input: unknown) => repo.setPhone(c, c.userId, parseInput(phoneUpdateSchema, input).phone),
    publicPlans: (c: MemberContext) => repo.publicPlans(c),
    mine: (c: MemberContext) => repo.mine(c),
    notices: (c: MemberContext) => repo.notices(c),
    markNoticesRead: (c: MemberContext) => repo.markNoticesRead(c),
    request: (c: MemberContext, input: unknown) => repo.request(c, parseInput(requestSchema, input).planId),
    cancel: (c: MemberContext, id: unknown) => repo.cancel(c, parseInput(idSchema, id)),
    outboundOptions: (c: MemberContext, input: unknown) => { const i = parseInput(daySchema, input); return repo.outboundOptions(c, i.subscriptionId, i.day); },
    returnOptions: (c: MemberContext, input: unknown) => { const i = parseInput(returnOptionsSchema, input); return repo.returnOptions(c, i.subscriptionId, i.outboundTripId); },
    dayState: (c: MemberContext, input: unknown) => { const i = parseInput(daySchema, input); return repo.dayState(c, i.subscriptionId, i.day); },
    bookings: (c: MemberContext, id: unknown) => repo.bookings(c, parseInput(idSchema, id)),
    book: (c: MemberContext, input: unknown) => repo.book(c, parseInput(bookSchema, input)),
    cancelBooking: (c: MemberContext, id: unknown) => repo.cancelBooking(c, parseInput(idSchema, id)),
  };
}
export const memberSubscriptionService = makeMemberSubscriptionService(memberSubscriptionRepository);
