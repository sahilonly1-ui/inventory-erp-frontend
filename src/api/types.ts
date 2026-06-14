export interface User { id: string; email: string; fullName: string; roles: string[]; permissions: string[]; }
export interface Product { id: string; ean: string; sku: string; model: string; brand: string; imeiRequired: boolean; sellingPrice: string; costPrice: string; }
export interface Warehouse { id: string; name: string; code: string; }
export interface StockRow { productId: string; warehouseId: string; warehouseName?: string; quantity: number; }
export interface Paged<T> { items: T[]; page: number; limit: number; total: number; totalPages: number; }
export interface ImeiRow { id: string; imei1: string; imei2: string | null; status: string; productId: string; warehouseId: string; }
