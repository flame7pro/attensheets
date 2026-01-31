'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, QrCode, CheckCircle, AlertCircle, Camera, Search } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';

interface ClassInfo {
    classid: string;
    classname: string;
    teachername: string;
}

interface StudentQRScannerProps {
    onClose: () => void;
    classes: ClassInfo[];
}

export const StudentQRScanner: React.FC<StudentQRScannerProps> = ({
    onClose,
    classes,
}) => {
    const [selectedClass, setSelectedClass] = useState<string>('');
    const [scanning, setScanning] = useState<boolean>(false);
    const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
    const [processing, setProcessing] = useState<boolean>(false);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const html5QrRef = useRef<Html5Qrcode | null>(null);

    useEffect(() => {
        const setupScanner = async () => {
            if (!scanning) return;

            try {
                const regionId = 'qr-reader';
                const elem = document.getElementById(regionId);
                if (!elem) {
                    console.error('qr-reader element not found');
                    return;
                }

                if (!html5QrRef.current) {
                    html5QrRef.current = new Html5Qrcode(regionId);
                }

                await html5QrRef.current.start(
                    {
                        facingMode: { exact: "environment" } // 🔑 important
                    },
                    {
                        fps: 10,
                        qrbox: { width: 250, height: 250 },
                        aspectRatio: 1.0
                    },
                    onScanSuccess,
                    onScanFailure
                );

                const video = document.querySelector('#qr-reader video') as HTMLVideoElement | null;
                if (video) {
                    video.setAttribute('playsinline', 'true'); // iOS Safari fix
                    video.muted = true;                        // mobile autoplay rule
                }

            } catch (err: any) {
                console.error('Camera start error:', err);
                setResult({
                    success: false,
                    message: 'Cannot access camera. Please allow camera permission and try again.',
                });
                setScanning(false);
            }
        };

        setupScanner();
    }, [scanning]);

    const stopScanning = async () => {
        setScanning(false);
        setProcessing(false);
        if (html5QrRef.current) {
            try {
                await html5QrRef.current.stop();
                await html5QrRef.current.clear();
            } catch {
                // ignore
            }
            html5QrRef.current = null;
        }
    };

    const onScanSuccess = async (decodedText: string) => {
        if (processing) return;
        setProcessing(true);

        console.log('[STUDENT SCANNER] ='.repeat(30));
        console.log('[STUDENT SCANNER] QR Code Scanned (RAW):', decodedText);

        try {
            let qrData: { class_id: string; date: string; code: string };

            // Parse the QR code JSON
            try {
                qrData = JSON.parse(decodedText);
                console.log('[STUDENT SCANNER] ✅ Parsed QR data:', qrData);
                console.log('[STUDENT SCANNER] - class_id:', qrData.class_id);
                console.log('[STUDENT SCANNER] - date:', qrData.date);
                console.log('[STUDENT SCANNER] - code:', qrData.code);
            } catch (parseError) {
                console.error('[STUDENT SCANNER] ❌ Failed to parse QR code:', parseError);
                setResult({
                    success: false,
                    message: 'Invalid QR code format',
                });
                setProcessing(false);
                return;
            }

            // ✅ FIX: Check for date instead of session_id
            if (!qrData.class_id || !qrData.date || !qrData.code) {
                console.error('[STUDENT SCANNER] ❌ Missing required fields');
                console.log('[STUDENT SCANNER] Has class_id?', !!qrData.class_id);
                console.log('[STUDENT SCANNER] Has date?', !!qrData.date);
                console.log('[STUDENT SCANNER] Has code?', !!qrData.code);
                setResult({
                    success: false,
                    message: 'Invalid QR code - missing required data',
                });
                setProcessing(false);
                return;
            }

            // Check if QR code is for the selected class
            if (qrData.class_id !== selectedClass) {
                console.error('[STUDENT SCANNER] ❌ Class mismatch');
                console.log('[STUDENT SCANNER] QR class_id:', qrData.class_id);
                console.log('[STUDENT SCANNER] Selected class:', selectedClass);
                setResult({
                    success: false,
                    message: 'This QR code is for a different class!',
                });
                setProcessing(false);
                return;
            }

            const token = typeof window !== 'undefined'
                ? localStorage.getItem('access_token')
                : null;

            if (!token) {
                console.error('[STUDENT SCANNER] ❌ No token found');
                setResult({
                    success: false,
                    message: 'Please login again.',
                });
                setProcessing(false);
                return;
            }

            console.log('[STUDENT SCANNER] ✅ Token found');
            console.log('[STUDENT SCANNER] 📤 Sending to backend...');

            // Backend expects the ENTIRE QR JSON string as the qr_code parameter
            const qrCodeString = decodedText; // Complete JSON string

            console.log('[STUDENT SCANNER] QR Code String:', qrCodeString);
            console.log('[STUDENT SCANNER] Class ID:', qrData.class_id);

            // Build URL with query parameters
            const url = `${process.env.NEXT_PUBLIC_API_URL}/qr/scan?class_id=${qrData.class_id}&qr_code=${encodeURIComponent(qrCodeString)}`;
            console.log('[STUDENT SCANNER] Full URL:', url);

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
            });

            console.log('[STUDENT SCANNER] 📥 Response status:', response.status);

            const data = await response.json();
            console.log('[STUDENT SCANNER] 📥 Response data:', data);

            if (!response.ok) {
                console.error('[STUDENT SCANNER] ❌ Backend error:', data.detail);
                throw new Error(data.detail || 'Failed to mark attendance');
            }

            console.log('[STUDENT SCANNER] ✅ SUCCESS!');
            setResult({ success: true, message: data.message || 'Attendance marked successfully!' });

            await stopScanning();
            setTimeout(onClose, 3000);
        } catch (error: any) {
            console.error('[STUDENT SCANNER] ❌ Scan error:', error);
            console.error('[STUDENT SCANNER] Error details:', error.message);
            setResult({
                success: false,
                message: error.message || 'Failed to scan QR code',
            });
            setProcessing(false);
        } finally {
            console.log('[STUDENT SCANNER] ='.repeat(30));
        }
    };

    const onScanFailure = (_error: string) => {
        // Ignore scan failures (they happen continuously while scanning)
    };

    const startScanning = async () => {
        if (!selectedClass) {
            alert('Please select a class first');
            return;
        }

        console.log('[STUDENT SCANNER] 🎬 Starting scanner for class:', selectedClass);
        setResult(null);
        setScanning(true);
    };

    const filteredClasses = classes.filter(cls => {
        const query = searchQuery.toLowerCase().trim();
        if (!query) return true;

        const className = cls.classname?.toLowerCase() || '';
        const teacherName = cls.teachername?.toLowerCase() || '';

        return className.includes(query) || teacherName.includes(query);
    });

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg md:max-w-2xl overflow-hidden max-h-[95vh] md:max-h-[90vh] flex flex-col">
                <div className="bg-gradient-to-r from-teal-600 to-cyan-600 px-4 md:px-6 py-4 md:py-5 flex items-center justify-between flex-shrink-0">
                    <div>
                        <h2 className="text-xl md:text-2xl font-bold text-white">Scan QR Code</h2>
                        <p className="text-teal-50 text-xs md:text-sm mt-1">Mark your attendance</p>
                    </div>
                    <button
                        onClick={async () => {
                            await stopScanning();
                            onClose();
                        }}
                        className="p-2 hover:bg-teal-700 rounded-lg transition-colors cursor-pointer"
                    >
                        <X className="w-5 h-5 md:w-6 md:h-6 text-white" />
                    </button>
                </div>

                <div className="p-4 md:p-6 space-y-4 md:space-y-6 overflow-y-auto flex-1">
                    {result && (
                        <div className={`rounded-xl p-3 md:p-4 border-2 ${result.success ? 'bg-emerald-50 border-emerald-500' : 'bg-rose-50 border-rose-500'}`}>
                            <div className="flex items-center gap-3">
                                {result.success ? (
                                    <CheckCircle className="w-5 h-5 md:w-6 md:h-6 text-emerald-600 flex-shrink-0" />
                                ) : (
                                    <AlertCircle className="w-5 h-5 md:w-6 md:h-6 text-rose-600 flex-shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className={`font-semibold text-sm md:text-base ${result.success ? 'text-emerald-900' : 'text-rose-900'}`}>
                                        {result.success ? 'Success!' : 'Error'}
                                    </p>
                                    <p className={`text-xs md:text-sm ${result.success ? 'text-emerald-700' : 'text-rose-700'}`}>
                                        {result.message}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {!scanning ? (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm md:text-base font-semibold text-slate-700 mb-3">
                                    Select Class to Mark Attendance
                                </label>

                                {classes.length === 0 ? (
                                    <div className="text-center py-8 md:py-12 bg-slate-50 rounded-xl">
                                        <QrCode className="w-10 h-10 md:w-12 md:h-12 text-slate-400 mx-auto mb-3" />
                                        <p className="text-sm md:text-base text-slate-600 px-4">No classes enrolled</p>
                                        <p className="text-xs md:text-sm text-slate-500 mt-1 px-4">
                                            Enroll in a class first to scan attendance
                                        </p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="mb-3 md:mb-4">
                                            <div className="relative">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-slate-400" />
                                                <input
                                                    type="text"
                                                    value={searchQuery}
                                                    onChange={(e) => setSearchQuery(e.target.value)}
                                                    placeholder="Search by class or teacher..."
                                                    className="w-full pl-9 md:pl-10 pr-10 py-2 md:py-2.5 text-sm md:text-base border border-teal-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white"
                                                />
                                                {searchQuery && (
                                                    <button
                                                        onClick={() => setSearchQuery('')}
                                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 rounded transition-colors"
                                                    >
                                                        <X className="w-4 h-4 text-slate-400" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {filteredClasses.length === 0 ? (
                                            <div className="text-center py-8 md:py-12 bg-slate-50 rounded-xl">
                                                <Search className="w-10 h-10 md:w-12 md:h-12 text-slate-400 mx-auto mb-3" />
                                                <p className="text-sm md:text-base font-semibold text-slate-900 mb-1 px-4">No classes found</p>
                                                <p className="text-xs md:text-sm text-slate-600 mb-4 px-4">
                                                    No classes match "{searchQuery}"
                                                </p>
                                                <button
                                                    onClick={() => setSearchQuery('')}
                                                    className="px-4 py-2 bg-teal-600 text-white text-xs md:text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors cursor-pointer"
                                                >
                                                    Clear Search
                                                </button>
                                            </div>
                                        ) : (
                                            <div
                                                className="space-y-2 border border-slate-200 rounded-lg p-2"
                                                style={{
                                                    height: filteredClasses.length > 3 ? '280px' : 'auto',
                                                    overflowY: filteredClasses.length > 3 ? 'scroll' : 'visible'
                                                }}
                                            >
                                                {filteredClasses.map((cls) => (
                                                    <button
                                                        key={cls.classid}
                                                        onClick={() => {
                                                            console.log('[STUDENT SCANNER] Selected class:', cls.classid, cls.classname);
                                                            setSelectedClass(cls.classid);
                                                        }}
                                                        className={`w-full text-left p-3 md:p-4 rounded-xl border-2 transition-all cursor-pointer ${selectedClass === cls.classid
                                                            ? 'border-teal-500 bg-teal-50'
                                                            : 'border-slate-200 hover:border-teal-300 hover:bg-slate-50'
                                                            }`}
                                                    >
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div className="flex-1 min-w-0">
                                                                <p className="font-semibold text-sm md:text-base text-slate-900 truncate">
                                                                    {cls.classname}
                                                                </p>
                                                                <p className="text-xs md:text-sm text-slate-500 truncate">
                                                                    {cls.teachername}
                                                                </p>
                                                            </div>
                                                            {selectedClass === cls.classid && (
                                                                <CheckCircle className="w-5 h-5 text-teal-600 flex-shrink-0" />
                                                            )}
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            {classes.length > 0 && filteredClasses.length > 0 && (
                                <button
                                    onClick={startScanning}
                                    disabled={!selectedClass}
                                    className="w-full px-4 md:px-6 py-3 md:py-4 bg-gradient-to-r from-teal-600 to-cyan-600 text-white text-sm md:text-base font-semibold rounded-xl hover:shadow-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    <Camera className="w-4 h-4 md:w-5 md:h-5" />
                                    Start Scanning
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="bg-slate-900 rounded-xl overflow-hidden">
                                <div id="qr-reader" className="w-full" />
                            </div>

                            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 md:p-4">
                                <h4 className="font-semibold text-blue-900 text-xs md:text-sm mb-2">
                                    📱 Scanning Instructions
                                </h4>
                                <ul className="text-xs md:text-sm text-blue-800 space-y-1 list-disc list-inside">
                                    <li>Point your camera at the teacher's QR code</li>
                                    <li>Make sure the QR code is clearly visible</li>
                                    <li>Hold steady until the code is scanned</li>
                                    <li>Your attendance will be marked automatically</li>
                                </ul>
                            </div>

                            <button
                                onClick={stopScanning}
                                className="w-full px-4 md:px-6 py-3 md:py-4 bg-slate-600 text-white text-sm md:text-base font-semibold rounded-xl hover:bg-slate-700 transition-all cursor-pointer flex items-center justify-center gap-2"
                            >
                                <X className="w-4 h-4 md:w-5 md:h-5" />
                                Cancel Scanning
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default StudentQRScanner;