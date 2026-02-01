import React, { useState, useEffect, useRef } from 'react';
import { X, QrCode, Users, Clock, Zap, CheckCircle, Calendar } from 'lucide-react';
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
    const [notification, setNotification] = useState<{
        type: 'success' | 'error' | 'info';
        message: string;
    } | null>(null);

    // Use refs to track the actual rotation timestamp from server
    const lastRotationTimestamp = useRef<number>(0);
    const rotationIntervalRef = useRef<number>(5);

    const showNotification = (type: 'success' | 'error' | 'info', message: string) => {
        setNotification({ type, message });
        setTimeout(() => setNotification(null), 5000);
    };

    const parseServerTime = (isoString: string): number => {
        try {
            // Handle both "2026-01-01T00:00:00.000" and "...Z" formats
            const cleanString = isoString.endsWith('Z') ? isoString.slice(0, -1) : isoString;
            const date = new Date(cleanString);
            return date.getTime();
        } catch {
            return Date.now();
        }
    };

    const generateQRCode = async (code: string) => {
        const qrData = {
            class_id: String(classId),
            date: currentDate,
            code: code,
        };

        const qrDataString = JSON.stringify(qrData);
        const url = await QRCode.toDataURL(qrDataString, {
            width: 300,
            margin: 2,
            color: { dark: '#059669', light: '#ffffff' },
        });

        setQrCodeUrl(url);
    };

    const startSession = async () => {
        console.log('[QR MODAL] Starting QR session for date:', currentDate);

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
            console.log('[QR MODAL] Session started:', data);

            const session = data.session;
            const serverInterval = Number(session.rotation_interval ?? rotationInterval);
            const serverLastRotation = session.last_rotation ?? session.code_generated_at ?? session.started_at;

            // Set the baseline rotation timestamp
            lastRotationTimestamp.current = parseServerTime(serverLastRotation);
            rotationIntervalRef.current = serverInterval;

            setIsActive(true);
            setRotationInterval(serverInterval);
            setCurrentCode(session.current_code);
            setScannedCount(session.scanned_students?.length ?? 0);
            setSessionNumber(session.session_number || 1);
            setTimeLeft(serverInterval);

            await generateQRCode(session.current_code);
            showNotification('success', `Session ${session.session_number} started!`);
        } catch (err: unknown) {
            console.error('[QR MODAL] Start session error:', err);
            const message = err instanceof Error ? err.message : 'Error starting QR session';
            showNotification('error', message);
        }
    };

    // Poll for session updates every second
    useEffect(() => {
        if (!isActive) return;

        const pollInterval = setInterval(async () => {
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
                
                // Update stats
                setScannedCount(session.scanned_students?.length ?? 0);
                setSessionNumber(session.session_number || 1);

                // Check if code changed (server rotated)
                const newCode = session.current_code;
                if (newCode && newCode !== currentCode) {
                    console.log('[QR MODAL] 🔄 Code rotated to:', newCode);
                    
                    // Update rotation timestamp
                    const serverLastRotation = session.last_rotation ?? session.code_generated_at ?? session.started_at;
                    lastRotationTimestamp.current = parseServerTime(serverLastRotation);
                    
                    setCurrentCode(newCode);
                    await generateQRCode(newCode);
                    showNotification('info', 'QR Code refreshed!');
                }

                // Update interval if changed
                const serverInterval = Number(session.rotation_interval ?? rotationInterval);
                if (serverInterval !== rotationIntervalRef.current) {
                    rotationIntervalRef.current = serverInterval;
                    setRotationInterval(serverInterval);
                }

            } catch (e: unknown) {
                console.error('[QR MODAL] Poll error', e);
            }
        }, 1000);

        return () => clearInterval(pollInterval);
    }, [isActive, classId, currentDate, currentCode, rotationInterval]);

    // Countdown timer - runs independently based on server rotation timestamp
    useEffect(() => {
        if (!isActive) return;

        const countdownInterval = setInterval(() => {
            const now = Date.now();
            const elapsed = Math.floor((now - lastRotationTimestamp.current) / 1000);
            const remaining = rotationIntervalRef.current - (elapsed % rotationIntervalRef.current);
            
            // Ensure we never show 0 or negative
            const displayTime = remaining <= 0 ? rotationIntervalRef.current : remaining;
            setTimeLeft(displayTime);
        }, 100); // Update 10 times per second for smooth display

        return () => clearInterval(countdownInterval);
    }, [isActive]);

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
            
            // Wait a bit to show the success message, then close
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4">
            <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-[95vw] sm:max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 sm:px-6 py-3 sm:py-5 flex-shrink-0">
                    <div className="flex-1">
                        <h2 className="text-lg sm:text-2xl font-bold text-white">QR Code Attendance</h2>
                        <p className="text-emerald-50 text-xs sm:text-sm mt-0.5 sm:mt-1 truncate">{className}</p>
                    </div>
                </div>

                {/* Date Display */}
                <div className="bg-emerald-50 border-b border-emerald-200 px-4 sm:px-6 py-2 sm:py-3 flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-700" />
                        <span className="text-sm sm:text-base font-semibold text-emerald-900">
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
                        className={`px-4 sm:px-6 py-3 flex items-center justify-between gap-3 ${
                            notification.type === 'success'
                                ? 'bg-emerald-50 border-b border-emerald-200'
                                : notification.type === 'error'
                                ? 'bg-rose-50 border-b border-rose-200'
                                : 'bg-blue-50 border-b border-blue-200'
                        }`}
                    >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                            {notification.type === 'success' && (
                                <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                            )}
                            {notification.type === 'error' && (
                                <X className="w-5 h-5 text-rose-600 flex-shrink-0" />
                            )}
                            {notification.type === 'info' && (
                                <svg className="w-5 h-5 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            )}
                            <span
                                className={`text-sm font-medium ${
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
                            className={`p-1 rounded-lg transition-colors flex-shrink-0 ${
                                notification.type === 'success'
                                    ? 'hover:bg-emerald-200'
                                    : notification.type === 'error'
                                    ? 'hover:bg-rose-200'
                                    : 'hover:bg-blue-200'
                            }`}
                        >
                            <X
                                className={`w-4 h-4 ${
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
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
                    {!isActive ? (
                        /* Setup Screen */
                        <div className="space-y-6">
                            <div className="text-center">
                                <div className="w-20 h-20 sm:w-24 sm:h-24 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <QrCode className="w-10 h-10 sm:w-12 sm:h-12 text-emerald-600" />
                                </div>
                                <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-2">
                                    Start QR Attendance
                                </h3>
                                <p className="text-sm sm:text-base text-slate-600">
                                    Students will scan the QR code to mark their attendance
                                </p>
                            </div>

                            {/* QR Settings */}
                            <div className="bg-slate-50 rounded-xl p-4 sm:p-6">
                                <label className="block text-sm font-semibold text-slate-700 mb-3">
                                    QR Code Rotation Interval
                                </label>
                                <div className="flex items-center gap-4">
                                    <input
                                        type="range"
                                        min="3"
                                        max="30"
                                        value={rotationInterval}
                                        onChange={(e) => setRotationInterval(Number(e.target.value))}
                                        className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                                    />
                                    <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border-2 border-emerald-500">
                                        <Clock className="w-4 h-4 text-emerald-600" />
                                        <span className="font-bold text-emerald-900">{rotationInterval}s</span>
                                    </div>
                                </div>
                                <p className="text-xs text-slate-500 mt-3">
                                    The QR code will change every {rotationInterval} seconds for security
                                </p>
                            </div>

                            <button
                                onClick={startSession}
                                className="w-full px-6 sm:px-8 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
                            >
                                <Zap className="w-5 h-5" />
                                Start QR Session
                            </button>
                        </div>
                    ) : (
                        /* Active Session Screen */
                        <div className="space-y-4 sm:space-y-6">
                            {/* Session Info */}
                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                                <div className="flex items-center gap-2 mb-1">
                                    <Clock className="w-4 h-4 text-emerald-700" />
                                    <span className="text-xs font-semibold text-emerald-700 uppercase">
                                        Active Session #{sessionNumber}
                                    </span>
                                </div>
                                <p className="text-lg font-bold text-emerald-900">QR Attendance for {new Date(currentDate).toLocaleDateString()}</p>
                            </div>

                            {/* Stats */}
                            <div className="grid grid-cols-3 gap-2 sm:gap-4">
                                <div className="bg-emerald-50 rounded-lg sm:rounded-xl p-3 sm:p-4 border border-emerald-200">
                                    <div className="flex items-center gap-2 mb-1">
                                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                                        <span className="text-xs font-semibold text-emerald-700 uppercase">
                                            Scanned
                                        </span>
                                    </div>
                                    <p className="text-2xl sm:text-3xl font-bold text-emerald-900">{scannedCount}</p>
                                </div>

                                <div className="bg-slate-50 rounded-xl p-3 sm:p-4 border border-slate-200">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Users className="w-4 h-4 text-slate-600" />
                                        <span className="text-xs font-semibold text-slate-700 uppercase">
                                            Total
                                        </span>
                                    </div>
                                    <p className="text-2xl sm:text-3xl font-bold text-slate-900">{totalStudents}</p>
                                </div>

                                <div className="bg-blue-50 rounded-xl p-3 sm:p-4 border border-blue-200">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Clock className="w-4 h-4 text-blue-600" />
                                        <span className="text-xs font-semibold text-blue-700 uppercase">
                                            Next Code
                                        </span>
                                    </div>
                                    <p className="text-2xl sm:text-3xl font-bold text-blue-900">{timeLeft}s</p>
                                </div>
                            </div>

                            {/* QR Code Display */}
                            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl sm:rounded-2xl p-4 sm:p-6 md:p-8 text-center border-2 border-emerald-200">
                                <div className="bg-white p-4 sm:p-6 rounded-xl sm:rounded-2xl inline-block shadow-lg">
                                    {qrCodeUrl && <img src={qrCodeUrl} alt="QR Code" className="w-48 h-48 sm:w-56 sm:h-56 md:w-64 md:h-64 mx-auto" />}
                                </div>
                            </div>

                            {/* Instructions */}
                            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 sm:p-4">
                                <h4 className="font-semibold text-blue-900 text-sm mb-2">
                                    📱 Instructions for Students
                                </h4>
                                <ol className="text-xs text-blue-800 space-y-1 list-decimal list-inside">
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
                                className="w-full px-6 py-3 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl shadow-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isStopping ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        Stopping Session...
                                    </>
                                ) : (
                                    <>
                                        <X className="w-5 h-5" />
                                        Stop Session & Mark Absent
                                    </>
                                )}
                            </button>

                            <p className="text-xs text-center text-slate-500">
                                ⏰ Students who haven't scanned will be automatically marked as Absent
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
