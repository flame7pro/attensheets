'use client';

import React, { useState } from 'react';
import { Settings, X, Save, RotateCcw, Copy, AlertCircle } from 'lucide-react';

interface AttendanceThresholds {
  excellent: number;
  good: number;
  moderate: number;
  atRisk: number;
}

interface Class {
  id: number;
  name: string;
}

interface ClassThresholdSettingsProps {
  isOpen: boolean;
  currentClass: Class;
  allClasses: Class[];
  thresholds: AttendanceThresholds;
  onClose: () => void;
  onSave: (thresholds: AttendanceThresholds, applyToClassIds: number[]) => void;
}

export const ClassThresholdSettings: React.FC<ClassThresholdSettingsProps> = ({
  isOpen,
  currentClass,
  allClasses,
  thresholds,
  onClose,
  onSave,
}) => {
  const [localThresholds, setLocalThresholds] = useState<AttendanceThresholds>(thresholds);
  const [selectedClasses, setSelectedClasses] = useState<number[]>([currentClass.id]);
  const [error, setError] = useState('');

  const defaultThresholds: AttendanceThresholds = {
    excellent: 95.000,
    good: 90.000,
    moderate: 85.000,
    atRisk: 85.000,
  };

  React.useEffect(() => {
    if (isOpen) {
      setLocalThresholds(thresholds);
      setSelectedClasses([currentClass.id]);
      setError('');
    }
  }, [isOpen, thresholds, currentClass.id]);

  const handleChange = (key: keyof AttendanceThresholds, value: string) => {
    if (value === '') {
      setLocalThresholds({
        ...localThresholds,
        [key]: 0,
      });
      return;
    }

    const numValue = parseFloat(value);

    if (isNaN(numValue) || numValue < 0 || numValue > 100) {
      setError('Values must be between 0.000 and 100.000');
      return;
    }

    const roundedValue = Math.round(numValue * 1000) / 1000;

    setError('');
    setLocalThresholds({
      ...localThresholds,
      [key]: roundedValue,
    });
  };

  const validateThresholds = (): boolean => {
    if (localThresholds.excellent <= localThresholds.good) {
      setError('Excellent threshold must be greater than Good threshold');
      return false;
    }
    if (localThresholds.good <= localThresholds.moderate) {
      setError('Good threshold must be greater than Moderate threshold');
      return false;
    }
    if (localThresholds.moderate < localThresholds.atRisk) {
      setError('Moderate threshold must be greater than or equal to At Risk threshold');
      return false;
    }
    return true;
  };

  const handleSave = () => {
    if (validateThresholds()) {
      onSave(localThresholds, selectedClasses);
      onClose();
    }
  };

  const handleReset = () => {
    setLocalThresholds(defaultThresholds);
    setError('');
  };

  const toggleClassSelection = (classId: number) => {
    if (classId === currentClass.id) return;

    setSelectedClasses(prev =>
      prev.includes(classId)
        ? prev.filter(id => id !== classId)
        : [...prev, classId]
    );
  };

  const selectAllClasses = () => {
    setSelectedClasses(allClasses.map(c => c.id));
  };

  const deselectAllOthers = () => {
    setSelectedClasses([currentClass.id]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-lg sm:rounded-2xl shadow-2xl w-full max-w-[98vw] sm:max-w-3xl overflow-hidden max-h-[92vh] sm:max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-3 sm:px-6 md:px-8 py-3 sm:py-5 md:py-6 flex-shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="hidden sm:flex w-10 h-10 md:w-12 md:h-12 bg-white/20 rounded-lg md:rounded-xl items-center justify-center flex-shrink-0">
                <Settings className="w-5 h-5 md:w-6 md:h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg md:text-2xl font-bold text-white truncate">Attendance Thresholds</h2>
                <p className="hidden sm:block text-emerald-50 text-xs md:text-sm mt-0.5 md:mt-1 truncate">Configure thresholds for {currentClass.name}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 sm:p-2 hover:bg-white/10 rounded-lg transition-colors flex-shrink-0"
            >
              <X className="w-5 h-5 md:w-6 md:h-6 text-white" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 md:p-8">
          {/* Error Message */}
          {error && (
            <div className="mb-3 sm:mb-4 md:mb-6 p-2.5 sm:p-3 md:p-4 bg-rose-50 border border-rose-200 rounded-lg">
              <p className="text-rose-700 text-xs sm:text-sm">{error}</p>
            </div>
          )}

          {/* Info Box */}
          <div className="mb-3 sm:mb-4 md:mb-6 p-2.5 sm:p-3 md:p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-blue-800 text-xs sm:text-sm">
              <strong>Note:</strong> All thresholds support up to 3 decimal places (e.g., 95.500%)
            </p>
          </div>

          {/* Threshold Configuration */}
          <div className="space-y-3 sm:space-y-4 md:space-y-6 mb-3 sm:mb-4 md:mb-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-3 sm:mb-4">
              <h3 className="text-sm sm:text-base md:text-lg font-semibold text-slate-900">Configure Thresholds</h3>
              <button
                onClick={handleReset}
                className="text-xs sm:text-sm text-emerald-600 hover:text-emerald-700 font-medium whitespace-nowrap"
              >
                Reset to Default
              </button>
            </div>

            {error && (
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-2 sm:p-3 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-rose-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs sm:text-sm text-rose-700">{error}</p>
              </div>
            )}

            {/* Excellent Threshold */}
            <div className="bg-emerald-50 rounded-lg md:rounded-xl p-2.5 sm:p-3 md:p-4 border border-emerald-200">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-2 sm:mb-3">
                <label className="hidden sm:flex text-xs sm:text-sm font-semibold text-emerald-900 items-center gap-1.5 sm:gap-2">
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-emerald-500 rounded-full flex-shrink-0"></div>
                  Excellent Attendance
                </label>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    max="100"
                    value={localThresholds.excellent}
                    onChange={(e) => handleChange('excellent', e.target.value)}
                    className="flex-1 sm:flex-none w-full sm:w-16 md:w-20 lg:w-24 px-2 sm:px-2.5 md:px-3 py-1.5 md:py-2 border border-emerald-300 rounded-md sm:rounded-lg text-xs sm:text-sm font-bold text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  />
                  <span className="text-xs sm:text-sm font-semibold text-emerald-700 flex-shrink-0">%</span>
                </div>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="0.1"
                value={localThresholds.excellent}
                onChange={(e) => handleChange('excellent', e.target.value)}
                className="hidden sm:block w-full h-2 bg-emerald-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                style={{
                  background: `linear-gradient(to right, #10b981 0%, #10b981 ${localThresholds.excellent}%, #d1fae5 ${localThresholds.excellent}%, #d1fae5 100%)`
                }}
              />
              <p className="text-xs text-emerald-700 mt-1.5 sm:mt-2">
                Students with attendance ≥ {localThresholds.excellent.toFixed(3)}%
              </p>
            </div>

            {/* Good Threshold */}
            <div className="bg-blue-50 rounded-lg md:rounded-xl p-2.5 sm:p-3 md:p-4 border border-blue-200">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-2 sm:mb-3">
                <label className="hidden sm:flex text-xs sm:text-sm font-semibold text-blue-900 items-center gap-1.5 sm:gap-2">
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-blue-500 rounded-full flex-shrink-0"></div>
                  Good Attendance
                </label>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    max="100"
                    value={localThresholds.good}
                    onChange={(e) => handleChange('good', e.target.value)}
                    className="flex-1 sm:flex-none w-full sm:w-16 md:w-20 lg:w-24 px-2 sm:px-2.5 md:px-3 py-1.5 md:py-2 border border-blue-300 rounded-md sm:rounded-lg text-xs sm:text-sm font-bold text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                  <span className="text-xs sm:text-sm font-semibold text-blue-700 flex-shrink-0">%</span>
                </div>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="0.1"
                value={localThresholds.good}
                onChange={(e) => handleChange('good', e.target.value)}
                className="hidden sm:block w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                style={{
                  background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${localThresholds.good}%, #dbeafe ${localThresholds.good}%, #dbeafe 100%)`
                }}
              />
              <p className="text-xs text-blue-700 mt-1.5 sm:mt-2">
                Students with attendance {localThresholds.good.toFixed(3)}% - {(localThresholds.excellent - 0.001).toFixed(3)}%
              </p>
            </div>

            {/* Moderate Threshold */}
            <div className="bg-amber-50 rounded-lg md:rounded-xl p-2.5 sm:p-3 md:p-4 border border-amber-200">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-2 sm:mb-3">
                <label className="hidden sm:flex text-xs sm:text-sm font-semibold text-amber-900 items-center gap-1.5 sm:gap-2">
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-amber-500 rounded-full flex-shrink-0"></div>
                  Moderate Attendance
                </label>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    max="100"
                    value={localThresholds.moderate}
                    onChange={(e) => handleChange('moderate', e.target.value)}
                    className="flex-1 sm:flex-none w-full sm:w-16 md:w-20 lg:w-24 px-2 sm:px-2.5 md:px-3 py-1.5 md:py-2 border border-amber-300 rounded-md sm:rounded-lg text-xs sm:text-sm font-bold text-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                  />
                  <span className="text-xs sm:text-sm font-semibold text-amber-700 flex-shrink-0">%</span>
                </div>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="0.1"
                value={localThresholds.moderate}
                onChange={(e) => handleChange('moderate', e.target.value)}
                className="hidden sm:block w-full h-2 bg-amber-200 rounded-lg appearance-none cursor-pointer accent-amber-600"
                style={{
                  background: `linear-gradient(to right, #f59e0b 0%, #f59e0b ${localThresholds.moderate}%, #fef3c7 ${localThresholds.moderate}%, #fef3c7 100%)`
                }}
              />
              <p className="text-xs text-amber-700 mt-1.5 sm:mt-2">
                Students with attendance {localThresholds.moderate.toFixed(3)}% - {(localThresholds.good - 0.001).toFixed(3)}%
              </p>
            </div>

            {/* At Risk Threshold */}
            <div className="bg-rose-50 rounded-lg md:rounded-xl p-2.5 sm:p-3 md:p-4 border border-rose-200">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-2 sm:mb-3">
                <label className="hidden sm:flex text-xs sm:text-sm font-semibold text-rose-900 items-center gap-1.5 sm:gap-2">
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-rose-500 rounded-full flex-shrink-0"></div>
                  At Risk (Below)
                </label>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    max="100"
                    value={localThresholds.atRisk}
                    onChange={(e) => handleChange('atRisk', e.target.value)}
                    className="flex-1 sm:flex-none w-full sm:w-16 md:w-20 lg:w-24 px-2 sm:px-2.5 md:px-3 py-1.5 md:py-2 border border-rose-300 rounded-md sm:rounded-lg text-xs sm:text-sm font-bold text-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white"
                  />
                  <span className="text-xs sm:text-sm font-semibold text-rose-700 flex-shrink-0">%</span>
                </div>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="0.1"
                value={localThresholds.atRisk}
                onChange={(e) => handleChange('atRisk', e.target.value)}
                className="hidden sm:block w-full h-2 bg-rose-200 rounded-lg appearance-none cursor-pointer accent-rose-600"
                style={{
                  background: `linear-gradient(to right, #ef4444 0%, #ef4444 ${localThresholds.atRisk}%, #ffe4e6 ${localThresholds.atRisk}%, #ffe4e6 100%)`
                }}
              />
              <p className="text-xs text-rose-700 mt-1.5 sm:mt-2">
                Students with attendance &lt; {localThresholds.moderate.toFixed(3)}% are at risk
              </p>
            </div>
          </div>

          {/* Visual Preview - Hidden on mobile */}
          <div className="hidden sm:block mb-4 sm:mb-6 md:mb-8 p-3 sm:p-4 md:p-6 bg-slate-50 rounded-lg sm:rounded-xl border border-slate-200">
            <h4 className="text-xs sm:text-sm font-semibold text-slate-700 mb-2 sm:mb-3 md:mb-4">Preview Scale</h4>
            <div className="relative h-8 sm:h-10 md:h-12 bg-white rounded-lg overflow-hidden border border-slate-300">
              <div
                className="absolute top-0 left-0 h-full bg-rose-500 opacity-30"
                style={{ width: `${localThresholds.moderate}%` }}
              ></div>
              <div
                className="absolute top-0 h-full bg-amber-500 opacity-30"
                style={{
                  left: `${localThresholds.moderate}%`,
                  width: `${localThresholds.good - localThresholds.moderate}%`
                }}
              ></div>
              <div
                className="absolute top-0 h-full bg-blue-500 opacity-30"
                style={{
                  left: `${localThresholds.good}%`,
                  width: `${localThresholds.excellent - localThresholds.good}%`
                }}
              ></div>
              <div
                className="absolute top-0 right-0 h-full bg-emerald-500 opacity-30"
                style={{ width: `${100 - localThresholds.excellent}%` }}
              ></div>

              <div className="absolute inset-0 flex items-center justify-between px-2 text-xs font-semibold text-slate-700">
                <span>0%</span>
                <span className="hidden sm:inline">50%</span>
                <span>100%</span>
              </div>
            </div>
            <div className="flex justify-between mt-2 sm:mt-3 text-xs">
              <span className="text-rose-600 font-medium">At Risk</span>
              <span className="text-amber-600 font-medium hidden sm:inline">Moderate</span>
              <span className="text-blue-600 font-medium hidden sm:inline">Good</span>
              <span className="text-emerald-600 font-medium">Excellent</span>
            </div>
          </div>

          {/* Apply to Other Classes */}
          {allClasses.length > 1 && (
            <div className="border-t border-slate-200 pt-4 sm:pt-5 md:pt-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-3 sm:mb-4">
                <div>
                  <h3 className="text-sm sm:text-base md:text-lg font-semibold text-slate-900 flex items-center gap-2">
                    <Copy className="w-4 h-4 sm:w-5 sm:h-5 text-teal-600" />
                    Apply to Other Classes
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 mt-0.5 sm:mt-1">
                    Select which classes should use these same thresholds
                  </p>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  <button
                    onClick={selectAllClasses}
                    className="flex-1 sm:flex-none px-2.5 sm:px-3 py-1.5 text-xs font-medium text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                  >
                    Select All
                  </button>
                  <button
                    onClick={deselectAllOthers}
                    className="flex-1 sm:flex-none px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    Current Only
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:max-h-48 sm:overflow-y-auto">
                {allClasses.map((cls) => {
                  const isCurrentClass = cls.id === currentClass.id;
                  const isSelected = selectedClasses.includes(cls.id);

                  return (
                    <label
                      key={cls.id}
                      className={`flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-lg border-2 transition-all cursor-pointer ${isCurrentClass
                          ? 'bg-emerald-50 border-emerald-300'
                          : isSelected
                            ? 'bg-teal-50 border-teal-300'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleClassSelection(cls.id)}
                        disabled={isCurrentClass}
                        className="w-4 h-4 text-teal-600 rounded focus:ring-2 focus:ring-teal-500 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium text-sm truncate ${isCurrentClass ? 'text-emerald-900' : 'text-slate-900'}`}>
                          {cls.name}
                          {isCurrentClass && (
                            <span className="ml-2 text-xs text-emerald-600 font-semibold">(Current)</span>
                          )}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex-shrink-0 border-t border-slate-200 p-3 sm:p-4 md:p-6 bg-slate-50">
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
            <button
              onClick={handleReset}
              className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-3 bg-white hover:bg-slate-100 text-slate-700 text-sm font-medium rounded-lg sm:rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer border border-slate-200"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="hidden sm:inline">Reset to Default</span>
              <span className="sm:hidden">Reset</span>
            </button>
            <div className="flex-1"></div>
            <button
              onClick={onClose}
              className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-3 bg-white hover:bg-slate-100 text-slate-700 text-sm font-medium rounded-lg sm:rounded-xl transition-colors cursor-pointer border border-slate-200"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-medium rounded-lg sm:rounded-xl hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              Apply to {selectedClasses.length} {selectedClasses.length === 1 ? 'Class' : 'Classes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
