import { AppError, parseInput } from '@/lib/errors';
import { PERMISSIONS } from '@/lib/auth/permission-keys';
import type { Page } from '@/lib/db/pagination';
import { requirePermission } from '@/lib/service/authorize';
import type { TenantServiceContext } from '@/lib/service/context';
import { idSchema } from '@/lib/validation/common';
import { customerRepository, type CustomerRepository } from './repository';
import { customerCreateSchema, customerListSchema, customerUpdateSchema } from './schema';
import type { Customer } from './types';

/** Customers hold personal data (phone, student id). Removal/anonymisation rules arrive in Phase 5. */
export function makeCustomerService(repo: CustomerRepository) {
  return {
    async list(ctx: TenantServiceContext, rawQuery: unknown): Promise<Page<Customer>> {
      requirePermission(ctx, PERMISSIONS.customersRead);
      return repo.list(ctx, parseInput(customerListSchema, rawQuery ?? {}));
    },
    async get(ctx: TenantServiceContext, rawId: unknown): Promise<Customer> {
      requirePermission(ctx, PERMISSIONS.customersRead);
      const customer = await repo.get(ctx, parseInput(idSchema, rawId));
      if (!customer) throw new AppError('not_found');
      return customer;
    },
    async create(ctx: TenantServiceContext, input: unknown): Promise<Customer> {
      requirePermission(ctx, PERMISSIONS.customersWrite);
      return repo.create(ctx, parseInput(customerCreateSchema, input));
    },
    async update(ctx: TenantServiceContext, rawId: unknown, input: unknown): Promise<Customer> {
      requirePermission(ctx, PERMISSIONS.customersWrite);
      return repo.update(ctx, parseInput(idSchema, rawId), parseInput(customerUpdateSchema, input));
    },
  };
}
export type CustomerService = ReturnType<typeof makeCustomerService>;
export const customerService = makeCustomerService(customerRepository);
