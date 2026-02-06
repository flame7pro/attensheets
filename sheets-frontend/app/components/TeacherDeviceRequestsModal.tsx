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

interface ConfirmationModal {
  isOpen: boolean;
  type: 'approve' | 'reject' | 'delete' | null;
  title: string;
  message: string;
  data?: any;
}

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
  
  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<ConfirmationModal>({
    isOpen: false,
    type: null,
    title: '',
    message: '',
    data: null
  });

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, activeTab]);

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

  const showApproveConfirmation = (request: DeviceRequest) => {
    setConfirmModal({
      isOpen: true,
      type: 'approve',
      title: 'Approve Device Request?',
      message: `Allow ${request.student_name} to access their account from "${request.device_info.name}"?`,
      data: request
    });
  };

  const showRejectConfirmation = (request: DeviceRequest) => {
    setConfirmModal({
      isOpen: true,
      type: 'reject',
      title: 'Reject Device Request?',
      message: `Deny ${request.student_name}'s request to use "${request.device_info.name}"?`,
      data: request
    });
  };

  const showDeleteConfirmation = (studentId: string, deviceId: string, studentName: string, deviceName: string, deviceCount: number) => {
    if (deviceCount <= 1) {
      setError('Cannot remove the only device. Student must have at least one trusted device.');
      setTimeout(() => setError(''), 3000);
      return;
    }

    setConfirmModal({
      isOpen: true,
      type: 'delete',
      title: 'Remove Device?',
      message: `Remove "${deviceName}" from ${studentName}'s account? They will no longer be able to login from this device.`,
      data: { studentId, deviceId, studentName }
    });
  };

  const handleConfirmAction = async () => {
    if (!confirmModal.type || !confirmModal.data) return;

    try {
      setProcessing(confirmModal.data.id || confirmModal.data.deviceId);
      setError('');
      setConfirmModal({ ...confirmModal, isOpen: false });

      const token = sessionStorage.getItem('access_token') || localStorage.getItem('access_token');

      if (confirmModal.type === 'approve' || confirmModal.type === 'reject') {
        const request = confirmModal.data as DeviceRequest;
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/teacher/device-requests/${request.id}/respond`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ action: confirmModal.type })
          }
        );

        if (response.ok) {
          await loadData();
        } else {
          const data = await response.json();
          setError(data.detail || 'Failed to process request');
        }
      } else if (confirmModal.type === 'delete') {
        const { studentId, deviceId, studentName } = confirmModal.data;
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
          if (selectedStudent?.student_id === studentId) {
            const updatedStudent = studentDevices.find(s => s.student_id === studentId);
            if (updatedStudent && updatedStudent.devices.length > 0) {
              setSelectedStudent(updatedStudent);
            } else {
              setDevicesView('list');
              setSelectedStudent(null);
            }
          }
        } else {
          const data = await response.json();
          setError(data.detail || 'Failed to remove device');
        }
      }
    } catch (err) {
      console.error('Error processing action:', err);
      setError('Failed to process action');
    } finally {
      setProcessing(null);
    }
  };

  const handleCancelConfirmation = () => {
    setConfirmModal({
      isOpen: false,
      type: null,
      title: '',
      message: '',
      data: null
    });
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
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  const formatDateTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
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
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50">
        <div className="bg-white w-full sm:w-[95vw] sm:max-w-3xl h-[95vh] sm:h-auto sm:max-h-[90vh] sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-4 flex-shrink-0">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {activeTab === 'devices' && devicesView === 'detail' && (
                  <button
                    onClick={handleBackToList}
                    className="p-1.5 hover:bg-white/20 rounded-lg transition-colors flex-shrink-0"
                  >
                    <ArrowLeft className="w-5 h-5 text-white" />
                  </button>
                )}
                <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Smartphone className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold text-white truncate">
                    {activeTab === 'devices' && devicesView === 'detail' 
                      ? selectedStudent?.student_name 
                      : 'Device Management'}
                  </h2>
                  <p className="text-xs text-emerald-100 truncate">
                    {activeTab === 'devices' && devicesView === 'detail'
                      ? selectedStudent?.student_email
                      : 'Manage student devices'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={loadData}
                  disabled={loading}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-5 h-5 text-white ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>

            {/* Tabs */}
            {(activeTab === 'requests' || devicesView === 'list') && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setActiveTab('requests')}
                  className={`px-3 py-2.5 rounded-lg font-medium transition-all text-sm ${
                    activeTab === 'requests'
                      ? 'bg-white text-emerald-700 shadow-lg'
                      : 'bg-white/10 text-white'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <Shield className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">Requests</span>
                    {pendingRequests.length > 0 && (
                      <span className="px-1.5 py-0.5 bg-rose-500 text-white text-xs font-bold rounded-full flex-shrink-0">
                        {pendingRequests.length}
                      </span>
                    )}
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab('devices')}
                  className={`px-3 py-2.5 rounded-lg font-medium transition-all text-sm ${
                    activeTab === 'devices'
                      ? 'bg-white text-emerald-700 shadow-lg'
                      : 'bg-white/10 text-white'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <Smartphone className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">All Devices</span>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            <div className="p-4">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="text-center">
                    <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                    <p className="text-slate-600 text-sm">Loading...</p>
                  </div>
                </div>
              ) : error ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-semibold text-red-900">Error</h3>
                    <p className="text-xs text-red-700 mt-0.5">{error}</p>
                  </div>
                </div>
              ) : activeTab === 'requests' ? (
                /* Requests Tab */
                pendingRequests.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="w-16 h-16 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                      <Shield className="w-8 h-8 text-slate-400" />
                    </div>
                    <h3 className="text-base font-semibold text-slate-900 mb-1">No Pending Requests</h3>
                    <p className="text-sm text-slate-600">All requests processed</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pendingRequests.map((request) => (
                      <div
                        key={request.id}
                        className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm"
                      >
                        {/* Student */}
                        <div className="flex items-start gap-3 mb-3 pb-3 border-b border-slate-100">
                          <div className="w-10 h-10 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <User className="w-5 h-5 text-blue-600" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="font-semibold text-slate-900 text-sm truncate">{request.student_name}</h3>
                            <p className="text-xs text-slate-600 truncate">{request.student_email}</p>
                            <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                              <Calendar className="w-3 h-3" />
                              <span>{formatDateTime(request.created_at)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Device Info */}
                        <div className="mb-3">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                            <h4 className="text-xs font-semibold text-slate-900">Device Details</h4>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="bg-slate-50 rounded p-2">
                              <p className="text-slate-500 mb-0.5">Device</p>
                              <p className="text-slate-900 font-medium truncate">{request.device_info.name}</p>
                            </div>
                            <div className="bg-slate-50 rounded p-2">
                              <p className="text-slate-500 mb-0.5">Type</p>
                              <p className="text-slate-900 font-medium truncate">{request.device_info.device}</p>
                            </div>
                            <div className="bg-slate-50 rounded p-2">
                              <p className="text-slate-500 mb-0.5">Browser</p>
                              <p className="text-slate-900 font-medium truncate">{request.device_info.browser}</p>
                            </div>
                            <div className="bg-slate-50 rounded p-2">
                              <p className="text-slate-500 mb-0.5">OS</p>
                              <p className="text-slate-900 font-medium truncate">{request.device_info.os}</p>
                            </div>
                          </div>
                        </div>

                        {/* Reason */}
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
                          <h4 className="text-xs font-semibold text-amber-900 mb-1">Reason</h4>
                          <p className="text-xs text-amber-800 leading-relaxed">{request.reason}</p>
                        </div>

                        {/* Actions */}
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => showApproveConfirmation(request)}
                            disabled={processing === request.id}
                            className="px-3 py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 text-white font-medium rounded-lg text-sm disabled:opacity-50 flex items-center justify-center gap-1.5"
                          >
                            {processing === request.id ? (
                              <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                <span>Wait...</span>
                              </>
                            ) : (
                              <>
                                <Check className="w-4 h-4" />
                                <span>Approve</span>
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => showRejectConfirmation(request)}
                            disabled={processing === request.id}
                            className="px-3 py-2.5 bg-gradient-to-r from-rose-600 to-red-600 text-white font-medium rounded-lg text-sm disabled:opacity-50 flex items-center justify-center gap-1.5"
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
                /* Student List */
                <>
                  {/* Search */}
                  <div className="mb-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search students..."
                        className="w-full pl-9 pr-10 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                      />
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-slate-100 rounded"
                        >
                          <X className="w-4 h-4 text-slate-400" />
                        </button>
                      )}
                    </div>
                  </div>

                  {filteredDevices.length === 0 ? (
                    <div className="text-center py-16">
                      <div className="w-16 h-16 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                        <Smartphone className="w-8 h-8 text-slate-400" />
                      </div>
                      <h3 className="text-base font-semibold text-slate-900 mb-1">
                        {searchQuery ? 'No students found' : 'No Devices Yet'}
                      </h3>
                      <p className="text-sm text-slate-600 px-4">
                        {searchQuery ? `No match for "${searchQuery}"` : 'Students haven\'t registered devices'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredDevices.map((student) => (
                        <button
                          key={student.student_id}
                          onClick={() => handleStudentClick(student)}
                          className="w-full bg-white rounded-lg border border-slate-200 p-3.5 text-left active:bg-slate-50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-11 h-11 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center flex-shrink-0">
                              <User className="w-5 h-5 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-slate-900 text-sm truncate">
                                {student.student_name}
                              </h3>
                              <p className="text-xs text-slate-600 truncate">{student.student_email}</p>
                              <div className="mt-1.5">
                                <span className="inline-block px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-semibold rounded">
                                  {student.devices.length} {student.devices.length === 1 ? 'device' : 'devices'}
                                </span>
                              </div>
                            </div>
                            <ChevronRight className="w-5 h-5 text-slate-400 flex-shrink-0" />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                /* Device Details */
                selectedStudent && (
                  <div className="space-y-3">
                    {selectedStudent.devices.length === 0 ? (
                      <div className="text-center py-16">
                        <div className="w-16 h-16 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                          <Smartphone className="w-8 h-8 text-slate-400" />
                        </div>
                        <h3 className="text-base font-semibold text-slate-900 mb-1">No Devices</h3>
                        <p className="text-sm text-slate-600">No devices registered</p>
                      </div>
                    ) : (
                      selectedStudent.devices.map((device) => (
                        <div key={device.id} className="bg-white rounded-lg p-4 border border-slate-200">
                          {/* Header */}
                          <div className="flex items-start gap-3 mb-3 pb-3 border-b border-slate-100">
                            <div className="w-11 h-11 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                              <Smartphone className="w-5 h-5 text-blue-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-slate-900 text-sm truncate">{device.name}</h4>
                              <p className="text-xs text-slate-600 truncate">{device.device}</p>
                            </div>
                            <button
                              onClick={() => showDeleteConfirmation(
                                selectedStudent.student_id, 
                                device.id, 
                                selectedStudent.student_name,
                                device.name,
                                selectedStudent.devices.length
                              )}
                              disabled={processing === device.id || selectedStudent.devices.length <= 1}
                              className="p-2 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                              title={selectedStudent.devices.length <= 1 ? "Cannot remove the only device" : "Remove device"}
                            >
                              {processing === device.id ? (
                                <div className="w-5 h-5 border-2 border-rose-500 border-t-transparent rounded-full animate-spin"></div>
                              ) : (
                                <Trash2 className="w-5 h-5 text-slate-400" />
                              )}
                            </button>
                          </div>

                          {/* Details */}
                          <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                            <div className="bg-slate-50 rounded p-2">
                              <p className="text-slate-500 mb-0.5">Browser</p>
                              <p className="text-slate-900 font-medium truncate">{device.browser}</p>
                            </div>
                            <div className="bg-slate-50 rounded p-2">
                              <p className="text-slate-500 mb-0.5">OS</p>
                              <p className="text-slate-900 font-medium truncate">{device.os}</p>
                            </div>
                            <div className="bg-slate-50 rounded p-2">
                              <p className="text-slate-500 mb-0.5">First Seen</p>
                              <p className="text-slate-900 font-medium">{formatDate(device.first_seen)}</p>
                            </div>
                            <div className="bg-slate-50 rounded p-2">
                              <p className="text-slate-500 mb-0.5">Last Seen</p>
                              <p className="text-slate-900 font-medium">{formatDate(device.last_seen)}</p>
                            </div>
                          </div>

                          {/* Approval */}
                          {device.approved_by && (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 mb-3">
                              <p className="text-xs text-emerald-800">
                                <span className="font-semibold">Approved by {device.approved_by}</span>
                                {device.approved_at && ` on ${formatDate(device.approved_at)}`}
                              </p>
                            </div>
                          )}

                          {/* Login Count */}
                          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                            <span className="text-xs text-slate-600">Total Logins</span>
                            <span className="text-base font-bold text-emerald-700">{device.login_count}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="bg-slate-50 px-4 py-3 border-t border-slate-200 flex-shrink-0">
            <button
              onClick={onClose}
              className="w-full px-4 py-2.5 bg-slate-600 hover:bg-slate-700 active:bg-slate-800 text-white font-medium rounded-lg transition-colors text-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className={`px-6 py-4 ${
              confirmModal.type === 'approve' ? 'bg-emerald-50' :
              confirmModal.type === 'reject' ? 'bg-rose-50' :
              'bg-amber-50'
            }`}>
              <h3 className={`text-lg font-bold ${
                confirmModal.type === 'approve' ? 'text-emerald-900' :
                confirmModal.type === 'reject' ? 'text-rose-900' :
                'text-amber-900'
              }`}>
                {confirmModal.title}
              </h3>
            </div>

            {/* Content */}
            <div className="px-6 py-5">
              <p className="text-slate-700 leading-relaxed">
                {confirmModal.message}
              </p>
            </div>

            {/* Actions */}
            <div className="px-6 py-4 bg-slate-50 flex gap-3">
              <button
                onClick={handleCancelConfirmation}
                className="flex-1 px-4 py-2.5 bg-white border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAction}
                className={`flex-1 px-4 py-2.5 font-medium rounded-lg transition-colors ${
                  confirmModal.type === 'approve' 
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : confirmModal.type === 'reject'
                    ? 'bg-rose-600 hover:bg-rose-700 text-white'
                    : 'bg-amber-600 hover:bg-amber-700 text-white'
                }`}
              >
                {confirmModal.type === 'approve' ? 'Approve' :
                 confirmModal.type === 'reject' ? 'Reject' :
                 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
