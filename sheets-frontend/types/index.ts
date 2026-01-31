export interface AttendanceCounts {
  P: number;
  A: number;
  L: number;
}

export interface CustomColumn {
  id: string;
  label: string;
  type: 'text' | 'number' | 'select';
  options?: string[];
}

export interface Student {
  id: number;
  rollNo: string;
  name: string;
  attendance: Record<string,
    | { sessions: Array<{ id: string; name: string; status: 'P' | 'A' | 'L' }>; updated_at: string }
    | { status: 'P' | 'A' | 'L'; count: number }
    | 'P' | 'A' | 'L'
    | undefined
  >;
  [key: string]: any;
}

export interface AttendanceThresholds {
  excellent: number;
  good: number;
  moderate: number;
  atRisk: number;
}

export interface ClassStatistics {
  totalStudents: number;
  avgAttendance: number;
  atRiskCount: number;
  excellentCount: number;
}

export interface Class {
  id: number;
  name: string;
  students: Student[];
  customColumns: CustomColumn[];
  thresholds?: AttendanceThresholds;
  enrollment_mode?: 'enrollment_via_id' | 'manual_entry' | 'import_data';
  statistics?: ClassStatistics;
}

export interface ClassInfo {
  classid?: string;
  classname?: string;
  teachername?: string;
  class_id?: string;
  class_name?: string;
  teacher_name?: string;
}
