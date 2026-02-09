'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
    const isCleaningUpRef = useRef<boolean>(false);
    const isScanningRef = useRef<boolean>(false);
    const processingRef = useRef<boolean>(false);
    const selectedClassRef = useRef<string>('');
    const lastScannedCodeRef = useRef<string>('');
    const lastScanTimeRef = useRef<number>(0);

    // Keep refs in sync
    useEffect(() => {
        processingRef.current = processing;
    }, [processing]);

    useEffect(() => {
        selectedClassRef.current = selectedClass;
    }, [selectedClass]);

    const stopScanning = useCallback(() => {
        setScanning(false);
        setProcessing(false);
    }, []);

    // ✅ OPTIMIZED: Fast scan handler with throttling
    const onScanSuccess = useCallback(async (decodedText: string) => {
        const now = Date.now();
        
        // ✅ THROTTLE: Prevent multiple scans within 1 second
        if (now - lastScanTimeRef.current < 1000) {
            return;
        }
        
        // ✅ DUPLICATE CHECK: Skip if same code scanned recently
        if (processingRef.current || isCleaningUpRef.current || decodedText === lastScannedCodeRef.current) {
            return;
        }
        
        // ✅ IMMEDIATE LOCK: Prevent concurrent processing
        processingRef.current = true;
        lastScanTimeRef.current = now;
        lastScannedCodeRef.current = decodedText;
        
        // ✅ INSTANT UI FEEDBACK
        setProcessing(true);
    
        console.log('[SCANNER] 🎯 QR Scanned:', decodedText.substring(0, 50) + '...');
    
        try {
            let qrData: { class_id: string; date: string; code: string };
    
            // STEP 1: Quick parse
            try {
                qrData = JSON.parse(decodedText);
            } catch {
                throw new Error('Invalid QR code format');
            }
    
            // STEP 2: Quick validation
            if (!qrData.class_id || !qrData.date || !qrData.code) {
                throw new Error('Invalid QR code - missing data');
            }
    
            // STEP 3: Class match check
            if (qrData.class_id !== selectedClassRef.current) {
                throw new Error('This QR code is for a different class!');
            }
    
            // ✅ STEP 4: FIXED - Check BOTH sessionStorage AND localStorage
            const token = typeof window !== 'undefined' 
                ? (sessionStorage.getItem('access_token') || localStorage.getItem('access_token'))
                : null;
            
            if (!token) {
                throw new Error('Please login again');
            }
    
            // ✅ STEP 5: FIXED - Send correct payload with date and code
            console.log('[SCANNER] 📤 Sending to backend...');
            console.log('🔍 SCANNED QR DATA:', qrData);
            console.log('📅 QR Date:', qrData.date);
            console.log('🏫 QR Class ID:', qrData.class_id);
            console.log('🔑 QR Code:', qrData.code);
            
            const response = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL}/qr/scan`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        class_id: qrData.class_id,
                        date: qrData.date,        // ✅ FIXED: Send parsed date
                        code: qrData.code          // ✅ FIXED: Send parsed code (not qr_code!)
                    })
                }
            );
    
            console.log('📥 BACKEND RESPONSE STATUS:', response.status);
            const data = await response.json();
            console.log('📥 BACKEND RESPONSE DATA:', data);
    
            if (!response.ok) {
                // ✅ FIXED: Handle different error formats from backend
                let errorMessage = 'Failed to mark attendance';
                
                if (typeof data.detail === 'string') {
                    errorMessage = data.detail;
                } else if (typeof data.message === 'string') {
                    errorMessage = data.message;
                } else if (typeof data.error === 'string') {
                    errorMessage = data.error;
                } else if (typeof data === 'string') {
                    errorMessage = data;
                }
                
                throw new Error(errorMessage);
            }
    
            console.log('[SCANNER] ✅ Success!');
            
            // ✅ INSTANT SUCCESS FEEDBACK
            setResult({ 
                success: true, 
                message: data.message || 'Attendance marked successfully!' 
            });
            
            // ✅ AUTO-CLOSE after 1.5s
            setTimeout(() => {
                setScanning(false);
                setProcessing(false);
                onClose();
            }, 1500);
    
        } catch (error: any) {
            console.error('[SCANNER] ❌ Error:', error.message);
            
            // ✅ INSTANT ERROR FEEDBACK
            setResult({
                success: false,
                message: error.message || 'Failed to scan QR code',
            });
            
            // ✅ QUICK RETRY: Clear after 2s
            setTimeout(() => {
                setResult(null);
                processingRef.current = false;
                setProcessing(false);
                lastScannedCodeRef.current = '';
            }, 2000);
        }
    }, [onClose]);

    // ✅ Silent error handler (no console spam)
    const onScanFailure = useCallback((_error: string) => {
        // Intentionally empty - ignore scan failures
    }, []);

    useEffect(() => {
        if (!scanning) {
            isScanningRef.current = false;
            return;
        }

        if (isScanningRef.current && html5QrRef.current) {
            return;
        }

        isScanningRef.current = true;
        isCleaningUpRef.current = false;

        const setupScanner = async () => {
            try {
                await new Promise(resolve => setTimeout(resolve, 100));

                const regionId = 'qr-reader';
                const elem = document.getElementById(regionId);
                
                if (!elem) {
                    throw new Error('Scanner element not found');
                }

                if (!isScanningRef.current) return;

                if (html5QrRef.current) {
                    try {
                        await html5QrRef.current.stop();
                        await html5QrRef.current.clear();
                    } catch (e) {
                        console.warn('[SCANNER] Cleanup failed:', e);
                    }
                    html5QrRef.current = null;
                }

                if (!isScanningRef.current) return;

                html5QrRef.current = new Html5Qrcode(regionId);

                // ✅ OPTIMIZED: High FPS for fast scanning
                const config = {
                    fps: 60,
                    qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
                        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                        const size = Math.max(220, Math.min(360, Math.floor(minEdge * 0.78)));
                        return { width: size, height: size };
                    },
                    aspectRatio: 1.0,
                    disableFlip: false,
                };

                const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

                if (isMobile) {
                    try {
                        await html5QrRef.current.start(
                            { facingMode: { exact: 'environment' } },
                            config,
                            onScanSuccess,
                            onScanFailure
                        );
                        return;
                    } catch {
                        try {
                            await html5QrRef.current.start(
                                { facingMode: { ideal: 'environment' } },
                                config,
                                onScanSuccess,
                                onScanFailure
                            );
                            return;
                        } catch {
                            await html5QrRef.current.start(
                                { facingMode: 'environment' },
                                config,
                                onScanSuccess,
                                onScanFailure
                            );
                            return;
                        }
                    }
                }

                let cameras: Array<{ id: string; label: string }> = [];
                try {
                    cameras = await Html5Qrcode.getCameras();
                } catch {
                    cameras = [];
                }

                if (cameras.length > 0) {
                    const backCamera = cameras.find(c => {
                        const label = (c.label || '').toLowerCase();
                        return label.includes('back') || label.includes('rear') || label.includes('environment');
                    });

                    const selectedCamera = backCamera || cameras[cameras.length - 1];

                    try {
                        await html5QrRef.current.start(
                            selectedCamera.id,
                            config,
                            onScanSuccess,
                            onScanFailure
                        );
                        return;
                    } catch {
                        // Continue to fallback
                    }
                }

                try {
                    await html5QrRef.current.start(
                        { facingMode: 'environment' },
                        config,
                        onScanSuccess,
                        onScanFailure
                    );
                    return;
                } catch {
                    // Continue to final fallback
                }

                await html5QrRef.current.start(
                    { facingMode: 'user' },
                    config,
                    onScanSuccess,
                    onScanFailure
                );

            } catch (err: any) {
                console.error('[SCANNER] Init failed:', err);
                if (isScanningRef.current) {
                    setResult({
                        success: false,
                        message: 'Camera access denied. Please enable camera permissions.',
                    });
                    setScanning(false);
                }
            }
        };

        setupScanner();

        return () => {
            isScanningRef.current = false;
            isCleaningUpRef.current = true;
            const inst = html5QrRef.current;
            if (!inst) return;

            inst
                .stop()
                .then(() => inst.clear())
                .catch((err) => {
                    console.warn('[SCANNER] Cleanup error:', err);
                })
                .finally(() => {
                    if (html5QrRef.current === inst) {
                        html5QrRef.current = null;
                    }
                });
        };
    }, [scanning, onScanSuccess, onScanFailure]);

    const startScanning = () => {
        if (!selectedClass) {
            alert('Please select a class first');
            return;
        }

        console.log('[SCANNER] 🎬 Starting scanner for class:', selectedClass);
        setResult(null);
        setProcessing(false);
        lastScannedCodeRef.current = '';
        lastScanTimeRef.current = 0;
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
                        onClick={() => {
                            stopScanning();
                            onClose();
                        }}
                        className="p-2 hover:bg-teal-700 rounded-lg transition-colors cursor-pointer"
                    >
                        <X className="w-5 h-5 md:w-6 md:h-6 text-white" />
                    </button>
                </div>

                <div className="p-4 md:p-6 space-y-4 md:space-y-6 overflow-y-auto flex-1">
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
                                                        onClick={() => setSelectedClass(cls.classid)}
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
                            {/* QR Reader */}
                            <div className="w-full max-w-md mx-auto">
                                <div className="relative aspect-square rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
                                    <div id="qr-reader" className="absolute inset-0" />
                                    
                                    {/* ✅ LOADING OVERLAY while processing */}
                                    {processing && !result && (
                                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-10">
                                            <div className="bg-white rounded-2xl p-6 shadow-2xl">
                                                <div className="w-12 h-12 border-4 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                                                <p className="text-sm font-semibold text-slate-900">Processing...</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Success/Error Notification */}
                            {result && (
                                <div className="w-full max-w-md mx-auto animate-slideUp">
                                    <div className={`
                                        relative rounded-2xl p-4 shadow-2xl backdrop-blur-md border-2
                                        ${result.success 
                                            ? 'bg-emerald-500/95 border-emerald-400' 
                                            : 'bg-rose-500/95 border-rose-400'
                                        }
                                    `}>
                                        <div className="flex items-start gap-3">
                                            <div className={`flex-shrink-0 ${result.success ? 'animate-bounceIn' : 'animate-shake'}`}>
                                                {result.success ? (
                                                    <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center">
                                                        <CheckCircle className="w-6 h-6 text-emerald-600" strokeWidth={2.5} />
                                                    </div>
                                                ) : (
                                                    <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center">
                                                        <AlertCircle className="w-6 h-6 text-rose-600" strokeWidth={2.5} />
                                                    </div>
                                                )}
                                            </div>
                                            
                                            <div className="flex-1 min-w-0 pt-0.5">
                                                <p className="font-bold text-white text-base mb-1">
                                                    {result.success ? 'Success!' : 'Error'}
                                                </p>
                                                <p className="text-sm text-white/90 leading-snug">
                                                    {result.message}
                                                </p>
                                                
                                                {result.success && (
                                                    <div className="mt-3">
                                                        <div className="w-full bg-white/30 rounded-full h-1 overflow-hidden">
                                                            <div className="h-full bg-white rounded-full animate-progressBar" />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <style jsx global>{`
                                #qr-reader video {
                                    width: 100% !important;
                                    height: 100% !important;
                                    object-fit: cover !important;
                                }
                                #qr-reader__dashboard,
                                #qr-reader__dashboard_section,
                                #qr-reader__status_span,
                                #qr-reader__header_message {
                                    display: none !important;
                                }
                                #qr-reader__scan_region {
                                    min-height: 100% !important;
                                }
                                
                                @keyframes slideUp {
                                    from {
                                        transform: translateY(20px);
                                        opacity: 0;
                                    }
                                    to {
                                        transform: translateY(0);
                                        opacity: 1;
                                    }
                                }
                                
                                @keyframes bounceIn {
                                    0% { transform: scale(0); }
                                    50% { transform: scale(1.2); }
                                    100% { transform: scale(1); }
                                }
                                
                                @keyframes shake {
                                    0%, 100% { transform: translateX(0); }
                                    25% { transform: translateX(-8px); }
                                    75% { transform: translateX(8px); }
                                }
                                
                                @keyframes progressBar {
                                    from { width: 0%; }
                                    to { width: 100%; }
                                }
                                
                                .animate-slideUp {
                                    animation: slideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
                                }
                                
                                .animate-bounceIn {
                                    animation: bounceIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
                                }
                                
                                .animate-shake {
                                    animation: shake 0.4s ease-in-out;
                                }
                                
                                .animate-progressBar {
                                    animation: progressBar 1.5s linear forwards;
                                }
                            `}</style>

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
