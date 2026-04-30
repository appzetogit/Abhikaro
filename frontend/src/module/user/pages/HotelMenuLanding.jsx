import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Hotel } from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'sonner';
import AnimatedPage from '../components/AnimatedPage';
import { log } from '@/lib/utils/logger';
import { getCachedResponse, setCachedResponse } from '@/lib/utils/apiResponseCache';

export default function HotelMenuLanding() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [hotelData, setHotelData] = useState(null);
    const [askingLocation, setAskingLocation] = useState(false);
    const [gettingLocation, setGettingLocation] = useState(false);

    const saveUserLocation = (coords) => {
        const latitude = Number(coords?.latitude);
        const longitude = Number(coords?.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            throw new Error("Invalid coordinates");
        }

        const userLocation = {
            latitude,
            longitude,
            city: "",
            state: "",
            area: "",
            address: "Current location",
            formattedAddress: "Current location",
            timestamp: Date.now(),
        };
        localStorage.setItem("userLocation", JSON.stringify(userLocation));
        localStorage.setItem("userLocation_manualOverride", "true");
    };

    const handleGetCurrentLocation = async () => {
        if (gettingLocation) return;

        if (!("geolocation" in navigator)) {
            toast.error("Location is not supported on this device/browser.");
            return;
        }

        setGettingLocation(true);
        try {
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 15000,
                    maximumAge: 0,
                });
            });

            saveUserLocation(position.coords);
            toast.success("Location saved.");
            navigate('/', { replace: true });
        } catch (err) {
            const code = err?.code;
            const msg =
                code === 1
                    ? "Please allow location access to continue."
                    : code === 2
                        ? "Unable to detect location. Please try again."
                        : code === 3
                            ? "Location request timed out. Please try again."
                            : "Failed to get location. Please try again.";
            toast.error(msg);
        } finally {
            setGettingLocation(false);
        }
    };

    useEffect(() => {
        const validateQR = async () => {
            try {
                // Get hotel reference from URL parameter
                const hotelRef = searchParams.get('ref') || searchParams.get('hotelId') || searchParams.get('id');

                if (!hotelRef) {
                    setError('Invalid QR code. No hotel reference found.');
                    setLoading(false);
                    return;
                }

                log.debug('🔍 Validating hotel QR code:', hotelRef);

                const cacheKey = `GET:/hotel/public/qr/${hotelRef}`;
                const cached = getCachedResponse(cacheKey, 5 * 60 * 1000); // 5 minutes
                if (cached) {
                    if (cached?.success && cached?.data?.hotel) {
                        const validatedHotel = cached.data.hotel;
                        sessionStorage.setItem('hotelReference', validatedHotel.hotelId);
                        sessionStorage.setItem('hotelReferenceName', validatedHotel.hotelName);
                        sessionStorage.setItem('isHotelOrder', 'true');
                        setHotelData(validatedHotel);
                        setAskingLocation(true);
                        toast.success(`Welcome to ${validatedHotel.hotelName}!`);
                        return;
                    }
                }

                // Validate QR code with backend (uses configured api client)
                const response = await api.get(`/hotel/public/qr/${hotelRef}`);
                if (response?.data) {
                    setCachedResponse(cacheKey, response.data);
                }

                if (response.data.success && response.data.data.hotel) {
                    const validatedHotel = response.data.data.hotel;
                    log.debug('✅ Hotel validated:', validatedHotel);

                    // Store hotel reference in sessionStorage (session-scoped)
                    sessionStorage.setItem('hotelReference', validatedHotel.hotelId);
                    sessionStorage.setItem('hotelReferenceName', validatedHotel.hotelName);
                    sessionStorage.setItem('isHotelOrder', 'true');

                    setHotelData(validatedHotel);
                    setAskingLocation(true);
                    toast.success(`Welcome to ${validatedHotel.hotelName}!`);
                } else {
                    setError('Hotel not found or inactive');
                }
            } catch (err) {
                log.warn('❌ Error validating QR code:', err);
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

    if (askingLocation) {
        return (
            <AnimatedPage className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-yellow-50 px-4">
                <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
                    <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Hotel className="h-8 w-8 text-orange-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">
                        Allow Location to Continue
                    </h2>
                    <p className="text-gray-600 mb-6">
                        {hotelData?.hotelName
                            ? `You’re opening the menu for ${hotelData.hotelName}.`
                            : "You’re opening the hotel menu."}{" "}
                        Please share your current location to proceed.
                    </p>

                    <button
                        onClick={handleGetCurrentLocation}
                        disabled={gettingLocation}
                        className="w-full bg-gradient-to-r from-orange-500 to-red-500 text-white py-3 rounded-lg font-semibold hover:from-orange-600 hover:to-red-600 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {gettingLocation ? (
                            <>
                                <Loader2 className="h-5 w-5 animate-spin" />
                                Getting location...
                            </>
                        ) : (
                            "Use Current Location"
                        )}
                    </button>

                    <p className="text-xs text-gray-500 mt-4">
                        Location is required to continue.
                    </p>
                </div>
            </AnimatedPage>
        );
    }

    // Fallback: should not happen, but keep user on safe screen.
    return (
        <AnimatedPage className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-yellow-50 px-4">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
                <p className="text-gray-700">Preparing…</p>
            </div>
        </AnimatedPage>
    );
}
