import { useState } from 'react';
import { hotelAPI } from '@/lib/api';
import { toast } from 'sonner';
import { User, Phone, MapPin, CreditCard, Package, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

export default function HotelOrderCard({ order, onUpdate }) {
    const [accepting, setAccepting] = useState(false);

    const getStatusBadge = () => {
        const statusConfig = {
            pending: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-800 dark:text-yellow-400', label: 'Pending' },
            confirmed: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-800 dark:text-blue-400', label: 'Confirmed' },
            delivered: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-800 dark:text-green-400', label: 'Completed' },
            cancelled: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-800 dark:text-red-400', label: 'Cancelled' }
        };

        const config = statusConfig[order.status] || statusConfig.pending;

        return (
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${config.bg} ${config.text}`}>
                {config.label}
            </span>
        );
    };

    const getPaymentMethodBadge = () => {
        const method = order.payment.method;
        const status = order.payment.status;

        if (method === 'pay_at_hotel') {
            return (
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-400 flex items-center gap-1">
                    <CreditCard className="h-3 w-3" />
                    Pay at Hotel
                </span>
            );
        }

        if (method === 'cash') {
            return (
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 flex items-center gap-1">
                    <CreditCard className="h-3 w-3" />
                    Cash on Delivery
                </span>
            );
        }

        return (
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-purple-100 text-purple-800'} dark:bg-purple-900/30 dark:text-purple-400 flex items-center gap-1`}>
                <CreditCard className="h-3 w-3" />
                {method.toUpperCase()} {status === 'completed' ? '(Paid)' : ''}
            </span>
        );
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg transition-shadow">
            {/* Header */}
            <div className="bg-gradient-to-r from-orange-500 to-red-500 px-6 py-4 flex items-center justify-between">
                <div>
                    <p className="text-white font-semibold text-lg">Order #{order.orderId}</p>
                    <p className="text-orange-100 text-sm flex items-center gap-1 mt-1">
                        <Clock className="h-3 w-3" />
                        {format(new Date(order.createdAt), 'MMM dd, yyyy · hh:mm a')}
                    </p>
                </div>
                {getStatusBadge()}
            </div>

            <div className="p-6">
                {/* User Info */}
                <div className="flex items-start gap-4 mb-6 pb-6 border-b border-gray-200 dark:border-gray-700">
                    {order.userId?.profileImage?.url ? (
                        <img
                            src={order.userId.profileImage.url}
                            alt={order.userId.name}
                            className="h-16 w-16 rounded-full object-cover border-2 border-orange-500"
                        />
                    ) : (
                        <div className="h-16 w-16 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                            <User className="h-8 w-8 text-orange-600 dark:text-orange-400" />
                        </div>
                    )}

                    <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            {order.userId?.name || 'Guest User'}
                        </h3>

                        <div className="mt-2 space-y-1">
                            {order.userId?.phone && (
                                <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
                                    <Phone className="h-4 w-4" />
                                    {order.userId.phone}
                                </p>
                            )}

                            {order.roomNumber && (
                                <p className="text-sm font-medium text-orange-600 dark:text-orange-400 flex items-center gap-2">
                                    <MapPin className="h-4 w-4" />
                                    Room: {order.roomNumber}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="text-right">
                        {getPaymentMethodBadge()}
                        <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-2">
                            ₹{order.pricing.total.toFixed(0)}
                        </p>
                    </div>
                </div>

                {/* Order Items */}
                <div className="mb-6">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        Order Items
                    </h4>
                    <div className="space-y-2">
                        {order.items.map((item, index) => (
                            <div key={index} className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                <div className="flex items-center gap-3">
                                    <span className={`w-2 h-2 rounded-full ${item.isVeg ? 'bg-green-500' : 'bg-red-500'}`} />
                                    <div>
                                        <p className="text-sm font-medium text-gray-900 dark:text-white">{item.name}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">Qty: {item.quantity}</p>
                                    </div>
                                </div>
                                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                    ₹{(item.price * item.quantity).toFixed(0)}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Action Buttons - Show Collect Cash if payment is pending */}
                {(order.status?.toLowerCase() !== 'cancelled') && (
                    <div className="flex flex-col gap-3 mt-4">
                        {(['pay_at_hotel', 'cash'].includes(order.payment.method) && order.payment.status !== 'completed') && (
                            <button
                                onClick={async () => {
                                    try {
                                        setAccepting(true);
                                        const response = await hotelAPI.collectPayment(order.orderId);
                                        if (response.data.success) {
                                            toast.success('Cash Collected! Payment status updated.');
                                            onUpdate();
                                        }
                                    } catch (error) {
                                        console.error('Error collecting payment:', error);
                                        toast.error(error.response?.data?.message || 'Failed to collect payment');
                                    } finally {
                                        setAccepting(false);
                                    }
                                }}
                                disabled={accepting}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-300 text-white rounded-lg font-semibold transition-colors shadow-sm"
                            >
                                {accepting ? (
                                    <>
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                        Processing...
                                    </>
                                ) : (
                                    <>
                                        <div className="flex flex-col items-start leading-tight">
                                            <span className="text-sm font-bold">Collect Cash</span>
                                            <span className="text-xs opacity-80 font-normal">Settle Admin Share Later</span>
                                        </div>
                                        <CheckCircle className="h-5 w-5 ml-auto" />
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                )}

                {/* Cancellation Reason */}
                {order.status === 'cancelled' && order.cancellationReason && (
                    <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <p className="text-sm font-medium text-red-800 dark:text-red-400">
                            Rejection Reason: {order.cancellationReason}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
