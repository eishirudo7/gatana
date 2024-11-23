import { useState, useEffect } from 'react'
import { useToast } from '@/components/ui/use-toast'
import { getAllShops } from '../services/shopeeService'
import { supabase } from '@/lib/supabase'

interface Product {
  item_id: number
  category_id: number
  item_name: string
  description: string
  item_sku: string
  create_time: number
  update_time: number
  weight: string | number
  image: {
    image_id_list: string[]
    image_url_list: string[]
    image_ratio: string
  }
  logistic_info: Array<{
    logistic_id: number
    logistic_name: string
    enabled: boolean
    size_id: number
    is_free: boolean
  }>
  pre_order: {
    is_pre_order: boolean
    days_to_ship: number
  }
  condition: string
  item_status: string
  has_model: boolean
  models?: Array<{
    model_id: number
    model_name: string
    price_info: {
      current_price: number
      original_price: number
    }
    stock_info: {
      stock_type: number
      stock: number
    }
    model_status: string
  }>
  variations?: Array<{
    name: string
    options: string[]
    variation_id?: number
    variation_name: string
    variation_option_list: Array<{
      variation_option_id: number
      variation_option_name: string
      image_url: string | null
    }>
    variation_group_id: number | null
  }>
  brand: {
    brand_id: number
    original_brand_name: string
  }
  item_dangerous: number
  description_type: string
  size_chart_id: number
  promotion_image: {
    image_id_list: string[]
    image_url_list: string[]
  }
  deboost: string
  authorised_brand_id: number
  shopee_tokens: {
    shop_id: number
    shop_name: string
  }[]
  image_id_list: string[]
  image_url_list: string[]
}

interface SyncResponse {
  error: string | undefined
  success: boolean
  data: {
    items: Product[]
    total: number
    has_next_page: boolean
    next_offset: number
  }
}

interface Shop {
  shop_id: number
  shop_name: string
}

interface StockPrice {
  model_id: number;
  model_name: string;
  current_price: number;
  original_price: number;
  stock_info: {
    seller_stock: number;
    shopee_stock: Array<{
      stock: number;
      location_id: string;
    }>;
    total_reserved_stock: number;
    total_available_stock: number;
  };
  model_status: string;
}

