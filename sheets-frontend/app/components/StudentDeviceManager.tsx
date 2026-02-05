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
    fetchDevices();
  }, [studentEmail]);

  const fetchDevices = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/student-devices/${studentEmail}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!response.ok) throw new Error('Failed to fetch devices');

      const data = await response.json();
      setDevices(data.devices || []);
    } catch (err) {
      setError('Failed to load devices');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveDevice = async (deviceHash: string) => {
    if (!confirm('Are you sure you want to remove this device? The student will not be able to login from this device anymore.')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
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

      if (!response.ok) throw new Error('Failed to remove device');

      const data = await response.json();
      setSuccess(data.message);
      fetchDevices();

      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Failed to remove device');
      console.error(err);
    }
  };

  const handleResetAllDevices = async () => {
    if (!confirm(`⚠️ WARNING: This will remove ALL trusted devices for ${studentName}. They will need to re-register their device on next login. Continue?`)) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/student-devices/reset-all?student_email=${studentEmail}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!response.ok) throw new Error('Failed to reset devices');

      const data = await response.json();
      setSuccess(data.message);
      fetchDevices();

      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      setError('Failed to reset devices');
      console.error(err);
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
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold mb-1">Device Management</h2>
              <p className="text-blue-100 text-sm">
                Managing devices for <span className="font-semibold">{studentName}</span>
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="p-6 space-y-3">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-green-700 text-sm flex items-center gap-2">
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
              {success}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium text-sm"
            >
              <Plus className="w-4 h-4" />
              Add New Device
            </button>

            <button
              onClick={handleResetAllDevices}
              disabled={devices.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className="w-4 h-4" />
              Reset All Devices
            </button>
          </div>
        </div>

        {/* Device List */}
        <div className="px-6 pb-6 max-h-[500px] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
          ) : devices.length === 0 ? (
            <div className="text-center py-12">
              <Shield className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600 font-medium">No trusted devices found</p>
              <p className="text-slate-500 text-sm mt-1">
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
                    className="bg-slate-50 border border-slate-200 rounded-xl p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex gap-4">
                        <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <DeviceIcon className="w-6 h-6 text-blue-600" />
                        </div>

                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold text-slate-900">
                              {device.name}
                            </h3>
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium">
                              Trusted
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <p className="text-slate-500 text-xs">Browser</p>
                              <p className="text-slate-700 font-medium">{device.browser}</p>
                            </div>
                            <div>
                              <p className="text-slate-500 text-xs">Operating System</p>
                              <p className="text-slate-700 font-medium">{device.os}</p>
                            </div>
                            <div>
                              <p className="text-slate-500 text-xs flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                First Seen
                              </p>
                              <p className="text-slate-700 font-medium">
                                {formatDate(device.first_seen)}
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-500 text-xs flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Last Login
                              </p>
                              <p className="text-slate-700 font-medium">
                                {formatDate(device.last_seen)}
                              </p>
                            </div>
                          </div>

                          <div className="mt-3 flex items-center gap-4">
                            <div className="text-xs text-slate-600">
                              <span className="font-semibold">{device.login_count}</span> total logins
                            </div>
                            {device.device_hash && (
                              <div className="text-xs text-slate-500 font-mono">
                                ID: {device.device_hash}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleRemoveDevice(device.device_hash || '')}
                        disabled={devices.length === 1}
                        className="ml-4 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div className="bg-slate-50 border-t border-slate-200 p-4 text-center">
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
      const token = localStorage.getItem('token');
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

      if (!response.ok) throw new Error('Failed to add device');

      onSuccess();
    } catch (err) {
      setError('Failed to add device. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-6 text-white rounded-t-2xl">
          <h3 className="text-xl font-bold mb-1">Add New Trusted Device</h3>
          <p className="text-emerald-100 text-sm">For {studentName}</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Device ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.device_id}
              onChange={(e) => setFormData({ ...formData, device_id: e.target.value })}
              placeholder="e.g., ABC123XYZ789"
              className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Device Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.device_name}
              onChange={(e) => setFormData({ ...formData, device_name: e.target.value })}
              placeholder="e.g., Student's iPhone 13"
              className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all"
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Browser <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.browser}
                onChange={(e) => setFormData({ ...formData, browser: e.target.value })}
                placeholder="e.g., Chrome"
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                OS <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.os}
                onChange={(e) => setFormData({ ...formData, os: e.target.value })}
                placeholder="e.g., iOS 17"
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all"
                disabled={loading}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Device Type
            </label>
            <select
              value={formData.device_type}
              onChange={(e) => setFormData({ ...formData, device_type: e.target.value })}
              className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all"
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
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Reason for Adding
            </label>
            <textarea
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              placeholder="e.g., Student got a new phone"
              rows={2}
              className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all resize-none"
              disabled={loading}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2.5 border-2 border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
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
