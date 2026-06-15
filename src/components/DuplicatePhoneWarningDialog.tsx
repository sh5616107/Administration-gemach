/**
 * Duplicate Phone Warning Dialog
 * דיאלוג אזהרה כאשר מספר טלפון כבר קיים במערכת
 */

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Alert,
  List,
  ListItem,
  ListItemText,
  Typography,
  Box
} from '@mui/material'
import { Warning as WarningIcon } from '@mui/icons-material'

interface Props {
  open: boolean
  phone: string
  existingContacts: Array<{
    id: string
    name: string
    role: string
    phone: string
  }>
  onConfirm: () => void
  onCancel: () => void
}

export default function DuplicatePhoneWarningDialog({
  open,
  phone,
  existingContacts,
  onConfirm,
  onCancel
}: Props) {
  // אם אין אנשי קשר קיימים, לא להציג כלום
  if (!open || existingContacts.length === 0) {
    return null
  }
  
  // בדיקה אם זו שגיאת ולידציה (טלפון ריק/0)
  const isValidationError = existingContacts[0]?.role === 'שגיאה'
  
  return (
    <Dialog 
      open={open} 
      maxWidth="sm" 
      fullWidth
      PaperProps={{
        sx: { 
          borderTop: '4px solid', 
          borderColor: isValidationError ? 'error.main' : 'warning.main'
        }
      }}
    >
      <DialogTitle sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 1,
        bgcolor: isValidationError ? 'error.light' : 'warning.light',
        color: isValidationError ? 'error.contrastText' : 'warning.contrastText'
      }}>
        <WarningIcon fontSize="large" />
        <Typography variant="h6">
          {isValidationError ? 'שגיאת הזנה' : 'מספר טלפון כבר קיים במערכת'}
        </Typography>
      </DialogTitle>
      
      <DialogContent sx={{ mt: 2 }}>
        {isValidationError ? (
          // הודעת שגיאה - טלפון לא תקין
          <Alert severity="error" sx={{ mb: 2 }}>
            <Typography variant="body1" fontWeight="bold">
              {existingContacts[0].name}
            </Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              מספר טלפון הוא שדה חובה. אנא הזן מספר טלפון תקין.
            </Typography>
          </Alert>
        ) : (
          // אזהרה - טלפון כפול
          <>
            <Alert severity="warning" sx={{ mb: 2 }}>
              המספר <strong>{phone}</strong> כבר רשום במערכת עבור:
            </Alert>
            
            <List sx={{ bgcolor: 'grey.50', borderRadius: 1, p: 1 }}>
              {existingContacts.map((contact, idx) => (
                <ListItem 
                  key={idx}
                  sx={{ 
                    bgcolor: 'white',
                    mb: idx < existingContacts.length - 1 ? 1 : 0,
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'grey.300'
                  }}
                >
                  <ListItemText
                    primary={
                      <Typography variant="subtitle1" fontWeight="bold">
                        {contact.name}
                      </Typography>
                    }
                    secondary={
                      <Typography variant="body2" color="text.secondary">
                        תפקיד: {contact.role} • טלפון: {contact.phone}
                      </Typography>
                    }
                  />
                </ListItem>
              ))}
            </List>
            
            <Box sx={{ 
              mt: 2, 
              p: 2, 
              bgcolor: 'error.light', 
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'error.main'
            }}>
              <Typography variant="body2" fontWeight="bold" gutterBottom>
                ⚠️ אזהרה חשובה
              </Typography>
              <Typography variant="body2">
                שמירת איש קשר נוסף עם אותו מספר טלפון עלולה ליצור בלבול 
                ובעיות בניהול הנתונים. <strong>מומלץ מאוד</strong> להשתמש במספרי טלפון שונים.
              </Typography>
            </Box>
            
            <Typography sx={{ mt: 2, fontWeight: 'bold' }}>
              האם אתה בטוח שברצונך להמשיך?
            </Typography>
          </>
        )}
      </DialogContent>
      
      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button 
          onClick={onCancel} 
          variant="contained"
          size="large"
          fullWidth
        >
          {isValidationError ? 'סגור' : 'ביטול - אתקן את המספר'}
        </Button>
        {!isValidationError && (
          <Button 
            onClick={onConfirm} 
            color="warning" 
            variant="outlined"
            size="large"
            fullWidth
          >
            המשך בכל זאת
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
