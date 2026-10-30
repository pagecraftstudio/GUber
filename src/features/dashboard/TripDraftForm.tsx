'use client';

import { useMemo, useState } from 'react';
import { createTripAction } from '@/features/dashboard/actions';

type BusOption = { id: string; plateNumber: string; capacity: number };
type Option = { id: string; label: string };

export function TripDraftForm({
  routes,
  buses,
  drivers,
}: {
  routes: Option[];
  buses: BusOption[];
  drivers: Option[];
}) {
  const [busId, setBusId] = useState('');
  const [capacity, setCapacity] = useState('');
  const [capacityTouched, setCapacityTouched] = useState(false);
  const [departureAt, setDepartureAt] = useState('');
  const [arrivalAt, setArrivalAt] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const selectedBus = useMemo(() => buses.find((bus) => bus.id === busId), [buses, busId]);
  const capacityLimit = selectedBus?.capacity ?? 100;
  const arrivalInvalid = Boolean(
    departureAt && arrivalAt && new Date(arrivalAt).getTime() <= new Date(departureAt).getTime(),
  );

  function handleBusChange(nextBusId: string) {
    setBusId(nextBusId);
    const nextBus = buses.find((bus) => bus.id === nextBusId);
    if (nextBus && !capacityTouched) setCapacity(String(nextBus.capacity));
    if (!nextBus && !capacityTouched) setCapacity('');
  }

  return (
    <form
      action={createTripAction}
      onSubmit={(event) => {
        setSubmitted(true);
        if (arrivalInvalid || (capacity !== '' && Number(capacity) > capacityLimit)) {
          event.preventDefault();
        }
      }}
      className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-2 xl:grid-cols-4"
    >
      <div className="sm:col-span-2 xl:col-span-4">
        <h2 className="font-bold">Create a trip draft</h2>
        <p className="mt-1 text-xs text-slate-500">
          Drafts are not visible in public search until moved through the approved trip status workflow.
        </p>
      </div>

      <Select name="routeId" label="Route" items={routes} />
      <label className="block text-xs font-semibold text-slate-500">
        Bus (optional)
        <select
          name="busId"
          value={busId}
          onChange={(event) => handleBusChange(event.target.value)}
          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        >
          <option value="">Unassigned</option>
          {buses.map((bus) => (
            <option key={bus.id} value={bus.id}>
              {bus.plateNumber} · {bus.capacity} seats
            </option>
          ))}
        </select>
      </label>
      <Select name="driverId" label="Driver (optional)" items={drivers} optional />
      <Field name="price" label="Ticket price (EGP)" type="number" />
      <label className="block text-xs font-semibold text-slate-500">
        Trip capacity
        <input
          required
          name="capacity"
          type="number"
          min={1}
          max={capacityLimit}
          step={1}
          value={capacity}
          onChange={(event) => {
            setCapacityTouched(true);
            setCapacity(event.target.value);
          }}
          aria-invalid={capacity !== '' && (Number(capacity) < 1 || Number(capacity) > capacityLimit)}
          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        />
        <span className="mt-1 block font-normal text-slate-400">
          {selectedBus
            ? `Up to ${selectedBus.capacity} seats for this bus. You can set a lower trip capacity.`
            : 'Maximum 100 seats until a bus is assigned.'}
        </span>
        {capacity !== '' && (Number(capacity) < 1 || Number(capacity) > capacityLimit) && (
          <span role="alert" className="mt-1 block text-red-600">
            Enter a capacity between 1 and {capacityLimit}.
          </span>
        )}
      </label>
      <Field
        name="departureAt"
        label="Departure"
        type="datetime-local"
        value={departureAt}
        onChange={setDepartureAt}
      />
      <label className="block text-xs font-semibold text-slate-500">
        Arrival
        <input
          required
          name="arrivalAt"
          type="datetime-local"
          min={departureAt || undefined}
          value={arrivalAt}
          onChange={(event) => setArrivalAt(event.target.value)}
          aria-invalid={arrivalInvalid}
          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        />
        {arrivalInvalid && (
          <span role="alert" className="mt-1 block text-red-600">
            Arrival must be later than departure.
          </span>
        )}
      </label>
      <div className="flex items-end">
        <button className="w-full rounded-xl bg-blue-600 px-4 py-3 text-xs font-bold text-white">
          Create draft
        </button>
      </div>
    </form>
  );
}

function Field({
  name,
  label,
  type = 'text',
  value,
  onChange,
}: {
  name: string;
  label: string;
  type?: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <label className="block text-xs font-semibold text-slate-500">
      {label}
      <input
        required
        name={name}
        type={type}
        min={type === 'number' ? 0 : undefined}
        step={type === 'number' ? 'any' : undefined}
        value={value}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
      />
    </label>
  );
}

function Select({
  name,
  label,
  items,
  optional = false,
}: {
  name: string;
  label: string;
  items: Option[];
  optional?: boolean;
}) {
  return (
    <label className="block text-xs font-semibold text-slate-500">
      {label}
      <select
        required={!optional}
        name={name}
        defaultValue=""
        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
      >
        {optional && <option value="">Unassigned</option>}
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}
