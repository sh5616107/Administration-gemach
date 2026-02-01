/**
 * Contacts Service - שירות מרכזי לניהול אנשי קשר מאוחדים
 * 
 * שירות זה מאחד נתונים מכל הטבלאות (borrowers, guarantors, donors, depositors)
 * ומספק API אחיד לעבודה עם אנשי קשר במערכת הגמ"ח.
 */

import {
  UnifiedContact,
  ContactRole,
  ContactStats,
  ContactActivity,
  ContactFormData,
  ContactSearchFilters,
  ContactsTableRecord
} from '../types/contacts'

import {
  borrowersService,
  guarantorsService,
  loansService,
  repaymentsService,
  contactsService as dbContactsService,
  Borrower,
  Guarantor,
  Loan
} from './database'

import { db } from './database'

/**
 * קבלת כל אנשי הקשר מאוחדים
 * מאחד נתונים מכל הטבלאות ומחזיר רשימה ממוינת
 */
export async function getAllContacts(): Promise<UnifiedContact[]> {
  try {
    // קבלת כל הנתונים מהטבלאות
    const contactsFromDb = await db.query('SELECT * FROM contacts') as any[]
    const borrowers = await borrowersService.getAll()
    const guarantors = await guarantorsService.getAll()
    const donors = await db.query('SELECT * FROM donors')
    const depositors = await db.query('SELECT * FROM depositors')

    // מפה לאחסון אנשי קשר לפי טלפון
    const contactsMap = new Map<string, UnifiedContact>()

    // תחילה, נוסיף את כל אנשי הקשר מטבלת contacts (כולל אלו ללא תפקיד)
    for (const contact of contactsFromDb) {
      const unifiedContact: UnifiedContact = {
        id: contact.phone,
        phone: contact.phone,
        first_name: contact.first_name,
        last_name: contact.last_name,
        id_number: contact.id_number,
        city: contact.city,
        address: contact.address,
        email: contact.email,
        notes: contact.notes,
        borrower_id: contact.borrower_id,
        guarantor_id: contact.guarantor_id,
        donor_id: contact.donor_id,
        depositor_id: contact.depositor_id,
        roles: [],
        tags: contact.tags ? JSON.parse(contact.tags) : [],
        stats: {
          total_loans: 0,
          active_loans: 0,
          total_borrowed: 0,
          total_debt: 0,
          total_guarantees: 0,
          active_guarantees: 0,
          total_guaranteed: 0,
          total_donations: 0,
          total_donated: 0,
          total_deposits: 0,
          active_deposits: 0,
          total_deposited: 0,
          active_deposit_amount: 0,
          net_balance: 0
        },
        created_at: contact.created_at || new Date().toISOString(),
        updated_at: contact.updated_at || new Date().toISOString()
      }
      contactsMap.set(contact.phone, unifiedContact)
    }

    // איחוד מכל הטבלאות - הוספת תפקידים
    for (const borrower of borrowers) {
      const phone = borrower.phone
      if (!contactsMap.has(phone)) {
        contactsMap.set(phone, createUnifiedContactFromBorrower(borrower))
      } else {
        const contact = contactsMap.get(phone)!
        contact.borrower_id = borrower.id
        contact.roles.push({ type: 'borrower', entity_id: borrower.id, active: true })
      }
    }

    for (const guarantor of guarantors) {
      const phone = guarantor.phone
      if (contactsMap.has(phone)) {
        const contact = contactsMap.get(phone)!
        contact.guarantor_id = guarantor.id
        contact.roles.push({ type: 'guarantor', entity_id: guarantor.id, active: true })
      } else {
        contactsMap.set(phone, createUnifiedContactFromGuarantor(guarantor))
      }
    }

    for (const donor of donors as any[]) {
      const phone = donor.phone
      if (contactsMap.has(phone)) {
        const contact = contactsMap.get(phone)!
        contact.donor_id = donor.id
        contact.roles.push({ type: 'donor', entity_id: donor.id, active: true })
      } else {
        contactsMap.set(phone, createUnifiedContactFromDonor(donor))
      }
    }

    for (const depositor of depositors as any[]) {
      const phone = depositor.phone
      if (contactsMap.has(phone)) {
        const contact = contactsMap.get(phone)!
        contact.depositor_id = depositor.id
        contact.roles.push({ type: 'depositor', entity_id: depositor.id, active: true })
      } else {
        contactsMap.set(phone, createUnifiedContactFromDepositor(depositor))
      }
    }

    // חישוב סטטיסטיקות לכל איש קשר
    const contacts = Array.from(contactsMap.values())
    for (const contact of contacts) {
      contact.stats = await calculateContactStats(contact)
    }

    // מיון לפי שם משפחה ושם פרטי
    return contacts.sort((a, b) => 
      `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`)
    )
  } catch (error) {
    console.error('שגיאה בטעינת אנשי קשר:', error)
    return []
  }
}

