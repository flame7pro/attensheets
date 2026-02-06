'use client';

import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, UserPlus, LogIn, GraduationCap, Users, CheckCircle, Loader2, Shield } from 'lucide-react';
import { useAuth } from '@/lib/auth-context-email';
import { useRouter } from 'next/navigation';
import { PasswordResetModal } from './PasswordResetModal';
import { DeviceRequestModal } from './DeviceRequestModal';

interface AuthFormProps {
  onModeChange?: (isSignUp: boolean) => void;
  setShowVerification: (show: boolean) => void;
  setVerificationEmail: (email: string) => void;
}

export const AuthForm: React.FC<AuthFormProps> = ({
  onModeChange,
  setShowVerification,
  setVerificationEmail
}) => {
  const router = useRouter();
  const { signup } = useAuth();
  const [isSignUp, setIsSignUp] = useState(true);
  const [selectedRole, setSelectedRole] = useState<'teacher' | 'student'>('teacher');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showResetModal, setShowResetModal] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showDeviceRequestModal, setShowDeviceRequestModal] = useState(false);
  const [newDeviceInfo, setNewDeviceInfo] = useState<any>(null);
  const [remainingDeviceRequests, setRemainingDeviceRequests] = useState(3);
  const [deviceRequestEmail, setDeviceRequestEmail] = useState('');
  const [deviceConsentGiven, setDeviceConsentGiven] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.name || !formData.email || !formData.password || !formData.confirmPassword) {
      setError('Please fill in all fields');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    if (selectedRole === 'student' && !deviceConsentGiven) {
      setError('Please agree to device fingerprinting to continue');
      return;
    }

    setLoading(true);
    try {
      localStorage.setItem('signup_role', selectedRole);
      const result = await signup(formData.email, formData.password, formData.name, selectedRole);

      if (result.success) {
        setSuccess(result.message);

        setTimeout(() => {
          setVerificationEmail(formData.email);
          setShowVerification(true);
          setFormData({ name: '', email: '', password: '', confirmPassword: '' });
          setDeviceConsentGiven(false);
        }, 800);
      } else {
        setError(result.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.email || !formData.password) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    
    try {
      console.log('[LOGIN] Starting login process...');
      console.log('[LOGIN] Role:', selectedRole);
      
      // Get device fingerprint for students
      let deviceId = null;
      let deviceInfo = null;
      
      if (selectedRole === 'student') {
        const { getDeviceFingerprint } = await import('@/lib/deviceFingerprint');
        const fingerprint = await getDeviceFingerprint();
        deviceId = fingerprint.id;
        deviceInfo = fingerprint;
        console.log('[LOGIN] Device fingerprint obtained:', deviceId.substring(0, 20) + '...');
      }

      // Determine the correct endpoint
      const endpoint = selectedRole === 'student' 
        ? '/auth/student/login' 
        : '/auth/login';
      
      console.log('[LOGIN] Calling endpoint:', endpoint);
      
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}${endpoint}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: formData.email,
            password: formData.password,
            device_id: deviceId,
            device_info: deviceInfo
          })
        }
      );

      console.log('[LOGIN] Response status:', response.status);

      const data = await response.json();
      console.log('[LOGIN] Response data:', data);

      // ✅ CRITICAL FIX: Check for successful response FIRST
      if (response.ok && data.access_token) {
        console.log('✅ [LOGIN] Login successful! Token received');
        
        // Store token and user data
        const storage = rememberMe ? localStorage : sessionStorage;
        storage.setItem('access_token', data.access_token);
        storage.setItem('user', JSON.stringify(data.user));
        storage.setItem('user_role', selectedRole);

        // Also store in the other storage for session persistence
        if (rememberMe) {
          sessionStorage.setItem('access_token', data.access_token);
          sessionStorage.setItem('user', JSON.stringify(data.user));
          sessionStorage.setItem('user_role', selectedRole);
        }

        setSuccess('Login successful!');
        setIsRedirecting(true);

        // Redirect based on role
        const redirectPath = selectedRole === 'student' 
          ? '/student/dashboard' 
          : '/dashboard';

        console.log('[LOGIN] Redirecting to:', redirectPath);

        setTimeout(() => {
          router.push(redirectPath);
        }, 1200);
        
        return; // ✅ IMPORTANT: Exit here on success
      }

      // ❌ Handle error responses
      console.log('❌ [LOGIN] Login failed');
      
      const errorDetail = data.detail || 'Login failed';
      console.log('[LOGIN] Error detail:', errorDetail);

      // Check for device-related errors
      if (typeof errorDetail === 'string') {
        
        // NEW DEVICE - needs approval
        if (errorDetail.includes('NEW_DEVICE')) {
          const parts = errorDetail.split('|');
          const remaining = parts.length > 1 ? parseInt(parts[1]) : 3;
          
          console.log(`[LOGIN] New device detected - ${remaining} requests remaining`);
          
          setRemainingDeviceRequests(remaining);
          setDeviceRequestEmail(formData.email);
          setNewDeviceInfo(deviceInfo);
          setShowDeviceRequestModal(true);
          setError(''); // Clear error
          return;
        }
        
        // DEVICE ALREADY LINKED
        if (errorDetail.includes('DEVICE_ALREADY_LINKED')) {
          setError('This device is already linked to another student account. Please use your registered device or contact support.');
          return;
        }
        
        // MONTHLY LIMIT REACHED
        if (errorDetail.includes('MONTHLY_LIMIT_REACHED')) {
          setError('You have reached the monthly limit of 3 device requests. Please try again next month or use your registered device.');
          return;
        }
        
        // PENDING REQUEST EXISTS
        if (errorDetail.includes('PENDING_REQUEST')) {
          setError('You already have a pending device request. Please wait for your teacher to review it.');
          return;
        }
        
        // DEVICE REJECTED
        if (errorDetail.includes('DEVICE_REJECTED')) {
          setError('Your device access request was denied. Please contact your teacher or use your registered device.');
          return;
        }
        
        // DEVICE FINGERPRINTING REQUIRED
        if (errorDetail.includes('Device fingerprinting required')) {
          setError('Device fingerprinting is required for student login. Please try again.');
          return;
        }
        
        // ACCOUNT NOT VERIFIED
        if (errorDetail.includes('Account not verified')) {
          setError('Please verify your email address before logging in. Check your inbox for the verification link.');
          return;
        }
      }
      
      // Generic error (invalid credentials, etc.)
      setError(typeof errorDetail === 'string' ? errorDetail : 'Invalid email or password');
      
    } catch (err: any) {
      console.error('[LOGIN] Exception:', err);
      setError('An error occurred during login. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeviceRequestSubmit = async (reason: string) => {
    try {
      console.log('[DEVICE_REQUEST] Submitting request:', {
        email: deviceRequestEmail,
        device_id: newDeviceInfo.id,
        reason: reason
      });

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/student/request-device`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: deviceRequestEmail,
            device_id: newDeviceInfo.id,
            device_info: newDeviceInfo,
            reason: reason
          })
        }
      );

      const data = await response.json();
      console.log('[DEVICE_REQUEST] Response:', response.status, data);

      if (response.ok) {
        setSuccess('Device access request submitted successfully! Your teacher will review it shortly.');
        setShowDeviceRequestModal(false);
        setNewDeviceInfo(null);
        setFormData({ name: '', email: '', password: '', confirmPassword: '' });
      } else {
        const errorDetail = data.detail || 'Failed to submit request';
        
        if (errorDetail.includes('PENDING_REQUEST_EXISTS')) {
          throw new Error('You already have a pending request for this device. Please wait for teacher approval.');
        } else if (errorDetail.includes('MONTHLY_LIMIT_REACHED')) {
          throw new Error('You have reached the monthly limit of 3 device requests. Please try again next month.');
        } else if (errorDetail.includes('DEVICE_ALREADY_LINKED')) {
          throw new Error('This device is already linked to another student account.');
        } else if (errorDetail.includes('verify your email')) {
          throw new Error('Please verify your email address before requesting device access.');
        } else {
          throw new Error(errorDetail);
        }
      }
    } catch (error: any) {
      console.error('[DEVICE_REQUEST] Error:', error);
      throw new Error(error.message || 'Failed to submit device request');
    }
  };

  const handleModeChange = (signUpMode: boolean) => {
    setIsSignUp(signUpMode);
    setError('');
    setSuccess('');
    setRememberMe(false);
    setDeviceConsentGiven(false);
    onModeChange?.(signUpMode);
  };

  const handleRoleChange = (role: 'teacher' | 'student') => {
    setSelectedRole(role);
    setDeviceConsentGiven(false);
    setError('');
  };

  const isSignupEnabled = () => {
    if (selectedRole === 'teacher') {
      return true;
    }
    return deviceConsentGiven;
  };

  return (
    <>
      {/* Redirect Overlay */}
      {isRedirecting && (
        <div className="fixed inset-0 bg-gradient-to-br from-emerald-500 to-teal-600 z-50 flex items-center justify-center animate-fade-in">
          <div className="text-center space-y-4 animate-scale-in px-4">
            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto animate-bounce">
              <CheckCircle className="w-12 h-12 text-white" />
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-white">Welcome Back!</h2>
            <p className="text-emerald-50">Taking you to your dashboard...</p>
            <Loader2 className="w-6 h-6 text-white animate-spin mx-auto" />
          </div>
        </div>
      )}

      <div className={`bg-white rounded-2xl shadow-xl p-6 md:p-8 transition-opacity duration-500 ${isRedirecting ? 'opacity-0' : 'opacity-100'}`}>
        <div className="space-y-6">
          {/* Tab Switcher */}
          <div className="bg-slate-100 rounded-lg p-1 flex gap-1">
            <button
              onClick={() => handleModeChange(true)}
              className={`flex-1 py-2.5 md:py-3 px-2 md:px-4 cursor-pointer rounded-lg font-semibold transition-all duration-300 flex items-center justify-center gap-1.5 md:gap-2 text-sm md:text-base ${isSignUp
                  ? 'bg-emerald-600 text-white shadow-lg scale-105'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                }`}
            >
              <UserPlus className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Up</span>
              <span className="sm:hidden">Sign Up</span>
            </button>
            <button
              onClick={() => handleModeChange(false)}
              className={`flex-1 py-2.5 md:py-3 px-2 md:px-4 cursor-pointer rounded-lg font-semibold transition-all duration-300 flex items-center justify-center gap-1.5 md:gap-2 text-sm md:text-base ${!isSignUp
                  ? 'bg-emerald-600 text-white shadow-lg scale-105'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                }`}
            >
              <LogIn className="w-4 h-4" />
              <span className="hidden sm:inline">Sign In</span>
              <span className="sm:hidden">Sign In</span>
            </button>
          </div>

          {/* Role Selection */}
          {isSignUp && (
            <div className="space-y-3 animate-slide-down">
              <label className="text-sm font-semibold text-slate-700">I am signing up as:</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleRoleChange('teacher')}
                  className={`p-3 md:p-4 rounded-xl border-2 transition-all duration-300 cursor-pointer transform hover:scale-105 ${selectedRole === 'teacher'
                      ? 'border-emerald-500 bg-emerald-50 shadow-lg'
                      : 'border-slate-200 hover:border-emerald-300 hover:shadow'
                    }`}
                >
                  <GraduationCap
                    className={`w-5 h-5 md:w-6 md:h-6 mx-auto mb-2 transition-colors ${selectedRole === 'teacher' ? 'text-emerald-600' : 'text-slate-400'
                      }`}
                  />
                  <p
                    className={`font-semibold text-xs md:text-sm transition-colors ${selectedRole === 'teacher' ? 'text-emerald-700' : 'text-slate-600'
                      }`}
                  >
                    Teacher
                  </p>
                  <p className="text-xs text-slate-500 mt-1 hidden sm:block">Manage classes & attendance</p>
                </button>

                <button
                  onClick={() => handleRoleChange('student')}
                  className={`p-3 md:p-4 rounded-xl border-2 transition-all duration-300 cursor-pointer transform hover:scale-105 ${selectedRole === 'student'
                      ? 'border-teal-500 bg-teal-50 shadow-lg'
                      : 'border-slate-200 hover:border-teal-300 hover:shadow'
                    }`}
                >
                  <Users
                    className={`w-5 h-5 md:w-6 md:h-6 mx-auto mb-2 transition-colors ${selectedRole === 'student' ? 'text-teal-600' : 'text-slate-400'
                      }`}
                  />
                  <p
                    className={`font-semibold text-xs md:text-sm transition-colors ${selectedRole === 'student' ? 'text-teal-700' : 'text-slate-600'
                      }`}
                  >
                    Student
                  </p>
                  <p className="text-xs text-slate-500 mt-1 hidden sm:block">View your attendance</p>
                </button>
              </div>
            </div>
          )}

          {/* Role Selection for Sign In */}
          {!isSignUp && (
            <div className="space-y-3 animate-slide-down">
              <label className="text-sm font-semibold text-slate-700">I am signing in as:</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleRoleChange('teacher')}
                  className={`p-3 md:p-4 rounded-xl border-2 transition-all duration-300 cursor-pointer transform hover:scale-105 ${selectedRole === 'teacher'
                      ? 'border-emerald-500 bg-emerald-50 shadow-lg'
                      : 'border-slate-200 hover:border-emerald-300 hover:shadow'
                    }`}
                >
                  <GraduationCap
                    className={`w-5 h-5 md:w-6 md:h-6 mx-auto mb-2 transition-colors ${selectedRole === 'teacher' ? 'text-emerald-600' : 'text-slate-400'
                      }`}
                  />
                  <p
                    className={`font-semibold text-xs md:text-sm transition-colors ${selectedRole === 'teacher' ? 'text-emerald-700' : 'text-slate-600'
                      }`}
                  >
                    Teacher
                  </p>
                </button>

                <button
                  onClick={() => handleRoleChange('student')}
                  className={`p-3 md:p-4 rounded-xl border-2 transition-all duration-300 cursor-pointer transform hover:scale-105 ${selectedRole === 'student'
                      ? 'border-teal-500 bg-teal-50 shadow-lg'
                      : 'border-slate-200 hover:border-teal-300 hover:shadow'
                    }`}
                >
                  <Users
                    className={`w-5 h-5 md:w-6 md:h-6 mx-auto mb-2 transition-colors ${selectedRole === 'student' ? 'text-teal-600' : 'text-slate-400'
                      }`}
                  />
                  <p
                    className={`font-semibold text-xs md:text-sm transition-colors ${selectedRole === 'student' ? 'text-teal-700' : 'text-slate-600'
                      }`}
                  >
                    Student
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* Messages */}
          {error && (
            <div className="p-3 md:p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm animate-slide-down">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 md:p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm flex items-center gap-2 animate-slide-down">
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={isSignUp ? handleSignup : handleLogin} className="space-y-4">
            {isSignUp && (
              <FormField
                label="Full Name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="John Doe"
                disabled={loading}
              />
            )}

            <FormField
              label="Email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="john@example.com"
              icon={Mail}
              disabled={loading}
            />

            <PasswordField
              label="Password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              showPassword={showPassword}
              onToggle={() => setShowPassword(!showPassword)}
              disabled={loading}
              hint={isSignUp ? 'Must be at least 8 characters' : undefined}
            />

            {isSignUp && (
              <PasswordField
                label="Confirm Password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                showPassword={showPassword}
                onToggle={() => setShowPassword(!showPassword)}
                disabled={loading}
              />
            )}

            {/* Device Fingerprinting Consent (Only for Student Sign Up) */}
            {isSignUp && selectedRole === 'student' && (
              <div className="animate-slide-down bg-blue-50 border-2 border-blue-200 rounded-xl p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-blue-900 mb-1">Security Notice</h3>
                    <p className="text-xs text-blue-700 leading-relaxed mb-3">
                      For security purposes, we use device fingerprinting to protect your account from unauthorized access.
                      This helps ensure only your trusted devices can access your attendance records.
                    </p>

                    <label className="flex items-start gap-2.5 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={deviceConsentGiven}
                        onChange={(e) => setDeviceConsentGiven(e.target.checked)}
                        className="mt-0.5 rounded border-blue-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                      />
                      <span className="text-xs text-blue-800 group-hover:text-blue-900 transition-colors">
                        I agree to share my device information (browser type, operating system, and device ID)
                        for security purposes. This data will be encrypted and used only for account protection.
                      </span>
                    </label>
                  </div>
                </div>

                {!deviceConsentGiven && (
                  <div className="text-xs text-blue-600 flex items-center gap-1.5 mt-2 ml-8">
                    <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-pulse"></span>
                    <span>Please accept device fingerprinting to continue</span>
                  </div>
                )}
              </div>
            )}

            {!isSignUp && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 text-sm">
                <label className="flex items-center gap-2 text-slate-600 cursor-pointer hover:text-slate-800 transition-colors">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <span>Remember me</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowResetModal(true)}
                  className="text-emerald-600 hover:text-emerald-700 font-medium transition-colors text-left sm:text-right"
                >
                  Forgot Password?
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || (isSignUp && !isSignupEnabled())}
              className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2 transform hover:scale-105 disabled:transform-none"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  {isSignUp ? <UserPlus className="w-5 h-5" /> : <LogIn className="w-5 h-5" />}
                  <span>{isSignUp ? 'Create Account' : 'Sign In'}</span>
                </>
              )}
            </button>

            {isSignUp && (
              <p className="text-xs text-center text-slate-600 px-2">
                By signing up, you agree to our{' '}
                <a href="#" className="text-emerald-600 hover:underline">
                  Terms of Service
                </a>{' '}
                and{' '}
                <a href="#" className="text-emerald-600 hover:underline">
                  Privacy Policy
                </a>
              </p>
            )}
          </form>
        </div>
      </div>

      <PasswordResetModal isOpen={showResetModal} onClose={() => setShowResetModal(false)} />

      {showDeviceRequestModal && newDeviceInfo && (
        <DeviceRequestModal
          isOpen={showDeviceRequestModal}
          onClose={() => {
            setShowDeviceRequestModal(false);
            setNewDeviceInfo(null);
          }}
          deviceInfo={newDeviceInfo}
          remainingRequests={remainingDeviceRequests}
          onSubmit={handleDeviceRequestSubmit}
        />
      )}
    </>
  );
};

// FormField and PasswordField components
interface FormFieldProps {
  label: string;
  type: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  icon?: React.ComponentType<{ className: string }>;
  disabled?: boolean;
  hint?: string;
}

const FormField: React.FC<FormFieldProps> = ({
  label,
  type,
  value,
  onChange,
  placeholder,
  icon: Icon,
  disabled,
  hint,
}) => (
  <div>
    <label className="block text-sm font-semibold text-slate-700 mb-2">{label}</label>
    <div className="relative">
      {Icon && <Icon className="absolute left-3 md:left-4 top-3 w-5 h-5 text-slate-400" />}
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full ${Icon ? 'pl-10 md:pl-12' : 'pl-3 md:pl-4'} pr-3 md:pr-4 py-2.5 md:py-3 border-2 border-slate-200 rounded-xl text-base text-black focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all disabled:opacity-50 cursor-text`}
      />
    </div>
    {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
  </div>
);

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  showPassword: boolean;
  onToggle: () => void;
  disabled?: boolean;
  hint?: string;
}

const PasswordField: React.FC<PasswordFieldProps> = ({
  label,
  value,
  onChange,
  showPassword,
  onToggle,
  disabled,
  hint,
}) => (
  <div>
    <label className="block text-sm font-semibold text-slate-700 mb-2">{label}</label>
    <div className="relative">
      <Lock className="absolute left-3 md:left-4 top-3 w-5 h-5 text-slate-400" />
      <input
        type={showPassword ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder="••••••••"
        className="w-full pl-10 md:pl-12 pr-10 md:pr-12 py-2.5 md:py-3 border-2 border-slate-200 rounded-xl text-base text-black focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all disabled:opacity-50 cursor-text"
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-3 md:right-4 top-3 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
      >
        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
      </button>
    </div>
    {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
  </div>
);
