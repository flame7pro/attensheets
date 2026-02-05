import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, QrCode, Users, Clock, Zap, CheckCircle, Calendar, Maximize2, Minimize2 } from 'lucide-react';
import QRCode from 'qrcode';

interface QRAttendanceModalProps {
    classId: number;
    className: string;
    totalStudents: number;
    currentDate: string;
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

    const lastCodeRef = useRef<string>('');
    const isGeneratingQR = useRef<boolean>(false);
    const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const showNotification = (type: 'success' | 'error' | 'info', message: string) => {
        setNotification({ type, message });
        setTimeout(() => setNotification(null), 5000);
    };

    const generateQRCode = useCallback(async (code: string) => {
        if (isGeneratingQR.current || code === lastCodeRef.current) {
            return;
        }

        isGeneratingQR.current = true;
        lastCodeRef.current = code;

        try {
            const qrData = {
                class_id: String(classId),
                date: currentDate,
                code: code,
            };

            const url = await QRCode.toDataURL(JSON.stringify(qrData), {
                width: 400,
                margin: 2,
                color: { dark: '#059669', light: '#ffffff' },
            });

            setQrCodeUrl(url);
        } catch (error) {
            console.error('[QR] Generation error:', error);
        } finally {
            isGeneratingQR.current = false;
        }
    }, [classId, currentDate]);

