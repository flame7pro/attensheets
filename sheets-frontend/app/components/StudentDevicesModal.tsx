'use client';

import React, { useState, useEffect } from 'react';
import { X, Smartphone, Calendar, Shield, AlertCircle } from 'lucide-react';

interface TrustedDevice {
  id: string;
  name: string;
  browser: string;
  os: string;
  device: string;
  first_seen: string;
  last_seen: string;
  login_count: number;
  approved_by?: string;
  approved_at?: string;
}

interface StudentDevicesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const StudentDevicesModal: React.FC<StudentDevicesModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadDevices();
    }
  }, [isOpen]);

  const loadDevices = async () => {
    try {
      setLoading(true);
      setError('');
      
      const token = sessionStorage.getItem('access_token') || localStorage.getItem('access_token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/student/devices`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setDevices(data.devices || []);
      } else {
        setError('Failed to load devices');
      }
    } catch (err) {
      console.error('Error loading devices:', err);
      setError('Failed to load devices');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateString;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-scale-in">
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-600 to-cyan-600 px-6 md:px-8 py-6 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                <Smartphone className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-white">My Trusted Devices</h2>
                <p className="text-teal-100 text-sm mt-1">View your authorized devices</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-slate-600">Loading devices...</p>
              </div>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-red-900 mb-1">Error</h3>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          ) : devices.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Smartphone className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No Trusted Devices</h3>
              <p className="text-slate-600">
                You haven't authorized any devices yet
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Info Banner */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
                <Shield className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-blue-900 mb-1">Device Security</h3>
                  <p className="text-xs text-blue-700 leading-relaxed">
                    Only devices listed here can access your account. To remove a device or add a new one, please contact your teacher.
                  </p>
                </div>
              </div>

              {/* Devices List */}
              {devices.map((device) => (
                <div
                  key={device.id}
                  className="bg-gradient-to-br from-white to-slate-50 rounded-xl p-5 border border-slate-200 hover:border-teal-300 hover:shadow-md transition-all"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-teal-100 to-cyan-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Smartphone className="w-5 h-5 text-teal-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-slate-900 truncate">{device.name}</h3>
                          <p className="text-sm text-slate-600">{device.device}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-slate-500 text-xs mb-1">Browser</p>
                          <p className="text-slate-900 font-medium">{device.browser}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs mb-1">Operating System</p>
                          <p className="text-slate-900 font-medium">{device.os}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs mb-1 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            First Used
                          </p>
                          <p className="text-slate-900 font-medium text-xs">{formatDate(device.first_seen)}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs mb-1 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Last Used
                          </p>
                          <p className="text-slate-900 font-medium text-xs">{formatDate(device.last_seen)}</p>
                        </div>
                      </div>

                      {device.approved_by && (
                        <div className="mt-3 pt-3 border-t border-slate-200">
                          <p className="text-xs text-slate-600">
                            Approved by <span className="font-semibold text-teal-700">{device.approved_by}</span>
                            {device.approved_at && ` on ${formatDate(device.approved_at)}`}
                          </p>
                        </div>
                      )}

                      <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
                        <span>Total logins: <strong className="text-slate-700">{device.login_count}</strong></span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Help Text */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-amber-900 mb-1">Need to Change Devices?</h3>
                  <p className="text-xs text-amber-800 leading-relaxed">
                    If you need to remove a device or add a new one, please contact your teacher. They can manage your device access from their dashboard.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 md:px-8 py-4 border-t border-slate-200 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full px-4 py-3 bg-slate-600 hover:bg-slate-700 text-white font-medium rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
