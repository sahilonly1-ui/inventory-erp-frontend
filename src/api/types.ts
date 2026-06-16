export interface User { id: string; email: string; fullName: string; roles: string[]; permissions: string[]; }

export type ProductStatus = 'ACTIVE' | 'INACTIVE' | 'DISCONTINUED' | 'OPEN_BOX_ONLY' | 'BLOCKED';

export interface Brand { id: string; name: string; createdAt: string; updatedAt: string; }
export interface Category { id: string; name: string; parentId?: string; children?: Category[]; }
export interface Vendor { id: string; name: string; code: string; email?: string; phone?: string; }
export interface ProductAttribute { id: string; key: string; value: string; }
export interface StockLevel { id: string; warehouseId: string; quantity: number; warehouse?: Warehouse; }

export interface Product {
  id: string;
  ean: string;
  model: string;
  brand: string;
  brandId?: string;
  brandRef?: Brand;
  categoryId?: string;
  category?: Category;
  vendorId?: string;
  vendor?: Vendor;
  description?: string;
  status: ProductStatus;
  costPrice: string;
  sellingPrice: string;
  gstRate: string;
  hsnCode?: string;
  imeiRequired: boolean;
  serialRequired: boolean;
  minStock: number;
  images: string[];
  attributes: ProductAttribute[];
  stockLevels: StockLevel[];
  createdAt: string;
  updatedAt: string;
}

export interface ProductStats { total: number; active: number; lowStock: number; outOfStock: number; }

export interface Warehouse { id: string; name: string; code: string; }
export interface StockRow { productId: string; warehouseId: string; warehouseName?: string; quantity: number; }
export interface Paged<T> { items: T[]; page: number; limit: number; total: number; totalPages: number; }
export interface ImeiRow { id: string; imei1: string; imei2: string | null; status: string; productId: string; warehouseId: string; }

export interface SavedView {
  id: string; name: string;
  filters: Record<string, any>;
  columns: string[];
  sortBy?: string; sortDir?: string;
}

export interface ProductFilters {
  search?: string;
  brand?: string[];
  brandId?: string[];
  categoryId?: string[];
  vendorId?: string[];
  warehouseId?: string;
  status?: ProductStatus[];
  imeiRequired?: boolean;
  costPriceMin?: number; costPriceMax?: number;
  sellingPriceMin?: number; sellingPriceMax?: number;
  createdFrom?: string; createdTo?: string;
  lowStock?: boolean; outOfStock?: boolean;
  page: number; limit: number;
  sortBy?: string; sortDir?: 'asc' | 'desc';
}

export const DEFAULT_FILTERS: ProductFilters = { page: 1, limit: 50, sortDir: 'desc' };
