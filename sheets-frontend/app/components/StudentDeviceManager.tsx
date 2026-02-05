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
  Clock
} from 'lucide-react';

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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 sm:p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold mb-1">Device Management</h2>
              <p className="text-blue-100 text-xs sm:text-sm">
                Managing devices for <span className="font-semibold">{studentName}</span>
              </p>
              <p className="text-blue-200 text-xs mt-1">{studentEmail}</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="p-4 sm:p-6 space-y-3">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 sm:p-4 text-red-700 text-xs sm:text-sm flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Error</p>
                <p>{error}</p>
              </div>
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 sm:p-4 text-green-700 text-xs sm:text-sm flex items-center gap-2">
              <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
              {success}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <button
              onClick={() => setShowAddModal(true)}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium text-xs sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-3 h-3 sm:w-4 sm:h-4" />
              Add New Device
            </button>

            <button
              onClick={handleResetAllDevices}
              disabled={devices.length === 0 || loading}
              className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-xs sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className="w-3 h-3 sm:w-4 sm:h-4" />
              Reset All Devices
            </button>

            <button
              onClick={fetchDevices}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-xs sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-3 h-3 sm:w-4 sm:h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Device List */}
        <div className="px-4 sm:px-6 pb-4 sm:pb-6 max-h-[500px] overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-4" />
              <p className="text-slate-600 text-sm">Loading devices...</p>
            </div>
          ) : devices.length === 0 ? (
            <div className="text-center py-12">
              <Shield className="w-12 h-12 sm:w-16 sm:h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600 font-medium text-sm sm:text-base">No trusted devices found</p>
              <p className="text-slate-500 text-xs sm:text-sm mt-1">
                Student hasn't logged in yet or all devices have been removed
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {devices.map((device, index) => {
                const DeviceIcon = getDeviceIcon(device.device_type);
                return (
                  <div
                    key={device.device_hash || index}
                    className="bg-slate-50 border border-slate-200 rounded-xl p-3 sm:p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex gap-3 sm:gap-4 flex-1 min-w-0">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <DeviceIcon className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold text-slate-900 text-sm sm:text-base truncate">
                              {device.name}
                            </h3>
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium flex-shrink-0">
                              Trusted
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-xs sm:text-sm">
                            <div>
                              <p className="text-slate-500 text-xs">Browser</p>
                              <p className="text-slate-700 font-medium truncate">{device.browser}</p>
                            </div>
                            <div>
                              <p className="text-slate-500 text-xs">Operating System</p>
                              <p className="text-slate-700 font-medium truncate">{device.os}</p>
                            </div>
                            <div>
                              <p className="text-slate-500 text-xs flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                First Seen
                              </p>
                              <p className="text-slate-700 font-medium text-xs">
                                {formatDate(device.first_seen)}
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-500 text-xs flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Last Login
                              </p>
                              <p className="text-slate-700 font-medium text-xs">
                                {formatDate(device.last_seen)}
                              </p>
                            </div>
                          </div>

                          <div className="mt-3 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
                            <div className="text-xs text-slate-600">
                              <span className="font-semibold">{device.login_count}</span> total logins
                            </div>
                            {device.device_hash && (
                              <div className="text-xs text-slate-500 font-mono truncate max-w-full">
                                ID: {device.device_hash}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleRemoveDevice(device.device_hash || '')}
                        disabled={devices.length === 1}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                        title={devices.length === 1 ? "Cannot remove last device" : "Remove device"}
                      >
                        <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-200 p-3 sm:p-4 text-center">
          <p className="text-xs text-slate-600">
            ⚠️ Device changes take effect immediately. Student will be logged out from removed devices.
          </p>
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
    device_id: '',
    device_name: '',
    browser: '',
    os: '',
    device_type: '',
    reason: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.device_id || !formData.device_name || !formData.browser || !formData.os) {
      setError('Please fill in all required fields');
      return;
    }

    setLoading(true);
    try {
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
            new_device_id: formData.device_id,
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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-4 sm:p-6 text-white rounded-t-2xl sticky top-0">
          <h3 className="text-lg sm:text-xl font-bold mb-1">Add New Trusted Device</h3>
          <p className="text-emerald-100 text-xs sm:text-sm">For {studentName}</p>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-xs sm:text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-2">
              Device ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.device_id}
              onChange={(e) => setFormData({ ...formData, device_id: e.target.value })}
              placeholder="e.g., ABC123XYZ789"
              className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all text-sm"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-2">
              Device Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.device_name}
              onChange={(e) => setFormData({ ...formData, device_name: e.target.value })}
              placeholder="e.g., Student's iPhone 13"
              className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all text-sm"
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-2">
                Browser <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.browser}
                onChange={(e) => setFormData({ ...formData, browser: e.target.value })}
                placeholder="e.g., Chrome"
                className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all text-sm"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-2">
                OS <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.os}
                onChange={(e) => setFormData({ ...formData, os: e.target.value })}
                placeholder="e.g., iOS 17"
                className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all text-sm"
                disabled={loading}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-2">
              Device Type
            </label>
            <select
              value={formData.device_type}
              onChange={(e) => setFormData({ ...formData, device_type: e.target.value })}
              className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all text-sm"
              disabled={loading}
            >
              <option value="">Select device type</option>
              <option value="Mobile">Mobile Phone</option>
              <option value="Tablet">Tablet</option>
              <option value="Laptop">Laptop</option>
              <option value="Desktop">Desktop</option>
            </select>
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-2">
              Reason for Adding
            </label>
            <textarea
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              placeholder="e.g., Student got a new phone"
              rows={2}
              className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all resize-none text-sm"
              disabled={loading}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-3 sm:px-4 py-2 sm:py-2.5 border-2 border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-3 sm:px-4 py-2 sm:py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
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
