'use client';

import React, { useState } from 'react';
import { X, BookOpen, AlertCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth-context-email';

interface EnrollmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const StudentEnrollmentModal: React.FC<EnrollmentModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { user } = useAuth();
  const [step, setStep] = useState<'class-id' | 'student-info'>('class-id');
  const [classId, setClassId] = useState('');
  const [classInfo, setClassInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rollNo, setRollNo] = useState('');

  const studentName = user?.name || '';
  const studentEmail = user?.email || '';

  const parseErrorMessage = (errorData: any): string => {
    if (typeof errorData === 'string') {
      return errorData;
    }
    if (errorData.detail) {
      if (Array.isArray(errorData.detail)) {
        return errorData.detail.map((err: any) => {
          if (typeof err === 'string') return err;
          if (err.msg) return err.msg;
          return 'Validation error';
        }).join(', ');
      }
      if (typeof errorData.detail === 'string') {
        return errorData.detail;
      }
    }
    if (errorData.message) {
      return errorData.message;
    }
    return 'An error occurred';
  };

  const handleVerifyClass = async () => {
    if (!classId.trim()) {
      setError('Please enter a Class ID');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/class/verify/${classId}`
      );

      if (response.ok) {
        const data = await response.json();
        setClassInfo(data);
        setStep('student-info');
      } else {
        const errorData = await response.json().catch(() => ({}));
        setError(parseErrorMessage(errorData) || 'Class not found. Please check the Class ID');
      }
    } catch (err) {
      console.error('Verify class error:', err);
      setError('Failed to verify class. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleEnroll = async () => {
    if (!rollNo.trim()) {
      setError('Please enter your roll number');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // ✅ FIXED - Check BOTH sessionStorage AND localStorage
      const token = sessionStorage.getItem('access_token') || localStorage.getItem('access_token');
      
      if (!token) {
        setError('Please login again');
        return;
      }
      
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/student/enroll`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            class_id: classId,
            name: studentName,
            rollNo: rollNo.trim(),
            email: studentEmail
          })
        }
      );

      const data = await response.json();

      if (response.ok) {
        onSuccess();
        setStep('class-id');
        setClassId('');
        setClassInfo(null);
        setRollNo('');
        setError('');
      } else {
        const errorMessage = parseErrorMessage(data);

        if (errorMessage.includes('already enrolled')) {
          setError('You are already enrolled in this class. Check your dashboard.');
        } else if (errorMessage.includes('not found')) {
          setError('Class not found. The teacher may have deleted it.');
        } else if (errorMessage.includes('must use your registered email')) {
          setError('Security error: Email mismatch. Please contact support.');
        } else {
          setError(errorMessage || 'Failed to enroll. Please try again.');
        }
      }
    } catch (err) {
      console.error('Enrollment error:', err);
      setError('Failed to enroll. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep('class-id');
    setClassId('');
    setClassInfo(null);
    setRollNo('');
    setError('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl md:rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-600 to-emerald-600 px-4 sm:px-6 md:px-8 py-4 sm:py-5 md:py-6 relative">
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 sm:top-5 sm:right-5 md:top-6 md:right-6 text-white/80 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
          <div className="flex items-center gap-2 sm:gap-3 pr-8">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/20 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-white truncate">Enroll in Class</h2>
              <p className="text-teal-50 text-xs sm:text-sm mt-0.5 sm:mt-1">
                {step === 'class-id' ? 'Enter the Class ID' : 'Enter your information'}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 md:p-8">
          {error && (
            <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-red-50 border-l-4 border-red-500 rounded-lg flex items-start gap-2 sm:gap-3 animate-shake">
              <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-red-700 text-xs sm:text-sm">{error}</p>
            </div>
          )}

          {step === 'class-id' ? (
            <>
              <div className="mb-4 sm:mb-6">
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                  Class ID
                </label>
                <input
                  type="text"
                  value={classId}
                  onChange={(e) => setClassId(e.target.value.toUpperCase())}
                  placeholder="Enter Class ID from your teacher"
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border-2 border-gray-200 rounded-lg sm:rounded-xl text-sm sm:text-base text-black focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200 transition-colors cursor-text"
                  autoFocus
                  disabled={loading}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && classId.trim() && !loading) {
                      handleVerifyClass();
                    }
                  }}
                />
                <p className="text-xs text-gray-500 mt-2">
                  💡 Ask your teacher for the Class ID
                </p>
              </div>

              <button
                onClick={handleVerifyClass}
                disabled={!classId.trim() || loading}
                className="w-full py-2.5 sm:py-3 bg-teal-600 hover:bg-teal-700 text-white text-sm sm:text-base font-medium rounded-lg sm:rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-sm sm:text-base">Verifying...</span>
                  </>
                ) : (
                  'Continue'
                )}
              </button>
            </>
          ) : (
            <>
              {classInfo && (
                <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-teal-50 rounded-lg sm:rounded-xl border-2 border-teal-200">
                  <h3 className="font-semibold text-teal-900 text-base sm:text-lg truncate">{classInfo.class_name}</h3>
                  <p className="text-xs sm:text-sm text-teal-700 mt-1 truncate">👨‍🏫 Teacher: {classInfo.teacher_name}</p>
                  <p className="text-xs text-teal-600 mt-1">🆔 Class ID: {classInfo.class_id}</p>
                </div>
              )}

              {/* Read-only Name */}
              <div className="mb-3 sm:mb-4">
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                  Your Name
                </label>
                <input
                  type="text"
                  value={studentName}
                  disabled
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border-2 border-gray-200 rounded-lg sm:rounded-xl text-sm sm:text-base text-gray-600 bg-gray-50 cursor-not-allowed"
                />
                <p className="text-xs text-teal-600 mt-1">
                  ℹ️ Using your account name
                </p>
              </div>

              {/* Editable Roll Number */}
              <div className="mb-3 sm:mb-4">
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                  Roll Number *
                </label>
                <input
                  type="text"
                  value={rollNo}
                  onChange={(e) => setRollNo(e.target.value)}
                  placeholder="e.g., 101 or CS-101"
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border-2 border-gray-200 rounded-lg sm:rounded-xl text-sm sm:text-base text-black focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200 transition-colors cursor-text"
                  disabled={loading}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && rollNo.trim() && !loading) {
                      handleEnroll();
                    }
                  }}
                />
              </div>

              {/* Read-only Email */}
              <div className="mb-4 sm:mb-6">
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={studentEmail}
                  disabled
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border-2 border-gray-200 rounded-lg sm:rounded-xl text-sm sm:text-base text-gray-600 bg-gray-50 cursor-not-allowed"
                />
                <p className="text-xs text-teal-600 mt-1">
                  ℹ️ Using your account email
                </p>
              </div>

              {/* Buttons */}
              <div className="flex gap-2 sm:gap-3">
                <button
                  onClick={() => {
                    setStep('class-id');
                    setError('');
                    setRollNo('');
                  }}
                  disabled={loading}
                  className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm sm:text-base font-medium rounded-lg sm:rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  onClick={handleEnroll}
                  disabled={!rollNo.trim() || loading}
                  className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 bg-teal-600 hover:bg-teal-700 text-white text-sm sm:text-base font-medium rounded-lg sm:rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-sm sm:text-base">Enrolling...</span>
                    </>
                  ) : (
                    'Enroll'
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
