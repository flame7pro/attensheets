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

    const stopScanning = useCallback(() => {
        setScanning(false);
        setProcessing(false);
    }, []);

    const onScanSuccess = useCallback(async (decodedText: string) => {
        if (processing || isCleaningUpRef.current) return;
        setProcessing(true);

        console.log('[STUDENT SCANNER] ='.repeat(30));
        console.log('[STUDENT SCANNER] QR Code Scanned (RAW):', decodedText);

        try {
            let qrData: { class_id: string; date: string; code: string };

            try {
                qrData = JSON.parse(decodedText);
                console.log('[STUDENT SCANNER] ✅ Parsed QR data:', qrData);
            } catch (parseError) {
                console.error('[STUDENT SCANNER] ❌ Failed to parse QR code:', parseError);
                setResult({
                    success: false,
                    message: 'Invalid QR code format',
                });
                setProcessing(false);
                return;
            }

            if (!qrData.class_id || !qrData.date || !qrData.code) {
                console.error('[STUDENT SCANNER] ❌ Missing required fields');
                setResult({
                    success: false,
                    message: 'Invalid QR code - missing required data',
                });
                setProcessing(false);
                return;
            }

            if (qrData.class_id !== selectedClass) {
                console.error('[STUDENT SCANNER] ❌ Class mismatch');
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

            console.log('[STUDENT SCANNER] 📤 Sending to backend...');

            const qrCodeString = decodedText;
            const url = `${process.env.NEXT_PUBLIC_API_URL}/qr/scan?class_id=${qrData.class_id}&qr_code=${encodeURIComponent(qrCodeString)}`;

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
            });

            const data = await response.json();
            console.log('[STUDENT SCANNER] 📥 Response:', data);

            if (!response.ok) {
                throw new Error(data.detail || 'Failed to mark attendance');
            }

            console.log('[STUDENT SCANNER] ✅ SUCCESS!');
            setResult({ success: true, message: data.message || 'Attendance marked successfully!' });

            stopScanning();
            setTimeout(onClose, 3000);
        } catch (error: any) {
            console.error('[STUDENT SCANNER] ❌ Error:', error);
            setResult({
                success: false,
                message: error.message || 'Failed to scan QR code',
            });
            setProcessing(false);
        } finally {
            console.log('[STUDENT SCANNER] ='.repeat(30));
        }
    }, [processing, selectedClass, stopScanning, onClose]);

    const onScanFailure = useCallback((_error: string) => {
        // Ignore scan failures
    }, []);

    useEffect(() => {
        if (!scanning) {
            isScanningRef.current = false;
            return;
        }

        isScanningRef.current = true;
        isCleaningUpRef.current = false;

        const setupScanner = async () => {
            try {
                // Add a small delay to ensure DOM is ready
                await new Promise(resolve => setTimeout(resolve, 100));

                const regionId = 'qr-reader';
                const elem = document.getElementById(regionId);
                
                if (!elem) {
                    console.error('[SCANNER] Element not found');
                    throw new Error('Scanner element not found');
                }

                if (!isScanningRef.current) return;

                // Clean up any existing instance first
                if (html5QrRef.current) {
                    try {
                        await html5QrRef.current.stop();
                        await html5QrRef.current.clear();
                    } catch (e) {
                        console.warn('[SCANNER] Cleanup of existing instance failed:', e);
                    }
                    html5QrRef.current = null;
                }

                if (!isScanningRef.current) return;

                html5QrRef.current = new Html5Qrcode(regionId);

                const config = {
                    fps: 10,
                    qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
                        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                        const size = Math.max(220, Math.min(360, Math.floor(minEdge * 0.78)));
                        return { width: size, height: size };
                    },
                    aspectRatio: 1.0,
                };

                const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                console.log('[SCANNER] Is mobile:', isMobile);

                // For mobile, ONLY use facingMode constraints
                if (isMobile) {
                    console.log('[SCANNER] Starting with mobile environment camera');
                    try {
                        await html5QrRef.current.start(
                            { 
                                facingMode: { exact: 'environment' }
                            },
                            config,
                            onScanSuccess,
                            onScanFailure
                        );
                        console.log('[SCANNER] Mobile environment camera started successfully');
                        return;
                    } catch (e) {
                        console.warn('[SCANNER] Exact environment failed, trying ideal:', e);
                        try {
                            await html5QrRef.current.start(
                                { 
                                    facingMode: { ideal: 'environment' }
                                },
                                config,
                                onScanSuccess,
                                onScanFailure
                            );
                            console.log('[SCANNER] Mobile ideal environment camera started');
                            return;
                        } catch (e2) {
                            console.warn('[SCANNER] Ideal environment failed, trying basic:', e2);
                            await html5QrRef.current.start(
                                { 
                                    facingMode: 'environment'
                                },
                                config,
                                onScanSuccess,
                                onScanFailure
                            );
                            console.log('[SCANNER] Mobile basic environment camera started');
                            return;
                        }
                    }
                }

                // For desktop, try camera enumeration
                console.log('[SCANNER] Desktop mode - getting cameras');
                let cameras: Array<{ id: string; label: string }> = [];
                try {
                    cameras = await Html5Qrcode.getCameras();
                    console.log('[SCANNER] Found cameras:', cameras);
                } catch (e) {
                    console.warn('[SCANNER] getCameras failed:', e);
                    cameras = [];
                }

                if (cameras.length > 0) {
                    const backCamera = cameras.find(c => {
                        const label = (c.label || '').toLowerCase();
                        return label.includes('back') || label.includes('rear') || label.includes('environment');
                    });

                    const selectedCamera = backCamera || cameras[cameras.length - 1];
                    console.log('[SCANNER] Selected camera:', selectedCamera);

                    try {
                        await html5QrRef.current.start(
                            selectedCamera.id,
                            config,
                            onScanSuccess,
                            onScanFailure
                        );
                        console.log('[SCANNER] Camera started successfully');
                        return;
                    } catch (e) {
                        console.warn('[SCANNER] camera ID failed:', e);
                    }
                }

                // Fallback
                console.log('[SCANNER] Using fallback camera');
                try {
                    await html5QrRef.current.start(
                        { facingMode: 'environment' },
                        config,
                        onScanSuccess,
                        onScanFailure
                    );
                    return;
                } catch (e) {
                    console.warn('[SCANNER] environment fallback failed:', e);
                }

                await html5QrRef.current.start(
                    { facingMode: 'user' },
                    config,
                    onScanSuccess,
                    onScanFailure
                );

            } catch (err: any) {
                console.error('[SCANNER] Initialization failed:', err);
                if (isScanningRef.current) {
                    setResult({
                        success: false,
                        message: 'Camera access denied. Please enable camera permissions in your browser settings.',
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
                        onClick={() => {
                            setScanning(false);
                            setProcessing(false);
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
                            <div className="w-full max-w-md mx-auto">
                                <div className="relative aspect-square bg-black rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
                                    <div id="qr-reader" className="absolute inset-0" />
                                </div>
                            </div>

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
