'use client';

import React, { useState } from 'react';
import { Plus, X, Users, Trash2, Settings, Download, FileText, FileSpreadsheet, File, Check, Edit2, QrCode, UserPlus, Search } from 'lucide-react';
import Papa from 'papaparse';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { MultiSessionModal } from './MultiSessionAttendance';
import { Class, AttendanceThresholds } from '@/types';

interface AttendanceValue {
  sessions?: Array<{ id: string; name: string; status: 'P' | 'A' | 'L' }>;
  status?: 'P' | 'A' | 'L';
  count?: number;
}

interface Student {
  id: number;
  name: string;
  rollNo: string;
  attendance: Record<string, AttendanceValue | 'P' | 'A' | 'L' | undefined>;
  [key: string]: any;
}

interface AttendanceSheetProps {
  activeClass: Class;
  currentMonth: number;
  currentYear: number;
  onAddStudent: () => void;
  onUpdateStudent: (studentId: number, field: string, value: any) => void;
  onDeleteStudent: (studentId: number) => void;
  onToggleAttendance: (studentId: number, day: number) => void;
  onAddColumn: () => void;
  onDeleteColumn: (columnId: string) => void;
  defaultThresholds: AttendanceThresholds;
  onOpenSettings: () => void;
  onUpdateClassName: (newName: string) => void;
  onOpenQRAttendance: () => void;
  onIncrementAttendance: (studentId: number, day: number) => void;
  onUpdateClassData: (updatedClass: Class) => void;
}

