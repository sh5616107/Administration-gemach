import { useState, useEffect } from 'react';
import { Drawer, Box, IconButton, Typography, Divider, Tabs, Tab, Button } from '@mui/material';
import { Close as CloseIcon, Receipt as ReceiptIcon, Attachment as AttachmentIcon, Payment as PaymentIcon, AttachMoney as FeeIcon } from '@mui/icons-material';
import type { Loan } from '../../services/database';
import LoansTab from './LoansTab';
import AttachmentsSection from '../attachments/AttachmentsSection';
import FeePaymentForm from './FeePaymentForm';
import FeePaymentsTable from './FeePaymentsTable';
import { getFeePaymentsByLoan, getTotalFeesByLoan, updateReceiptDetails, generateReceiptNumber } from '../../services/feePaymentsService';
import type { FeePaymentWithDetails } from '../../types/feePayments';
import { generateFeeReceipt } from '../../services/documents';
import { useSettings } from '../../hooks/useSettings';
import { getDocumentLayout } from '../../utils/documentLayoutHelper';

interface LoanSidePanelProps {
  open: boolean;
  loan: Loan | null; // null = creating a new loan
  borrowerId: string;
  waitlistEntryId?: string | null; // ID של בקשה מתור ההלוואות
  onClose: () => void;
  onSaved: () => void; // refresh list after save
}

/**
 * Side drawer for creating/editing a loan using the LoansTab component
 * Shows tabs for: loan form, fees, and attachments
 */
