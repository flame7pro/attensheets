import json
import os
from typing import Optional, Dict, Any, List
from datetime import datetime
import shutil

class DatabaseManager:
    """Manages file-based database operations with student support"""
    
    def __init__(self, base_dir: str = "data"):
        self.base_dir = base_dir
        self.users_dir = os.path.join(base_dir, "users")
        self.students_dir = os.path.join(base_dir, "students")
        self.contact_dir = os.path.join(base_dir, "contact")
        self.enrollments_dir = os.path.join(base_dir, "enrollments")
        self._ensure_directories()
    
    def _ensure_directories(self):
        """Ensure all base directories exist"""
        os.makedirs(self.users_dir, exist_ok=True)
        os.makedirs(self.students_dir, exist_ok=True)
        os.makedirs(self.contact_dir, exist_ok=True)
        os.makedirs(self.enrollments_dir, exist_ok=True)
    
    def get_user_dir(self, user_id: str) -> str:
        """Get user directory path"""
        return os.path.join(self.users_dir, user_id)
    
    def get_student_dir(self, student_id: str) -> str:
        """Get student directory path"""
        return os.path.join(self.students_dir, student_id)
    
    def get_user_classes_dir(self, user_id: str) -> str:
        """Get user classes directory path"""
        return os.path.join(self.get_user_dir(user_id), "classes")
    
    def get_user_file(self, user_id: str) -> str:
        """Get user.json file path"""
        return os.path.join(self.get_user_dir(user_id), "user.json")
    
    def get_student_file(self, student_id: str) -> str:
        """Get student.json file path"""
        return os.path.join(self.get_student_dir(student_id), "student.json")
    
    def get_class_file(self, user_id: str, class_id: str) -> str:
        """Get class json file path"""
        return os.path.join(self.get_user_classes_dir(user_id), f"class_{class_id}.json")
    
    def get_enrollment_file(self, class_id: str) -> str:
        """Get enrollment file for a class"""
        return os.path.join(self.enrollments_dir, f"class_{class_id}_enrollments.json")

    def get_session_file(self, user_id: str, class_id: str) -> str:
        """Get sessions file path for a class"""
        return os.path.join(self.get_user_classes_dir(user_id), f"class_{class_id}_sessions.json")
    
    def read_json(self, file_path: str) -> Optional[Dict[Any, Any]]:
        """Read JSON file safely"""
        try:
            if not os.path.exists(file_path):
                return None
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error reading {file_path}: {e}")
            return None
    
    def write_json(self, file_path: str, data: Dict[Any, Any]):
        """Write JSON file safely"""
        try:
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"Error writing {file_path}: {e}")
            raise

    def scan_qr_code(self, student_id: str, class_id: str, qr_code: str, date: str) -> Dict[str, Any]:
        """
        Handle QR code scan - FIXED SESSION NUMBERING
        ✅ FIX: Properly tracks session numbers even after teacher marks absents
        - First scan of day → Marks 'P' in main sheet (simple string)
        - Second+ scan → Creates/updates multi-session data (sessions array format)
        - Correctly increments session number based on QR session data, not attendance data
        """
        print(f"\n{'='*60}")
        print(f"[DB_QR_SCAN] Processing QR scan")
        print(f"  Student ID: {student_id}")
        print(f"  Class ID: {class_id}")
        print(f"  Date: {date}")
        print(f"{'='*60}")
        
        # 1) Load QR session
        session_file = self.get_qr_session_file(class_id, date)
        session_data = self.read_json(session_file)
        
        if not session_data or session_data.get("status") != "active":
            raise ValueError("No active QR session")
        
        # Validate QR code
        try:
            qr_data = json.loads(qr_code)
            qr_code_value = qr_data.get("code")
        except:
            qr_code_value = qr_code
        
        if session_data.get("current_code") != qr_code_value:
            raise ValueError("Invalid or expired QR code")
        
        # ✅ FIX: Use QR session number as source of truth
        qr_session_number = session_data.get("session_number", 1)
        print(f"[DB_QR_SCAN] QR Session Number: {qr_session_number}")
        
        # 2) Find enrollment
        enrollment_file = self.get_enrollment_file(class_id)
        all_enrollments = self.read_json(enrollment_file) or []
        
        enrollment = None
        for e in all_enrollments:
            if e.get("student_id") == student_id and e.get("status") == "active":
                enrollment = e
                break
        
        if not enrollment:
            raise ValueError("Student not actively enrolled in this class")
        
        student_record_id = enrollment.get("student_record_id")
        
        # 3) Get class data
        class_data = self.get_class_by_id(class_id)
        if not class_data:
            raise ValueError("Class not found")
        
        teacher_id = class_data.get("teacher_id")
        class_file = self.get_class_file(teacher_id, class_id)
        
        # 4) Find student record in class
        students = class_data.get('students', [])
        student_record = None
        for s in students:
            if s.get('id') == student_record_id:
                student_record = s
                break
        
        if not student_record:
            raise ValueError("Student record not found")
        
        # 5) Initialize attendance if needed
        if 'attendance' not in student_record:
            student_record['attendance'] = {}
        
        current_value = student_record['attendance'].get(date)
        
        # ✅ FIX: Check existing sessions structure
        has_valid_sessions = False
        existing_sessions = []
        
        if isinstance(current_value, dict) and 'sessions' in current_value:
            # Already has sessions array - extract all sessions (including null)
            all_sessions = current_value.get('sessions', [])
            existing_sessions = all_sessions  # Keep ALL sessions for proper numbering
            valid_sessions = [s for s in all_sessions if s.get('status') is not None]
            has_valid_sessions = len(valid_sessions) > 0
            print(f"[DB_QR_SCAN] Found {len(all_sessions)} total sessions ({len(valid_sessions)} valid)")
        
        # ✅ FIX: Use QR session number to determine how to update attendance
        if qr_session_number == 1:
            # FIRST QR SESSION OF THE DAY
            if current_value is None:
                # No attendance yet - simple case
                student_record['attendance'][date] = 'P'
                print(f"[DB_QR_SCAN] Session 1: First scan - Marked 'P' in main sheet")
            elif isinstance(current_value, str):
                # Already has simple attendance (shouldn't happen but handle it)
                # This means stop_qr_session was called but student didn't scan
                # Replace with 'P' since they're scanning now
                student_record['attendance'][date] = 'P'
                print(f"[DB_QR_SCAN] Session 1: Replaced previous status with 'P'")
            elif isinstance(current_value, dict) and 'sessions' in current_value:
                # Has sessions array - update session 1
                sessions = current_value.get('sessions', [])
                if sessions and len(sessions) > 0:
                    sessions[0]['status'] = 'P'
                else:
                    sessions = [{
                        "id": "session_1",
                        "name": "QR Session 1",
                        "status": "P"
                    }]
                student_record['attendance'][date] = {
                    "sessions": sessions,
                    "updated_at": datetime.utcnow().isoformat()
                }
                print(f"[DB_QR_SCAN] Session 1: Updated in sessions array")
                
        else:
            # SECOND+ QR SESSION
            if current_value is None or isinstance(current_value, str):
                # ✅ FIX: Build sessions array with proper history
                sessions = []
                
                # Add all previous sessions (1 to qr_session_number-1)
                for i in range(1, qr_session_number):
                    sessions.append({
                        "id": f"session_{i}",
                        "name": f"QR Session {i}",
                        "status": current_value if (i == 1 and isinstance(current_value, str)) else "A"
                    })
                
                # Add current session
                sessions.append({
                    "id": f"session_{qr_session_number}",
                    "name": f"QR Session {qr_session_number}",
                    "status": "P"
                })
                
                student_record['attendance'][date] = {
                    "sessions": sessions,
                    "updated_at": datetime.utcnow().isoformat()
                }
                print(f"[DB_QR_SCAN] Session {qr_session_number}: Created sessions array with history")
                
            elif isinstance(current_value, dict) and 'sessions' in current_value:
                # Already has sessions array
                sessions = current_value.get('sessions', [])
                
                # ✅ FIX: Ensure we have all sessions up to current QR session
                # Fill in any missing sessions between
                existing_session_ids = {s.get('id') for s in sessions if s.get('id')}
                
                for i in range(1, qr_session_number + 1):
                    session_id = f"session_{i}"
                    if session_id not in existing_session_ids:
                        # Add missing session
                        sessions.insert(i - 1, {
                            "id": session_id,
                            "name": f"QR Session {i}",
                            "status": "P" if i == qr_session_number else "A"
                        })
                
                # Update the current session to 'P'
                for session in sessions:
                    if session.get('id') == f"session_{qr_session_number}":
                        session['status'] = 'P'
                        break
                
                student_record['attendance'][date] = {
                    "sessions": sessions,
                    "updated_at": datetime.utcnow().isoformat()
                }
                print(f"[DB_QR_SCAN] Session {qr_session_number}: Updated in existing sessions array")
        
        # 7) Save class data
        self.write_json(class_file, class_data)
        
        # 8) Record scan in QR session
        scanned = session_data.get("scanned_students", [])
        if student_record_id not in scanned:
            scanned.append(student_record_id)
        session_data["scanned_students"] = scanned
        session_data["last_scan_at"] = datetime.utcnow().isoformat()
        self.write_json(session_file, session_data)
        
        print(f"[DB_QR_SCAN] ✅ SUCCESS - Session #{qr_session_number}")
        print(f"  Total scanned in this QR session: {len(scanned)}")
        print(f"{'='*60}\n")
        
        return {
            "success": True,
            "message": f"Attendance marked as Present (Session #{qr_session_number})",
            "scan_count": qr_session_number,
            "session_number": qr_session_number,
            "date": date,
        }

    def stop_qr_session(self, class_id: str, teacher_id: str, date: str) -> Dict[str, Any]:
        """
        Stop QR session and mark absent for students who didn't scan
        ✅ FIX: Uses QR session number to determine which session to mark absent
        """
        session_file = self.get_qr_session_file(class_id, date)
        session_data = self.read_json(session_file)

        if not session_data or session_data.get("status") != "active":
            raise ValueError("No active session")

        if session_data.get("teacher_id") != teacher_id:
            raise ValueError("Unauthorized")

        qr_session_number = session_data.get("session_number", 1)
        scanned_ids = set(session_data.get("scanned_students", []))
        
        print(f"[QR_STOP] Stopping QR Session #{qr_session_number}")

        # Get all active enrollments
        enrollment_file = self.get_enrollment_file(class_id)
        all_enrollments = self.read_json(enrollment_file) or []
        active_student_ids = {
            e.get("student_record_id")
            for e in all_enrollments
            if e.get("status") == "active"
        }

        # Get class data
        class_file = self.get_class_file(teacher_id, class_id)
        class_data = self.read_json(class_file)
        students = class_data.get('students', [])

        # Mark absent for non-scanned students
        marked_absent = 0
        for student in students:
            student_record_id = student.get('id')
            if student_record_id in active_student_ids and student_record_id not in scanned_ids:
                if 'attendance' not in student:
                    student['attendance'] = {}
                
                current_value = student['attendance'].get(date)
                
                # ✅ FIX: Handle based on QR session number
                if qr_session_number == 1:
                    # First session - mark simple 'A'
                    student['attendance'][date] = 'A'
                    print(f"[QR_STOP] Session 1: Marked {student_record_id} as 'A'")
                else:
                    # Second+ session - need sessions array
                    if isinstance(current_value, str) or current_value is None:
                        # Build sessions array with history
                        sessions = []
                        for i in range(1, qr_session_number + 1):
                            sessions.append({
                                "id": f"session_{i}",
                                "name": f"QR Session {i}",
                                "status": current_value if (i == 1 and isinstance(current_value, str)) else "A"
                            })
                        student['attendance'][date] = {
                            "sessions": sessions,
                            "updated_at": datetime.utcnow().isoformat()
                        }
                        print(f"[QR_STOP] Session {qr_session_number}: Created sessions array for {student_record_id}")
                        
                    elif isinstance(current_value, dict) and 'sessions' in current_value:
                        # Has sessions array - add absent for current session
                        sessions = current_value.get('sessions', [])
                        
                        # Ensure we have all sessions up to current
                        existing_ids = {s.get('id') for s in sessions}
                        for i in range(1, qr_session_number + 1):
                            session_id = f"session_{i}"
                            if session_id not in existing_ids:
                                sessions.insert(i - 1, {
                                    "id": session_id,
                                    "name": f"QR Session {i}",
                                    "status": "A"
                                })
                        
                        student['attendance'][date] = {
                            "sessions": sessions,
                            "updated_at": datetime.utcnow().isoformat()
                        }
                        print(f"[QR_STOP] Session {qr_session_number}: Added 'A' to sessions for {student_record_id}")
                
                marked_absent += 1

        # Save class data
        self.write_json(class_file, class_data)

        # Close QR session
        session_data["status"] = "stopped"
        session_data["stopped_at"] = datetime.utcnow().isoformat()
        self.write_json(session_file, session_data)

        print(f"[QR_STOP] Session {qr_session_number} stopped")
        print(f"  Present: {len(scanned_ids)}, Absent: {marked_absent}")

        return {
            "success": True,
            "scanned_count": len(scanned_ids),
            "absent_count": marked_absent,
            "date": date,
            "session_number": qr_session_number
        }

    # ==================== USER OPERATIONS ====================
    
    def create_user(self, user_id: str, email: str, name: str, password_hash: str) -> Dict[str, Any]:
        """Create a new user with directory structure"""
        user_dir = self.get_user_dir(user_id)
        classes_dir = self.get_user_classes_dir(user_id)
        os.makedirs(classes_dir, exist_ok=True)
        
        user_data = {
            "id": user_id,
            "email": email,
            "name": name,
            "password": password_hash,
            "created_at": datetime.utcnow().isoformat(),
            "verified": True,
            "role": "teacher",
            "overview": {
                "total_classes": 0,
                "total_students": 0,
                "last_updated": datetime.utcnow().isoformat()
            }
        }
        
        self.write_json(self.get_user_file(user_id), user_data)
        return user_data
    
    def create_student(self, student_id: str, email: str, name: str, password_hash: str) -> Dict[str, Any]:
        """Create a new student user"""
        student_dir = self.get_student_dir(student_id)
        os.makedirs(student_dir, exist_ok=True)
        
        student_data = {
            "id": student_id,
            "email": email,
            "name": name,
            "password": password_hash,
            "created_at": datetime.utcnow().isoformat(),
            "verified": True,
            "role": "student",
            "enrolled_classes": []
        }
        
        self.write_json(self.get_student_file(student_id), student_data)
        return student_data
    
    def get_user(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get user data"""
        return self.read_json(self.get_user_file(user_id))
    
    def get_student(self, student_id: str) -> Optional[Dict[str, Any]]:
        """Get student data"""
        return self.read_json(self.get_student_file(student_id))
    
    def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        """Get user by email (searches all users - teachers)"""
        if not os.path.exists(self.users_dir):
            return None
        
        for user_id in os.listdir(self.users_dir):
            user_file = self.get_user_file(user_id)
            user_data = self.read_json(user_file)
            if user_data and user_data.get("email") == email:
                return user_data
        return None
    
    def get_student_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        """Get student by email"""
        if not os.path.exists(self.students_dir):
            return None
        
        for student_id in os.listdir(self.students_dir):
            student_file = self.get_student_file(student_id)
            student_data = self.read_json(student_file)
            if student_data and student_data.get("email") == email:
                return student_data
        return None
    
    def update_user(self, user_id: str, **updates) -> Dict[str, Any]:
        """Update user data"""
        user_data = self.get_user(user_id)
        if not user_data:
            raise ValueError(f"User {user_id} not found")
        
        user_data.update(updates)
        user_data["updated_at"] = datetime.utcnow().isoformat()
        self.write_json(self.get_user_file(user_id), user_data)
        return user_data
    
    def update_student(self, student_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        """Update student data"""
        student_data = self.get_student(student_id)
        if not student_data:
            raise ValueError(f"Student {student_id} not found")
        
        student_data.update(updates)
        student_data["updated_at"] = datetime.utcnow().isoformat()
        self.write_json(self.get_student_file(student_id), student_data)
        return student_data
    
    def delete_user(self, user_id: str) -> bool:
        """Delete user and all associated data"""
        user_dir = self.get_user_dir(user_id)
        if not os.path.exists(user_dir):
            return False
        
        try:
            classes = self.get_all_classes(user_id)
            for cls in classes:
                class_id = str(cls.get("id"))
                enrollment_file = self.get_enrollment_file(class_id)
                if os.path.exists(enrollment_file):
                    enrollments = self.read_json(enrollment_file) or []
                    for enrollment in enrollments:
                        student_id = enrollment.get("student_id")
                        if student_id:
                            try:
                                student_data = self.get_student(student_id)
                                if student_data:
                                    enrolled_classes = student_data.get("enrolled_classes", [])
                                    enrolled_classes = [ec for ec in enrolled_classes if ec.get("class_id") != class_id]
                                    self.update_student(student_id, {"enrolled_classes": enrolled_classes})
                            except Exception as e:
                                print(f"Error updating student {student_id} during teacher deletion: {e}")
                    os.remove(enrollment_file)
            
            shutil.rmtree(user_dir)
            return True
        except Exception as e:
            print(f"Error deleting user {user_id}: {e}")
            return False
    
    def delete_student(self, student_id: str) -> bool:
        """Delete student account and all their data, clean up enrollments"""
        print(f"\n[DELETE_STUDENT] Starting deletion for student {student_id}")
        try:
            student_data = self.get_student(student_id)
            if not student_data:
                print(f"[DELETE_STUDENT] Student {student_id} not found")
                return False
            
            enrolled_classes = student_data.get("enrolled_classes", [])
            print(f"[DELETE_STUDENT] Student is enrolled in {len(enrolled_classes)} classes")
            
            for enrollment_info in enrolled_classes:
                class_id = enrollment_info.get("class_id")
                if not class_id:
                    continue
                
                print(f"[DELETE_STUDENT] Processing class {class_id}")
                enrollment_file = self.get_enrollment_file(class_id)
                if os.path.exists(enrollment_file):
                    enrollments = self.read_json(enrollment_file) or []
                    original_count = len(enrollments)
                    updated_enrollments = [e for e in enrollments if e.get("student_id") != student_id]
                    self.write_json(enrollment_file, updated_enrollments)
                    print(f"[DELETE_STUDENT] Updated enrollments for class {class_id}: {original_count} -> {len(updated_enrollments)}")
                
                class_data = self.get_class_by_id(class_id)
                if class_data:
                    teacher_id = class_data.get("teacher_id")
                    if teacher_id:
                        self.update_user_overview(teacher_id)
                        print(f"[DELETE_STUDENT] Updated teacher {teacher_id} overview")
            
            student_dir = self.get_student_dir(student_id)
            if os.path.exists(student_dir):
                shutil.rmtree(student_dir)
                print(f"[DELETE_STUDENT] Deleted student directory")
            
            print(f"[DELETE_STUDENT] ✅ Successfully deleted student {student_id}\n")
            return True
        except Exception as e:
            print(f"[DELETE_STUDENT] ❌ ERROR: {e}")
            return False
    
    def update_user_overview(self, user_id: str):
        """Update user overview statistics - counts students based on enrollment mode"""
        user_data = self.get_user(user_id)
        if not user_data:
            return
        
        classes = self.get_all_classes(user_id)  # This already filters based on mode
        
        total_students = 0
        for cls in classes:
            # get_all_classes already returns the correct student count per mode
            total_students += len(cls.get('students', []))
        
        user_data['overview'] = {
            "totalClasses": len(classes),
            "totalStudents": total_students,
            "lastUpdated": datetime.utcnow().isoformat()
        }
        
        self.write_json(self.get_user_file(user_id), user_data)


    # ==================== CLASS OPERATIONS ====================
    
    def create_class(self, user_id: str, class_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new class"""
        class_id = str(class_data["id"])
        
        # NEW: Get enrollment_mode with default
        enrollment_mode = class_data.get("enrollment_mode", "manual_entry")
        
        full_class_data = {
            **class_data,
            "teacher_id": user_id,
            "enrollment_mode": enrollment_mode,  # NEW FIELD
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
            "statistics": self.calculate_class_statistics(class_data, class_id)
        }
        
        class_file = self.get_class_file(user_id, class_id)
        self.write_json(class_file, full_class_data)
        self.update_user_overview(user_id)
        
        return full_class_data
    
    def get_class(self, user_id: str, class_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific class - returns all students for all modes"""
        class_file = self.get_class_file(user_id, class_id)
        class_data = self.read_json(class_file)
        
        if not class_data:
            return None
        
        # Get enrollment mode
        enrollment_mode = class_data.get('enrollment_mode', 'manual_entry')
        
        if enrollment_mode == 'enrollment_via_id':
            # ENROLLMENT MODE: Filter to show only ACTIVE students
            active_enrollments = self.get_class_enrollments(class_id)
            active_record_ids = {e.get('student_record_id') for e in active_enrollments}
            
            all_students = class_data.get('students', [])
            active_students = [s for s in all_students if s.get('id') in active_record_ids]
            
            class_data_copy = class_data.copy()
            class_data_copy['students'] = active_students
            
            # Recalculate statistics with active students only
            class_data_copy['statistics'] = self.calculate_class_statistics(class_data_copy, class_id)
            
            print(f"[GET_CLASS] Enrollment mode - {len(all_students)} total, {len(active_students)} active shown")
            return class_data_copy
        else:
            # MANUAL/IMPORT MODE: Return all students with correct statistics
            print(f"[GET_CLASS] Manual/Import mode - returning all {len(class_data.get('students', []))} students")
            
            # Recalculate statistics to ensure they're up to date
            class_data['statistics'] = self.calculate_class_statistics(class_data, class_id)
            
            return class_data

    
    def get_class_by_id(self, class_id: str) -> Optional[Dict[str, Any]]:
        """Get a class by ID - returns RAW data with ALL students (for internal use)"""
        if not os.path.exists(self.users_dir):
            return None
        
        for teacher_id in os.listdir(self.users_dir):
            classes_dir = self.get_user_classes_dir(teacher_id)
            if os.path.exists(classes_dir):
                class_file = os.path.join(classes_dir, f"class_{class_id}.json")
                if os.path.exists(class_file):
                    return self.read_json(class_file)
        return None
    
    def get_all_classes(self, user_id: str) -> List[Dict[str, Any]]:
        """Get all classes for a user - handles both enrollment and manual modes"""
        classes_dir = self.get_user_classes_dir(user_id)
        
        if not os.path.exists(classes_dir):
            return []
        
        classes = []
        for filename in os.listdir(classes_dir):
            if filename.startswith("class_") and filename.endswith(".json") and "_sessions.json" not in filename:
                class_file = os.path.join(classes_dir, filename)
                class_data = self.read_json(class_file)
                
                if class_data and isinstance(class_data, dict):
                    class_id = str(class_data.get('id'))
                    enrollment_mode = class_data.get('enrollment_mode', 'manual_entry')
                    
                    if enrollment_mode == 'enrollment_via_id':
                        # ENROLLMENT MODE
                        active_enrollments = self.get_class_enrollments(class_id)
                        active_record_ids = {e.get('student_record_id') for e in active_enrollments}
                        
                        all_students = class_data.get('students', [])
                        active_students = [s for s in all_students if s.get('id') in active_record_ids]
                        
                        class_data_copy = class_data.copy()
                        class_data_copy['students'] = active_students
                        
                        # ✅ RECALCULATE
                        class_data_copy['statistics'] = self.calculate_class_statistics(class_data_copy, class_id)
                        
                        # ⭐ NEW: SAVE BACK TO FILE
                        class_data['statistics'] = class_data_copy['statistics']
                        self.write_json(class_file, class_data)
                        
                        classes.append(class_data_copy)
                    else:
                        # MANUAL/IMPORT MODE
                        # ✅ RECALCULATE
                        class_data['statistics'] = self.calculate_class_statistics(class_data, class_id)
                        
                        # ⭐ NEW: SAVE BACK TO FILE
                        self.write_json(class_file, class_data)
                        
                        classes.append(class_data)
        
        return classes

    def update_class(self, user_id: str, class_id: str, class_data: Dict[str, Any]) -> Dict[str, Any]:
        """Update class data - handles both enrollment and manual modes"""
        class_file = self.get_class_file(user_id, class_id)
        current_class = self.read_json(class_file)
        
        if not current_class:
            raise ValueError(f"Class {class_id} not found")
        
        # Get enrollment mode
        enrollment_mode = current_class.get('enrollment_mode', 'manual_entry')
        
        if enrollment_mode == 'enrollment_via_id':
            # ENROLLMENT MODE: Filter to show only active enrollments
            all_students_in_file = current_class.get('students', [])
            incoming_students = class_data.get('students', [])
            
            # Check for deleted students
            current_ids = {s.get('id') for s in all_students_in_file}
            new_ids = {s.get('id') for s in incoming_students}
            deleted_ids = current_ids - new_ids
            
            # Mark deleted students as inactive in enrollments
            if deleted_ids:
                enrollment_file = self.get_enrollment_file(class_id)
                enrollments = self.read_json(enrollment_file) or []
                
                for enrollment in enrollments:
                    if enrollment.get('student_record_id') in deleted_ids and enrollment.get('status') == 'active':
                        enrollment['status'] = 'inactive'
                        enrollment['removed_by_teacher_at'] = datetime.utcnow().isoformat()
                        
                        # Update student's enrolled_classes
                        student_id = enrollment.get('student_id')
                        if student_id:
                            try:
                                student_data = self.get_student(student_id)
                                if student_data:
                                    enrolled_classes = student_data.get('enrolled_classes', [])
                                    enrolled_classes = [ec for ec in enrolled_classes if ec.get('class_id') != class_id]
                                    self.update_student(student_id, {"enrolled_classes": enrolled_classes})
                            except Exception as e:
                                print(f"Error updating student {student_id}: {e}")
                
                self.write_json(enrollment_file, enrollments)
            
            # Build final student list (active + inactive preserved)
            updated_students_map = {s.get('id'): s for s in incoming_students}
            final_students = []
            
            for student in all_students_in_file:
                student_id = student.get('id')
                if student_id in updated_students_map:
                    # Active student - use updated data
                    final_students.append(updated_students_map[student_id])
                else:
                    # Inactive student - preserve from file
                    final_students.append(student)
            
            class_data['students'] = final_students
        
        else:
            # MANUAL/IMPORT MODE: Just save students directly from request
            print(f"[UPDATE_CLASS] Manual/Import mode - saving {len(class_data.get('students', []))} students directly")
            # class_data['students'] already contains what we need from the request
        
        # Merge with current class data
        current_class.update(class_data)
        current_class["updated_at"] = datetime.utcnow().isoformat()
        current_class["statistics"] = self.calculate_class_statistics(current_class, class_id)
        
        self.write_json(class_file, current_class)
        self.update_user_overview(user_id)
        
        print(f"[UPDATE_CLASS] ✅ Saved {len(current_class.get('students', []))} students to file")
        
        return current_class

    
    def delete_class(self, user_id: str, class_id: str) -> bool:
        """Delete a class and clean up enrollments"""
        class_file = self.get_class_file(user_id, class_id)
        if not os.path.exists(class_file):
            return False
        
        os.remove(class_file)
        
        enrollment_file = self.get_enrollment_file(class_id)
        if os.path.exists(enrollment_file):
            enrollments = self.read_json(enrollment_file) or []
            for enrollment in enrollments:
                student_id = enrollment.get("student_id")
                if student_id:
                    try:
                        student_data = self.get_student(student_id)
                        if student_data:
                            enrolled_classes = student_data.get("enrolled_classes", [])
                            enrolled_classes = [ec for ec in enrolled_classes if ec.get("class_id") != class_id]
                            self.update_student(student_id, {"enrolled_classes": enrolled_classes})
                    except Exception as e:
                        print(f"Error updating student {student_id} after class deletion: {e}")
            os.remove(enrollment_file)
        
        self.update_user_overview(user_id)
        return True
    
    def calculate_class_statistics(self, class_data: Dict[str, Any], class_id: str = None) -> Dict[str, Any]:
        """
        Calculate statistics for a class - Uses MONTHLY ATTENDANCE data
        ✅ FIXED: Now correctly handles ALL multi-session formats:
            - NEW: { sessions: [...], updated_at: ... }
            - OLD: { status: 'P', count: 2 }
            - SIMPLE: 'P' | 'A' | 'L'
        """
        students = class_data.get('students', [])
        
        if not students:
            return {
                "totalStudents": 0,
                "avgAttendance": 0.0,
                "atRiskCount": 0,
                "excellentCount": 0
            }
        
        thresholds = class_data.get('thresholds')
        if thresholds is None:
            thresholds = {
                "excellent": 95.0,
                "good": 90.0,
                "moderate": 85.0,
                "atRisk": 85.0
            }
        
        at_risk = 0
        excellent = 0
        total_attendance = 0.0
        students_with_attendance = 0
        
        print(f"[STATISTICS] Calculating for {len(students)} students")
        
        for student in students:
            attendance = student.get('attendance', {})
            
            if not attendance:
                continue
            
            present = 0
            absent = 0
            late = 0
            total = 0
            
            # ✅ FIX: Handle ALL attendance formats
            for date_key, value in attendance.items():
                if isinstance(value, dict):
                    # ✅ NEW FORMAT: { sessions: [...], updated_at: "..." }
                    if 'sessions' in value and value.get('sessions'):
                        sessions = value['sessions']
                        print(f"[STATISTICS] {date_key}: Found {len(sessions)} sessions (NEW FORMAT)")
                        for session in sessions:
                            status = session.get('status')
                            if status in ['P', 'A', 'L']:
                                total += 1
                                if status == 'P':
                                    present += 1
                                elif status == 'A':
                                    absent += 1
                                elif status == 'L':
                                    late += 1
                    # OLD FORMAT: { status: 'P', count: 2 }
                    elif 'status' in value:
                        status = value.get('status')
                        count = value.get('count', 1)
                        print(f"[STATISTICS] {date_key}: {count}x {status} (OLD FORMAT)")
                        if status in ['P', 'A', 'L']:
                            total += count
                            if status == 'P':
                                present += count
                            elif status == 'A':
                                absent += count
                            elif status == 'L':
                                late += count
                # VERY OLD FORMAT: 'P' | 'A' | 'L'
                elif isinstance(value, str) and value in ['P', 'A', 'L']:
                    total += 1
                    if value == 'P':
                        present += 1
                    elif value == 'A':
                        absent += 1
                    elif value == 'L':
                        late += 1
            
            if total > 0:
                # Calculate percentage (Present + Late count as attended)
                percentage = ((present + late) / total) * 100.0
                total_attendance += percentage
                students_with_attendance += 1
                
                student_id = student.get('id')
                print(f"[STATISTICS] Student {student_id}: {present}P + {late}L / {total} = {percentage:.3f}%")
                
                if percentage >= thresholds.get('excellent', 95.0):
                    excellent += 1
                elif percentage < thresholds.get('atRisk', 85.0):
                    at_risk += 1
        
        # Calculate average
        avg_attendance = (total_attendance / students_with_attendance) if students_with_attendance > 0 else 0.0
        
        print(f"[STATISTICS] Summary:")
        print(f"  Total students: {len(students)}")
        print(f"  With attendance: {students_with_attendance}")
        print(f"  Average: {avg_attendance:.3f}%")
        print(f"  At Risk: {at_risk}, Excellent: {excellent}")
        
        return {
            "totalStudents": len(students),
            "avgAttendance": round(avg_attendance, 3),
            "atRiskCount": at_risk,
            "excellentCount": excellent,
            "lastCalculated": datetime.utcnow().isoformat()
        }

    # ==================== SESSION OPERATIONS ====================
    
    def create_attendance_session(self, user_id: str, class_id: str, session_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a new attendance session for a class.
        
        Args:
            user_id: Teacher's user ID
            class_id: Class ID
            session_data: Dict containing date, sessionName, startTime, endTime
            
        Returns:
            Created session with ID
        """
        print(f"\n{'='*60}")
        print(f"[DB_CREATE_SESSION] Starting session creation")
        print(f"  User ID: {user_id}")
        print(f"  Class ID: {class_id}")
        print(f"  Session Data: {session_data}")
        print(f"{'='*60}\n")
        
        try:
            # Step 1: Verify class exists and belongs to user
            print(f"[DB_CREATE_SESSION] Step 1: Verifying class...")
            class_data = self.get_class(user_id, class_id)
            if not class_data:
                error_msg = f"Class {class_id} not found for user {user_id}"
                print(f"[DB_CREATE_SESSION] ❌ {error_msg}")
                raise ValueError(error_msg)
            
            print(f"[DB_CREATE_SESSION] ✅ Class verified: {class_data.get('name')}")
            
            # Step 2: Generate unique session ID
            print(f"[DB_CREATE_SESSION] Step 2: Generating session ID...")
            session_id = f"session_{int(datetime.utcnow().timestamp() * 1000)}"
            print(f"[DB_CREATE_SESSION] ✅ Generated session ID: {session_id}")
            
            # Step 3: Create new session object
            print(f"[DB_CREATE_SESSION] Step 3: Creating session object...")
            new_session = {
                "id": session_id,
                "class_id": class_id,
                "date": session_data.get("date"),
                "sessionName": session_data.get("sessionName"),
                "startTime": session_data.get("startTime"),
                "endTime": session_data.get("endTime"),
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
                "attendance": {}
            }
            print(f"[DB_CREATE_SESSION] ✅ Session object created")
            
            # Step 4: Get sessions file path
            print(f"[DB_CREATE_SESSION] Step 4: Getting sessions file path...")
            sessions_file = self.get_session_file(user_id, class_id)
            print(f"[DB_CREATE_SESSION] Sessions file path: {sessions_file}")
            
            # Step 5: Ensure directory exists
            print(f"[DB_CREATE_SESSION] Step 5: Ensuring directory exists...")
            sessions_dir = os.path.dirname(sessions_file)
            print(f"[DB_CREATE_SESSION] Sessions directory: {sessions_dir}")
            
            if not os.path.exists(sessions_dir):
                print(f"[DB_CREATE_SESSION] Directory doesn't exist, creating...")
                os.makedirs(sessions_dir, exist_ok=True)
                print(f"[DB_CREATE_SESSION] ✅ Directory created")
            else:
                print(f"[DB_CREATE_SESSION] ✅ Directory already exists")
            
            # Step 6: Load existing sessions
            print(f"[DB_CREATE_SESSION] Step 6: Loading existing sessions...")
            all_sessions = self.read_json(sessions_file) or []
            print(f"[DB_CREATE_SESSION] Found {len(all_sessions)} existing sessions")
            
            # Step 7: Add new session
            print(f"[DB_CREATE_SESSION] Step 7: Adding new session to list...")
            all_sessions.append(new_session)
            print(f"[DB_CREATE_SESSION] Total sessions now: {len(all_sessions)}")
            
            # Step 8: Save to file
            print(f"[DB_CREATE_SESSION] Step 8: Writing to file...")
            self.write_json(sessions_file, all_sessions)
            print(f"[DB_CREATE_SESSION] ✅ File written successfully")
            
            print(f"\n[DB_CREATE_SESSION] ✅✅✅ SESSION CREATED SUCCESSFULLY")
            print(f"  Session ID: {session_id}")
            print(f"  Session Name: {new_session['sessionName']}")
            print(f"  File: {sessions_file}")
            print(f"{'='*60}\n")
            
            return new_session
            
        except ValueError as ve:
            print(f"[DB_CREATE_SESSION] ❌ ValueError: {ve}")
            raise
        except Exception as e:
            print(f"[DB_CREATE_SESSION] ❌ UNEXPECTED ERROR: {e}")
            print(f"[DB_CREATE_SESSION] Error type: {type(e).__name__}")
            import traceback
            traceback.print_exc()
            raise
    
    def get_class_sessions(self, user_id: str, class_id: str, date: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Get all sessions for a class, optionally filtered by date.
        
        Args:
            user_id: Teacher's user ID
            class_id: Class ID
            date: Optional date filter (YYYY-MM-DD format)
            
        Returns:
            List of sessions
        """
        try:
            sessions_file = self.get_session_file(user_id, class_id)
            
            # Check if sessions file exists
            if not os.path.exists(sessions_file):
                print(f"[DB] No sessions file found for class {class_id}")
                return []
            
            all_sessions = self.read_json(sessions_file) or []
            
            # Filter by date if provided
            if date:
                filtered_sessions = [s for s in all_sessions if s.get("date") == date]
                print(f"[DB] Found {len(filtered_sessions)} sessions for class {class_id} on {date}")
                return filtered_sessions
            
            print(f"[DB] Found {len(all_sessions)} total sessions for class {class_id}")
            return all_sessions
            
        except Exception as e:
            print(f"[DB] Error getting sessions: {e}")
            return []
    
    def get_session_by_id(self, user_id: str, class_id: str, session_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a specific session by ID.
        
        Args:
            user_id: Teacher's user ID
            class_id: Class ID
            session_id: Session ID
            
        Returns:
            Session data or None if not found
        """
        try:
            sessions = self.get_class_sessions(user_id, class_id)
            
            for session in sessions:
                if session.get("id") == session_id:
                    return session
            
            print(f"[DB] Session {session_id} not found")
            return None
            
        except Exception as e:
            print(f"[DB] Error getting session by ID: {e}")
            return None
    
    def update_session_attendance(self, user_id: str, class_id: str, session_id: str, student_id: str, status: str) -> bool:
        """
        Update attendance for a specific student in a specific session.
        
        Args:
            user_id: Teacher's user ID
            class_id: Class ID
            session_id: Session ID
            student_id: Student ID (from class students list)
            status: 'P', 'A', or 'L'
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Validate status
            if status not in ['P', 'A', 'L']:
                print(f"[DB] Invalid status: {status}")
                return False
            
            sessions_file = self.get_session_file(user_id, class_id)
            all_sessions = self.read_json(sessions_file) or []
            
            # Find and update the session
            session_found = False
            for session in all_sessions:
                if session.get("id") == session_id:
                    session["attendance"][student_id] = status
                    session["updated_at"] = datetime.utcnow().isoformat()
                    session_found = True
                    print(f"[DB] Updated attendance for student {student_id} in session {session_id}: {status}")
                    break
            
            if not session_found:
                print(f"[DB] Session {session_id} not found")
                return False
            
            # Save back to file
            self.write_json(sessions_file, all_sessions)
            return True
            
        except Exception as e:
            print(f"[DB] Error updating session attendance: {e}")
            return False
        
    def update_multi_session_attendance(self, user_id: str, class_id: str, student_id: int, date: str, sessions: List[Dict[str, Any]]) -> bool:
        """
        Update multi-session attendance for a student on a specific day.
        
        Args:
            user_id: Teacher's user ID
            class_id: Class ID
            student_id: Student ID (from class students list)
            date: Date in YYYY-MM-DD format
            sessions: List of session objects: [
                { "id": "session_1", "name": "Session 1", "status": "P" },
                { "id": "session_2", "name": "Session 2", "status": "A" }
            ]
        
        Returns:
            True if successful, False otherwise
        """
        try:
            print(f"[DB_MULTI_SESSION] Updating attendance for student {student_id} on {date}")
            print(f"[DB_MULTI_SESSION] Sessions: {sessions}")
            
            class_file = self.get_class_file(user_id, class_id)
            class_data = self.read_json(class_file)
            
            if not class_data:
                print(f"[DB_MULTI_SESSION] Class not found")
                return False
            
            # Find student
            student_found = False
            for student in class_data.get('students', []):
                if student.get('id') == student_id:
                    student_found = True
                    
                    # Initialize attendance dict if needed
                    if 'attendance' not in student:
                        student['attendance'] = {}
                    
                    # Filter out sessions with null status
                    valid_sessions = [s for s in sessions if s.get('status') is not None]
                    
                    if not valid_sessions:
                        # No valid sessions - remove attendance for this day
                        if date in student['attendance']:
                            del student['attendance'][date]
                        print(f"[DB_MULTI_SESSION] Removed attendance (no valid sessions)")
                    else:
                        # Store in new format
                        student['attendance'][date] = {
                            "sessions": valid_sessions,
                            "updated_at": datetime.utcnow().isoformat()
                        }
                        print(f"[DB_MULTI_SESSION] Stored {len(valid_sessions)} sessions")
                    
                    break
            
            if not student_found:
                print(f"[DB_MULTI_SESSION] Student {student_id} not found")
                return False
            
            # Recalculate statistics
            class_data['statistics'] = self.calculate_class_statistics(class_data, class_id)
            
            # Save
            self.write_json(class_file, class_data)
            
            print(f"[DB_MULTI_SESSION] ✅ Successfully updated multi-session attendance")
            return True
            
        except Exception as e:
            print(f"[DB_MULTI_SESSION] ❌ Error: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def delete_attendance_session(self, user_id: str, class_id: str, session_id: str) -> bool:
        """
        Delete an attendance session.
        
        Args:
            user_id: Teacher's user ID
            class_id: Class ID
            session_id: Session ID to delete
            
        Returns:
            True if successful, False otherwise
        """
        try:
            sessions_file = self.get_session_file(user_id, class_id)
            all_sessions = self.read_json(sessions_file) or []
            
            # Filter out the session to delete
            original_count = len(all_sessions)
            updated_sessions = [s for s in all_sessions if s.get("id") != session_id]
            
            if len(updated_sessions) < original_count:
                self.write_json(sessions_file, updated_sessions)
                print(f"[DB] Deleted session {session_id} from class {class_id}")
                return True
            
            print(f"[DB] Session {session_id} not found for deletion")
            return False
            
        except Exception as e:
            print(f"[DB] Error deleting session: {e}")
            return False
    
    def get_student_day_attendance(self, user_id: str, class_id: str, student_id: str, date: str) -> Dict[str, Any]:
        """
        Get student's attendance statistics across all sessions for a specific day.
        
        Args:
            user_id: Teacher's user ID
            class_id: Class ID
            student_id: Student ID
            date: Date in YYYY-MM-DD format
            
        Returns:
            Dict with total_sessions, attended, and percentage
        """
        try:
            # Get all sessions for the date
            sessions = self.get_class_sessions(user_id, class_id, date)
            
            total_sessions = len(sessions)
            attended = 0
            present = 0
            absent = 0
            late = 0
            
            # Count attendance across sessions
            for session in sessions:
                status = session.get("attendance", {}).get(student_id)
                if status == 'P':
                    attended += 1
                    present += 1
                elif status == 'L':
                    attended += 1
                    late += 1
                elif status == 'A':
                    absent += 1
            
            # Calculate percentage
            percentage = (attended / total_sessions * 100) if total_sessions > 0 else 0
            
            result = {
                "date": date,
                "total_sessions": total_sessions,
                "attended": attended,
                "present": present,
                "late": late,
                "absent": absent,
                "percentage": round(percentage, 1)
            }
            
            print(f"[DB] Day stats for student {student_id} on {date}: {attended}/{total_sessions} ({percentage:.1f}%)")
            return result
            
        except Exception as e:
            print(f"[DB] Error calculating day attendance: {e}")
            return {
                "date": date,
                "total_sessions": 0,
                "attended": 0,
                "present": 0,
                "late": 0,
                "absent": 0,
                "percentage": 0.0
            }
    
    def get_all_students_day_attendance(self, user_id: str, class_id: str, date: str) -> Dict[str, Dict[str, Any]]:
        """
        Get all students' attendance stats for a specific day.
        Useful for generating reports.
        
        Args:
            user_id: Teacher's user ID
            class_id: Class ID
            date: Date in YYYY-MM-DD format
            
        Returns:
            Dict mapping student_id to their attendance stats
        """
        try:
            # Get class data to get student list
            class_data = self.get_class(user_id, class_id)
            if not class_data:
                return {}
            
            students = class_data.get("students", [])
            result = {}
            
            # Get stats for each student
            for student in students:
                student_id = str(student.get("id"))
                stats = self.get_student_day_attendance(user_id, class_id, student_id, date)
                result[student_id] = {
                    **stats,
                    "student_name": student.get("name"),
                    "roll_no": student.get("rollNo")
                }
            
            return result
            
        except Exception as e:
            print(f"[DB] Error getting all students day attendance: {e}")
            return {}
    
    def bulk_update_session_attendance(self, user_id: str, class_id: str, session_id: str, attendance_data: Dict[str, str]) -> bool:
        """
        Update attendance for multiple students at once.
        Useful for importing attendance or bulk operations.
        
        Args:
            user_id: Teacher's user ID
            class_id: Class ID
            session_id: Session ID
            attendance_data: Dict mapping student_id to status ('P'/'A'/'L')
            
        Returns:
            True if successful, False otherwise
        """
        try:
            sessions_file = self.get_session_file(user_id, class_id)
            all_sessions = self.read_json(sessions_file) or []
            
            # Find the session
            session_found = False
            for session in all_sessions:
                if session.get("id") == session_id:
                    # Update all attendance records
                    for student_id, status in attendance_data.items():
                        if status in ['P', 'A', 'L']:
                            session["attendance"][student_id] = status
                    
                    session["updated_at"] = datetime.utcnow().isoformat()
                    session_found = True
                    print(f"[DB] Bulk updated attendance for {len(attendance_data)} students in session {session_id}")
                    break
            
            if not session_found:
                print(f"[DB] Session {session_id} not found for bulk update")
                return False
            
            # Save back to file
            self.write_json(sessions_file, all_sessions)
            return True
            
        except Exception as e:
            print(f"[DB] Error in bulk update: {e}")
            return False
        
    def sync_session_to_monthly_attendance(self, teacher_id: str, class_id: str, session_id: str):
        """
        Sync attendance from a session to the monthly attendance in class file.
        This is the SOURCE OF TRUTH - all statistics calculate from this data.
        
        ✅ FIX: For mixed attendance (P in session 1, A in session 2), we store:
        - If ANY session has P or L → status = 'P' or 'L' (attendance wins)
        - Only if ALL sessions are A → status = 'A'
        - Count tracks total sessions
        """
        print(f"\n[SYNC] Syncing session {session_id} to monthly attendance...")
        
        # Get session data
        sessions_file = self.get_session_file(teacher_id, class_id)
        all_sessions = self.read_json(sessions_file) or []
        
        session = None
        for s in all_sessions:
            if s.get("id") == session_id:
                session = s
                break
        
        if not session:
            print(f"[SYNC] Session not found")
            return False
        
        date = session.get("date")  # YYYY-MM-DD format
        attendance_map = session.get("attendance", {})  # {student_id: 'P'/'A'/'L'}
        
        print(f"[SYNC] Date: {date}")
        print(f"[SYNC] Students with attendance: {len(attendance_map)}")
        
        # Get class file
        class_file = self.get_class_file(teacher_id, class_id)
        class_data = self.read_json(class_file)
        
        if not class_data:
            print(f"[SYNC] Class not found")
            return False
        
        # Update each student's monthly attendance
        students = class_data.get('students', [])
        updated_count = 0
        
        for student in students:
            student_id = str(student.get('id'))
            
            if student_id in attendance_map:
                new_status = attendance_map[student_id]
                
                # Initialize attendance dict if needed
                if 'attendance' not in student:
                    student['attendance'] = {}
                
                # Check current value for this date
                current = student['attendance'].get(date)
                
                if current:
                    # ✅ FIX: Handle multi-session mixed attendance
                    if isinstance(current, dict):
                        # Already in multi-session format
                        old_status = current.get('status')
                        old_count = current.get('count', 1)
                        new_count = old_count + 1
                        
                        # Determine final status (attendance wins over absence)
                        if old_status == 'P' or new_status == 'P':
                            final_status = 'P'  # Present wins
                        elif old_status == 'L' or new_status == 'L':
                            final_status = 'L'  # Late wins over absent
                        else:
                            final_status = 'A'  # Both absent
                        
                        student['attendance'][date] = {
                            'status': final_status,
                            'count': new_count
                        }
                        print(f"[SYNC] Student {student_id}: Session #{new_count} - {new_status} (combined: {final_status})")
                    else:
                        # First session was string, convert to object for 2nd session
                        old_status = current
                        
                        # Determine final status
                        if old_status == 'P' or new_status == 'P':
                            final_status = 'P'
                        elif old_status == 'L' or new_status == 'L':
                            final_status = 'L'
                        else:
                            final_status = 'A'
                        
                        student['attendance'][date] = {
                            'status': final_status,
                            'count': 2  # This is the 2nd session
                        }
                        print(f"[SYNC] Student {student_id}: Converted to multi-session (2nd) - {new_status} (combined: {final_status})")
                else:
                    # First session on this date - store as simple string
                    student['attendance'][date] = new_status
                    print(f"[SYNC] Student {student_id}: First session - {new_status}")
                
                updated_count += 1
        
        # Save back to file
        self.write_json(class_file, class_data)
        
        # ✅ CRITICAL: Recalculate statistics AFTER saving attendance data
        print(f"[SYNC] Recalculating statistics...")
        class_data['statistics'] = self.calculate_class_statistics(class_data, class_id)
        self.write_json(class_file, class_data)
        
        print(f"[SYNC] ✅ Synced {updated_count} students")
        print(f"[SYNC] ✅ New statistics: {class_data['statistics']}")
        return True

    # ==================== SESSION CLEANUP ====================
    
    def delete_class(self, user_id: str, class_id: str) -> bool:
        """
        Delete a class and all associated data including sessions.
        (UPDATED to also delete session files)
        """
        class_file = self.get_class_file(user_id, class_id)
        if not os.path.exists(class_file):
            return False
        
        try:
            # Delete class file
            os.remove(class_file)
            
            # Delete sessions file if exists
            sessions_file = self.get_session_file(user_id, class_id)
            if os.path.exists(sessions_file):
                os.remove(sessions_file)
                print(f"[DB] Deleted sessions file for class {class_id}")
            
            # Delete enrollment file if exists
            enrollment_file = self.get_enrollment_file(class_id)
            if os.path.exists(enrollment_file):
                enrollments = self.read_json(enrollment_file) or []
                for enrollment in enrollments:
                    student_id = enrollment.get("student_id")
                    if student_id:
                        try:
                            student_data = self.get_student(student_id)
                            if student_data:
                                enrolled_classes = student_data.get("enrolled_classes", [])
                                enrolled_classes = [ec for ec in enrolled_classes if ec.get("class_id") != class_id]
                                self.update_student(student_id, {"enrolled_classes": enrolled_classes})
                        except Exception as e:
                            print(f"Error updating student {student_id} after class deletion: {e}")
                os.remove(enrollment_file)
            
            self.update_user_overview(user_id)
            print(f"[DB] Deleted class {class_id} and all associated data")
            return True
            
        except Exception as e:
            print(f"Error deleting class {class_id}: {e}")
            return False


    # ==================== ENROLLMENT OPERATIONS ====================
    
    def _generate_student_record_id(self) -> int:
        """Generate unique student record ID for a class"""
        return int(datetime.utcnow().timestamp() * 1000)
    
    def get_teacher_name(self, teacher_id: str) -> str:
        """Get teacher name by ID"""
        teacher = self.get_user(teacher_id)
        return teacher.get('name', 'Unknown') if teacher else 'Unknown'
    
    def enroll_student(self, student_id: str, class_id: str, student_info: dict) -> dict:
        """
        Enroll a student in a class.
        - Uses student_id to check if they were enrolled before
        - If re-enrolling, restores their exact same record with all attendance
        - If new, creates new record
        """
        print(f"\n{'='*60}")
        print(f"[ENROLL] Student enrolling")
        print(f"  Student ID: {student_id}")
        print(f"  Class ID: {class_id}")
        print(f"{'='*60}")
        
        # Verify class exists
        class_data = self.get_class_by_id(class_id)
        if not class_data:
            raise ValueError("Class not found")
        
        teacher_id = class_data.get('teacher_id')
        if not teacher_id:
            raise ValueError("Invalid class data")
        
        # Get enrollment file
        enrollment_file = self.get_enrollment_file(class_id)
        enrollments = self.read_json(enrollment_file) or []
        
        print(f"[ENROLL] Found {len(enrollments)} total enrollments")
        
        # Check if ACTIVELY enrolled
        for enrollment in enrollments:
            if enrollment.get('student_id') == student_id and enrollment.get('status') == 'active':
                raise ValueError("You are already enrolled in this class")
        
        # Check if was EVER enrolled before
        previous_enrollment = None
        for enrollment in enrollments:
            if enrollment.get('student_id') == student_id:
                previous_enrollment = enrollment
                print(f"[ENROLL] Found previous enrollment (status: {enrollment.get('status')})")
                break
        
        class_file = self.get_class_file(teacher_id, class_id)
        students = class_data.get('students', [])
        
        if previous_enrollment:
            # RE-ENROLLMENT
            print(f"[RE-ENROLLMENT] Reactivating enrollment")
            student_record_id = previous_enrollment['student_record_id']
            
            # Reactivate enrollment
            previous_enrollment['status'] = 'active'
            previous_enrollment['re_enrolled_at'] = datetime.utcnow().isoformat()
            previous_enrollment['roll_no'] = student_info['rollNo']
            self.write_json(enrollment_file, enrollments)
            
            # Find student record
            student_record = None
            for s in students:
                if s.get('id') == student_record_id:
                    student_record = s
                    break
            
            if student_record:
                attendance_count = len(student_record.get('attendance', {}))
                print(f"[RE-ENROLLMENT] Found record with {attendance_count} attendance entries")
                student_record['rollNo'] = student_info['rollNo']
                student_record['name'] = student_info['name']
            else:
                print(f"[RE-ENROLLMENT] WARNING: Record not found, creating new")
                student_record = {
                    "id": student_record_id,
                    "rollNo": student_info['rollNo'],
                    "name": student_info['name'],
                    "email": student_info['email'],
                    "attendance": {}
                }
                students.append(student_record)
            
            class_data['students'] = students
            self.write_json(class_file, class_data)
            
            # Update student's enrolled_classes
            student_data = self.get_student(student_id)
            if student_data:
                enrolled_classes = student_data.get('enrolled_classes', [])
                class_info = {
                    "class_id": class_id,
                    "class_name": class_data.get('name'),
                    "teacher_name": self.get_teacher_name(teacher_id),
                    "enrolled_at": previous_enrollment.get('enrolled_at'),
                    "re_enrolled_at": previous_enrollment['re_enrolled_at']
                }
                if not any(ec.get('class_id') == class_id for ec in enrolled_classes):
                    enrolled_classes.append(class_info)
                    self.update_student(student_id, {"enrolled_classes": enrolled_classes})
            
            self.update_user_overview(teacher_id)
            
            attendance_count = len(student_record.get('attendance', {}))
            print(f"[RE-ENROLLMENT] ✅ SUCCESS: {attendance_count} records restored")
            print(f"{'='*60}\n")
            
            return {
                "class_id": class_id,
                "student_id": student_id,
                "student_record_id": student_record_id,
                "status": "re-enrolled",
                "message": f"Welcome back! Your {attendance_count} attendance records have been restored."
            }
        else:
            # NEW ENROLLMENT
            print(f"[NEW ENROLLMENT] Creating new enrollment")
            student_record_id = self._generate_student_record_id()
            
            new_enrollment = {
                "student_id": student_id,
                "student_record_id": student_record_id,
                "class_id": class_id,
                "name": student_info['name'],
                "roll_no": student_info['rollNo'],
                "email": student_info['email'],
                "enrolled_at": datetime.utcnow().isoformat(),
                "status": "active"
            }
            
            enrollments.append(new_enrollment)
            self.write_json(enrollment_file, enrollments)
            
            new_student = {
                "id": student_record_id,
                "rollNo": student_info['rollNo'],
                "name": student_info['name'],
                "email": student_info['email'],
                "attendance": {}
            }
            students.append(new_student)
            class_data['students'] = students
            self.write_json(class_file, class_data)
            
            # Update student's enrolled_classes
            student_data = self.get_student(student_id)
            if student_data:
                enrolled_classes = student_data.get('enrolled_classes', [])
                class_info = {
                    "class_id": class_id,
                    "class_name": class_data.get('name'),
                    "teacher_name": self.get_teacher_name(teacher_id),
                    "enrolled_at": new_enrollment['enrolled_at']
                }
                enrolled_classes.append(class_info)
                self.update_student(student_id, {"enrolled_classes": enrolled_classes})
            
            self.update_user_overview(teacher_id)
            
            print(f"[NEW ENROLLMENT] ✅ SUCCESS")
            print(f"{'='*60}\n")
            
            return {
                "class_id": class_id,
                "student_id": student_id,
                "student_record_id": student_record_id,
                "status": "enrolled",
                "message": "Successfully enrolled in class!"
            }
    
    def unenroll_student(self, student_id: str, class_id: str) -> bool:
        """
        Unenroll a student from a class
        - Marks enrollment as 'inactive' (NOT deleted!)
        - Student record stays in class with ALL attendance
        - Teacher won't see them (filtered by get_class)
        """
        print(f"\n{'='*60}")
        print(f"[UNENROLL] Student leaving class")
        print(f"  Student ID: {student_id}")
        print(f"  Class ID: {class_id}")
        print(f"{'='*60}")
        
        try:
            # Get ALL enrollments (not just active)
            enrollment_file = self.get_enrollment_file(class_id)
            all_enrollments = self.read_json(enrollment_file) or []
            
            print(f"[UNENROLL] Found {len(all_enrollments)} total enrollments")
            
            # Find active enrollment
            found = False
            for enrollment in all_enrollments:
                if enrollment.get("student_id") == student_id and enrollment.get("status") == "active":
                    found = True
                    student_record_id = enrollment.get('student_record_id')
                    print(f"[UNENROLL] Found active enrollment (record ID: {student_record_id})")
                    
                    # Check attendance data
                    class_data = self.get_class_by_id(class_id)
                    if class_data:
                        for s in class_data.get('students', []):
                            if s.get('id') == student_record_id:
                                attendance_count = len(s.get('attendance', {}))
                                print(f"[UNENROLL] Student has {attendance_count} attendance records (WILL BE PRESERVED)")
                                break
                    
                    # Mark as INACTIVE (don't delete!)
                    enrollment['status'] = 'inactive'
                    enrollment['unenrolled_at'] = datetime.utcnow().isoformat()
                    print(f"[UNENROLL] ✅ Marked as INACTIVE")
                    break
            
            if not found:
                print(f"[UNENROLL] ❌ Student not actively enrolled")
                return False
            
            # Write back ALL enrollments (including inactive)
            self.write_json(enrollment_file, all_enrollments)
            print(f"[UNENROLL] Saved {len(all_enrollments)} enrollments (including inactive)")
            
            # Remove from student's enrolled_classes list
            student_data = self.get_student(student_id)
            if student_data:
                enrolled_classes = student_data.get("enrolled_classes", [])
                enrolled_classes = [ec for ec in enrolled_classes if ec.get("class_id") != class_id]
                self.update_student(student_id, {"enrolled_classes": enrolled_classes})
                print(f"[UNENROLL] Updated student's enrolled_classes")
            
            # Update teacher overview
            class_data = self.get_class_by_id(class_id)
            if class_data:
                teacher_id = class_data.get("teacher_id")
                if teacher_id:
                    self.update_user_overview(teacher_id)
            
            print(f"[UNENROLL] ✅ SUCCESS: Data preserved, student hidden from teacher")
            print(f"{'='*60}\n")
            return True
            
        except Exception as e:
            print(f"[UNENROLL] ❌ ERROR: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def get_class_enrollments(self, class_id: str) -> List[Dict[str, Any]]:
        """Get all ACTIVE enrollments for a class"""
        enrollment_file = self.get_enrollment_file(class_id)
        all_enrollments = self.read_json(enrollment_file) or []
        
        # Filter to only active
        active_enrollments = [e for e in all_enrollments if e.get('status') == 'active']
        
        return active_enrollments
    
    def get_student_enrollments(self, student_id: str) -> List[Dict[str, Any]]:
        """Get all classes a student is enrolled in"""
        student_data = self.get_student(student_id)
        if not student_data:
            return []
        return student_data.get("enrolled_classes", [])
    
    def get_student_class_details(self, student_id: str, class_id: str) -> Optional[Dict[str, Any]]:
        """Get detailed information about a student's enrollment in a class"""
        print(f"\n[GET_STUDENT_DETAILS] Getting details for student {student_id} in class {class_id}")
        
        # Get class data (RAW - with all students)
        class_data = self.get_class_by_id(class_id)
        if not class_data:
            print(f"[GET_STUDENT_DETAILS] Class not found")
            return None
        
        # Check if student has active enrollment
        enrollments = self.get_class_enrollments(class_id)
        student_enrollment = None
        for e in enrollments:
            if e.get("student_id") == student_id:
                student_enrollment = e
                break
        
        if not student_enrollment:
            print(f"[GET_STUDENT_DETAILS] Student not enrolled (no active enrollment)")
            return None
        
        print(f"[GET_STUDENT_DETAILS] Student has active enrollment")
        
        # Find student record in class
        student_record_id = student_enrollment.get("student_record_id")
        student_record = None
        for student in class_data.get("students", []):
            if student.get("id") == student_record_id:
                student_record = student
                print(f"[GET_STUDENT_DETAILS] Found student record by record_id: {student_record_id}")
                break
        
        if not student_record:
            print(f"[GET_STUDENT_DETAILS] Student record not found in class")
            return None
        
        # ✅ DEBUG: Check attendance data format
        attendance = student_record.get('attendance', {})
        print(f"[GET_STUDENT_DETAILS] Attendance has {len(attendance)} entries")
        
        if attendance:
            first_date = list(attendance.keys())[0]
            first_value = attendance[first_date]
            print(f"[GET_STUDENT_DETAILS] Sample attendance ({first_date}):")
            print(f"  Type: {type(first_value)}")
            print(f"  Value: {first_value}")
            
            if isinstance(first_value, dict):
                if 'sessions' in first_value:
                    print(f"  Format: NEW (sessions array) - {len(first_value['sessions'])} sessions")
                elif 'status' in first_value:
                    print(f"  Format: OLD (count) - {first_value.get('status')} x {first_value.get('count', 1)}")
            elif isinstance(first_value, str):
                print(f"  Format: STRING - {first_value}")
        
        # ✅ Calculate statistics using the fixed function
        statistics = self.calculate_student_statistics(student_record, class_data.get("thresholds"))
        
        print(f"[GET_STUDENT_DETAILS] Calculated statistics:")
        print(f"  Total: {statistics['total_classes']}")
        print(f"  Present: {statistics['present']}")
        print(f"  Absent: {statistics['absent']}")
        print(f"  Late: {statistics['late']}")
        print(f"  Percentage: {statistics['percentage']}%")
        print(f"  Status: {statistics['status']}")
        
        result = {
            "class_id": class_id,
            "class_name": class_data.get("name", ""),
            "teacher_id": class_data.get("teacher_id", ""),
            "student_record": student_record,
            "thresholds": class_data.get("thresholds"),
            "statistics": statistics
        }
        
        print(f"[GET_STUDENT_DETAILS] ✅ Returning class details\n")
        return result

    def calculate_student_statistics(self, student_record: Dict[str, Any], thresholds: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Calculate attendance statistics for a student - SESSION-BASED
        ✅ FIX: Now correctly handles ALL multi-session formats
        """
        if not thresholds:
            thresholds = {
                "excellent": 95.000,
                "good": 90.000,
                "moderate": 85.000,
                "atRisk": 85.000
            }

        attendance = student_record.get("attendance", {})
        
        if not attendance:
            return {
                "total_classes": 0,
                "present": 0,
                "absent": 0,
                "late": 0,
                "percentage": 0.0,
                "status": "no data"
            }
        
        present = 0
        absent = 0
        late = 0
        total = 0
        
        print(f"[STUDENT_STATS] Calculating for {len(attendance)} days")
        
        # ✅ FIX: Handle ALL formats correctly
        for date_key, value in attendance.items():
            if isinstance(value, dict):
                # NEW FORMAT: { sessions: [...], updated_at: "..." }
                if 'sessions' in value:
                    sessions = value['sessions']
                    print(f"[STUDENT_STATS] {date_key}: {len(sessions)} sessions (NEW FORMAT)")
                    for session in sessions:
                        status = session.get('status')
                        if status in ["P", "A", "L"]:
                            total += 1
                            if status == "P":
                                present += 1
                            elif status == "A":
                                absent += 1
                            elif status == "L":
                                late += 1
                # OLD FORMAT: { status: 'P', count: 2 }
                elif 'status' in value:
                    status = value.get('status')
                    count = value.get('count', 1)
                    print(f"[STUDENT_STATS] {date_key}: {count}x {status} (OLD FORMAT)")
                    if status in ["P", "A", "L"]:
                        total += count
                        if status == "P":
                            present += count
                        elif status == "A":
                            absent += count
                        elif status == "L":
                            late += count
            elif isinstance(value, str):
                # SIMPLE STRING FORMAT: 'P', 'A', or 'L'
                print(f"[STUDENT_STATS] {date_key}: {value} (STRING FORMAT)")
                if value in ["P", "A", "L"]:
                    total += 1
                    if value == "P":
                        present += 1
                    elif value == "A":
                        absent += 1
                    elif value == "L":
                        late += 1
        
        percentage = ((present + late) / total * 100) if total > 0 else 0.0
        
        print(f"[STUDENT_STATS] Results: {present}P + {late}L / {total} = {percentage:.3f}%")
        
        if percentage >= thresholds.get("excellent", 95.0):
            status = "excellent"
        elif percentage >= thresholds.get("good", 90.0):
            status = "good"
        elif percentage >= thresholds.get("moderate", 85.0):
            status = "moderate"
        else:
            status = "at risk"
        
        return {
            "total_classes": total,
            "present": present,
            "absent": absent,
            "late": late,
            "percentage": round(percentage, 3),
            "status": status
        }
    
    # ==================== CONTACT OPERATIONS ====================
    
    def save_contact_message(self, email: str, message_data: Dict[str, Any]) -> bool:
        """Save a contact form message"""
        try:
            contact_file = os.path.join(self.contact_dir, "contact.json")
            messages = []
            
            if os.path.exists(contact_file):
                messages = self.read_json(contact_file) or []
            
            message_entry = {
                "email": email,
                "timestamp": datetime.utcnow().isoformat(),
                **message_data
            }
            
            messages.append(message_entry)
            self.write_json(contact_file, messages)
            
            return True
        except Exception as e:
            print(f"Error saving contact message: {e}")
            return False
    
    def get_contact_messages(self, email: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get contact messages, optionally filtered by email"""
        contact_file = os.path.join(self.contact_dir, "contact.json")
        if not os.path.exists(contact_file):
            return []
        
        messages = self.read_json(contact_file) or []
        
        if email:
            messages = [m for m in messages if m.get("email") == email]
        
        return messages

    # ==================== QR CODE SYSTEM ====================

    def get_qr_sessions_dir(self) -> str:
        return os.path.join(self.base_dir, "qr_sessions")

    def ensure_qr_sessions_dir(self):
        os.makedirs(self.get_qr_sessions_dir(), exist_ok=True)

    def get_qr_session_file(self, class_id: str, date: str) -> str:
        self.ensure_qr_sessions_dir()
        # Include date in filename for multiple sessions per day
        return os.path.join(self.base_dir, "qr_sessions", f"class_{class_id}_{date}.json")

    def _generate_qr_code(self) -> str:
        import random, string
        return ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))

    def start_qr_session(self, class_id: str, teacher_id: str, date: str, rotation_interval: int = 5) -> dict:
        """
        Start QR session for a date
        ✅ FIX: Only counts sessions with ACTUAL attendance data
        - Ignores sessions where ALL students have null status
        - If all previous sessions cleared → Starts as Session 1
        """
        print(f"\n{'='*60}")
        print(f"[QR_SESSION] Starting QR session for class {class_id}, date {date}")
        
        class_data = self.get_class_by_id(class_id)
        if not class_data or class_data.get("teacher_id") != teacher_id:
            raise ValueError("Class not found or unauthorized")
        
        # Verify enrollment mode
        enrollment_mode = class_data.get("enrollment_mode", "manual_entry")
        if enrollment_mode != "enrollment_via_id":
            raise ValueError("QR attendance is only available for classes with student enrollment via Class ID")
        
        # ✅ FIX: Count only VALID sessions (with actual attendance data)
        valid_session_count = self._count_valid_sessions_for_date(class_data, date)
        
        # Get existing QR session file
        qr_session_file = self.get_qr_session_file(class_id, date)
        existing_session = self.read_json(qr_session_file)
        
        # Determine session number based on VALID sessions only
        if existing_session and existing_session.get("status") == "active":
            # There's already an active session
            raise ValueError("There is already an active QR session for this date. Please stop it first.")
        else:
            # Start new session with correct number
            session_number = valid_session_count + 1
        
        qr_session_data = {
            "class_id": class_id,
            "teacher_id": teacher_id,
            "date": date,
            "session_number": session_number,
            "started_at": datetime.utcnow().isoformat(),
            "rotation_interval": rotation_interval,
            "current_code": self._generate_qr_code(),
            "code_generated_at": datetime.utcnow().isoformat(),
            "scanned_students": [],
            "status": "active"
        }
        
        self.write_json(qr_session_file, qr_session_data)
        print(f"[QR_SESSION] ✅ Session #{session_number} started (Valid sessions before: {valid_session_count})")
        print(f"[QR_SESSION] Code: {qr_session_data['current_code']}")
        print(f"{'='*60}\n")
        
        return qr_session_data

    def _count_valid_sessions_for_date(self, class_data: dict, date: str) -> int:
        """
        Count sessions with ACTUAL attendance data for a specific date
        ✅ Ignores sessions where all students have null status
        
        Returns: Number of valid sessions (sessions with at least one non-null status)
        """
        print(f"[COUNT_VALID] Counting valid sessions for {date}")
        
        students = class_data.get('students', [])
        if not students:
            print(f"[COUNT_VALID] No students in class")
            return 0
        
        # Check each student's attendance for this date
        max_sessions = 0
        
        for student in students:
            attendance = student.get('attendance', {})
            day_data = attendance.get(date)
            
            if day_data:
                if isinstance(day_data, dict) and 'sessions' in day_data:
                    # NEW FORMAT: Count only non-null sessions
                    sessions = day_data.get('sessions', [])
                    valid_sessions = [s for s in sessions if s.get('status') is not None]
                    session_count = len(valid_sessions)
                    
                    print(f"[COUNT_VALID] Student {student.get('id')}: {session_count} valid sessions (NEW FORMAT)")
                    max_sessions = max(max_sessions, session_count)
                    
                elif isinstance(day_data, dict) and 'status' in day_data:
                    # OLD FORMAT: { status: 'P', count: 2 }
                    if day_data.get('status') is not None:
                        count = day_data.get('count', 1)
                        print(f"[COUNT_VALID] Student {student.get('id')}: {count} sessions (OLD FORMAT)")
                        max_sessions = max(max_sessions, count)
                        
                elif isinstance(day_data, str):
                    # SIMPLE FORMAT: 'P' | 'A' | 'L'
                    print(f"[COUNT_VALID] Student {student.get('id')}: 1 session (STRING FORMAT)")
                    max_sessions = max(max_sessions, 1)
        
        print(f"[COUNT_VALID] ✅ Result: {max_sessions} valid sessions")
        return max_sessions

    def get_qr_session(self, class_id: str, date: str) -> dict:
        """Get active QR session for a class on a specific date"""
        session_file = self.get_qr_session_file(class_id, date)
        session_data = self.read_json(session_file)
        
        if not session_data or session_data.get("status") != "active":
            return None
        
        # Auto-rotate code
        code_time = datetime.fromisoformat(session_data["code_generated_at"])
        elapsed = (datetime.utcnow() - code_time).total_seconds()
        
        if elapsed >= session_data["rotation_interval"]:
            session_data["current_code"] = self._generate_qr_code()
            session_data["code_generated_at"] = datetime.utcnow().isoformat()
            self.write_json(session_file, session_data)
            print(f"[QR] Auto-rotated code for {class_id} on {date}")
        
        return session_data

    # ==================== BACKUP & MAINTENANCE ====================
    
    def backup_user_data(self, user_id: str, backup_dir: str = "backups"):
        """Create a backup of user data"""
        user_dir = self.get_user_dir(user_id)
        if not os.path.exists(user_dir):
            raise ValueError(f"User {user_id} not found")
        
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        backup_path = os.path.join(backup_dir, f"user_{user_id}_{timestamp}")
        shutil.copytree(user_dir, backup_path)
        
        return backup_path
    
    def get_database_stats(self) -> Dict[str, Any]:
        """Get overall database statistics"""
        total_users = len(os.listdir(self.users_dir)) if os.path.exists(self.users_dir) else 0
        total_students = len(os.listdir(self.students_dir)) if os.path.exists(self.students_dir) else 0
        
        total_classes = 0
        total_class_students = 0
        
        if os.path.exists(self.users_dir):
            for user_id in os.listdir(self.users_dir):
                classes = self.get_all_classes(user_id)
                total_classes += len(classes)
                for cls in classes:
                    total_class_students += len(cls.get("students", []))
        
        return {
            "total_users": total_users,
            "total_students": total_students,
            "total_classes": total_classes,
            "total_class_students": total_class_students,
            "timestamp": datetime.utcnow().isoformat()
        }