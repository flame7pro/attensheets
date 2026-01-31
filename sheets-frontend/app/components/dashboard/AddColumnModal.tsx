'use client';

import React from 'react';

interface AddColumnModalProps {
  isOpen: boolean;
  columnLabel: string;
  columnType: 'text' | 'number' | 'select';
  onLabelChange: (value: string) => void;
  onTypeChange: (value: 'text' | 'number' | 'select') => void;
  onClose: () => void;
  onCreate: () => void;
}

export const AddColumnModal: React.FC<AddColumnModalProps> = ({
  isOpen,
  columnLabel,
  columnType,
  onLabelChange,
  onTypeChange,
  onClose,
  onCreate,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-sm sm:max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 px-6 py-5 sm:py-6">
          <h2 className="text-lg sm:text-xl font-bold text-white leading-tight">Add Custom Column</h2>
          <p className="text-xs sm:text-sm text-emerald-100 mt-1 leading-relaxed opacity-90">
            Add new field before date column
          </p>
        </div>

        {/* Form */}
        <div className="p-6 sm:p-8 space-y-5">
          {/* Column Label */}
          <div className="space-y-2">
            <label className="text-xs sm:text-sm font-semibold text-slate-800">Column Label</label>
            <input
              type="text"
              value={columnLabel}
              onChange={(e) => onLabelChange(e.target.value)}
              placeholder="e.g. Email, Phone, Section"
              className="w-full px-4 py-3 text-sm sm:text-base border-2 border-slate-200 rounded-xl bg-slate-50/50 text-slate-900 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200/50 focus:bg-white transition-all duration-200"
              autoFocus
            />
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="px-6 sm:px-8 py-5 sm:py-6 bg-slate-50/50 border-t border-slate-100">
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={onCreate}
              className="flex-1 px-5 py-3 text-sm sm:text-base font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg hover:shadow-xl hover:-translate-y-1 active:scale-[0.97] rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!columnLabel.trim()}
            >
              Add Column
            </button>
            <button
              onClick={onClose}
              className="flex-1 px-5 py-3 text-sm sm:text-base font-semibold text-slate-700 bg-white/80 hover:bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-slate-300 focus-visible:ring-offset-2"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
