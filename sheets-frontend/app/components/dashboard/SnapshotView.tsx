'use client';

import React, { useState } from 'react';
import { Calendar, Users, TrendingUp, AlertCircle, Award, BarChart3, GraduationCap, Search, Settings } from 'lucide-react';
import { Class, Student, CustomColumn, AttendanceThresholds } from '@/types';
import { calculateStudentAttendance, getStatusFromPercentage } from '@/lib/statisticsHelper';

interface SnapshotViewProps {
  classes: Class[];
  currentMonth: number;
  currentYear: number;
  onClassSelect: (id: number) => void;
  defaultThresholds: AttendanceThresholds;
  onOpenClassSettings: (classId: number) => void;
}

export const SnapshotView: React.FC<SnapshotViewProps> = ({
  classes,
  currentMonth,
  currentYear,
  onClassSelect,
  defaultThresholds,
  onOpenClassSettings,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sessionData, setSessionData] = useState<Record<string, any[]>>({});
  const [showMultiSessionModal, setShowMultiSessionModal] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<number | null>(null);
  const [multiSessionStudentName, setMultiSessionStudentName] = useState('');
  const [multiSessionDate, setMultiSessionDate] = useState('');
  const [multiSessionCurrentData, setMultiSessionCurrentData] = useState<Array<{ id: string; name: string; status: 'P' | 'A' | 'L' | null }>>([]);

  const getDaysInMonth = (month: number, year: number) => new Date(year, month + 1, 0).getDate();
  const daysInMonth = getDaysInMonth(currentMonth, currentYear);
  const monthName = new Date(currentYear, currentMonth).toLocaleString('default', {
    month: 'long',
    year: 'numeric'
  });

  // ✅ FIXED: Calculate per-class statistics - matches AllClassesView
  const calculateClassStats = (cls: Class) => {
    const thresholds = cls.thresholds || defaultThresholds;
    let atRiskCount = 0;
    let excellentCount = 0;
    let totalAttendanceSum = 0;
    let studentsWithAttendance = 0;
    
    const studentStats: Array<{
      student: Student;
      attendance: number;
      status: 'excellent' | 'good' | 'moderate' | 'risk';
    }> = [];

    cls.students.forEach(student => {
      const stats = calculateStudentAttendance(
        student.attendance,
        daysInMonth,
        currentMonth,
        currentYear
      );

      const hasAttendance = stats.total > 0;

      // Only count students with actual attendance data
      if (hasAttendance) {
        totalAttendanceSum += stats.percentage;
        studentsWithAttendance++;
      }

      const status = getStatusFromPercentage(stats.percentage, thresholds);

      // ✅ Important: don't mark students as "at risk" if they have no attendance records yet
      if (hasAttendance) {
        if (status === 'excellent') excellentCount++;
        if (status === 'risk') atRiskCount++;
      }

      studentStats.push({ student, attendance: stats.percentage, status });
    });

    // ✅ FIX: Use same calculation method as overall stats
    const avgAttendance = studentsWithAttendance > 0 
      ? totalAttendanceSum / studentsWithAttendance 
      : 0;

    return {
      avgAttendance: avgAttendance.toFixed(1),
      studentCount: cls.students.length,
      atRiskCount,
      excellentCount,
      studentStats: studentStats.sort((a, b) => b.attendance - a.attendance),
    };
  };

  const filteredClasses = searchQuery.trim()
    ? classes.filter(cls => cls.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : classes;

  // Calculate stats for FILTERED classes (respects search)
  // IMPORTANT: We compute from cls.students instead of trusting cls.statistics.
  // Mongo/file backends can have stale or differently-shaped `statistics`, which breaks analytics.
  const calculateOverallStats = () => {
    let totalStudents = 0;
    let totalAttendanceSum = 0;
    let studentsWithAttendance = 0;
    let atRiskCount = 0;
    let excellentCount = 0;

    filteredClasses.forEach(cls => {
      const thresholds = cls.thresholds || defaultThresholds;
      const students = cls.students || [];

      totalStudents += students.length;

      students.forEach(student => {
        const stats = calculateStudentAttendance(
          student.attendance,
          daysInMonth,
          currentMonth,
          currentYear
        );

        const hasAttendance = stats.total > 0;

        if (hasAttendance) {
          totalAttendanceSum += stats.percentage;
          studentsWithAttendance++;
        }

        const status = getStatusFromPercentage(stats.percentage, thresholds);

        // ✅ Important: don't classify "no data" students as at-risk/excellent
        if (hasAttendance) {
          if (status === 'risk') atRiskCount++;
          if (status === 'excellent') excellentCount++;
        }
      });
    });

    const overallAttendance = studentsWithAttendance > 0
      ? totalAttendanceSum / studentsWithAttendance
      : 0;

    return {
      totalClasses: filteredClasses.length,
      totalStudents,
      overallAttendance: overallAttendance.toFixed(1),
      atRiskCount,
      excellentCount,
    };
  };

  const overallStats = calculateOverallStats();

  // Always compute per-class stats from students + selected month/year.
  const classesWithStats = filteredClasses.map(cls => ({
    class: cls,
    stats: calculateClassStats(cls),
  }));

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'excellent':
        return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' };
      case 'good':
        return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-500' };
      case 'moderate':
        return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' };
      case 'risk':
        return { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-rose-500' };
      default:
        return { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200', dot: 'bg-slate-500' };
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-md border border-emerald-200">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-1 sm:mb-2">Dashboard Snapshot</h1>
            <p className="text-sm sm:text-base text-slate-600 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              {monthName}
            </p>
          </div>
          <div className="w-full sm:w-auto">
            <div className="flex sm:block justify-between sm:text-right bg-emerald-50 sm:bg-transparent p-3 sm:p-0 rounded-lg sm:rounded-none">
              <p className="text-xs sm:text-sm text-slate-600 mb-0 sm:mb-1">Quick Overview</p>
              <p className="text-xl sm:text-2xl font-bold text-emerald-600">{overallStats.overallAttendance}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Overall Statistics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-white rounded-lg sm:rounded-xl p-4 sm:p-5 shadow-md border border-emerald-200">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-emerald-100 to-emerald-200 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" />
            </div>
          </div>
          <p className="text-xs text-slate-600 mb-1">Total Classes</p>
          <p className="text-xl sm:text-2xl font-bold text-slate-900">{overallStats.totalClasses}</p>
        </div>

        <div className="bg-white rounded-lg sm:rounded-xl p-4 sm:p-5 shadow-md border border-teal-200">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-teal-100 to-teal-200 rounded-lg flex items-center justify-center">
              <Users className="w-4 h-4 sm:w-5 sm:h-5 text-teal-600" />
            </div>
          </div>
          <p className="text-xs text-slate-600 mb-1">Total Students</p>
          <p className="text-xl sm:text-2xl font-bold text-slate-900">{overallStats.totalStudents}</p>
        </div>

        <div className="bg-white rounded-lg sm:rounded-xl p-4 sm:p-5 shadow-md border border-cyan-200 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-cyan-100 to-cyan-200 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-600" />
            </div>
          </div>
          <p className="text-xs text-slate-600 mb-1">Avg Attendance</p>
          <p className="text-xl sm:text-2xl font-bold text-slate-900">{overallStats.overallAttendance}%</p>
        </div>

        <div className="bg-white rounded-lg sm:rounded-xl p-4 sm:p-5 shadow-md border border-emerald-200">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-emerald-100 to-emerald-200 rounded-lg flex items-center justify-center">
              <Award className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" />
            </div>
          </div>
          <p className="text-xs text-slate-600 mb-1">Excellent (≥90%)</p>
          <p className="text-xl sm:text-2xl font-bold text-slate-900">{overallStats.excellentCount}</p>
        </div>

        <div className="bg-white rounded-lg sm:rounded-xl p-4 sm:p-5 shadow-md border border-amber-200">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-amber-100 to-amber-200 rounded-lg flex items-center justify-center">
              <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
            </div>
          </div>
          <p className="text-xs text-slate-600 mb-1">At Risk (≤85%)</p>
          <p className="text-xl sm:text-2xl font-bold text-slate-900">{overallStats.atRiskCount}</p>
        </div>
      </div>

      {/* Classes Breakdown - ENHANCED SEARCH BAR */}
      <div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 sm:mb-6">
          <h2 className={`text-xl sm:text-2xl font-bold text-slate-900 ${searchQuery ? 'text-emerald-900' : ''}`}>
            {searchQuery ? `Search Results (${filteredClasses.length})` : 'Classes Breakdown'}
          </h2>

          {/* Enhanced Search Bar */}
          <div className="relative w-full sm:w-auto max-w-md sm:max-w-lg lg:max-w-xl xl:max-w-2xl mx-auto sm:mx-0">
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-emerald-500 transition-colors duration-200 pointer-events-none z-10" />

              <input
                type="text"
                placeholder="Search classes by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-12 py-3.5 sm:py-2 border-2 border-slate-200 rounded-2xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all duration-300 hover:border-slate-300 hover:shadow-md bg-white/80 backdrop-blur-sm shadow-sm text-sm sm:text-base placeholder-slate-500 font-medium text-slate-900 empty:before:content-[''] focus:outline-none"
              />

              {searchQuery && (
                <>
                  {/* Results count badge */}
                  <div className="absolute right-14 top-1/2 -translate-y-1/2 bg-emerald-100 text-emerald-700 text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm border border-emerald-200 animate-in slide-in-from-right-2 duration-300">
                    {filteredClasses.length} {filteredClasses.length === 1 ? 'class' : 'classes'}
                  </div>

                  {/* Clear button */}
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="group/clear absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-emerald-100 hover:border-emerald-300 transition-all duration-200 rounded-xl shadow-sm border border-slate-200 hover:shadow-md active:scale-95 z-20"
                    aria-label="Clear search"
                  >
                    <svg className="w-4 h-4 text-slate-500 group-hover/clear:text-emerald-600 transition-colors"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </>
              )}

              {/* Bottom accent glow on focus */}
              <div className="absolute -bottom-1 left-4 right-4 h-1 bg-gradient-to-r from-emerald-400/0 via-emerald-500/50 to-emerald-400/0 rounded-full scale-x-0 group-focus-within:scale-x-100 transition-transform duration-500 origin-center opacity-0 group-focus-within:opacity-100" />
            </div>

            {/* Keyboard hint (mobile only) */}
            <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500 sm:hidden">
              <kbd className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded font-mono text-[10px] font-bold">⌨️</kbd>
              <span>Type to filter classes</span>
            </div>
          </div>
        </div>

        <div className="space-y-4 sm:space-y-6">
          {classesWithStats.map(({ class: cls, stats }) => (
            <div key={cls.id} className="bg-white rounded-xl sm:rounded-2xl shadow-md border border-emerald-200 overflow-hidden">
              {/* Class Header */}
              <div className="bg-gradient-to-r from-emerald-50 to-teal-50 p-4 sm:p-6 border-b border-emerald-200">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 mb-4">
                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-md flex-shrink-0">
                      <GraduationCap className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg sm:text-xl font-bold text-slate-900 truncate">{cls.name}</h3>
                      <p className="text-xs sm:text-sm text-slate-600">{stats.studentCount} students</p>
                    </div>
                  </div>
                  <button
                    onClick={() => onClassSelect(cls.id)}
                    className="w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-semibold rounded-lg hover:shadow-md transition-all cursor-pointer"
                  >
                    View Details
                  </button>
                </div>

                {/* Class Stats Summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
                  <div className="bg-white rounded-lg p-3 border border-emerald-100">
                    <p className="text-xs text-slate-600 mb-1">Avg Attendance</p>
                    <p className="text-base sm:text-lg font-bold text-emerald-600">{stats.avgAttendance}%</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-emerald-100">
                    <p className="text-xs text-slate-600 mb-1">Excellent</p>
                    <p className="text-base sm:text-lg font-bold text-emerald-600">{stats.excellentCount}</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-amber-100">
                    <p className="text-xs text-slate-600 mb-1">At Risk</p>
                    <p className="text-base sm:text-lg font-bold text-amber-600">{stats.atRiskCount}</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-slate-100">
                    <p className="text-xs text-slate-600 mb-1">Total</p>
                    <p className="text-base sm:text-lg font-bold text-slate-900">{stats.studentCount}</p>
                  </div>
                </div>
              </div>

              {/* Student List */}
              <div className="p-3 sm:p-4">
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <h4 className="text-xs sm:text-sm font-semibold text-slate-700 uppercase tracking-wide">
                    Student Performance
                  </h4>
                  {stats.studentCount > 0 && (
                    <span className="text-xs text-slate-500 font-medium">
                      {stats.studentCount} total
                    </span>
                  )}
                </div>

                {stats.studentCount === 0 ? (
                  <div className="text-center py-8 px-4 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="w-12 h-12 mx-auto mb-3 bg-slate-100 rounded-lg flex items-center justify-center">
                      <Users className="w-6 h-6 text-slate-400" />
                    </div>
                    <h5 className="text-sm font-bold text-slate-800 mb-1">No students yet</h5>
                    <p className="text-xs text-slate-600">Add students to track performance</p>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-64 sm:max-h-72 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent pr-1">
                    {stats.studentStats.slice(0, stats.studentCount > 8 ? 6 : stats.studentCount).map(({ student, attendance, status }, index) => {
                      const colors = getStatusColor(status);
                      const isTopPerformer = index < 3;

                      return (
                        <div
                          key={student.id}
                          className={`group flex items-center justify-between gap-2 p-2.5 sm:p-3 rounded-lg ${colors.bg} border ${colors.border} hover:shadow-sm transition-all`}
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div className="relative flex-shrink-0">
                              <div className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full ${colors.dot}`} />
                              {isTopPerformer && (
                                <div className="absolute inset-0 w-2 h-2 sm:w-2.5 sm:h-2.5 bg-yellow-400/40 rounded-full animate-ping" />
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-sm text-slate-900 truncate leading-tight">
                                {student.name || 'Unnamed Student'}
                              </p>
                              <p className="text-xs text-slate-600 truncate mt-0.5">
                                {student.rollNo || 'No Roll No.'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className={`text-lg sm:text-xl font-bold ${colors.text} tabular-nums`}>
                              {attendance.toFixed(0)}%
                            </span>
                            <span className={`hidden sm:inline text-[10px] font-semibold px-2 py-0.5 rounded-full ${colors.bg} ${colors.text} capitalize border ${colors.border}`}>
                              {status}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {stats.studentCount > 6 && (
                  <div className="mt-2 text-center">
                    <span className="text-xs text-slate-500">
                      Showing top 6 of {stats.studentStats.length}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}

          {filteredClasses.length === 0 && searchQuery && (
            <div className="text-center py-12 px-6 bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl border-2 border-dashed border-slate-200">
              <div className="w-16 h-16 mx-auto mb-6 p-4 bg-slate-200 rounded-2xl flex items-center justify-center">
                <Search className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">No classes found</h3>
              <p className="text-slate-600 mb-6 max-w-md mx-auto">
                No classes match your search. Try different keywords or{' '}
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-emerald-600 hover:text-emerald-700 font-medium underline"
                >
                  clear search
                </button>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-md border border-slate-200">
        <h4 className="text-xs sm:text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3 sm:mb-4">
          Performance Legend (Default Thresholds)
        </h4>
        <p className="text-xs text-slate-500 mb-3 sm:mb-4">
          Each class can have custom thresholds. Click the settings icon on any class to configure.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="flex items-center gap-3 p-3 sm:p-0 bg-slate-50 sm:bg-transparent rounded-lg sm:rounded-none">
            <div className="w-3 h-3 rounded-full bg-emerald-500 flex-shrink-0"></div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Excellent</p>
              <p className="text-xs text-slate-600">≥ {defaultThresholds.excellent}% attendance</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 sm:p-0 bg-slate-50 sm:bg-transparent rounded-lg sm:rounded-none">
            <div className="w-3 h-3 rounded-full bg-blue-500 flex-shrink-0"></div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Good</p>
              <p className="text-xs text-slate-600">{defaultThresholds.good}-{defaultThresholds.excellent - 1}% attendance</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 sm:p-0 bg-slate-50 sm:bg-transparent rounded-lg sm:rounded-none">
            <div className="w-3 h-3 rounded-full bg-amber-500 flex-shrink-0"></div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Moderate</p>
              <p className="text-xs text-slate-600">{defaultThresholds.moderate}-{defaultThresholds.good - 1}% attendance</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 sm:p-0 bg-slate-50 sm:bg-transparent rounded-lg sm:rounded-none">
            <div className="w-3 h-3 rounded-full bg-rose-500 flex-shrink-0"></div>
            <div>
              <p className="text-sm font-semibold text-slate-900">At Risk</p>
              <p className="text-xs text-slate-600">{'<'} {defaultThresholds.moderate}% attendance</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};