export const AttendanceSheet: React.FC<AttendanceSheetProps> = ({
  activeClass,
  currentMonth,
  currentYear,
  onAddStudent,
  onUpdateStudent,
  onDeleteStudent,
  onToggleAttendance,
  onIncrementAttendance,
  onAddColumn,
  onDeleteColumn,
  defaultThresholds,
  onOpenSettings,
  onUpdateClassName,
  onOpenQRAttendance,
  onUpdateClassData,
}) => {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [isEditingClassName, setIsEditingClassName] = useState(false);
  const [editedClassName, setEditedClassName] = useState(activeClass.name);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [showExportOptions, setShowExportOptions] = useState(false);
  const [pdfOrientation, setPdfOrientation] = useState<'portrait' | 'landscape'>('landscape');
  const [exportOnlyClassDays, setExportOnlyClassDays] = useState(true);
  const [pendingExportType, setPendingExportType] = useState<'csv' | 'excel' | null>(null);
  const [copiedClassId, setCopiedClassId] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sessionData, setSessionData] = useState<Record<string, any[]>>({});
  const [showMultiSessionModal, setShowMultiSessionModal] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<number | null>(null);
  const [multiSessionStudentName, setMultiSessionStudentName] = useState('');
  const [multiSessionDate, setMultiSessionDate] = useState('');
  const [multiSessionCurrentData, setMultiSessionCurrentData] = useState<Array<{ id: string; name: string; status: 'P' | 'A' | 'L' | null }>>([]);

  const refreshClassData = async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) return;
  
      console.log('🔄 Refreshing class data from backend...');
      
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/classes/${activeClass.id}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
  
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Fresh data received:', data.class);
        onUpdateClassData(data.class);
      }
    } catch (error) {
      console.error('❌ Failed to refresh class data:', error);
    }
  };
  
  const fetchClassData = async (classId: number) => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) return null;

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
        return data.class;
      }
      return null;
    } catch (error) {
      console.error('Failed to fetch class data:', error);
      return null;
    }
  };

  const handleRightClick = (e: React.MouseEvent, studentId: number, day: number) => {
    e.preventDefault();

    // ✅ FIX: Enable multi-session modal for ALL modes (including QR)
    const student = activeClass.students.find(s => s.id === studentId);
    if (!student) return;

    const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayData = student.attendance[dateKey];

    // Parse current sessions
    let currentSessions: Array<{ id: string; name: string; status: 'P' | 'A' | 'L' | null }> = [];

    if (dayData) {
      if (typeof dayData === 'object' && 'sessions' in dayData) {
        // New format with sessions array
        currentSessions = dayData.sessions.map(s => ({ ...s, status: s.status as 'P' | 'A' | 'L' | null }));
      } else if (typeof dayData === 'object' && 'status' in dayData) {
        // Old format with count
        const count = dayData.count || 1;
        for (let i = 0; i < count; i++) {
          currentSessions.push({
            id: `session_${i + 1}`,
            name: `Session ${i + 1}`,
            status: dayData.status as 'P' | 'A' | 'L'
          });
        }
      } else if (typeof dayData === 'string') {
        // Very old format - single string
        currentSessions.push({
          id: 'session_1',
          name: 'Session 1',
          status: dayData as 'P' | 'A' | 'L'
        });
      }
    }

    // Ensure we have at least 3 session slots
    while (currentSessions.length < 3) {
      currentSessions.push({
        id: `session_${currentSessions.length + 1}`,
        name: `Session ${currentSessions.length + 1}`,
        status: null
      });
    }

    setMultiSessionStudentName(student.name);
    setMultiSessionDate(dateKey);
    setMultiSessionCurrentData(currentSessions);
    setSelectedDay(day);
    setSelectedStudent(studentId);
    setShowMultiSessionModal(true);
  };

  const handleSaveMultiSession = async () => {
    console.log('=== SAVE MULTI-SESSION DEBUG START ===');
    
    try {
      if (!selectedStudent || !multiSessionDate || !activeClass) {
        alert('Please select a student and date');
        return;
      }
  
      // 1. Find the student object
      const student = activeClass.students.find(s => s.id === selectedStudent);
      
      if (!student) {
        console.error('❌ Student not found. selectedStudent:', selectedStudent);
        alert('Student not found');
        return;
      }
      
      console.log('✅ Found student:', student);
      console.log('   Class enrollment mode:', activeClass.enrollment_mode);
      console.log('   Student ID:', student.id, typeof student.id);
      console.log('   Student object keys:', Object.keys(student));
      
      // 2. ✅ FIXED: Determine the correct student ID to send based on enrollment mode
      let studentIdToSend: string;
      
      if (activeClass.enrollment_mode === 'enrollment_via_id' || activeClass.enrollment_mode === 'link_based_enrollment') {
        // For enrollment_via_id mode:
        // - student.id should already be in format "classId_student_X"
        // - Just use it directly as a string
        studentIdToSend = String(student.id);
        console.log('📝 Enrollment via ID mode - using student.id directly:', studentIdToSend);
      } else {
        // For manual_entry or import modes:
        // - student.id is a number (timestamp)
        // - Convert to string
        studentIdToSend = String(student.id);
        console.log('📝 Manual/Import mode - using numeric ID as string:', studentIdToSend);
      }
      
      // 3. ✅ IMPORTANT: Filter out sessions with null status AND convert to proper format
      const validSessions = multiSessionCurrentData
        .filter(session => session.status !== null && session.status !== undefined)
        .map(session => ({
          id: session.id,
          name: session.name,
          status: session.status as 'P' | 'A' | 'L'  // TypeScript type assertion
        }));
      
      console.log('📝 Valid sessions after filtering:', validSessions);
      
      if (validSessions.length === 0) {
        alert('Please mark attendance for at least one session');
        return;
      }
      
      // 4. Create payload - send sessions in the NEW FORMAT expected by backend
      const payload = {
        student_id: studentIdToSend,
        date: multiSessionDate,
        sessions: validSessions  // ✅ Send full session objects, not session_number format
      };
      
      console.log('📤 Request payload:', JSON.stringify(payload, null, 2));
      
      // 5. Send request
      const token = localStorage.getItem('access_token');
      if (!token) {
        alert('No authentication token found. Please log in again.');
        return;
      }
      
      const url = `${process.env.NEXT_PUBLIC_API_URL}/classes/${activeClass.id}/attendance/multi-session`;
      console.log('🌐 Request URL:', url);
      
      const response = await fetch(url, {
        method: 'PUT',  // ✅ Changed from POST to PUT (check your backend route)
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
  
      console.log('📡 Response status:', response.status);
      const responseData = await response.json();
      console.log('📥 Response data:', responseData);
  
      if (!response.ok) {
        let errorMessage = 'Unknown error';
        if (responseData.detail) {
          if (typeof responseData.detail === 'string') {
            errorMessage = responseData.detail;
          } else if (Array.isArray(responseData.detail)) {
            errorMessage = responseData.detail.map((err: any) => 
              `${err.loc?.join('.')}: ${err.msg}${err.input ? ` (got: ${JSON.stringify(err.input)})` : ''}`
            ).join('\n');
          } else {
            errorMessage = JSON.stringify(responseData.detail, null, 2);
          }
        }
        
        console.error('❌ Request failed:', errorMessage);
        
        if (response.status === 404) {
          // Log detailed debug info
          console.error('🔍 DEBUG - Student not found:');
          console.error('   Sent student_id:', studentIdToSend);
          console.error('   Student name:', student.name);
          console.error('   Enrollment mode:', activeClass.enrollment_mode);
          console.error('   All student IDs in class:', activeClass.students.map(s => s.id));
          
          alert(
            `Student not found in backend.\n\n` +
            `This is a data sync issue.\n\n` +
            `Sent ID: ${studentIdToSend}\n` +
            `Student: ${student.name}\n` +
            `Enrollment mode: ${activeClass.enrollment_mode}\n\n` +
            `Please:\n` +
            `1. Refresh the page (Ctrl+R or Cmd+R)\n` +
            `2. If that doesn't work, try logging out and back in\n` +
            `3. If issue persists, the backend may need to be updated`
          );
        } else if (response.status === 405) {
          alert(
            `Method Not Allowed (405)\n\n` +
            `The backend endpoint might be expecting a different HTTP method.\n` +
            `Current: PUT\n` +
            `Try checking if the backend expects POST instead.`
          );
        } else {
          alert('Failed to save attendance:\n\n' + errorMessage);
        }
        
        throw new Error(errorMessage);
      }
  
      console.log('✅ SUCCESS! Attendance saved');
      
      // Close modal and refresh
      setShowMultiSessionModal(false);
      setSelectedStudent(null);
      setSelectedDay(null);
      setMultiSessionCurrentData([]);
      
      // Refresh class data from backend
      await refreshClassData();
      alert('Attendance saved successfully!');
      
    } catch (error) {
      console.error('💥 Error:', error);
      if (error instanceof Error && !error.message.includes('Failed to save')) {
        alert('An unexpected error occurred:\n\n' + error.message);
      }
    }
    
    console.log('=== SAVE MULTI-SESSION DEBUG END ===\n');
  };
  
  const handleCloseMultiSession = () => {
    setShowMultiSessionModal(false);
    setSelectedDay(null);
    setSelectedStudent(null);
  };

  const handleCopyClassId = async () => {
    try {
      await navigator.clipboard.writeText(activeClass.id.toString());
      setCopiedClassId(true);
      setTimeout(() => setCopiedClassId(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };
  const getDaysInMonth = (month: number, year: number) => new Date(year, month + 1, 0).getDate();
  const daysInMonth = getDaysInMonth(currentMonth, currentYear);
  const thresholds = activeClass.thresholds || defaultThresholds;
  const monthName = new Date(currentYear, currentMonth).toLocaleString('default', {
    month: 'long',
    year: 'numeric'
  });

  const calculateAttendance = (
    student: Student,
    daysInMonth: number,
    currentMonth: number,
    currentYear: number
  ): string => {
    let present = 0;
    let absent = 0;
    let late = 0;
    let total = 0;

    console.log(`[CALCULATE] Processing student: ${student.name}`);

    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const attendanceValue = student.attendance[dateKey];

      if (attendanceValue) {
        // ✅ NEW FORMAT: { sessions: [...], updated_at: "..." }
        if (typeof attendanceValue === 'object' && 'sessions' in attendanceValue && attendanceValue.sessions) {
          attendanceValue.sessions.forEach((session) => {
            if (session.status) {
              total++;
              if (session.status === 'P') present++;
              else if (session.status === 'A') absent++;
              else if (session.status === 'L') late++;
            }
          });
        }
        // OLD FORMAT: { status: 'P', count: 2 }
        else if (typeof attendanceValue === 'object' && 'status' in attendanceValue && attendanceValue.status) {
          const count = attendanceValue.count || 1;
          total += count;
          if (attendanceValue.status === 'P') present += count;
          else if (attendanceValue.status === 'A') absent += count;
          else if (attendanceValue.status === 'L') late += count;
        }
        // VERY OLD FORMAT: 'P' | 'A' | 'L'
        else if (typeof attendanceValue === 'string') {
          total++;
          if (attendanceValue === 'P') present++;
          else if (attendanceValue === 'A') absent++;
          else if (attendanceValue === 'L') late++;
        }
      }
    }

    const percentage = total > 0 ? ((present + late) / total) * 100 : 0;

    console.log(`[CALCULATE] ${student.name}: ${present}P + ${late}L / ${total} = ${percentage.toFixed(3)}%`);

    return percentage.toFixed(3);
  };

  const getRiskLevel = (percentage: string) => {
    const pct = parseFloat(percentage);
    if (pct >= thresholds.excellent) {
      return { label: 'Excellent', color: 'text-emerald-700', dot: 'bg-emerald-500', bg: 'bg-emerald-50' };
    }
    if (pct >= thresholds.good) {
      return { label: 'Good', color: 'text-blue-700', dot: 'bg-blue-500', bg: 'bg-blue-50' };
    }
    if (pct >= thresholds.moderate) {
      return { label: 'Moderate', color: 'text-amber-700', dot: 'bg-amber-500', bg: 'bg-amber-50' };
    }
    return { label: 'At Risk', color: 'text-rose-700', dot: 'bg-rose-500', bg: 'bg-rose-50' };
  };

  const handleClassNameSave = () => {
    if (editedClassName.trim() && editedClassName !== activeClass.name) {
      onUpdateClassName(editedClassName.trim());
    }
    setIsEditingClassName(false);
  };

  const handleClassNameCancel = () => {
    setEditedClassName(activeClass.name);
    setIsEditingClassName(false);
  };

  const prepareExportData = () => {
    // Build headers in the correct order
    const headers: string[] = [];

    // 1. Sr No
    headers.push('Sr No');

    // 2. Student Name
    headers.push('Student Name');

    // 3. Roll No (if any student has it)
    const hasRollNo = activeClass.students.some(s => s.rollNo && s.rollNo.trim() !== '');
    if (hasRollNo) {
      headers.push('Roll No');
    }

    // 4. Custom columns in order
    activeClass.customColumns.forEach(col => {
      headers.push(col.label);
    });

    // 5. Determine which days to include
    const daysToInclude: number[] = [];
    if (exportOnlyClassDays) {
      // Only include days where attendance is marked
      for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const hasAttendance = activeClass.students.some(student => student.attendance[dateKey]);
        if (hasAttendance) {
          daysToInclude.push(day);
        }
      }
    } else {
      // Include all days in the month
      for (let day = 1; day <= daysInMonth; day++) {
        daysToInclude.push(day);
      }
    }

    // Add day headers (just the day number)
    daysToInclude.forEach(day => {
      headers.push(`${day}`);
    });

    // 6. Attendance %, Status, and Totals at the end
    headers.push('Attendance %');
    headers.push('Status');
    headers.push('Total Present');
    headers.push('Total Absent');
    headers.push('Total Late');

    // Build rows
    const rows = activeClass.students.map((student, index) => {
      const row: any = {};

      // Sr No
      row['Sr No'] = index + 1;

      // Student Name
      row['Student Name'] = student.name || '';

      // Roll No (if applicable)
      if (hasRollNo) {
        row['Roll No'] = student.rollNo || '';
      }

      // Custom columns
      activeClass.customColumns.forEach(col => {
        row[col.label] = student[col.id] || '';
      });

      // Initialize totals
      let totalPresent = 0;
      let totalAbsent = 0;
      let totalLate = 0;

      // Day columns - show status with appropriate format
      daysToInclude.forEach(day => {
        const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const headerKey = `${day}`;

        // Get monthly attendance for this student
        const dayAttendance = student.attendance[dateKey];

        if (dayAttendance) {
          let present = 0;
          let absent = 0;
          let late = 0;
          let totalSessions = 0;

          // Parse the attendance data based on format
          if (typeof dayAttendance === 'object' && 'sessions' in dayAttendance) {
            // NEW FORMAT: sessions array { sessions: [...], updated_at: "..." }
            dayAttendance.sessions.forEach((session: any) => {
              totalSessions++;
              if (session.status === 'P') present++;
              else if (session.status === 'A') absent++;
              else if (session.status === 'L') late++;
            });
          } else if (typeof dayAttendance === 'object' && 'status' in dayAttendance) {
            // OLD FORMAT: { status: 'P', count: 2 }
            const status = dayAttendance.status;
            const count = dayAttendance.count || 1;
            totalSessions = count;

            if (status === 'P') present = count;
            else if (status === 'A') absent = count;
            else if (status === 'L') late = count;
          } else if (typeof dayAttendance === 'string') {
            // VERY OLD FORMAT: 'P' | 'A' | 'L'
            totalSessions = 1;
            if (dayAttendance === 'P') present = 1;
            else if (dayAttendance === 'A') absent = 1;
            else if (dayAttendance === 'L') late = 1;
          }

          // Update totals
          totalPresent += present;
          totalAbsent += absent;
          totalLate += late;

          // Determine display format based on session composition
          let dayStatus = '';

          if (totalSessions === 0) {
            dayStatus = '';
          } else if (present === totalSessions) {
            // All present: P or P(3)
            dayStatus = totalSessions > 1 ? `P(${totalSessions})` : 'P';
          } else if (absent === totalSessions) {
            // All absent: A or A(3)
            dayStatus = totalSessions > 1 ? `A(${totalSessions})` : 'A';
          } else if (late === totalSessions) {
            // All late: L or L(3)
            dayStatus = totalSessions > 1 ? `L(${totalSessions})` : 'L';
          } else {
            // MIXED - show breakdown like "2P/1A" or "1P/1L/1A"
            const parts: string[] = [];
            if (present > 0) parts.push(`${present}P`);
            if (late > 0) parts.push(`${late}L`);
            if (absent > 0) parts.push(`${absent}A`);
            dayStatus = parts.join('/');
          }

          row[headerKey] = dayStatus;
        } else {
          row[headerKey] = '';
        }
      });

      // Calculate percentage (Present + Late count as attendance)
      const total = totalPresent + totalAbsent + totalLate;
      const attendancePercent = total > 0 ? ((totalPresent + totalLate) / total * 100).toFixed(3) : '0.000';

      // Add final columns
      row['Attendance %'] = attendancePercent;
      row['Status'] = getRiskLevel(attendancePercent).label;
      row['Total Present'] = totalPresent;
      row['Total Absent'] = totalAbsent;
      row['Total Late'] = totalLate;

      return row;
    });

    return { headers, rows, classDaysCount: daysToInclude.length };
  };

  const exportToCSV = async () => {
    setExporting(true);
    try {
      const { headers, rows } = prepareExportData();

      // Ensure rows maintain the correct column order
      const orderedRows = rows.map(row => {
        const orderedRow: any = {};
        headers.forEach(header => {
          orderedRow[header] = row[header];
        });
        return orderedRow;
      });

      const csv = Papa.unparse(orderedRows, {
        quotes: true,
        header: true,
        columns: headers // Explicitly specify column order
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);

      link.setAttribute('href', url);
      link.setAttribute('download', `${activeClass.name}_${monthName.replace(' ', '_')}_Attendance.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setExportSuccess(true);
      setTimeout(() => {
        setExportSuccess(false);
        setShowExportMenu(false);
        setShowExportOptions(false);
        setPendingExportType(null);
      }, 2000);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export CSV file');
    } finally {
      setExporting(false);
    }
  };

  const exportToExcel = async () => {
    setExporting(true);
    try {
      const { headers, rows } = prepareExportData();

      // Ensure rows maintain the correct column order
      const orderedRows = rows.map(row => {
        const orderedRow: any = {};
        headers.forEach(header => {
          orderedRow[header] = row[header];
        });
        return orderedRow;
      });

      const ws = XLSX.utils.json_to_sheet(orderedRows, { header: headers });
      const wb = XLSX.utils.book_new();

      // Set column widths
      const colWidths: any[] = [];
      headers.forEach(header => {
        if (header === 'Sr No') {
          colWidths.push({ wch: 8 });
        } else if (header === 'Student Name') {
          colWidths.push({ wch: 25 });
        } else if (header === 'Roll No') {
          colWidths.push({ wch: 15 });
        } else if (header === 'Attendance %') {
          colWidths.push({ wch: 13 });
        } else if (header === 'Status') {
          colWidths.push({ wch: 12 });
        } else if (header.startsWith('Total')) {
          colWidths.push({ wch: 12 });
        } else if (!isNaN(Number(header))) {
          // Day columns
          colWidths.push({ wch: 7 });
        } else {
          // Custom columns
          colWidths.push({ wch: 15 });
        }
      });

      ws['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
      XLSX.writeFile(wb, `${activeClass.name}_${monthName.replace(' ', '_')}_Attendance.xlsx`);

      setExportSuccess(true);
      setTimeout(() => {
        setExportSuccess(false);
        setShowExportMenu(false);
        setShowExportOptions(false);
        setPendingExportType(null);
      }, 2000);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export Excel file');
    } finally {
      setExporting(false);
    }
  };

  const exportToPDF = async () => {
    setExporting(true);
    try {
      const { headers, rows } = prepareExportData();

      const pdf = new jsPDF({
        orientation: pdfOrientation,
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = pdf.internal.pageSize.width;
      const pageHeight = pdf.internal.pageSize.height;

      // Title section
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${activeClass.name}`, pageWidth / 2, 8, { align: 'center' });

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Attendance Sheet - ${monthName}`, pageWidth / 2, 13, { align: 'center' });

      pdf.setFontSize(7);
      pdf.text(`Class ID: ${activeClass.id}  |  Students: ${activeClass.students.length}  |  Generated: ${new Date().toLocaleDateString()}`, pageWidth / 2, 17, { align: 'center' });

      const tableData = rows.map(row => headers.map(header => {
        const value = row[header];
        return value !== undefined && value !== null ? String(value) : '';
      }));

      autoTable(pdf, {
        head: [headers],
        body: tableData,
        startY: 20,
        theme: 'grid',
        styles: {
          fontSize: 6,
          cellPadding: 1,
          overflow: 'linebreak',
          valign: 'middle',
          halign: 'center',
          lineColor: [200, 200, 200],
          lineWidth: 0.1,
        },
        headStyles: {
          fillColor: [16, 185, 129],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 6,
          halign: 'center',
          cellPadding: 1.5,
        },
        columnStyles: {
          0: { cellWidth: 8, halign: 'center' },  // Sr No
          1: { halign: 'left', minCellWidth: 20 },  // Student Name
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        margin: { top: 20, right: 5, bottom: 10, left: 5 },
        tableWidth: 'auto',
        horizontalPageBreak: true,
        showHead: 'everyPage',
        didParseCell: function (data: any) {
          if (data.section === 'body') {
            const header = headers[data.column.index];
            const cellValue = data.cell.raw;

            // Color day columns
            const isDayColumn = !isNaN(Number(header));
            if (isDayColumn) {
              const status = cellValue.toString().charAt(0);

              if (status === 'P') {
                data.cell.styles.fillColor = [209, 250, 229];
                data.cell.styles.textColor = [6, 95, 70];
                data.cell.styles.fontStyle = 'bold';
              } else if (status === 'A') {
                data.cell.styles.fillColor = [254, 226, 226];
                data.cell.styles.textColor = [153, 27, 27];
                data.cell.styles.fontStyle = 'bold';
              } else if (status === 'L') {
                data.cell.styles.fillColor = [254, 243, 199];
                data.cell.styles.textColor = [146, 64, 14];
                data.cell.styles.fontStyle = 'bold';
              }
            }
            // Color status column
            else if (header === 'Status') {
              if (cellValue === 'Excellent') {
                data.cell.styles.textColor = [6, 95, 70];
                data.cell.styles.fontStyle = 'bold';
              } else if (cellValue === 'Good') {
                data.cell.styles.textColor = [30, 64, 175];
                data.cell.styles.fontStyle = 'bold';
              } else if (cellValue === 'Moderate') {
                data.cell.styles.textColor = [146, 64, 14];
                data.cell.styles.fontStyle = 'bold';
              } else if (cellValue === 'At Risk') {
                data.cell.styles.textColor = [153, 27, 27];
                data.cell.styles.fontStyle = 'bold';
              }
            }
            // Left-align name column
            else if (header === 'Student Name') {
              data.cell.styles.halign = 'left';
            }
          }
        },
        didDrawPage: function (data: any) {
          // Header on continuation pages
          if (data.pageNumber > 1) {
            pdf.setFontSize(11);
            pdf.setFont('helvetica', 'bold');
            pdf.text(`${activeClass.name} - Continued`, pageWidth / 2, 8, { align: 'center' });
          }

          // Page numbers
          pdf.setFontSize(7);
          pdf.setTextColor(100);
          pdf.text(
            `Page ${data.pageNumber}`,
            pageWidth / 2,
            pageHeight - 5,
            { align: 'center' }
          );
        }
      });

      pdf.save(`${activeClass.name}_${monthName.replace(' ', '_')}_Attendance.pdf`);

      setExportSuccess(true);
      setTimeout(() => {
        setExportSuccess(false);
        setShowExportMenu(false);
        setShowPdfPreview(false);
      }, 2000);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export PDF');
    } finally {
      setExporting(false);
    }
  };

  const handleExportWithOptions = () => {
    if (pendingExportType === 'csv') {
      exportToCSV();
    } else if (pendingExportType === 'excel') {
      exportToExcel();
    }
  };

  const compareRollNo = (a: any, b: any) => {
    const ra = String(a?.rollNo ?? '').trim();
    const rb = String(b?.rollNo ?? '').trim();

    if (!ra && !rb) return String(a?.name ?? '').localeCompare(String(b?.name ?? ''), undefined, { numeric: true, sensitivity: 'base' });
    if (!ra) return 1; // empty last
    if (!rb) return -1;

    const na = /^[0-9]+$/.test(ra) ? parseInt(ra, 10) : NaN;
    const nb = /^[0-9]+$/.test(rb) ? parseInt(rb, 10) : NaN;

    const aIsNum = Number.isFinite(na);
    const bIsNum = Number.isFinite(nb);

    if (aIsNum && bIsNum) return na - nb;
    if (aIsNum) return -1;
    if (bIsNum) return 1;

    return ra.localeCompare(rb, undefined, { numeric: true, sensitivity: 'base' });
  };

  // Filter students based on search query
  const filteredStudents = (searchQuery.trim()
    ? activeClass.students.filter(student =>
      student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      student.rollNo.toLowerCase().includes(searchQuery.toLowerCase())
    )
    : activeClass.students
  ).slice().sort(compareRollNo);


  // Fetch sessions for the current month
  React.useEffect(() => {
    const fetchMonthSessions = async () => {
      const token = localStorage.getItem('access_token');
      if (!token) return;

      const sessionsMap: Record<string, any[]> = {};

      // Fetch sessions for each day of the month
      for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        try {
          const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/sessions/${activeClass.id}?date=${dateKey}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );

          if (response.ok) {
            const data = await response.json();
            if (data.sessions && data.sessions.length > 0) {
              sessionsMap[dateKey] = data.sessions;
            }
          }
        } catch (err) {
          console.error(`Failed to fetch sessions for ${dateKey}:`, err);
        }
      }

      setSessionData(sessionsMap);
    };

    fetchMonthSessions();

    // Auto-refresh every 5 seconds
    const interval = setInterval(fetchMonthSessions, 5000);
    return () => clearInterval(interval);
  }, [activeClass.id, currentMonth, currentYear, daysInMonth]);


  return (
    <>
      {/* Header Section */}
      <div className="mb-4 sm:mb-6">
        <div className="bg-white rounded-xl sm:rounded-2xl shadow-md border border-emerald-200 p-3 sm:p-4 lg:p-6">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 sm:gap-4">
            {/* Left: Class name and info */}
            <div className="flex-1 min-w-0 w-full lg:w-auto">
              {isEditingClassName ? (
                <div className="w-full">
                  <input
                    type="text"
                    value={editedClassName}
                    onChange={(e) => setEditedClassName(e.target.value)}
                    className="w-full text-xl sm:text-2xl font-bold text-emerald-900 bg-white border-2 border-emerald-500 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 mb-2"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleClassNameSave();
                      if (e.key === 'Escape') handleClassNameCancel();
                    }}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleClassNameSave}
                      className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
                    >
                      Save
                    </button>
                    <button
                      onClick={handleClassNameCancel}
                      className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-medium rounded-lg transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-emerald-900 break-words">{activeClass.name}</h2>
                    <button
                      onClick={() => setIsEditingClassName(true)}
                      className="p-1.5 sm:p-2 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer group flex-shrink-0"
                      title="Edit class name"
                    >
                      <Edit2 className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400 group-hover:text-emerald-600" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Students pill */}
                    <div className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 bg-gradient-to-r from-emerald-50 to-emerald-100 border border-emerald-200 rounded-full shadow-sm">
                      <Users className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-600" />
                      <span className="text-xs font-semibold text-emerald-900">{activeClass.students.length}</span>
                    </div>

                    {/* Class ID pill - Click to Copy */}
                    {activeClass.enrollment_mode === 'enrollment_via_id' && (
                      <button
                        onClick={handleCopyClassId}
                        className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200 rounded-full shadow-sm hover:bg-slate-100 hover:border-slate-300 active:scale-95 transition-all cursor-pointer group"
                        title="Click to copy ID"
                      >
                        <span className="text-xs font-mono font-semibold text-slate-700">ID: {activeClass.id}</span>
                        {copiedClassId ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <svg className="w-3 h-3 text-slate-400 group-hover:text-slate-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        )}
                      </button>
                    )}

                    {/* Month pill - hidden on mobile, shown on desktop */}
                    <div className="hidden sm:inline-flex items-center px-3 py-1.5 bg-gradient-to-r from-teal-50 to-cyan-50 border border-teal-200 rounded-full shadow-sm">
                      <span className="text-xs font-semibold text-teal-700">{monthName}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Action buttons */}
            <div className="flex flex-wrap items-center justify-start lg:justify-end gap-2 w-full lg:w-auto">
              {activeClass.enrollment_mode === 'enrollment_via_id' && (
                <button
                  onClick={onOpenQRAttendance}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-medium rounded-lg hover:shadow-lg transition-all cursor-pointer whitespace-nowrap"
                >
                  <QrCode className="w-4 h-4" />
                  <span className="hidden sm:inline">QR Attendance</span>
                  <span className="sm:hidden">QR</span>
                </button>
              )}
              <div className="relative">
                <button
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  disabled={activeClass.students.length === 0}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm bg-gradient-to-r from-teal-600 to-cyan-600 text-white font-medium rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline">Export Data</span>
                  <span className="sm:hidden">Export</span>
                </button>

                {/* Export Format Selection Modal */}
                {showExportMenu && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden">
                      {/* Header */}
                      <div className="bg-gradient-to-r from-teal-600 to-cyan-600 px-6 py-5 flex items-center justify-between">
                        <div>
                          <h3 className="text-xl font-bold text-white">Export Attendance</h3>
                          <p className="text-white/90 text-sm mt-1">Choose your format</p>
                        </div>
                        <button
                          onClick={() => setShowExportMenu(false)}
                          className="p-2 hover:bg-teal-700 rounded-lg transition-colors cursor-pointer"
                        >
                          <X className="w-5 h-5 text-white" />
                        </button>
                      </div>

                      {/* Content */}
                      <div className="p-6">
                        <div className="space-y-3">
                          {/* CSV Option */}
                          <button
                            onClick={() => {
                              setPendingExportType('csv');
                              setShowExportMenu(false);
                              setShowExportOptions(true);
                            }}
                            className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-slate-200 hover:border-teal-500 hover:bg-teal-50 transition-all cursor-pointer group"
                          >
                            <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-200 transition-colors">
                              <FileText className="w-6 h-6 text-emerald-700" />
                            </div>
                            <div className="text-left flex-1">
                              <p className="font-semibold text-slate-900 text-base">CSV Format</p>
                              <p className="text-xs text-slate-600 mt-0.5">Compatible with Excel, Google Sheets</p>
                            </div>
                          </button>

                          {/* Excel Option */}
                          <button
                            onClick={() => {
                              setPendingExportType('excel');
                              setShowExportMenu(false);
                              setShowExportOptions(true);
                            }}
                            className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-slate-200 hover:border-green-500 hover:bg-green-50 transition-all cursor-pointer group"
                          >
                            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-green-200 transition-colors">
                              <FileSpreadsheet className="w-6 h-6 text-green-700" />
                            </div>
                            <div className="text-left flex-1">
                              <p className="font-semibold text-slate-900 text-base">Excel Format</p>
                              <p className="text-xs text-slate-600 mt-0.5">Native .xlsx file with formatting</p>
                            </div>
                          </button>

                          {/* PDF Option */}
                          <button
                            onClick={() => {
                              setShowExportMenu(false);
                              setShowPdfPreview(true);
                            }}
                            className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-slate-200 hover:border-red-500 hover:bg-red-50 transition-all cursor-pointer group"
                          >
                            <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-red-200 transition-colors">
                              <FileText className="w-6 h-6 text-red-700" />
                            </div>
                            <div className="text-left flex-1">
                              <p className="font-semibold text-slate-900 text-base">PDF Format</p>
                              <p className="text-xs text-slate-600 mt-0.5">Configure & preview layout</p>
                            </div>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={onOpenSettings}
                className="flex items-center gap-1.5 px-3 py-2 text-sm bg-white border-2 border-emerald-300 text-emerald-700 font-medium rounded-lg hover:bg-emerald-50 transition-all cursor-pointer whitespace-nowrap"
              >
                <Settings className="w-4 h-4" />
                <span className="hidden sm:inline">Sheet Settings</span>
                <span className="sm:hidden">Settings</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      {activeClass.students.length > 0 && (
        <div className="mb-4">
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-md border border-emerald-200 p-3 sm:p-4">
            <div className="relative max-w-2xl mx-auto">
              <div className="relative group ">
                <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-slate-400 group-focus-within:text-emerald-500 transition-colors duration-200 pointer-events-none z-10" />

                <input
                  type="text"
                  placeholder="Search students by name or roll number..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 sm:pl-12 pr-10 sm:pr-12 py-2.5 sm:py-3 border-2 border-slate-200 rounded-xl sm:rounded-2xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all duration-300 hover:border-slate-300 hover:shadow-sm bg-white text-sm sm:text-base placeholder-slate-500 font-medium text-slate-900 focus:outline-none"
                />

                {searchQuery && (
                  <>
                    {/* Results count badge */}
                    <div className="absolute right-12 sm:right-14 top-1/2 -translate-y-1/2 bg-emerald-100 text-emerald-700 text-xs font-semibold px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full shadow-sm border border-emerald-200">
                      {filteredStudents.length}
                    </div>

                    {/* Clear button */}
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="group/clear absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-emerald-100 hover:border-emerald-300 transition-all duration-200 rounded-lg sm:rounded-xl shadow-sm border border-slate-200 hover:shadow-md active:scale-95 z-20"
                      aria-label="Clear search"
                    >
                      <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500 group-hover/clear:text-emerald-600 transition-colors"
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
                <div className="absolute -bottom-1 left-3 sm:left-4 right-3 sm:right-4 h-1 bg-gradient-to-r from-emerald-400/0 via-emerald-500/50 to-emerald-400/0 rounded-full scale-x-0 group-focus-within:scale-x-100 transition-transform duration-500 origin-center opacity-0 group-focus-within:opacity-100" />
              </div>
            </div>

            {/* Search info */}
            {searchQuery && (
              <div className="mt-3 flex items-center justify-between text-xs sm:text-sm text-slate-600">
                <span>
                  {filteredStudents.length === 0
                    ? 'No students found'
                    : `Showing ${filteredStudents.length} of ${activeClass.students.length} students`
                  }
                </span>
                {filteredStudents.length > 0 && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="text-emerald-600 hover:text-emerald-700 font-medium"
                  >
                    Clear search
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Attendance Table */}
      <div className="bg-white rounded-2xl shadow-md border border-emerald-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-200">
                <th className="px-2 py-2 sm:px-4 sm:py-3 lg:px-6 lg:py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider" style={{ minWidth: '80px' }}>Sr No.</th>
                <th className="px-2 py-2 sm:px-4 sm:py-3 lg:px-6 lg:py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider" style={{ minWidth: '250px' }}>Student Name</th>
                <th className="px-2 py-2 sm:px-4 sm:py-3 lg:px-6 lg:py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider" style={{ minWidth: '120px' }}>Roll No</th>

                {activeClass.customColumns.map((column) => (
                  <th
                    key={column.id}
                    className="px-2 py-2 sm:px-4 sm:py-3 lg:px-6 lg:py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider group relative" style={{ minWidth: '150px' }}>
                    <div className="flex items-center justify-between">
                      <span>{column.label}</span>
                      <button
                        onClick={() => onDeleteColumn(column.id)}
                        className="opacity-0 group-hover:opacity-100 ml-2 p-1 hover:bg-rose-100 rounded transition-all cursor-pointer"
                      >
                        <X className="w-3 h-3 text-rose-500" />
                      </button>
                    </div>
                  </th>
                ))}

                <th className="px-2 py-2 sm:px-3 sm:py-3 lg:px-4 lg:py-4 text-center">
                  <button
                    onClick={onAddColumn}
                    className="p-1.5 hover:bg-emerald-100 rounded-lg transition-colors group cursor-pointer"
                    title="Add custom column"
                  >
                    <Plus className="w-4 h-4 text-slate-400 group-hover:text-emerald-600" />
                  </button>
                </th>

                {Array.from({ length: daysInMonth }, (_, idx) => (
                  <th key={idx} className="px-3 py-4 text-center text-xs font-medium text-slate-600 w-12">
                    {idx + 1}
                  </th>
                ))}

                <th className="px-6 py-4 text-center text-xs font-semibold text-slate-700 uppercase tracking-wider w-24">Status</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-slate-700 uppercase tracking-wider w-28">Performance</th>
                <th className="px-2 py-2 sm:px-3 sm:py-3 lg:px-4 lg:py-4 w-12 sm:w-14 lg:w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-100">
              {filteredStudents.map((student, index) => {
                const attendance = calculateAttendance(student, daysInMonth, currentMonth, currentYear);
                const risk = getRiskLevel(attendance);

                return (
                  <tr key={student.id} className="hover:bg-emerald-50/50 transition-colors group">
                    <td className="px-2 py-2 sm:px-4 sm:py-3 lg:px-6 lg:py-4" style={{ minWidth: '60px' }}>

                      <span className="text-sm font-medium text-slate-600">{index + 1}</span>
                    </td>
                    <td className="px-2 py-2 sm:px-4 sm:py-3 lg:px-6 lg:py-4" style={{ minWidth: '180px' }}>
                      <input
                        type="text"
                        value={student.name}
                        onChange={(e) => onUpdateStudent(student.id, 'name', e.target.value)}
                        className="w-full text-xs sm:text-sm font-medium text-black bg-transparent focus:bg-white focus:ring-2 focus:ring-emerald-500 rounded-lg px-2 py-1 border border-transparent focus:border-emerald-500 transition-all cursor-text"
                        placeholder="Student Name"
                      />
                    </td>
                    <td className="px-2 py-2 sm:px-4 sm:py-3 lg:px-6 lg:py-4" style={{ minWidth: '100px' }}>
                      <input
                        type="text"
                        value={student.rollNo}
                        onChange={(e) => onUpdateStudent(student.id, 'rollNo', e.target.value)}
                        className="w-full text-xs sm:text-sm font-medium text-black bg-transparent focus:bg-white focus:ring-2 focus:ring-emerald-500 rounded-lg px-2 py-1 border border-transparent focus:border-emerald-500 transition-all cursor-text"
                        placeholder="Optional"
                      />
                    </td>

                    {activeClass.customColumns.map((column) => (
                      <td key={column.id} className="px-2 py-2 sm:px-4 sm:py-3 lg:px-6 lg:py-4" style={{ minWidth: '120px' }}>
                        {column.type === 'select' ? (
                          <select
                            value={student[column.id] || ''}
                            onChange={(e) => onUpdateStudent(student.id, column.id, e.target.value)}
                            className="w-full text-xs sm:text-sm text-black bg-transparent focus:bg-white focus:ring-2 focus:ring-emerald-500 rounded-lg px-2 py-1 border border-transparent focus:border-emerald-500 transition-all"
                          >
                            <option value="">Select...</option>
                            {column.options?.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={column.type}
                            value={student[column.id] || ''}
                            onChange={(e) => onUpdateStudent(student.id, column.id, e.target.value)}
                            className="w-full text-xs sm:text-sm text-black bg-transparent focus:bg-white focus:ring-2 focus:ring-emerald-500 rounded-lg px-2 py-1 border border-transparent focus:border-emerald-500 transition-all cursor-text"
                            placeholder={`Enter ${column.label.toLowerCase()}`}
                          />
                        )}
                      </td>
                    ))}

                    <td className="px-4 py-4"></td>

                    {Array.from({ length: daysInMonth }, (_, dayIdx) => {
                      const day = dayIdx + 1;
                      const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                      const attendance = student.attendance[dateKey];

                      // Parse attendance data (WORKS FOR ALL MODES NOW)
                      let displayStatus: 'P' | 'A' | 'L' | undefined;
                      let count = 0;
                      let hasMultipleSessions = false;
                      let hasMixedStatuses = false;

                      if (attendance) {
                        if (typeof attendance === 'object' && 'sessions' in attendance) {
                          // NEW FORMAT: sessions array
                          const sessions = attendance.sessions;
                          const markedSessions = sessions.filter((s: any) => s.status !== null);
                          count = markedSessions.length;
                          hasMultipleSessions = count > 1;

                          // Check for mixed statuses (different P/A/L in sessions)
                          if (hasMultipleSessions) {
                            const statuses = new Set(markedSessions.map((s: any) => s.status));
                            hasMixedStatuses = statuses.size > 1;
                          }

                          // Determine display status (prioritize P > L > A)
                          const hasPresent = sessions.some((s: any) => s.status === 'P');
                          const hasLate = sessions.some((s: any) => s.status === 'L');

                          if (hasPresent) displayStatus = 'P';
                          else if (hasLate) displayStatus = 'L';
                          else displayStatus = 'A';
                        } else if (typeof attendance === 'object' && 'status' in attendance) {
                          // OLD FORMAT (shouldn't appear with new code, but handle it)
                          displayStatus = attendance.status;
                          count = attendance.count || 1;
                          hasMultipleSessions = count > 1;
                        } else {
                          // SIMPLE STRING FORMAT: 'P', 'A', or 'L'
                          displayStatus = attendance as 'P' | 'A' | 'L';
                          count = 1;
                        }
                      }

                      return (
                        <td key={dayIdx} className="px-2 py-1.5 sm:px-2 sm:py-2 lg:px-3 lg:py-2 text-center">
                          <button
                            onClick={() => onToggleAttendance(student.id, day)}
                            onContextMenu={(e) => handleRightClick(e, student.id, day)}
                            className={`relative w-9 h-9 sm:w-8 sm:h-8 lg:w-9 lg:h-9 text-xs font-bold rounded-lg transition-all cursor-pointer shadow-sm ${displayStatus === 'P' ? 'bg-emerald-500 text-white hover:bg-emerald-600' :
                              displayStatus === 'A' ? 'bg-rose-500 text-white hover:bg-rose-600' :
                                displayStatus === 'L' ? 'bg-amber-500 text-white hover:bg-amber-600' :
                                  'bg-slate-100 text-slate-400 hover:bg-slate-200'
                              }`}
                          >
                            <span className="relative z-10">{displayStatus || '·'}</span>

                            {/* Count badge - shows total number of sessions */}
                            {count > 1 && (
                              <span
                                className="absolute -top-1 -right-1 w-4 h-4 bg-white text-slate-700 text-[9px] font-bold rounded-full flex items-center justify-center shadow-md border border-slate-200 z-20"
                                title={`${count} sessions`}
                              >
                                {count}
                              </span>
                            )}

                            {/* Multi-session indicator - RED STAR for mixed attendance */}
                            {hasMixedStatuses && (
                              <span
                                className="absolute -bottom-0.5 -left-0.5 text-red-600 text-xs z-20 drop-shadow-[0_0_2px_rgba(255,255,255,1)]"
                                title="Multiple sessions with different attendance"
                              >
                                ★
                              </span>
                            )}
                          </button>
                        </td>
                      );
                    })}

                    <td className="px-2 py-2 sm:px-4 sm:py-3 lg:px-6 lg:py-4 text-center">
                      <span className={`inline-block px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg text-xs sm:text-sm font-boldd ${risk.color} ${risk.bg}`}>
                        {attendance}%
                      </span>
                    </td>
                    <td className="px-2 py-2 sm:px-4 sm:py-3 lg:px-6 lg:py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${risk.dot} shadow-sm`}></div>
                        <span className={`text-xs font-medium ${risk.color}`}>{risk.label}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2 sm:px-3 sm:py-3 lg:px-4 lg:py-4 text-center">
                      <button
                        onClick={() => onDeleteStudent(student.id)}
                        className="opacity-0 group-hover:opacity-100 p-2 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4 text-rose-500" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 px-6 py-4 border-t border-emerald-200 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-600">
              Total: <span className="font-semibold text-slate-900">{activeClass.students.length}</span> students
            </span>
          </div>
          {activeClass.enrollment_mode !== 'enrollment_via_id' && (
            <button
              onClick={onAddStudent}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors font-medium cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              Add Student
            </button>
          )}
        </div>
      </div>

      {/* CSV/Excel Export Options Modal */}
      {showExportOptions && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className={`px-4 sm:px-6 py-3 sm:py-5 flex items-center justify-between ${pendingExportType === 'csv'
              ? 'bg-gradient-to-r from-emerald-600 to-teal-600'
              : 'bg-gradient-to-r from-green-600 to-emerald-600'
              }`}>
              <div className="flex-1 min-w-0">
                <h3 className="text-base sm:text-xl font-bold text-white truncate">
                  {pendingExportType === 'csv' ? 'CSV' : 'Excel'} Export Options
                </h3>
                <p className={`text-xs sm:text-sm mt-0.5 sm:mt-1 ${pendingExportType === 'csv' ? 'text-white/90' : 'text-white/90'
                  }`}>
                  Configure your export settings
                </p>
              </div>
              <button
                onClick={() => {
                  setShowExportOptions(false);
                  setPendingExportType(null);
                  setExportOnlyClassDays(true);
                }}
                className={`p-1.5 sm:p-2 rounded-lg transition-colors cursor-pointer flex-shrink-0 ml-2 ${pendingExportType === 'csv' ? 'hover:bg-emerald-700' : 'hover:bg-green-700'
                  }`}>
                <X className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </button>
            </div>

            {/* Content - Scrollable */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {/* Days to Export */}
              <div className="mb-4 sm:mb-6">
                <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-2 sm:mb-3">Days to Export</label>
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                  <button
                    onClick={() => setExportOnlyClassDays(true)}
                    className={`flex-1 p-3 sm:p-4 rounded-xl border-2 transition-all cursor-pointer ${exportOnlyClassDays
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-slate-200 hover:border-emerald-300'
                      }`}>
                    <div className="flex items-center gap-3">
                      <div className="text-left flex-1">
                        <p className="font-semibold text-slate-900 text-sm sm:text-base">Only Class Days</p>
                        <p className="text-xs text-slate-600 mt-0.5">Export only days with attendance marked</p>
                      </div>
                      {exportOnlyClassDays && <Check className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600 flex-shrink-0" />}
                    </div>
                  </button>

                  <button
                    onClick={() => setExportOnlyClassDays(false)}
                    className={`flex-1 p-3 sm:p-4 rounded-xl border-2 transition-all cursor-pointer ${!exportOnlyClassDays
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-slate-200 hover:border-emerald-300'
                      }`}>
                    <div className="flex items-center gap-3">
                      <div className="text-left flex-1">
                        <p className="font-semibold text-slate-900 text-sm sm:text-base">All Days</p>
                        <p className="text-xs text-slate-600 mt-0.5">Export all {daysInMonth} days of the month</p>
                      </div>
                      {!exportOnlyClassDays && <Check className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600 flex-shrink-0" />}
                    </div>
                  </button>
                </div>
              </div>

              {/* Export Information */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 sm:p-4 mb-4 sm:mb-6">
                <h4 className="font-semibold text-blue-900 text-sm mb-2">Export Information</h4>
                <div className="text-xs text-blue-800 space-y-1">
                  <p><strong>Format:</strong> {pendingExportType === 'csv' ? '.csv (Comma Separated Values)' : '.xlsx (Microsoft Excel)'}</p>
                  <p><strong>Days:</strong> {exportOnlyClassDays ? 'Only days with attendance marked' : `All ${daysInMonth} days`}</p>
                  <p><strong>Column Order:</strong> Sr No → Name → Roll No → Custom Columns → Days → Attendance % → Status → Totals</p>
                  <p><strong>Includes:</strong> Present, Absent, Late counts and attendance percentage</p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-slate-50 px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-200 flex flex-col-reverse sm:flex-row items-center justify-between gap-2 sm:gap-0">
              <button
                onClick={() => {
                  setShowExportOptions(false);
                  setPendingExportType(null);
                  setExportOnlyClassDays(true);
                }}
                className="w-full sm:w-auto px-4 sm:px-5 py-2 sm:py-2.5 bg-white border-2 border-slate-300 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-all cursor-pointer text-sm sm:text-base">
                Cancel
              </button>
              <button
                onClick={handleExportWithOptions}
                disabled={exporting}
                className={`w-full sm:w-auto px-5 sm:px-6 py-2 sm:py-2.5 text-white font-medium rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2 text-sm sm:text-base ${pendingExportType === 'csv'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600'
                  : 'bg-gradient-to-r from-green-600 to-emerald-600'
                  }`}>
                {exporting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Export {pendingExportType === 'csv' ? 'CSV' : 'Excel'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Preview Modal */}
      {showPdfPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-[95vw] sm:max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="bg-gradient-to-r from-red-600 to-rose-600 px-4 sm:px-6 py-3 sm:py-5 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <h3 className="text-base sm:text-xl font-bold text-white truncate">PDF Export Preview</h3>
                <p className="text-red-50 text-xs sm:text-sm mt-0.5 sm:mt-1">Configure orientation and preview layout</p>
              </div>
              <button
                onClick={() => {
                  setShowPdfPreview(false);
                  setPdfOrientation('landscape');
                  setExportOnlyClassDays(true);
                }}
                className="p-1.5 sm:p-2 hover:bg-red-700 rounded-lg transition-colors cursor-pointer flex-shrink-0 ml-2">
                <X className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </button>
            </div>

            {/* Content - Scrollable */}
            <div className="flex-1 overflow-auto p-4 sm:p-6">
              {/* Page Orientation */}
              <div className="mb-4 sm:mb-6">
                <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-2 sm:mb-3">Page Orientation</label>
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                  <button
                    onClick={() => setPdfOrientation('landscape')}
                    className={`flex-1 p-3 sm:p-4 rounded-xl border-2 transition-all cursor-pointer ${pdfOrientation === 'landscape'
                      ? 'border-red-500 bg-red-50'
                      : 'border-slate-200 hover:border-red-300'
                      }`}>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-9 sm:w-16 sm:h-12 rounded border-2 flex-shrink-0 ${
                    pdfOrientation === 'landscape' ? 'border-red-500 bg-red-100' : 'border-slate-300'
                  }"></div>
                      <div className="text-left flex-1">
                        <p className="font-semibold text-slate-900 text-sm sm:text-base">Landscape</p>
                        <p className="text-xs text-slate-600 mt-0.5">Best for many columns (297mm × 210mm)</p>
                      </div>
                      {pdfOrientation === 'landscape' && <Check className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 flex-shrink-0" />}
                    </div>
                  </button>

                  <button
                    onClick={() => setPdfOrientation('portrait')}
                    className={`flex-1 p-3 sm:p-4 rounded-xl border-2 transition-all cursor-pointer ${pdfOrientation === 'portrait'
                      ? 'border-red-500 bg-red-50'
                      : 'border-slate-200 hover:border-red-300'
                      }`}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-12 sm:w-12 sm:h-16 rounded border-2 flex-shrink-0 ${
                    pdfOrientation === 'portrait' ? 'border-red-500 bg-red-100' : 'border-slate-300'
                  }"></div>
                      <div className="text-left flex-1">
                        <p className="font-semibold text-slate-900 text-sm sm:text-base">Portrait</p>
                        <p className="text-xs text-slate-600 mt-0.5">Best for fewer columns (210mm × 297mm)</p>
                      </div>
                      {pdfOrientation === 'portrait' && <Check className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 flex-shrink-0" />}
                    </div>
                  </button>
                </div>
              </div>

              {/* Days to Export */}
              <div className="mb-4 sm:mb-6">
                <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-2 sm:mb-3">Days to Export</label>
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                  <button
                    onClick={() => setExportOnlyClassDays(true)}
                    className={`flex-1 p-3 sm:p-4 rounded-xl border-2 transition-all cursor-pointer ${exportOnlyClassDays
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-slate-200 hover:border-emerald-300'
                      }`}>
                    <div className="flex items-center gap-3">
                      <div className="text-left flex-1">
                        <p className="font-semibold text-slate-900 text-sm sm:text-base">Only Class Days</p>
                        <p className="text-xs text-slate-600 mt-0.5">Export only days with attendance marked</p>
                      </div>
                      {exportOnlyClassDays && <Check className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600 flex-shrink-0" />}
                    </div>
                  </button>

                  <button
                    onClick={() => setExportOnlyClassDays(false)}
                    className={`flex-1 p-3 sm:p-4 rounded-xl border-2 transition-all cursor-pointer ${!exportOnlyClassDays
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-slate-200 hover:border-emerald-300'
                      }`}>
                    <div className="flex items-center gap-3">
                      <div className="text-left flex-1">
                        <p className="font-semibold text-slate-900 text-sm sm:text-base">All Days</p>
                        <p className="text-xs text-slate-600 mt-0.5">Export all {daysInMonth} days of the month</p>
                      </div>
                      {!exportOnlyClassDays && <Check className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600 flex-shrink-0" />}
                    </div>
                  </button>
                </div>
              </div>

              {/* Layout Preview - Hidden on mobile, shown on tablet+ */}
              <div className="hidden md:block mb-4 sm:mb-6">
                <label className="block text-sm font-semibold text-slate-700 mb-3">Layout Preview</label>
                <div className="bg-slate-100 rounded-xl p-8 flex items-center justify-center">
                  <div
                    className={`bg-white shadow-2xl rounded-lg overflow-hidden border border-slate-300 ${pdfOrientation === 'landscape' ? 'w-full max-w-4xl' : 'w-full max-w-xl'
                      }`}
                    style={{
                      aspectRatio: pdfOrientation === 'landscape' ? '1.414' : '0.707'
                    }}
                  >
                    <div className="p-4 h-full flex flex-col text-xs">
                      <div className="text-center mb-3 pb-3 border-b border-slate-200">
                        <h4 className="font-bold text-slate-900 text-sm">{activeClass.name}</h4>
                        <p className="text-xs text-slate-600">Attendance Sheet - {monthName}</p>
                        <div className="flex justify-between text-xs text-slate-500 mt-2">
                          <span>Class ID: {activeClass.id}</span>
                          <span>Students: {activeClass.students.length}</span>
                        </div>
                      </div>

                      <div className="flex-1 overflow-hidden">
                        <div className="text-xs border border-slate-300 rounded overflow-hidden">
                          <div className={`bg-emerald-600 text-white font-semibold grid gap-px ${pdfOrientation === 'landscape' ? 'grid-cols-12' : 'grid-cols-8'
                            }`}>
                            <div className="px-1 py-1 text-center">No</div>
                            <div className="px-1 py-1 col-span-2">Name</div>
                            <div className="px-1 py-1 text-center">Roll</div>
                            {activeClass.customColumns.slice(0, 1).map((col) => (
                              <div key={col.id} className="px-1 py-1 truncate">{col.label.slice(0, 8)}</div>
                            ))}
                            {pdfOrientation === 'landscape' ? (
                              <>
                                <div className="px-1 py-1 text-center">1</div>
                                <div className="px-1 py-1 text-center">2</div>
                                <div className="px-1 py-1 text-center">3</div>
                                <div className="px-1 py-1 text-center">...</div>
                                <div className="px-1 py-1 text-center">{daysInMonth}</div>
                              </>
                            ) : (
                              <>
                                <div className="px-1 py-1 text-center">1</div>
                                <div className="px-1 py-1 text-center">...</div>
                              </>
                            )}
                            <div className="px-1 py-1 text-center">%</div>
                            <div className="px-1 py-1 text-center">Status</div>
                          </div>

                          {[1, 2, 3].map((i) => (
                            <div key={i} className={`bg-white grid gap-px border-t border-slate-200 ${pdfOrientation === 'landscape' ? 'grid-cols-12' : 'grid-cols-8'
                              }`}>
                              <div className="px-1 py-1 text-center text-slate-600">{i}</div>
                              <div className="px-1 py-1 col-span-2 text-slate-800 truncate">Student {i}</div>
                              <div className="px-1 py-1 text-center text-slate-600">{i}01</div>
                              {activeClass.customColumns.slice(0, 1).map((col) => (
                                <div key={col.id} className="px-1 py-1 text-slate-600 text-center">-</div>
                              ))}
                              {pdfOrientation === 'landscape' ? (
                                <>
                                  <div className="px-1 py-1 text-center bg-emerald-100 text-emerald-700 font-bold">P</div>
                                  <div className="px-1 py-1 text-center bg-rose-100 text-rose-700 font-bold">A</div>
                                  <div className="px-1 py-1 text-center bg-amber-100 text-amber-700 font-bold">L</div>
                                  <div className="px-1 py-1 text-center text-slate-400">...</div>
                                  <div className="px-1 py-1 text-center bg-emerald-100 text-emerald-700 font-bold">P</div>
                                </>
                              ) : (
                                <>
                                  <div className="px-1 py-1 text-center bg-emerald-100 text-emerald-700 font-bold">P</div>
                                  <div className="px-1 py-1 text-center text-slate-400">...</div>
                                </>
                              )}
                              <div className="px-1 py-1 text-center text-emerald-700 font-semibold">
                                {i === 1 ? '95' : i === 2 ? '78' : '88'}
                              </div>
                              <div className="px-1 py-1 text-center text-xs">
                                {i === 1 ? 'Exc' : i === 2 ? 'Mod' : 'Good'}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="text-center text-xs text-slate-400 mt-2">
                          Preview shows sample data - actual PDF will contain all {activeClass.students.length} students
                        </div>
                      </div>

                      <div className="text-center text-xs text-slate-400 mt-3 pt-2 border-t border-slate-200">
                        Page 1 of 1
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Export Information */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 sm:p-4">
                <h4 className="font-semibold text-blue-900 text-sm mb-2">Export Information</h4>
                <div className="text-xs text-blue-800 space-y-1">
                  <p><strong>Orientation:</strong> {pdfOrientation === 'landscape' ? 'Landscape (297×210mm, 7pt font)' : 'Portrait (210×297mm, 6pt font)'}</p>
                  <p><strong>Days:</strong> {exportOnlyClassDays ? 'Only days with attendance marked' : `All ${daysInMonth} days`}</p>
                  <p><strong>Features:</strong> Grid lines, centered layout, optimized spacing</p>
                  <p><strong>Included:</strong> Sr No, Name, Roll, {activeClass.customColumns.length} Custom Columns, Days, Attendance %, Status, Totals</p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-slate-50 px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-200 flex flex-col-reverse sm:flex-row items-center justify-between gap-2 sm:gap-0">
              <button
                onClick={() => {
                  setShowPdfPreview(false);
                  setPdfOrientation('landscape');
                  setExportOnlyClassDays(true);
                }}
                className="w-full sm:w-auto px-4 sm:px-5 py-2 sm:py-2.5 bg-white border-2 border-slate-300 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-all cursor-pointer text-sm sm:text-base">
                Cancel
              </button>
              <button
                onClick={exportToPDF}
                disabled={exporting}
                className="w-full sm:w-auto px-5 sm:px-6 py-2 sm:py-2.5 bg-gradient-to-r from-red-600 to-rose-600 text-white font-medium rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2 text-sm sm:text-base">
                {exporting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Generating PDF...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Export PDF ({pdfOrientation === 'landscape' ? 'Landscape' : 'Portrait'})
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Multi-Session Modal */}
      {showMultiSessionModal && (
        <MultiSessionModal
          isOpen={showMultiSessionModal}
          onClose={handleCloseMultiSession}
          studentName={multiSessionStudentName}
          date={multiSessionDate}
          currentSessions={multiSessionCurrentData}
          onSave={handleSaveMultiSession}
        />
      )}
    </>
  );
};
