import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Grid,
  Paper,
  Autocomplete,
  TextField,
  Button,
  Typography,
  Chip,
  Stack,
  IconButton,
  Tooltip,
  Snackbar,
  Alert,
  Collapse,
  Divider,
  Drawer,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Phone as PhoneIcon,
  LocationOn as LocationIcon,
  Email as EmailIcon,
  Description as DocIcon,
  Receipt as ReceiptIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  CardGiftcard as DonationIcon,
  Delete as DeleteIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { db } from '../services/database';
import { 
  generateDonorReport, 
  generateDonationReceipt,
  openEmailWithDocument, 
  createDonorReportEmailData, 
  createDonationEmailData,
  EmailProvider 
} from '../services/documents';
import { useSettings } from '../hooks/useSettings';
import { formatDisplayDate, toHebrewDate } from '../utils/dateUtils';
import AmountInput from '../components/AmountInput';
import PaymentMethodSelect, { PaymentMethodData } from '../components/PaymentMethodSelect';
import AttachmentsSection from '../components/attachments/AttachmentsSection';

interface Donor {
  id: number;
  first_name: string;
  last_name: string;
  phone: string;
  id_number: string;
  address: string;
  email: string;
  notes: string;
  created_at: string;
  total_donations?: number;
  donation_count?: number;
}

interface Donation {
  id: number;
  donor_id: number;
  amount: number;
  donation_date: string;
  notes: string;
  payment_method?: string;
  payment_details?: string;
  receipt_number?: string;
}

/**
 * Unified Donations Page — donor profile (right, in RTL) + donations as cards (left).
 * Based on Deposits unified design pattern.
 */
