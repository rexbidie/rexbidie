import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import axiosInstance from '../utils/axiosInstance';
import { useLocation } from "react-router-dom";
import { useAuth } from '../contexts/AuthContext';

export const useAuctions = () => {
    const location = useLocation();
    const { user } = useAuth();
    const userCurrency = user?.currency || 'EUR';
    const [auctions, setAuctions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [pagination, setPagination] = useState(null);
    const [filters, setFilters] = useState({
        categories: [],
        status: 'active',
        search: '',
        priceMin: '',
        priceMax: '',
        location: '',
        sortBy: 'endDate',
        sortOrder: 'asc',
        currency: `${userCurrency}`,
        isFeatured: '',
        auctionType: '',
        allowOffers: ''
    });

    const cleanFilters = (currentFilters) => {
        return Object.fromEntries(
            Object.entries(currentFilters).filter(([key, value]) => {
                if (key === 'categories') {
                    return Array.isArray(value) && value.length > 0;
                }
                return value !== '' && value !== null && value !== undefined && value !== false;
            })
        );
    };

    const fetchAuctions = async (page = 1, limit = 21, currentFilters = {}) => {
        const loadingState = page > 1 ? setLoadingMore : setLoading;
        loadingState(true);

        try {
            const clean = cleanFilters(currentFilters);

            const params = new URLSearchParams({
                page: page.toString(),
                limit: limit.toString(),
                currency: `${userCurrency}`,
                view: 'card', // compact listing data for cards
                ...Object.fromEntries(
                    Object.entries(clean).filter(([key]) => key !== 'categories')
                )
            });

            if (clean.categories && Array.isArray(clean.categories) && clean.categories.length > 0) {
                clean.categories.forEach(cat => {
                    params.append('categories', cat);
                });
            }

            const queryString = params.toString();
            const { data } = await axiosInstance.get(`/api/v1/auctions?${queryString}`);

            if (data.success) {
                if (page > 1) {
                    setAuctions(prev => [...prev, ...data.data.auctions]);
                } else {
                    setAuctions(data.data.auctions);
                }
                setPagination(data.data.pagination);
            }
        } catch (error) {
            console.error('Error fetching auctions:', error);
            toast.error('Failed to load auctions');
        } finally {
            loadingState(false);
        }
    };

    const loadMoreAuctions = async () => {
        if (
            loadingMore ||
            !pagination ||
            pagination.currentPage >= pagination.totalPages
        ) {
            return;
        }
        const nextPage = pagination.currentPage + 1;
        await fetchAuctions(nextPage, 21, filters);
    };

    // ============ NEW: goToPage — replaces list (no append) ============
    const goToPage = async (page) => {
        if (!pagination) return;
        if (page < 1 || page > pagination.totalPages) return;
        if (page === pagination.currentPage) return;

        setLoading(true);
        try {
            const clean = cleanFilters(filters);
            const params = new URLSearchParams({
                page: page.toString(),
                limit: "21",
                currency: `${userCurrency}`,
                view: 'card', // compact listing data for cards
                ...Object.fromEntries(
                    Object.entries(clean).filter(([key]) => key !== 'categories')
                )
            });
            if (clean.categories?.length > 0) {
                clean.categories.forEach(cat => params.append('categories', cat));
            }

            const { data } = await axiosInstance.get(
                `/api/v1/auctions?${params.toString()}`
            );

            if (data.success) {
                setAuctions(data.data.auctions);
                setPagination(data.data.pagination);

                // Update URL → back button returns to this page
                const searchParams = new URLSearchParams(window.location.search);
                if (page > 1) searchParams.set('page', page.toString());
                else searchParams.delete('page');
                window.history.replaceState(
                    null,
                    '',
                    `${window.location.pathname}?${searchParams.toString()}`
                );

                window.scrollTo({ top: 0, behavior: "smooth" });
            }
        } catch (error) {
            console.error('Error fetching page:', error);
            toast.error('Failed to load page');
        } finally {
            setLoading(false);
        }
    };
    // ===================================================================

    const updateFilters = (newFilters) => {
        const updatedFilters = { ...filters, ...newFilters };
        setFilters(updatedFilters);
        fetchAuctions(1, 21, updatedFilters);
    };

    useEffect(() => {
        const searchParams = new URLSearchParams(location.search);
        const pageParam = parseInt(searchParams.get('page'), 10) || 1;

        let categories = [];
        const categoriesParam = searchParams.get('categories');
        if (categoriesParam) {
            categories = categoriesParam.split(',').filter(cat => cat.trim() !== '');
        }

        const urlFilters = {
            categories,
            status: searchParams.get('status') || 'active',
            search: searchParams.get('search') || '',
            priceMin: searchParams.get('priceMin') || '',
            priceMax: searchParams.get('priceMax') || '',
            location: searchParams.get('location') || '',
            auctionType: searchParams.get('auctionType') || '',
            allowOffers: searchParams.get('allowOffers') || '',
            sortBy: searchParams.get('sortBy') || 'endDate',
            sortOrder: searchParams.get('sortOrder') || 'asc'
        };

        const cleanUrlFilters = cleanFilters(urlFilters);

        if (Object.keys(cleanUrlFilters).length > 0) {
            setFilters(urlFilters);
            fetchAuctions(pageParam, 21, urlFilters);
        } else {
            fetchAuctions(pageParam, 21, filters);
        }
    }, [location.search]);

    return {
        auctions,
        loading,
        loadingMore,
        pagination,
        filters,
        fetchAuctions,
        loadMoreAuctions,
        goToPage,
        updateFilters
    };
};