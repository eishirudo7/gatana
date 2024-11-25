import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { OrderItem } from '@/app/hooks/useDashboard'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
// Impor ikon-ikon yang diperlukan
import { Package, Clock, Truck, XCircle, AlertCircle, RefreshCcw, Search, Filter, Printer, PrinterCheck, CheckSquare, CheckCircle, Send } from 'lucide-react'
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { OrderDetails } from '@/app/dashboard/OrderDetails'
import { useShippingDocument } from '@/app/hooks/useShippingDocument';
import { Button } from "@/components/ui/button";
import { mergePDFs } from '@/app/utils/pdfUtils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { OrderHistory } from '@/app/dashboard/OrderHistory';
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

type OrdersDetailTableProps = {
  orders: OrderItem[]
  onOrderUpdate?: (orderSn: string, updates: Partial<OrderItem>) => void
}

type OrderStatus = "READY_TO_SHIP" | "PROCESSED" | "SHIPPED" | "CANCELLED" | "IN_CANCEL" | "TO_RETURN";

const getStatusColor = (status: OrderStatus): string => {
  switch (status) {
    case "READY_TO_SHIP":
      return "bg-green-600 text-white";
    case "PROCESSED":
      return "bg-blue-600 text-white";
    case "SHIPPED":
      return "bg-indigo-600 text-white";
    case "CANCELLED":
      return "bg-red-600 text-white";
    case "IN_CANCEL":
      return "bg-yellow-600 text-white";
    case "TO_RETURN":
      return "bg-purple-600 text-white";
    default:
      return "bg-gray-600 text-white";
  }
};

const getStatusIcon = (status: OrderStatus) => {
  switch (status) {
    case "READY_TO_SHIP":
      return <Package size={14} className="inline-block mr-1" />;
    case "PROCESSED":
      return <Clock size={14} className="inline-block mr-1" />;
    case "SHIPPED":
      return <Truck size={14} className="inline-block mr-1" />;
    case "CANCELLED":
      return <XCircle size={14} className="inline-block mr-1" />;
    case "IN_CANCEL":
      return <AlertCircle size={14} className="inline-block mr-1" />;
    case "TO_RETURN":
      return <RefreshCcw size={14} className="inline-block mr-1" />;
    default:
      return null;
  }
};

// Update tipe props StatusBadge
type StatusBadgeProps = {
  status: OrderStatus;
  order: OrderItem;
  onProcess: (order: OrderItem) => void;
  onCancellationAction: (orderSn: string, action: 'ACCEPT' | 'REJECT') => void;
};