/**
 * קבלת איש קשר לפי מספר טלפון
 */
export async function getContactByPhone(phone: string): Promise<UnifiedContact | null> {
  const contacts = await getAllContacts()
  return contacts.find(c => c.phone === phone) || null
}

/**
 * חיפוש אנשי קשר
 * תומך בחיפוש לפי שם, טלפון, מספר זהות, עיר
 */
export async function searchContacts(term: string): Promise<UnifiedContact[]> {
  const allContacts = await getAllContacts()
  const searchTerm = term.toLowerCase()
  
  return allContacts.filter(contact => 
    contact.first_name.toLowerCase().includes(searchTerm) ||
    contact.last_name.toLowerCase().includes(searchTerm) ||
    contact.phone.includes(term) ||
    (contact.id_number && contact.id_number.includes(term)) ||
    (contact.city && contact.city.toLowerCase().includes(searchTerm))
  ).slice(0, 50) // הגבלה ל-50 תוצאות לביצועים
}

/**
 * סינון אנשי קשר לפי תפקידים
 */
export async function filterByRoles(roles: ContactRole['type'][]): Promise<UnifiedContact[]> {
  const allContacts = await getAllContacts()
  
  return allContacts.filter(contact =>
    contact.roles.some(role => roles.includes(role.type))
  )
}

/**
 * יצירת איש קשר חדש
 */
export async function createContact(
  data: ContactFormData,
  initialRoles: ContactRole['type'][]
): Promise<UnifiedContact> {
  const now = new Date().toISOString()
  
  // יצירת רשומה בטבלת contacts
  await dbContactsService.create({
    phone: data.phone,
    first_name: data.first_name,
    last_name: data.last_name,
    id_number: data.id_number,
    city: data.city,
    address: data.address,
    email: data.email,
    notes: data.notes,
    tags: JSON.stringify(data.tags || [])
  })

  // יצירת רשומות בטבלאות המתאימות לפי התפקידים
  const contact: UnifiedContact = {
    id: data.phone,
    phone: data.phone,
    first_name: data.first_name,
    last_name: data.last_name,
    id_number: data.id_number,
    city: data.city,
    address: data.address,
    email: data.email,
    notes: data.notes,
    roles: [],
    tags: data.tags || [],
    stats: {
      total_loans: 0,
      active_loans: 0,
      total_borrowed: 0,
      total_debt: 0,
      total_guarantees: 0,
      active_guarantees: 0,
      total_guaranteed: 0,
      total_donations: 0,
      total_donated: 0,
      total_deposits: 0,
      active_deposits: 0,
      total_deposited: 0,
      active_deposit_amount: 0,
      net_balance: 0
    },
    created_at: now,
    updated_at: now
  }

  // יצירת ישויות לפי תפקידים התחלתיים
  for (const role of initialRoles) {
    await addRoleToContact(contact, role)
  }

  return contact
}

/**
 * הוספת תפקיד לאיש קשר קיים
 */
