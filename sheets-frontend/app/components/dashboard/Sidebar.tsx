'use client';

import React, { useState, useEffect } from 'react';
import { Plus, X, BarChart3, Settings, FileText, Users, LayoutDashboard, LogOut, Edit2, Check, GraduationCap } from 'lucide-react';
import { Class, Student, CustomColumn } from '@/types';

interface SidebarProps {
  collapsed: boolean;
  classes: Class[];
  activeClassId: number | null;
  onClassSelect: (id: number) => void;
  onAddClass: () => void;
  onDeleteClass: (id: number, e: React.MouseEvent) => void;
  onViewAllClasses: () => void;
  onViewSnapshot: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
  onUpdateClassName: (id: number, newName: string) => void;
  onManageDevices: () => void; // ✅ NEW PROP
}

export const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  classes,
  activeClassId,
  onClassSelect,
  onAddClass,
  onDeleteClass,
  onViewAllClasses,
  onViewSnapshot,
  onOpenSettings,
  onLogout,
  onUpdateClassName,
  onManageDevices, // ✅ NEW PROP
}) => {
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [editingClassId, setEditingClassId] = useState<number | null>(null);
  const [editedClassName, setEditedClassName] = useState('');
  const displayedClasses = classes.slice(0, 3);

  const handleLogoutClick = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = () => {
    setIsLoggingOut(true);
    setTimeout(() => {
      onLogout();
    }, 1200);
  };
  const handleStartEdit = (classId: number, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingClassId(classId);
    setEditedClassName(currentName);
  };

  const handleSaveEdit = (classId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (editedClassName.trim() && editedClassName !== classes.find(c => c.id === classId)?.name) {
      onUpdateClassName(classId, editedClassName.trim());
    }
    setEditingClassId(null);
    setEditedClassName('');
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingClassId(null);
    setEditedClassName('');
  };

  // Cancel editing when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (editingClassId !== null) {
        setEditingClassId(null);
        setEditedClassName('');
      }
    };

    if (editingClassId !== null) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [editingClassId]);


  return (
    <>
      {/* Mobile Backdrop */}
      {!collapsed && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => {
            const menuButton = document.querySelector('[data-mobile-menu]');
            if (menuButton) (menuButton as HTMLElement).click();
          }}
        />
      )}

      <div className={`
    fixed lg:relative
    top-0 left-0 h-screen lg:h-auto
    bg-white border-r border-emerald-200/60 shadow-xl lg:shadow-sm 
    flex flex-col 
    transition-all duration-300 ease-in-out 
    z-50 lg:z-auto
    ${collapsed ? '-translate-x-full lg:translate-x-0 lg:w-0 lg:border-r-0' : 'translate-x-0 w-72'}
  `}>

        {/* Mobile Close Button */}
        <div className={`lg:hidden flex justify-end p-2 border-b border-slate-200 ${collapsed ? 'hidden' : 'block'}`}>
          <button
            onClick={() => {
              const menuButton = document.querySelector('[data-mobile-menu]');
              if (menuButton) (menuButton as HTMLElement).click();
            }}
            className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
            aria-label="Close menu"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>
        <div className={`flex-1 overflow-y-auto transition-opacity duration-300 ${collapsed ? 'opacity-0' : 'opacity-100 p-6'
          }`}>
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
                My Classes
              </h3>
              <button
                onClick={onAddClass}
                className="p-1.5 hover:bg-emerald-50 rounded-lg transition-colors group cursor-pointer"
                title="Add new class"
              >
                <Plus className="w-4 h-4 text-slate-600 group-hover:text-emerald-600" />
              </button>
            </div>
            <div className="space-y-2">
              {displayedClasses.map(cls => {
                const isActive = activeClassId === cls.id;
                const isEditing = editingClassId === cls.id;
                return (
                  <div
                    key={cls.id}
                    onClick={() => !isEditing && onClassSelect(cls.id)}
                    className={`group relative px-4 py-3 rounded-xl cursor-pointer transition-all ${isActive
                      ? 'bg-gradient-to-r from-emerald-50 to-teal-50 shadow-sm border border-emerald-100'
                      : 'hover:bg-emerald-50/50'
                      }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? 'bg-emerald-500' : 'bg-slate-300'
                          }`}></div>
                        <div className="flex-1 min-w-0">
                          {isEditing ? (
                            <div className="flex flex-col gap-2 w-full" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="text"
                                value={editedClassName}
                                onChange={(e) => setEditedClassName(e.target.value)}
                                className="text-sm font-medium bg-white border border-emerald-500 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 w-full"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveEdit(cls.id, e as any);
                                  if (e.key === 'Escape') handleCancelEdit(e as any);
                                }}
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={(e) => handleSaveEdit(cls.id, e)}
                                  className="flex-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
                                  title="Save"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  className="flex-1 px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-medium rounded-lg transition-colors"
                                  title="Cancel"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className={`text-sm font-medium truncate ${isActive ? 'text-emerald-900' : 'text-slate-700'
                                }`}>
                                {cls.name}
                              </p>
                              <p className={`text-xs ${isActive ? 'text-emerald-600' : 'text-slate-500'
                                }`}>
                                {cls.students.length} students
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <button
                          onClick={(e) => handleStartEdit(cls.id, cls.name, e)}
                          className="p-1.5 hover:bg-emerald-50 rounded-lg transition-all cursor-pointer"
                          title="Edit class name"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-emerald-600" />
                        </button>
                        <button
                          onClick={(e) => onDeleteClass(cls.id, e)}
                          className="p-1.5 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                          title="Delete class"
                        >
                          <X className="w-3.5 h-3.5 text-rose-500" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* View All Classes Button */}
            {classes.length > 0 && (
              <button
                onClick={onViewAllClasses}
                 className="w-full mt-4 px-4 py-3 bg-gradient-to-r from-teal-600 to-cyan-600 text-white text-sm font-semibold rounded-xl hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <BarChart3 className="w-4 h-4" />
                All Classes ({classes.length})
              </button>
            )}

            {/* Dashboard Snapshot Button */}
            {classes.length > 0 && (
              <button
                onClick={onViewSnapshot}
                className="w-full mt-2 px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-semibold rounded-xl hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <LayoutDashboard className="w-4 h-4" />
                Dashboard
              </button>
            )}

            {/* ✅ NEW: Manage Student Devices Button */}
            {classes.length > 0 && (
              <button
                onClick={onManageDevices}
                className="w-full flex items-center gap-3 px-4 py-3 text-slate-700 hover:bg-gradient-to-r hover:from-emerald-50 hover:to-teal-50 rounded-xl transition-all group hover:shadow-md"
              >
                <Smartphone className="w-5 h-5 text-emerald-600 group-hover:scale-110 transition-transform" />
                {!collapsed && (
                  <span className="font-medium group-hover:text-emerald-700">Manage Devices</span>
                )}
              </button>
            )}


            {/* Empty State */}
            {classes.length === 0 && (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <GraduationCap className="w-6 h-6 text-slate-400" />
                </div>
                <p className="text-sm text-slate-600 mb-3">
                  No classes yet
                </p>
                <button
                  onClick={onAddClass}
                  className="px-4 py-2 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 transition-colors cursor-pointer"
                >
                  Create First Class
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Fixed Quick Access Section at Bottom */}
        <div className={`bg-white transition-opacity duration-300 ${collapsed ? 'opacity-0' : 'opacity-100 p-6'
          }`}>
          <div className="space-y-1">
            <button
              onClick={onOpenSettings}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-emerald-50 rounded-xl transition-colors cursor-pointer"
            >
              <Settings className="w-4 h-4 text-emerald-600" />
              Settings
            </button>
            <button
              onClick={handleLogoutClick}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      </div >

      {/* Logout Confirmation Modal */}
      {
        showLogoutConfirm && (
          <div className={`fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity duration-300 ${isLoggingOut ? 'opacity-0' : 'opacity-100'
            }`}>
            <div className={`bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transition-all duration-300 ${isLoggingOut ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
              }`}>
              <div className="bg-gradient-to-r from-rose-600 to-red-600 px-8 py-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                    <LogOut className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">Confirm Logout</h2>
                    <p className="text-rose-50 text-sm mt-1">Are you sure you want to logout?</p>
                  </div>
                </div>
              </div>

              <div className="p-8">
                <p className="text-slate-700 mb-6">
                  You will be redirected to the login page and will need to sign in again to access your classes.
                </p>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowLogoutConfirm(false)}
                    disabled={isLoggingOut}
                    className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmLogout}
                    disabled={isLoggingOut}
                    className="flex-1 px-4 py-3 bg-rose-600 text-white font-medium rounded-xl hover:shadow-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isLoggingOut ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Logging out...
                      </>
                    ) : (
                      'Logout'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }

      {/* LOGOUT TRANSITION OVERLAY - THIS MUST BE AFTER THE MODAL */}
      {
        isLoggingOut && (
          <div
            className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-700"
            style={{ zIndex: 99999 }}
          >
            <div className="text-center space-y-6">
              <div className="w-24 h-24 bg-white/10 rounded-full flex items-center justify-center mx-auto">
                <LogOut className="w-12 h-12 text-white animate-pulse" />
              </div>
              <div>
                <h2 className="text-3xl font-bold text-white mb-2">Logging Out...</h2>
                <p className="text-slate-300 text-lg">See you next time!</p>
              </div>
              <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto"></div>
            </div>
          </div>
        )
      }
    </>
  );
};
