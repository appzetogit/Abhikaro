import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Hotel } from 'lucide-react';
import { API_BASE_URL } from '@/lib/api/config';
import axios from 'axios';
import { toast } from 'sonner';
import AnimatedPage from '../components/AnimatedPage';

export default function HotelMenuLanding() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const validateQR = async () => {
            try {
                // Get hotel reference from URL parameter
                const hotelRef = searchParams.get('ref');

                if (!hotelRef) {
                    setError('Invalid QR code. No hotel reference found.');
                    setLoading(false);
                    return;
                }

                console.log('🔍 Validating hotel QR code:', hotelRef);

                // Validate QR code with backend
                const response = await axios.get(
                    `${API_BASE_URL}/hotel/public/qr/${hotelRef}`
                );

                if (response.data.success && response.data.data.hotel) {
                    const hotelData = response.data.data.hotel;
                    console.log('✅ Hotel validated:', hotelData);

                    // Store hotel reference in sessionStorage (session-scoped)
                    sessionStorage.setItem('hotelReference', hotelData.hotelId);
                    sessionStorage.setItem('hotelReferenceName', hotelData.hotelName);
                    sessionStorage.setItem('isHotelOrder', 'true');

                    toast.success(`Welcome to ${hotelData.hotelName}!`);

                    // Directly open home after activating hotel reference
                    navigate('/', { replace: true });
                } else {
                    setError('Hotel not found or inactive');
                }
            } catch (err) {
                console.error('❌ Error validating QR code:', err);
                setError(err.response?.data?.message || 'Failed to validate QR code');
            } finally {
                setLoading(false);
            }
        };

        validateQR();
    }, [searchParams, navigate]);

    if (loading) {
        return (
            <AnimatedPage className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-yellow-50">
                <div className="text-center">
                    <Loader2 className="h-12 w-12 animate-spin text-orange-500 mx-auto mb-4" />
                    <p className="text-lg font-medium text-gray-700">Opening menu...</p>
                </div>
            </AnimatedPage>
        );
    }

    if (error) {
        return (
            <AnimatedPage className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 px-4">
                <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Hotel className="h-8 w-8 text-red-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Invalid QR Code</h2>
                    <p className="text-gray-600 mb-6">{error}</p>
                    <button
                        onClick={() => navigate('/')}
                        className="w-full bg-gradient-to-r from-orange-500 to-red-500 text-white py-3 rounded-lg font-semibold hover:from-orange-600 hover:to-red-600 transition-all"
                    >
                        Go to Home
                    </button>
                </div>
            </AnimatedPage>
        );
    }

    // If we reached here without error, navigation already happened.
    return null;
}
