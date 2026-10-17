export type BusStatus = 'active' | 'maintenance' | 'inactive';

export type BusRow = {
  id: string;
  plate_number: string;
  name: string | null;
  capacity: number;
  make: string | null;
  model: string | null;
  year: number | null;
  status: BusStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Bus = {
  id: string;
  plateNumber: string;
  name: string | null;
  capacity: number;
  make: string | null;
  model: string | null;
  year: number | null;
  status: BusStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export const BUS_SELECT = 'id,plate_number,name,capacity,make,model,year,status,notes,created_at,updated_at';

export const toBus = (r: BusRow): Bus => ({
  id: r.id,
  plateNumber: r.plate_number,
  name: r.name,
  capacity: r.capacity,
  make: r.make,
  model: r.model,
  year: r.year,
  status: r.status,
  notes: r.notes,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
