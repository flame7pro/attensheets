'use client';

import React, { useState, useEffect } from 'react';
import { 
  Smartphone, 
  Laptop, 
  Tablet, 
  Monitor,
  Plus, 
  Trash2, 
  RefreshCw, 
  Shield, 
  AlertTriangle,
  CheckCircle,
  Loader2,
  X,
  Clock,
  AlertCircle
} from 'lucide-react';
import { getDeviceFingerprint } from '@/lib/deviceFingerprint';

interface Device {
  device_hash?: string;
  name: string;
  browser: string;
  os: string;
  device_type: string;
  first_seen: string;
  last_seen: string;
  login_count: number;
}

interface StudentDeviceManagerProps {
  studentEmail: string;
  studentName: string;
  onClose: () => void;
}

export const StudentDeviceManager: React.FC<StudentDeviceManagerProps> = ({
  studentEmail,
  studentName,
  onClose
}) => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    console.log('[DEVICE_MANAGER] Loading devices for:', studentEmail, studentName);
    fetchDevices();
  }, [studentEmail]);

  const fetchDevices = async () => {
    try {
      setLoading(true);
      setError('');
      
      const token = localStorage.getItem('access_token');
      if (!token) {
        setError('Authentication token not found');
        setLoading(false);
        return;
      }

      console.log('[DEVICE_MANAGER] Fetching devices from API...');
      const url = `${process.env.NEXT_PUBLIC_API_URL}/admin/student-devices/${encodeURIComponent(studentEmail)}`;
      console.log('[DEVICE_MANAGER] API URL:', url);

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('[DEVICE_MANAGER] Response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        console.error('[DEVICE_MANAGER] API Error:', errorData);
        throw new Error(errorData.detail || `Failed to fetch devices (${response.status})`);
      }

      const data = await response.json();
      console.log('[DEVICE_MANAGER] Received data:', data);
      
      setDevices(data.devices || []);
      console.log('[DEVICE_MANAGER] ✅ Loaded', data.devices?.length || 0, 'devices');
    } catch (err: any) {
      console.error('[DEVICE_MANAGER] ❌ Error:', err);
      setError(err.message || 'Failed to load devices');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveDevice = async (deviceHash: string) => {
    if (!confirm('Are you sure you want to remove this device? The student will not be able to login from this device anymore.')) {
      return;
    }

    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/student-devices/remove`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            student_email: studentEmail,
            device_id: deviceHash
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(errorData.detail || 'Failed to remove device');
      }

      const data = await response.json();
      setSuccess(data.message || 'Device removed successfully');
      fetchDevices();

      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to remove device');
      setTimeout(() => setError(''), 5000);
    }
  };

  const handleResetAllDevices = async () => {
    if (!confirm(`⚠️ WARNING: This will remove ALL trusted devices for ${studentName}. They will need to re-register their device on next login. Continue?`)) {
      return;
    }

    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/student-devices/reset-all?student_email=${encodeURIComponent(studentEmail)}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(errorData.detail || 'Failed to reset devices');
      }

      const data = await response.json();
      setSuccess(data.message || 'All devices cleared successfully');
      fetchDevices();

      setTimeout(() => setSuccess(''), 5000);
    } catch (err: any) {
      setError(err.message || 'Failed to reset devices');
      setTimeout(() => setError(''), 5000);
    }
  };

  const getDeviceIcon = (deviceType: string) => {
    const type = deviceType.toLowerCase();
    if (type.includes('mobile') || type.includes('phone')) return Smartphone;
    if (type.includes('tablet') || type.includes('ipad')) return Tablet;
    if (type.includes('laptop')) return Laptop;
    return Monitor;
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 p-4 sm:p-6 text-white flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-6 h-6 sm:w-7 sm:h-7 flex-shrink-0" />
                <h2 className="text-xl sm:text-2xl font-bold truncate">Device Management</h2>
              </div>
              <p className="text-emerald-50 text-sm sm:text-base truncate">
                Managing devices for <span className="font-semibold">{studentName}</span>
              </p>
              <p className="text-emerald-100 text-xs sm:text-sm mt-1 truncate">{studentEmail}</p>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 sm:w-10 sm:h-10 bg-white/20 hover:bg-white/30 rounded-xl flex items-center justify-center transition-all flex-shrink-0 hover:rotate-90"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="p-3 sm:p-4 lg:p-6 space-y-3 flex-shrink-0">
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-3 sm:p-4 text-red-700 text-xs sm:text-sm flex items-start gap-2 animate-in slide-in-from-top">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold">Error</p>
                <p className="break-words">{error}</p>
              </div>
            </div>
          )}

          {success && (
            <div className="bg-green-50 border-l-4 border-green-500 rounded-lg p-3 sm:p-4 text-green-700 text-xs sm:text-sm flex items-center gap-2 animate-in slide-in-from-top">
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
              <span className="break-words">{success}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <button
              onClick={() => setShowAddModal(true)}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl hover:shadow-lg transition-all font-medium text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02]"
            >
              <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
              Add New Device
            </button>

            <button
              onClick={handleResetAllDevices}
              disabled={devices.length === 0 || loading}
              className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 bg-gradient-to-r from-red-600 to-rose-600 text-white rounded-xl hover:shadow-lg transition-all font-medium text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02]"
            >
              <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5" />
              Reset All Devices
            </button>

            <button
              onClick={fetchDevices}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:shadow-lg transition-all font-medium text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02]"
            >
              <RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {/* Device List */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-4 lg:px-6 pb-4 sm:pb-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 sm:py-20">
              <Loader2 className="w-12 h-12 sm:w-16 sm:h-16 text-emerald-600 animate-spin mb-4" />
              <p className="text-slate-600 text-sm sm:text-base">Loading devices...</p>
            </div>
          ) : devices.length === 0 ? (
            <div className="text-center py-16 sm:py-20">
              <Shield className="w-16 h-16 sm:w-20 sm:h-20 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600 font-medium text-base sm:text-lg mb-2">No trusted devices found</p>
              <p className="text-slate-500 text-sm sm:text-base px-4">
                Student hasn't logged in yet or all devices have been removed
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
              {devices.map((device, index) => {
                const DeviceIcon = getDeviceIcon(device.device_type);
                return (
                  <div
                    key={device.device_hash || index}
                    className="bg-gradient-to-br from-slate-50 to-slate-100 border-2 border-slate-200 rounded-xl p-4 sm:p-5 hover:shadow-xl transition-all hover:scale-[1.02] group"
                  >
                    <div className="flex items-start gap-3 sm:gap-4">
                      <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform shadow-lg">
                        <DeviceIcon className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-slate-900 text-base sm:text-lg truncate mb-1">
                              {device.name}
                            </h3>
                            <span className="inline-block px-2.5 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                              Trusted
                            </span>
                          </div>
                          <button
                            onClick={() => handleRemoveDevice(device.device_hash || '')}
                            disabled={devices.length === 1}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 group-hover:scale-110"
                            title={devices.length === 1 ? "Cannot remove last device" : "Remove device"}
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>

                        <div className="space-y-2.5">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-white/50 rounded-lg p-2">
                              <p className="text-slate-500 text-xs font-medium mb-0.5">Browser</p>
                              <p className="text-slate-700 font-semibold text-xs sm:text-sm truncate">{device.browser}</p>
                            </div>
                            <div className="bg-white/50 rounded-lg p-2">
                              <p className="text-slate-500 text-xs font-medium mb-0.5">OS</p>
                              <p className="text-slate-700 font-semibold text-xs sm:text-sm truncate">{device.os}</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-white/50 rounded-lg p-2">
                              <p className="text-slate-500 text-xs font-medium flex items-center gap-1 mb-0.5">
                                <Clock className="w-3 h-3" />
                                First Seen
                              </p>
                              <p className="text-slate-700 font-semibold text-xs">
                                {formatDate(device.first_seen)}
                              </p>
                            </div>
                            <div className="bg-white/50 rounded-lg p-2">
                              <p className="text-slate-500 text-xs font-medium flex items-center gap-1 mb-0.5">
                                <Clock className="w-3 h-3" />
                                Last Login
                              </p>
                              <p className="text-slate-700 font-semibold text-xs">
                                {formatDate(device.last_seen)}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                            <div className="text-xs text-slate-600">
                              <span className="font-bold text-emerald-600">{device.login_count}</span> total logins
                            </div>
                            {device.device_hash && (
                              <div className="text-xs text-slate-400 font-mono truncate max-w-[150px]">
                                {device.device_hash}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-t-2 border-amber-200 p-3 sm:p-4 text-center flex-shrink-0">
          <div className="flex items-center justify-center gap-2 text-amber-800">
            <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
            <p className="text-xs sm:text-sm font-medium">
              Device changes take effect immediately. Student will be logged out from removed devices.
            </p>
          </div>
        </div>
      </div>

      {/* Add Device Modal */}
      {showAddModal && (
        <AddDeviceModal
          studentEmail={studentEmail}
          studentName={studentName}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            fetchDevices();
            setShowAddModal(false);
          }}
        />
      )}
    </div>
  );
};

interface AddDeviceModalProps {
  studentEmail: string;
  studentName: string;
  onClose: () => void;
  onSuccess: () => void;
}

const AddDeviceModal: React.FC<AddDeviceModalProps> = ({
  studentEmail,
  studentName,
  onClose,
  onSuccess
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    device_name: '',
    browser: '',
    os: '',
    device_type: '',
    reason: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.device_name || !formData.browser || !formData.os) {
      setError('Please fill in all required fields');
      return;
    }

    setLoading(true);
    try {
      // ✅ AUTO-GENERATE device fingerprint
      console.log('🔍 Generating device fingerprint...');
      const deviceFingerprint = await getDeviceFingerprint();
      console.log('✅ Device fingerprint generated:', deviceFingerprint.id);

      const token = localStorage.getItem('access_token');
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/student-devices/add`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            student_email: studentEmail,
            new_device_id: deviceFingerprint.id,  // ✅ Use auto-generated ID
            new_device_info: {
              name: formData.device_name,
              browser: formData.browser,
              os: formData.os,
              device: formData.device_type || 'Desktop'
            },
            reason: formData.reason || 'Added by administrator'
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(errorData.detail || 'Failed to add device');
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to add device. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-3 sm:p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] overflow-hidden flex flex-col animate-in slide-in-from-bottom">
        <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 p-4 sm:p-6 text-white flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="text-lg sm:text-xl font-bold mb-1">Add New Trusted Device</h3>
              <p className="text-emerald-100 text-xs sm:text-sm truncate">For {studentName}</p>
            </div>
            <button
              onClick={onClose}
              disabled={loading}
              className="w-9 h-9 bg-white/20 hover:bg-white/30 rounded-xl flex items-center justify-center transition-all flex-shrink-0 hover:rotate-90 disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-3 text-red-700 text-xs sm:text-sm animate-in slide-in-from-top">
              {error}
            </div>
          )}

          <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border-l-4 border-blue-500 rounded-lg p-3 sm:p-4">
            <div className="flex items-start gap-2">
              <Shield className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-blue-900 text-sm sm:text-base mb-1">🔐 Auto-Generated Device ID</p>
                <p className="text-blue-700 text-xs sm:text-sm">
                  A unique device fingerprint will be automatically generated from your current browser when you click "Add Device".
                </p>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              Device Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.device_name}
              onChange={(e) => setFormData({ ...formData, device_name: e.target.value })}
              placeholder="e.g., Student's iPhone 13"
              className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 transition-all text-sm sm:text-base"
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Browser <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.browser}
                onChange={(e) => setFormData({ ...formData, browser: e.target.value })}
                placeholder="e.g., Chrome 120"
                className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 transition-all text-sm sm:text-base"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Operating System <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.os}
                onChange={(e) => setFormData({ ...formData, os: e.target.value })}
                placeholder="e.g., iOS 17"
                className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 transition-all text-sm sm:text-base"
                disabled={loading}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              Device Type
            </label>
            <select
              value={formData.device_type}
              onChange={(e) => setFormData({ ...formData, device_type: e.target.value })}
              className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 transition-all text-sm sm:text-base bg-white"
              disabled={loading}
            >
              <option value="">Select device type</option>
              <option value="Mobile">📱 Mobile Phone</option>
              <option value="Tablet">📱 Tablet</option>
              <option value="Laptop">💻 Laptop</option>
              <option value="Desktop">🖥️ Desktop</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              Reason for Adding
            </label>
            <textarea
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              placeholder="e.g., Student got a new phone and needs access"
              rows={3}
              className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 transition-all resize-none text-sm sm:text-base"
              disabled={loading}
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-3 border-2 border-slate-300 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-all disabled:opacity-50 text-sm sm:text-base"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm sm:text-base hover:scale-[1.02]"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Adding Device...
                </>
              ) : (
                <>
                  <Plus className="w-5 h-5" />
                  Add Device
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
