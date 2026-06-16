import { useState, useEffect, useCallback, useRef } from 'react';
import { Product, ProductFilters, Paged, Brand, Category, SavedView, ProductStats, DEFAULT_FILTERS } from '../api/types';
import { productsApi } from '../api/products';

export function useProducts() {
  const [products, setProducts]     = useState<Paged<Product> | null>(null);
  const [stats, setStats]           = useState<ProductStats | null>(null);
  const [brands, setBrands]         = useState<Brand[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [filters, setFilters]       = useState<ProductFilters>(DEFAULT_FILTERS);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchProducts = useCallback(async (f: ProductFilters) => {
    setLoading(true); setError(null);
    try {
      const data = await productsApi.list(f);
      setProducts(data);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  const fetchMeta = useCallback(async () => {
    // Each call is independent — failures don't block others
    const [b, c, v, st] = await Promise.allSettled([
      productsApi.listBrands(),
      productsApi.listCategories(),
      productsApi.listViews(),
      productsApi.stats(),
    ]);
    if (b.status === 'fulfilled' && Array.isArray(b.value)) setBrands(b.value);
    if (c.status === 'fulfilled' && Array.isArray(c.value)) setCategories(c.value);
    if (v.status === 'fulfilled' && Array.isArray(v.value)) setSavedViews(v.value);
    if (st.status === 'fulfilled' && st.value) setStats(st.value as any);
  }, []);

  useEffect(() => { fetchMeta(); }, [fetchMeta]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchProducts(filters), filters.search ? 300 : 0);
    return () => clearTimeout(debounceRef.current);
  }, [filters, fetchProducts]);

  const updateFilters = useCallback((patch: Partial<ProductFilters>) => {
    setFilters(prev => ({ ...prev, ...patch, page: patch.page ?? 1 }));
    setSelected(new Set());
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setSelected(new Set());
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (!products) return;
    setSelected(prev =>
      prev.size === products.items.length
        ? new Set()
        : new Set(products.items.map(p => p.id))
    );
  }, [products]);

  const refresh = useCallback(() => fetchProducts(filters), [filters, fetchProducts]);

  const bulkUpdate = useCallback(async (data: any) => {
    await productsApi.bulkUpdate([...selected], data);
    setSelected(new Set());
    await refresh();
    await fetchMeta();
  }, [selected, refresh, fetchMeta]);

  const deleteProduct = useCallback(async (id: string) => {
    await productsApi.remove(id);
    await refresh();
  }, [refresh]);

  const updateProduct = useCallback(async (id: string, data: any) => {
    await productsApi.update(id, data);
    await refresh();
  }, [refresh]);

  const applyView = useCallback((view: SavedView) => {
    setFilters({ ...DEFAULT_FILTERS, ...view.filters });
  }, []);

  const saveView = useCallback(async (name: string, columns: string[]) => {
    const view = await productsApi.createView({ name, filters, columns, sortBy: filters.sortBy, sortDir: filters.sortDir });
    setSavedViews(prev => [...prev, view]);
  }, [filters]);

  const deleteView = useCallback(async (id: string) => {
    await productsApi.deleteView(id);
    setSavedViews(prev => prev.filter(v => v.id !== id));
  }, []);

  return {
    products, stats, brands, categories, savedViews,
    filters, loading, error, selected,
    updateFilters, resetFilters, refresh,
    toggleSelect, selectAll,
    bulkUpdate, deleteProduct, updateProduct,
    applyView, saveView, deleteView,
    fetchMeta,
  };
}
