'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context-email';
import { Menu, User, Plus, BookOpen, TrendingUp, AlertCircle, Award, Users, X, Search, QrCode } from 'lucide-react';
import { StudentSidebar } from '../../components/students/StudentSidebar';
import { StudentEmptyState } from '../../components/students/StudentEmptyState';
import { StudentEnrollmentModal } from '../../components/students/StudentEnrollmentModal';
import { SettingsModal } from '../../components/dashboard/SettingsModal';
import { ChangePasswordModal } from '../../components/dashboard/ChangePasswordModal';
import { StudentQRScanner } from '../../components/StudentQRScanner';
import { StudentDevicesModal } from '../../components/StudentDevicesModal';

interface ClassDetails {
  class_id: string;
  class_name: string;
  teacher_name?: string;
  student_record: {
    id: any;
    name: string;
    rollNo: string;
    email: string;
    // Can be 'P'/'A'/'L' OR multi-session objects
    attendance: Record<string, any>;
  };
  // Backend may return different shapes depending on storage version; we normalize at render time.
  statistics?: {
    total_classes?: number;
    present?: number;
    absent?: number;
    late?: number;
    percentage?: number;
    // legacy fields
    attendance_percentage?: number;
    present_days?: number;
    total_days?: number;
    status?: string;
  };
}

