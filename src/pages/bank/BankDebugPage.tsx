/**
 * Bank Debug Page
 * 
 * כלי לאבחון בעיות בהתאמות אוטומטיות
 */

import React, { useState } from 'react';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  Button,
  Alert,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
} from '@mui/material';
import {
  BugReport as BugReportIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { bankService } from '../../services/bankService';

interface DebugResult {
  step: string;
  status: 'success' | 'error' | 'warning';
  message: string;
  data?: any;
}

const BankDebugPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<DebugResult[]>([]);
  const [currentStep, setCurrentStep] = useState(0);

  const addResult = (result: DebugResult) => {
    setResults(prev => [...prev, result]);
  };

  const runFullDiagnosis = async () => {
    setLoading(true);
    setResults([]);
    setCurrentStep(0);

    try {
      // Step 1: Check unmatched transactions
      setCurrentStep(1);
      const unmatchedTxns = await bankService.getUnmatchedTransactions();
      
      if (unmatchedTxns.length === 0) {
        addResult({
          step: 'שלב 1: עסקאות ללא התאמה',
          status: 'error',
          message: `❌ לא נמצאו עסקאות ללא התאמה`,
          data: { count: 0 }
        });
      } else {
        addResult({
          step: 'שלב 1: עסקאות ללא התאמה',
          status: 'success',
          message: `✅ נמצאו ${unmatchedTxns.length} עסקאות ללא התאמה`,
          data: { 
            count: unmatchedTxns.length,
            sample: unmatchedTxns.slice(0, 3).map(t => ({
              date: t.date,
              amount: t.amount,
              description: t.description,
              memo: t.memo
            }))
          }
        });
      }

      // Step 2: Check borrowers
      setCurrentStep(2);
      const { db, loansService } = await import('../../services/database');
      
      // Use getAllItems instead of SQL query
      const allBorrowers = await db.query('SELECT * FROM borrowers') as any[];
      console.log('🔍 [Debug] allBorrowers:', allBorrowers.length);
      console.log('🔍 [Debug] allBorrowers sample:', allBorrowers.slice(0, 3));
      
      const borrowers = allBorrowers.filter(b => !b.is_deleted);
      console.log('🔍 [Debug] borrowers (after filter):', borrowers.length);
      
      if (borrowers.length === 0) {
        addResult({
          step: 'שלב 2: לווים במערכת',
          status: 'error',
          message: `❌ לא נמצאו לווים במערכת`,
          data: { 
            count: 0,
            totalBeforeFilter: allBorrowers.length,
            sampleBorrowers: allBorrowers.slice(0, 3).map(b => ({
              id: b.id,
              name: `${b.first_name} ${b.last_name}`,
              is_deleted: b.is_deleted
            }))
          }
        });
      } else {
        addResult({
          step: 'שלב 2: לווים במערכת',
          status: 'success',
          message: `✅ נמצאו ${borrowers.length} לווים`,
          data: { 
            count: borrowers.length,
            sampleBorrowers: borrowers.map(b => ({ // הצג את כולם
              id: b.id,
              name: `${b.first_name} ${b.last_name}`,
              phone: b.phone || '(ריק)'
            }))
          }
        });
      }

      // Step 3: Check active loans
      setCurrentStep(3);
      let activeBorrowersCount = 0;
      const activeLoansData = [];
      const allLoansDebug = [];

      console.log('🔍 [Debug Step 3] Starting loan check for', borrowers.length, 'borrowers');

      for (const borrower of borrowers) {
        const loans = await loansService.getByBorrower(borrower.id);
        console.log(`🔍 [Debug] Borrower ${borrower.first_name} ${borrower.last_name}:`, {
          borrowerId: borrower.id,
          loansCount: loans.length,
          loans: loans.map(l => ({ 
            id: l.id, 
            amount: l.amount, 
            remaining: l.remaining,
            status: l.status,
            loan_date: l.loan_date
          }))
        });
        
        // Debug: רשום את כל ההלוואות של הלווה הזה
        for (const loan of loans) {
          allLoansDebug.push({
            borrower: `${borrower.first_name} ${borrower.last_name}`,
            amount: loan.amount,
            remaining: loan.remaining,
            status: loan.status,
            hasRemaining: loan.remaining !== undefined && loan.remaining !== null
          });
        }
        
        // סינון הלוואות פעילות - רק אם remaining קיים ויותר מ-0
        const activeLoans = loans.filter((l: any) => 
          l.remaining !== undefined && 
          l.remaining !== null && 
          l.remaining > 0
        );
        
        console.log(`🔍 [Debug] Active loans for ${borrower.first_name}:`, activeLoans.length);
        
        if (activeLoans.length > 0) {
          activeBorrowersCount++;
          activeLoansData.push({
            name: `${borrower.first_name} ${borrower.last_name}`,
            phone: borrower.phone || '(ריק)',
            activeLoans: activeLoans.length,
            totalLoans: loans.length,
            totalRemaining: activeLoans.reduce((sum: number, l: any) => sum + l.remaining, 0)
          });
        }
      }

      console.log('🔍 [Debug Step 3] Summary:', {
        totalBorrowers: borrowers.length,
        activeBorrowersCount,
        totalLoansFound: allLoansDebug.length,
        activeLoansData
      });

      if (activeBorrowersCount === 0) {
        const hasAnyLoans = allLoansDebug.length > 0;
        const loansWithoutRemaining = allLoansDebug.filter(l => !l.hasRemaining).length;
        
        addResult({
          step: 'שלב 3: הלוואות פעילות',
          status: 'error',
          message: hasAnyLoans 
            ? `❌ נמצאו ${allLoansDebug.length} הלוואות אבל אף אחת לא פעילה (remaining > 0)` 
            : `❌ אין הלוואות במערכת`,
          data: { 
            count: 0,
            totalLoansFound: allLoansDebug.length,
            loansWithoutRemaining,
            allLoans: allLoansDebug.slice(0, 10) // הצג עד 10 הלוואות לדוגמה
          }
        });
      } else {
        addResult({
          step: 'שלב 3: הלוואות פעילות',
          status: 'success',
          message: `✅ ${activeBorrowersCount} לווים עם הלוואות פעילות`,
          data: { 
            count: activeBorrowersCount,
            totalLoansFound: allLoansDebug.length,
            details: activeLoansData // הצג את כולם, לא רק 5
          }
        });
      }

      // Step 3.5: בדיקת תקינות נתוני הלוואות
      const loansWithoutRemaining = allLoansDebug.filter(l => !l.hasRemaining);
      if (loansWithoutRemaining.length > 0) {
        addResult({
          step: 'שלב 3.5: בדיקת תקינות',
          status: 'warning',
          message: `⚠️ נמצאו ${loansWithoutRemaining.length} הלוואות ללא שדה remaining`,
          data: {
            count: loansWithoutRemaining.length,
            examples: loansWithoutRemaining.slice(0, 5)
          }
        });
      }

      // Step 4: Check compatibility (if we have data)
      if (unmatchedTxns.length > 0 && activeBorrowersCount > 0) {
        setCurrentStep(4);
        
        // Check multiple transactions (up to 3) for better diagnosis
        const txnsToCheck = unmatchedTxns.slice(0, 3);
        let bestMatch = { score: 0, txn: null as any, borrower: null as any, loan: null as any, analysis: null as any };
        
        for (const txn of txnsToCheck) {
          for (const borrower of borrowers) {
            const loans = await loansService.getByBorrower(borrower.id);
            const activeLoans = loans.filter((l: any) => l.remaining > 0);
            
            if (activeLoans.length > 0) {
              const loan = activeLoans[0] as any;
              
              // Calculate differences - check both remaining (repayment) and original amount (disbursement)
              const amountDiffRemaining = Math.abs(Math.abs(txn.amount) - loan.remaining);
              const amountDiffOriginal = Math.abs(Math.abs(txn.amount) - loan.amount);
              const amountDiff = Math.min(amountDiffRemaining, amountDiffOriginal);
              const isCheckingOriginal = amountDiffOriginal < amountDiffRemaining;
              
              const txnDate = new Date(txn.date);
              const loanDate = new Date(loan.date || loan.loan_date);
              const daysDiff = Math.abs((txnDate.getTime() - loanDate.getTime()) / (1000 * 60 * 60 * 24));
              
              // Calculate score
              let score = 0;
              const reasons = [];
              
              // Amount (35 points)
              const amountLabel = isCheckingOriginal ? 'מתן הלוואה' : 'יתרה';
              if (amountDiff < 0.01) {
                score += 35;
                reasons.push(`סכום זהה - ${amountLabel} (35)`);
              } else if (amountDiff < 1) {
                score += 30;
                reasons.push(`סכום קרוב מאוד - ${amountLabel} (30)`);
              } else if (amountDiff < 10) {
                score += 20;
                reasons.push(`סכום קרוב - ${amountLabel} (20)`);
              } else if (amountDiff < 100) {
                score += 8;
                reasons.push(`הפרש סכום - ${amountLabel} (8)`);
              } else {
                reasons.push(`הפרש סכום גדול - ${amountLabel} (0)`);
              }
              
              // Date (25 points)
              if (daysDiff === 0) {
                score += 25;
                reasons.push('תאריך זהה (25)');
              } else if (daysDiff <= 3) {
                score += 20;
                reasons.push('תאריך קרוב (20)');
              } else if (daysDiff <= 7) {
                score += 12;
                reasons.push('תאריך בשבוע (12)');
              } else if (daysDiff <= 14) {
                score += 4;
                reasons.push('תאריך בשבועיים (4)');
              } else {
                reasons.push('תאריך רחוק (0)');
              }
              
              // Direction (5 points)
              // Check both repayment (in) and loan disbursement (out)
              const actualDirection = txn.amount > 0 ? 'in' : 'out';
              
              // For negative amounts (out), check if this is a loan disbursement
              const isLoanDisbursement = actualDirection === 'out' && 
                                        Math.abs(Math.abs(txn.amount) - loan.amount) < Math.abs(Math.abs(txn.amount) - loan.remaining);
              
              const expectedDirection = isLoanDisbursement ? 'out' : 'in';
              
              if (expectedDirection === actualDirection) {
                score += 5;
                reasons.push(isLoanDisbursement ? 'כיוון נכון - מתן הלוואה (5)' : 'כיוון נכון - פירעון (5)');
              } else {
                reasons.push(isLoanDisbursement ? 'כיוון שגוי - זו מתן הלוואה (0)' : 'כיוון שגוי - זה פירעון (0)');
              }
              
              // Keep track of best match
              if (score > bestMatch.score) {
                bestMatch = {
                  score,
                  txn,
                  borrower,
                  loan,
                  analysis: { amountDiff, daysDiff, reasons }
                };
              }
            }
          }
        }
        
        // Report the best match found
        if (bestMatch.score > 0) {
          const willMatch = bestMatch.score >= 50;
          
          addResult({
            step: 'שלב 4: תאימות (בדיקת עד 3 עסקאות)',
            status: willMatch ? 'success' : 'warning',
            message: willMatch 
              ? `✅ ציון ${bestMatch.score}/115 - התאמה תיווצר`
              : `⚠️ ציון ${bestMatch.score}/115 - לא מספיק (צריך לפחות 50)`,
            data: {
              matchType: bestMatch.txn.amount < 0 ? 'loan_disbursement' : 'repayment',
              transaction: {
                amount: bestMatch.txn.amount,
                date: bestMatch.txn.date,
                description: bestMatch.txn.description,
                memo: bestMatch.txn.memo || '(ריק)'
              },
              borrower: {
                name: `${bestMatch.borrower.first_name} ${bestMatch.borrower.last_name}`,
                phone: bestMatch.borrower.phone || '(ריק)',
                remaining: bestMatch.loan.remaining,
                loanAmount: bestMatch.loan.amount,
                loanDate: bestMatch.loan.date || bestMatch.loan.loan_date
              },
              analysis: {
                amountDiff: bestMatch.analysis.amountDiff.toFixed(2),
                daysDiff: Math.floor(bestMatch.analysis.daysDiff),
                score: bestMatch.score,
                reasons: bestMatch.analysis.reasons
              }
            }
          });
        } else {
          addResult({
            step: 'שלב 4: תאימות',
            status: 'error',
            message: '❌ לא נמצאה שום התאמה פוטנציאלית',
            data: { checkedTransactions: txnsToCheck.length, checkedBorrowers: borrowers.length }
          });
        }
      }

      // Final summary
      setCurrentStep(5);
      const hasTransactions = unmatchedTxns.length > 0;
      const hasBorrowers = activeBorrowersCount > 0;
      
      if (hasTransactions && hasBorrowers) {
        addResult({
          step: 'סיכום',
          status: 'success',
          message: '✅ המערכת מוכנה ליצירת התאמות',
          data: {}
        });
      } else {
        const issues = [];
        if (!hasTransactions) issues.push('אין עסקאות ללא התאמה');
        if (!hasBorrowers) issues.push('אין לווים עם הלוואות פעילות');
        
        addResult({
          step: 'סיכום',
          status: 'error',
          message: `❌ בעיות: ${issues.join(', ')}`,
          data: { issues }
        });
      }

    } catch (error) {
      addResult({
        step: 'שגיאה',
        status: 'error',
        message: `❌ שגיאה: ${error}`,
        data: {}
      });
    } finally {
      setLoading(false);
      setCurrentStep(0);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckIcon color="success" />;
      case 'error':
        return <ErrorIcon color="error" />;
      case 'warning':
        return <WarningIcon color="warning" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'success';
      case 'error':
        return 'error';
      case 'warning':
        return 'warning';
      default:
        return 'default';
    }
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box display="flex" alignItems="center" gap={2} mb={3}>
        <BugReportIcon fontSize="large" color="primary" />
        <Typography variant="h4" component="h1">
          אבחון מערכת התאמות
        </Typography>
      </Box>

      <Alert severity="info" sx={{ mb: 3 }}>
        כלי זה יבדוק מדוע לא נוצרות התאמות אוטומטיות ויספק מידע מפורט על הבעיה.
        <br />
        <strong>💡 טיפ:</strong> אם הוספת לווה/הלוואה חדשים, רענן את הדף (F5) לפני הרצת האבחון.
      </Alert>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box display="flex" gap={2}>
            <Button
              variant="contained"
              color="primary"
              size="large"
              fullWidth
              onClick={runFullDiagnosis}
              disabled={loading}
              startIcon={loading ? <CircularProgress size={20} /> : <BugReportIcon />}
            >
              {loading ? `מריץ אבחון... (שלב ${currentStep}/5)` : 'הרץ אבחון מלא'}
            </Button>
            
            <Button
              variant="outlined"
              color="secondary"
              onClick={() => window.location.reload()}
              disabled={loading}
              startIcon={<RefreshIcon />}
              sx={{ minWidth: '120px' }}
            >
              רענן דף
            </Button>
          </Box>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Box>
          {results.map((result, index) => (
            <Card key={index} sx={{ mb: 2 }}>
              <CardContent>
                <Box display="flex" alignItems="center" gap={1} mb={2}>
                  {getStatusIcon(result.status)}
                  <Typography variant="h6">{result.step}</Typography>
                </Box>
                
                <Alert severity={getStatusColor(result.status) as any} sx={{ mb: 2 }}>
                  {result.message}
                </Alert>

                {result.data && Object.keys(result.data).length > 0 && (
                  <Paper sx={{ p: 2, bgcolor: '#f5f5f5' }}>
                    <Typography variant="subtitle2" gutterBottom>
                      פרטים:
                    </Typography>
                    <pre style={{ 
                      overflow: 'auto', 
                      fontSize: '12px',
                      direction: 'ltr',
                      textAlign: 'left',
                      whiteSpace: 'pre-wrap'
                    }}>
                      {JSON.stringify(result.data, null, 2)}
                    </pre>
                  </Paper>
                )}
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      {results.length === 0 && !loading && (
        <Card>
          <CardContent>
            <Typography variant="body1" color="text.secondary" align="center">
              לחץ על "הרץ אבחון מלא" כדי להתחיל
            </Typography>
          </CardContent>
        </Card>
      )}
    </Container>
  );
};

export default BankDebugPage;
