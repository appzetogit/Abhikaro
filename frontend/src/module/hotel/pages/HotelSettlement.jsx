import { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/lib/api/config';
import axios from 'axios';
import { toast } from 'sonner';
import { Loader2, Wallet, ArrowLeft, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import BottomNavigation from '../components/BottomNavigation';

export default function HotelSettlement() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [summary, setSummary] = useState(null);

    const fetchSummary = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('hotel_accessToken');
            const response = await axios.get(
                `${API_BASE_URL}/hotel/orders/settlement-summary`,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            if (response.data.success) {
                setSummary(response.data.data);
            }
        } catch (error) {
            console.error('Error fetching settlement summary:', error);
            toast.error('Failed to fetch settlement summary');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSummary();
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                <Loader2 className="h-12 w-12 animate-spin text-orange-500" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-6 pb-24">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-full transition-colors"
                    >
                        <ArrowLeft className="h-6 w-6 text-gray-600 dark:text-gray-400" />
                    </button>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <Wallet className="h-8 w-8 text-orange-500" />
                            Settlement Summary
                        </h1>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            Track your COD order settlements with Abhikaro
                        </p>
                    </div>
                </div>

                {/* Main Stats */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Cash Collected</p>
                        <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">₹{summary?.totalCashCollected || 0}</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 text-red-600">
                        <p className="text-sm font-medium opacity-80">Total Commission Due</p>
                        <p className="text-3xl font-bold mt-2">₹{summary?.adminCommissionDue || 0}</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 text-green-600">
                        <p className="text-sm font-medium opacity-80">Settlement Paid</p>
                        <p className="text-3xl font-bold mt-2">₹{summary?.settlementPaid || 0}</p>
                    </div>
                    <div className="bg-orange-500 text-white p-6 rounded-2xl shadow-lg transform hover:scale-105 transition-transform cursor-default">
                        <p className="text-sm font-medium opacity-90">Remaining to Pay</p>
                        <p className="text-3xl font-bold mt-2">₹{summary?.remainingSettlement || 0}</p>
                    </div>
                </div>

                {/* Notice Card */}
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-2xl p-6 flex items-start gap-4">
                    <AlertCircle className="h-6 w-6 text-blue-600 mt-1 flex-shrink-0" />
                    <div>
                        <h3 className="text-lg font-bold text-blue-900 dark:text-blue-300">Important Information</h3>
                        <p className="mt-2 text-blue-800 dark:text-blue-400 leading-relaxed font-medium">
                            Cash collected from hotel guests for QR orders belongs to the hotel.
                            However, the platform commission (Admin Share) must be settled periodically.
                            Please contact Abhikaro support for the settlement payment link.
                        </p>
                        <button className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors">
                            Contact Support
                        </button>
                    </div>
                </div>

                {/* Status List (Placeholder/Future) */}
                <div className="mt-12 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Recent Settlements</h2>
                        <Clock className="h-5 w-5 text-gray-400" />
                    </div>
                    <div className="p-12 text-center">
                        <Wallet className="h-12 w-12 text-gray-200 dark:text-gray-700 mx-auto mb-4" />
                        <p className="text-gray-500 dark:text-gray-400">Individual settlement transaction history will appear here.</p>
                    </div>
                </div>
            </div>

            <BottomNavigation />
        </div>
    );
}
