import {
  Dialog,
  DialogTitle,
  DialogContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  CircularProgress,
  Box,
  Typography,
} from '@mui/material'
import { Close as CloseIcon } from '@mui/icons-material'

export interface ColumnDefinition<T> {
  id: string
  label: string
  align?: 'left' | 'center' | 'right'
  format?: (item: T) => string | React.ReactNode
}

export interface ItemsListDialogProps<T> {
  open: boolean
  onClose: () => void
  title: string
  items: T[]
  columns: ColumnDefinition<T>[]
  onItemClick: (item: T) => void
  loading?: boolean
  emptyMessage?: string
}

export default function ItemsListDialog<T extends Record<string, any>>({
  open,
  onClose,
  title,
  items,
  columns,
  onItemClick,
  loading = false,
  emptyMessage = 'אין פריטים להצגה',
}: ItemsListDialogProps<T>) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {title}
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : items.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography color="text.secondary">{emptyMessage}</Typography>
          </Box>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  {columns.map((column) => (
                    <TableCell key={column.id} align={column.align || 'left'}>
                      {column.label}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((item, index) => (
                  <TableRow
                    key={index}
                    hover
                    onClick={() => onItemClick(item)}
                    sx={{
                      cursor: 'pointer',
                      '&:hover': {
                        bgcolor: 'action.hover',
                      },
                    }}
                  >
                    {columns.map((column) => (
                      <TableCell key={column.id} align={column.align || 'left'}>
                        {column.format ? column.format(item) : item[column.id]}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>
    </Dialog>
  )
}
