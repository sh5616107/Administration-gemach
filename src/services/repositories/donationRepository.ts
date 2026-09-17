import { getAllItems } from '../database'

export interface Donation {
  id: string
  donor_id: string
  amount: number
  donation_date: string
  notes?: string
  is_deleted?: boolean
  deleted_at?: string
}

/**
 * Repository לתרומות - הכנה למעבר ל-SQLite עתידי
 */
export const donationRepository = {
  /**
   * קבלת כל התרומות (ללא מחוקות)
   */
  async getAll(): Promise<Donation[]> {
    return getAllItems<Donation>('donations')
      .filter(d => !d.is_deleted)
  },

  /**
   * קבלת תרומה לפי ID
   */
  async getById(id: string): Promise<Donation | undefined> {
    const donations = getAllItems<Donation>('donations')
    return donations.find(d => d.id === id && !d.is_deleted)
  },

  /**
   * קבלת תרומות לפי תורם
   */
  async getByDonor(donorId: string): Promise<Donation[]> {
    return getAllItems<Donation>('donations')
      .filter(d => !d.is_deleted)
      .filter(d => d.donor_id === donorId)
      .sort((a, b) => new Date(b.donation_date).getTime() - new Date(a.donation_date).getTime())
  },

  /**
   * קבלת כל התרומות (כולל מחוקות)
   */
  async getAllIncludingDeleted(): Promise<Donation[]> {
    return getAllItems<Donation>('donations')
  }
}
