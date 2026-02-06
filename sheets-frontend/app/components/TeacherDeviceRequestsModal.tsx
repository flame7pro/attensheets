'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, Smartphone, Check, XCircle, Calendar, User, AlertCircle, 
  RefreshCw, Trash2, Shield, Search, ChevronRight, ArrowLeft 
} from 'lucide-react';

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
type DevicesView = 'list' | 'detail';

export const TeacherDeviceRequestsModal: React.FC<TeacherDeviceRequestsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('requests');
  const [devicesView, setDevicesView] = useState<DevicesView>('list');
  const [selectedStudent, setSelectedStudent] = useState<StudentDevice | null>(null);
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

  // Reset view when switching tabs
  useEffect(() => {
    setDevicesView('list');
    setSelectedStudent(null);
    setSearchQuery('');
  }, [activeTab]);

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
        // If we're viewing this student, refresh the selected student data
        if (selectedStudent?.student_id === studentId) {
          const updatedStudent = studentDevices.find(s => s.student_id === studentId);
          if (updatedStudent) {
            setSelectedStudent(updatedStudent);
          } else {
            // No devices left, go back to list
            setDevicesView('list');
            setSelectedStudent(null);
          }
        }
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

  const handleStudentClick = (student: StudentDevice) => {
    setSelectedStudent(student);
    setDevicesView('detail');
  };

  const handleBackToList = () => {
    setDevicesView('list');
    setSelectedStudent(null);
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
           student.student_email.toLowerCase().includes(query);
  });

  const pendingRequests = requests.filter(r => r.status === 'pending');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-scale-in">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 sm:px-6 md:px-8 py-4 sm:py-6 flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Back button for detail view */}
              {activeTab === 'devices' && devicesView === 'detail' && (
                <button
                  onClick={handleBackToList}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors mr-1"
                  title="Back to list"
                >
                  <ArrowLeft className="w-5 h-5 text-white" />
                </button>
              )}
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/20 rounded-xl flex items-center justify-center">
                <Smartphone className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-white">
                  {activeTab === 'devices' && devicesView === 'detail' 
                    ? selectedStudent?.student_name 
                    : 'Device Management'}
                </h2>
                <p className="text-emerald-100 text-xs sm:text-sm mt-0.5 sm:mt-1">
                  {activeTab === 'devices' && devicesView === 'detail'
                    ? selectedStudent?.student_email
                    : 'Manage student device access'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                onClick={loadData}
                disabled={loading}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 text-white ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </button>
            </div>
          </div>

          {/* Tabs - Only show when in list view */}
          {(activeTab === 'requests' || devicesView === 'list') && (
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('requests')}
                className={`flex-1 px-3 sm:px-4 py-2 sm:py-3 rounded-xl font-medium transition-all text-sm sm:text-base ${
                  activeTab === 'requests'
                    ? 'bg-white text-emerald-700 shadow-md'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                <div className="flex items-center justify-center gap-1 sm:gap-2">
                  <Shield className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Pending Requests</span>
                  <span className="sm:hidden">Requests</span>
                  {pendingRequests.length > 0 && (
                    <span className="px-1.5 sm:px-2 py-0.5 bg-rose-500 text-white text-xs font-bold rounded-full">
                      {pendingRequests.length}
                    </span>
                  )}
                </div>
              </button>
              <button
                onClick={() => setActiveTab('devices')}
                className={`flex-1 px-3 sm:px-4 py-2 sm:py-3 rounded-xl font-medium transition-all text-sm sm:text-base ${
                  activeTab === 'devices'
                    ? 'bg-white text-emerald-700 shadow-md'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                <div className="flex items-center justify-center gap-1 sm:gap-2">
                  <Smartphone className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">All Devices</span>
                  <span className="sm:hidden">Devices</span>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="w-10 h-10 sm:w-12 sm:h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-slate-600 text-sm sm:text-base">Loading...</p>
              </div>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 sm:p-4 flex items-start gap-2 sm:gap-3">
              <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-xs sm:text-sm font-semibold text-red-900 mb-1">Error</h3>
                <p className="text-xs sm:text-sm text-red-700">{error}</p>
              </div>
            </div>
          ) : activeTab === 'requests' ? (
            /* Requests Tab */
            pendingRequests.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-6 h-6 sm:w-8 sm:h-8 text-slate-400" />
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-slate-900 mb-2">No Pending Requests</h3>
                <p className="text-sm sm:text-base text-slate-600">All device requests have been processed</p>
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {pendingRequests.map((request) => (
                  <div
                    key={request.id}
                    className="bg-gradient-to-br from-white to-slate-50 rounded-xl p-4 sm:p-5 md:p-6 border border-slate-200 hover:border-emerald-300 hover:shadow-md transition-all"
                  >
                    {/* Student Info */}
                    <div className="flex items-start justify-between gap-3 sm:gap-4 mb-3 sm:mb-4">
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <User className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-slate-900 text-sm sm:text-base truncate">{request.student_name}</h3>
                          <p className="text-xs sm:text-sm text-slate-600 truncate">{request.student_email}</p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          <Calendar className="w-3 h-3" />
                          <span className="hidden sm:inline">{formatDate(request.created_at)}</span>
                          <span className="sm:hidden">{new Date(request.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        </div>
                      </div>
                    </div>

                    {/* Device Info */}
                    <div className="bg-white rounded-lg p-3 sm:p-4 mb-3 sm:mb-4 border border-slate-200">
                      <div className="flex items-center gap-2 mb-2 sm:mb-3">
                        <Smartphone className="w-3 h-3 sm:w-4 sm:h-4 text-emerald-600" />
                        <h4 className="text-xs sm:text-sm font-semibold text-slate-900">Device Information</h4>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:gap-3 text-xs sm:text-sm">
                        <div>
                          <p className="text-slate-500 text-xs mb-1">Device</p>
                          <p className="text-slate-900 font-medium truncate">{request.device_info.name}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs mb-1">Type</p>
                          <p className="text-slate-900 font-medium truncate">{request.device_info.device}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs mb-1">Browser</p>
                          <p className="text-slate-900 font-medium truncate">{request.device_info.browser}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs mb-1">OS</p>
                          <p className="text-slate-900 font-medium truncate">{request.device_info.os}</p>
                        </div>
                      </div>
                    </div>

                    {/* Reason */}
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 sm:p-4 mb-3 sm:mb-4">
                      <h4 className="text-xs sm:text-sm font-semibold text-amber-900 mb-2">Reason for Request</h4>
                      <p className="text-xs sm:text-sm text-amber-800 leading-relaxed">{request.reason}</p>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                      <button
                        onClick={() => handleRespond(request.id, 'approve')}
                        disabled={processing === request.id}
                        className="flex-1 px-3 sm:px-4 py-2 sm:py-3 bg-gradient-to-r from-emerald-600 to-green-600 text-white font-medium rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm sm:text-base"
                      >
                        {processing === request.id ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            <span>Processing...</span>
                          </>
                        ) : (
                          <>
                            <Check className="w-4 h-4" />
                            <span>Approve</span>
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleRespond(request.id, 'reject')}
                        disabled={processing === request.id}
                        className="flex-1 px-3 sm:px-4 py-2 sm:py-3 bg-gradient-to-r from-rose-600 to-red-600 text-white font-medium rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm sm:text-base"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>Reject</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : devicesView === 'list' ? (
            /* Student List View */
            <>
              {/* Search Bar */}
              <div className="mb-4 sm:mb-6">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search students..."
                    className="w-full pl-9 sm:pl-10 pr-10 sm:pr-12 py-2 sm:py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white text-sm sm:text-base"
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
                  <div className="w-12 h-12 sm:w-16 sm:h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Smartphone className="w-6 h-6 sm:w-8 sm:h-8 text-slate-400" />
                  </div>
                  <h3 className="text-base sm:text-lg font-semibold text-slate-900 mb-2">
                    {searchQuery ? 'No students found' : 'No Devices Registered'}
                  </h3>
                  <p className="text-sm sm:text-base text-slate-600">
                    {searchQuery ? `No students match "${searchQuery}"` : 'Students haven\'t registered any devices yet'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2 sm:space-y-3">
                  {filteredDevices.map((student) => (
                    <button
                      key={student.student_id}
                      onClick={() => handleStudentClick(student)}
                      className="w-full bg-white rounded-xl border border-slate-200 hover:border-emerald-300 hover:shadow-md transition-all p-4 sm:p-5 text-left group"
                    >
                      <div className="flex items-center gap-3 sm:gap-4">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center flex-shrink-0">
                          <User className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-slate-900 text-sm sm:text-base truncate group-hover:text-emerald-700 transition-colors">
                            {student.student_name}
                          </h3>
                          <p className="text-xs sm:text-sm text-slate-600 truncate">{student.student_email}</p>
                          <div className="flex items-center gap-2 mt-1 sm:mt-2">
                            <span className="px-2 sm:px-3 py-0.5 sm:py-1 bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-full">
                              {student.devices.length} {student.devices.length === 1 ? 'Device' : 'Devices'}
                            </span>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 text-slate-400 group-hover:text-emerald-600 transition-colors flex-shrink-0" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            /* Device Detail View */
            selectedStudent && (
              <div className="space-y-3 sm:space-y-4">
                {selectedStudent.devices.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <Smartphone className="w-6 h-6 sm:w-8 sm:h-8 text-slate-400" />
                    </div>
                    <h3 className="text-base sm:text-lg font-semibold text-slate-900 mb-2">No Devices</h3>
                    <p className="text-sm sm:text-base text-slate-600">This student hasn't registered any devices</p>
                  </div>
                ) : (
                  selectedStudent.devices.map((device) => (
                    <div key={device.id} className="bg-white rounded-xl p-4 sm:p-5 border border-slate-200 hover:border-emerald-200 transition-colors">
                      <div className="flex items-start justify-between gap-3 sm:gap-4 mb-3 sm:mb-4">
                        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
                            <Smartphone className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="font-semibold text-slate-900 text-sm sm:text-base truncate">{device.name}</h4>
                            <p className="text-xs sm:text-sm text-slate-600 truncate">{device.device}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveDevice(selectedStudent.student_id, device.id, selectedStudent.student_name)}
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

                      {/* Device Details Grid */}
                      <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-3 sm:mb-4 text-xs sm:text-sm">
                        <div>
                          <p className="text-slate-500 text-xs mb-1">Browser</p>
                          <p className="text-slate-900 font-medium truncate">{device.browser}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs mb-1">Operating System</p>
                          <p className="text-slate-900 font-medium truncate">{device.os}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs mb-1">First Seen</p>
                          <p className="text-slate-900 font-medium text-xs sm:text-sm">{formatDate(device.first_seen)}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs mb-1">Last Seen</p>
                          <p className="text-slate-900 font-medium text-xs sm:text-sm">{formatDate(device.last_seen)}</p>
                        </div>
                      </div>

                      {/* Approval Info */}
                      {device.approved_by && (
                        <div className="pt-3 sm:pt-4 border-t border-slate-200">
                          <p className="text-xs sm:text-sm text-slate-600">
                            <span className="text-slate-500">Approved by</span>{' '}
                            <span className="font-semibold text-emerald-700">{device.approved_by}</span>
                            {device.approved_at && (
                              <>
                                {' '}
                                <span className="text-slate-500">on</span> {formatDate(device.approved_at)}
                              </>
                            )}
                          </p>
                        </div>
                      )}

                      {/* Login Count */}
                      <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-slate-200">
                        <div className="flex items-center justify-between">
                          <span className="text-xs sm:text-sm text-slate-600">Total Logins</span>
                          <span className="text-sm sm:text-base font-bold text-emerald-700">{device.login_count}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-4 sm:px-6 md:px-8 py-3 sm:py-4 border-t border-slate-200 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 sm:py-3 bg-slate-600 hover:bg-slate-700 text-white font-medium rounded-xl transition-colors text-sm sm:text-base"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
