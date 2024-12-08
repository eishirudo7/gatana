'use client'
import { useOrders } from '@/app/hooks/useOrders'
import type { Order } from '@/app/hooks/useOrders'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { CalendarIcon } from "lucide-react"
import { format } from "date-fns"
import { id } from 'date-fns/locale'
import { cn } from "@/lib/utils"
import { DateRange } from "react-day-picker"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card } from "@/components/ui/card"
import { Package, Clock, Truck, XCircle, ShoppingCart, XOctagon, Search, X } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Store } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useOrderSearch } from '@/app/hooks/useOrderSearch'

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

interface OrderStatusCardProps {
  title: string
  count: number
  icon: 'pending' | 'process' | 'shipping' | 'cancel' | 'total' | 'failed'
  onClick: () => void
  isActive: boolean
}

function OrderStatusCard({ title, count, icon, onClick, isActive }: OrderStatusCardProps) {
  const getIcon = () => {
    switch (icon) {
      case 'pending':
        return <Clock className="w-5 h-5" />
      case 'process':
        return <Package className="w-5 h-5" />
      case 'shipping':
        return <Truck className="w-5 h-5" />
      case 'cancel':
        return <XCircle className="w-5 h-5" />
      case 'total':
        return <ShoppingCart className="w-5 h-5" />
      case 'failed':
        return <XOctagon className="w-5 h-5" />
      default:
        return null
    }
  }

  const getActiveColors = () => {
    switch (icon) {
      case 'pending':
        return 'bg-yellow-500 text-white'
      case 'process':
        return 'bg-blue-500 text-white'
      case 'shipping':
        return 'bg-green-500 text-white'
      case 'cancel':
        return 'bg-red-500 text-white'
      case 'total':
        return 'bg-purple-500 text-white'
      case 'failed':
        return 'bg-orange-500 text-white'
      default:
        return 'bg-background'
    }
  }

  return (
    <Card 
      className={`transition-all duration-300 cursor-pointer ${
        isActive 
          ? `${getActiveColors()} shadow-lg scale-[1.02]` 
          : 'hover:bg-muted/50 hover:scale-[1.02]'
      }`}
      onClick={onClick}
    >
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className={`text-sm font-medium ${isActive ? 'text-white/80' : 'text-muted-foreground'}`}>
              {title}
            </p>
            <p className={`text-2xl font-bold tracking-tight ${isActive ? 'text-white' : ''}`}>
              {count}
            </p>
          </div>
          <div className={`p-2.5 rounded-xl ${
            isActive 
              ? 'bg-white/20' 
              : `bg-background ${
                  icon === 'pending' ? 'text-yellow-500' :
                  icon === 'process' ? 'text-blue-500' :
                  icon === 'shipping' ? 'text-green-500' :
                  icon === 'cancel' ? 'text-red-500' :
                  icon === 'total' ? 'text-purple-500' :
                  'text-orange-500'
                }`
          }`}>
            {getIcon()}
          </div>
        </div>
      </div>
    </Card>
  )
}

function TableRowSkeleton() {
  return (
    <TableRow>
      <TableCell className="p-1 h-[32px]"><Skeleton className="h-4 w-6" /></TableCell>
      <TableCell className="p-1 h-[32px]"><Skeleton className="h-4 w-20" /></TableCell>
      <TableCell className="p-1 h-[32px]"><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell className="p-1 h-[32px]"><Skeleton className="h-4 w-32" /></TableCell>
      <TableCell className="p-1 h-[32px]"><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell className="p-1 h-[32px]"><Skeleton className="h-4 w-20" /></TableCell>
      <TableCell className="p-1 h-[32px]"><Skeleton className="h-4 w-16" /></TableCell>
      <TableCell className="p-1 h-[32px]"><Skeleton className="h-4 w-32" /></TableCell>
      <TableCell className="p-1 h-[32px]"><Skeleton className="h-4 w-20" /></TableCell>
    </TableRow>
  )
}