// Update komponen StatusBadge dengan props baru
const StatusBadge = React.memo(({ status, order, onProcess, onCancellationAction }: StatusBadgeProps) => (
  <div className="flex items-center gap-2">
    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(status)}`}>
      {getStatusIcon(status)}
      {status}
    </span>
    {status === 'READY_TO_SHIP' && (
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 p-0 hover:bg-blue-100 dark:hover:bg-blue-900/30"
        onClick={() => onProcess(order)}
        title="Proses Pesanan"
      >
        <Send size={16} className="text-blue-600 dark:text-blue-400" />
      </Button>
    )}
    {status === 'IN_CANCEL' && (
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 p-0 hover:bg-green-100 dark:hover:bg-green-900/30"
          onClick={() => onCancellationAction(order.order_sn, 'ACCEPT')}
          title="Terima Pembatalan"
        >
          <CheckCircle size={16} className="text-green-600 dark:text-green-400" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 p-0 hover:bg-red-100 dark:hover:bg-red-900/30"
          onClick={() => onCancellationAction(order.order_sn, 'REJECT')}
          title="Tolak Pembatalan"
        >
          <XCircle size={16} className="text-red-600 dark:text-red-400" />
        </Button>
      </div>
    )}
  </div>
));

// Tambahkan baris ini setelah definisi komponen StatusBadge
StatusBadge.displayName = 'StatusBadge';

// Tambahkan interface
interface ShippingDocumentParams {
  order_sn: string;
  package_number?: string;
  shipping_document_type: "THERMAL_AIR_WAYBILL";
  shipping_carrier?: string;
}

// 1. Pindahkan definisi Category dan categories ke atas
interface Category {
  name: string;
  status: OrderStatus;
  count?: number;
}

// 2. Definisikan categories di luar komponen sebagai konstanta
const CATEGORY_LIST: Category[] = [
  { name: "Semua", status: "READY_TO_SHIP" },
  { name: "Siap Kirim", status: "READY_TO_SHIP" },
  { name: "Diproses", status: "PROCESSED" },
  { name: "Dikirim", status: "SHIPPED" },
  { name: "Dibatalkan", status: "CANCELLED" },
  { name: "Permintaan Batal", status: "IN_CANCEL" },
  { name: "Retur", status: "TO_RETURN" }
];

// 1. Buat interface untuk state tabel
interface TableState {
  searchTerm: string;
  selectedShops: string[];
  activeCategory: string;
  showCheckbox: boolean;
  selectedOrders: string[];
}

// 2. Buat interface untuk metrics
interface TableMetrics {
  readyToShipCount: number;
  cancelRequestCount: number;
  unprintedCount: number;
  totalPrintableDocuments: number;
}

// 1. Pisahkan MobileSelect menjadi komponen terpisah untuk mengurangi re-render
const MobileSelect = React.memo(({ 
  activeCategory, 
  categories, 
  onCategoryChange 
}: {
  activeCategory: string;
  categories: Category[];
  onCategoryChange: (value: string) => void;
}) => (
  <Select value={activeCategory} onValueChange={onCategoryChange}>
    <SelectTrigger className="h-8 text-xs w-full text-center flex justify-center">
      <SelectValue>
        {activeCategory} ({categories.find(c => c.name === activeCategory)?.count})
      </SelectValue>
    </SelectTrigger>
    <SelectContent 
      className="w-[var(--radix-select-trigger-width)] min-w-[var(--radix-select-trigger-width)]"
      position="popper"
      align="center"
      sideOffset={5}
    >
      {categories.map((category) => (
        <SelectItem 
          key={category.name} 
          value={category.name}
          className="text-center justify-center"
        >
          {category.name} ({category.count})
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
));

MobileSelect.displayName = 'MobileSelect';

export function OrdersDetailTable({ orders, onOrderUpdate }: OrdersDetailTableProps) {
  // 3. Gabungkan state yang berkaitan
  const [tableState, setTableState] = useState<TableState>({
    searchTerm: "",
    selectedShops: [],
    activeCategory: "Semua",
    showCheckbox: false,
    selectedOrders: []
  });

  // 4. Gunakan useMemo untuk metrics
  const metrics = useMemo<TableMetrics>(() => ({
    readyToShipCount: orders.filter(order => order.order_status === 'READY_TO_SHIP').length,
    cancelRequestCount: orders.filter(order => order.order_status === 'IN_CANCEL').length,
    unprintedCount: orders.filter(order => 
      !order.is_printed && 
      order.document_status === 'READY' &&
      (order.order_status === 'PROCESSED' || order.order_status === 'IN_CANCEL')
    ).length,
    totalPrintableDocuments: orders.filter(order => 
      order.document_status === 'READY' &&
      (order.order_status === 'PROCESSED' || order.order_status === 'IN_CANCEL')
    ).length
  }), [orders]);

  // 5. Optimasi filter orders dengan useMemo
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const categoryMatch = tableState.activeCategory === "Semua" || 
        order.order_status === CATEGORY_LIST.find(cat => cat.name === tableState.activeCategory)?.status;
      
      const searchMatch = !tableState.searchTerm || 
        order.buyer_username?.toLowerCase().includes(tableState.searchTerm.toLowerCase()) ||
        order.shipping_carrier?.toLowerCase().includes(tableState.searchTerm.toLowerCase()) ||
        order.order_sn.toLowerCase().includes(tableState.searchTerm.toLowerCase());
      
      const shopMatch = tableState.selectedShops.length === 0 || 
        tableState.selectedShops.includes(order.shop_name);
      
      return categoryMatch && searchMatch && shopMatch;
    });
  }, [orders, tableState.activeCategory, tableState.searchTerm, tableState.selectedShops]);

  // 6. Update handlers menggunakan tableState
  const handleCategoryChange = useCallback((categoryName: string) => {
    setTableState(prev => ({ ...prev, activeCategory: categoryName }));
  }, []);

  const handleSearch = useCallback((term: string) => {
    setTableState(prev => ({ ...prev, searchTerm: term }));
  }, []);

  const handleShopFilter = useCallback((shopName: string) => {
    setTableState(prev => ({
      ...prev,
      selectedShops: prev.selectedShops.includes(shopName)
        ? prev.selectedShops.filter(shop => shop !== shopName)
        : [...prev.selectedShops, shopName]
    }));
  }, []);

  const handleToggleCheckbox = useCallback(() => {
    setTableState(prev => {
      const newShowCheckbox = !prev.showCheckbox;
      return {
        ...prev,
        showCheckbox: newShowCheckbox,
        selectedOrders: newShowCheckbox ? prev.selectedOrders : []
      };
    });
  }, []);

  const handleSelectOrder = useCallback((orderSn: string, checked: boolean) => {
    setTableState(prev => ({
      ...prev,
      selectedOrders: checked 
        ? [...prev.selectedOrders, orderSn]
        : prev.selectedOrders.filter(sn => sn !== orderSn)
    }));
  }, []);

  const handleSelectAll = useCallback((checked: boolean) => {
    setTableState(prev => ({
      ...prev,
      selectedOrders: checked
        ? filteredOrders
            .filter(order => isOrderCheckable(order))
            .map(order => order.order_sn)
        : []
    }));
  }, [filteredOrders]);

  // Tambahkan hook useShippingDocument
  const { 
    downloadDocument, 
    isLoadingForOrder, 
    bulkProgress: documentBulkProgress,
    setBulkProgress: setDocumentBulkProgress,
    error: documentError 
  } = useShippingDocument();

  // Ganti fungsi handleDownloadDocument yang lama
  const handleDownloadDocument = useCallback(async (order: OrderItem) => {
    try {
      const params = {
        order_sn: order.order_sn,
        package_number: order.package_number,
        shipping_document_type: "THERMAL_AIR_WAYBILL" as const,
        shipping_carrier: order.shipping_carrier
      };

      // Destructure response untuk mendapatkan blob
      const { blob } = await downloadDocument(order.shop_id, [params]);
      const url = URL.createObjectURL(blob); // Gunakan blob, bukan seluruh response
      
      window.open(url, '_blank');
      
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000);

      if (onOrderUpdate) {
        onOrderUpdate(order.order_sn, { is_printed: true });
      }
    } catch (error) {
      console.error('Error downloading document:', error);
      toast.error('Gagal mengunduh dokumen');
    }
  }, [downloadDocument, onOrderUpdate]);

  // Tambahkan state baru untuk failed orders
  const [failedOrders, setFailedOrders] = useState<{
    orderSn: string;
    shopName: string;
    carrier: string;
  }[]>([]);

  // Tambahkan state untuk dialog failed orders
  const [isFailedOrdersDialogOpen, setIsFailedOrdersDialogOpen] = useState(false);

  // Update fungsi handleBulkPrint
  const handleBulkPrint = async () => {
    const ordersToPrint = tableState.selectedOrders.length > 0 
      ? orders.filter(order => tableState.selectedOrders.includes(order.order_sn))
      : orders.filter(order => isOrderCheckable(order));

    if (ordersToPrint.length === 0) {
      toast.info('Tidak ada dokumen yang dapat dicetak');
      return;
    }

    let totalSuccess = 0;
    let totalFailed = 0;

    const newFailedOrders: typeof failedOrders = [];

    try {
      // Kelompokkan berdasarkan shop_id
      const ordersByShop = ordersToPrint.reduce((groups: { [key: number]: OrderItem[] }, order) => {
        const shopId = order.shop_id;
        if (!groups[shopId]) {
          groups[shopId] = [];
        }
        groups[shopId].push(order);
        return groups;
      }, {});

      for (const [shopId, shopOrders] of Object.entries(ordersByShop)) {
        const shopName = shopOrders[0].shop_name;
        const blobs: Blob[] = [];

        setDocumentBulkProgress(prev => ({
          ...prev,
          currentShop: shopName
        }));

        const ordersByCarrier = shopOrders.reduce((groups: { [key: string]: OrderItem[] }, order) => {
          const carrier = order.shipping_carrier || 'unknown';
          if (!groups[carrier]) {
            groups[carrier] = [];
          }
          groups[carrier].push(order);
          return groups;
        }, {});

        for (const [carrier, carrierOrders] of Object.entries(ordersByCarrier)) {
          setDocumentBulkProgress(prev => ({
            ...prev,
            currentCarrier: carrier,
            currentShop: shopName,
            total: ordersToPrint.length
          }));

          const orderParams = carrierOrders.map(order => ({
            order_sn: order.order_sn,
            package_number: order.package_number,
            shipping_document_type: "THERMAL_AIR_WAYBILL" as const,
            shipping_carrier: order.shipping_carrier
          }));

          try {
            const { blob, failedOrders } = await downloadDocument(parseInt(shopId.toString()), orderParams);
            
            if (blob) {
              blobs.push(blob);
            }
            
            totalSuccess += carrierOrders.length - failedOrders.length;
            totalFailed += failedOrders.length;

            // Tambahkan failed orders ke array
            failedOrders.forEach(failedOrderSn => {
              newFailedOrders.push({
                orderSn: failedOrderSn,
                shopName,
                carrier
              });
            });

            setDocumentBulkProgress(prev => ({
              ...prev,
              processed: prev.processed + carrierOrders.length
            }));

          } catch (error) {
            console.error(`Error downloading documents for carrier ${carrier}:`, error);
            totalFailed += carrierOrders.length;
            
            // Tambahkan semua order yang gagal karena error
            carrierOrders.forEach(order => {
              newFailedOrders.push({
                orderSn: order.order_sn,
                shopName,
                carrier
              });
            });
            
            continue;
          }
        }

        if (blobs.length > 0) {
          try {
            const mergedPDF = await mergePDFs(blobs);
            const pdfUrl = URL.createObjectURL(mergedPDF);
            
            const newWindow = window.open('', '_blank');
            if (newWindow) {
              newWindow.document.write(`
                <!DOCTYPE html>
                <html>
                  <head><title>${shopName}</title></head>
                  <body style="margin:0;padding:0;height:100vh;">
                    <embed src="${pdfUrl}" type="application/pdf" width="100%" height="100%">
                  </body>
                </html>
              `);
              newWindow.document.close();
            }

            setTimeout(() => URL.revokeObjectURL(pdfUrl), 1000);
          } catch (error) {
            console.error(`Error merging PDFs for shop ${shopName}:`, error);
            toast.error(`Gagal menggabungkan PDF untuk ${shopName}`);
          }
        }
      }

      // Set failed orders dan tampilkan dialog jika ada yang gagal
      if (newFailedOrders.length > 0) {
        setFailedOrders(newFailedOrders);
        setIsFailedOrdersDialogOpen(true);
      }

      // Tampilkan ringkasan hasil
      if (totalSuccess > 0 && totalFailed > 0) {
        toast.info(`Proses selesai: ${totalSuccess} dokumen berhasil dicetak, ${totalFailed} dokumen gagal`);
      } else if (totalSuccess > 0) {
        toast.success(`Berhasil mencetak ${totalSuccess} dokumen`);
      } else {
        toast.error('Gagal mencetak semua dokumen');
      }

    } catch (error) {
      console.error('Gagal mencetak dokumen:', error);
      toast.error('Gagal mencetak dokumen');
    } finally {
      setDocumentBulkProgress({
        processed: 0,
        total: 0,
        currentCarrier: '',
        currentShop: ''
      });
    }
  };

  const checkboxRef = useRef<HTMLButtonElement>(null);

  // Update useEffect untuk menghandle indeterminate state
  useEffect(() => {
    const checkableOrders = filteredOrders.filter(order => isOrderCheckable(order));
    const selectedCheckableOrders = tableState.selectedOrders.length;
    const allCheckableOrders = checkableOrders.length;
    
    if (checkboxRef.current) {
      const isIndeterminate = selectedCheckableOrders > 0 && selectedCheckableOrders < allCheckableOrders;
      (checkboxRef.current as any).indeterminate = isIndeterminate;
    }
  }, [tableState.selectedOrders, filteredOrders]);

  // Tambahkan state untuk OrderHistory
  const [isOrderHistoryOpen, setIsOrderHistoryOpen] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string>('')

  // Tambahkan fungsi handler yang diperbarui
  const handleUsernameClick = (userId: number) => {
    console.log('Clicked userId:', userId);
    if (!userId) {
      console.warn('User ID tidak valid');
      return;
    }
    setSelectedUserId(userId.toString());
    setIsOrderHistoryOpen(true);
  }

  // Tambahkan useEffect untuk mengupdate title
  useEffect(() => {
    const readyToShipCount = orders.filter(order => order.order_status === 'READY_TO_SHIP').length;
    if (readyToShipCount > 0) {
      document.title = `(${readyToShipCount}) New Orders`;
    } else {
      document.title = 'Dashboard Pesanan';
    }

    // Cleanup function
    return () => {
      document.title = 'Dashboard Pesanan';
    };
  }, [orders]);

  // Tambahkan state untuk dialog konfirmasi print semua
  const [isPrintAllConfirmOpen, setIsPrintAllConfirmOpen] = useState(false);

  // Update fungsi handleBulkPrint untuk menampilkan konfirmasi terlebih dahulu
  const handleBulkPrintClick = () => {
    setIsPrintAllConfirmOpen(true);
  };

  // Fungsi untuk menangani konfirmasi print semua
  const handleConfirmPrintAll = async () => {
    setIsPrintAllConfirmOpen(false);
    await handleBulkPrint();
  };

  // Update URL endpoint untuk memproses pesanan
  const handleProcessOrder = async (order: OrderItem) => {
    try {
      toast.promise(
        async () => {
          const response = await fetch('/api/process-order', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              shopId: order.shop_id,
              orderSn: order.order_sn
            })
          });

          const data = await response.json();
          
          if (!data.success) {
            throw new Error(data.message || 'Gagal memproses pesanan');
          }

          // Update local state jika berhasil
          if (onOrderUpdate) {
            onOrderUpdate(order.order_sn, {
              order_status: 'PROCESSED'
            });
          }

          return data;
        },
        {
          loading: 'Memproses pesanan...',
          success: 'Pesanan berhasil diproses',
          error: (err) => `${err.message}`
        }
      );
    } catch (error) {
      console.error('Gagal memproses pesanan:', error);
    }
  };

  // Tambahkan state untuk tracking progress bulk process
  const [bulkProcessProgress, setBulkProcessProgress] = useState<{
    processed: number;
    total: number;
    currentOrder: string;
  }>({
    processed: 0,
    total: 0,
    currentOrder: ''
  });

  // Tambahkan state untuk dialog konfirmasi
  const [isProcessAllConfirmOpen, setIsProcessAllConfirmOpen] = useState(false);

  // Fungsi untuk memproses semua pesanan
  const handleProcessAllOrders = async () => {
    const readyToShipOrders = orders.filter(order => order.order_status === 'READY_TO_SHIP');
    
    if (readyToShipOrders.length === 0) {
      toast.info('Tidak ada pesanan yang perlu diproses');
      return;
    }

    try {
      // Inisialisasi progress
      setBulkProcessProgress({
        processed: 0,
        total: readyToShipOrders.length,
        currentOrder: ''
      });

      for (const order of readyToShipOrders) {
        setBulkProcessProgress(prev => ({
          ...prev,
          currentOrder: order.order_sn
        }));

        try {
          const response = await fetch('/api/process-order', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              shopId: order.shop_id,
              orderSn: order.order_sn
            })
          });

          const data = await response.json();
          
          if (!data.success) {
            console.error(`Gagal memproses pesanan ${order.order_sn}:`, data.message);
            toast.error(`Gagal memproses pesanan ${order.order_sn}`);
            continue;
          }

          // Update local state
          if (onOrderUpdate) {
            onOrderUpdate(order.order_sn, {
              order_status: 'PROCESSED'
            });
          }

          setBulkProcessProgress(prev => ({
            ...prev,
            processed: prev.processed + 1
          }));

          // Delay kecil antara setiap request
          await new Promise(resolve => setTimeout(resolve, 500));

        } catch (error) {
          console.error(`Gagal memproses pesanan ${order.order_sn}:`, error);
          toast.error(`Gagal memproses pesanan ${order.order_sn}`);
        }
      }

      toast.success('Proses selesai');

    } catch (error) {
      console.error('Gagal memproses pesanan:', error);
      toast.error('Terjadi kesalahan saat memproses pesanan');
    } finally {
      // Reset progress setelah selesai
      setTimeout(() => {
        setBulkProcessProgress({
          processed: 0,
          total: 0,
          currentOrder: ''
        });
      }, 2000);
    }
  };

  // Tambahkan state untuk dialog konfirmasi reject all
  const [isRejectAllConfirmOpen, setIsRejectAllConfirmOpen] = useState(false);

  // Tambahkan state untuk tracking progress bulk reject
  const [bulkRejectProgress, setBulkRejectProgress] = useState<{
    processed: number;
    total: number;
    currentOrder: string;
  }>({
    processed: 0,
    total: 0,
    currentOrder: ''
  });

  // Tambahkan fungsi untuk menolak semua pembatalan
  const handleRejectAllCancellations = async () => {
    const cancelRequests = orders.filter(order => order.order_status === 'IN_CANCEL');
    
    if (cancelRequests.length === 0) {
      toast.info('Tidak ada permintaan pembatalan');
      return;
    }

    try {
      // Inisialisasi progress
      setBulkRejectProgress({
        processed: 0,
        total: cancelRequests.length,
        currentOrder: ''
      });

      for (const order of cancelRequests) {
        setBulkRejectProgress(prev => ({
          ...prev,
          currentOrder: order.order_sn
        }));

        try {
          const response = await fetch('/api/orders/handle-cancellation', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              shopId: order.shop_id,
              orderSn: order.order_sn,
              operation: 'REJECT'
            })
          });

          const result = await response.json();
          
          if (result.success) {
            if (onOrderUpdate) {
              onOrderUpdate(order.order_sn, {
                order_status: 'READY_TO_SHIP'
              });
            }
          } else {
            console.error(`Gagal menolak pembatalan ${order.order_sn}:`, result.message);
            toast.error(`Gagal menolak pembatalan ${order.order_sn}`);
          }

          setBulkRejectProgress(prev => ({
            ...prev,
            processed: prev.processed + 1
          }));

          // Delay kecil antara setiap request
          await new Promise(resolve => setTimeout(resolve, 500));

        } catch (error) {
          console.error(`Gagal menolak pembatalan ${order.order_sn}:`, error);
          toast.error(`Gagal menolak pembatalan ${order.order_sn}`);
        }
      }

      toast.success('Proses penolakan pembatalan selesai');

    } catch (error) {
      console.error('Gagal menolak pembatalan:', error);
      toast.error('Terjadi kesalahan saat menolak pembatalan');
    } finally {
      // Reset progress setelah selesai
      setTimeout(() => {
        setBulkRejectProgress({
          processed: 0,
          total: 0,
          currentOrder: ''
        });
      }, 2000);
    }
  };

  // Tambahkan state yang diperlukan
  const [selectedOrderSn, setSelectedOrderSn] = useState<string>('');
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isUnprintedConfirmOpen, setIsUnprintedConfirmOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<{
    orderSn: string;
    action: 'ACCEPT' | 'REJECT';
  }>({ orderSn: '', action: 'ACCEPT' });

  // 3. Gunakan CATEGORY_LIST untuk membuat categories dengan useMemo
  const categories = useMemo(() => CATEGORY_LIST, []);

  // Update categories dengan count
  const updatedCategories = useMemo(() => {
    return categories.map(category => ({
      ...category,
      count: category.name === "Semua" 
        ? orders.length 
        : orders.filter(order => order.order_status === category.status).length
    }));
  }, [categories, orders]);

  // Fungsi helper
  const isOrderCheckable = useCallback((order: OrderItem): boolean => {
    return order.document_status === 'READY' &&
      (order.order_status === 'PROCESSED' || order.order_status === 'IN_CANCEL');
  }, []);

  // Fungsi untuk menangani print dokumen yang belum dicetak
  const handlePrintUnprinted = useCallback(async () => {
    const unprintedOrders = orders.filter(order => 
      !order.is_printed && 
      order.document_status === 'READY' &&
      (order.order_status === 'PROCESSED' || order.order_status === 'IN_CANCEL')
    );

    if (unprintedOrders.length === 0) {
      toast.info('Tidak ada dokumen yang belum dicetak');
      return;
    }

    setIsUnprintedConfirmOpen(true);
  }, [orders]);

  // Fungsi untuk konfirmasi print dokumen yang belum dicetak
  const handleConfirmUnprinted = useCallback(async () => {
    setIsUnprintedConfirmOpen(false);
    
    const unprintedOrders = orders.filter(order => 
      !order.is_printed && 
      order.document_status === 'READY' &&
      (order.order_status === 'PROCESSED' || order.order_status === 'IN_CANCEL')
    );

    if (unprintedOrders.length === 0) {
      toast.info('Tidak ada dokumen yang belum dicetak');
      return;
    }

    let totalSuccess = 0;
    let totalFailed = 0;

    try {
      // Kelompokkan berdasarkan shop_id
      const ordersByShop = unprintedOrders.reduce((groups: { [key: number]: OrderItem[] }, order) => {
        const shopId = order.shop_id;
        if (!groups[shopId]) {
          groups[shopId] = [];
        }
        groups[shopId].push(order);
        return groups;
      }, {});

      for (const [shopId, shopOrders] of Object.entries(ordersByShop)) {
        const shopName = shopOrders[0].shop_name;
        const blobs: Blob[] = [];

        // Update progress dengan nama toko
        setDocumentBulkProgress(prev => ({
          ...prev,
          currentShop: shopName
        }));

        const ordersByCarrier = shopOrders.reduce((groups: { [key: string]: OrderItem[] }, order) => {
          const carrier = order.shipping_carrier || 'unknown';
          if (!groups[carrier]) {
            groups[carrier] = [];
          }
          groups[carrier].push(order);
          return groups;
        }, {});

        for (const [carrier, carrierOrders] of Object.entries(ordersByCarrier)) {
          setDocumentBulkProgress(prev => ({
            ...prev,
            currentCarrier: carrier,
            currentShop: shopName,
            total: unprintedOrders.length
          }));

          const orderParams = carrierOrders.map(order => ({
            order_sn: order.order_sn,
            package_number: order.package_number,
            shipping_document_type: "THERMAL_AIR_WAYBILL" as const,
            shipping_carrier: order.shipping_carrier
          }));

          try {
            const { blob, failedOrders } = await downloadDocument(parseInt(shopId.toString()), orderParams);
            
            if (blob) {
              blobs.push(blob);
            }
            
            totalSuccess += carrierOrders.length - failedOrders.length;
            totalFailed += failedOrders.length;

            setDocumentBulkProgress(prev => ({
              ...prev,
              processed: prev.processed + carrierOrders.length
            }));

          } catch (error) {
            console.error(`Error downloading documents for carrier ${carrier}:`, error);
            toast.error(`Gagal mengunduh dokumen untuk ${carrier}`);
          }
        }

        if (blobs.length > 0) {
          try {
            const mergedPDF = await mergePDFs(blobs);
            const pdfUrl = URL.createObjectURL(mergedPDF);
            
            const newWindow = window.open('', '_blank');
            if (newWindow) {
              newWindow.document.write(`
                <!DOCTYPE html>
                <html>
                  <head><title>${shopName} - Belum Print</title></head>
                  <body style="margin:0;padding:0;height:100vh;">
                    <embed src="${pdfUrl}" type="application/pdf" width="100%" height="100%">
                  </body>
                </html>
              `);
              newWindow.document.close();
            }

            setTimeout(() => URL.revokeObjectURL(pdfUrl), 1000);
          } catch (error) {
            console.error(`Error merging PDFs for shop ${shopName}:`, error);
            toast.error(`Gagal menggabungkan PDF untuk ${shopName}`);
          }
        }
      }

      toast.success('Proses pencetakan selesai');

    } catch (error) {
      console.error('Gagal mencetak dokumen:', error);
      toast.error('Gagal mencetak dokumen');
    } finally {
      setDocumentBulkProgress({
        processed: 0,
        total: 0,
        currentCarrier: '',
        currentShop: ''
      });
    }
  }, [orders, downloadDocument]);

  // Fungsi untuk menangani aksi pembatalan
  const handleCancellationAction = useCallback(async (orderSn: string, action: 'ACCEPT' | 'REJECT') => {
    setSelectedAction({ orderSn, action });
    setIsConfirmOpen(true);
  }, []);

  // Update fungsi handleConfirmAction
  const handleConfirmAction = useCallback(async () => {
    setIsConfirmOpen(false);
    
    try {
      toast.promise(
        async () => {
          const response = await fetch('/api/orders/handle-cancellation', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              shopId: orders.find(o => o.order_sn === selectedAction.orderSn)?.shop_id,
              orderSn: selectedAction.orderSn,
              operation: selectedAction.action
            })
          });

          const result = await response.json();
          
          if (!result.success) {
            throw new Error(result.message || 'Gagal memproses pembatalan');
          }

          // Update local state jika berhasil
          if (onOrderUpdate) {
            onOrderUpdate(selectedAction.orderSn, {
              order_status: selectedAction.action === 'ACCEPT' ? 'CANCELLED' : 'READY_TO_SHIP'
            });
          }

          return result;
        },
        {
          loading: 'Memproses pembatalan...',
          success: `Berhasil ${selectedAction.action === 'ACCEPT' ? 'menerima' : 'menolak'} pembatalan`,
          error: (err) => `${err.message}`
        }
      );
    } catch (error) {
      console.error('Gagal memproses pembatalan:', error);
    }
  }, [selectedAction, orders, onOrderUpdate]);

  // Tambahkan state untuk daftar toko
  const shops = useMemo(() => {
    return Array.from(new Set(orders.map(order => order.shop_name))).sort();
  }, [orders]);

  // 2. Optimasi handler dengan useCallback
  const handleMobileCategoryChange = useCallback((value: string) => {
    handleCategoryChange(value);
  }, [handleCategoryChange]);

  return (
    <div className="w-full">
      {documentBulkProgress.total > 0 && (
        <div className="mt-2 mb-2 p-2 bg-white dark:bg-gray-800 border rounded-lg shadow-sm">
          <div className="flex flex-col gap-1.5">
            {/* Progress Info - Single Line */}
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <Printer size={14} className="text-primary dark:text-white animate-pulse" />
                <span className="font-medium dark:text-white">
                  {documentBulkProgress.currentShop}
                  {documentBulkProgress.currentCarrier && 
                    <span className="text-gray-500 dark:text-gray-400">
                      {' • '}{documentBulkProgress.currentCarrier}
                    </span>
                  }
                </span>
              </div>
              <span className="text-gray-600 dark:text-gray-400">
                {documentBulkProgress.processed}/{documentBulkProgress.total}
              </span>
            </div>

            {/* Progress Bar */}
            <Progress 
              value={(documentBulkProgress.processed / documentBulkProgress.total) * 100} 
              className="h-1"
            />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 w-full mt-2">
        {/* Card Kategori, Pencarian, dan Filter */}
        <Card className="px-2 py-2 shadow-none rounded-lg">
          {/* Mobile Layout */}
          <div className="flex flex-col gap-2 sm:hidden">
            <MobileSelect 
              activeCategory={tableState.activeCategory}
              categories={updatedCategories}
              onCategoryChange={handleMobileCategoryChange}
            />
            {/* Baris Pencarian dengan Filter Toko dan Checkbox */}
            <div className="flex items-center gap-2">
              {/* Tombol Toggle Checkbox untuk Mobile */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleToggleCheckbox}
                className={`h-8 w-8 p-0 ${tableState.showCheckbox ? 'bg-blue-100 dark:bg-blue-900' : ''}`}
              >
                <CheckSquare size={14} />
              </Button>

              {/* Input Pencarian untuk Mobile */}
              <div className="relative flex-1 min-w-[200px]">
                <Input
                  type="text"
                  placeholder="Cari username, kurir, atau no. pesanan"
                  value={tableState.searchTerm}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="h-8 text-xs pl-8 pr-8"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  data-form-type="other"
                  name="search-input"
                />
                <Search size={16} className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400" />
              </div>

              {/* Tombol Filter untuk Mobile */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                    <Filter size={14} />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72" align="end">
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <h4 className="font-medium leading-none">Pilih Toko</h4>
                      <p className="text-sm text-muted-foreground">
                        Pilih toko yang ingin ditampilkan
                      </p>
                    </div>
                    <div className="grid gap-2">
                      {shops.map((shop) => (
                        <div key={shop} className="flex items-center space-x-2">
                          <Checkbox
                            id={`mobile-shop-${shop}`}
                            checked={tableState.selectedShops.includes(shop)}
                            onCheckedChange={(checked) => handleShopFilter(shop)}
                          />
                          <label
                            htmlFor={`mobile-shop-${shop}`}
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          >
                            {shop}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Desktop Layout */}
          <div className="hidden sm:flex items-center gap-2">
            {/* Tombol Toggle Checkbox - Kiri */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleToggleCheckbox}
              className={`h-8 ${tableState.showCheckbox ? 'bg-blue-100 dark:bg-blue-900' : ''}`}
            >
              <CheckSquare size={14} />
              {tableState.showCheckbox}
            </Button>

            {/* Kategori - Tengah */}
            <div className="flex gap-2 flex-1">
              {updatedCategories.map((category) => (
                <Button
                  key={category.name}
                  onClick={() => handleCategoryChange(category.name)}
                  variant={tableState.activeCategory === category.name ? "default" : "outline"}
                  size="sm"
                  className={`h-8 px-3 text-xs whitespace-nowrap
                    ${tableState.activeCategory === category.name
                      ? 'bg-primary hover:bg-primary/90 text-white dark:bg-primary-foreground'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                >
                  {category.name} ({category.count})
                </Button>
              ))}
            </div>

            {/* Pencarian dan Filter - Kanan */}
            <div className="flex items-center gap-2">
              <div className="relative w-[300px]">
                <Input
                  type="text"
                  placeholder="Cari username pesanan atau no resi..."
                  value={tableState.searchTerm}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="h-8 text-xs pl-8"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  data-form-type="other"
                  name="search-input-desktop"
                />
                <Search size={16} className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400" />
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8">
                    <Filter size={14}/>
                   
                  </Button>
                </PopoverTrigger>
                <PopoverContent 
                  className="w-80" 
                  align="end" 
                  alignOffset={-10}
                  sideOffset={5}
                >
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <h4 className="font-medium leading-none">Pilih Toko</h4>
                      <p className="text-sm text-muted-foreground">
                        Pilih toko yang ingin ditampilkan
                      </p>
                    </div>
                    <div className="grid gap-2">
                      {shops.map((shop) => (
                        <div key={shop} className="flex items-center space-x-2">
                          <Checkbox
                            id={`shop-${shop}`}
                            checked={tableState.selectedShops.includes(shop)}
                            onCheckedChange={(checked) => handleShopFilter(shop)}
                          />
                          <label
                            htmlFor={`shop-${shop}`}
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          >
                            {shop}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </Card>

        {/* Card Tombol */}
        <Card className="px-2 py-2 shadow-none rounded-lg">
          <div className="flex justify-between">
            {/* Grup Tombol Pesanan - Sebelah Kiri */}
            <div className="flex gap-2">
              <Button
                onClick={() => setIsProcessAllConfirmOpen(true)}
                className="px-2 sm:px-3 py-2 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap h-[32px] min-h-0 dark:bg-blue-700 dark:hover:bg-blue-800"
                disabled={metrics.readyToShipCount === 0}
                title="Proses Semua Pesanan"
              >
                <Send size={14} className="sm:mr-1" />
                <span className="hidden sm:inline">
                  Proses Semua ({metrics.readyToShipCount})
                </span>
                <span className="sm:hidden ml-1">
                  ({metrics.readyToShipCount})
                </span>
              </Button>

              <Button
                onClick={() => setIsRejectAllConfirmOpen(true)}
                className="px-2 sm:px-3 py-2 text-xs font-medium bg-red-600 hover:bg-red-700 text-white whitespace-nowrap h-[32px] min-h-0 dark:bg-red-700 dark:hover:bg-red-800"
                disabled={metrics.cancelRequestCount === 0}
                title="Tolak Semua Pembatalan"
              >
                <XCircle size={14} className="sm:mr-1" />
                <span className="hidden sm:inline">
                  Tolak Pembatalan ({metrics.cancelRequestCount})
                </span>
                <span className="sm:hidden ml-1">
                  ({metrics.cancelRequestCount})
                </span>
              </Button>
            </div>

            {/* Grup Tombol Cetak - Sebelah Kanan */}
            <div className="flex gap-2">
              <Button
                onClick={handlePrintUnprinted}
                className="px-2 sm:px-3 py-2 text-xs font-medium bg-green-600 hover:bg-green-700 text-white whitespace-nowrap h-[32px] min-h-0 dark:bg-green-700 dark:hover:bg-green-800"
                disabled={metrics.unprintedCount === 0}
                title="Cetak Dokumen Belum Print"
              >
                <Printer size={14} className="sm:mr-1" />
                <span className="hidden sm:inline">
                  Belum Print ({metrics.unprintedCount})
                </span>
                <span className="sm:hidden ml-1">
                  ({metrics.unprintedCount})
                </span>
              </Button>

              <Button
                onClick={handleBulkPrintClick}
                className={`px-2 sm:px-3 py-2 text-xs font-medium text-white whitespace-nowrap h-[32px] min-h-0
                  ${tableState.selectedOrders.length > 0 
                    ? 'bg-orange-500 hover:bg-orange-600 dark:bg-orange-600 dark:hover:bg-orange-700' 
                    : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800'
                  }`}
                title={tableState.selectedOrders.length > 0 
                  ? `Cetak ${tableState.selectedOrders.length} Dokumen`
                  : `Cetak Semua (${metrics.totalPrintableDocuments})`
                }
              >
                <PrinterCheck size={14} className="sm:mr-1" />
                <span className="hidden sm:inline">
                  {tableState.selectedOrders.length > 0 
                    ? `Cetak ${tableState.selectedOrders.length} Dokumen`
                    : `Cetak Semua (${metrics.totalPrintableDocuments})`
                  }
                </span>
                <span className="sm:hidden ml-1">
                  ({tableState.selectedOrders.length || metrics.totalPrintableDocuments})
                </span>
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <div className="rounded-md border overflow-x-auto mt-2">
        <Table className="w-full dark:bg-gray-900">
          <TableHeader>
            <TableRow className="dark:border-gray-700">
              {/* Update tampilan checkbox header */}
              <TableHead className={`w-10 p-1 h-[32px] align-middle ${!tableState.showCheckbox && 'hidden'}`}>
                <div className="flex justify-center">
                  <Checkbox
                    ref={checkboxRef}
                    checked={
                      filteredOrders.filter(order => isOrderCheckable(order)).length > 0 && 
                      filteredOrders
                        .filter(order => isOrderCheckable(order))
                        .every(order => tableState.selectedOrders.includes(order.order_sn))
                    }
                    onCheckedChange={handleSelectAll}
                    className="h-4 w-4"
                  />
                </div>
              </TableHead>
              <TableHead className="font-bold uppercase text-xs text-black dark:text-white w-10 text-center whitespace-nowrap">#</TableHead>
              <TableHead className="font-bold uppercase text-xs text-black dark:text-white whitespace-nowrap min-w-[80px] sm:min-w-[100px]">Toko</TableHead>
              <TableHead className="font-bold uppercase text-xs text-black dark:text-white whitespace-nowrap min-w-[120px]">Tanggal</TableHead>
              <TableHead className="font-bold uppercase text-xs text-black dark:text-white whitespace-nowrap min-w-[150px]">No. Pesanan</TableHead>
              <TableHead className="font-bold uppercase text-xs text-black dark:text-white whitespace-nowrap min-w-[100px]">Username</TableHead>
              <TableHead className="font-bold uppercase text-xs text-black dark:text-white whitespace-nowrap min-w-[100px]">Harga</TableHead>
              <TableHead className="font-bold uppercase text-xs text-black dark:text-white whitespace-nowrap min-w-[100px]">SKU (Qty)</TableHead>
              <TableHead className="font-bold uppercase text-xs text-black dark:text-white whitespace-nowrap min-w-[150px]">Kurir</TableHead>
              <TableHead className="font-bold uppercase text-xs text-black dark:text-white whitespace-nowrap min-w-[100px]">Status</TableHead>
              <TableHead className="font-bold uppercase text-xs text-black dark:text-white whitespace-nowrap w-[100px] text-center">Cetak</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredOrders.length > 0 ? (
              filteredOrders.map((order: OrderItem, index: number) => (
                <TableRow 
                  key={`${order.order_sn}`} 
                  className={
                    order.order_status === "IN_CANCEL" 
                      ? 'bg-red-100 dark:bg-red-900/50' 
                      : order.order_status === "CANCELLED"
                        ? 'bg-gray-300 dark:bg-gray-800' 
                        : index % 2 === 0 
                          ? 'bg-muted dark:bg-gray-800/50' 
                          : 'bg-gray-100/20 dark:bg-gray-900'
                  }
                >
                  <TableCell className={`p-1 h-[32px] align-middle ${!tableState.showCheckbox && 'hidden'}`}>
                    <div className="flex justify-center">
                      <Checkbox
                        checked={tableState.selectedOrders.includes(order.order_sn)}
                        disabled={!isOrderCheckable(order)}
                        onCheckedChange={(checked) => 
                          handleSelectOrder(order.order_sn, checked as boolean)
                        }
                        className="h-4 w-4"
                      />
                    </div>
                  </TableCell>
                  <TableCell className="p-1 h-[32px] text-xs text-gray-600 dark:text-white text-center whitespace-nowrap">{index + 1}</TableCell>
                  <TableCell className="p-1 h-[32px] text-xs text-gray-600 dark:text-white whitespace-nowrap max-w-[80px] sm:max-w-none overflow-hidden text-ellipsis">{order.shop_name}</TableCell>
                  <TableCell className="p-1 h-[32px] text-xs text-gray-600 dark:text-white whitespace-nowrap">{formatDate(order.pay_time)}</TableCell>
                  <TableCell 
                    className="p-1 h-[32px] text-xs text-gray-600 dark:text-white whitespace-nowrap cursor-pointer hover:text-primary"
                    onClick={() => {
                      setSelectedOrderSn(order.order_sn)
                      setIsDetailOpen(true)
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{order.order_sn}</span>
                      {order.cod && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-600 text-white dark:bg-red-500">
                          COD
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="p-1 h-[32px] text-xs text-gray-600 dark:text-white whitespace-nowrap">
                    <button
                      onClick={() => handleUsernameClick(order.buyer_user_id)}
                      className="hover:text-primary"
                    >
                      {order.buyer_username}
                    </button>
                  </TableCell>
                  <TableCell className="p-1 h-[32px] text-xs text-gray-600 dark:text-white whitespace-nowrap">Rp {order.total_amount.toLocaleString('id-ID')}</TableCell>
                  <TableCell className="p-1 h-[32px] text-xs text-gray-600 dark:text-white whitespace-nowrap">{order.sku_qty || '-'}</TableCell>
                  <TableCell className="p-1 h-[32px] text-xs text-gray-600 dark:text-white whitespace-nowrap">{order.shipping_carrier || '-'} ({order.tracking_number || '-'})</TableCell>
                  <TableCell className="p-1 h-[32px] text-xs text-gray-600 dark:text-white whitespace-nowrap">
                    <StatusBadge 
                      status={order.order_status as OrderStatus} 
                      order={order}
                      onProcess={handleProcessOrder}
                      onCancellationAction={handleCancellationAction}
                    />
                  </TableCell>
                  <TableCell className="text-center p-1 h-[32px]">
                    <Button
                      onClick={() => handleDownloadDocument(order)}
                      disabled={isLoadingForOrder(order.order_sn) || order.document_status !== 'READY'}
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 p-0"
                    >
                      {isLoadingForOrder(order.order_sn) ? (
                        <RefreshCcw size={12} className="animate-spin" />
                      ) : order.is_printed ? (
                        <PrinterCheck size={12} className="text-green-500 hover:text-green-600" />
                      ) : (
                        <Printer size={12} className="text-primary hover:text-primary/80" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-4 dark:text-gray-400">
                  Tidak ada data untuk ditampilkan
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      
      <OrderDetails 
        orderSn={selectedOrderSn}
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
      />

      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white">
              Konfirmasi Pembatalan
            </AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-300">
              Apakah Anda yakin ingin {selectedAction.action === 'ACCEPT' ? 'menerima' : 'menolak'} pembatalan untuk pesanan ini?
              {selectedAction.action === 'ACCEPT' 
                ? ' Pesanan akan dibatalkan.'
                : ' Pembeli tidak akan dapat mengajukan pembatalan lagi.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600 dark:border-gray-600">
              Batal
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmAction}
              className={`${
                selectedAction.action === 'ACCEPT'
                  ? 'bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700'
                  : 'bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700'
              } text-white`}
            >
              {selectedAction.action === 'ACCEPT' ? 'Terima Pembatalan' : 'Tolak Pembatalan'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isUnprintedConfirmOpen} onOpenChange={setIsUnprintedConfirmOpen}>
        <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white">
              Konfirmasi Cetak Dokumen Belum Print
            </AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-300">
              Anda akan mencetak {metrics.unprintedCount} dokumen yang belum pernah dicetak sebelumnya. 
              Setelah dicetak, dokumen akan ditandai sebagai sudah dicetak. Lanjutkan?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600 dark:border-gray-600">
              Batal
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmUnprinted}
              className="bg-primary text-primary-foreground hover:bg-primary/90 dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90"
            >
              Cetak Dokumen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isPrintAllConfirmOpen} onOpenChange={setIsPrintAllConfirmOpen}>
        <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white">
              Konfirmasi Cetak Dokumen
            </AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-300">
              Anda akan mencetak {tableState.selectedOrders.length > 0 
                ? tableState.selectedOrders.length 
                : metrics.totalPrintableDocuments} dokumen yang siap cetak. Lanjutkan?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600 dark:border-gray-600">
              Batal
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmPrintAll}
              className="bg-primary text-primary-foreground hover:bg-primary/90 dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90"
            >
              Cetak Dokumen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <OrderHistory 
        userId={selectedUserId}
        isOpen={isOrderHistoryOpen}
        onClose={() => setIsOrderHistoryOpen(false)}
      />

      {/* Tambahkan Dialog Konfirmasi */}
      <AlertDialog open={isProcessAllConfirmOpen} onOpenChange={setIsProcessAllConfirmOpen}>
        <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white">
              Konfirmasi Proses Pesanan
            </AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-300">
              Anda akan memproses {metrics.readyToShipCount} pesanan yang siap kirim. 
              Proses ini tidak dapat dibatalkan. Lanjutkan?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600 dark:border-gray-600">
              Batal
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                setIsProcessAllConfirmOpen(false);
                handleProcessAllOrders();
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-700 dark:hover:bg-blue-800"
            >
              Proses Semua
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Tambahkan Dialog Konfirmasi Reject All */}
      <AlertDialog open={isRejectAllConfirmOpen} onOpenChange={setIsRejectAllConfirmOpen}>
        <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white">
              Konfirmasi Tolak Semua Pembatalan
            </AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-300">
              Anda akan menolak {metrics.cancelRequestCount} permintaan pembatalan pesanan. 
              Pembeli tidak akan dapat mengajukan pembatalan lagi untuk pesanan-pesanan ini. Lanjutkan?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600 dark:border-gray-600">
              Batal
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                setIsRejectAllConfirmOpen(false);
                handleRejectAllCancellations();
              }}
              className="bg-red-600 hover:bg-red-700 text-white dark:bg-red-700 dark:hover:bg-red-800"
            >
              Tolak Semua
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog Failed Orders */}
      <AlertDialog 
        open={isFailedOrdersDialogOpen} 
        onOpenChange={setIsFailedOrdersDialogOpen}
      >
        <AlertDialogContent className="max-w-2xl dark:bg-gray-800 dark:border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white">
              Daftar Pesanan Gagal Cetak ({failedOrders.length})
            </AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-300">
              Berikut adalah daftar pesanan yang gagal dicetak. Anda dapat mencoba mencetak ulang secara manual.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="max-h-[400px] overflow-y-auto mt-4">
            <Table>
              <TableHeader>
                <TableRow className="dark:border-gray-700">
                  <TableHead className="font-bold text-xs dark:text-white">#</TableHead>
                  <TableHead className="font-bold text-xs dark:text-white">No. Pesanan</TableHead>
                  <TableHead className="font-bold text-xs dark:text-white">Toko</TableHead>
                  <TableHead className="font-bold text-xs dark:text-white">Kurir</TableHead>
                  <TableHead className="font-bold text-xs dark:text-white w-[100px] text-center">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {failedOrders.map((order, index) => {
                  const orderData = orders.find(o => o.order_sn === order.orderSn);
                  return (
                    <TableRow key={order.orderSn} className="dark:border-gray-700">
                      <TableCell className="text-xs dark:text-gray-300">{index + 1}</TableCell>
                      <TableCell className="text-xs dark:text-gray-300">{order.orderSn}</TableCell>
                      <TableCell className="text-xs dark:text-gray-300">{order.shopName}</TableCell>
                      <TableCell className="text-xs dark:text-gray-300">{order.carrier}</TableCell>
                      <TableCell className="text-center">
                        {orderData && (
                          <Button
                            onClick={() => handleDownloadDocument(orderData)}
                            disabled={isLoadingForOrder(order.orderSn)}
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                          >
                            {isLoadingForOrder(order.orderSn) ? (
                              <RefreshCcw size={12} className="animate-spin" />
                            ) : (
                              <Printer size={12} className="text-primary hover:text-primary/80" />
                            )}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel 
              className="dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600 dark:border-gray-600"
              onClick={() => setFailedOrders([])} // Clear failed orders when closing
            >
              Tutup
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}