export default function StudentDashboard() {
  const router = useRouter();
  const { user, logout, isAuthenticated, loading: authLoading } = useAuth();
  const [showDevicesModal, setShowDevicesModal] = useState(false);
  const [classes, setClasses] = useState<ClassDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [classToLeave, setClassToLeave] = useState<ClassDetails | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const getAttendanceStatus = (value: any): 'P' | 'A' | 'L' | undefined => {
    if (!value) return undefined;

    // Handle object format: { status: 'P', count: 2 }
    if (typeof value === 'object' && value.status) {
      return value.status;
    }

    // Handle string format: 'P'
    if (typeof value === 'string') {
      return value as 'P' | 'A' | 'L';
    }

    return undefined;
  };

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/auth');
    } else if (!authLoading && user?.role !== 'student') {
      router.push('/dashboard');
    }
  }, [isAuthenticated, authLoading, user, router]);

  useEffect(() => {
    if (isAuthenticated && user?.role === "student") {
      loadClasses();
    }
  }, [isAuthenticated, user?.id]);

  const loadClasses = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/student/classes`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();

        // ✅ ADD DEBUGGING
        console.log('[STUDENT DASHBOARD] Received data:', data);
        console.log('[STUDENT DASHBOARD] Classes count:', data.classes?.length);

        if (data.classes && data.classes.length > 0) {
          data.classes.forEach((cls: any, idx: number) => {
            console.log(`[STUDENT DASHBOARD] Class ${idx + 1}:`, {
              name: cls.class_name,
              student_record: cls.student_record?.id,
              attendance_entries: Object.keys(cls.student_record?.attendance || {}).length,
              statistics: cls.statistics
            });

            // ✅ Check attendance format
            if (cls.student_record?.attendance) {
              const firstDate = Object.keys(cls.student_record.attendance)[0];
              if (firstDate) {
                console.log(`[STUDENT DASHBOARD] Sample attendance (${firstDate}):`,
                  cls.student_record.attendance[firstDate]
                );
              }
            }
          });
        }

        setClasses(data.classes || []);
      } else {
        setError('Failed to load classes');
      }
    } catch (err) {
      console.error('Error loading classes:', err);
      setError('Failed to load classes');
    } finally {
      setLoading(false);
    }
  };


  const handleLeaveClass = async () => {
    if (!classToLeave) return;

    setLeaving(true);
    setLeaveError('');

    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/student/unenroll/${classToLeave.class_id}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (response.ok) {
        await loadClasses();
        setShowLeaveModal(false);
        setClassToLeave(null);
        setLeaveError('');
      } else {
        const errorData = await response.json();
        setLeaveError(errorData.detail || 'Failed to leave class');
      }
    } catch (err) {
      console.error('Error leaving class:', err);
      setLeaveError('Failed to leave class. Please try again.');
    } finally {
      setLeaving(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/auth');
  };

  const handlePasswordChangeClick = () => {
    setShowChangePasswordModal(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'excellent':
        return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' };
      case 'good':
        return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-500' };
      case 'moderate':
        return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' };
      case 'at risk':
        return { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-rose-500' };
      default:
        return { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200', dot: 'bg-slate-500' };
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 via-cyan-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || user?.role !== 'student') {
    return null;
  }

  const getPercentage = (stats: any): number => {
    const pct = stats?.percentage ?? stats?.attendance_percentage ?? stats?.attendancePercentage;
    const num = Number(pct);
    return Number.isFinite(num) ? num : 0;
  };

  const getCount = (value: any): number => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  };

  const getStatus = (stats: any): string => {
    return String(stats?.status ?? 'no data');
  };

  // Filter classes based on search query
  const filteredClasses = classes.filter(classInfo => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;

    const className = classInfo.class_name?.toLowerCase() || '';
    const teacherName = classInfo.teacher_name?.toLowerCase() || '';

    return className.includes(query) || teacherName.includes(query);
  });

  const overallStats = classes.length > 0 ? (() => {
    const percentages = classes.map(c => getPercentage(c.statistics));
    const avgAttendance = percentages.length > 0
      ? percentages.reduce((sum, p) => sum + p, 0) / percentages.length
      : 0;

    return {
      totalClasses: classes.length,
      avgAttendance,
      totalPresent: classes.reduce((sum, c) => sum + getCount(c.statistics?.present ?? c.statistics?.present_days), 0),
      totalAbsent: classes.reduce((sum, c) => sum + getCount(c.statistics?.absent), 0),
    };
  })() : null;

  return (
    <div className="min-h-screen h-screen bg-gradient-to-br from-teal-50 via-cyan-50 to-blue-50 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-teal-200/60 shadow-sm flex-shrink-0">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              data-mobile-menu
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-2 hover:bg-teal-50 rounded-lg transition-colors cursor-pointer"
            >
              <Menu className="w-5 h-5 text-slate-600" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-md">
                <img src="/logo.png" alt="Logo" className="w-10 h-10" />
              </div>
              <div className="hidden md:block">
                <h1 className="text-xl font-bold text-teal-900">Lernova Attendsheets</h1>
                <p className="text-xs text-slate-600">Student Dashboard</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            {/* Enroll Button */}
            <button
              onClick={() => setShowEnrollModal(true)}
              className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 text-white text-sm font-semibold rounded-lg hover:shadow-lg transition-all cursor-pointer"
            >
              <Plus className="w-5 h-5" />
              <span className="hidden sm:inline">Enroll</span>
            </button>

            {/* QR Scan Button */}
            {classes.length > 0 && (
              <button
                onClick={() => setShowQRScanner(true)}
                className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-sm font-semibold rounded-lg hover:shadow-lg transition-all cursor-pointer"
              >
                <QrCode className="w-5 h-5" />
                <span className="hidden sm:inline">Scan QR</span>
              </button>
            )}

            <div className="hidden md:flex items-center gap-3 border-l border-teal-200 pl-4">
              <div className="w-8 h-8 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-lg flex items-center justify-center">
                <User className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900">{user?.name}</p>
                <p className="text-xs text-slate-600">{user?.email}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden min-h-0">
        <StudentSidebar
          collapsed={sidebarCollapsed}
          classes={classes.map(c => ({
            classid: c.class_id,
            classname: c.class_name,
            teachername: c.teacher_name ?? 'Unknown'
          }))}
          onEnrollClick={() => setShowEnrollModal(true)}
          onViewDashboard={() => { }}
          onSettings={() => setShowSettingsModal(true)}
          onLogout={handleLogout}
          onQRScan={() => setShowQRScanner(true)}
          onManageDevices={() => setShowDevicesModal(true)}
        />

        <main className="flex-1 overflow-y-auto p-6">
          {/* Header */}
          <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-md border border-emerald-200">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-1">{user.name}'s Dashboard</h1>
              </div>
            </div>
          </div>
          {overallStats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-8 pt-4">
              <div className="bg-white rounded-xl p-4 md:p-5 shadow-md border border-teal-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-teal-100 to-teal-200 rounded-lg flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-teal-600" />
                  </div>
                </div>
                <p className="text-xs text-slate-600 mb-1">Enrolled Classes</p>
                <p className="text-2xl font-bold text-slate-900">{overallStats.totalClasses}</p>
              </div>

              <div className="bg-white rounded-xl p-4 md:p-5 shadow-md border border-cyan-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-cyan-100 to-cyan-200 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-cyan-600" />
                  </div>
                </div>
                <p className="text-xs text-slate-600 mb-1">Avg Attendance</p>
                <p className="text-2xl font-bold text-slate-900">{(overallStats.avgAttendance ?? 0).toFixed(1)}%</p>
              </div>

              <div className="bg-white rounded-xl p-4 md:p-5 shadow-md border border-emerald-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-emerald-100 to-emerald-200 rounded-lg flex items-center justify-center">
                    <Award className="w-5 h-5 text-emerald-600" />
                  </div>
                </div>
                <p className="text-xs text-slate-600 mb-1">Total Present</p>
                <p className="text-2xl font-bold text-slate-900">{overallStats.totalPresent}</p>
              </div>

              <div className="bg-white rounded-xl p-4 md:p-5 shadow-md border border-amber-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-amber-100 to-amber-200 rounded-lg flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-amber-600" />
                  </div>
                </div>
                <p className="text-xs text-slate-600 mb-1">Total Absent</p>
                <p className="text-2xl font-bold text-slate-900">{overallStats.totalAbsent}</p>
              </div>
            </div>

          )}

          <div className="flex items-center justify-between mb-4 mt-4">
            <h2 className="text-xl md:text-2xl font-bold text-slate-900">My Classes</h2>
          </div>

          {/* Search Bar */}
          {classes.length > 0 && (
            <div className="mb-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by class name or teacher..."
                  className="w-full pl-10 pr-4 py-3 border border-teal-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white"
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
          )}

          {classes.length === 0 ? (
            <StudentEmptyState onEnrollClick={() => setShowEnrollModal(true)} />
          ) : filteredClasses.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No classes found</h3>
              <p className="text-slate-600 mb-4">
                No classes match "{searchQuery}"
              </p>
              <button
                onClick={() => setSearchQuery('')}
                className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors cursor-pointer"
              >
                Clear Search
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
              {filteredClasses.map((classInfo) => {
                const stats: any = classInfo.statistics || {};
                const percentage = getPercentage(stats);
                const status = getStatus(stats);
                const colors = getStatusColor(status);
                return (
                  <div key={classInfo.class_id} className="bg-white rounded-2xl shadow-md border border-teal-200 overflow-hidden hover:shadow-xl transition-all">
                    <div className="bg-gradient-to-r from-teal-50 to-cyan-50 p-4 md:p-6 border-b border-teal-200">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg md:text-xl font-bold text-slate-900 mb-2 truncate">{classInfo.class_name}</h3>
                          <p className="text-sm text-slate-600 flex items-center gap-2 truncate">
                            <Users className="w-4 h-4 flex-shrink-0" />
                            {classInfo.teacher_name}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            setClassToLeave(classInfo);
                            setShowLeaveModal(true);
                            setLeaveError('');
                          }}
                          className="px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer flex-shrink-0"
                          title="Leave this class"
                        >
                          Leave
                        </button>
                      </div>
                    </div>

                    <div className="p-4 md:p-6 space-y-4">
                      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <span className="text-sm text-slate-600">Attendance</span>
                        <span className={`text-lg font-bold ${colors.text}`}>
                          {percentage.toFixed(1)}%
                        </span>
                      </div>

                      <div className={`p-3 ${colors.bg} border ${colors.border} rounded-lg flex items-center justify-between`}>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${colors.dot}`}></div>
                          <span className={`text-sm font-medium ${colors.text} capitalize`}>{status}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="p-2 bg-emerald-50 rounded-lg">
                          <p className="text-xs text-slate-600">Present</p>
                          <p className="text-lg font-bold text-emerald-700">{getCount(stats.present ?? stats.present_days)}</p>
                        </div>
                        <div className="p-2 bg-rose-50 rounded-lg">
                          <p className="text-xs text-slate-600">Absent</p>
                          <p className="text-lg font-bold text-rose-700">{getCount(stats.absent)}</p>
                        </div>
                        <div className="p-2 bg-amber-50 rounded-lg">
                          <p className="text-xs text-slate-600">Late</p>
                          <p className="text-lg font-bold text-amber-700">{getCount(stats.late)}</p>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-200">
                        <p className="text-xs text-slate-500">
                          Total Classes: {getCount(stats.total_classes ?? stats.total_days)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {showQRScanner && (
        <StudentQRScanner
          onClose={() => setShowQRScanner(false)}
          classes={classes.map(c => ({
            classid: c.class_id,
            classname: c.class_name,
            teachername: c.teacher_name ?? 'Unknown'
          }))}
        />
      )}

      {showLeaveModal && classToLeave && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-gradient-to-r from-rose-600 to-red-600 px-6 md:px-8 py-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                    <AlertCircle className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl md:text-2xl font-bold text-white">Leave Class?</h2>
                    <p className="text-rose-50 text-sm mt-1">You can rejoin anytime</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowLeaveModal(false);
                    setClassToLeave(null);
                    setLeaveError('');
                  }}
                  disabled={leaving}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>
            <div className="p-6 md:p-8">
              {leaveError && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-700 text-sm">{leaveError}</p>
                </div>
              )}

              <p className="text-slate-700 mb-2">
                Are you sure you want to leave <span className="font-semibold">{classToLeave.class_name}</span>?
              </p>
              <p className="text-sm text-slate-600 mb-6">
                Your attendance data will be preserved. You can re-enroll using the class code later and all your data will be restored.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowLeaveModal(false);
                    setClassToLeave(null);
                    setLeaveError('');
                  }}
                  disabled={leaving}
                  className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLeaveClass}
                  disabled={leaving}
                  className="flex-1 px-4 py-3 bg-rose-600 text-white font-medium rounded-xl hover:shadow-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {leaving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Leaving...
                    </>
                  ) : (
                    'Leave Class'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <StudentEnrollmentModal
        isOpen={showEnrollModal}
        onClose={() => setShowEnrollModal(false)}
        onSuccess={() => {
          loadClasses();
          setShowEnrollModal(false);
        }}
      />

      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        onPasswordChangeClick={handlePasswordChangeClick}
        accountType="student"
      />

      <ChangePasswordModal
        isOpen={showChangePasswordModal}
        onClose={() => setShowChangePasswordModal(false)}
      />

      <StudentDevicesModal
        isOpen={showDevicesModal}
        onClose={() => setShowDevicesModal(false)}
      />
    </div>
  );
}
