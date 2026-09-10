import { useState, useEffect } from 'react';
import { Drawer, Box, IconButton, Divider, Typography, Button, Tabs, Tab } from '@mui/material';
import { Close as CloseIcon, Receipt as ReceiptIcon, Attachment as AttachmentIcon, Person as PersonIcon, AttachMoney as FeeIcon } from '@mui/icons-material';
import type { Borrower } from '../../services/database';
import BorrowerForm from './BorrowerForm';
import AttachmentsSection from '../attachments/AttachmentsSection';
import FeePaymentForm from './FeePaymentForm';
import FeePaymentsTable from './FeePaymentsTable';
import { getFeePaymentsByBorrower, getTotalFeesByBorrower, updateReceiptDetails, generateReceiptNumber } from '../../services/feePaymentsService';
import type { FeePaymentWithDetails } from '../../types/feePayments';
import { generateFeeReceipt } from '../../services/documents';
import { useSettings } from '../../hooks/useSettings';
import { getDocumentLayout } from '../../utils/documentLayoutHelper';

interface BorrowerSidePanelProps {
  open: boolean;
  borrower: Borrower | null; // null = creating a new borrower
  onClose: () => void;
  onSaved: (borrowerId: string) => void;
}

/**
 * Side drawer for creating/editing a borrower
 * Shows tabs for: borrower form, fees history, and attachments
 */
export default function BorrowerSidePanel({ open, borrower, onClose, onSaved }: BorrowerSidePanelProps) {
  const { settings } = useSettings();
  const feeReceiptLayout = getDocumentLayout(settings.document_layouts, 'feeReceipt');
  const [currentTab, setCurrentTab] = useState(0);
  const [fees, setFees] = useState<FeePaymentWithDetails[]>([]);
  const [totalFees, setTotalFees] = useState(0);
  const [feeFormOpen, setFeeFormOpen] = useState(false);
  const [editingFee, setEditingFee] = useState<FeePaymentWithDetails | null>(null);

  // טעינת עמלות כשנפתח עם לווה קיים
  useEffect(() => {
    if (borrower?.id && open) {
      loadFees();
    }
  }, [borrower?.id, open]);

  const loadFees = async () => {
    if (!borrower?.id) return;
    
    try {
      const [feesData, totalFeesData] = await Promise.all([
        getFeePaymentsByBorrower(borrower.id),
        getTotalFeesByBorrower(borrower.id)
      ]);
      setFees(feesData);
      setTotalFees(totalFeesData);
    } catch (error) {
      console.error('Error loading fees:', error);
    }
  };

  const handleSaved = (borrowerId: string) => {
    onSaved(borrowerId);
    if (!borrowerId) {
      // Borrower was deleted
      onClose();
    }
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
          width: { xs: '100%', sm: 600, md: 700 },
          p: 3,
        }
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">
          {borrower ? `${borrower.first_name} ${borrower.last_name}` : 'לווה חדש'}
        </Typography>
        <IconButton onClick={onClose} aria-label="סגור">
          <CloseIcon />
        </IconButton>
      </Box>

      {/* טאבים - רק אם יש לווה קיים */}
      {borrower?.id ? (
        <>
          <Tabs value={currentTab} onChange={handleTabChange} sx={{ mb: 2 }}>
            <Tab label="פרטי לווה" icon={<PersonIcon />} iconPosition="start" />
            <Tab 
              label={`עמלות (${fees.length})`} 
              icon={<FeeIcon />} 
              iconPosition="start" 
            />
            <Tab label="קבצים מצורפים" icon={<AttachmentIcon />} iconPosition="start" />
          </Tabs>

          {/* תוכן טאב פרטי לווה */}
          {currentTab === 0 && (
            <BorrowerForm borrower={borrower} onSaved={handleSaved} />
          )}

          {/* תוכן טאב עמלות */}
          {currentTab === 1 && (
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="subtitle1" fontWeight="bold">
                  היסטוריית עמלות
                </Typography>
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ display: 'inline', mr: 2 }}>
                    סה"כ ששולם: <strong>₪{totalFees.toLocaleString()}</strong>
                  </Typography>
                  <Button 
                    variant="contained" 
                    size="small" 
                    startIcon={<ReceiptIcon />}
                    onClick={handleAddFee}
                  >
                    רישום עמלה
                  </Button>
                </Box>
              </Box>
              
              <FeePaymentsTable
                fees={fees}
                onEdit={handleEditFee}
                onDelete={handleFeeDeleted}
                onGenerateReceipt={handleGenerateReceipt}
                showBorrowerName={false}
                showLoanNumber={true}
              />
            </Box>
          )}

          {/* תוכן טאב קבצים */}
          {currentTab === 2 && (
            <AttachmentsSection entityType="borrower" entityId={borrower.id} />
          )}
        </>
      ) : (
        /* לווה חדש - רק הטופס */
        <BorrowerForm borrower={borrower} onSaved={handleSaved} />
      )}

      {/* דיאלוג הוספה/עריכת עמלה */}
      {borrower?.id && (
        <FeePaymentForm
          feePayment={editingFee}
          borrowerId={borrower.id}
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
