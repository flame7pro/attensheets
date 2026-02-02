// QRAttendanceModal.tsx - FULLY RESPONSIVE WITH IMPROVED QR CODE ZOOM

import React, { useState, useEffect, useRef } from 'react';
import { X, QrCode, Users, Clock, Zap, CheckCircle, Calendar, Maximize2, Minimize2 } from 'lucide-react';
import QRCode from 'qrcode';

interface QRAttendanceModalProps {
    classId: number;
    className: string;
    totalStudents: number;
    currentDate: string; // YYYY-MM-DD format
    onClose: () => void;
}

export const QRAttendanceModal: React.FC<QRAttendanceModalProps> = ({
    classId,
    className,
    totalStudents,
    currentDate,
    onClose,
}) => {
    const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
    const [currentCode, setCurrentCode] = useState<string>('');
    const [scannedCount, setScannedCount] = useState<number>(0);
    const [rotationInterval, setRotationInterval] = useState<number>(5);
    const [isActive, setIsActive] = useState<boolean>(false);
    const [isStopping, setIsStopping] = useState<boolean>(false);
    const [timeLeft, setTimeLeft] = useState(5);
    const [sessionNumber, setSessionNumber] = useState<number>(1);
    const [isZoomed, setIsZoomed] = useState<boolean>(false);
    const [notification, setNotification] = useState<{
        type: 'success' | 'error' | 'info';
        message: string;
    } | null>(null);

    // Refs for timing
    const clientStartTime = useRef<number>(0);
    const intervalDuration = useRef<number>(5);

    const showNotification = (type: 'success' | 'error' | 'info', message: string) => {
        setNotification({ type, message });
        setTimeout(() => setNotification(null), 5000);
    };

    const generateQRCode = async (code: string) => {
        const qrData = {
            class_id: String(classId),
            date: currentDate,
            code: code,
        };

        const qrDataString = JSON.stringify(qrData);
        const url = await QRCode.toDataURL(qrDataString, {
            width: 400,
            margin: 2,
            color: { dark: '#059669', light: '#ffffff' },
        });

        setQrCodeUrl(url);
    };

    const startSession = async () => {
        console.log('[QR MODAL] Starting QR session for date:', currentDate);
        console.log('[QR MODAL] 🎚️ User selected interval:', rotationInterval);

        try {
            const token = localStorage.getItem('access_token');
            if (!token) {
                showNotification('error', 'Please login again');
                return;
            }

            const response = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL}/qr/start-session`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        class_id: classId,
                        date: currentDate,
                        rotation_interval: rotationInterval,
                    }),
                }
            );

            if (!response.ok) {
                const text = await response.text();
                throw new Error(text || 'Failed to start session');
            }

            const data = await response.json();
            console.log('[QR MODAL] ✅ Session started:', data.session);

            const session = data.session;
            const interval = Number(session.rotation_interval ?? rotationInterval);

            // ✅ Initialize timing references
            clientStartTime.current = Date.now();
            intervalDuration.current = interval;

            console.log('[QR MODAL] ⏰ Timer initialized at:', interval + 's');

            setIsActive(true);
            setRotationInterval(interval);
            setCurrentCode(session.current_code);
            setScannedCount(session.scanned_students?.length ?? 0);
            setSessionNumber(session.session_number || 1);
            setTimeLeft(interval);

            await generateQRCode(session.current_code);
            showNotification('success', `Session ${session.session_number} started!`);
        } catch (err: unknown) {
            console.error('[QR MODAL] Start session error:', err);
            const message = err instanceof Error ? err.message : 'Error starting QR session';
            showNotification('error', message);
        }
    };

    // ✅ UNIFIED EFFECT - Handles both countdown and polling
    useEffect(() => {
        if (!isActive) return;

        let animationFrameId: number;
        let pollIntervalId: NodeJS.Timeout;

        // ✅ SMOOTH COUNTDOWN using requestAnimationFrame
        const updateCountdown = () => {
            if (!isActive) return;

            const now = Date.now();
            const elapsed = Math.floor((now - clientStartTime.current) / 1000);
            const cyclePosition = elapsed % intervalDuration.current;
            const remaining = intervalDuration.current - cyclePosition;
            
            // Ensure we never show 0 or negative
            setTimeLeft(remaining > 0 ? remaining : intervalDuration.current);
            
            // Continue animation loop
            animationFrameId = requestAnimationFrame(updateCountdown);
        };

        // ✅ BACKEND POLLING for updates
        const pollSession = async () => {
            try {
                const token = localStorage.getItem('access_token');
                if (!token) return;

                const res = await fetch(
                    `${process.env.NEXT_PUBLIC_API_URL}/qr/session/${classId}?date=${currentDate}`,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    }
                );

                if (!res.ok) return;
                const data = await res.json();
                if (!data.active || !data.session) return;

                const session = data.session;
                
                // Update stats (always safe)
                setScannedCount(session.scanned_students?.length ?? 0);
                setSessionNumber(session.session_number || 1);

                const newCode = session.current_code;
                const newInterval = Number(session.rotation_interval ?? intervalDuration.current);
                
                // ✅ CRITICAL: Only reset timer when code actually changes
                if (newCode && newCode !== currentCode) {
                    console.log('[QR MODAL] 🔄 Code rotated to:', newCode);
                    
                    // Reset timer from NOW
                    clientStartTime.current = Date.now();
                    intervalDuration.current = newInterval;
                    
                    setRotationInterval(newInterval);
                    setCurrentCode(newCode);
                    await generateQRCode(newCode);
                    
                    console.log('[QR MODAL] ⏰ Timer reset to:', newInterval + 's');
                } else {
                    // ✅ Interval changed but code didn't rotate yet
                    if (newInterval !== intervalDuration.current) {
                        console.log(`[QR MODAL] ⚙️ Interval updated: ${intervalDuration.current}s → ${newInterval}s`);
                        intervalDuration.current = newInterval;
                        setRotationInterval(newInterval);
                        // DON'T reset clientStartTime - let current cycle finish
                    }
                }

            } catch (e: unknown) {
                console.error('[QR MODAL] Poll error', e);
            }
        };

        // ✅ Start smooth countdown animation
        animationFrameId = requestAnimationFrame(updateCountdown);

        // ✅ Start polling (every 1 second)
        pollIntervalId = setInterval(pollSession, 1000);

        // ✅ Cleanup on unmount or when isActive changes
        return () => {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
            clearInterval(pollIntervalId);
        };
    }, [isActive, classId, currentDate, currentCode]);

    const stopSession = async () => {
        setIsStopping(true);
        try {
            const token = localStorage.getItem('access_token');
            if (!token) {
                showNotification('error', 'Please login again');
                setIsStopping(false);
                return;
            }

            const response = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL}/qr/stop-session`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        class_id: classId,
                        date: currentDate
                    }),
                }
            );

            if (!response.ok) {
                const text = await response.text();
                throw new Error(text || 'Failed to stop QR session');
            }

            const data = await response.json();
            showNotification('success', `Session ${sessionNumber} completed! ${data.scanned_count} present, ${data.absent_count} absent.`);
            
            setTimeout(() => {
                onClose();
            }, 2000);
        } catch (err: unknown) {
            console.error('Stop session error:', err);
            const message = err instanceof Error ? err.message : 'Failed to stop session';
            showNotification('error', message);
        } finally {
            setIsStopping(false);
        }
    };

    return (
        <>
            {/* Main Modal */}
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4">
                <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-[95vw] sm:max-w-2xl overflow-hidden flex flex-col max-h-[95vh]">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 sm:px-6 py-3 sm:py-4 flex-shrink-0">
                        <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                                <h2 className="text-base sm:text-xl md:text-2xl font-bold text-white truncate">
                                    QR Code Attendance
                                </h2>
                                <p className="text-emerald-50 text-xs sm:text-sm mt-0.5 truncate">{className}</p>
                            </div>
                            <button
                                onClick={onClose}
                                className="ml-2 p-1.5 sm:p-2 hover:bg-white/20 rounded-lg transition-colors flex-shrink-0 min-w-[36px] min-h-[36px] sm:min-w-[40px] sm:min-h-[40px] flex items-center justify-center"
                                aria-label="Close modal"
                            >
                                <X className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                            </button>
                        </div>
                    </div>

                    {/* Date Display */}
                    <div className="bg-emerald-50 border-b border-emerald-200 px-4 sm:px-6 py-2 sm:py-3 flex-shrink-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-700 flex-shrink-0" />
                            <span className="text-xs sm:text-sm md:text-base font-semibold text-emerald-900 break-words">
                                {new Date(currentDate).toLocaleDateString('en-US', {
                                    weekday: 'long',
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric'
                                })}
                            </span>
                        </div>
                    </div>

                    {/* Notification Banner */}
                    {notification && (
                        <div
                            className={`px-4 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-2 sm:gap-3 ${
                                notification.type === 'success'
                                    ? 'bg-emerald-50 border-b border-emerald-200'
                                    : notification.type === 'error'
                                    ? 'bg-rose-50 border-b border-rose-200'
                                    : 'bg-blue-50 border-b border-blue-200'
                            }`}
                        >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                {notification.type === 'success' && (
                                    <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600 flex-shrink-0" />
                                )}
                                {notification.type === 'error' && (
                                    <X className="w-4 h-4 sm:w-5 sm:h-5 text-rose-600 flex-shrink-0" />
                                )}
                                {notification.type === 'info' && (
                                    <svg className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                )}
                                <span
                                    className={`text-xs sm:text-sm font-medium truncate ${
                                        notification.type === 'success'
                                            ? 'text-emerald-800'
                                            : notification.type === 'error'
                                            ? 'text-rose-800'
                                            : 'text-blue-800'
                                    }`}
                                >
                                    {notification.message}
                                </span>
                            </div>
                            <button
                                onClick={() => setNotification(null)}
                                className={`p-1 rounded-lg transition-colors flex-shrink-0 min-w-[32px] min-h-[32px] flex items-center justify-center ${
                                    notification.type === 'success'
                                        ? 'hover:bg-emerald-200'
                                        : notification.type === 'error'
                                        ? 'hover:bg-rose-200'
                                        : 'hover:bg-blue-200'
                                }`}
                                aria-label="Close notification"
                            >
                                <X
                                    className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${
                                        notification.type === 'success'
                                            ? 'text-emerald-600'
                                            : notification.type === 'error'
                                            ? 'text-rose-600'
                                            : 'text-blue-600'
                                    }`}
                                />
                            </button>
                        </div>
                    )}

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
                        {!isActive ? (
                            /* Setup Screen */
                            <div className="space-y-4 sm:space-y-6">
                                <div className="text-center">
                                    <div className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                                        <QrCode className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 text-emerald-600" />
                                    </div>
                                    <h3 className="text-base sm:text-lg md:text-xl font-bold text-slate-900 mb-1.5 sm:mb-2">
                                        Start QR Attendance
                                    </h3>
                                    <p className="text-xs sm:text-sm md:text-base text-slate-600 px-2">
                                        Students will scan the QR code to mark their attendance
                                    </p>
                                </div>

                                {/* QR Settings */}
                                <div className="bg-slate-50 rounded-lg sm:rounded-xl p-3 sm:p-4 md:p-6">
                                    <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-2 sm:mb-3">
                                        QR Code Rotation Interval
                                    </label>
                                    <div className="flex items-center gap-2 sm:gap-4">
                                        <input
                                            type="range"
                                            min="3"
                                            max="30"
                                            value={rotationInterval}
                                            onChange={(e) => {
                                                const newInterval = Number(e.target.value);
                                                setRotationInterval(newInterval);
                                                setTimeLeft(newInterval);
                                            }}
                                            className="flex-1 h-2 sm:h-2.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                                            style={{
                                                WebkitAppearance: 'none',
                                                appearance: 'none'
                                            }}
                                        />
                                        <div className="flex items-center gap-1.5 sm:gap-2 bg-white px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg border-2 border-emerald-500 flex-shrink-0 min-w-[60px] sm:min-w-[70px]">
                                            <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 flex-shrink-0" />
                                            <span className="font-bold text-emerald-900 text-sm sm:text-base whitespace-nowrap">{rotationInterval}s</span>
                                        </div>
                                    </div>
                                    <p className="text-[10px] sm:text-xs text-slate-500 mt-2 sm:mt-3">
                                        The QR code will change every {rotationInterval} seconds for security
                                    </p>
                                </div>

                                <button
                                    onClick={startSession}
                                    className="w-full px-4 sm:px-6 md:px-8 py-2.5 sm:py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm sm:text-base font-semibold rounded-lg sm:rounded-xl hover:shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
                                >
                                    <Zap className="w-4 h-4 sm:w-5 sm:h-5" />
                                    Start QR Session
                                </button>
                            </div>
                        ) : (
                            /* Active Session Screen */
                            <div className="space-y-3 sm:space-y-4 md:space-y-6">
                                {/* Session Info */}
                                <div className="bg-emerald-50 border border-emerald-200 rounded-lg sm:rounded-xl p-3 sm:p-4">
                                    <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
                                        <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-700" />
                                        <span className="text-[10px] sm:text-xs font-semibold text-emerald-700 uppercase">
                                            Active Session #{sessionNumber}
                                        </span>
                                    </div>
                                    <p className="text-sm sm:text-base md:text-lg font-bold text-emerald-900 truncate">
                                        QR Attendance for {new Date(currentDate).toLocaleDateString()}
                                    </p>
                                </div>

                                {/* Stats */}
                                <div className="grid grid-cols-3 gap-2 sm:gap-3 md:gap-4">
                                    <div className="bg-emerald-50 rounded-lg sm:rounded-xl p-2 sm:p-3 md:p-4 border border-emerald-200">
                                        <div className="flex items-center gap-1 sm:gap-1.5 mb-1">
                                            <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-emerald-600" />
                                            <span className="text-[9px] sm:text-[10px] md:text-xs font-semibold text-emerald-700 uppercase">
                                                Scanned
                                            </span>
                                        </div>
                                        <p className="text-xl sm:text-2xl md:text-3xl font-bold text-emerald-900">{scannedCount}</p>
                                    </div>

                                    <div className="bg-slate-50 rounded-lg sm:rounded-xl p-2 sm:p-3 md:p-4 border border-slate-200">
                                        <div className="flex items-center gap-1 sm:gap-1.5 mb-1">
                                            <Users className="w-3 h-3 sm:w-4 sm:h-4 text-slate-600" />
                                            <span className="text-[9px] sm:text-[10px] md:text-xs font-semibold text-slate-700 uppercase">
                                                Total
                                            </span>
                                        </div>
                                        <p className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900">{totalStudents}</p>
                                    </div>

                                    <div className="bg-blue-50 rounded-lg sm:rounded-xl p-2 sm:p-3 md:p-4 border border-blue-200">
                                        <div className="flex items-center gap-1 sm:gap-1.5 mb-1">
                                            <Clock className="w-3 h-3 sm:w-4 sm:h-4 text-blue-600" />
                                            <span className="text-[9px] sm:text-[10px] md:text-xs font-semibold text-blue-700 uppercase">
                                                Next
                                            </span>
                                        </div>
                                        <p className="text-xl sm:text-2xl md:text-3xl font-bold text-blue-900">{timeLeft}s</p>
                                    </div>
                                </div>

                                {/* QR Code Display with Zoom Button */}
                                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-lg sm:rounded-xl md:rounded-2xl p-3 sm:p-4 md:p-6 text-center border-2 border-emerald-200 relative">
                                    <div className="bg-white p-3 sm:p-4 md:p-6 rounded-lg sm:rounded-xl inline-block shadow-lg relative max-w-full">
                                        {qrCodeUrl && (
                                            <img 
                                                src={qrCodeUrl} 
                                                alt="QR Code" 
                                                className="w-full max-w-[160px] sm:max-w-[224px] md:max-w-[256px] h-auto mx-auto"
                                            />
                                        )}
                                        
                                        {/* Zoom Button */}
                                        <button
                                            onClick={() => setIsZoomed(true)}
                                            className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 p-1.5 sm:p-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md sm:rounded-lg shadow-lg transition-all min-w-[32px] min-h-[32px] sm:min-w-[36px] sm:min-h-[36px] flex items-center justify-center"
                                            title="Zoom QR Code"
                                            aria-label="Zoom QR Code"
                                        >
                                            <Maximize2 className="w-4 h-4 sm:w-5 sm:h-5" />
                                        </button>
                                    </div>
                                    <p className="text-[10px] sm:text-xs text-emerald-700 mt-2 sm:mt-3 font-medium">
                                        💡 Tap zoom to enlarge QR code
                                    </p>
                                </div>

                                {/* Instructions */}
                                <div className="bg-blue-50 border border-blue-200 rounded-lg sm:rounded-xl p-2.5 sm:p-3 md:p-4">
                                    <h4 className="font-semibold text-blue-900 text-xs sm:text-sm mb-1.5 sm:mb-2">
                                        📱 Instructions for Students
                                    </h4>
                                    <ol className="text-[10px] sm:text-xs text-blue-800 space-y-0.5 sm:space-y-1 list-decimal list-inside">
                                        <li>Tap "Scan QR Code" in student dashboard</li>
                                        <li>Select this class from the list</li>
                                        <li>Point camera at QR code above</li>
                                        <li>Hold steady until scanned ✅</li>
                                        <li>Attendance marked automatically</li>
                                    </ol>
                                </div>

                                {/* Stop Button */}
                                <button
                                    onClick={stopSession}
                                    disabled={isStopping}
                                    className="w-full px-4 sm:px-6 py-2.5 sm:py-3 bg-rose-600 hover:bg-rose-700 text-white text-sm sm:text-base font-semibold rounded-lg sm:rounded-xl shadow-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {isStopping ? (
                                        <>
                                            <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            <span className="text-xs sm:text-sm md:text-base">Stopping Session...</span>
                                        </>
                                    ) : (
                                        <>
                                            <X className="w-4 h-4 sm:w-5 sm:h-5" />
                                            <span className="text-xs sm:text-sm md:text-base">Stop Session & Mark Absent</span>
                                        </>
                                    )}
                                </button>

                                <p className="text-[10px] sm:text-xs text-center text-slate-500">
                                    ⏰ Students who haven't scanned will be automatically marked as Absent
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Zoomed QR Code Modal - REDESIGNED FULL SCREEN */}
            {isZoomed && qrCodeUrl && (
                <div 
                    className="fixed inset-0 bg-gradient-to-br from-emerald-900/95 via-teal-900/95 to-emerald-900/95 backdrop-blur-lg flex flex-col z-[60]"
                    onClick={() => setIsZoomed(false)}
                >
                    {/* Top Bar */}
                    <div className="flex items-center justify-between px-4 sm:px-6 py-4 sm:py-5">
                        <div className="flex items-center gap-2 sm:gap-3">
                            <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 bg-emerald-400 rounded-full animate-pulse"></div>
                            <span className="text-white font-semibold text-sm sm:text-base">
                                QR Code Active
                            </span>
                        </div>
                        
                        <button
                            onClick={() => setIsZoomed(false)}
                            className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white rounded-lg sm:rounded-xl transition-all border border-white/20"
                            aria-label="Close zoom view"
                        >
                            <X className="w-5 h-5 sm:w-6 sm:h-6" />
                            <span className="text-sm sm:text-base font-medium hidden sm:inline">Close</span>
                        </button>
                    </div>

                    {/* Main Content - Centered */}
                    <div 
                        className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-6 sm:py-8"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Title */}
                        <h3 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-2 sm:mb-3 text-center">
                            Scan QR Code
                        </h3>
                        <p className="text-sm sm:text-base text-emerald-100 mb-6 sm:mb-8 text-center max-w-md">
                            Point your camera at the code below to mark attendance
                        </p>

                        {/* QR Code - Large and Clean */}
                        <div className="relative">
                            {/* Glowing background effect */}
                            <div className="absolute inset-0 bg-white/20 blur-3xl rounded-full"></div>
                            
                            {/* QR Code Container */}
                            <div className="relative bg-white p-4 sm:p-6 md:p-8 rounded-2xl sm:rounded-3xl shadow-2xl">
                                <img 
                                    src={qrCodeUrl} 
                                    alt="QR Code - Zoomed" 
                                    className="w-[280px] h-[280px] sm:w-[340px] sm:h-[340px] md:w-[400px] md:h-[400px] lg:w-[460px] lg:h-[460px]"
                                />
                            </div>
                        </div>

                        {/* Timer Badge */}
                        <div className="mt-6 sm:mt-8 flex items-center gap-3 bg-white/10 backdrop-blur-md border border-white/20 px-5 sm:px-6 md:px-8 py-3 sm:py-4 rounded-full">
                            <div className="flex items-center gap-2">
                                <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-300" />
                                <span className="text-lg sm:text-xl md:text-2xl font-bold text-white">
                                    {timeLeft}s
                                </span>
                            </div>
                            <div className="w-px h-6 bg-white/20"></div>
                            <span className="text-xs sm:text-sm text-emerald-100">
                                Next code
                            </span>
                        </div>

                        {/* Instructions */}
                        <p className="mt-6 sm:mt-8 text-xs sm:text-sm text-emerald-200 text-center max-w-sm">
                            💡 Keep your camera steady and scan within the time limit
                        </p>
                    </div>

                    {/* Bottom Hint */}
                    <div className="text-center pb-4 sm:pb-6">
                        <p className="text-xs sm:text-sm text-emerald-300/80">
                            Tap anywhere outside the QR code to close
                        </p>
                    </div>
                </div>
            )}
        </>
    );
};
