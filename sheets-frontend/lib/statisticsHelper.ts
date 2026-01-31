
interface AttendanceValue {
    sessions?: Array<{ id: string; name: string; status: 'P' | 'A' | 'L' }>;
    status?: 'P' | 'A' | 'L';
    count?: number;
}

export function calculateStudentAttendance(
    attendance: Record<string, AttendanceValue | 'P' | 'A' | 'L' | undefined>,
    daysInMonth: number,
    currentMonth: number,
    currentYear: number
): { present: number; absent: number; late: number; total: number; percentage: number } {
    let present = 0;
    let absent = 0;
    let late = 0;
    let total = 0;

    for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const attendanceValue = attendance[dateKey];

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

    return { present, absent, late, total, percentage };
}

export function getStatusFromPercentage(
    percentage: number,
    thresholds: {
        excellent: number;
        good: number;
        moderate: number;
        atRisk: number;
    }
): 'excellent' | 'good' | 'moderate' | 'risk' {
    if (percentage >= thresholds.excellent) return 'excellent';
    if (percentage >= thresholds.good) return 'good';
    if (percentage >= thresholds.moderate) return 'moderate';
    return 'risk';
}