    const startSession = async () => {
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
            const session = data.session;

            lastCodeRef.current = '';

            setIsActive(true);
            setRotationInterval(Number(session.rotation_interval));
            setCurrentCode(session.current_code);
            setScannedCount(session.scanned_students?.length ?? 0);
            setSessionNumber(session.session_number || 1);
            setTimeLeft(Number(session.rotation_interval));

            await generateQRCode(session.current_code);
            showNotification('success', `Session ${session.session_number} started!`);
        } catch (err: unknown) {
            console.error('[QR] Start error:', err);
            showNotification('error', err instanceof Error ? err.message : 'Error starting QR session');
        }
    };

    // ✅ SMOOTH CLIENT-SIDE TIMER - Counts down every second
    useEffect(() => {
        if (!isActive) {
            // Clear timer when inactive
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
                timerIntervalRef.current = null;
            }
            return;
        }

        // Start smooth countdown timer (1 second intervals)
        timerIntervalRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    return rotationInterval; // Reset to full interval
                }
                return prev - 1;
            });
        }, 1000);

        return () => {
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
                timerIntervalRef.current = null;
            }
        };
    }, [isActive, rotationInterval]);

    // ✅ BACKEND SYNC - Poll every 2 seconds for code changes and student counts
    useEffect(() => {
        if (!isActive) {
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
            }
            return;
        }

        const pollSession = async () => {
            try {
                const token = localStorage.getItem('access_token');
                if (!token) return;

                const res = await fetch(
                    `${process.env.NEXT_PUBLIC_API_URL}/qr/session/${classId}?date=${currentDate}`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );

                if (!res.ok) return;
                const data = await res.json();
                if (!data.active || !data.session) return;

                const session = data.session;
                const serverCode = session.current_code;
                
                // Update counts and session number
                setScannedCount(session.scanned_students?.length ?? 0);
                setSessionNumber(session.session_number || 1);

                // ✅ CRITICAL: Update QR code when it changes on backend
                if (serverCode !== currentCode) {
                    console.log(`[QR] Code changed: ${currentCode} -> ${serverCode}`);
                    setCurrentCode(serverCode);
                    setRotationInterval(Number(session.rotation_interval));
                    
                    // ✅ RESET TIMER when code changes
                    setTimeLeft(Number(session.rotation_interval));
                    
                    await generateQRCode(serverCode);
                }
            } catch (e) {
                console.error('[QR] Poll error:', e);
            }
        };

        // Initial poll
        pollSession();

        // Poll every 2 seconds (less frequent than timer for efficiency)
        pollIntervalRef.current = setInterval(pollSession, 2000);

        return () => {
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
            }
        };
    }, [isActive, classId, currentDate, currentCode, generateQRCode]);

    useEffect(() => {
        const handleEscKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && isZoomed) {
                setIsZoomed(false);
            }
        };

        if (isZoomed) {
            document.addEventListener('keydown', handleEscKey);
        }

        return () => {
            document.removeEventListener('keydown', handleEscKey);
        };
    }, [isZoomed]);

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
                throw new Error(text || 'Failed to stop session');
            }

            const data = await response.json();
            showNotification('success', `Session completed! ${data.scanned_count} present, ${data.absent_count} absent.`);
            
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('qr-session-completed', {
                    detail: { classId, date: currentDate }
                }));
            }
            
            setTimeout(() => {
                onClose();
            }, 2000);
        } catch (err) {
            console.error('Stop error:', err);
            showNotification('error', err instanceof Error ? err.message : 'Failed to stop session');
        } finally {
            setIsStopping(false);
        }
    };

    return (
        <>
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4">
                <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-[95vw] sm:max-w-2xl overflow-hidden flex flex-col max-h-[95vh]">
                    <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 sm:px-6 py-3 sm:py-4 flex-shrink-0">
                        <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                                <h2 className="text-base sm:text-xl md:text-2xl font-bold text-white truncate">
                                    QR Code Attendance
                                </h2>
                                <p className="text-emerald-50 text-xs sm:text-sm mt-0.5 truncate">{className}</p>
                            </div>
                        </div>
                    </div>

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
                                    <svg className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

                    <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
                        {!isActive ? (
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
                            <div className="space-y-3 sm:space-y-4 md:space-y-6">
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

                                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-lg sm:rounded-xl md:rounded-2xl p-3 sm:p-4 md:p-6 text-center border-2 border-emerald-200">
                                    <div className="relative inline-block max-w-full">
                                        <div className="bg-white p-3 sm:p-4 md:p-6 rounded-lg sm:rounded-xl shadow-lg">
                                            {qrCodeUrl && (
                                                <img 
                                                    src={qrCodeUrl} 
                                                    alt="QR Code" 
                                                    className="w-full max-w-[160px] sm:max-w-[224px] md:max-w-[256px] h-auto mx-auto"
                                                />
                                            )}
                                        </div>
                                        
                                        <button
                                            onClick={() => setIsZoomed(true)}
                                            className="absolute -top-2 -right-2 sm:-top-3 sm:-right-3 p-2 sm:p-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all min-w-[36px] min-h-[36px] sm:min-w-[44px] sm:min-h-[44px] flex items-center justify-center group"
                                            title="Enlarge QR Code"
                                        >
                                            <Maximize2 className="w-4 h-4 sm:w-5 sm:h-5 group-hover:scale-110 transition-transform" />
                                        </button>
                                    </div>
                                    
                                    <p className="text-[10px] sm:text-xs text-emerald-700 mt-2 sm:mt-3 font-medium">
                                        💡 Click zoom button to view full-screen QR code
                                    </p>
                                </div>

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

            {isZoomed && qrCodeUrl && (
                <div 
                    className="fixed inset-0 bg-gradient-to-br from-teal-800 via-emerald-800 to-teal-900 flex flex-col z-[60]"
                    onClick={() => setIsZoomed(false)}
                >
                    <div className="flex items-center justify-between px-3 sm:px-4 md:px-6 py-3 sm:py-4 flex-shrink-0">
                        <div className="flex items-center gap-1.5 sm:gap-2">
                            <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 bg-emerald-400 rounded-full animate-pulse"></div>
                            <span className="text-white font-semibold text-xs sm:text-sm md:text-base">
                                QR Code Active
                            </span>
                        </div>
                        
                        <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
                            <div className="bg-blue-600 text-white px-3 sm:px-4 md:px-5 py-1.5 sm:py-2 rounded-full shadow-lg">
                                <div className="flex items-center gap-1.5 sm:gap-2">
                                    <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 flex-shrink-0" />
                                    <span className="text-sm sm:text-base md:text-lg font-bold">{timeLeft}</span>
                                    <span className="text-xs sm:text-sm opacity-90 hidden sm:inline">sec</span>
                                </div>
                            </div>

                            <button
                                onClick={() => setIsZoomed(false)}
                                className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 md:px-4 py-1.5 sm:py-2 md:py-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white rounded-lg transition-all border border-white/20"
                            >
                                <X className="w-4 h-4 sm:w-5 sm:h-5" />
                                <span className="text-xs sm:text-sm font-medium">Close</span>
                            </button>
                        </div>
                    </div>

                    <div 
                        className="flex-1 flex flex-col items-center justify-center px-3 sm:px-4 md:px-6 py-4 sm:py-6 overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="bg-white rounded-xl sm:rounded-2xl md:rounded-3xl p-3 sm:p-4 md:p-5 lg:p-6 shadow-2xl max-w-full">
                            <img 
                                src={qrCodeUrl} 
                                alt="QR Code" 
                                className="w-[240px] h-[240px] sm:w-[300px] sm:h-[300px] md:w-[380px] md:h-[380px] lg:w-[460px] lg:h-[460px] xl:w-[520px] xl:h-[520px] mx-auto"
                            />
                        </div>
                    </div>

                    <div className="text-center pb-3 sm:pb-4 md:pb-5 lg:pb-6 flex-shrink-0">
                        <p className="text-[10px] sm:text-xs md:text-sm text-white/70">
                            Tap anywhere outside the QR code to close • Press ESC to exit
                        </p>
                    </div>
                </div>
            )}
        </>
    );
};
