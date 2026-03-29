// Car Loan Contribution System Types

export type ContributionStatus = 'not-eligible' | 'in-progress' | 'eligible' | 'car-allocated';
export type UserRole = 'staff' | 'admin';
export type InvitationStatus = 'pending' | 'accepted' | 'rejected';

export interface User {
  id: string;
  email: string;
  password: string; // hashed in production
  name: string;
  role: UserRole;
  createdAt: string;
}

export interface StaffInvitation {
  id: string;
  email: string;
  invitedBy: string; // admin id
  status: InvitationStatus;
  invitedAt: string;
  monthlyDeduction: number;
  acceptedAt?: string;
}

export interface StaffMember {
  id: string;
  userId: string; // references User
  name: string;
  employeeId: string;
  department: string;
  email: string;
  joinDate: string;
  contributionAmount: number;
  targetAmount: number;
  status: ContributionStatus;
  deductions: Deduction[];
  queuePosition?: number;
  allocatedCar?: AllocatedCar;
  createdAt: string;
}

export interface Deduction {
  id: string;
  date: string;
  amount: number;
  month: string;
}

export interface AllocatedCar {
  id: string;
  make: string;
  model: string;
  year: number;
  color: string;
  licensePlate: string;
  allocationDate: string;
}

export interface AllocationQueueEntry {
  staffId: string;
  name: string;
  employeeId: string;
  contributionAmount: number;
  targetAmount: number;
  contributionPercentage: number;
  queuePosition: number;
}

export interface DashboardSummary {
  totalParticipants: number;
  eligibleForAllocation: number;
  carsAllocated: number;
  totalContributed: number;
}

// Constants
export const TARGET_AMOUNT = 5000000; // 5,000,000 NGN
export const CURRENCY_CODE = 'NGN'; // Nigerian Naira
