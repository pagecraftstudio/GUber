import { mapColumns } from '@/lib/db/columns';
import { rangeFor, type Page } from '@/lib/db/pagination';
import { expectFound, expectMaybe, expectOne, expectPage } from '@/lib/db/query';
import { ilikeAny } from '@/lib/db/search';
import type { TenantServiceContext } from '@/lib/service/context';
import type { CustomerCreate, CustomerListQuery, CustomerUpdate } from './schema';
import { CUSTOMER_SELECT, toCustomer, type Customer, type CustomerRow } from './types';

export type CustomerRepository = {
  list(ctx: TenantServiceContext, q: CustomerListQuery): Promise<Page<Customer>>;
  get(ctx: TenantServiceContext, id: string): Promise<Customer | null>;
  create(ctx: TenantServiceContext, input: CustomerCreate): Promise<Customer>;
  update(ctx: TenantServiceContext, id: string, patch: CustomerUpdate): Promise<Customer>;
};

const COLUMNS = {
  fullName: 'full_name',
  phone: 'phone',
  email: 'email',
  university: 'university',
  studentId: 'student_id',
  notes: 'notes',
} as const;

export const customerRepository: CustomerRepository = {
  async list(ctx, q) {
    let query = ctx.db
      .from('customers')
      .select(CUSTOMER_SELECT, { count: 'exact' })
      .eq('company_id', ctx.companyId)
      .is('deleted_at', null);
    const search = ilikeAny(['full_name', 'phone', 'email', 'student_id'], q.q);
    if (search) query = query.or(search);
    const { from, to } = rangeFor(q);
    return expectPage<CustomerRow, Customer>(await query.order(q.sort, { ascending: q.dir === 'asc' }).order('id').range(from, to), toCustomer, q);
  },

  async get(ctx, id) {
    return expectMaybe<CustomerRow, Customer>(
      await ctx.db.from('customers').select(CUSTOMER_SELECT).eq('company_id', ctx.companyId).eq('id', id).is('deleted_at', null).maybeSingle(),
      toCustomer,
    );
  },

  async create(ctx, input) {
    const row = { company_id: ctx.companyId, ...mapColumns(input, COLUMNS) };
    return expectOne<CustomerRow, Customer>(await ctx.db.from('customers').insert(row).select(CUSTOMER_SELECT).single(), toCustomer);
  },

  async update(ctx, id, patch) {
    return expectFound<CustomerRow, Customer>(
      await ctx.db
        .from('customers')
        .update(mapColumns(patch, COLUMNS))
        .eq('company_id', ctx.companyId)
        .eq('id', id)
        .is('deleted_at', null)
        .select(CUSTOMER_SELECT)
        .maybeSingle(),
      toCustomer,
    );
  },
};
