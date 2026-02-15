import { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/lib/api/config';
import axios from 'axios';
import { toast } from 'sonner';
import { Loader2, Package, RefreshCw } from 'lucide-react';
import HotelOrderCard from '../components/HotelOrderCard';
import BottomNavigation from '../components/BottomNavigation';

export default function HotelOrders() {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState(null);
    const [filter, setFilter] = useState('all'); // all | pending | confirmed | delivered | cancelled
    const [refreshing, setRefreshing] = useState(false);

    const fetchOrders = async (showRefreshIndicator = false) => {
        try {
            if (showRefreshIndicator) {
                setRefreshing(true);
            } else {
                setLoading(true);
            }

            const token = localStorage.getItem('hotel_accessToken');
            const response = await axios.get(
                `${API_BASE_URL}/hotel/orders`,
                {
                    headers: { Authorization: `Bearer ${token}` },
                    params: filter !== 'all' ? { status: filter } : {}
                }
            );

            if (response.data.success) {
                setOrders(response.data.data.orders);
            }
        } catch (error) {
            console.error('Error fetching orders:', error);
            toast.error('Failed to fetch orders');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const fetchStats = async () => {
        try {
            const token = localStorage.getItem('hotel_accessToken');
            const response = await axios.get(
                `${API_BASE_URL}/hotel/orders/stats`,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            if (response.data.success) {
                setStats(response.data.data.stats);
            }
        } catch (error) {
            console.error('Error fetching stats:', error);
        }
    };

    useEffect(() => {
        fetchOrders();
        fetchStats();
    }, [filter]);

    const handleOrderUpdate = () => {
        fetchOrders(true);
        fetchStats();
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                <div className="text-center">
                    <Loader2 className="h-12 w-12 animate-spin text-orange-500 mx-auto mb-4" />
                    <p className="text-lg font-medium text-gray-700 dark:text-gray-300">Loading orders...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-6 pb-24">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <Package className="h-8 w-8 text-orange-500" />
                            Hotel Orders
                        </h1>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            Manage incoming orders from hotel guests
                        </p>
                    </div>

                    <button
                        onClick={() => fetchOrders(true)}
                        disabled={refreshing}
                        className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                        <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                        <span className="text-sm font-medium">Refresh</span>
                    </button>
                </div>

                {/* Stats Cards */}
                {stats && (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Pending</p>
                            <p className="text-2xl font-bold text-orange-600 dark:text-orange-400 mt-1">{stats.pending}</p>
                        </div>
                        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Confirmed</p>
                            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">{stats.confirmed}</p>
                        </div>
                        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Completed</p>
                            <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">{stats.completed}</p>
                        </div>
                        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Cancelled</p>
                            <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">{stats.cancelled}</p>
                        </div>
                        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Revenue</p>
                            <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">₹{stats.totalRevenue.toFixed(0)}</p>
                        </div>
                    </div>
                )}


                {/* Orders List */}
                {orders.length === 0 ? (
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-12 text-center border border-gray-200 dark:border-gray-700">
                        <Package className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No orders found</h3>
                        <p className="text-gray-500 dark:text-gray-400">
                            {filter === 'all'
                                ? 'No orders have been placed yet'
                                : `No ${filter} orders at the moment`}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {orders.map((order) => (
                            <HotelOrderCard
                                key={order._id}
                                order={order}
                                onUpdate={handleOrderUpdate}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Bottom Navigation */}
            <BottomNavigation />
        </div>
    );
}
