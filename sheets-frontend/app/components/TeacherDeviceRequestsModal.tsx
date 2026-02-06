'use client';

import React, { useState, useEffect } from 'react';
import { X, Smartphone, Check, XCircle, Calendar, User, AlertCircle, RefreshCw, Trash2, Shield, Search } from 'lucide-react';

interface DeviceRequest {
  id: string;
  student_id: string;
  student_name: string;
  student_email: string;
  device_id: string;
  device_info: {
    name: string;
    browser: string;
    os: string;
    device: string;
  };
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

interface StudentDevice {
  student_id: string;
  student_name: string;
  student_email: string;
  devices: {
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
  }[];
}

interface TeacherDeviceRequestsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'requests' | 'devices';

export const TeacherDeviceRequestsModal: React.FC<TeacherDeviceRequestsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('requests');
  const [requests, setRequests] = useState<DeviceRequest[]>([]);
  const [studentDevices, setStudentDevices] = useState<StudentDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, activeTab]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      
      const token = sessionStorage.getItem('access_token') || localStorage.getItem('access_token');
      
      if (activeTab === 'requests') {
        await loadRequests(token);
      } else {
        await loadStudentDevices(token);
      }
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadRequests = async (token: string | null) => {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/teacher/device-requests`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    if (response.ok) {
      const data = await response.json();
      setRequests(data.requests || []);
    } else {
      setError('Failed to load device requests');
    }
  };

  const loadStudentDevices = async (token: string | null) => {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/teacher/student-devices`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    if (response.ok) {
      const data = await response.json();
      setStudentDevices(data.students || []);
    } else {
      setError('Failed to load student devices');
    }
  };

  const handleRespond = async (requestId: string, action: 'approve' | 'reject') => {
    try {
      setProcessing(requestId);
      setError('');
      
      const token = sessionStorage.getItem('access_token') || localStorage.getItem('access_token');
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/teacher/device-requests/${requestId}/respond`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ action })
        }
      );

      if (response.ok) {
        await loadData();
      } else {
        const data = await response.json();
        setError(data.detail || 'Failed to process request');
      }
    } catch (err) {
      console.error('Error processing request:', err);
      setError('Failed to process request');
    } finally {
      setProcessing(null);
    }
  };

  const handleRemoveDevice = async (studentId: string, deviceId: string, studentName: string) => {
    if (!confirm(`Remove this device from ${studentName}'s account? They will need to request access again.`)) {
      return;
    }

    try {
      setProcessing(deviceId);
      setError('');
      
      const token = sessionStorage.getItem('access_token') || localStorage.getItem('access_token');
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/teacher/student-devices/${studentId}/${deviceId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (response.ok) {
        await loadData();
      } else {
        const data = await response.json();
        setError(data.detail || 'Failed to remove device');
      }
    } catch (err) {
      console.error('Error removing device:', err);
      setError('Failed to remove device');
    } finally {
      setProcessing(null);
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

  const filteredDevices = studentDevices.filter(student => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    
    return student.student_name.toLowerCase().includes(query) ||
           student.student_email.toLowerCase().includes(query) ||
           student.devices.some(d => 
             d.name.toLowerCase().includes(query) ||
             d.browser.toLowerCase().includes(query) ||
             d.os.toLowerCase().includes(query)
           );
  });

  const pendingRequests = requests.filter(r => r.status === 'pending');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col animate-scale-in">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 md:px-8 py-6 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                <Smartphone className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-white">Device Management</h2>
                <p className="text-emerald-100 text-sm mt-1">Manage student device access</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={loadData}
                disabled={loading}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw className={`w-5 h-5 text-white ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mt-6">
            <button
              onClick={() => setActiveTab('requests')}
              className={`flex-1 px-4 py-3 rounded-xl font-medium transition-all ${
                activeTab === 'requests'
                  ? 'bg-white text-emerald-700 shadow-md'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Shield className="w-4 h-4" />
                <span>Pending Requests</span>
                {pendingRequests.length > 0 && (
                  <span className="px-2 py-0.5 bg-rose-500 text-white text-xs font-bold rounded-full">
                    {pendingRequests.length}
                  </span>
                )}
              </div>
            </button>
            <button
              onClick={() => setActiveTab('devices')}
              className={`flex-1 px-4 py-3 rounded-xl font-medium transition-all ${
                activeTab === 'devices'
                  ? 'bg-white text-emerald-700 shadow-md'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Smartphone className="w-4 h-4" />
                <span>All Devices</span>
              </div>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-slate-600">Loading...</p>
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
          ) : activeTab === 'requests' ? (
            /* Requests Tab */
            pendingRequests.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">No Pending Requests</h3>
                <p className="text-slate-600">All device requests have been processed</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingRequests.map((request) => (
                  <div
                    key={request.id}
                    className="bg-gradient-to-br from-white to-slate-50 rounded-xl p-5 md:p-6 border border-slate-200 hover:border-emerald-300 hover:shadow-md transition-all"
                  >
                    {/* Student Info */}
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <User className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-slate-900">{request.student_name}</h3>
                          <p className="text-sm text-slate-600">{request.student_email}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-xs text-slate-500 mb-1">
                          <Calendar className="w-3 h-3" />
                          <span>{formatDate(request.created_at)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Device Info */}
                    <div className="bg-white rounded-lg p-4 mb-4 border border-slate-200">
                      <div className="flex items-center gap-2 mb-3">
                        <Smartphone className="w-4 h-4 text-emerald-600" />
                        <h4 className="text-sm font-semibold text-slate-900">Device Information</h4>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-slate-500 text-xs mb-1">Device</p>
                          <p className="text-slate-900 font-medium">{request.device_info.name}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs mb-1">Type</p>
                          <p className="text-slate-900 font-medium">{request.device_info.device}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs mb-1">Browser</p>
                          <p className="text-slate-900 font-medium">{request.device_info.browser}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs mb-1">OS</p>
                          <p className="text-slate-900 font-medium">{request.device_info.os}</p>
                        </div>
                      </div>
                    </div>

                    {/* Reason */}
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                      <h4 className="text-sm font-semibold text-amber-900 mb-2">Reason for Request</h4>
                      <p className="text-sm text-amber-800 leading-relaxed">{request.reason}</p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleRespond(request.id, 'approve')}
                        disabled={processing === request.id}
                        className="flex-1 px-4 py-3 bg-gradient-to-r from-emerald-600 to-green-600 text-white font-medium rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {processing === request.id ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            Processing...
                          </>
                        ) : (
                          <>
                            <Check className="w-4 h-4" />
                            Approve
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleRespond(request.id, 'reject')}
                        disabled={processing === request.id}
                        className="flex-1 px-4 py-3 bg-gradient-to-r from-rose-600 to-red-600 text-white font-medium rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        <XCircle className="w-4 h-4" />
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            /* Devices Tab */
            <>
              {/* Search Bar */}
              <div className="mb-6">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by student name, email, or device..."
                    className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      <X className="w-4 h-4 text-slate-400" />
                    </button>
                  )}
                </div>
              </div>

              {filteredDevices.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Smartphone className="w-8 h-8 text-slate-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">
                    {searchQuery ? 'No devices found' : 'No Devices Registered'}
                  </h3>
                  <p className="text-slate-600">
                    {searchQuery ? `No devices match "${searchQuery}"` : 'Students haven\'t registered any devices yet'}
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {filteredDevices.map((student) => (
                    <div key={student.student_id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      {/* Student Header */}
                      <div className="bg-gradient-to-r from-emerald-50 to-teal-50 px-6 py-4 border-b border-slate-200">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
                            <User className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-slate-900">{student.student_name}</h3>
                            <p className="text-sm text-slate-600">{student.student_email}</p>
                          </div>
                          <div className="ml-auto">
                            <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-full">
                              {student.devices.length} {student.devices.length === 1 ? 'Device' : 'Devices'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Devices List */}
                      <div className="p-6 space-y-4">
                        {student.devices.map((device) => (
                          <div key={device.id} className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-3">
                                  <div className="w-8 h-8 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                    <Smartphone className="w-4 h-4 text-blue-600" />
                                  </div>
                                  <div>
                                    <h4 className="font-semibold text-slate-900">{device.name}</h4>
                                    <p className="text-xs text-slate-600">{device.device}</p>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3 text-sm">
                                  <div>
                                    <p className="text-slate-500 text-xs mb-1">Browser</p>
                                    <p className="text-slate-900 font-medium">{device.browser}</p>
                                  </div>
                                  <div>
                                    <p className="text-slate-500 text-xs mb-1">OS</p>
                                    <p className="text-slate-900 font-medium">{device.os}</p>
                                  </div>
                                  <div>
                                    <p className="text-slate-500 text-xs mb-1">First Seen</p>
                                    <p className="text-slate-900 font-medium text-xs">{formatDate(device.first_seen)}</p>
                                  </div>
                                  <div>
                                    <p className="text-slate-500 text-xs mb-1">Last Seen</p>
                                    <p className="text-slate-900 font-medium text-xs">{formatDate(device.last_seen)}</p>
                                  </div>
                                </div>

                                {device.approved_by && (
                                  <div className="mt-3 pt-3 border-t border-slate-200">
                                    <p className="text-xs text-slate-600">
                                      Approved by <span className="font-semibold text-emerald-700">{device.approved_by}</span>
                                      {device.approved_at && ` on ${formatDate(device.approved_at)}`}
                                    </p>
                                  </div>
                                )}

                                <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
                                  <span>Total logins: <strong className="text-slate-700">{device.login_count}</strong></span>
                                </div>
                              </div>

                              {/* Remove Button */}
                              <button
                                onClick={() => handleRemoveDevice(student.student_id, device.id, student.student_name)}
                                disabled={processing === device.id}
                                className="p-2 hover:bg-rose-50 rounded-lg transition-colors group disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                                title="Remove device"
                              >
                                {processing === device.id ? (
                                  <div className="w-5 h-5 border-2 border-rose-500 border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                  <Trash2 className="w-5 h-5 text-slate-400 group-hover:text-rose-600 transition-colors" />
                                )}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
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
