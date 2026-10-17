/**
 * Provisional API Contracts for MALAKY Bus SaaS
 * Reconciles frontend transport/auth service with PostgreSQL/Supabase implementation.
 */

import { Booking, PassengerTicket, Trip, WebsiteConfig } from './index';
import { CustomerUser, CustomerProfile, SignUpData } from './auth';

// --- AUTHENTICATION CONTRACTS (/api/auth/v1) ---
export interface AuthSignUpRequest extends SignUpData {}

export interface AuthSignUpResponse {
  user: CustomerUser;
  session: {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token: string;
  };
}

export interface AuthSignInRequest {
  email: string;
  password: string;
}

export interface AuthSignInResponse {
  user: CustomerUser;
  session: {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token: string;
  };
}

export interface PasswordResetRequest {
  email: string;
  redirectTo?: string;
}

// --- CUSTOMER PORTAL CONTRACTS (/api/v1/customer) ---
export interface GetCustomerBookingsResponse {
  bookings: Booking[];
  totalTrips: number;
  totalSpentEgp: number;
}

export interface RequestCancellationPayload {
  bookingId: string;
  reason: string;
}

export interface RequestCancellationResponse {
  success: boolean;
  bookingId: string;
  status: 'cancellation_requested';
  message: string;
}

// --- DRIVER BOARDING SCANNER CONTRACTS (/api/v1/driver/board-scan) ---
export interface DriverBoardScanRequest {
  ticketToken: string; // Cryptographically random opaque token (NO predictable booking IDs)
  tripId: string;
  operatorId: string;
  driverId: string;
}

export interface DriverBoardScanResponse {
  success: boolean;
  ticket: PassengerTicket;
  bookingReference: string;
  passengerName: string;
  boardedAt: string;
  allPassengersBoarded: boolean;
  message: string;
}

// --- WEBSITE BUILDER CONTRACTS (/api/v1/website) ---
export interface GetPublishedWebsiteResponse {
  companyId: string;
  slug: string;
  publishedConfig: WebsiteConfig;
}

export interface SaveDraftWebsiteRequest {
  companyId: string;
  draftConfig: WebsiteConfig;
}

export interface PublishWebsiteRequest {
  companyId: string;
}
