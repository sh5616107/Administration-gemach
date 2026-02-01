import { useState, useMemo } from 'react'
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
  TableSortLabel,
} from '@mui/material'
import { Close as CloseIcon } from '@mui/icons-material'

export interface ColumnDefinition<T> {
  id: string
  label: string
  align?: 'left' | 'center' | 'right'
  format?: (item: T) => string | React.ReactNode
  sortable?: boolean
  sortValue?: (item: T) => string | number
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

type SortOrder = 'asc' | 'desc'

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
  const [orderBy, setOrderBy] = useState<string | null>(null)
  const [order, setOrder] = useState<SortOrder>('asc')

  const handleSort = (columnId: string) => {
    const isAsc = orderBy === columnId && order === 'asc'
    setOrder(isAsc ? 'desc' : 'asc')
    setOrderBy(columnId)
  }

  const sortedItems = useMemo(() => {
    if (!orderBy) return items

    const column = columns.find(col => col.id === orderBy)
    if (!column) return items

    return [...items].sort((a, b) => {
      let aValue: any
      let bValue: any

      if (column.sortValue) {
        aValue = column.sortValue(a)
        bValue = column.sortValue(b)
      } else {
        aValue = a[column.id]
        bValue = b[column.id]
      }

      // Handle null/undefined values
      if (aValue == null) return 1
      if (bValue == null) return -1

      // Compare values
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        const comparison = aValue.localeCompare(bValue, 'he')
        return order === 'asc' ? comparison : -comparison
      }

      if (aValue < bValue) return order === 'asc' ? -1 : 1
      if (aValue > bValue) return order === 'asc' ? 1 : -1
      return 0
    })
  }, [items, orderBy, order, columns])

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
                      {column.sortable !== false ? (
                        column.align === 'right' ? (
                          <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                            <TableSortLabel
                              active={orderBy === column.id}
                              direction={orderBy === column.id ? order : 'asc'}
                              onClick={() => handleSort(column.id)}
                              hideSortIcon={false}
                              sx={{
                                '& .MuiTableSortLabel-icon': {
                                  opacity: orderBy === column.id ? 1 : 0.3,
                                  marginLeft: '4px',
                                  marginRight: 0,
                                },
                              }}
                            >
                              {column.label}
                            </TableSortLabel>
                          </Box>
                        ) : (
                          <TableSortLabel
                            active={orderBy === column.id}
                            direction={orderBy === column.id ? order : 'asc'}
                            onClick={() => handleSort(column.id)}
                            hideSortIcon={false}
                            sx={{
                              '& .MuiTableSortLabel-icon': {
                                opacity: orderBy === column.id ? 1 : 0.3,
                              },
                            }}
                          >
                            {column.label}
                          </TableSortLabel>
                        )
                      ) : (
                        column.label
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedItems.map((item, index) => (
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