export default function OrdersPage() {
  const [date, setDate] = useState<DateRange | undefined>({
    from: new Date(),
    to: new Date(),
  })
  const [selectedDateRange, setSelectedDateRange] = useState<DateRange | undefined>(date)
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const [activeFilter, setActiveFilter] = useState<string | null>(null)
  const [selectedShops, setSelectedShops] = useState<string[]>([])
  const [isShopFilterOpen, setIsShopFilterOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchType, setSearchType] = useState("order_sn")

  const { orders, loading: ordersLoading, error: ordersError } = useOrders(selectedDateRange)
  const [visibleOrders, setVisibleOrders] = useState<Order[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const loadingRef = useRef<HTMLDivElement>(null)
  const ITEMS_PER_PAGE = 20
  const { searchOrders, searchResults, loading: searchLoading } = useOrderSearch()
  
  // Modifikasi logika filtering
  const filteredOrders = searchResults.length > 0 
    ? searchResults  // Langsung gunakan hasil pencarian jika ada
    : orders.filter(order => {  // Gunakan filter hanya jika tidak ada hasil pencarian
        if (!activeFilter) return true
        
        if (activeFilter === 'failed') {
          return order.cancel_reason === 'Failed Delivery'
        }
        
        switch (activeFilter) {
          case 'pending':
            return order.order_status === 'UNPAID'
          case 'process':
            return order.order_status === 'PROCESSED'
          case 'shipping':
            return order.order_status === 'SHIPPED'
          case 'cancel':
            return order.order_status === 'CANCELLED'
          case 'total':
            if (order.cancel_reason === 'Failed Delivery') return false
            return !['CANCELLED'].includes(order.order_status)
          default:
            return true
        }
      })
      .filter(order => {
        if (selectedShops.length === 0) return true
        return selectedShops.includes(order.shop_name)
      })

  // Reset filter dan shop selection ketika melakukan pencarian
  const handleSearch = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (searchQuery.length < 4) {
        // Bisa ditambahkan toast/alert disini untuk memberi tahu user
        return
      }
      
      // Reset filter
      setActiveFilter(null)
      setSelectedShops([])
      
      const searchParams = {
        [searchType]: searchQuery
      }
      await searchOrders(searchParams)
    }
  }

  // Fungsi untuk memuat data secara bertahap
  const loadMoreOrders = useCallback(() => {
    const startIndex = (page - 1) * ITEMS_PER_PAGE
    const endIndex = startIndex + ITEMS_PER_PAGE
    const newOrders = filteredOrders.slice(startIndex, endIndex)
    
    if (newOrders.length > 0) {
      setVisibleOrders(prev => [...prev, ...newOrders])
      setPage(prev => prev + 1)
    }
    
    if (endIndex >= filteredOrders.length) {
      setHasMore(false)
    }
  }, [page, filteredOrders])

  // Setup Intersection Observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore) {
          loadMoreOrders()
        }
      },
      { threshold: 0.1 }
    )

    if (loadingRef.current) {
      observer.observe(loadingRef.current)
    }

    return () => observer.disconnect()
  }, [loadMoreOrders, hasMore])

  // Reset pagination ketika filter berubah
  useEffect(() => {
    setVisibleOrders([])
    setPage(1)
    setHasMore(true)
  }, [activeFilter, selectedShops, selectedDateRange])

  const handleDateSelect = (dateRange: DateRange | undefined) => {
    setDate(dateRange)
  }

  const handleApplyDate = () => {
    setSelectedDateRange(date)
    setIsCalendarOpen(false)
  }

  const handlePresetDate = (days: number) => {
    const now = new Date()
    let from: Date
    let to: Date

    if (days === -1) {
      from = new Date(now.getFullYear(), now.getMonth(), 1)
      to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    } else if (days === -2) {
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      to = new Date(now.getFullYear(), now.getMonth(), 0)
    } else if (days === 1) {
      from = new Date(now)
      from.setDate(now.getDate() - 1)
      to = new Date(from)
    } else {
      to = new Date(now)
      from = new Date(now)
      from.setDate(now.getDate() - days)
    }
    
    from.setHours(0, 0, 0, 0)
    to.setHours(23, 59, 59, 999)
    
    const newDateRange = { from, to }
    setDate(newDateRange)
    setSelectedDateRange(newDateRange)
    setIsCalendarOpen(false)
  }

  // Hitung jumlah pesanan berdasarkan status
  const orderStats = orders.reduce((acc, order) => {
    if (order.cancel_reason === 'Failed Delivery') {
      acc.failed++
    } else {
      switch (order.order_status) {
        case 'UNPAID':
          acc.pending++
          break
        case 'PROCESSED':
          acc.process++
          acc.total++
          break
        case 'SHIPPED':
          acc.shipping++
          acc.total++
          break
        case 'COMPLETED':
          acc.total++
          break
        case 'IN_CANCEL':
          acc.total++
          break
        case 'TO_CONFIRM_RECEIVE':
          acc.total++
          break
        case 'CANCELLED':
          acc.cancel++
          break
      }
    }
    return acc
  }, {
    pending: 0,
    process: 0,
    shipping: 0,
    cancel: 0,
    total: 0,
    failed: 0
  })

  // Dapatkan daftar unik toko dari orders
  const uniqueShops = Array.from(new Set(orders.map(order => order.shop_name))).sort()

  if (ordersLoading || searchLoading) {
    return (
      <div className="w-full p-4 sm:p-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="shadow-sm">
              <div className="p-4">
                <div className="space-y-3">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-8 w-16" />
                </div>
              </div>
            </Card>
          ))}
        </div>

        <Card className="shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 p-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        </Card>

        <div className="rounded-lg border shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="dark:border-gray-700">
                <TableHead className="font-bold uppercase text-xs">#</TableHead>
                <TableHead className="font-bold uppercase text-xs">Toko</TableHead>
                <TableHead className="font-bold uppercase text-xs">Tanggal</TableHead>
                <TableHead className="font-bold uppercase text-xs">No. Pesanan</TableHead>
                <TableHead className="font-bold uppercase text-xs">Username</TableHead>
                <TableHead className="font-bold uppercase text-xs">Harga</TableHead>
                <TableHead className="font-bold uppercase text-xs">SKU (Qty)</TableHead>
                <TableHead className="font-bold uppercase text-xs">Kurir</TableHead>
                <TableHead className="font-bold uppercase text-xs">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...Array(10)].map((_, i) => (
                <TableRowSkeleton key={i} />
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    )
  }
  if (ordersError) return <div className="container mx-auto p-4 text-red-500">{ordersError}</div>

  return (
    <div className="w-full p-4 sm:p-6 space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <OrderStatusCard
          title="Total"
          count={orderStats.total}
          icon="total"
          onClick={() => setActiveFilter(activeFilter === 'total' ? null : 'total')}
          isActive={activeFilter === 'total'}
        />
        <OrderStatusCard
          title="Belum Dibayar"
          count={orderStats.pending}
          icon="pending"
          onClick={() => setActiveFilter(activeFilter === 'pending' ? null : 'pending')}
          isActive={activeFilter === 'pending'}
        />
        <OrderStatusCard
          title="Diproses"
          count={orderStats.process}
          icon="process"
          onClick={() => setActiveFilter(activeFilter === 'process' ? null : 'process')}
          isActive={activeFilter === 'process'}
        />
        <OrderStatusCard
          title="Dikirim"
          count={orderStats.shipping}
          icon="shipping"
          onClick={() => setActiveFilter(activeFilter === 'shipping' ? null : 'shipping')}
          isActive={activeFilter === 'shipping'}
        />
        <OrderStatusCard
          title="Dibatalkan"
          count={orderStats.cancel}
          icon="cancel"
          onClick={() => setActiveFilter(activeFilter === 'cancel' ? null : 'cancel')}
          isActive={activeFilter === 'cancel'}
        />
        <OrderStatusCard
          title="COD Gagal"
          count={orderStats.failed}
          icon="failed"
          onClick={() => setActiveFilter(activeFilter === 'failed' ? null : 'failed')}
          isActive={activeFilter === 'failed'}
        />
      </div>

      <Card className="shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 p-2">
          <div>
            <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full justify-start text-left font-normal h-9",
                    !selectedDateRange && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDateRange?.from ? (
                    selectedDateRange.to ? (
                      <>
                        {format(selectedDateRange.from, "dd MMM yyyy", { locale: id })} -{" "}
                        {format(selectedDateRange.to, "dd MMM yyyy", { locale: id })}
                      </>
                    ) : (
                      format(selectedDateRange.from, "dd MMM yyyy", { locale: id })
                    )
                  ) : (
                    <span>Pilih tanggal</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <div className="space-y-3 p-3">
                  <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handlePresetDate(0)}
                      className="w-full sm:w-auto"
                    >
                      Hari Ini
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handlePresetDate(1)}
                      className="w-full sm:w-auto"
                    >
                      Kemarin
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handlePresetDate(7)}
                      className="w-full sm:w-auto"
                    >
                      1 Minggu
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handlePresetDate(30)}
                      className="w-full sm:w-auto"
                    >
                      1 Bulan
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handlePresetDate(-1)}
                      className="w-full sm:w-auto"
                    >
                      Bulan Ini
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handlePresetDate(-2)}
                      className="w-full sm:w-auto"
                    >
                      Bulan Kemarin
                    </Button>
                  </div>
                  <div className="border-t pt-3">
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={date?.from}
                      selected={date}
                      onSelect={handleDateSelect}
                      numberOfMonths={2}
                      locale={id}
                      className="sm:block hidden"
                    />
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={date?.from}
                      selected={date}
                      onSelect={handleDateSelect}
                      numberOfMonths={1}
                      locale={id}
                      className="sm:hidden block"
                    />
                  </div>
                  <div className="flex justify-end border-t pt-3">
                    <Button 
                      onClick={handleApplyDate}
                      disabled={!date?.from || !date?.to}
                    >
                      Terapkan
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <Popover open={isShopFilterOpen} onOpenChange={setIsShopFilterOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full justify-start text-left font-normal h-9",
                    !selectedShops.length && "text-muted-foreground"
                  )}
                >
                  <Store className="mr-2 h-4 w-4" />
                  {selectedShops.length === 0 && "Semua Toko"}
                  {selectedShops.length === 1 && selectedShops[0]}
                  {selectedShops.length > 1 && `${selectedShops.length} toko dipilih`}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[280px] p-0" align="start">
                <div className="p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Filter Toko</p>
                    {selectedShops.length > 0 && (
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => setSelectedShops([])}
                        className="h-8 px-2 text-xs"
                      >
                        Reset
                      </Button>
                    )}
                  </div>
                  <div className="border-t -mx-3" />
                  <ScrollArea className="h-[280px] -mx-3 px-3">
                    <div className="space-y-2">
                      {uniqueShops.map((shop) => (
                        <div key={shop} className="flex items-center space-x-2">
                          <Checkbox 
                            id={shop}
                            checked={selectedShops.includes(shop)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedShops([...selectedShops, shop])
                              } else {
                                setSelectedShops(selectedShops.filter(s => s !== shop))
                              }
                            }}
                          />
                          <label 
                            htmlFor={shop} 
                            className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          >
                            {shop}
                          </label>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex gap-2">
            <Select
              value={searchType}
              onValueChange={setSearchType}
            >
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue placeholder="Pilih Tipe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="order_sn">No. Pesanan</SelectItem>
                <SelectItem value="tracking_number">No. Resi</SelectItem>
                <SelectItem value="buyer_username">Username</SelectItem>
              </SelectContent>
            </Select>
            
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder={
                  searchType === "order_sn" ? "Cari no pesanan (min. 4 karakter)..." :
                  searchType === "tracking_number" ? "Cari no resi (min. 4 karakter)..." :
                  "Cari username (min. 4 karakter)..."
                }
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  if (e.target.value === "" && searchResults.length > 0) {
                    setActiveFilter(null)
                    setSelectedShops([])
                    searchOrders({ [searchType]: "" })
                  }
                }}
                onKeyDown={handleSearch}
                className={cn(
                  "w-full h-9 pl-8 pr-8 rounded-md border bg-background text-sm",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  searchQuery.length > 0 && searchQuery.length < 4 && "border-red-500"
                )}
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery("")
                    if (searchResults.length > 0) {
                      setActiveFilter(null)
                      setSelectedShops([])
                      searchOrders({ [searchType]: "" })
                    }
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-sm hover:bg-muted"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>
        </div>
      </Card>

      <div className="rounded-lg border shadow-sm overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="dark:border-gray-700">
              <TableHead className="font-bold uppercase text-xs text-black dark:text-white w-10 text-center whitespace-nowrap">#</TableHead>
              <TableHead className="font-bold uppercase text-xs text-black dark:text-white whitespace-nowrap min-w-[80px] sm:min-w-[100px]">Toko</TableHead>
              <TableHead className="font-bold uppercase text-xs text-black dark:text-white whitespace-nowrap min-w-[120px]">Tanggal</TableHead>
              <TableHead className="font-bold uppercase text-xs text-black dark:text-white whitespace-nowrap min-w-[150px]">No. Pesanan</TableHead>
              <TableHead className="font-bold uppercase text-xs text-black dark:text-white whitespace-nowrap min-w-[100px]">Username</TableHead>
              <TableHead className="font-bold uppercase text-xs text-black dark:text-white whitespace-nowrap min-w-[100px]">Harga</TableHead>
              <TableHead className="font-bold uppercase text-xs text-black dark:text-white whitespace-nowrap min-w-[100px]">SKU (Qty)</TableHead>
              <TableHead className="font-bold uppercase text-xs text-black dark:text-white whitespace-nowrap min-w-[150px]">Kurir</TableHead>
              <TableHead className="font-bold uppercase text-xs text-black dark:text-white whitespace-nowrap min-w-[100px]">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleOrders.map((order, index) => (
              <TableRow 
                key={order.order_sn}
                className={index % 2 === 0 ? 'bg-muted dark:bg-gray-800/50' : 'bg-gray-100/20 dark:bg-gray-900'}
              >
                <TableCell className="p-1 h-[32px] text-xs text-gray-600 dark:text-white text-center">{index + 1}</TableCell>
                <TableCell className="p-1 h-[32px] text-xs text-gray-600 dark:text-white whitespace-nowrap max-w-[80px] sm:max-w-none overflow-hidden text-ellipsis">{order.shop_name}</TableCell>
                <TableCell className="p-1 h-[32px] text-xs text-gray-600 dark:text-white whitespace-nowrap">{formatDate(order.create_time)}</TableCell>
                <TableCell className="p-1 h-[32px] text-xs text-gray-600 dark:text-white whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <span>{order.order_sn}</span>
                    {order.cod && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-600 text-white dark:bg-red-500">
                        COD
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="p-1 h-[32px] text-xs text-gray-600 dark:text-white whitespace-nowrap">{order.buyer_username}</TableCell>
                <TableCell className="p-1 h-[32px] text-xs text-gray-600 dark:text-white whitespace-nowrap">
                  Rp {parseInt(order.total_amount).toLocaleString('id-ID')}
                </TableCell>
                <TableCell className="p-1 h-[32px] text-xs text-gray-600 dark:text-white whitespace-nowrap">{order.sku_qty}</TableCell>
                <TableCell className="p-1 h-[32px] text-xs text-gray-600 dark:text-white whitespace-nowrap">
                  {order.shipping_carrier || '-'} ({order.tracking_number || '-'})
                </TableCell>
                <TableCell className="p-1 h-[32px] text-xs text-gray-600 dark:text-white whitespace-nowrap">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    order.order_status === 'READY_TO_SHIP' ? 'bg-green-600 text-white' :
                    order.order_status === 'PROCESSED' ? 'bg-blue-600 text-white' :
                    order.order_status === 'SHIPPED' ? 'bg-indigo-600 text-white' :
                    order.order_status === 'CANCELLED' ? 'bg-red-600 text-white' :
                    order.order_status === 'IN_CANCEL' ? 'bg-yellow-600 text-white' :
                    order.order_status === 'TO_RETURN' ? 'bg-purple-600 text-white' :
                    'bg-gray-600 text-white'
                  }`}>
                    {order.order_status}
                  </span>
                </TableCell>
              </TableRow>
            ))}
            {hasMore && (
              <>
                {[...Array(3)].map((_, i) => (
                  <TableRowSkeleton key={`skeleton-${i}`} />
                ))}
              </>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Loading indicator */}
      <div ref={loadingRef} className="flex justify-center items-center p-4">
        {visibleOrders.length === 0 ? (
          <span className="text-sm text-muted-foreground">
            {searchQuery.length >= 4 
              ? `Tidak ditemukan hasil untuk pencarian "${searchQuery}" pada ${
                  searchType === "order_sn" ? "nomor pesanan" :
                  searchType === "tracking_number" ? "nomor resi" :
                  "username"
                }`
              : "Tidak ada data pesanan"}
          </span>
        ) : null}
      </div>
    </div>
  )
}
