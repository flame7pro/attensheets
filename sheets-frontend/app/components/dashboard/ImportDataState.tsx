'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { Upload, FileSpreadsheet, Download, X, ArrowLeft, UserPlus, Users as UsersIcon, FileUp, Check } from 'lucide-react';
import { Class, Student, AttendanceThresholds } from '@/types';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

interface ImportDataStateProps {
  onImport: (newClass: Class) => void;
  onCancel: () => void;
  defaultThresholds: AttendanceThresholds;
}

type EnrollmentMode = 'enrollment_via_id' | 'manual_entry' | 'import_data';

export const ImportDataState: React.FC<ImportDataStateProps> = ({
  onImport,
  onCancel,
  defaultThresholds,
}) => {
  // Step management: mode → name → (import-file if import_data selected)
  const [step, setStep] = useState<'mode' | 'name' | 'import-file'>('mode');
  const [selectedMode, setSelectedMode] = useState<EnrollmentMode>('enrollment_via_id');

  // Class data
  const [className, setClassName] = useState('');
  const [importedStudents, setImportedStudents] = useState<Student[]>([]);
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);

  // Mode options - PERFECTLY RESPONSIVE
  const modes = [
    {
      id: 'enrollment_via_id' as const,
      icon: UserPlus,
      title: 'Enroll via Class ID',
      description: 'Students enroll using a unique Class ID you share',
      badge: 'QR Enabled',
      badgeColor: 'bg-emerald-100 text-emerald-700',
      features: [
        '✓ QR Code Attendance enabled',
        '✓ Students self-enroll with Class ID',
        '✓ Automatic roster updates',
        '✓ No manual data entry needed'
      ],
      iconBg: 'bg-emerald-100',
      iconColor: 'text-emerald-600',
      hoverBorder: 'hover:border-emerald-400'
    },
    {
      id: 'manual_entry' as const,
      icon: UsersIcon,
      title: 'Manual Entry',
      description: 'Add students directly into the attendance sheet',
      features: [
        '✓ Direct entry in spreadsheet',
        '✓ Full control over student data',
        '✓ Edit anytime',
        '✗ No QR attendance'
      ],
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      hoverBorder: 'hover:border-blue-400'
    },
    {
      id: 'import_data' as const,
      icon: FileUp,
      title: 'Import from File',
      description: 'Upload CSV or Excel file with student roster',
      features: [
        '✓ Bulk import (CSV, Excel)',
        '✓ Fast setup with existing data',
        '✓ Supports custom fields',
        '✗ No QR attendance'
      ],
      iconBg: 'bg-purple-100',
      iconColor: 'text-purple-600',
      hoverBorder: 'hover:border-purple-400'
    }
  ];

  // Handle mode selection
  const handleModeSelect = (mode: EnrollmentMode) => {
    setSelectedMode(mode);
    setStep('name');
  };

  // Handle class name submission
  const handleClassNameSubmit = () => {
    if (!className.trim()) {
      setError('Please enter a class name');
      return;
    }
    if (selectedMode === 'import_data') {
      // Go to file import step
      setStep('import-file');
    } else {
      // Create empty class for enrollment_via_id or manual_entry
      const newClass: Class = {
        id: Date.now(),
        name: className.trim(),
        students: [],
        customColumns: [],
        thresholds: defaultThresholds,
        enrollment_mode: selectedMode,
      };
      onImport(newClass);
    }
  };

  // File upload handlers
  const handleFileUpload = async (file: File) => {
    if (!file) return;
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(fileExtension || '')) {
      setError('Please upload a valid CSV or Excel file');
      return;
    }
    try {
      if (fileExtension === 'csv') {
        // Parse CSV
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            processImportedData(results.data as any[]);
          },
          error: () => {
            setError('Failed to parse CSV file');
          },
        });
      } else {
        // Parse Excel
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        processImportedData(jsonData as any[]);
      }
      setUploadedFiles([file]);
    } catch (err) {
      setError('Error reading file. Please check the format.');
    }
  };

  const processImportedData = (data: any[]) => {
    if (data.length === 0) {
      setError('File is empty');
      return;
    }

    // Get all column names from the first row
    const columns = Object.keys(data[0]);

    // Smart column detection function
    const detectColumn = (possibleNames: string[]) => {
      return columns.find(col =>
        possibleNames.some(name =>
          col.toLowerCase().trim().includes(name.toLowerCase())
        )
      );
    };

    // Detect name column (required)
    const nameCol = detectColumn([
      'name', 'student name', 'student', 'full name',
      'studentname', 'fullname', 'naam', 'students'
    ]);

    // Detect roll number column (optional)
    const rollNoCol = detectColumn([
      'roll', 'roll no', 'rollno', 'roll number', 'rollnumber',
      'id', 'student id', 'studentid', 'number', 'enrollment',
      'enrollment no', 'enrollmentno', 'enrollment number', 'reg no',
      'registration', 'regd no', 'registration no'
    ]);

    // Detect email column (optional)
    const emailCol = detectColumn([
      'email', 'e-mail', 'mail', 'email address', 'emailaddress', 'e mail'
    ]);

    // Columns to ignore (serial numbers, etc.)
    const ignoreColumns = ['sr no', 'sr. no', 's.no', 's no', 'sno', 'serial', 'serial no', '#', 'no'];

    // Identify custom columns
    const customColumnNames = columns.filter(col => {
      const colLower = col.toLowerCase().trim();
      if (col === nameCol) return false;
      if (col === rollNoCol) return false;
      if (col === emailCol) return false;
      if (ignoreColumns.some(ignore => colLower.includes(ignore.toLowerCase()))) return false;
      return true;
    });

    console.log('Detected custom columns:', customColumnNames);

    if (!nameCol) {
      setError('Could not find student name column. Please ensure your file has a column with "Name", "Student Name", or similar heading.');
      return;
    }

    // Process students
    const students: Student[] = data.map((row, index) => {
      const student: Student = {
        id: Date.now() + index,
        name: String(row[nameCol] || '').trim(),
        rollNo: rollNoCol ? String(row[rollNoCol] || '').trim() : '',
        attendance: {},
      };

      // Add email if detected
      if (emailCol && row[emailCol]) {
        (student as any).email = String(row[emailCol]).trim();
      }

      // Add custom column values (stored temporarily by column NAME)
      if (customColumnNames.length > 0) {
        (student as any).customFields = {};
        customColumnNames.forEach(colName => {
          const value = row[colName];
          if (value !== undefined && value !== null && String(value).trim() !== '') {
            (student as any).customFields[colName] = String(value).trim();
          }
        });
      }

      return student;
    }).filter(s => s.name);

    if (students.length === 0) {
      setError('No valid student data found. Please ensure your file has student names in a "Name" or "Student Name" column.');
      return;
    }

    setImportedStudents(students);
    setError('');
  };


  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleImportComplete = () => {
    if (importedStudents.length === 0) {
      setError('No students to import');
      return;
    }

    // Extract unique custom column names from all students
    const customColumnNamesSet = new Set<string>();
    importedStudents.forEach(student => {
      if ((student as any).customFields) {
        Object.keys((student as any).customFields).forEach(key => {
          customColumnNamesSet.add(key);
        });
      }
    });

    // Create customColumns array with unique IDs
    const customColumns = Array.from(customColumnNamesSet).map((colName, index) => ({
      id: `custom-${Date.now()}-${index}`,
      name: colName,
      label: colName,  // ✅ Added this line
      type: 'text' as const
    }));


    console.log('Creating class with custom columns:', customColumns);

    // FIX: Map custom field data from column NAMES to column IDs
    const mappedStudents = importedStudents.map(student => {
      const mappedStudent = { ...student };

      if ((student as any).customFields) {
        // For each custom column, map data to use column.id as key
        customColumns.forEach(column => {
          const fieldValue = (student as any).customFields[column.name];
          if (fieldValue !== undefined) {
            // Store using column.id (not column.name)
            (mappedStudent as any)[column.id] = fieldValue;
          }
        });

        // Remove the temporary customFields object
        delete (mappedStudent as any).customFields;
      }

      return mappedStudent;
    });

    console.log('Mapped students sample:', mappedStudents[0]);

    const newClass: Class = {
      id: Date.now(),
      name: className.trim(),
      students: mappedStudents,
      customColumns: customColumns,
      thresholds: defaultThresholds,
      enrollment_mode: 'import_data',
    };

    onImport(newClass);
  };


  const downloadTemplate = () => {
    const csvContent = `Name,Roll No,Email
John Doe,101,john.doe@example.com
Jane Smith,102,jane.smith@example.com
Mike Johnson,103,mike.johnson@example.com

NOTE: Column Detection - Name columns: "Name", "Student Name", "Full Name", "Student"
- Roll No columns: "Roll No", "ID", "Student ID", "Enrollment No"
- Email columns: "Email", "E-mail", "Email Address"
- Any other column (like "Phone", "Parent Name") will be imported as custom fields
- Serial number columns (Sr No, #, etc.) are automatically ignored
- Columns can be in any order!`;
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'student_roster_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-sm sm:max-w-2xl lg:max-w-6xl">
        {/* Step 1: Mode Selection */}
        {step === 'mode' && (
          <div className="space-y-6 sm:space-y-8 animate-fade-in">
            <div className="text-center">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 leading-tight">
                Create Your Class
              </h1>
              <p className="text-base sm:text-lg text-gray-600 max-w-md mx-auto">
                Choose how you'd like to add students
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {modes.map((mode) => {
                const Icon = mode.icon;
                return (
                  <div
                    key={mode.id}
                    onClick={() => handleModeSelect(mode.id)}
                    className={`group relative p-4 sm:p-6 bg-white rounded-2xl border-2 border-gray-200 ${mode.hoverBorder} hover:shadow-xl transition-all cursor-pointer h-full flex flex-col`}
                  >
                    {mode.badge && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className={`px-2 sm:px-3 py-1 text-xs font-bold rounded-full ${mode.badgeColor} shadow-sm`}>
                          {mode.badge}
                        </span>
                      </div>
                    )}
                    <div className="flex flex-col items-center text-center space-y-3 sm:space-y-4 flex-1">
                      {/* Icon */}
                      <div className={`p-3 sm:p-4 rounded-2xl ${mode.iconBg} transition-transform group-hover:scale-110 mx-auto`}>
                        <Icon className={`w-6 h-6 sm:w-8 sm:h-8 ${mode.iconColor}`} />
                      </div>
                      {/* Title & Description */}
                      <div className="space-y-2 flex-1">
                        <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2 leading-tight">
                          {mode.title}
                        </h3>
                        <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
                          {mode.description}
                        </p>
                      </div>
                      {/* Features */}
                      <ul className="space-y-1 sm:space-y-2 text-left w-full pb-8 flex-1 min-h-0">
                        {mode.features.map((feature, idx) => (
                          <li
                            key={idx}
                            className={`text-xs font-medium sm:text-sm font-medium ${feature.startsWith('✗')
                                ? 'text-rose-400'
                                : 'text-black'
                              }`}
                          >
                            {feature}
                          </li>
                        ))}
                      </ul>
                      {/* Select Button */}
                      <button className="w-full mt-4 px-4 py-2 sm:py-3 bg-gray-100 group-hover:bg-emerald-600 group-hover:text-white text-gray-700 font-semibold rounded-xl transition-all text-sm sm:text-base">
                        Select This Option
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="text-center pt-4">
              <button
                onClick={onCancel}
                className="text-gray-600 hover:text-gray-900 font-medium transition-colors text-sm sm:text-base"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Class Name Input */}
        {step === 'name' && (
          <div className="max-w-md sm:mx-auto max-w-xl space-y-6 animate-fade-in">
            <button
              onClick={() => {
                setStep('mode');
                setError('');
              }}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors text-sm sm:text-base"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              Back to options
            </button>
            <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-200">
              <div className="text-center mb-6 sm:mb-8">
                <div className={`inline-flex p-3 sm:p-4 rounded-2xl ${modes.find(m => m.id === selectedMode)?.iconBg} mb-4 mx-auto`}>
                  {React.createElement(modes.find(m => m.id === selectedMode)?.icon!, {
                    className: `w-8 h-8 sm:w-10 sm:h-10 ${modes.find(m => m.id === selectedMode)?.iconColor}`
                  })}
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2 leading-tight">
                  Name Your Class
                </h2>
                <p className="text-gray-600 text-sm sm:text-base max-w-md mx-auto">
                  {selectedMode === 'enrollment_via_id' && 'Students will enroll using a Class ID you share'}
                  {selectedMode === 'manual_entry' && 'You can add students manually in the sheet'}
                  {selectedMode === 'import_data' && 'Get ready to import your student roster'}
                </p>
              </div>
              {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-start gap-2">
                  <X className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm sm:text-base font-semibold text-gray-700 mb-2">
                    Class Name *
                  </label>
                  <input
                    type="text"
                    value={className}
                    onChange={(e) => {
                      setClassName(e.target.value);
                      setError('');
                    }}
                    placeholder="e.g., Computer Science 101"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 transition-all"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && className.trim()) {
                        handleClassNameSubmit();
                      }
                    }}
                  />
                </div>
                <button
                  onClick={handleClassNameSubmit}
                  disabled={!className.trim()}
                  className="w-full px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors shadow-lg hover:shadow-xl text-sm sm:text-base"
                >
                  {selectedMode === 'import_data' ? 'Continue to Import' : 'Create Class'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: File Import (only for import_data mode) */}
        {step === 'import-file' && (
          <div className="max-w-lg sm:max-w-4xl mx-auto space-y-6 animate-fade-in">
            <button
              onClick={() => {
                setStep('name');
                setError('');
                setImportedStudents([]);
                setUploadedFiles([]);
              }}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors text-sm sm:text-base"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              Back
            </button>
            <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-200">
              <div className="text-center mb-6 sm:mb-8">
                <div className="inline-flex p-3 sm:p-4 rounded-2xl bg-purple-100 mb-4 mx-auto">
                  <FileSpreadsheet className="w-8 h-8 sm:w-10 sm:h-10 text-purple-600" />
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2 leading-tight">
                  Import Students for "{className}"
                </h2>
                <p className="text-gray-600 text-sm sm:text-base max-w-md mx-auto">
                  Upload CSV or Excel file with your student roster
                </p>
              </div>
              {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-start gap-3 text-sm">
                  <X className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
              {importedStudents.length === 0 ? (
                <div className="space-y-6">
                  {/* Upload Area */}
                  <div
                    onDrop={handleDrop}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    className={`relative border-2 border-dashed rounded-2xl p-12 sm:p-16 text-center transition-all ${dragActive
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-gray-300 hover:border-emerald-400 hover:bg-emerald-50/50'
                      }`}
                  >
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file);
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <Upload className="w-12 h-12 sm:w-16 sm:h-16 text-gray-400 mx-auto mb-4" />
                    <p className="text-lg sm:text-xl font-semibold text-gray-700 mb-2 leading-tight">
                      {dragActive ? 'Drop your file here' : 'Drop your file here, or click to browse'}
                    </p>
                    <p className="text-xs sm:text-sm text-gray-500">
                      Supports CSV and Excel (.xlsx, .xls) files
                    </p>
                  </div>
                  {/* Template Download */}
                  <div className="bg-blue-50 rounded-xl p-4 sm:p-6 border border-blue-200">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                      <div className="p-3 bg-blue-100 rounded-xl flex-shrink-0">
                        <FileSpreadsheet className="w-6 h-6 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-blue-900 mb-1 text-sm sm:text-base">
                          Need a template?
                        </h3>
                        <p className="text-sm text-blue-700 mb-3 text-xs sm:text-sm">
                          Download our CSV template with the correct format (Name, Roll No columns)
                        </p>
                        <button
                          onClick={downloadTemplate}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold rounded-lg transition-colors"
                        >
                          <Download className="w-4 h-4" />
                          Download Template
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Success Preview */}
                  <div className="bg-emerald-50 rounded-xl p-4 sm:p-6 border border-emerald-200">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 mb-4">
                      <div className="p-2 bg-emerald-600 rounded-lg flex-shrink-0">
                        <Check className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-emerald-900">
                          Successfully imported {importedStudents.length} students
                        </h3>
                        <p className="text-sm text-emerald-700">
                          Review the data below and click "Create Class" to finish
                        </p>
                      </div>
                    </div>
                    {/* Student Preview Table */}
                    <div className="bg-white rounded-lg p-4 max-h-64 sm:max-h-80 overflow-y-auto border border-emerald-200">
                      <div className="w-full overflow-x-auto">
                        <table className="w-full text-xs sm:text-sm min-w-[300px]">
                          <thead className="border-b-2 border-gray-200 sticky top-0 bg-white">
                            <tr>
                              <th className="text-left py-3 px-4 font-bold text-gray-700">#</th>
                              <th className="text-left py-3 px-4 font-bold text-gray-700">Student Name</th>
                              <th className="text-left py-3 px-4 font-bold text-gray-700">Roll Number</th>
                            </tr>
                          </thead>
                          <tbody>
                            {importedStudents.map((student, idx) => (
                              <tr key={student.id} className="border-b border-gray-100 hover:bg-gray-50">
                                <td className="py-3 px-4 text-gray-600">{idx + 1}</td>
                                <td className="py-3 px-4 text-gray-900 font-medium">{student.name}</td>
                                <td className="py-3 px-4 text-gray-600">{student.rollNo || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                  {/* Actions */}
                  <div className="flex flex-col sm:flex-row gap-4">
                    <button
                      onClick={() => {
                        setImportedStudents([]);
                        setUploadedFiles([]);
                        setError('');
                      }}
                      className="flex-1 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors text-sm sm:text-base"
                    >
                      Upload Different File
                    </button>
                    <button
                      onClick={handleImportComplete}
                      className="flex-1 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-colors shadow-lg hover:shadow-xl text-sm sm:text-base"
                    >
                      Create Class with {importedStudents.length} Students
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};