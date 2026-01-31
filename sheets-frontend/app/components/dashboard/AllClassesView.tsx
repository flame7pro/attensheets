'use client';

import React, { useState } from 'react';
import { GraduationCap, Users, Calendar, TrendingUp, TrendingDown, AlertCircle, Trash2, Search } from 'lucide-react';
import { DeleteClassModal } from './DeleteClassModal';
import { calculateStudentAttendance, getStatusFromPercentage } from '@/lib/statisticsHelper';
import { Class, Student, CustomColumn, AttendanceThresholds } from '@/types';

interface AllClassesViewProps {
  classes: Class[];
  onBack: () => void;
  onClassSelect: (id: number) => void;
  onDeleteClass: (classId: number) => void;
  currentMonth: number;
  currentYear: number;
  defaultThresholds: AttendanceThresholds;
}

export const AllClassesView: React.FC<AllClassesViewProps> = ({
  classes,
  onBack,
  onClassSelect,
  onDeleteClass,
  currentMonth,
  currentYear,
  defaultThresholds,
}) => {
  const getDaysInMonth = (month: number, year: number) => new Date(year, month + 1, 0).getDate();
  const daysInMonth = getDaysInMonth(currentMonth, currentYear);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [classToDelete, setClassToDelete] = useState<Class | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // ✅ FIXED: Calculate per-class statistics - NOW MATCHES calculateOverallStats
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

      // Only count students with actual attendance data
      if (stats.total > 0) {
        totalAttendanceSum += stats.percentage;
        studentsWithAttendance++;
      }

      const status = getStatusFromPercentage(stats.percentage, thresholds);

      if (status === 'excellent') excellentCount++;
      if (status === 'risk') atRiskCount++;

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

  // ✅ FIXED: Calculate stats for FILTERED classes, excluding those with no attendance data
  const calculateOverallStats = () => {
    let totalStudents = 0;
    let totalAttendanceSum = 0;
    let studentsWithAttendance = 0;
    let atRiskCount = 0;
    let excellentCount = 0;

    // Use FILTERED classes for stats (respects search)
    filteredClasses.forEach(cls => {
      // ✅ CRITICAL FIX: Use backend statistics if available (same as individual class display)
      if (cls.statistics) {
        // Backend already calculated correct stats - use them!
        totalStudents += cls.statistics.totalStudents;
        
        // ✅ KEY FIX: Only include in average if class has actual attendance data
        // Check: if avgAttendance = 0 AND no students in risk/excellent categories,
        // then this class has NO attendance records (not just poor attendance)
        const hasAttendanceData = 
          cls.statistics.avgAttendance > 0 || 
          cls.statistics.atRiskCount > 0 || 
          cls.statistics.excellentCount > 0;
        
        if (hasAttendanceData) {
          // Class has actual attendance records - include in average
          totalAttendanceSum += cls.statistics.avgAttendance * cls.statistics.totalStudents;
          studentsWithAttendance += cls.statistics.totalStudents;
        }
        
        atRiskCount += cls.statistics.atRiskCount;
        excellentCount += cls.statistics.excellentCount;
      } else {
        // Fallback: calculate if backend stats not available
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

          // Only count students with actual attendance data
          if (stats.total > 0) {
            totalAttendanceSum += stats.percentage;
            studentsWithAttendance++;
          }

          if (stats.percentage < thresholds.moderate) atRiskCount++;
          if (stats.percentage >= thresholds.excellent) excellentCount++;
        });
      }
    });

    // ✅ Calculate average from weighted sum
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
  const classesWithStats = filteredClasses.map(cls => {
    // ✅ Use backend-calculated statistics if available, otherwise calculate on client
    if (cls.statistics) {
      // Backend already calculated correct stats based on enrollment mode
      const studentStats = cls.students.map(student => {
        const stats = calculateStudentAttendance(
          student.attendance,
          daysInMonth,
          currentMonth,
          currentYear
        );
        const thresholds = cls.thresholds || defaultThresholds;
        const status = getStatusFromPercentage(stats.percentage, thresholds);
        return { student, attendance: stats.percentage, status };
      }).sort((a, b) => b.attendance - a.attendance);

      return {
        class: cls,
        stats: {
          avgAttendance: cls.statistics.avgAttendance.toFixed(1),
          studentCount: cls.statistics.totalStudents,
          atRiskCount: cls.statistics.atRiskCount,
          excellentCount: cls.statistics.excellentCount,
          studentStats,
        }
      };
    } else {
      // Fallback: calculate if backend stats not available
      return {
        class: cls,
        stats: calculateClassStats(cls),
      };
    }
  });

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

  const getAttendanceColor = (attendance: number, thresholds: AttendanceThresholds) => {
    if (attendance >= thresholds.excellent) return 'emerald';
    if (attendance >= thresholds.good) return 'blue';
    if (attendance >= thresholds.moderate) return 'amber';
    return 'rose';
  };

  return (
    <div className="space-y-4 sm:space-y-6 sm:px-0">

      {/* Title Section - Responsive */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-1 sm:mb-2">
          All Classes Overview
        </h1>
        <p className="text-sm sm:text-base text-slate-600">
          {new Date(currentYear, currentMonth).toLocaleString('default', { month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Overall Analytics - Responsive Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
        {/* Total Classes Card */}
        <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-md border border-emerald-200">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-emerald-100 to-emerald-200 rounded-lg sm:rounded-xl flex items-center justify-center">
              <GraduationCap className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600" />
            </div>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 mb-1">Total Classes</p>
          <p className="text-2xl sm:text-3xl font-bold text-slate-900">{overallStats.totalClasses}</p>
        </div>

        {/* Total Students Card */}
        <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-md border border-teal-200">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-teal-100 to-teal-200 rounded-lg sm:rounded-xl flex items-center justify-center">
              <Users className="w-5 h-5 sm:w-6 sm:h-6 text-teal-600" />
            </div>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 mb-1">Total Students</p>
          <p className="text-2xl sm:text-3xl font-bold text-slate-900">{overallStats.totalStudents}</p>
        </div>

        {/* Overall Attendance Card */}
        <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-md border border-cyan-200">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-cyan-100 to-cyan-200 rounded-lg sm:rounded-xl flex items-center justify-center">
              <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-600" />
            </div>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 mb-1">Avg Attendance</p>
          <p className="text-2xl sm:text-3xl font-bold text-slate-900">{overallStats.overallAttendance}%</p>
        </div>

        {/* At Risk Students Card */}
        <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-md border border-amber-200">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-amber-100 to-amber-200 rounded-lg sm:rounded-xl flex items-center justify-center">
              <AlertCircle className="w-5 h-5 sm:w-6 sm:h-6 text-amber-600" />
            </div>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 mb-1">At Risk Students</p>
          <p className="text-2xl sm:text-3xl font-bold text-slate-900">{overallStats.atRiskCount}</p>
        </div>
      </div>

      {/* All Classes Grid - Responsive */}
      <div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 sm:mb-6">
          <h2 className={`text-xl sm:text-2xl font-bold text-slate-900 ${searchQuery ? 'text-emerald-900' : ''}`}>
            {searchQuery ? `Search Results (${filteredClasses.length})` : `All Classes (${classes.length})`}
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
                className="w-full pl-12 pr-12 py-3.5 sm:py-2 border-2 border-slate-200 rounded-2xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all duration-300 hover:border-slate-300 hover:shadow-md bg-white/80 backdrop-blur-sm shadow-sm text-sm sm:text-base placeholder-slate-500 font-medium text-slate-900 focus:outline-none"
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
        {filteredClasses.length === 0 && searchQuery ? (
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
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
            {classesWithStats.map(({ class: cls, stats }) => {
              const classThresholds = cls.thresholds || defaultThresholds;
              const attendanceColor = getAttendanceColor(parseFloat(stats.avgAttendance), classThresholds);

              return (
                <div
                  key={cls.id}
                  onClick={() => {
                    onClassSelect(cls.id);
                    onBack();
                  }}
                  className="group relative bg-white rounded-xl sm:rounded-2xl p-5 sm:p-6 shadow-sm border-2 border-slate-100 hover:border-emerald-300 hover:shadow-lg transition-all duration-300 cursor-pointer hover:-translate-y-1 active:scale-[0.98]"
                >
                  {/* Header with Delete Button */}
                  <div className="flex items-start justify-between mb-4 gap-2">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-11 h-11 sm:w-12 sm:h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-md group-hover:shadow-emerald-200 group-hover:scale-105 transition-all flex-shrink-0">
                        <GraduationCap className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base sm:text-lg font-bold text-slate-900 truncate group-hover:text-emerald-700 transition-colors leading-tight">
                          {cls.name}
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">{stats.studentCount} students</p>
                      </div>
                    </div>

                    {/* Delete Button - Touch Optimized */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setClassToDelete(cls);
                        setShowDeleteModal(true);
                      }}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all flex-shrink-0 active:scale-95 hover:shadow-sm"
                      title="Delete Class"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Stats Grid */}
                  <div className="space-y-2">
                    {/* Avg Attendance */}
                    <div className="flex items-center justify-between px-3 py-2.5 bg-slate-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-3.5 h-3.5 text-slate-500" />
                        <span className="text-xs text-slate-600">Avg Attendance</span>
                      </div>
                      <span className={`text-sm font-bold ${attendanceColor === 'emerald' ? 'text-emerald-600' :
                        attendanceColor === 'blue' ? 'text-blue-600' :
                          attendanceColor === 'amber' ? 'text-amber-600' : 'text-rose-600'
                        }`}>
                        {stats.avgAttendance}%
                      </span>
                    </div>

                    {/* At Risk Warning */}
                    {stats.atRiskCount > 0 && (
                      <div className="flex items-center justify-between px-3 py-2.5 bg-amber-50 rounded-lg border border-amber-200">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                          <span className="text-xs text-amber-700 font-medium">At Risk</span>
                        </div>
                        <span className="text-sm font-bold text-amber-700">
                          {stats.atRiskCount}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* View Button */}
                  <button className="w-full mt-4 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-semibold rounded-lg hover:shadow-md group-hover:shadow-emerald-200 transition-all active:scale-[0.98]">
                    View Details
                  </button>

                  {/* Hover Accent */}
                  <div className="absolute inset-0 rounded-xl sm:rounded-2xl bg-gradient-to-br from-emerald-500/5 to-teal-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Class Modal */}
      <DeleteClassModal
        isOpen={showDeleteModal}
        classToDelete={classToDelete}
        onClose={() => {
          setShowDeleteModal(false);
          setClassToDelete(null);
        }}
        onDelete={() => {
          if (classToDelete) {
            onDeleteClass(classToDelete.id);
            setShowDeleteModal(false);
            setClassToDelete(null);
          }
        }}
      />
    </div>
  );
};