export default function LoanSidePanel({ open, loan, borrowerId, waitlistEntryId, onClose, onSaved }: LoanSidePanelProps) {
  const { settings } = useSettings();
  const feeReceiptLayout = getDocumentLayout(settings.document_layouts, 'feeReceipt');
  const [currentTab, setCurrentTab] = useState(0);
  const [fees, setFees] = useState<FeePaymentWithDetails[]>([]);
  const [totalFees, setTotalFees] = useState(0);
  const [feeFormOpen, setFeeFormOpen] = useState(false);
  const [editingFee, setEditingFee] = useState<FeePaymentWithDetails | null>(null);

  // טעינת עמלות כשנפתח עם הלוואה קיימת
  useEffect(() => {
    if (loan?.id && open) {
      loadFees();
    }
  }, [loan?.id, open]);

  const loadFees = async () => {
    if (!loan?.id) return;
    
    try {
      const [feesData, totalFeesData] = await Promise.all([
        getFeePaymentsByLoan(loan.id),
        getTotalFeesByLoan(loan.id)
      ]);
      setFees(feesData);
      setTotalFees(totalFeesData);
    } catch (error) {
      console.error('Error loading fees:', error);
    }
  };

  const handleSaved = () => {
    onSaved();
  };

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
  };

  const handleAddFee = () => {
    setEditingFee(null);
    setFeeFormOpen(true);
  };

  const handleEditFee = (fee: FeePaymentWithDetails) => {
    setEditingFee(fee);
    setFeeFormOpen(true);
  };

  const handleFeeSaved = () => {
    loadFees();
    setFeeFormOpen(false);
    setEditingFee(null);
  };

  const handleFeeDeleted = () => {
    loadFees();
  };

  const handleGenerateReceipt = async (fee: FeePaymentWithDetails) => {
    try {
      // יצירת מספר קבלה אם אין
      let receiptNumber = fee.receipt_number;
      if (!receiptNumber) {
        receiptNumber = await generateReceiptNumber();
        await updateReceiptDetails(fee.id, receiptNumber);
      }

      // תרגום סוג עמלה
      const feeTypeLabels: Record<string, string> = {
        processing: 'עמלת טיפול',
        guarantor_check: 'עמלת בדיקת ערבים',
        membership: 'דמי חבר',
        other: 'אחר',
      };

      await generateFeeReceipt({
        gemachName: settings.gemach_name || 'גמ"ח שלי',
        gemachLogo: settings.gemach_logo,
        gemachDocumentFrame: settings.gemach_document_frame,
        frameMarginTop: settings.gemach_frame_margin_top,
        frameMarginBottom: settings.gemach_frame_margin_bottom,
        frameMarginRight: settings.gemach_frame_margin_right,
        frameMarginLeft: settings.gemach_frame_margin_left,
        borrowerName: fee.borrower_name || '',
        feeType: fee.fee_type,
        amount: fee.amount,
        paymentDate: fee.payment_date,
        receiptNumber: receiptNumber,
        loanNumber: fee.loan_number,
        paymentMethod: fee.payment_method,
        note: fee.note || undefined,
        dateFormat: settings.date_format,
      }, feeReceiptLayout);

      loadFees(); // רענון לעדכון מספר הקבלה
    } catch (error: any) {
      console.error('Error generating receipt:', error);
      alert(error.message || 'שגיאה בהפקת הקבלה');
    }
  };

  return (
    <Drawer
      anchor="left"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: '100%', md: '70%', lg: '60%' },
          p: 3,
        }
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">
          {loan ? `עריכת הלוואה #${loan.loan_number}` : 'הלוואה חדשה'}
        </Typography>
        <IconButton onClick={onClose} aria-label="סגור">
          <CloseIcon />
        </IconButton>
      </Box>
      <Divider sx={{ mb: 2 }} />

      {/* טאבים - רק אם יש הלוואה קיימת */}
      {loan?.id ? (
        <>
          <Tabs value={currentTab} onChange={handleTabChange} sx={{ mb: 2 }}>
            <Tab label="פרטי הלוואה" icon={<PaymentIcon />} iconPosition="start" />
            <Tab 
              label={`עמלות (${fees.length})`} 
              icon={<FeeIcon />} 
              iconPosition="start" 
            />
            <Tab label="קבצים מצורפים" icon={<AttachmentIcon />} iconPosition="start" />
          </Tabs>

          {/* תוכן טאב פרטי הלוואה */}
          {currentTab === 0 && (
            <LoansTab 
              initialBorrowerId={borrowerId} 
              initialLoanId={loan.id}
              initialWaitlistId={waitlistEntryId || null}
              hideLoansTable={true}
              hideHeader={true}
              onSaved={handleSaved}
            />
          )}

          {/* תוכן טאב עמלות */}
          {currentTab === 1 && (
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="subtitle1" fontWeight="bold">
                  עמלות טיפול
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    סה"כ ששולם: <strong>₪{totalFees.toLocaleString()}</strong>
                  </Typography>
                  <Button
                    variant="contained"
                    color="primary"
                    size="small"
                    startIcon={<ReceiptIcon />}
                    onClick={handleAddFee}
                  >
                    רישום תשלום עמלה
                  </Button>
                </Box>
              </Box>
              
              <FeePaymentsTable
                fees={fees}
                onEdit={handleEditFee}
                onDelete={handleFeeDeleted}
                onGenerateReceipt={handleGenerateReceipt}
                showBorrowerName={false}
                showLoanNumber={false}
              />
            </Box>
          )}

          {/* תוכן טאב קבצים */}
          {currentTab === 2 && (
            <AttachmentsSection entityType="loan" entityId={loan.id} />
          )}
        </>
      ) : (
        /* הלוואה חדשה - רק הטופס */
        <LoansTab 
          initialBorrowerId={borrowerId} 
          initialLoanId={null}
          initialWaitlistId={waitlistEntryId || null}
          hideLoansTable={true}
          hideHeader={true}
          onSaved={handleSaved}
        />
      )}

      {/* דיאלוג הוספה/עריכת עמלה */}
      {loan?.id && (
        <FeePaymentForm
          feePayment={editingFee}
          borrowerId={borrowerId}
          loanId={loan.id}
          open={feeFormOpen}
          onClose={() => {
            setFeeFormOpen(false);
            setEditingFee(null);
          }}
          onSaved={handleFeeSaved}
        />
      )}
    </Drawer>
  );
}
