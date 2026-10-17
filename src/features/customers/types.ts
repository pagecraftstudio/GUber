export type CustomerRow = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  university: string | null;
  student_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Customer = {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  university: string | null;
  studentId: string | null;
  /** Staff-only. Never include in anything a driver or the public site can see. */
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export const CUSTOMER_SELECT = 'id,full_name,phone,email,university,student_id,notes,created_at,updated_at';

export const toCustomer = (r: CustomerRow): Customer => ({
  id: r.id,
  fullName: r.full_name,
  phone: r.phone,
  email: r.email,
  university: r.university,
  studentId: r.student_id,
  notes: r.notes,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
