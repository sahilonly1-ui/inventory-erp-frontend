import { api } from './client';
import { Product, ProductFilters, Paged, Brand, Category, SavedView, ProductStats } from './types';

// Build query string from filters
function qs(filters: Partial<ProductFilters>): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    if (Array.isArray(v)) v.forEach(x => params.append(k, String(x)));
    else params.set(k, String(v));
  });
  return params.toString() ? '?' + params.toString() : '';
}

export const productsApi = {
  list: (f: Partial<ProductFilters>)      => api<Paged<Product>>(`/products${qs(f)}`),
  get:  (id: string)                       => api<Product & { history: any[] }>(`/products/${id}`),
  create:(data: any)                       => api<Product>('/products', { method: 'POST', body: JSON.stringify(data) }),
  update:(id: string, data: any)           => api<Product>(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove:(id: string)                      => api<void>(`/products/${id}`, { method: 'DELETE' }),
  restore:(id: string)                     => api<Product>(`/products/${id}/restore`, { method: 'POST' }),
  bulkUpdate:(ids: string[], data: any)    => api<{updated:number}>('/products/bulk', { method: 'POST', body: JSON.stringify({ ids, ...data }) }),
  stats:()                                 => api<ProductStats>('/products/stats'),
  setAttributes:(id: string, attributes: {key:string;value:string}[]) =>
    api(`/products/${id}/attributes`, { method: 'POST', body: JSON.stringify({ attributes }) }),

  // brands
  listBrands:  ()                          => api<Brand[]>('/products/brands/list'),
  createBrand: (name: string)              => api<Brand>('/products/brands', { method: 'POST', body: JSON.stringify({ name }) }),
  updateBrand: (id: string, name: string)  => api<Brand>(`/products/brands/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  deleteBrand: (id: string)                => api(`/products/brands/${id}`, { method: 'DELETE' }),
  mergeBrands: (sourceIds: string[], targetId: string) =>
    api('/products/brands/merge', { method: 'POST', body: JSON.stringify({ sourceIds, targetId }) }),

  // categories
  listCategories:   ()                         => api<Category[]>('/products/categories'),
  createCategory:   (name: string, parentId?: string) =>
    api<Category>('/products/categories', { method: 'POST', body: JSON.stringify({ name, parentId }) }),
  updateCategory:   (id: string, data: any)    => api<Category>(`/products/categories/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteCategory:   (id: string)               => api(`/products/categories/${id}`, { method: 'DELETE' }),

  // saved views
  listViews:   ()                              => api<SavedView[]>('/products/views'),
  createView:  (data: any)                     => api<SavedView>('/products/views', { method: 'POST', body: JSON.stringify(data) }),
  updateView:  (id: string, data: any)         => api<SavedView>(`/products/views/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteView:  (id: string)                    => api(`/products/views/${id}`, { method: 'DELETE' }),
};
