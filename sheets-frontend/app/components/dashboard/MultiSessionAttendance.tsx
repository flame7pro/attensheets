import React, { useState, useEffect } from 'react';
import { X, Clock, Check, AlertCircle, Loader2 } from 'lucide-react';

interface Session {
  id: string;
  name: string;
  status: 'P' | 'A' | 'L' | null;
}

interface MultiSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentName: string;
  date: string;
  currentSessions: Session[];
  onSave: (sessions: Session[]) => void;
}

export const MultiSessionModal: React.FC<MultiSessionModalProps> = ({
  isOpen,
  onClose,
  studentName,
  date,
  currentSessions,
  onSave,
}) => {
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    if (isOpen) {
      // Initialize with 3 sessions
      const initialSessions: Session[] = [];
      for (let i = 0; i < 3; i++) {
        const existing = currentSessions[i];
        initialSessions.push({
          id: existing?.id || `session_${i + 1}`,
          name: existing?.name || `Session ${i + 1}`,
          status: existing?.status || null,
        });
      }
      setSessions(initialSessions);
    }
  }, [isOpen, currentSessions]);

  const toggleStatus = (index: number) => {
    setSessions(prev => {
      const newSessions = [...prev];
      const current = newSessions[index].status;
      
      // ✅ FIXED: Cycle: null → P → A → L → null
      if (current === null) {
        newSessions[index].status = 'P';
      } else if (current === 'P') {
        newSessions[index].status = 'A';
      } else if (current === 'A') {
        newSessions[index].status = 'L';
      } else if (current === 'L') {
        newSessions[index].status = null; // ✅ GO BACK TO NULL
      }
      
      return newSessions;
    });
  };

  const handleSave = () => {
    onSave(sessions);
    onClose();
  };

  const getStatusColor = (status: 'P' | 'A' | 'L' | null) => {
    if (status === 'P') return 'bg-emerald-500 text-white hover:bg-emerald-600';
    if (status === 'A') return 'bg-rose-500 text-white hover:bg-rose-600';
    if (status === 'L') return 'bg-amber-500 text-white hover:bg-amber-600';
    return 'bg-slate-100 text-slate-400 hover:bg-slate-200';
  };

  const hasMultipleSessions = sessions.filter(s => s.status !== null).length > 1;
  
  // Check for mixed statuses (different P/A/L)
  const markedStatuses = new Set(sessions.filter(s => s.status !== null).map(s => s.status));
  const hasMixedStatuses = markedStatuses.size > 1;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4">
      <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-[95vw] sm:max-w-md overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between flex-shrink-0">
          <div className="flex-1 min-w-0 pr-2">
            <h3 className="text-lg sm:text-xl font-bold text-white truncate">Multi-Session Attendance</h3>
            <p className="text-emerald-50 text-xs sm:text-sm mt-1 truncate">{studentName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 hover:bg-emerald-700 rounded-lg transition-colors flex-shrink-0"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </button>
        </div>

        {/* Date Display */}
        <div className="bg-emerald-50 border-b border-emerald-200 px-4 sm:px-6 py-2.5 sm:py-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-700 flex-shrink-0" />
            <span className="text-xs sm:text-sm font-semibold text-emerald-900 truncate">
              {new Date(date).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </span>
          </div>
        </div>

        {/* Info Banner */}
        <div className="bg-blue-50 border-b border-blue-200 px-4 sm:px-6 py-2.5 sm:py-3 flex-shrink-0">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-[10px] sm:text-xs text-blue-800 leading-relaxed">
              Session 1 always syncs with the main attendance sheet. Mark additional sessions here.
            </p>
          </div>
        </div>

        {/* Sessions - Scrollable */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 sm:space-y-4">
          {sessions.map((session, index) => (
            <div
              key={session.id}
              className={`bg-slate-50 rounded-lg sm:rounded-xl p-3 sm:p-4 border-2 transition-all ${
                index === 0 
                  ? 'border-emerald-300 bg-emerald-50/50' 
                  : 'border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
                    {session.name}
                  </span>
                  {index === 0 && (
                    <span className="text-[9px] sm:text-xs bg-emerald-600 text-white px-1.5 sm:px-2 py-0.5 rounded-full font-semibold whitespace-nowrap">
                      Main Sheet
                    </span>
                  )}
                </div>
                {session.status && (
                  <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 flex-shrink-0" />
                )}
              </div>

              <button
                onClick={() => toggleStatus(index)}
                className={`w-full h-12 sm:h-14 text-base sm:text-lg font-bold rounded-lg transition-all shadow-sm active:scale-95 ${getStatusColor(session.status)}`}
              >
                {session.status || '·'}
              </button>
            </div>
          ))}
        </div>

        {/* Multi-Session Indicator */}
        {hasMixedStatuses && (
          <div className="bg-amber-50 border-t border-amber-200 px-4 sm:px-6 py-2.5 sm:py-3 flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-red-600 text-base sm:text-xl flex-shrink-0">★</span>
              <p className="text-[10px] sm:text-xs text-amber-800 font-medium leading-relaxed">
                Multiple sessions with different attendance - Red star will appear on attendance sheet
              </p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="bg-slate-50 px-4 sm:px-6 py-3 sm:py-4 flex gap-2 sm:gap-3 rounded-b-xl sm:rounded-b-2xl border-t border-slate-200 flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 px-3 sm:px-4 py-2 sm:py-2.5 bg-white border-2 border-slate-300 text-slate-700 text-sm sm:text-base font-medium rounded-lg sm:rounded-xl hover:bg-slate-50 transition-all active:scale-95"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-3 sm:px-4 py-2 sm:py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm sm:text-base font-semibold rounded-lg sm:rounded-xl hover:shadow-lg transition-all active:scale-95"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};
