import { PERMISSIONS } from '@/lib/auth/permission-keys';
import { parseInput } from '@/lib/errors';
import { requirePermission } from '@/lib/service/authorize';
import type { TenantServiceContext } from '@/lib/service/context';
import { paymentSettingsRepository, type PaymentSettingsRepository } from './repository';
import { paymentSettingsSchema } from './schema';

/** Order in every method: authorize -> validate -> repository. The database re-checks the permission and derives the company itself. */
export function makePaymentSettingsService(repo: PaymentSettingsRepository) {
  return {
    get(ctx: TenantServiceContext) { requirePermission(ctx, PERMISSIONS.settingsRead); return repo.get(ctx); },
    async save(ctx: TenantServiceContext, input: unknown): Promise<void> {
      requirePermission(ctx, PERMISSIONS.settingsWrite);
      await repo.save(ctx, parseInput(paymentSettingsSchema, input));
    },
  };
}
export const paymentSettingsService = makePaymentSettingsService(paymentSettingsRepository);