export async function addRoleToContact(contact: UnifiedContact, roleType: ContactRole['type']): Promise<void> {
  const entityData = {
    first_name: contact.first_name,
    last_name: contact.last_name,
    phone: contact.phone,
    id_number: contact.id_number,
    address: contact.address,
    email: contact.email,
    notes: contact.notes
  }

  switch (roleType) {
    case 'borrower':
      const borrowerResult = await borrowersService.create({
        ...entityData,
        city: contact.city
      })
      contact.borrower_id = borrowerResult.lastInsertRowid
      contact.roles.push({ type: 'borrower', entity_id: borrowerResult.lastInsertRowid, active: true })
      break

    case 'guarantor':
      const guarantorResult = await guarantorsService.create(entityData)
      contact.guarantor_id = guarantorResult.lastInsertRowid
      contact.roles.push({ type: 'guarantor', entity_id: guarantorResult.lastInsertRowid, active: true })
      break

    case 'donor':
      const donorResult = await db.run(
        'INSERT INTO donors (first_name, last_name, phone, id_number, address, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [entityData.first_name, entityData.last_name, entityData.phone, entityData.id_number, entityData.address, entityData.email, entityData.notes]
      )
      contact.donor_id = donorResult.lastInsertRowid
      contact.roles.push({ type: 'donor', entity_id: donorResult.lastInsertRowid, active: true })
      break

    case 'depositor':
      const depositorResult = await db.run(
        'INSERT INTO depositors (first_name, last_name, phone, id_number, address, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [entityData.first_name, entityData.last_name, entityData.phone, entityData.id_number, entityData.address, entityData.email, entityData.notes]
      )
      contact.depositor_id = depositorResult.lastInsertRowid
      contact.roles.push({ type: 'depositor', entity_id: depositorResult.lastInsertRowid, active: true })
      break
  }

  // עדכון טבלת contacts עם ה-ID החדש
  await dbContactsService.update(contact.phone, {
    borrower_id: contact.borrower_id,
    guarantor_id: contact.guarantor_id,
    donor_id: contact.donor_id,
    depositor_id: contact.depositor_id
  } as any)
}

/**
 * הוספת תפקיד לאיש קשר קיים לפי טלפון
 */
export async function addRoleToContactByPhone(phone: string, roleType: ContactRole['type']): Promise<void> {
  const contact = await getContactByPhone(phone)
  if (!contact) {
    throw new Error('איש קשר לא נמצא')
  }

  // בדיקה אם התפקיד כבר קיים
  if (contact.roles.some(r => r.type === roleType)) {
    throw new Error('תפקיד זה כבר קיים לאיש קשר')
  }

  await addRoleToContact(contact, roleType)
}

/**
 * חישוב סטטיסטיקות לאיש קשר (ללא קריאה חוזרת ל-getAllContacts)
 */
