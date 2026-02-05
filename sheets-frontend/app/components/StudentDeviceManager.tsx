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

      const url = `${process.env.NEXT_PUBLIC_API_URL}/admin/student-devices/${encodeURIComponent(studentEmail)}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(errorData.detail || `Failed to fetch devices`);
      }

      const data = await response.json();
      setDevices(data.devices || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load devices');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveDevice = async (deviceHash: string) => {
    if (!confirm('Are you sure you want to remove this device?')) {
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
    if (!confirm(`⚠️ WARNING: This will remove ALL trusted devices for ${studentName}. Continue?`)) {
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
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 md:px-8 py-6 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-slate-900">Device Management</h2>
              <p className="text-slate-600 text-sm mt-1">Managing devices for <span className="font-semibold">{studentName}</span></p>
              <p className="text-slate-500 text-xs mt-0.5">{studentEmail}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-slate-600" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 md:p-8 overflow-y-auto max-h-[calc(90vh-200px)]">
          {/* Messages */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-700 text-sm">{success}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3 mb-6">
            <button
              onClick={() => setShowAddModal(true)}
              disabled={loading}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium text-sm disabled:opacity-50"
            >
              <Plus className="w-4 h-4 inline-block mr-2" />
              Add Device
            </button>

            <button
              onClick={handleResetAllDevices}
              disabled={devices.length === 0 || loading}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm disabled:opacity-50"
            >
              <RefreshCw className="w-4 h-4 inline-block mr-2" />
              Reset All
            </button>

            <button
              onClick={fetchDevices}
              disabled={loading}
              className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors font-medium text-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 inline-block mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {/* Device List */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mb-4" />
              <p className="text-slate-600">Loading devices...</p>
            </div>
          ) : devices.length === 0 ? (
            <div className="text-center py-12">
              <Shield className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600 font-medium mb-2">No trusted devices found</p>
              <p className="text-slate-500 text-sm">Student hasn't logged in yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {devices.map((device, index) => {
                const DeviceIcon = getDeviceIcon(device.device_type);
                return (
                  <div
                    key={device.device_hash || index}
                    className="bg-slate-50 border border-slate-200 rounded-xl p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex gap-4 flex-1">
                        <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <DeviceIcon className="w-6 h-6 text-emerald-600" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold text-slate-900">{device.name}</h3>
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">Trusted</span>
                          </div>

                          <div className="grid grid-cols-2 gap-3 text-sm mb-2">
                            <div>
                              <p className="text-slate-500 text-xs">Browser</p>
                              <p className="text-slate-700 font-medium">{device.browser}</p>
                            </div>
                            <div>
                              <p className="text-slate-500 text-xs">OS</p>
                              <p className="text-slate-700 font-medium">{device.os}</p>
                            </div>
                            <div>
                              <p className="text-slate-500 text-xs">First Seen</p>
                              <p className="text-slate-700 text-xs">{formatDate(device.first_seen)}</p>
                            </div>
                            <div>
                              <p className="text-slate-500 text-xs">Last Login</p>
                              <p className="text-slate-700 text-xs">{formatDate(device.last_seen)}</p>
                            </div>
                          </div>

                          <p className="text-xs text-slate-600">
                            <span className="font-semibold">{device.login_count}</span> total logins
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => handleRemoveDevice(device.device_hash || '')}
                        disabled={devices.length === 1}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        title={devices.length === 1 ? "Cannot remove last device" : "Remove device"}
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 md:px-8 py-4 bg-slate-50 border-t border-slate-200">
          <p className="text-xs text-slate-600 text-center">
            ⚠️ Device changes take effect immediately
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
      const deviceFingerprint = await getDeviceFingerprint();

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
            new_device_id: deviceFingerprint.id,
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
      setError(err.message || 'Failed to add device');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="px-6 md:px-8 py-6 border-b border-slate-200">
          <h3 className="text-2xl font-bold text-slate-900">Add Trusted Device</h3>
          <p className="text-slate-600 text-sm mt-1">For {studentName}</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 md:p-8">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm">
            <p className="font-semibold mb-1">ℹ️ Auto-Generated Device ID</p>
            <p className="text-xs">A unique device ID will be automatically generated</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Device Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.device_name}
                onChange={(e) => setFormData({ ...formData, device_name: e.target.value })}
                placeholder="e.g., Student's iPhone 13"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                disabled={loading}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Browser <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.browser}
                  onChange={(e) => setFormData({ ...formData, browser: e.target.value })}
                  placeholder="e.g., Chrome"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  OS <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.os}
                  onChange={(e) => setFormData({ ...formData, os: e.target.value })}
                  placeholder="e.g., iOS 17"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Device Type
              </label>
              <select
                value={formData.device_type}
                onChange={(e) => setFormData({ ...formData, device_type: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                disabled={loading}
              >
                <option value="">Select type</option>
                <option value="Mobile">Mobile</option>
                <option value="Tablet">Tablet</option>
                <option value="Laptop">Laptop</option>
                <option value="Desktop">Desktop</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Reason
              </label>
              <textarea
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                placeholder="e.g., Student got new phone"
                rows={2}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                disabled={loading}
              />
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 inline-block mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 inline-block mr-2" />
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
