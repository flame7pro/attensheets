'use client';

import React, { useState } from 'react';
import { X, Smartphone, AlertCircle, Send, Monitor, Chrome, Apple, Check } from 'lucide-react';

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

  const getDeviceIcon = () => {
    const osLower = deviceInfo.os.toLowerCase();
    if (osLower.includes('windows') || osLower.includes('linux')) {
      return <Monitor className="w-6 h-6 md:w-7 md:h-7 text-emerald-600" />;
    } else if (osLower.includes('mac') || osLower.includes('ios')) {
      return <Apple className="w-6 h-6 md:w-7 md:h-7 text-emerald-600" />;
    }
    return <Smartphone className="w-6 h-6 md:w-7 md:h-7 text-emerald-600" />;
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-scale-in max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="relative bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 px-6 md:px-8 py-8 md:py-10">
          <button
            onClick={onClose}
            disabled={submitting}
            className="absolute top-4 right-4 md:top-6 md:right-6 p-2 hover:bg-white/20 rounded-xl transition-all duration-200 disabled:opacity-50 group"
          >
            <X className="w-5 h-5 md:w-6 md:h-6 text-white group-hover:rotate-90 transition-transform duration-200" />
          </button>

          <div className="flex flex-col md:flex-row items-center md:items-start gap-4 md:gap-5">
            <div className="w-16 h-16 md:w-20 md:h-20 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center shadow-lg">
              <Smartphone className="w-8 h-8 md:w-10 md:h-10 text-white" />
            </div>
            <div className="text-center md:text-left flex-1">
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
                New Device Detected
              </h2>
              <p className="text-emerald-50 text-sm md:text-base">
                Request access to login from this device
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 md:p-8 space-y-6">
          {/* Device Info Card */}
          <div className="bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-2xl p-5 md:p-6 border border-slate-200/50 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              {getDeviceIcon()}
              <h3 className="text-base md:text-lg font-bold text-slate-900">
                Device Information
              </h3>
            </div>
            
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-0 py-2 border-b border-slate-200/50">
                <span className="text-sm text-slate-600 font-medium">Device Type</span>
                <span className="text-sm md:text-base font-semibold text-slate-900">{deviceInfo.name}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-0 py-2 border-b border-slate-200/50">
                <span className="text-sm text-slate-600 font-medium">Browser</span>
                <span className="text-sm md:text-base font-semibold text-slate-900">{deviceInfo.browser}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-0 py-2">
                <span className="text-sm text-slate-600 font-medium">Operating System</span>
                <span className="text-sm md:text-base font-semibold text-slate-900">{deviceInfo.os}</span>
              </div>
            </div>
          </div>

          {/* Monthly Limit Warning */}
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200/50 rounded-2xl p-4 md:p-5 shadow-sm">
            <div className="flex items-start gap-3 md:gap-4">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5 md:w-6 md:h-6 text-amber-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm md:text-base font-bold text-amber-900 mb-1.5">
                  Monthly Request Limit
                </h3>
                <p className="text-xs md:text-sm text-amber-800 leading-relaxed mb-3">
                  You can request up to 3 new devices per month. Your teacher will review and respond to this request.
                </p>
                <div className="flex items-center gap-2 bg-white/60 rounded-lg px-3 py-2 border border-amber-200/50">
                  <div className="flex items-center gap-1.5">
                    {[...Array(3)].map((_, i) => (
                      <div
                        key={i}
                        className={`w-2 h-2 rounded-full ${
                          i < remainingRequests ? 'bg-emerald-500' : 'bg-slate-300'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-xs md:text-sm font-bold text-amber-900">
                    {remainingRequests} request{remainingRequests !== 1 ? 's' : ''} remaining
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Reason Input */}
          <div className="space-y-2">
            <label className="block text-sm md:text-base font-bold text-slate-900">
              Why do you need access from this device? <span className="text-rose-500">*</span>
            </label>
            <p className="text-xs md:text-sm text-slate-600 mb-3">
              Help your teacher understand why you need to use this device
            </p>
            <div className="relative">
              <textarea
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setError('');
                }}
                placeholder="Example: I got a new phone and need to check my attendance on it..."
                rows={4}
                maxLength={200}
                disabled={submitting}
                className="w-full px-4 py-3 md:py-4 border-2 border-slate-200 rounded-xl md:rounded-2xl focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 transition-all resize-none disabled:opacity-50 disabled:cursor-not-allowed text-sm md:text-base text-slate-900 placeholder:text-slate-400"
              />
              <div className="absolute bottom-3 right-3 text-xs text-slate-400">
                {reason.length}/200
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs md:text-sm text-slate-600">
              <div className={`w-2 h-2 rounded-full ${reason.length >= 10 ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
              <span>Minimum 10 characters required</span>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border-2 border-red-200 rounded-xl md:rounded-2xl p-4 flex items-start gap-3 animate-slide-down">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-red-700 text-sm md:text-base font-medium">{error}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <button
              onClick={onClose}
              disabled={submitting}
              className="flex-1 px-6 py-3.5 md:py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl md:rounded-2xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm md:text-base order-2 sm:order-1"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !reason.trim() || reason.trim().length < 10}
              className="flex-1 px-6 py-3.5 md:py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold rounded-xl md:rounded-2xl hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none flex items-center justify-center gap-2 text-sm md:text-base order-1 sm:order-2"
            >
              {submitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Submitting...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 md:w-5 md:h-5" />
                  <span>Submit Request</span>
                </>
              )}
            </button>
          </div>

          {/* Info Footer */}
          <div className="bg-emerald-50 border border-emerald-200/50 rounded-xl md:rounded-2xl p-4 mt-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Check className="w-4 h-4 md:w-5 md:h-5 text-emerald-600" />
              </div>
              <div>
                <h4 className="text-sm md:text-base font-semibold text-emerald-900 mb-1">
                  What happens next?
                </h4>
                <p className="text-xs md:text-sm text-emerald-700 leading-relaxed">
                  Your teacher will receive a notification and review your request. Once approved, 
                  you'll be able to log in from this device. You'll receive an update via email.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
