// Types
export interface FlashSaleIssue {
  shop_id: number;
  shop_name: string;
  issues: {
    inactive_current: number;
    no_active_flashsale: boolean;
    upcoming_count: number;
    inactive_upcoming: number;
  };
  details: Array<{
    flash_sale_id: number;
    start_time: number;
    end_time: number;
    type: string;
  }>;
}

export interface DiscountIssue {
  shops_without_backup: Array<{
    shop_name: string;
    shop_id: number;
    ongoing_discounts: Array<any>;
  }>;
  ending_soon: Array<{
    shop_name: string;
    shop_id: number;
    discounts: Array<any>;
  }>;
  expired_without_ongoing: Array<{
    shop_name: string;
    shop_id: number;
    discount: any;
  }>;
}

export interface OpenAICheckResult {
  success: boolean;
  message: string;
}

export interface ShopHealthResponse {
  success: boolean;
  data?: {
    flashSaleIssues: FlashSaleIssue[];
    discountIssues: DiscountIssue;
    summary: {
      totalIssues: number;
      criticalShops: CriticalShop[];
    };
  };
  message?: string;
}

interface CriticalShop {
  shop_id: number;
  shop_name: string;
  issues: string[];
}

// Constants
const API_ENDPOINTS = {
  flashSale: 'http://localhost:10000/api/flashsale/cek-fs',
  discount: 'http://localhost:10000/api/discount/cek-diskon'
} as const;

// Helper Functions
function processFlashSaleIssues(flashSaleData: FlashSaleIssue[]): CriticalShop[] {
  return flashSaleData.reduce<CriticalShop[]>((criticalShops, issue) => {
    const shopIssues: string[] = [];

    if (issue.issues.no_active_flashsale) {
      shopIssues.push('Tidak ada Flash Sale aktif');
    }
    if (issue.issues.inactive_current > 0) {
      shopIssues.push(`${issue.issues.inactive_current} Flash Sale aktif tidak memiliki produk`);
    }
    if (issue.issues.upcoming_count < 3) {
      shopIssues.push('Kurang dari 3 Flash Sale mendatang');
    }
    if (issue.issues.inactive_upcoming > 0) {
      shopIssues.push(`${issue.issues.inactive_upcoming} Flash Sale mendatang tidak memiliki produk`);
    }

    if (shopIssues.length > 0) {
      criticalShops.push({
        shop_id: issue.shop_id,
        shop_name: issue.shop_name,
        issues: shopIssues
      });
    }

    return criticalShops;
  }, []);
}

function processDiscountIssues(
  discountData: DiscountIssue,
  existingCriticalShops: CriticalShop[]
): CriticalShop[] {
  const updatedCriticalShops = [...existingCriticalShops];
  const processedShopIds = new Set(existingCriticalShops.map(shop => shop.shop_id));

  discountData.shops_without_backup.forEach((shop) => {
    if (processedShopIds.has(shop.shop_id)) {
      const existingShop = updatedCriticalShops.find(s => s.shop_id === shop.shop_id);
      if (existingShop) {
        existingShop.issues.push('Tidak ada backup diskon');
      }
    } else {
      updatedCriticalShops.push({
        shop_id: shop.shop_id,
        shop_name: shop.shop_name,
        issues: ['Tidak ada backup diskon']
      });
    }
  });

  return updatedCriticalShops;
}

async function fetchHealthData() {
  try {
    const [flashSaleResponse, discountResponse] = await Promise.all([
      fetch(API_ENDPOINTS.flashSale),
      fetch(API_ENDPOINTS.discount)
    ]);

    const flashSaleData = await flashSaleResponse.json();
    const discountData = await discountResponse.json();

    if (!flashSaleData.success || !discountData.success) {
      throw new Error('Gagal mengambil data dari API');
    }

    return { flashSaleData, discountData };
  } catch (error) {
    throw new Error(`Error fetching health data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function checkOpenAIKey(apiKey: string): Promise<OpenAICheckResult> {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('OpenAI API Error:', errorData);
      return {
        success: false,
        message: errorData.error?.message || 'Invalid API key'
      };
    }

    return {
      success: true,
      message: 'API key valid'
    };
  } catch (error) {
    console.error('OpenAI API Check Error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Terjadi kesalahan saat mengecek API key'
    };
  }
}

// Main Function
export async function checkShopHealth(): Promise<ShopHealthResponse> {
  try {
    const { flashSaleData, discountData } = await fetchHealthData();

    // Process Flash Sale issues
    const criticalShops = processFlashSaleIssues(flashSaleData.data);
    
    // Process Discount issues
    const updatedCriticalShops = processDiscountIssues(discountData.data, criticalShops);

    return {
      success: true,
      data: {
        flashSaleIssues: flashSaleData.data,
        discountIssues: discountData.data,
        summary: {
          totalIssues: updatedCriticalShops.length,
          criticalShops: updatedCriticalShops
        }
      },
      message: 'Berhasil memeriksa kesehatan toko'
    };

  } catch (error) {
    console.error('Error dalam pemeriksaan kesehatan toko:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Terjadi kesalahan yang tidak diketahui'
    };
  }
}
