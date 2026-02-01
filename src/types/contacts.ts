/**
 * Types and interfaces for the Unified Contacts feature
 * 
 * This module defines all data structures for managing contacts across
 * different roles (borrowers, guarantors, donors, depositors) in a unified view.
 */

/**
 * Contact role types
 * Represents the different roles a contact can have in the system
 */
export type ContactRoleType = 'borrower' | 'guarantor' | 'donor' | 'depositor';

/**
 * Contact role information
 * Links a contact to a specific entity in one of the role tables
 */
export interface ContactRole {
  /** Type of role (borrower, guarantor, donor, or depositor) */
  type: ContactRoleType;
  /** ID of the entity in the corresponding table */
  entity_id: number;
  /** Whether this role is currently active */
  active: boolean;
}

/**
 * Contact statistics
 * Aggregated financial and activity statistics for a contact across all roles
 */
export interface ContactStats {
  // Borrower statistics
  /** Total number of loans as borrower */
  total_loans: number;
  /** Number of currently active loans */
  active_loans: number;
  /** Total amount borrowed across all loans */
  total_borrowed: number;
  /** Current outstanding debt */
  total_debt: number;
  
  // Guarantor statistics
  /** Total number of guarantees provided */
  total_guarantees: number;
  /** Number of currently active guarantees */
  active_guarantees: number;
  /** Total amount guaranteed */
  total_guaranteed: number;
  
  // Donor statistics
  /** Total number of donations made */
  total_donations: number;
  /** Total amount donated */
  total_donated: number;
  
  // Depositor statistics
  /** Total number of deposits made */
  total_deposits: number;
  /** Number of currently active deposits */
  active_deposits: number;
  /** Total amount deposited */
  total_deposited: number;
  /** Current active deposit amount */
  active_deposit_amount: number;
  
  // Net balance
  /** Net balance (donations + deposits - loans - guarantees) */
  net_balance: number;
}

/**
 * Contact activity types
 * Represents different types of activities a contact can perform
 */
export type ContactActivityType = 
  | 'loan' 
  | 'repayment' 
  | 'donation' 
  | 'deposit' 
  | 'withdrawal' 
  | 'guarantee';

/**
 * Contact activity record
 * Represents a single activity/transaction in a contact's history
 */
export interface ContactActivity {
  /** Unique identifier for the activity */
  id: string;
  /** Type of activity */
  type: ContactActivityType;
  /** Date of the activity */
  date: string;
  /** Amount involved in the activity */
  amount: number;
  /** Current status of the activity */
  status: string;
  /** Description of the activity */
  description: string;
  /** ID of the related entity (loan, donation, etc.) */
  related_entity_id: number;
}

/**
 * Unified contact
 * Main interface representing a contact with all their information and roles
 */
export interface UnifiedContact {
  // Unique identifier (phone number)
  /** Unique identifier - phone number */
  id: string;
  
  // Basic personal information
  /** First name */
  first_name: string;
  /** Last name */
  last_name: string;
  /** Primary phone number */
  phone: string;
  /** Israeli ID number (optional) */
  id_number?: string;
  /** City */
  city?: string;
  /** Street address */
  address?: string;
  /** Email address */
  email?: string;
  /** General notes about the contact */
  notes?: string;
  
  // Roles
  /** List of roles this contact has in the system */
  roles: ContactRole[];
  
  // Entity IDs in original tables
  /** ID in borrowers table (if applicable) */
  borrower_id?: number;
  /** ID in guarantors table (if applicable) */
  guarantor_id?: number;
  /** ID in donors table (if applicable) */
  donor_id?: number;
  /** ID in depositors table (if applicable) */
  depositor_id?: number;
  
  // Statistics
  /** Aggregated statistics across all roles */
  stats: ContactStats;
  
  // Tags
  /** List of tags for categorizing/organizing contacts */
  tags: string[];
  
  // Timestamps
  /** Creation timestamp */
  created_at: string;
  /** Last update timestamp */
  updated_at: string;
}

/**
 * Contact form data
 * Data structure for creating or updating a contact
 */
export interface ContactFormData {
  first_name: string;
  last_name: string;
  phone: string;
  id_number?: string;
  city?: string;
  address?: string;
  email?: string;
  notes?: string;
  initial_roles?: ContactRoleType[];
  tags?: string[];
}

/**
 * Contact search filters
 * Criteria for filtering and searching contacts
 */
export interface ContactSearchFilters {
  /** Search term (name, phone, or ID number) */
  searchTerm?: string;
  /** Filter by specific roles */
  roles?: ContactRoleType[];
  /** Filter by tags */
  tags?: string[];
  /** Filter by city */
  city?: string;
}

/**
 * Contact database record
 * Structure of the contacts table in the database
 */
export interface ContactsTableRecord {
  /** Primary key - phone number */
  phone: string;
  /** First name */
  first_name: string;
  /** Last name */
  last_name: string;
  /** Israeli ID number */
  id_number?: string;
  /** City */
  city?: string;
  /** Street address */
  address?: string;
  /** Email address */
  email?: string;
  /** General notes */
  notes?: string;
  /** Tags as JSON string */
  tags: string;
  /** Foreign key to borrowers table */
  borrower_id?: number;
  /** Foreign key to guarantors table */
  guarantor_id?: number;
  /** Foreign key to donors table */
  donor_id?: number;
  /** Foreign key to depositors table */
  depositor_id?: number;
  /** Creation timestamp */
  created_at: string;
  /** Last update timestamp */
  updated_at: string;
}