export function useProducts() {
  const [isSyncing, setIsSyncing] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [shops, setShops] = useState<Shop[]>([])
  const [isLoadingShops, setIsLoadingShops] = useState(false)
  const [isLoadingProducts, setIsLoadingProducts] = useState(false)
  const { toast } = useToast()
  const [stockPrices, setStockPrices] = useState<StockPrice[]>([]);
  const [isLoadingStockPrices, setIsLoadingStockPrices] = useState(false);

  const loadShops = async () => {
    try {
      setIsLoadingShops(true)
      const shopsData = await getAllShops()
      setShops(shopsData)
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Gagal Memuat Toko',
        description: 'Terjadi kesalahan saat memuat daftar toko',
      })
    } finally {
      setIsLoadingShops(false)
    }
  }

  const loadProducts = async () => {
    try {
      setIsLoadingProducts(true)
      
      // Ambil data token shop yang aktif
      const { data: shopTokens, error: shopError } = await supabase
        .from('shopee_tokens')
        .select('shop_id, shop_name')
        .eq('is_active', true)
      
      if (shopError) throw shopError

      // Ambil items
      const { data: items, error: itemsError } = await supabase
        .from('items')
        .select('*')
        .in('shop_id', shopTokens?.map(token => token.shop_id) || [])
      
      if (itemsError) throw itemsError

      // Transform data untuk menyesuaikan dengan interface Product
      const productsWithShops = items?.map(item => ({
        ...item,
        image_id_list: item.image.image_id_list || [],
        image_url_list: item.image.image_url_list || [],
        shopee_tokens: shopTokens?.filter(token => token.shop_id === item.shop_id) || []
      })) || []

      setProducts(productsWithShops)
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Gagal Memuat Produk',
        description: error instanceof Error ? error.message : 'Terjadi kesalahan saat memuat daftar produk',
      })
    } finally {
      setIsLoadingProducts(false)
    }
  }

  useEffect(() => {
    loadProducts()
  }, [])

  const syncProducts = async (shopId: number) => {
    try {
      setIsSyncing(true)
      const response = await fetch(`/api/produk?shop_id=${shopId}`)
      const data: SyncResponse = await response.json()

      if (data.success) {
        // Simpan data produk ke Supabase
        for (const item of data.data.items) {
          // 1. Insert/Update item utama
          const { error: itemError } = await supabase
            .from('items')
            .upsert({
              item_id: item.item_id,
              shop_id: shopId,
              category_id: item.category_id,
              item_name: item.item_name,
              description: item.description,
              item_sku: item.item_sku,
              create_time: item.create_time,
              update_time: item.update_time,
              weight: item.weight,
              image: item.image,
              logistic_info: item.logistic_info,
              pre_order: item.pre_order,
              condition: item.condition,
              item_status: item.item_status,
              has_model: item.has_model,
              brand: item.brand,
              item_dangerous: item.item_dangerous,
              description_type: item.description_type,
              size_chart_id: item.size_chart_id,
              promotion_image: item.promotion_image,
              deboost: item.deboost === 'FALSE' ? false : true,
              authorised_brand_id: item.authorised_brand_id
            }, { 
              onConflict: 'item_id' 
            })

          if (itemError) throw itemError

          console.log('Item saved, processing variations...');
          
          // Proses variations
          if (item.variations && item.variations.length > 0) {
            for (const variation of item.variations) {
              const { error: variationError } = await supabase
                .from('item_variations')
                .upsert({
                  item_id: item.item_id,
                  variation_id: variation.variation_id,
                  variation_name: variation.variation_name,
                  variation_option: {
                    group_id: variation.variation_group_id || null,
                    options: variation.variation_option_list.map((opt) => ({
                      id: opt.variation_option_id,
                      name: opt.variation_option_name,
                      image_url: opt.image_url || null
                    }))
                  }
                }, {
                  onConflict: 'item_id,variation_id'
                })

              if (variationError) throw variationError
            }
          }

          // 3. Insert/Update models jika ada
          if (item.models && item.models.length > 0) {
            for (const model of item.models) {
              const { error: modelError } = await supabase
                .from('item_models')
                .upsert({
                  item_id: item.item_id,
                  model_id: model.model_id,
                  model_name: model.model_name,
                  current_price: model.price_info.current_price,
                  original_price: model.price_info.original_price,
                  stock_info: model.stock_info,
                  model_status: model.model_status
                }, { onConflict: 'item_id,model_id' })

              if (modelError) throw modelError
            }
          }
        }

        setProducts(data.data.items)
        toast({
          title: 'Sinkronisasi Berhasil',
          description: `${data.data.items.length} produk telah disinkronkan`,
        })
        return data.data.items
      } else {
        throw new Error(data.error)
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Gagal Sinkronisasi',
        description: error instanceof Error ? error.message : 'Terjadi kesalahan saat sinkronisasi',
      })
      return []
    } finally {
      setIsSyncing(false)
    }
  }

  const getStockPrices = async (itemId: number): Promise<StockPrice[]> => {
    try {
      setIsLoadingStockPrices(true);
      
      const { data, error } = await supabase
        .from('item_models')
        .select(`
          model_id,
          model_name,
          current_price,
          original_price,
          stock_info,
          model_status
        `)
        .eq('item_id', itemId);

      if (error) throw error;

      setStockPrices(data);
      return data;
      
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Gagal Memuat Data Stok dan Harga',
        description: error instanceof Error ? error.message : 'Terjadi kesalahan saat memuat data stok dan harga',
      });
      return [];
    } finally {
      setIsLoadingStockPrices(false);
    }
  };

  return {
    products,
    isSyncing,
    syncProducts,
    shops,
    loadShops,
    isLoadingShops,
    isLoadingProducts,
    loadProducts,
    stockPrices,
    isLoadingStockPrices,
    getStockPrices
  }
}
