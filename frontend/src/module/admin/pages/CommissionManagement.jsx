import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { Percent, Save, RefreshCw } from 'lucide-react';

const CommissionManagement = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [settings, setSettings] = useState({
        qrCommission: { hotel: 10, user: 20, admin: 70 },
        directCommission: { admin: 30, restaurant: 70 }
    });

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            setLoading(true);
            const response = await axios.get('/api/admin/commission-settings');
            if (response.data.success) {
                setSettings(response.data.data);
            }
        } catch (error) {
            console.error('Error fetching settings:', error);
            toast.error('Failed to load commission settings');
        } finally {
            setLoading(false);
        }
    };

    const handleQrChange = (field, value) => {
        const newValue = parseInt(value) || 0;
        setSettings(prev => ({
            ...prev,
            qrCommission: {
                ...prev.qrCommission,
                [field]: newValue
            }
        }));
    };

    const handleDirectChange = (field, value) => {
        const newValue = parseInt(value) || 0;
        setSettings(prev => ({
            ...prev,
            directCommission: {
                ...prev.directCommission,
                [field]: newValue
            }
        }));
    };

    const validateTotals = () => {
        const qrTotal = settings.qrCommission.hotel + settings.qrCommission.user + settings.qrCommission.admin;
        if (qrTotal !== 100) {
            toast.error(`QR Commission total must be 100% (Current: ${qrTotal}%)`);
            return false;
        }

        const directTotal = settings.directCommission.admin + settings.directCommission.restaurant;
        if (directTotal !== 100) {
            toast.error(`Direct Commission total must be 100% (Current: ${directTotal}%)`);
            return false;
        }

        return true;
    };

    const handleSave = async () => {
        if (!validateTotals()) return;

        try {
            setSaving(true);
            const response = await axios.put('/api/admin/commission-settings', settings);
            if (response.data.success) {
                toast.success('Commission settings updated successfully');
                setSettings(response.data.data);
            }
        } catch (error) {
            console.error('Error updating settings:', error);
            toast.error(error.response?.data?.message || 'Failed to update settings');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
            </div>
        );
    }

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Commission Management</h1>
                    <p className="text-gray-500 mt-1">Configure commission splits for different order types</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium shadow-sm"
                >
                    {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Changes
                </button>
            </div>

            <div className="grid gap-8">
                {/* QR Orders Section */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-100 rounded-lg">
                                <Percent className="w-5 h-5 text-purple-600" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-gray-800">QR / Hotel Orders</h2>
                                <p className="text-sm text-gray-500">Commission split for orders via Hotel QR codes</p>
                            </div>
                        </div>
                    </div>

                    <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-3">
                            <label className="block text-sm font-medium text-gray-700">Hotel Share (%)</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={settings.qrCommission.hotel}
                                    onChange={(e) => handleQrChange('hotel', e.target.value)}
                                    className="w-full pl-4 pr-8 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                                />
                                <span className="absolute right-3 top-2.5 text-gray-400">%</span>
                            </div>
                            <p className="text-xs text-gray-500">Paid to the hotel partner</p>
                        </div>

                        <div className="space-y-3">
                            <label className="block text-sm font-medium text-gray-700">User Cashback (%)</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={settings.qrCommission.user}
                                    onChange={(e) => handleQrChange('user', e.target.value)}
                                    className="w-full pl-4 pr-8 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                                />
                                <span className="absolute right-3 top-2.5 text-gray-400">%</span>
                            </div>
                            <p className="text-xs text-gray-500">Credited to user wallet</p>
                        </div>

                        <div className="space-y-3">
                            <label className="block text-sm font-medium text-gray-700">Admin/Platform (%)</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={settings.qrCommission.admin}
                                    onChange={(e) => handleQrChange('admin', e.target.value)}
                                    className="w-full pl-4 pr-8 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                                />
                                <span className="absolute right-3 top-2.5 text-gray-400">%</span>
                            </div>
                            <p className="text-xs text-gray-500">Platform revenue</p>
                        </div>
                    </div>

                    <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-600">Total Split</span>
                            <span className={`font-bold ${(settings.qrCommission.hotel + settings.qrCommission.user + settings.qrCommission.admin) === 100
                                    ? 'text-green-600'
                                    : 'text-red-600'
                                }`}>
                                {settings.qrCommission.hotel + settings.qrCommission.user + settings.qrCommission.admin}%
                            </span>
                        </div>
                    </div>
                </div>

                {/* Direct Orders Section */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-100 rounded-lg">
                                <Percent className="w-5 h-5 text-blue-600" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-gray-800">Direct Orders</h2>
                                <p className="text-sm text-gray-500">Commission split for direct restaurant orders</p>
                            </div>
                        </div>
                    </div>

                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3">
                            <label className="block text-sm font-medium text-gray-700">Restaurant Share (%)</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={settings.directCommission.restaurant}
                                    onChange={(e) => handleDirectChange('restaurant', e.target.value)}
                                    className="w-full pl-4 pr-8 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                                />
                                <span className="absolute right-3 top-2.5 text-gray-400">%</span>
                            </div>
                            <p className="text-xs text-gray-500">Paid to the restaurant</p>
                        </div>

                        <div className="space-y-3">
                            <label className="block text-sm font-medium text-gray-700">Admin/Platform (%)</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={settings.directCommission.admin}
                                    onChange={(e) => handleDirectChange('admin', e.target.value)}
                                    className="w-full pl-4 pr-8 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                                />
                                <span className="absolute right-3 top-2.5 text-gray-400">%</span>
                            </div>
                            <p className="text-xs text-gray-500">Platform revenue</p>
                        </div>
                    </div>

                    <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-600">Total Split</span>
                            <span className={`font-bold ${(settings.directCommission.restaurant + settings.directCommission.admin) === 100
                                    ? 'text-green-600'
                                    : 'text-red-600'
                                }`}>
                                {settings.directCommission.restaurant + settings.directCommission.admin}%
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CommissionManagement;