export default function Donations() {
  const { settings } = useSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const [donors, setDonors] = useState<Donor[]>([]);
  const [selectedDonor, setSelectedDonor] = useState<Donor | null>(null);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [loadingDonations, setLoadingDonations] = useState(false);

  // Side panel state for donation
  const [donationDialogOpen, setDonationDialogOpen] = useState(false);
  const [activeDonation, setActiveDonation] = useState<Donation | null>(null);
  const [isSavingDonation, setIsSavingDonation] = useState(false);
  
  // Donor edit dialog
  const [donorDialogOpen, setDonorDialogOpen] = useState(false);
  // true => dialog is creating a brand-new donor, regardless of which donor
  // (if any) is currently selected. Lets you add a new donor while another
  // donor's page is open, without clearing the search field first.
  const [creatingNewDonor, setCreatingNewDonor] = useState(false);
  // The donor being edited by the dialog — null while creating a new one.
  const donorBeingEdited = creatingNewDonor ? null : selectedDonor;

  // Snackbar
  const [snackbar, setSnackbar] = useState({ 
    open: false, 
    message: '', 
    severity: 'success' as 'success' | 'error' 
  });

  // Filters
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    amountFrom: '',
    amountTo: '',
  });

  // Form state for donation dialog
  const [donationForm, setDonationForm] = useState({
    amount: 0,
    donation_date: new Date().toISOString().split('T')[0],
    notes: '',
  });
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodData>({ payment_method: '' });

  // Form state for donor dialog
  const [donorForm, setDonorForm] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    id_number: '',
    address: '',
    email: '',
    notes: '',
  });

  useEffect(() => {
    loadDonors();
  }, []);

  // Handle URL params for donor/donation selection
  useEffect(() => {
    const donorId = searchParams.get('donor');
    const donationId = searchParams.get('donation');
    
    if (donorId && donors.length > 0) {
      const donor = donors.find(d => d.id.toString() === donorId);
      if (donor) {
        setSelectedDonor(donor);
        
        if (donationId) {
          setTimeout(() => {
            loadDonationsForDonor(donor.id).then(() => {
              const donation = donations.find(d => d.id.toString() === donationId);
              if (donation) {
                handleOpenDonation(donation);
              }
            });
          }, 100);
        }
      }
      setSearchParams({});
    }
  }, [searchParams, donors]);

  useEffect(() => {
    if (selectedDonor) {
      loadDonationsForDonor(selectedDonor.id);
    } else {
      setDonations([]);
    }
  }, [selectedDonor]);

  const loadDonors = async (selectDonorId?: string) => {
    try {
      const dnrs = await db.query('SELECT * FROM donors') as Donor[];
      const donations = await db.query('SELECT * FROM donations') as Donation[];
      
      const donorsWithStats = dnrs.map(dnr => {
        const donorDonations = donations.filter(d => d.donor_id === dnr.id);
        return {
          ...dnr,
          total_donations: donorDonations.reduce((sum, d) => sum + (d.amount || 0), 0),
          donation_count: donorDonations.length,
        };
      });
      
      setDonors(donorsWithStats.sort((a, b) => 
        `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`)
      ));
      
      if (selectDonorId === '') {
        setSelectedDonor(null);
        return;
      }

      if (selectDonorId) {
        const newDonor = donorsWithStats.find(d => d.id === parseInt(selectDonorId));
        if (newDonor) {
          setSelectedDonor(newDonor);
        }
      } else if (selectedDonor) {
        const updatedDonor = donorsWithStats.find(d => d.id === selectedDonor.id);
        if (updatedDonor) {
          setSelectedDonor(updatedDonor);
        }
      }
    } catch (error) {
      console.error('Error loading donors:', error);
    }
  };

  const loadDonationsForDonor = async (donorId: number) => {
    setLoadingDonations(true);
    try {
      const data = await db.query(
        'SELECT * FROM donations WHERE donor_id = ?', 
        [donorId]
      ) as Donation[];
      
      const sorted = [...data].sort(
        (a, b) => new Date(b.donation_date).getTime() - new Date(a.donation_date).getTime()
      );
      
      setDonations(sorted);
    } catch (error) {
      console.error('Error loading donations:', error);
    } finally {
      setLoadingDonations(false);
    }
  };

  const stats = useMemo(() => {
    const total = donations.reduce((sum, d) => sum + d.amount, 0);
    const count = donations.length;
    return { total, count };
  }, [donations]);

  const filteredDonations = useMemo(() => {
    return donations.filter(donation => {
      if (filters.dateFrom && donation.donation_date < filters.dateFrom) return false;
      if (filters.dateTo && donation.donation_date > filters.dateTo) return false;
      if (filters.amountFrom && donation.amount < parseFloat(filters.amountFrom)) return false;
      if (filters.amountTo && donation.amount > parseFloat(filters.amountTo)) return false;
      return true;
    });
  }, [donations, filters]);

  const hasActiveFilters = filters.dateFrom || filters.dateTo || filters.amountFrom || filters.amountTo;

  const clearFilters = () => {
    setFilters({
      dateFrom: '',
      dateTo: '',
      amountFrom: '',
      amountTo: '',
    });
  };

  const handleOpenNewDonation = () => {
    setActiveDonation(null);
    setDonationForm({
      amount: 0,
      donation_date: new Date().toISOString().split('T')[0],
      notes: '',
    });
    setPaymentMethod({ payment_method: '' });
    setDonationDialogOpen(true);
  };

  const handleOpenDonation = (donation: Donation) => {
    setActiveDonation(donation);
    setDonationForm({
      amount: donation.amount,
      donation_date: donation.donation_date,
      notes: donation.notes || '',
    });
    
    if (donation.payment_details) {
      try {
        setPaymentMethod(JSON.parse(donation.payment_details));
      } catch {
        setPaymentMethod({ payment_method: (donation.payment_method || '') as import('../components/PaymentMethodSelect').PaymentMethodType });
      }
    }
    
    setDonationDialogOpen(true);
  };

  const handleSaveDonation = async () => {
    if (!selectedDonor) return;
    
    if (donationForm.amount <= 0) {
      setSnackbar({ open: true, message: 'נא להזין סכום תקין', severity: 'error' });
      return;
    }
    
    // מניעת הגשה כפולה
    if (isSavingDonation) return;
    setIsSavingDonation(true);
    
    try {
      if (activeDonation?.id) {
        await db.run(
          `UPDATE donations SET 
            amount = ?, 
            donation_date = ?, 
            notes = ?,
            payment_method = ?,
            payment_details = ?
          WHERE id = ?`,
          [
            donationForm.amount,
            donationForm.donation_date,
            donationForm.notes,
            paymentMethod.payment_method,
            JSON.stringify(paymentMethod),
            activeDonation.id
          ]
        );
        setSnackbar({ open: true, message: 'התרומה עודכנה בהצלחה', severity: 'success' });
      } else {
        await db.run(
          `INSERT INTO donations (donor_id, amount, donation_date, notes, payment_method, payment_details) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            selectedDonor.id,
            donationForm.amount,
            donationForm.donation_date,
            donationForm.notes,
            paymentMethod.payment_method,
            JSON.stringify(paymentMethod)
          ]
        );
        setSnackbar({ open: true, message: 'התרומה נוספה בהצלחה', severity: 'success' });
      }
      
      setDonationDialogOpen(false);
      loadDonationsForDonor(selectedDonor.id);
      loadDonors();
    } catch (error) {
      console.error('Error saving donation:', error);
      setSnackbar({ open: true, message: 'שגיאה בשמירת התרומה', severity: 'error' });
    } finally {
      setIsSavingDonation(false);
    }
  };

  const handleDeleteDonation = async (donation: Donation) => {
    if (!confirm('האם למחוק את התרומה?')) return;

    try {
      await db.run('DELETE FROM donations WHERE id = ?', [donation.id]);
      setSnackbar({ open: true, message: 'התרומה נמחקה', severity: 'success' });
      if (selectedDonor) loadDonationsForDonor(selectedDonor.id);
      loadDonors();
    } catch (error) {
      console.error('Error deleting donation:', error);
      setSnackbar({ open: true, message: 'שגיאה במחיקה', severity: 'error' });
    }
  };

  const handleOpenDonorDialog = (forceNew: boolean = false) => {
    setCreatingNewDonor(forceNew);
    const donorToEdit = forceNew ? null : selectedDonor;
    if (donorToEdit) {
      setDonorForm({
        first_name: donorToEdit.first_name,
        last_name: donorToEdit.last_name,
        phone: donorToEdit.phone,
        id_number: donorToEdit.id_number,
        address: donorToEdit.address,
        email: donorToEdit.email,
        notes: donorToEdit.notes,
      });
    } else {
      setDonorForm({
        first_name: '',
        last_name: '',
        phone: '',
        id_number: '',
        address: '',
        email: '',
        notes: '',
      });
    }
    setDonorDialogOpen(true);
  };

  const handleSaveDonor = async () => {
    if (!donorForm.first_name || !donorForm.last_name || !donorForm.phone) {
      setSnackbar({ open: true, message: 'נא למלא שדות חובה (שם פרטי, שם משפחה, טלפון)', severity: 'error' });
      return;
    }

    try {
      let savedDonorId: string;
      if (donorBeingEdited?.id) {
        await db.run(
          'UPDATE donors SET first_name = ?, last_name = ?, phone = ?, id_number = ?, address = ?, email = ?, notes = ? WHERE id = ?',
          [donorForm.first_name, donorForm.last_name, donorForm.phone, donorForm.id_number, donorForm.address, donorForm.email, donorForm.notes, donorBeingEdited.id]
        );
        savedDonorId = donorBeingEdited.id.toString();
        setSnackbar({ open: true, message: 'התורם עודכן בהצלחה', severity: 'success' });
      } else {
        const result = await db.run(
          'INSERT INTO donors (first_name, last_name, phone, id_number, address, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [donorForm.first_name, donorForm.last_name, donorForm.phone, donorForm.id_number, donorForm.address, donorForm.email, donorForm.notes]
        );
        savedDonorId = result.lastInsertRowid.toString();
        setSnackbar({ open: true, message: 'התורם נוסף בהצלחה', severity: 'success' });
      }
      
      setDonorDialogOpen(false);
      setCreatingNewDonor(false);
      loadDonors(savedDonorId);
    } catch (error) {
      console.error('Error saving donor:', error);
      setSnackbar({ open: true, message: 'שגיאה בשמירה', severity: 'error' });
    }
  };

  const handleGenerateReceipt = async (donation: Donation) => {
    if (!selectedDonor) return;
    
    await generateDonationReceipt({
      gemachName: settings.gemach_name || 'גמ"ח',
      gemachLogo: settings.gemach_logo,
      gemachDocumentFrame: settings.gemach_document_frame,
      frameMarginTop: settings.gemach_frame_margin_top,
      frameMarginBottom: settings.gemach_frame_margin_bottom,
      frameMarginRight: settings.gemach_frame_margin_right,
      frameMarginLeft: settings.gemach_frame_margin_left,
      donorName: `${selectedDonor.first_name} ${selectedDonor.last_name}`,
      amount: donation.amount,
      donationDate: donation.donation_date,
      receiptNumber: donation.receipt_number || donation.id.toString(),
      dateFormat: settings.date_format,
    });
  };

  const handleSendReceiptEmail = async (donation: Donation) => {
    if (!selectedDonor?.email) {
      setSnackbar({ open: true, message: 'לתורם זה לא הוזנה כתובת מייל', severity: 'error' });
      return;
    }
    
    try {
      const emailData = createDonationEmailData({
        gemachName: settings.gemach_name || 'גמ"ח',
        donorName: `${selectedDonor.first_name} ${selectedDonor.last_name}`,
        donorEmail: selectedDonor.email,
        amount: donation.amount,
        donationDate: donation.donation_date,
        receiptNumber: donation.receipt_number || donation.id.toString(),
        gemachLogo: settings.gemach_logo,
        dateFormat: settings.date_format,
      });
      
      const provider = (settings.email_provider || 'gmail') as EmailProvider;
      const result = await openEmailWithDocument(emailData, provider);
      setSnackbar({ 
        open: true, 
        message: result.message, 
        severity: result.success ? 'success' : 'error' 
      });
    } catch (error) {
      console.error('Error sending email:', error);
      setSnackbar({ open: true, message: 'שגיאה בשליחת המייל', severity: 'error' });
    }
  };

  const handleGenerateDonorReport = async () => {
    if (!selectedDonor) return;
    
    try {
      const donations = await db.query(
        'SELECT * FROM donations WHERE donor_id = ?', 
        [selectedDonor.id]
      ) as Donation[];
      
      generateDonorReport({
        gemachName: settings.gemach_name || 'גמ"ח',
        gemachLogo: settings.gemach_logo,
        donorName: `${selectedDonor.first_name} ${selectedDonor.last_name}`,
        donorPhone: selectedDonor.phone,
        donorIdNumber: selectedDonor.id_number,
        donations: donations.sort((a, b) => 
          new Date(b.donation_date).getTime() - new Date(a.donation_date).getTime()
        ),
        totalDonations: donations.reduce((sum, d) => sum + d.amount, 0),
        dateFormat: settings.date_format,
      });
      
      setSnackbar({ open: true, message: 'הדוח הופק בהצלחה', severity: 'success' });
    } catch (error) {
      console.error('Error generating report:', error);
      setSnackbar({ open: true, message: 'שגיאה בהפקת הדוח', severity: 'error' });
    }
  };

  const formatCurrency = (amount: number) => {
    const currency = settings.currency || 'ILS';
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const handleOpenEmail = (email: string) => {
    const provider = (settings.email_provider || 'gmail') as 'gmail' | 'outlook' | 'default';
    
    let mailtoUrl = `mailto:${email}`;
    
    // Open based on provider preference
    if (provider === 'gmail') {
      window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${email}`, '_blank');
    } else if (provider === 'outlook') {
      window.open(`https://outlook.office.com/mail/deeplink/compose?to=${email}`, '_blank');
    } else {
      // Default - use system default mail client
      window.location.href = mailtoUrl;
    }
  };

  return (
    <Box>
      {/* Top bar — donor search + add donor */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={8}>
            <Autocomplete
              options={donors}
              value={selectedDonor}
              getOptionLabel={(d) => `${d.first_name} ${d.last_name}`}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              onChange={(_, value) => setSelectedDonor(value)}
              openOnFocus
              renderOption={(props, d) => (
                <li {...props} key={d.id}>
                  <Box>
                    <Box sx={{ fontWeight: 500 }}>
                      {d.first_name} {d.last_name}
                    </Box>
                    <Box sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                      {d.phone}
                      {d.address && ` • ${d.address}`}
                    </Box>
                  </Box>
                </li>
              )}
              renderInput={(params) => (
                <TextField {...params} placeholder="חיפוש תורם לפי שם, טלפון, ת.ז... (או לחצו לרשימה המלאה)" fullWidth />
              )}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <Stack direction="row" spacing={1}>
              <Button
                fullWidth
                variant={selectedDonor ? 'outlined' : 'contained'}
                startIcon={<AddIcon />}
                onClick={() => handleOpenDonorDialog(true)}
              >
                תורם חדש
              </Button>
              {selectedDonor && (
                <Button
                  fullWidth
                  variant="contained"
                  startIcon={<EditIcon />}
                  onClick={() => handleOpenDonorDialog(false)}
                >
                  ערוך פרטי התורם
                </Button>
              )}
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      {/* Split view: profile (right) + donations-as-cards (left) */}
      {selectedDonor ? (
        <Grid container spacing={2}>
          {/* Donations — Cards, 70% */}
          <Grid item xs={12} md={8} order={{ xs: 2, md: 1 }}>
            <Paper sx={{ p: 2, position: 'relative' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">תרומות התורם</Typography>
                <Stack direction="row" spacing={1}>
                  <Button
                    variant={hasActiveFilters ? 'contained' : 'outlined'}
                    color={hasActiveFilters ? 'secondary' : 'inherit'}
                    startIcon={filtersOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    onClick={() => setFiltersOpen(!filtersOpen)}
                    size="small"
                  >
                    סינון {hasActiveFilters && `(${filteredDonations.length}/${donations.length})`}
                  </Button>
                  <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenNewDonation}>
                    תרומה חדשה
                  </Button>
                </Stack>
              </Box>

              {/* Filters Panel */}
              <Collapse in={filtersOpen}>
                <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'grey.50' }}>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6} md={3}>
                      <TextField
                        fullWidth
                        label="מתאריך"
                        type="date"
                        value={filters.dateFrom}
                        onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                        InputLabelProps={{ shrink: true }}
                        size="small"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <TextField
                        fullWidth
                        label="עד תאריך"
                        type="date"
                        value={filters.dateTo}
                        onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                        InputLabelProps={{ shrink: true }}
                        size="small"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <TextField
                        fullWidth
                        label="סכום מינימום"
                        type="number"
                        value={filters.amountFrom}
                        onChange={(e) => setFilters({ ...filters, amountFrom: e.target.value })}
                        size="small"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <TextField
                        fullWidth
                        label="סכום מקסימום"
                        type="number"
                        value={filters.amountTo}
                        onChange={(e) => setFilters({ ...filters, amountTo: e.target.value })}
                        size="small"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <Button
                        fullWidth
                        variant="outlined"
                        onClick={clearFilters}
                        disabled={!hasActiveFilters}
                      >
                        נקה סינון
                      </Button>
                    </Grid>
                  </Grid>
                </Paper>
              </Collapse>

              {loadingDonations ? (
                <Typography color="text.secondary">טוען תרומות…</Typography>
              ) : filteredDonations.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography color="text.secondary">
                    {hasActiveFilters ? 'לא נמצאו תרומות התואמות לסינון' : 'אין תרומות לתורם זה עדיין.'}
                  </Typography>
                  {hasActiveFilters && (
                    <Button variant="text" onClick={clearFilters} sx={{ mt: 1 }}>
                      נקה סינון
                    </Button>
                  )}
                </Box>
              ) : (
                <Grid container spacing={2}>
                  {filteredDonations.map((donation) => (
                    <Grid item xs={12} sm={6} key={donation.id}>
                      <Box 
                        sx={{ 
                          position: 'relative',
                          '&:hover .action-buttons': {
                            opacity: 1,
                          }
                        }}
                      >
                        {/* Donation Card */}
                        <Paper
                          elevation={3}
                          onClick={() => handleOpenDonation(donation)}
                          sx={{
                            p: 2,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            borderLeft: '4px solid #4caf50',
                            '&:hover': {
                              transform: 'translateY(-2px)',
                              boxShadow: 4,
                            },
                          }}
                        >
                          <Stack spacing={1.5}>
                            {/* Header: Amount */}
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <Typography variant="h5" fontWeight="bold" color="primary">
                                {formatCurrency(donation.amount)}
                              </Typography>
                              <Chip
                                label="תרומה"
                                color="success"
                                size="small"
                                icon={<DonationIcon />}
                              />
                            </Box>

                            <Divider />

                            {/* Details */}
                            <Stack spacing={0.5}>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="body2" color="text.secondary">
                                  תאריך תרומה:
                                </Typography>
                                <Typography variant="body2" fontWeight={500}>
                                  {formatDisplayDate(donation.donation_date, settings.date_format)}
                                </Typography>
                              </Box>
                            </Stack>

                            {donation.notes && (
                              <>
                                <Divider />
                                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                  {donation.notes}
                                </Typography>
                              </>
                            )}
                          </Stack>
                        </Paper>

                        {/* Action buttons overlay - shown on hover */}
                        <Stack
                          className="action-buttons"
                          direction="row"
                          spacing={0.5}
                          sx={{
                            position: 'absolute',
                            top: 8,
                            right: 8,
                            zIndex: 10,
                            opacity: 0,
                            transition: 'opacity 0.2s',
                            bgcolor: 'rgba(255, 255, 255, 0.95)',
                            borderRadius: 1,
                            padding: 0.5,
                            boxShadow: 2,
                          }}
                        >
                          <Tooltip title="הפק קבלה">
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleGenerateReceipt(donation);
                              }}
                              sx={{ '&:hover': { bgcolor: 'grey.200' } }}
                            >
                              <ReceiptIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>

                          {selectedDonor.email && (
                            <Tooltip title="שלח קבלה במייל">
                              <IconButton
                                size="small"
                                color="secondary"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSendReceiptEmail(donation);
                                }}
                                sx={{ '&:hover': { bgcolor: 'grey.200' } }}
                              >
                                <EmailIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}

                          <Tooltip title="עריכה">
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenDonation(donation);
                              }}
                              sx={{ '&:hover': { bgcolor: 'grey.200' } }}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>

                          <Tooltip title="מחיקה">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteDonation(donation);
                              }}
                              sx={{ '&:hover': { bgcolor: 'grey.200' } }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </Box>
                    </Grid>
                  ))}
                </Grid>
              )}
            </Paper>
          </Grid>

          {/* Donor Profile — 30% */}
          <Grid item xs={12} md={4} order={{ xs: 1, md: 2 }}>
            <Paper sx={{ p: 2, position: 'sticky', top: 16 }}>
              <Typography variant="h6" gutterBottom>
                פרטי התורם
              </Typography>
              <Divider sx={{ mb: 2 }} />

              <Stack spacing={2}>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    שם מלא
                  </Typography>
                  <Typography variant="body1" fontWeight="bold">
                    {selectedDonor.first_name} {selectedDonor.last_name}
                  </Typography>
                </Box>

                {selectedDonor.phone && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <PhoneIcon fontSize="small" color="action" />
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary">
                        טלפון
                      </Typography>
                      <Typography variant="body2">{selectedDonor.phone}</Typography>
                    </Box>
                  </Box>
                )}

                {selectedDonor.email && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <EmailIcon fontSize="small" color="action" />
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="subtitle2" color="text.secondary">
                        אימייל
                      </Typography>
                      <Typography 
                        variant="body2"
                        component="a"
                        onClick={(e) => {
                          e.preventDefault();
                          handleOpenEmail(selectedDonor.email);
                        }}
                        sx={{ 
                          color: 'primary.main',
                          textDecoration: 'underline',
                          cursor: 'pointer',
                          '&:hover': {
                            color: 'primary.dark',
                          }
                        }}
                      >
                        {selectedDonor.email}
                      </Typography>
                    </Box>
                  </Box>
                )}

                {selectedDonor.address && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <LocationIcon fontSize="small" color="action" />
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary">
                        כתובת
                      </Typography>
                      <Typography variant="body2">{selectedDonor.address}</Typography>
                    </Box>
                  </Box>
                )}

                {selectedDonor.id_number && (
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      מספר זהות
                    </Typography>
                    <Typography variant="body2">{selectedDonor.id_number}</Typography>
                  </Box>
                )}

                {selectedDonor.notes && (
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      הערות
                    </Typography>
                    <Typography variant="body2">{selectedDonor.notes}</Typography>
                  </Box>
                )}

                <Divider />

                {/* Statistics */}
                <Box sx={{ bgcolor: 'success.50', p: 2, borderRadius: 1 }}>
                  <Typography variant="subtitle2" color="success.dark" gutterBottom>
                    סטטיסטיקות
                  </Typography>
                  <Stack spacing={1}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2">סה"כ תרומות:</Typography>
                      <Typography variant="body2" fontWeight="bold">
                        {formatCurrency(stats.total)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2">מספר תרומות:</Typography>
                      <Typography variant="body2" fontWeight="bold">
                        {stats.count}
                      </Typography>
                    </Box>
                  </Stack>
                </Box>

                {/* Actions */}
                <Stack spacing={1}>
                  <Button
                    variant="outlined"
                    startIcon={<DocIcon />}
                    onClick={handleGenerateDonorReport}
                    fullWidth
                  >
                    הפק דוח תורם
                  </Button>
                </Stack>
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      ) : (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            בחר תורם כדי להציג ולנהל תרומות
          </Typography>
          <Typography variant="body2" color="text.secondary">
            חפש תורם בסרגל החיפוש למעלה או הוסף תורם חדש
          </Typography>
        </Paper>
      )}

      {/* Donation Drawer */}
      <Drawer
        anchor="left"
        open={donationDialogOpen}
        onClose={() => setDonationDialogOpen(false)}
        PaperProps={{
          sx: {
            width: { xs: '100%', md: '70%', lg: '60%' },
            p: 3,
          }
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">
            {activeDonation ? 'עריכת תרומה' : 'תרומה חדשה'}
          </Typography>
          <IconButton onClick={() => setDonationDialogOpen(false)} aria-label="סגור">
            <CloseIcon />
          </IconButton>
        </Box>
        <Divider sx={{ mb: 3 }} />

        {selectedDonor && (
          <Box sx={{ mb: 3, p: 2, bgcolor: 'success.50', borderRadius: 1 }}>
            <Typography variant="subtitle2" color="success.dark">
              תורם: {selectedDonor.first_name} {selectedDonor.last_name}
            </Typography>
          </Box>
        )}

        <Stack spacing={3}>
          <AmountInput
            label="סכום התרומה *"
            value={donationForm.amount}
            onChange={(value) => setDonationForm({ ...donationForm, amount: value })}
          />

          <TextField
            label="תאריך התרומה *"
            type="date"
            value={donationForm.donation_date}
            onChange={(e) => setDonationForm({ ...donationForm, donation_date: e.target.value })}
            fullWidth
            InputLabelProps={{ shrink: true }}
            helperText={
              settings.date_format === 'combined' && donationForm.donation_date
                ? `📅 ${toHebrewDate(donationForm.donation_date)}`
                : ''
            }
          />

          {settings.show_payment_method === 'yes' && (
            <PaymentMethodSelect
              value={paymentMethod}
              onChange={setPaymentMethod}
              label="אמצעי תשלום"
            />
          )}

          <TextField
            label="הערות"
            value={donationForm.notes}
            onChange={(e) => setDonationForm({ ...donationForm, notes: e.target.value })}
            fullWidth
            multiline
            rows={4}
          />

          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 2 }}>
            <Button onClick={() => setDonationDialogOpen(false)} disabled={isSavingDonation}>
              ביטול
            </Button>
            <Button 
              variant="contained" 
              onClick={handleSaveDonation}
              disabled={donationForm.amount <= 0 || isSavingDonation}
            >
              {isSavingDonation ? 'שומר...' : (activeDonation ? 'שמור' : 'הוסף תרומה')}
            </Button>
          </Box>

          {activeDonation?.id != null && (
            <>
              <Divider />
              <AttachmentsSection entityType="donation" entityId={String(activeDonation.id)} />
            </>
          )}
        </Stack>
      </Drawer>

      {/* Donor Drawer */}
      <Drawer
        anchor="left"
        open={donorDialogOpen}
        onClose={() => {
          setDonorDialogOpen(false);
          setCreatingNewDonor(false);
        }}
        PaperProps={{
          sx: {
            width: { xs: '100%', sm: 500 },
            p: 3,
          }
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">
            {donorBeingEdited ? 'עריכת תורם' : 'תורם חדש'}
          </Typography>
          <IconButton onClick={() => { setDonorDialogOpen(false); setCreatingNewDonor(false); }} aria-label="סגור">
            <CloseIcon />
          </IconButton>
        </Box>
        <Divider sx={{ mb: 3 }} />

        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="שם פרטי *"
              value={donorForm.first_name}
              onChange={(e) => setDonorForm({ ...donorForm, first_name: e.target.value })}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="שם משפחה *"
              value={donorForm.last_name}
              onChange={(e) => setDonorForm({ ...donorForm, last_name: e.target.value })}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="טלפון *"
              value={donorForm.phone}
              onChange={(e) => setDonorForm({ ...donorForm, phone: e.target.value })}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="מספר זהות"
              value={donorForm.id_number}
              onChange={(e) => setDonorForm({ ...donorForm, id_number: e.target.value })}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="כתובת"
              value={donorForm.address}
              onChange={(e) => setDonorForm({ ...donorForm, address: e.target.value })}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="אימייל"
              type="email"
              value={donorForm.email}
              onChange={(e) => setDonorForm({ ...donorForm, email: e.target.value })}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="הערות"
              value={donorForm.notes}
              onChange={(e) => setDonorForm({ ...donorForm, notes: e.target.value })}
              multiline
              rows={3}
            />
          </Grid>
        </Grid>

        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 3 }}>
          <Button onClick={() => { setDonorDialogOpen(false); setCreatingNewDonor(false); }}>
            ביטול
          </Button>
          <Button variant="contained" onClick={handleSaveDonor}>
            {donorBeingEdited ? 'עדכן תורם' : 'שמור תורם'}
          </Button>
        </Box>

        {donorBeingEdited?.id != null && (
          <>
            <Divider sx={{ my: 3 }} />
            <AttachmentsSection entityType="donor" entityId={String(donorBeingEdited.id)} />
          </>
        )}
      </Drawer>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
