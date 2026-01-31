'use client';

import React, { useState } from 'react';
import { X, Mail, Lock, Key } from 'lucide-react';
import { useAuth } from '@/lib/auth-context-email';

interface PasswordResetModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PasswordResetModal: React.FC<PasswordResetModalProps> = ({ isOpen, onClose }) => {
  const { requestPasswordReset, resetPassword } = useAuth();
  
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleRequestReset = async () => {
    setError('');
    setSuccess('');

    if (!email) {
      setError('Please enter your email');
      return;
    }

    setLoading(true);
    const result = await requestPasswordReset(email);
    setLoading(false);

    if (result.success) {
      setSuccess('Reset code sent to your email');
      setTimeout(() => {
        setStep('code');
        setSuccess('');
      }, 1500);
    } else {
      setError(result.message);
    }
  };

  const handleResetPassword = async () => {
    setError('');
    setSuccess('');

    if (!code || !newPassword || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    const result = await resetPassword(email, code, newPassword);
    setLoading(false);

    if (result.success) {
      setSuccess('Password reset successfully!');
      setTimeout(() => {
        handleClose();
      }, 1500);
    } else {
      setError(result.message);
    }
  };

  const handleClose = () => {
    setStep('email');
    setEmail('');
    setCode('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setSuccess('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-3">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-3 py-3 sm:px-4 sm:py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <Key className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-bold text-white truncate">Reset Password</h2>
                <p className="text-emerald-50 text-xs mt-0.5 truncate">
                  {step === 'email' ? 'Enter your email' : 'Enter verification code'}
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors cursor-pointer flex-shrink-0"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </button>
          </div>
        </div>

        <div className="p-3 sm:p-4">
          {error && (
            <div className="p-2.5 sm:p-3 bg-red-50 border border-red-200 rounded-lg mb-3">
              <p className="text-red-700 text-xs">{error}</p>
            </div>
          )}

          {success && (
            <div className="p-2.5 sm:p-3 bg-green-50 border border-green-200 rounded-lg mb-3">
              <p className="text-green-700 text-xs">{success}</p>
            </div>
          )}

          {step === 'email' ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-900 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-2.5 top-2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="john@example.com"
                    disabled={loading}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && email && !loading) {
                        handleRequestReset();
                      }
                    }}
                    className="w-full pl-9 pr-2.5 py-2 border-2 border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-colors disabled:opacity-50 cursor-text"
                    autoFocus
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1.5">
                  We'll send a verification code to this email
                </p>
              </div>

              <button
                onClick={handleRequestReset}
                disabled={loading}
                className="w-full px-3 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-bold rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading ? 'Sending...' : 'Send Reset Code'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-900 mb-1.5">
                  Verification Code
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="ENTER 6-DIGIT CODE"
                  maxLength={6}
                  className="w-full px-2.5 py-2 border-2 border-gray-200 rounded-lg text-sm text-center tracking-widest text-black focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-colors cursor-text"
                  autoFocus
                />
                <p className="text-xs text-slate-500 mt-1.5">
                  Check your email for the code
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-900 mb-1.5">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-2.5 top-2 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-2.5 py-2 border-2 border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-colors cursor-text"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-900 mb-1.5">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-2.5 top-2 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && code && newPassword && confirmPassword && !loading) {
                        handleResetPassword();
                      }
                    }}
                    className="w-full pl-9 pr-2.5 py-2 border-2 border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-colors cursor-text"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1.5">
                  Must be at least 8 characters
                </p>
              </div>

              <button
                onClick={handleResetPassword}
                disabled={loading}
                className="w-full px-3 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-bold rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>

              <button
                onClick={() => setStep('email')}
                className="w-full text-xs text-emerald-600 hover:text-emerald-700 font-medium cursor-pointer pt-1"
              >
                ← Back to email
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};