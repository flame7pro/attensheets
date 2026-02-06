'use client';

import React, { useState, useEffect } from 'react';
import { X, Smartphone, Check, XCircle, Calendar, User, AlertCircle, RefreshCw } from 'lucide-react';

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

interface TeacherDeviceRequestsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TeacherDeviceRequestsModal: React.FC<TeacherDeviceRequestsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [requests, setRequests] = useState<DeviceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadRequests();
    }
  }, [isOpen]);

  const loadRequests = async () => {
    try {
      setLoading(true);
      setError('');
      
      const token = sessionStorage.getItem('access_token') || localStorage.getItem('access_token');
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
    } catch (err) {
      console.error('Error loading requests:', err);
      setError('Failed to load device requests');
    } finally {
      setLoading(false);
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
        // Refresh requests
        await loadRequests();
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-scale-in">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 md:px-8 py-6 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                <Smartphone className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-white">Device Requests</h2>
                <p className="text-emerald-100 text-sm mt-1">Review student device authorization requests</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={loadRequests}
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
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-slate-600">Loading requests...</p>
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
          ) : requests.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Smartphone className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No Pending Requests</h3>
              <p className="text-slate-600">
                All device requests have been processed
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {requests.map((request) => (
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
