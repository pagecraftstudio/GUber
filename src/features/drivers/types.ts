export type DriverStatus = 'active' | 'inactive';

export type DriverRow = {
  id: string;
  user_id: string | null;
  full_name: string;
  phone: string;
  license_number: string | null;
  license_expiry: string | null;
  photo_media_id: string | null;
  status: DriverStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Driver = {
  id: string;
  /** Linked login account, if any. Read-only here: linking is a separate, validated operation (Phase 5). */
  userId: string | null;
  fullName: string;
  phone: string;
  licenseNumber: string | null;
  licenseExpiry: string | null;
  photoMediaId: string | null;
  status: DriverStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export const DRIVER_SELECT =
  'id,user_id,full_name,phone,license_number,license_expiry,photo_media_id,status,notes,created_at,updated_at';

export const toDriver = (r: DriverRow): Driver => ({
  id: r.id,
  userId: r.user_id,
  fullName: r.full_name,
  phone: r.phone,
  licenseNumber: r.license_number,
  licenseExpiry: r.license_expiry,
  photoMediaId: r.photo_media_id,
  status: r.status,
  notes: r.notes,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
