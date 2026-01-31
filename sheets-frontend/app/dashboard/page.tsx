'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context-email';
import { classService } from '@/lib/classService';
import { Menu, User, Users, LayoutDashboard } from 'lucide-react';
import { Sidebar } from '../components/dashboard/Sidebar';
import { EmptyState } from '../components/dashboard/EmptyState';
import { AttendanceSheet } from '../components/dashboard/AttendanceSheet';
import { AllClassesView } from '../components/dashboard/AllClassesView';
import { SnapshotView } from '../components/dashboard/SnapshotView';
import { ClassThresholdSettings } from '../components/dashboard/ClassThresholdSettings';
import { SettingsModal } from '../components/dashboard/SettingsModal';
import { ChangePasswordModal } from '../components/dashboard/ChangePasswordModal';
import { AddColumnModal } from '../components/dashboard/AddColumnModal';
import { DeleteClassModal } from '../components/dashboard/DeleteClassModal';
import { ImportDataState } from '../components/dashboard/ImportDataState';
import { MonthYearSelector } from '../components/dashboard/MonthYearSelector';
import { AttendanceThresholds, Student, CustomColumn, Class } from '@/types';
import { QRAttendanceModal } from '../components/QRAttendanceModal';

export default function DashboardPage() {
  const router = useRouter();
  const { user, logout, isAuthenticated, loading } = useAuth();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [classes, setClasses] = useState<Class[]>([]);
  const [activeClassId, setActiveClassId] = useState<number | null>(null);
  const [showAllClasses, setShowAllClasses] = useState(false);
  const [showSnapshot, setShowSnapshot] = useState(true);
  const [showImportState, setShowImportState] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [showQRModal, setShowQRModal] = useState(false);
  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const [defaultThresholds, setDefaultThresholds] = useState<AttendanceThresholds>({
    excellent: 95,
    good: 90,
    moderate: 85,
    atRisk: 85,
  });

  const [showAddColumnModal, setShowAddColumnModal] = useState(false);
  const [showDeleteClassModal, setShowDeleteClassModal] = useState(false);
  const [showThresholdSettings, setShowThresholdSettings] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [settingsClassId, setSettingsClassId] = useState<number | null>(null);
  const [classToDelete, setClassToDelete] = useState<Class | null>(null);
  const [newColumnLabel, setNewColumnLabel] = useState('');
  const [newColumnType, setNewColumnType] = useState<'text' | 'number' | 'select'>('text');

  // Add this helper function in page.tsx
  const refreshClassData = async (classId: number) => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) return;

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/classes/${classId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (response.ok) {
        const data = await response.json();

        // Update only this specific class in the classes array
        setClasses(prevClasses =>
          prevClasses.map(cls =>
            cls.id === classId ? data.class : cls
          )
        );
      }
    } catch (error) {
      console.error('Failed to refresh class data:', error);
    }
  };

  // Redirect if not authenticated
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/auth');
    }
  }, [isAuthenticated, loading, router]);

  // Prevent back navigation
  useEffect(() => {
    if (isAuthenticated && typeof window !== 'undefined') {
      window.history.pushState(null, '', window.location.href);

      const handlePopState = () => {
        window.history.pushState(null, '', window.location.href);
      };

      window.addEventListener('popstate', handlePopState);

      return () => {
        window.removeEventListener('popstate', handlePopState);
      };
    }
  }, [isAuthenticated]);

  // Load classes from backend on mount
  useEffect(() => {
    if (user && isAuthenticated) {
      loadClassesFromBackend();
    }
  }, [user, isAuthenticated]);

  // Load thresholds from localStorage
  useEffect(() => {
    if (user) {
      const savedThresholds = localStorage.getItem(`default_thresholds_${user.id}`);
      if (savedThresholds) {
        setDefaultThresholds(JSON.parse(savedThresholds));
      }
    }
  }, [user]);

  // Save thresholds to localStorage
  useEffect(() => {
    if (user) {
      localStorage.setItem(`default_thresholds_${user.id}`, JSON.stringify(defaultThresholds));
    }
  }, [defaultThresholds, user]);

  // Load classes from backend
  const loadClassesFromBackend = async () => {
    try {
      setSyncing(true);
      setSyncError('');

      const backendClasses = await classService.loadClasses();

      if (backendClasses.length > 0) {
        setClasses(backendClasses);
        setShowSnapshot(true);
      } else {
        // Try loading from localStorage as fallback
        const localClasses = localStorage.getItem(`classes_${user?.id}`);
        if (localClasses) {
          const parsed: Class[] = JSON.parse(localClasses);
          setClasses(parsed);

          // Sync local classes to backend
          if (parsed.length > 0) {
            await syncToBackend(parsed);
          }
        }
      }
    } catch (error) {
      console.error('Error loading classes:', error);
      setSyncError('Failed to sync with server. Working offline.');

      // Load from localStorage as fallback
      const localClasses = localStorage.getItem(`classes_${user?.id}`);
      if (localClasses) {
        const parsed: Class[] = JSON.parse(localClasses);
        setClasses(parsed);
      }
    } finally {
      setSyncing(false);
    }
  };
  

  // Sync classes to backend
  const syncToBackend = async (classesToSync: Class[]) => {
    if (!user) return;

    try {
      await classService.syncClasses(classesToSync);
      console.log('Classes synced successfully');
    } catch (error) {
      console.error('Error syncing classes:', error);
      setSyncError('Failed to sync some changes');
    }
  };

  // Save class to backend and localStorage
  const saveClass = async (updatedClass: Class) => {
    const updatedClasses = classes.map(c =>
      c.id === updatedClass.id ? updatedClass : c
    );

    setClasses(updatedClasses);

    // Save to localStorage immediately
    if (user) {
      localStorage.setItem(`classes_${user.id}`, JSON.stringify(updatedClasses));
    }

    // Sync to backend asynchronously (don't block UI)
    try {
      await classService.updateClass(String(updatedClass.id), updatedClass);
      setSyncError(''); // Clear any previous errors
    } catch (error) {
      console.error('Error saving class to backend:', error);
      // Don't show error to user, data is saved locally
      // Backend will sync when connection is restored
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/auth');
  };

  const handleOpenSettings = () => {
    setShowSettingsModal(true);
  };

  const handlePasswordChangeClick = () => {
    setShowChangePasswordModal(true);
  };

  const handleSaveThresholds = (newThresholds: AttendanceThresholds, applyToClassIds: number[]) => {
    const updatedClasses = classes.map(cls =>
      applyToClassIds.includes(cls.id)
        ? { ...cls, thresholds: newThresholds }
        : cls
    );
    setClasses(updatedClasses);

    // Sync each updated class
    updatedClasses.forEach(cls => {
      if (applyToClassIds.includes(cls.id)) {
        saveClass(cls);
      }
    });
  };

  const handleOpenClassSettings = (classId: number) => {
    setSettingsClassId(classId);
    setShowThresholdSettings(true);
  };

  const handleAddClass = async (newClass: Class) => {
    console.log('ðŸ†• Creating new class:', newClass);

    const updatedClasses = [...classes, newClass];
    setClasses(updatedClasses);
    setActiveClassId(newClass.id);
    setShowSnapshot(false);
    setShowImportState(false);

    // Save to localStorage immediately
    if (user) {
      localStorage.setItem(`classes_${user.id}`, JSON.stringify(updatedClasses));
      console.log('ðŸ’¾ Saved to localStorage');
    }

    // CREATE new class on backend
    try {
      const result = await classService.createClass(newClass);
      console.log('âœ… Backend response:', result);
      setSyncError('');
    } catch (error) {
      console.error('âŒ Backend error:', error);
      setSyncError('Failed to sync new class');
    }
  };

  const handleDeleteClass = (classId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const cls = classes.find(c => c.id === classId);
    if (cls) {
      setClassToDelete(cls);
      setShowDeleteClassModal(true);
    }
  };

  const confirmDeleteClass = async () => {
    if (!classToDelete) return;

    const updatedClasses = classes.filter(c => c.id !== classToDelete.id);
    setClasses(updatedClasses);

    // âœ… Update localStorage immediately
    if (user) {
      localStorage.setItem(`classes_${user.id}`, JSON.stringify(updatedClasses));
    }

    if (activeClassId === classToDelete.id) {
      if (updatedClasses.length > 0) {
        setShowSnapshot(true);
        setActiveClassId(null);
      } else {
        setActiveClassId(null);
        setShowSnapshot(false);
      }
    }

    // Delete from backend
    try {
      await classService.deleteClass(String(classToDelete.id));
      setSyncError(''); // âœ… Clear any previous errors
    } catch (error) {
      console.error('Error deleting class:', error);
      setSyncError('Failed to sync deletion');
    }

    setShowDeleteClassModal(false);
    setClassToDelete(null);
  };


  const handleClassSelect = (id: number) => {
    setActiveClassId(id);
    setShowAllClasses(false);
    setShowSnapshot(false);
  };

  const handleUpdateClassName = (classId: number, newName: string) => {
    const updatedClasses = classes.map(cls =>
      cls.id === classId ? { ...cls, name: newName } : cls
    );
    setClasses(updatedClasses);

    const updatedClass = updatedClasses.find(c => c.id === classId);
    if (updatedClass) {
      saveClass(updatedClass);
    }
  };

  const handleAddStudent = () => {
    if (!activeClassId) return;

    const newStudent: Student = {
      id: Date.now(),
      rollNo: '',
      name: '',
      attendance: {}
    };

    const updatedClasses = classes.map(cls =>
      cls.id === activeClassId
        ? { ...cls, students: [...cls.students, newStudent] }
        : cls
    );

    setClasses(updatedClasses);

    // Sync to backend
    const updatedClass = updatedClasses.find(c => c.id === activeClassId);
    if (updatedClass) {
      saveClass(updatedClass);
    }
  };

  const handleUpdateStudent = (studentId: number, field: string, value: any) => {
    if (!activeClassId) return;

    const updatedClasses = classes.map(cls =>
      cls.id === activeClassId
        ? {
          ...cls,
          students: cls.students.map(student =>
            student.id === studentId
              ? { ...student, [field]: value }
              : student
          )
        }
        : cls
    );

    setClasses(updatedClasses);

    // Debounced sync to backend
    const updatedClass = updatedClasses.find(c => c.id === activeClassId);
    if (updatedClass) {
      saveClass(updatedClass);
    }
  };

  const handleDeleteStudent = (studentId: number) => {
    if (!activeClassId) return;

    const updatedClasses = classes.map(cls =>
      cls.id === activeClassId
        ? { ...cls, students: cls.students.filter(s => s.id !== studentId) }
        : cls
    );

    setClasses(updatedClasses);

    const updatedClass = updatedClasses.find(c => c.id === activeClassId);
    if (updatedClass) {
      saveClass(updatedClass);
    }
  };

  const handleToggleAttendance = (studentId: number, day: number) => {
    if (!activeClassId) return;

    const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const updatedClasses = classes.map(cls =>
      cls.id === activeClassId
        ? {
          ...cls,
          students: cls.students.map(student => {
            if (student.id === studentId) {
              const currentStatus = student.attendance[dateKey];
              let newStatus: { status: 'P' | 'A' | 'L'; count: number } | undefined;

              // Handle both old format (string) and new format (object)
              let currentStatusValue: 'P' | 'A' | 'L' | undefined;
              if (currentStatus) {
                if (typeof currentStatus === 'object' && 'status' in currentStatus) {
                  currentStatusValue = currentStatus.status;
                } else {
                  currentStatusValue = currentStatus as 'P' | 'A' | 'L';
                }
              }

              // Cycle through statuses (always reset count to 1 when changing status)
              if (!currentStatusValue) {
                newStatus = { status: 'P', count: 1 };
              } else if (currentStatusValue === 'P') {
                newStatus = { status: 'A', count: 1 };
              } else if (currentStatusValue === 'A') {
                newStatus = { status: 'L', count: 1 };
              } else {
                newStatus = undefined; // L → empty
              }

              return {
                ...student,
                attendance: {
                  ...student.attendance,
                  [dateKey]: newStatus
                }
              };
            }
            return student;
          })
        }
        : cls
    );

    setClasses(updatedClasses);

    const updatedClass = updatedClasses.find(c => c.id === activeClassId);
    if (updatedClass) {
      saveClass(updatedClass);
    }
  };

  // Add this function in your dashboard page
  // Put it right AFTER handleToggleAttendance (around line 380)

  const handleIncrementAttendance = (studentId: number, day: number) => {
    if (!activeClassId) return;

    const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const updatedClasses = classes.map(cls =>
      cls.id === activeClassId
        ? {
          ...cls,
          students: cls.students.map(student => {
            if (student.id === studentId) {
              const currentStatus = student.attendance[dateKey];

              // Only increment if there's already a status
              if (currentStatus) {
                // If it's already an object with count, increment
                if (typeof currentStatus === 'object' && 'count' in currentStatus) {
                  return {
                    ...student,
                    attendance: {
                      ...student.attendance,
                      [dateKey]: {
                        status: currentStatus.status,
                        count: currentStatus.count + 1
                      }
                    }
                  };
                } else {
                  // Convert old format (string) to new format (object with count 2)
                  return {
                    ...student,
                    attendance: {
                      ...student.attendance,
                      [dateKey]: {
                        status: currentStatus as 'P' | 'A' | 'L',
                        count: 2 // First right-click makes it 2
                      }
                    }
                  };
                }
              }
            }
            return student;
          })
        }
        : cls
    );

    setClasses(updatedClasses);

    const updatedClass = updatedClasses.find(c => c.id === activeClassId);
    if (updatedClass) {
      saveClass(updatedClass);
    }
  };

  const handleAddColumn = () => {
    if (!newColumnLabel.trim() || !activeClassId) return;

    const newColumn: CustomColumn = {
      id: `col_${Date.now()}`,
      label: newColumnLabel,
      type: newColumnType
    };

    const updatedClasses = classes.map(cls =>
      cls.id === activeClassId
        ? { ...cls, customColumns: [...cls.customColumns, newColumn] }
        : cls
    );

    setClasses(updatedClasses);

    setNewColumnLabel('');
    setNewColumnType('text');
    setShowAddColumnModal(false);

    const updatedClass = updatedClasses.find(c => c.id === activeClassId);
    if (updatedClass) {
      saveClass(updatedClass);
    }
  };

  const handleDeleteColumn = (columnId: string) => {
    if (!activeClassId) return;

    const updatedClasses = classes.map(cls =>
      cls.id === activeClassId
        ? {
          ...cls,
          customColumns: cls.customColumns.filter(col => col.id !== columnId),
          students: cls.students.map(student => {
            const { [columnId]: _, ...rest } = student;
            return rest as Student;
          })
        }
        : cls
    );

    setClasses(updatedClasses);

    const updatedClass = updatedClasses.find(c => c.id === activeClassId);
    if (updatedClass) {
      saveClass(updatedClass);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-linear-to-br from-emerald-50 via-teal-50 to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const activeClass = classes.find(c => c.id === activeClassId);

  return (
    <div className="min-h-screen h-screen bg-linear-to-br from-emerald-50 via-teal-50 to-cyan-50 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-emerald-200/60 shadow-sm shrink-0">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              data-mobile-menu
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-2 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
            >
              <Menu className="w-5 h-5 text-slate-600" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-md">
                <img src="/logo.png" alt="Lernova Attendsheets Logo" className="w-10 h-10" />
              </div>
              <div className="hidden md:block">
                <h1 className="text-xl font-bold text-emerald-900">Lernova Attendsheets</h1>
                {syncing && (
                  <p className="text-xs text-blue-600">Syncing...</p>
                )}
                {syncError && (
                  <p className="text-xs text-amber-600">{syncError}</p>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {!showImportState && classes.length > 0 && (
              <MonthYearSelector
                currentMonth={currentMonth}
                currentYear={currentYear}
                onMonthChange={setCurrentMonth}
                onYearChange={setCurrentYear}
              />
            )}

            {classes.length > 0 && !showSnapshot && !showImportState && (
              <button
                onClick={() => {
                  setShowSnapshot(true);
                  setShowAllClasses(false);
                  setActiveClassId(null);
                }}
                className="flex items-center gap-2 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-colors font-medium text-sm cursor-pointer"
              >
                <LayoutDashboard className="w-5 h-5" />
                <span className="hidden sm:inline">Dashboard</span>
              </button>
            )}

            <div className="hidden md:flex items-center gap-3 border-l border-emerald-200 pl-4">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
                  <User className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">{user?.name}</p>
                  <p className="text-xs text-slate-600">{user?.email}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <Sidebar
          collapsed={sidebarCollapsed}
          classes={classes}
          activeClassId={activeClassId}
          onClassSelect={handleClassSelect}
          onAddClass={() => setShowImportState(true)}
          onDeleteClass={handleDeleteClass}
          onViewAllClasses={() => {
            setShowAllClasses(true);
            setShowSnapshot(false);
            setShowImportState(false);
          }}
          onViewSnapshot={() => {
            setShowSnapshot(true);
            setShowAllClasses(false);
            setShowImportState(false);
            setActiveClassId(null);
          }}
          onOpenSettings={handleOpenSettings}
          onLogout={handleLogout}
          onUpdateClassName={handleUpdateClassName}
        />

        <main className="flex-1 overflow-y-auto p-6">
          {showImportState ? (
            <ImportDataState
              onImport={handleAddClass}
              onCancel={() => setShowImportState(false)}
              defaultThresholds={defaultThresholds}
            />
          ) : !activeClass && classes.length === 0 ? (
            <EmptyState onCreateClass={() => setShowImportState(true)} />
          ) : showSnapshot ? (
            <SnapshotView
              classes={classes}
              currentMonth={currentMonth}
              currentYear={currentYear}
              onClassSelect={handleClassSelect}
              defaultThresholds={defaultThresholds}
              onOpenClassSettings={handleOpenClassSettings}
            />
          ) : showAllClasses ? (
            <AllClassesView
              classes={classes}
              onBack={() => setShowAllClasses(false)}
              onClassSelect={handleClassSelect}
              onDeleteClass={async (classId) => {
                // Delete the class directly
                const classToRemove = classes.find(c => c.id === classId);
                if (!classToRemove) return;

                const updatedClasses = classes.filter(c => c.id !== classId);
                setClasses(updatedClasses);

                // Update localStorage immediately
                if (user) {
                  localStorage.setItem(`classes_${user.id}`, JSON.stringify(updatedClasses));
                }

                // If it was the active class, reset view
                if (activeClassId === classId) {
                  if (updatedClasses.length > 0) {
                    setShowSnapshot(true);
                    setShowAllClasses(false);
                  }
                  setActiveClassId(null);
                }

                // Delete from backend
                try {
                  await classService.deleteClass(String(classId));
                  setSyncError('');
                } catch (error) {
                  console.error('Error deleting class:', error);
                  setSyncError('Failed to sync deletion');
                }
              }}
              currentMonth={currentMonth}
              currentYear={currentYear}
              defaultThresholds={defaultThresholds}
            />
          ) : activeClass ? (
            <AttendanceSheet
              activeClass={activeClass as any}
              currentMonth={currentMonth}
              currentYear={currentYear}
              onAddStudent={handleAddStudent}
              onUpdateStudent={handleUpdateStudent}
              onDeleteStudent={handleDeleteStudent}
              onToggleAttendance={handleToggleAttendance}
              onAddColumn={() => setShowAddColumnModal(true)}
              onDeleteColumn={handleDeleteColumn}
              defaultThresholds={defaultThresholds}
              onOpenSettings={() => handleOpenClassSettings(activeClass.id)}
              onUpdateClassName={(newName) => handleUpdateClassName(activeClass.id, newName)}
              onOpenQRAttendance={() => setShowQRModal(true)}
              onIncrementAttendance={handleIncrementAttendance}
              onUpdateClassData={(updatedClass) => {
                setClasses(prevClasses =>
                  prevClasses.map(cls => cls.id === updatedClass.id ? updatedClass : cls)
                );
              }}
            />
          ) : null}
        </main>
      </div>

      {/* Modals */}
      <AddColumnModal
        isOpen={showAddColumnModal}
        columnLabel={newColumnLabel}
        columnType={newColumnType}
        onLabelChange={setNewColumnLabel}
        onTypeChange={setNewColumnType}
        onClose={() => {
          setShowAddColumnModal(false);
          setNewColumnLabel('');
          setNewColumnType('text');
        }}
        onCreate={handleAddColumn}
      />

      <DeleteClassModal
        isOpen={showDeleteClassModal}
        classToDelete={classToDelete}
        onClose={() => {
          setShowDeleteClassModal(false);
          setClassToDelete(null);
        }}
        onDelete={confirmDeleteClass}
      />

      {showQRModal && activeClass && (
        <QRAttendanceModal
          classId={activeClass.id}
          className={activeClass.name}
          totalStudents={activeClass.students.length}
          currentDate={getTodayDate()}  // ✅ CORRECT
          onClose={() => setShowQRModal(false)}
        />
      )}

      {settingsClassId && (
        <ClassThresholdSettings
          isOpen={showThresholdSettings}
          currentClass={classes.find(c => c.id === settingsClassId)!}
          allClasses={classes}
          thresholds={classes.find(c => c.id === settingsClassId)?.thresholds || defaultThresholds}
          onClose={() => {
            setShowThresholdSettings(false);
            setSettingsClassId(null);
          }}
          onSave={handleSaveThresholds}
        />
      )}

      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        onPasswordChangeClick={handlePasswordChangeClick}
      />

      <ChangePasswordModal
        isOpen={showChangePasswordModal}
        onClose={() => setShowChangePasswordModal(false)}
      />
    </div>
  );
}