async function calculateContactStats(contact: UnifiedContact): Promise<ContactStats> {
  const stats: ContactStats = {
    total_loans: 0,
    active_loans: 0,
    total_borrowed: 0,
    total_debt: 0,
    total_guarantees: 0,
    active_guarantees: 0,
    total_guaranteed: 0,
    total_donations: 0,
    total_donated: 0,
    total_deposits: 0,
    active_deposits: 0,
    total_deposited: 0,
    active_deposit_amount: 0,
    net_balance: 0
  }

  try {
    // סטטיסטיקות לווה
    if (contact.borrower_id) {
      const loans = await loansService.getByBorrower(contact.borrower_id)
      stats.total_loans = loans.length
      stats.active_loans = loans.filter(l => l.status === 'active').length
      stats.total_borrowed = loans.reduce((sum, l) => sum + l.amount, 0)
      stats.total_debt = loans.filter(l => l.status === 'active').reduce((sum, l) => sum + (l.remaining || 0), 0)
    }

    // סטטיסטיקות ערב
    let guarantorActualDebt = 0 // חוב ממשי שהועבר לערב
    if (contact.guarantor_id) {
      const allLoans = await loansService.getAll()
      const guaranteedLoans = allLoans.filter(l => 
        l.guarantor1_id === contact.guarantor_id || l.guarantor2_id === contact.guarantor_id
      )
      stats.total_guarantees = guaranteedLoans.length
      stats.active_guarantees = guaranteedLoans.filter(l => l.status === 'active').length
      stats.total_guaranteed = guaranteedLoans.filter(l => l.status === 'active').reduce((sum, l) => sum + (l.remaining || 0), 0)
      
      // חישוב חוב ממשי - רק הלוואות שהועברו לערב
      guarantorActualDebt = guaranteedLoans
        .filter(l => l.status === 'transferred_to_guarantor')
        .reduce((sum, l) => sum + (l.remaining || 0), 0)
    }

    // סטטיסטיקות תורם
    if (contact.donor_id) {
      const donations = await db.query('SELECT * FROM donations WHERE donor_id = ?', [contact.donor_id]) as any[]
      stats.total_donations = donations.length
      stats.total_donated = donations.reduce((sum, d) => sum + d.amount, 0)
    }

    // סטטיסטיקות מפקיד
    if (contact.depositor_id) {
      const deposits = await db.query('SELECT * FROM deposits WHERE depositor_id = ?', [contact.depositor_id]) as any[]
      stats.total_deposits = deposits.length
      stats.active_deposits = deposits.filter(d => d.status === 'active').length
      stats.total_deposited = deposits.reduce((sum, d) => sum + d.amount, 0)
      stats.active_deposit_amount = deposits.filter(d => d.status === 'active').reduce((sum, d) => sum + d.amount, 0)
    }

    // חישוב מאזן נטו - רק חוב ממשי (לווה + הלוואות שהועברו לערב)
    stats.net_balance = (stats.total_donated + stats.active_deposit_amount) - (stats.total_debt + guarantorActualDebt)
  } catch (error) {
    console.error('שגיאה בחישוב סטטיסטיקות:', error)
  }

  return stats
}

/**
 * קבלת סטטיסטיקות איש קשר
 */
export async function getContactStats(phone: string): Promise<ContactStats> {
  const contact = await getContactByPhone(phone)
  if (!contact) {
    return {
      total_loans: 0,
      active_loans: 0,
      total_borrowed: 0,
      total_debt: 0,
      total_guarantees: 0,
      active_guarantees: 0,
      total_guaranteed: 0,
      total_donations: 0,
      total_donated: 0,
      total_deposits: 0,
      active_deposits: 0,
      total_deposited: 0,
      active_deposit_amount: 0,
      net_balance: 0
    }
  }

  const stats: ContactStats = {
    total_loans: 0,
    active_loans: 0,
    total_borrowed: 0,
    total_debt: 0,
    total_guarantees: 0,
    active_guarantees: 0,
    total_guaranteed: 0,
    total_donations: 0,
    total_donated: 0,
    total_deposits: 0,
    active_deposits: 0,
    total_deposited: 0,
    active_deposit_amount: 0,
    net_balance: 0
  }

  // סטטיסטיקות לווה
  if (contact.borrower_id) {
    const loans = await loansService.getByBorrower(contact.borrower_id)
    stats.total_loans = loans.length
    stats.active_loans = loans.filter(l => l.status === 'active').length
    stats.total_borrowed = loans.reduce((sum, l) => sum + l.amount, 0)
    stats.total_debt = loans.filter(l => l.status === 'active').reduce((sum, l) => sum + (l.remaining || 0), 0)
  }

  // סטטיסטיקות ערב
  let guarantorActualDebt = 0 // חוב ממשי שהועבר לערב
  if (contact.guarantor_id) {
    const allLoans = await loansService.getAll()
    const guaranteedLoans = allLoans.filter(l => 
      l.guarantor1_id === contact.guarantor_id || l.guarantor2_id === contact.guarantor_id
    )
    stats.total_guarantees = guaranteedLoans.length
    stats.active_guarantees = guaranteedLoans.filter(l => l.status === 'active').length
    stats.total_guaranteed = guaranteedLoans.filter(l => l.status === 'active').reduce((sum, l) => sum + (l.remaining || 0), 0)
    
    // חישוב חוב ממשי - רק הלוואות שהועברו לערב
    guarantorActualDebt = guaranteedLoans
      .filter(l => l.status === 'transferred_to_guarantor')
      .reduce((sum, l) => sum + (l.remaining || 0), 0)
  }

  // סטטיסטיקות תורם
  if (contact.donor_id) {
    const donations = await db.query('SELECT * FROM donations WHERE donor_id = ?', [contact.donor_id]) as any[]
    stats.total_donations = donations.length
    stats.total_donated = donations.reduce((sum, d) => sum + d.amount, 0)
  }

  // סטטיסטיקות מפקיד
  if (contact.depositor_id) {
    const deposits = await db.query('SELECT * FROM deposits WHERE depositor_id = ?', [contact.depositor_id]) as any[]
    stats.total_deposits = deposits.length
    stats.active_deposits = deposits.filter(d => d.status === 'active').length
    stats.total_deposited = deposits.reduce((sum, d) => sum + d.amount, 0)
    stats.active_deposit_amount = deposits.filter(d => d.status === 'active').reduce((sum, d) => sum + d.amount, 0)
  }

  // חישוב מאזן נטו - רק חוב ממשי (לווה + הלוואות שהועברו לערב)
  stats.net_balance = (stats.total_donated + stats.active_deposit_amount) - (stats.total_debt + guarantorActualDebt)

  return stats
}

