'use client';

import React, { useState } from 'react';
import { X, Smartphone, AlertCircle, Send } from 'lucide-react';

interface DeviceRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviceInfo: {
    id: string;
    name: string;
    browser: string;
    os: string;
  };
  remainingRequests: number;
  onSubmit: (reason: string) => Promise<void>;
}

export const DeviceRequestModal: React.FC<DeviceRequestModalProps> = ({
  isOpen,
  onClose,
  deviceInfo,
  remainingRequests,
  onSubmit,
}) => {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!reason.trim()) {
      setError('Please provide a reason for this request');
      return;
    }

    if (reason.trim().length < 10) {
      setError('Please provide a more detailed reason (at least 10 characters)');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await onSubmit(reason);
      setReason('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 md:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                <Smartphone className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-white">Request Device Access</h2>
                <p className="text-blue-100 text-sm mt-1">New device detected</p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={submitting}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 md:p-8 space-y-6">
          {/* Device Info */}
          <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-4 border border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-blue-600" />
              Device Information
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Device:</span>
                <span className="font-medium text-slate-900">{deviceInfo.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Browser:</span>
                <span className="font-medium text-slate-900">{deviceInfo.browser}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">OS:</span>
                <span className="font-medium text-slate-900">{deviceInfo.os}</span>
              </div>
            </div>
          </div>

          {/* Warning */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-amber-900 mb-1">Monthly Limit</h3>
              <p className="text-xs text-amber-700 leading-relaxed">
                You have <span className="font-bold">{remainingRequests} request{remainingRequests !== 1 ? 's' : ''}</span> remaining this month.
                Your teacher will review and approve/reject this request.
              </p>
            </div>
          </div>

          {/* Reason Input */}
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">
              Reason for Request <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setError('');
              }}
              placeholder="E.g., Got a new phone, lost previous device, etc."
              rows={4}
              disabled={submitting}
              className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all resize-none disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <p className="text-xs text-slate-500 mt-1">
              Minimum 10 characters • {reason.length}/200
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              disabled={submitting}
              className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !reason.trim() || reason.trim().length < 10}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Submit Request
                </>
              )}
            </button>
          </div>

          {/* Info Footer */}
          <div className="text-center pt-4 border-t border-slate-200">
            <p className="text-xs text-slate-500">
              Once approved, you'll be able to log in from this device
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