/**
 * קבלת היסטוריית פעילות של איש קשר
 */
export async function getContactActivity(phone: string): Promise<ContactActivity[]> {
  const contact = await getContactByPhone(phone)
  if (!contact) return []

  const activities: ContactActivity[] = []

  // הלוואות
  if (contact.borrower_id) {
    const loans = await loansService.getByBorrower(contact.borrower_id)
    for (const loan of loans) {
      activities.push({
        id: `loan-${loan.id}`,
        type: 'loan',
        date: loan.loan_date,
        amount: loan.amount,
        status: loan.status,
        description: `הלוואה ${loan.loan_type === 'fixed' ? 'קבועה' : 'גמישה'}`,
        related_entity_id: loan.id
      })

      // פירעונות
      const repayments = await repaymentsService.getByLoan(loan.id)
      for (const repayment of repayments) {
        activities.push({
          id: `repayment-${repayment.id}`,
          type: 'repayment',
          date: repayment.payment_date,
          amount: repayment.amount,
          status: 'completed',
          description: `פירעון להלוואה #${loan.id}`,
          related_entity_id: repayment.id
        })
      }
    }
  }

  // ערבויות
  if (contact.guarantor_id) {
    const allLoans = await loansService.getAll()
    const guaranteedLoans = allLoans.filter(l => 
      l.guarantor1_id === contact.guarantor_id || l.guarantor2_id === contact.guarantor_id
    )
    for (const loan of guaranteedLoans) {
      activities.push({
        id: `guarantee-${loan.id}`,
        type: 'guarantee',
        date: loan.loan_date,
        amount: loan.amount,
        status: loan.status,
        description: `ערבות להלוואה של ${loan.borrower_name}`,
        related_entity_id: loan.id
      })
    }
  }

  // תרומות
  if (contact.donor_id) {
    const donations = await db.query('SELECT * FROM donations WHERE donor_id = ?', [contact.donor_id]) as any[]
    for (const donation of donations) {
      activities.push({
        id: `donation-${donation.id}`,
        type: 'donation',
        date: donation.donation_date,
        amount: donation.amount,
        status: 'completed',
        description: 'תרומה',
        related_entity_id: donation.id
      })
    }
  }

  // הפקדות ומשיכות
  if (contact.depositor_id) {
    const deposits = await db.query('SELECT * FROM deposits WHERE depositor_id = ?', [contact.depositor_id]) as any[]
    for (const deposit of deposits) {
      activities.push({
        id: `deposit-${deposit.id}`,
        type: 'deposit',
        date: deposit.deposit_date,
        amount: deposit.amount,
        status: deposit.status,
        description: `הפקדה ${deposit.period_type === 'fixed' ? 'קבועה' : 'גמישה'}`,
        related_entity_id: deposit.id
      })

      if (deposit.status === 'withdrawn' && deposit.withdrawal_date) {
        activities.push({
          id: `withdrawal-${deposit.id}`,
          type: 'withdrawal',
          date: deposit.withdrawal_date,
          amount: deposit.withdrawn_amount || deposit.amount,
          status: 'completed',
          description: `משיכת הפקדה #${deposit.id}`,
          related_entity_id: deposit.id
        })
      }
    }
  }

  // מיון לפי תאריך (אחרונות ראשונות)
  return activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

// פונקציות עזר ליצירת UnifiedContact מישויות שונות
function createUnifiedContactFromBorrower(borrower: Borrower): UnifiedContact {
  return {
    id: borrower.phone,
    phone: borrower.phone,
    first_name: borrower.first_name,
    last_name: borrower.last_name,
    id_number: borrower.id_number,
    city: borrower.city,
    address: borrower.address,
    email: borrower.email,
    notes: borrower.notes,
    borrower_id: borrower.id,
    roles: [{ type: 'borrower', entity_id: borrower.id, active: true }],
    tags: [],
    stats: {
      total_loans: 0,
      active_loans: 0,
      total_borrowed: 0,
      total_debt: 0,
      total_guarantees: 0,
      active_guarantees: 0,
      total_guaranteed: 0,
      total_donations: 0,
      total_donated: 0,
      total_deposits: 0,
      active_deposits: 0,
      total_deposited: 0,
      active_deposit_amount: 0,
      net_balance: 0
    },
    created_at: borrower.created_at,
    updated_at: borrower.created_at
  }
}

function createUnifiedContactFromGuarantor(guarantor: Guarantor): UnifiedContact {
  return {
    id: guarantor.phone,
    phone: guarantor.phone,
    first_name: guarantor.first_name,
    last_name: guarantor.last_name,
    id_number: guarantor.id_number,
    address: guarantor.address,
    email: guarantor.email,
    notes: guarantor.notes,
    guarantor_id: guarantor.id,
    roles: [{ type: 'guarantor', entity_id: guarantor.id, active: true }],
    tags: [],
    stats: {
      total_loans: 0,
      active_loans: 0,
      total_borrowed: 0,
      total_debt: 0,
      total_guarantees: 0,
      active_guarantees: 0,
      total_guaranteed: 0,
      total_donations: 0,
      total_donated: 0,
      total_deposits: 0,
      active_deposits: 0,
      total_deposited: 0,
      active_deposit_amount: 0,
      net_balance: 0
    },
    created_at: guarantor.created_at,
    updated_at: guarantor.created_at
  }
}

function createUnifiedContactFromDonor(donor: any): UnifiedContact {
  return {
    id: donor.phone,
    phone: donor.phone,
    first_name: donor.first_name,
    last_name: donor.last_name,
    id_number: donor.id_number,
    address: donor.address,
    email: donor.email,
    notes: donor.notes,
    donor_id: donor.id,
    roles: [{ type: 'donor', entity_id: donor.id, active: true }],
    tags: [],
    stats: {
      total_loans: 0,
      active_loans: 0,
      total_borrowed: 0,
      total_debt: 0,
      total_guarantees: 0,
      active_guarantees: 0,
      total_guaranteed: 0,
      total_donations: 0,
      total_donated: 0,
      total_deposits: 0,
      active_deposits: 0,
      total_deposited: 0,
      active_deposit_amount: 0,
      net_balance: 0
    },
    created_at: donor.created_at || new Date().toISOString(),
    updated_at: donor.created_at || new Date().toISOString()
  }
}

function createUnifiedContactFromDepositor(depositor: any): UnifiedContact {
  return {
    id: depositor.phone,
    phone: depositor.phone,
    first_name: depositor.first_name,
    last_name: depositor.last_name,
    id_number: depositor.id_number,
    address: depositor.address,
    email: depositor.email,
    notes: depositor.notes,
    depositor_id: depositor.id,
    roles: [{ type: 'depositor', entity_id: depositor.id, active: true }],
    tags: [],
    stats: {
      total_loans: 0,
      active_loans: 0,
      total_borrowed: 0,
      total_debt: 0,
      total_guarantees: 0,
      active_guarantees: 0,
      total_guaranteed: 0,
      total_donations: 0,
      total_donated: 0,
      total_deposits: 0,
      active_deposits: 0,
      total_deposited: 0,
      active_deposit_amount: 0,
      net_balance: 0
    },
    created_at: depositor.created_at || new Date().toISOString(),
    updated_at: depositor.created_at || new Date().toISOString()
  }
}

/**
 * עדכון פרטי איש קשר
 * מעדכן את המידע בכל הטבלאות המקושרות
 */
export async function updateContact(phone: string, data: Partial<UnifiedContact>): Promise<void> {
  const contact = await getContactByPhone(phone)
  if (!contact) {
    throw new Error('איש קשר לא נמצא')
  }

  // עדכון טבלת contacts
  await dbContactsService.update(phone, {
    first_name: data.first_name,
    last_name: data.last_name,
    id_number: data.id_number,
    city: data.city,
    address: data.address,
    email: data.email,
    notes: data.notes,
    tags: data.tags ? JSON.stringify(data.tags) : undefined
  } as any)

  // עדכון בכל הטבלאות המקושרות
  const updateData = {
    first_name: data.first_name || contact.first_name,
    last_name: data.last_name || contact.last_name,
    id_number: data.id_number !== undefined ? data.id_number : contact.id_number,
    address: data.address !== undefined ? data.address : contact.address,
    email: data.email !== undefined ? data.email : contact.email,
    notes: data.notes !== undefined ? data.notes : contact.notes
  }

  if (contact.borrower_id) {
    await borrowersService.update(contact.borrower_id, {
      ...updateData,
      city: data.city !== undefined ? data.city : contact.city
    })
  }

  if (contact.guarantor_id) {
    await guarantorsService.update(contact.guarantor_id, updateData)
  }

  if (contact.donor_id) {
    await db.run(
      'UPDATE donors SET first_name = ?, last_name = ?, id_number = ?, address = ?, email = ?, notes = ? WHERE id = ?',
      [updateData.first_name, updateData.last_name, updateData.id_number, updateData.address, updateData.email, updateData.notes, contact.donor_id]
    )
  }

  if (contact.depositor_id) {
    await db.run(
      'UPDATE depositors SET first_name = ?, last_name = ?, id_number = ?, address = ?, email = ?, notes = ? WHERE id = ?',
      [updateData.first_name, updateData.last_name, updateData.id_number, updateData.address, updateData.email, updateData.notes, contact.depositor_id]
    )
  }
}

/**
 * מחיקת איש קשר
 * מונע מחיקה אם יש פעילות פעילה
 */
export async function deleteContact(phone: string): Promise<void> {
  const contact = await getContactByPhone(phone)
  if (!contact) {
    throw new Error('איש קשר לא נמצא')
  }

  // בדיקת פעילות פעילה
  const stats = await getContactStats(phone)
  
  if (stats.active_loans > 0) {
    throw new Error('לא ניתן למחוק איש קשר עם הלוואות פעילות')
  }

  if (stats.active_guarantees > 0) {
    throw new Error('לא ניתן למחוק איש קשר עם ערבויות פעילות')
  }

  if (stats.active_deposits > 0) {
    throw new Error('לא ניתן למחוק איש קשר עם הפקדות פעילות')
  }

  // מחיקה מטבלת contacts
  await dbContactsService.delete(phone)

  // הערה: לא מוחקים מהטבלאות המקוריות כדי לשמור על היסטוריה
}

/**
 * המרת הפקדה לתרומה
 */
export async function convertDepositToDonation(depositId: number, contactPhone: string): Promise<void> {
  const contact = await getContactByPhone(contactPhone)
  if (!contact || !contact.depositor_id) {
    throw new Error('מפקיד לא נמצא')
  }

  // קבלת פרטי ההפקדה
  const deposits = await db.query('SELECT * FROM deposits WHERE id = ?', [depositId]) as any[]
  const deposit = deposits[0]
  
  if (!deposit || deposit.status !== 'active') {
    throw new Error('הפקדה לא נמצאה או לא פעילה')
  }

  // יצירת תרומה
  const donationDate = new Date().toISOString().split('T')[0]
  
  // אם אין donor_id, צריך ליצור רשומת תורם
  let donorId = contact.donor_id
  if (!donorId) {
    const donorResult = await db.run(
      'INSERT INTO donors (first_name, last_name, phone, id_number, address, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [contact.first_name, contact.last_name, contact.phone, contact.id_number, contact.address, contact.email, contact.notes]
    )
    donorId = donorResult.lastInsertRowid
    
    // עדכון contact עם donor_id
    await dbContactsService.update(contactPhone, { donor_id: donorId } as any)
  }

  // יצירת תרומה
  await db.run(
    'INSERT INTO donations (donor_id, amount, donation_date, notes, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?)',
    [
      donorId,
      deposit.amount,
      donationDate,
      `המרה מהפקדה #${depositId}\n${deposit.notes || ''}`,
      deposit.payment_method || '',
      deposit.payment_details || ''
    ]
  )

  // סימון ההפקדה כנמשכה
  await db.run(
    'UPDATE deposits SET status = ?, withdrawal_date = ?, withdrawn_amount = ?, withdrawal_payment_method = ?, withdrawal_payment_details = ? WHERE id = ?',
    ['withdrawn', donationDate, deposit.amount, 'converted_to_donation', 'הומר לתרומה', depositId]
  )
}

/**
 * הוספת תגית לאיש קשר
 */
export async function addTag(phone: string, tag: string): Promise<void> {
  await dbContactsService.addTag(phone, tag)
}

/**
 * הסרת תגית מאיש קשר
 */
export async function removeTag(phone: string, tag: string): Promise<void> {
  await dbContactsService.removeTag(phone, tag)
}

/**
 * ייצוא אנשי קשר ל-CSV
 */
export async function exportContactsToCSV(filters?: ContactSearchFilters): Promise<string> {
  let contacts = await getAllContacts()

  // סינון לפי פילטרים
  if (filters) {
    if (filters.searchTerm) {
      contacts = await searchContacts(filters.searchTerm)
    }
    if (filters.roles && filters.roles.length > 0) {
      contacts = contacts.filter(c => c.roles.some(r => filters.roles!.includes(r.type)))
    }
    if (filters.tags && filters.tags.length > 0) {
      contacts = contacts.filter(c => c.tags.some(t => filters.tags!.includes(t)))
    }
    if (filters.city) {
      contacts = contacts.filter(c => c.city === filters.city)
    }
  }

  // יצירת CSV
  const headers = [
    'שם פרטי',
    'שם משפחה',
    'טלפון',
    'מספר זהות',
    'עיר',
    'כתובת',
    'אימייל',
    'תפקידים',
    'סך הלוואות',
    'חוב פעיל',
    'סך ערבויות',
    'סך תרומות',
    'סך הפקדות פעילות',
    'מאזן נטו',
    'הערות'
  ]

  const rows = contacts.map(c => [
    c.first_name,
    c.last_name,
    c.phone,
    c.id_number || '',
    c.city || '',
    c.address || '',
    c.email || '',
    c.roles.map(r => {
      switch (r.type) {
        case 'borrower': return 'לווה'
        case 'guarantor': return 'ערב'
        case 'donor': return 'תורם'
        case 'depositor': return 'מפקיד'
      }
    }).join(', '),
    c.stats.total_borrowed.toString(),
    c.stats.total_debt.toString(),
    c.stats.total_guaranteed.toString(),
    c.stats.total_donated.toString(),
    c.stats.active_deposit_amount.toString(),
    c.stats.net_balance.toString(),
    (c.notes || '').replace(/\n/g, ' ')
  ])

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n')

  return csvContent
}
