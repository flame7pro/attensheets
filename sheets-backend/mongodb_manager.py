import json
import os
from typing import Optional, Dict, Any, List
from datetime import datetime
from pymongo import MongoClient, ASCENDING, DESCENDING
from pymongo.errors import DuplicateKeyError, PyMongoError

class MongoDBManager:
    """Manages MongoDB database operations for Lernova Attendsheets"""
    
    def __init__(self, mongo_uri: str, db_name: str = "lernova_db"):
        """
        Initialize MongoDB connection
        
        Args:
            mongo_uri: MongoDB connection URI
            db_name: Name of the database to use
        """
        try:
            self.client = MongoClient(mongo_uri)
            self.db = self.client[db_name]
            
            # Collections
            self.users = self.db['users']
            self.students = self.db['students']
            self.classes = self.db['classes']
            self.enrollments = self.db['enrollments']
            self.contact_messages = self.db['contact_messages']
            self.qr_sessions = self.db['qr_sessions']
            self.attendance_sessions = self.db['attendance_sessions']
            
            # Create indexes for better performance
            self._create_indexes()
            
            print("✅ MongoDB connection established successfully")
        except Exception as e:
            print(f"❌ Failed to connect to MongoDB: {e}")
            raise
    
    def _create_indexes(self):
        """Create database indexes for efficient queries"""
        def _ensure_index(collection, keys, *, unique: bool = False):
            """Create an index if missing; if a conflicting index exists, attempt to fix it."""
            desired_key = list(keys)
            existing = collection.index_information()

            # If an index exists on the same key pattern but with different uniqueness, try to replace it.
            for name, info in existing.items():
                if info.get("key") == desired_key:
                    existing_unique = bool(info.get("unique", False))
                    if unique and not existing_unique:
                        try:
                            collection.drop_index(name)
                        except Exception as drop_err:
                            print(f"⚠️ Warning: Could not drop conflicting index {name}: {drop_err}")
                            return
                    else:
                        return

            try:
                collection.create_index(keys, unique=unique)
            except Exception as create_err:
                # If uniqueness fails due to existing duplicates, don't crash the app.
                print(f"⚠️ Warning: Could not create index {desired_key} (unique={unique}): {create_err}")

        # User indexes
        _ensure_index(self.users, [("email", ASCENDING)], unique=True)
        _ensure_index(self.users, [("id", ASCENDING)], unique=True)

        # Student indexes
        _ensure_index(self.students, [("email", ASCENDING)], unique=True)
        _ensure_index(self.students, [("id", ASCENDING)], unique=True)

        # Class indexes
        # NOTE: Older versions of this app created a UNIQUE index on `class_id`.
        # Our current schema uses `id` for the class primary key. When `class_id` is missing,
        # Mongo treats it as null and the unique index causes inserts to fail with:
        #   E11000 duplicate key error ... dup key: { class_id: null }
        # To keep the app working across existing databases, we drop that legacy index if present.
        try:
            for name, info in self.classes.index_information().items():
                if info.get("key") == [("class_id", 1)]:
                    self.classes.drop_index(name)
        except Exception as e:
            print(f"⚠️ Warning: could not drop legacy classes.class_id index: {e}")

        _ensure_index(self.classes, [("id", ASCENDING), ("teacher_id", ASCENDING)], unique=False)
        _ensure_index(self.classes, [("teacher_id", ASCENDING)], unique=False)

        # Enrollment indexes
        _ensure_index(self.enrollments, [("class_id", ASCENDING)], unique=False)
        _ensure_index(self.enrollments, [("student_id", ASCENDING)], unique=False)
        _ensure_index(self.enrollments, [("class_id", ASCENDING), ("student_id", ASCENDING)], unique=False)

        # QR session indexes
        _ensure_index(self.qr_sessions, [("class_id", ASCENDING), ("date", ASCENDING)], unique=False)

        # Attendance session indexes
        _ensure_index(self.attendance_sessions, [("class_id", ASCENDING)], unique=False)
        _ensure_index(self.attendance_sessions, [("class_id", ASCENDING), ("date", ASCENDING)], unique=False)

        print("✅ MongoDB indexes ensured")
    
    def _class_id_variants(self, class_id: Any) -> List[Any]:
        """Return possible representations of a class id (string/int) to safely query MongoDB."""
        if class_id is None:
            return []

        variants: List[Any] = []

        if isinstance(class_id, str):
            s = class_id.strip()
            variants.append(s)
            try:
                variants.append(int(s))
            except (ValueError, TypeError):
                pass
        else:
            variants.append(class_id)
            variants.append(str(class_id))

        # De-dupe while preserving order (type matters in MongoDB)
        deduped: List[Any] = []
        seen = set()
        for v in variants:
            key = (type(v), v)
            if key in seen:
                continue
            seen.add(key)
            deduped.append(v)

        return deduped

    def _class_filter(self, class_id: Any, teacher_id: Optional[str] = None) -> Dict[str, Any]:
        variants = self._class_id_variants(class_id)
        filt: Dict[str, Any] = {"id": {"$in": variants}} if variants else {"id": class_id}
        if teacher_id is not None:
            filt["teacher_id"] = teacher_id
        return filt

    def _class_rel_id(self, class_id: Any) -> str:
        """Canonical class_id representation for related collections (enrollments/qr_sessions/etc)."""
        return str(class_id).strip()

    def _sort_students_by_roll(self, students: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Sort students by rollNo.

        Rules:
        - numeric roll numbers first (1, 2, 10)
        - then alphanumeric roll numbers (A1, CS-02) using natural-ish ordering
        - then empty/missing roll numbers last
        """
        def key_fn(s: Dict[str, Any]):
            raw = (s.get("rollNo") or "").strip()
            name = (s.get("name") or "").strip().casefold()

            if not raw:
                return (2, float("inf"), "", name)

            if raw.isdigit():
                return (0, int(raw), "", name)

            # For mixed strings, use a tuple that still gives stable ordering
            return (1, float("inf"), raw.casefold(), name)

        return sorted(list(students or []), key=key_fn)

    # ==================== USER OPERATIONS ====================
    
    def create_user(self, user_id: str, email: str, name: str, password_hash: str) -> Dict[str, Any]:
        """Create a new teacher user"""
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
        
        try:
            self.users.insert_one(user_data)
            user_data.pop('_id', None)  # Remove MongoDB _id field
            return user_data
        except DuplicateKeyError:
            raise ValueError("User with this email already exists")
    
    def create_student(self, student_id: str, email: str, name: str, password_hash: str) -> Dict[str, Any]:
        """Create a new student user"""
        student_data = {
            "id": student_id,
            "email": email,
            "name": name,
            "password": password_hash,
            "created_at": datetime.utcnow().isoformat(),
            "verified": True,
            "role": "student",
            "enrolled_classes": [],
            "trusted_devices": []
        }
        
        try:
            self.students.insert_one(student_data)
            student_data.pop('_id', None)
            return student_data
        except DuplicateKeyError:
            raise ValueError("Student with this email already exists")
    
    def get_user(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get user data by user_id"""
        user = self.users.find_one({"id": user_id}, {"_id": 0})
        return user
    
    def get_student(self, student_id: str) -> Optional[Dict[str, Any]]:
        """Get student data by student_id"""
        student = self.students.find_one({"id": student_id}, {"_id": 0})
        return student
    
    def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        """Get user by email (teachers)"""
        user = self.users.find_one({"email": email}, {"_id": 0})
        return user
    
    def get_student_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        """Get student by email"""
        student = self.students.find_one({"email": email}, {"_id": 0})
        return student
    
    def update_user(self, user_id: str, **updates) -> Dict[str, Any]:
        """Update user data"""
        user_data = self.get_user(user_id)
        if not user_data:
            raise ValueError(f"User {user_id} not found")
        
        updates["updated_at"] = datetime.utcnow().isoformat()
        self.users.update_one({"id": user_id}, {"$set": updates})
        
        return self.get_user(user_id)
    
    def update_student(self, student_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        """Update student data"""
        student_data = self.get_student(student_id)
        if not student_data:
            raise ValueError(f"Student {student_id} not found")
        
        updates["updated_at"] = datetime.utcnow().isoformat()
        self.students.update_one({"id": student_id}, {"$set": updates})
        
        return self.get_student(student_id)
    
    def delete_user(self, user_id: str) -> bool:
        """Delete user and all associated data"""
        try:
            # Get all classes for this user
            classes = list(self.classes.find({"teacher_id": user_id}, {"_id": 0}))
            
            # Clean up enrollments for each class
            for cls in classes:
                class_id = str(cls.get("id"))
                
                # Get all enrollments for this class
                enrollments = list(self.enrollments.find({"class_id": class_id}))
                
                # Update each enrolled student
                for enrollment in enrollments:
                    student_id = enrollment.get("student_id")
                    if student_id:
                        student = self.get_student(student_id)
                        if student:
                            enrolled_classes = student.get("enrolled_classes", [])
                            enrolled_classes = [ec for ec in enrolled_classes if ec.get("class_id") != class_id]
                            self.update_student(student_id, {"enrolled_classes": enrolled_classes})
                
                # Delete all enrollments for this class
                self.enrollments.delete_many({"class_id": class_id})
                
                # Delete QR sessions for this class
                self.qr_sessions.delete_many({"class_id": class_id})
                
                # Delete attendance sessions for this class
                self.attendance_sessions.delete_many({"class_id": class_id})
            
            # Delete all classes
            self.classes.delete_many({"teacher_id": user_id})
            
            # Delete user
            result = self.users.delete_one({"id": user_id})
            
            return result.deleted_count > 0
        except Exception as e:
            print(f"Error deleting user {user_id}: {e}")
            return False
    
    def delete_student(self, student_id: str) -> bool:
        """Delete student account and all their data"""
        print(f"\n[DELETE_STUDENT] Starting deletion for student {student_id}")
        try:
            student_data = self.get_student(student_id)
            if not student_data:
                print(f"[DELETE_STUDENT] Student {student_id} not found")
                return False
            
            enrolled_classes = student_data.get("enrolled_classes", [])
            print(f"[DELETE_STUDENT] Student is enrolled in {len(enrolled_classes)} classes")
            
            # Clean up enrollments
            for enrollment_info in enrolled_classes:
                class_id = enrollment_info.get("class_id")
                if not class_id:
                    continue
                
                print(f"[DELETE_STUDENT] Processing class {class_id}")
                
                # Delete enrollment records
                self.enrollments.delete_many({"student_id": student_id, "class_id": class_id})
                
                # Update teacher overview
                class_data = self.get_class_by_id(class_id)
                if class_data:
                    teacher_id = class_data.get("teacher_id")
                    if teacher_id:
                        self.update_user_overview(teacher_id)
            
            # Delete student
            result = self.students.delete_one({"id": student_id})
            
            print(f"[DELETE_STUDENT] ✅ Successfully deleted student {student_id}\n")
            return result.deleted_count > 0
        except Exception as e:
            print(f"[DELETE_STUDENT] ❌ ERROR: {e}")
            return False
    
    def update_user_overview(self, user_id: str):
        """Update user overview statistics"""
        user_data = self.get_user(user_id)
        if not user_data:
            return
        
        classes = self.get_all_classes(user_id)
        
        total_students = 0
        for cls in classes:
            total_students += len(cls.get('students', []))
        
        overview = {
            "totalClasses": len(classes),
            "totalStudents": total_students,
            "lastUpdated": datetime.utcnow().isoformat()
        }
        
        self.update_user(user_id, overview=overview)
    
    # ==================== CLASS OPERATIONS ====================
    
    def create_class(self, user_id: str, class_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new class"""
        # Keep the original ID type (int or string) from frontend
        class_id = class_data["id"]
        enrollment_mode = class_data.get("enrollment_mode", "manual_entry")
        
        print(f"\n[CREATE_CLASS] Creating class")
        print(f"  Class ID: {class_id} (type: {type(class_id)})")
        print(f"  User ID: {user_id}")
        print(f"  Enrollment mode: {enrollment_mode}")
        
        # Always keep students stored roll-number sorted.
        students_sorted = self._sort_students_by_roll(class_data.get("students", []))

        full_class_data = {
            **class_data,
            "students": students_sorted,
            "id": class_id,  # Preserve original type
            # Keep a string version as well for backward compatibility with older DBs / indexes
            "class_id": self._class_rel_id(class_id),
            "teacher_id": user_id,
            "enrollment_mode": enrollment_mode,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
            "statistics": self.calculate_class_statistics({**class_data, "students": students_sorted}, str(class_id))
        }
        
        # Insert class. Some older DBs have a UNIQUE index on `class_id` which breaks inserts when
        # documents omit that field (treated as null). We try to self-heal and retry once.
        try:
            self.classes.insert_one(full_class_data.copy())
        except DuplicateKeyError as e:
            msg = str(e)
            if "class_id" in msg and ("null" in msg or "None" in msg):
                try:
                    for name, info in self.classes.index_information().items():
                        if info.get("key") == [("class_id", 1)]:
                            self.classes.drop_index(name)
                except Exception as drop_err:
                    print(f"⚠️ Warning: could not drop legacy class_id index during create_class retry: {drop_err}")
                # Retry insert once after dropping the bad index
                self.classes.insert_one(full_class_data.copy())
            else:
                raise

        self.update_user_overview(user_id)
        
        full_class_data.pop('_id', None)
        print(f"[CREATE_CLASS] Class created successfully\n")
        return full_class_data
    
    def get_class(self, user_id: str, class_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific class"""
        cls = self.classes.find_one(self._class_filter(class_id, teacher_id=user_id), {"_id": 0})
        if not cls:
            return None

        # Handle enrollment modes
        enrollment_mode = cls.get("enrollment_mode", "manual_entry")
        is_link_based = enrollment_mode in ("link_based_enrollment", "enrollment_via_id")

        if is_link_based:
            # Only show active enrolled students
            rel_class_id = self._class_rel_id(cls.get("id"))
            enrollments = list(self.enrollments.find({"class_id": rel_class_id, "status": "active"}))
            active_student_ids = {e.get("student_record_id") for e in enrollments}

            all_students = cls.get("students", [])
            cls["students"] = [s for s in all_students if s.get("id") in active_student_ids]

        # Always return roll-number sorted
        cls["students"] = self._sort_students_by_roll(cls.get("students", []))
        return cls
    
    def get_class_by_id(self, class_id: str) -> Optional[Dict[str, Any]]:
        """Get class by class_id only (for internal use)"""
        cls = self.classes.find_one(self._class_filter(class_id), {"_id": 0})
        if cls and isinstance(cls, dict):
            cls["students"] = self._sort_students_by_roll(cls.get("students", []))
        return cls
    
    def get_all_classes(self, user_id: str) -> List[Dict[str, Any]]:
        """Get all classes for a user"""
        classes = list(self.classes.find({"teacher_id": user_id}, {"_id": 0}))

        # Filter students based on enrollment mode
        for cls in classes:
            enrollment_mode = cls.get("enrollment_mode", "manual_entry")
            is_link_based = enrollment_mode in ("link_based_enrollment", "enrollment_via_id")

            if is_link_based:
                rel_class_id = self._class_rel_id(cls.get("id"))
                enrollments = list(self.enrollments.find({"class_id": rel_class_id, "status": "active"}))
                active_student_ids = {e.get("student_record_id") for e in enrollments}

                all_students = cls.get("students", [])
                cls["students"] = [s for s in all_students if s.get("id") in active_student_ids]

            cls["students"] = self._sort_students_by_roll(cls.get("students", []))

        return classes
    
    def update_class(self, user_id: str, class_id: str, class_data: Dict[str, Any]) -> Dict[str, Any]:
        """Update a class"""
        print(f"\n[UPDATE_CLASS] Attempting to update class")
        print(f"  User ID: {user_id}")
        print(f"  Class ID (path): {class_id} (type: {type(class_id)})")
        print(f"  Class data ID (body): {class_data.get('id')} (type: {type(class_data.get('id'))})")

        existing_class = self.classes.find_one(
            self._class_filter(class_id, teacher_id=user_id),
            {"_id": 0}
        )

        if not existing_class:
            all_classes = list(self.classes.find({"teacher_id": user_id}, {"id": 1, "name": 1, "_id": 0}))
            print(f"[UPDATE_CLASS] Available classes for user {user_id}:")
            for c in all_classes:
                print(f"  - ID: {c.get('id')} (type: {type(c.get('id'))}), Name: {c.get('name')}")
            raise ValueError(f"Class not found - ID: {class_id}, User: {user_id}")

        stored_class_id = existing_class.get("id")
        rel_class_id = self._class_rel_id(stored_class_id)

        print(f"[UPDATE_CLASS] Class found successfully")
        print(f"  Stored class ID: {stored_class_id} (type: {type(stored_class_id)})")

        # Handle student deletions - use ALL students from database, not filtered
        old_student_ids = {s.get("id") for s in existing_class.get("students", [])}
        new_student_ids = {s.get("id") for s in class_data.get("students", [])}
        deleted_student_ids = old_student_ids - new_student_ids

        if deleted_student_ids:
            for student_id in deleted_student_ids:
                self.enrollments.update_many(
                    {"class_id": rel_class_id, "student_record_id": student_id},
                    {"$set": {"status": "inactive", "unenrolled_at": datetime.utcnow().isoformat()}}
                )

        # Preserve enrollment_mode from existing class
        if "enrollment_mode" not in class_data and "enrollment_mode" in existing_class:
            class_data["enrollment_mode"] = existing_class["enrollment_mode"]

        # Keep stored students sorted by roll number
        class_data["students"] = self._sort_students_by_roll(class_data.get("students", []))

        class_data["updated_at"] = datetime.utcnow().isoformat()
        class_data["teacher_id"] = user_id
        class_data["id"] = stored_class_id
        class_data["statistics"] = self.calculate_class_statistics(class_data, rel_class_id)

        print(f"[UPDATE_CLASS] Updating MongoDB with stored class_id: {stored_class_id} (type: {type(stored_class_id)})")

        result = self.classes.update_one(
            {"teacher_id": user_id, "id": stored_class_id},
            {"$set": class_data}
        )

        print(f"[UPDATE_CLASS] MongoDB update result: matched={result.matched_count}, modified={result.modified_count}")

        self.update_user_overview(user_id)

        print(f"[UPDATE_CLASS] Update completed successfully\n")
        return self.get_class(user_id, stored_class_id)
    
    def delete_class(self, user_id: str, class_id: str) -> bool:
        """Delete a class"""
        try:
            class_doc = self.classes.find_one(self._class_filter(class_id, teacher_id=user_id), {"_id": 0, "id": 1})
            if not class_doc:
                return False

            stored_class_id = class_doc.get("id")
            rel_class_id = self._class_rel_id(stored_class_id)

            # Delete enrollments / sessions (these collections store class_id as string)
            self.enrollments.delete_many({"class_id": rel_class_id})
            self.qr_sessions.delete_many({"class_id": rel_class_id})
            self.attendance_sessions.delete_many({"class_id": rel_class_id})

            # Delete class (classes collection stores id as int/int64)
            result = self.classes.delete_one({"teacher_id": user_id, "id": stored_class_id})

            if result.deleted_count > 0:
                self.update_user_overview(user_id)
                return True
            return False
        except Exception as e:
            print(f"Error deleting class: {e}")
            return False
    
    def calculate_class_statistics(self, class_data: Dict[str, Any], class_id: str) -> Dict[str, Any]:
        """Calculate class statistics"""
        students = class_data.get("students", [])
        total_students = len(students)
        
        if total_students == 0:
            return {
                "totalStudents": 0,
                "averageAttendance": 0,
                "totalSessions": 0
            }
        
        # Calculate attendance statistics
        total_attendance_sum = 0
        students_with_attendance = 0
        total_sessions = 0
        
        for student in students:
            attendance = student.get("attendance", {})
            if attendance:
                present_count = sum(1 for v in attendance.values() if v == "P" or (isinstance(v, dict) and any(s.get("status") == "P" for s in v.get("sessions", []))))
                total_days = len(attendance)
                if total_days > 0:
                    total_attendance_sum += (present_count / total_days) * 100
                    students_with_attendance += 1
                    total_sessions = max(total_sessions, total_days)
        
        average_attendance = (total_attendance_sum / students_with_attendance) if students_with_attendance > 0 else 0
        
        return {
            "totalStudents": total_students,
            "averageAttendance": round(average_attendance, 2),
            "totalSessions": total_sessions
        }
    
    # ==================== ENROLLMENT OPERATIONS ====================
    
    def enroll_student(self, student_id: str, class_id: str, student_info: Dict[str, Any]) -> Dict[str, Any]:
        """Enroll a student in a class"""
        # Check if student exists
        student = self.get_student(student_id)
        if not student:
            raise ValueError("Student not found")
        
        # Check if class exists
        class_data = self.get_class_by_id(class_id)
        if not class_data:
            raise ValueError("Class not found")
        
        teacher_id = class_data.get("teacher_id")
        
        rel_class_id = self._class_rel_id(class_data.get("id"))

        # Check for existing enrollment
        existing_enrollment = self.enrollments.find_one({
            "student_id": student_id,
            "class_id": rel_class_id,
            "status": "active"
        })
        
        if existing_enrollment:
            raise ValueError("Student already enrolled in this class")
        
        # Check for previous inactive enrollment
        previous_enrollment = self.enrollments.find_one({
            "student_id": student_id,
            "class_id": rel_class_id,
            "status": "inactive"
        })
        
        if previous_enrollment:
            # Reactivate enrollment
            student_record_id = previous_enrollment.get("student_record_id")
            self.enrollments.update_one(
                {"_id": previous_enrollment["_id"]},
                {"$set": {"status": "active", "enrolled_at": datetime.utcnow().isoformat()}}
            )
            
            message = "Re-enrolled in class (previous data preserved)"
        else:
            # Create new enrollment
            student_record_id = f"{rel_class_id}_student_{len(class_data.get('students', [])) + 1}"
            
            # Add student to class (keep list sorted by rollNo)
            new_student = {
                "id": student_record_id,
                "name": student_info.get("name"),
                "rollNo": student_info.get("rollNo"),
                "email": student_info.get("email"),
                "attendance": {}
            }

            # Fetch, append, sort, and write back
            class_doc = self.classes.find_one(self._class_filter(class_data.get("id")), {"_id": 0, "students": 1, "id": 1})
            students = (class_doc or {}).get("students", [])
            students.append(new_student)
            students = self._sort_students_by_roll(students)

            self.classes.update_one(
                self._class_filter(class_data.get("id")),
                {"$set": {"students": students, "updated_at": datetime.utcnow().isoformat()}}
            )
            
            # Create enrollment record
            enrollment = {
                "student_id": student_id,
                "class_id": rel_class_id,
                "student_record_id": student_record_id,
                "status": "active",
                "enrolled_at": datetime.utcnow().isoformat()
            }
            
            self.enrollments.insert_one(enrollment)
            
            message = "Successfully enrolled in class"
        
        # Update student's enrolled classes
        enrolled_classes = student.get("enrolled_classes", [])
        if not any(ec.get("class_id") == rel_class_id for ec in enrolled_classes):
            enrolled_classes.append({
                "class_id": rel_class_id,
                "class_name": class_data.get("name"),
                "teacher_id": teacher_id,
                "enrolled_at": datetime.utcnow().isoformat()
            })
            self.update_student(student_id, {"enrolled_classes": enrolled_classes})
        
        # Update teacher overview
        self.update_user_overview(teacher_id)
        
        return {
            "success": True,
            "message": message,
            "student_record_id": student_record_id
        }
    
    def unenroll_student(self, student_id: str, class_id: str) -> bool:
        """Unenroll a student from a class"""
        enrollment = self.enrollments.find_one({
            "student_id": student_id,
            "class_id": class_id,
            "status": "active"
        })
        
        if not enrollment:
            return False
        
        # Mark enrollment as inactive
        self.enrollments.update_one(
            {"_id": enrollment["_id"]},
            {"$set": {"status": "inactive", "unenrolled_at": datetime.utcnow().isoformat()}}
        )
        
        # Update student's enrolled classes
        student = self.get_student(student_id)
        if student:
            enrolled_classes = student.get("enrolled_classes", [])
            enrolled_classes = [ec for ec in enrolled_classes if ec.get("class_id") != class_id]
            self.update_student(student_id, {"enrolled_classes": enrolled_classes})
        
        # Update teacher overview
        class_data = self.get_class_by_id(class_id)
        if class_data:
            teacher_id = class_data.get("teacher_id")
            if teacher_id:
                self.update_user_overview(teacher_id)
        
        return True
    
    def get_student_enrollments(self, student_id: str) -> List[Dict[str, Any]]:
        """Get all active enrollments for a student"""
        enrollments = list(self.enrollments.find(
            {"student_id": student_id, "status": "active"},
            {"_id": 0}
        ))
        return enrollments
    
    def calculate_student_statistics(self, student_record: Dict[str, Any], thresholds: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """Calculate attendance statistics for a student (session-aware, matches file-based behavior)."""
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

        for _date_key, value in attendance.items():
            if isinstance(value, dict):
                # NEW FORMAT: { sessions: [...], updated_at: "..." }
                if 'sessions' in value and isinstance(value.get('sessions'), list):
                    sessions = value.get('sessions') or []
                    for session in sessions:
                        status = (session or {}).get('status')
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
                    if status in ["P", "A", "L"]:
                        try:
                            count_int = int(count)
                        except Exception:
                            count_int = 1
                        total += count_int
                        if status == "P":
                            present += count_int
                        elif status == "A":
                            absent += count_int
                        elif status == "L":
                            late += count_int
            elif isinstance(value, str):
                if value in ["P", "A", "L"]:
                    total += 1
                    if value == "P":
                        present += 1
                    elif value == "A":
                        absent += 1
                    elif value == "L":
                        late += 1

        percentage = ((present + late) / total * 100) if total > 0 else 0.0

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

    def get_student_class_details(self, student_id: str, class_id: str) -> Optional[Dict[str, Any]]:
        """Get detailed class information for a student (shape matches file-based API)."""
        enrollment = self.enrollments.find_one({
            "student_id": student_id,
            "class_id": class_id,
            "status": "active"
        })

        if not enrollment:
            return None

        class_data = self.get_class_by_id(class_id)
        if not class_data:
            return None

        student_record_id = enrollment.get("student_record_id")

        # Find student record in class
        student_record = None
        for s in class_data.get("students", []):
            if s.get("id") == student_record_id:
                student_record = s
                break

        if not student_record:
            return None

        thresholds = class_data.get("thresholds")
        statistics = self.calculate_student_statistics(student_record, thresholds)

        teacher_id = class_data.get("teacher_id")
        teacher_name = "Unknown"
        if teacher_id:
            teacher = self.get_user(teacher_id)
            if teacher:
                teacher_name = teacher.get("name", "Unknown")

        return {
            "class_id": class_id,
            "class_name": class_data.get("name", ""),
            "teacher_id": teacher_id,
            "teacher_name": teacher_name,
            "student_record": student_record,
            "thresholds": thresholds,
            "statistics": statistics
        }
    
    # ==================== QR SESSION OPERATIONS ====================
    
    def get_qr_session_file(self, class_id: str, date: str) -> str:
        """Get QR session identifier (for compatibility)"""
        return f"qr_{class_id}_{date}"
    
    def start_qr_session(self, class_id: str, teacher_id: str, date: str, rotation_interval: int = 5) -> Dict[str, Any]:
        """Start a QR attendance session"""
        import random
        import string

        rel_class_id = self._class_rel_id(class_id)
        class_id_variants = self._class_id_variants(class_id)

        # Check for existing active session (handle old numeric class_id values too)
        existing_session = self.qr_sessions.find_one({
            "class_id": {"$in": class_id_variants},
            "date": date,
            "status": "active"
        }, {"_id": 0})

        if existing_session:
            raise ValueError("An active QR session already exists for this date")

        # Generate QR code
        qr_code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))

        # Determine session number
        previous_sessions = list(self.qr_sessions.find({
            "class_id": {"$in": class_id_variants},
            "date": date
        }).sort("session_number", DESCENDING).limit(1))

        session_number = 1
        if previous_sessions:
            session_number = previous_sessions[0].get("session_number", 0) + 1

        now_iso = datetime.utcnow().isoformat()

        # Store class_id as STRING for cross-device consistency
        session_data = {
            "class_id": rel_class_id,
            "teacher_id": teacher_id,
            "date": date,
            "status": "active",
            "current_code": qr_code,
            "rotation_interval": int(rotation_interval) if rotation_interval is not None else 5,
            "session_number": session_number,
            "scanned_students": [],
            "started_at": now_iso,
            # keep both keys for compatibility
            "last_rotation": now_iso,
            "code_generated_at": now_iso
        }

        self.qr_sessions.insert_one(session_data.copy())
        session_data.pop('_id', None)

        return session_data

    def _maybe_rotate_qr_session(self, session: Dict[str, Any]) -> Dict[str, Any]:
        """Rotate current_code if the rotation interval has elapsed."""
        import random
        import string

        rotation_interval = session.get("rotation_interval", 5)
        try:
            rotation_interval = int(rotation_interval)
        except Exception:
            rotation_interval = 5

        # Determine last rotation timestamp
        last_rotation_raw = session.get("last_rotation") or session.get("code_generated_at") or session.get("started_at")

        def _parse_iso(value: Any) -> datetime:
            if isinstance(value, datetime):
                return value
            s = str(value) if value is not None else ""
            # Accept both "...Z" and non-Z ISO strings
            if s.endswith("Z"):
                s = s[:-1]
            try:
                return datetime.fromisoformat(s)
            except Exception:
                return datetime.utcnow()

        last_rotation_dt = _parse_iso(last_rotation_raw)

        elapsed = (datetime.utcnow() - last_rotation_dt).total_seconds()
        if elapsed < rotation_interval:
            return session

        new_code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
        now_iso = datetime.utcnow().isoformat()

        self.qr_sessions.update_one(
            {"class_id": session.get("class_id"), "date": session.get("date"), "status": "active"},
            {"$set": {"current_code": new_code, "last_rotation": now_iso, "code_generated_at": now_iso}}
        )

        session["current_code"] = new_code
        session["last_rotation"] = now_iso
        session["code_generated_at"] = now_iso
        return session

    def get_qr_session(self, class_id: str, date: str) -> Optional[Dict[str, Any]]:
        """Get active QR session (auto-rotates code based on interval)."""
        class_id_variants = self._class_id_variants(class_id)
        session = self.qr_sessions.find_one({
            "class_id": {"$in": class_id_variants},
            "date": date,
            "status": "active"
        }, {"_id": 0})

        if not session:
            return None

        # Auto-rotate if needed
        session = self._maybe_rotate_qr_session(session)
        return session
    
    def stop_qr_session(self, class_id: str, teacher_id: str, date: str) -> Dict[str, Any]:
        """Stop QR session and mark absent students"""
        rel_class_id = self._class_rel_id(class_id)
        session = self.get_qr_session(rel_class_id, date)
        
        if not session or session.get("status") != "active":
            raise ValueError("No active session")
        
        if session.get("teacher_id") != teacher_id:
            raise ValueError("Unauthorized")
        
        qr_session_number = session.get("session_number", 1)
        scanned_ids = set(session.get("scanned_students", []))
        
        print(f"[QR_STOP] Stopping QR Session #{qr_session_number}")
        
        # Get all active enrollments (enrollments store class_id as string)
        rel_class_id = self._class_rel_id(class_id)
        enrollments = list(self.enrollments.find({
            "class_id": rel_class_id,
            "status": "active"
        }))
        
        active_student_ids = {e.get("student_record_id") for e in enrollments}
        
        # Get class data
        class_data = self.get_class_by_id(class_id)
        students = class_data.get('students', [])
        
        # Mark absent for non-scanned students
        marked_absent = 0
        for student in students:
            student_record_id = student.get('id')
            if student_record_id in active_student_ids and student_record_id not in scanned_ids:
                if 'attendance' not in student:
                    student['attendance'] = {}
                
                current_value = student['attendance'].get(date)
                
                if qr_session_number == 1:
                    student['attendance'][date] = 'A'
                else:
                    # Build or update sessions array
                    if isinstance(current_value, str) or current_value is None:
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
                    elif isinstance(current_value, dict) and 'sessions' in current_value:
                        sessions = current_value.get('sessions', [])
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
                
                marked_absent += 1
        
        # Update class in database
        self.classes.update_one(
            self._class_filter(class_data.get("id"), teacher_id=teacher_id),
            {"$set": {"students": students, "updated_at": datetime.utcnow().isoformat()}}
        )
        
        # Close QR session (use the stored class_id type from the session doc)
        session_class_id = session.get("class_id", self._class_rel_id(class_id))
        self.qr_sessions.update_one(
            {"class_id": session_class_id, "date": date, "status": "active"},
            {"$set": {"status": "stopped", "stopped_at": datetime.utcnow().isoformat()}}
        )
        
        return {
            "success": True,
            "scanned_count": len(scanned_ids),
            "absent_count": marked_absent,
            "date": date,
            "session_number": qr_session_number
        }
    
    def scan_qr_code(self, student_id: str, class_id: str, qr_code: str, date: str) -> Dict[str, Any]:
        """Process QR code scan by student"""
        print(f"\n[DB_QR_SCAN] Processing QR scan")
        print(f"  Student ID: {student_id}")
        print(f"  Class ID: {class_id}")
        print(f"  Date: {date}")
        
        # Load QR session
        session = self.get_qr_session(class_id, date)
        
        if not session or session.get("status") != "active":
            raise ValueError("No active QR session")
        
        # Validate QR code
        try:
            qr_data = json.loads(qr_code)
            qr_code_value = qr_data.get("code")
        except:
            qr_code_value = qr_code
        
        if session.get("current_code") != qr_code_value:
            raise ValueError("Invalid or expired QR code")
        
        qr_session_number = session.get("session_number", 1)
        print(f"[DB_QR_SCAN] QR Session Number: {qr_session_number}")
        
        # Find enrollment
        rel_class_id = self._class_rel_id(class_id)
        enrollment = self.enrollments.find_one({
            "student_id": student_id,
            "class_id": rel_class_id,
            "status": "active"
        })
        
        if not enrollment:
            raise ValueError("Student not actively enrolled in this class")
        
        student_record_id = enrollment.get("student_record_id")
        
        # Get class data
        class_data = self.get_class_by_id(class_id)
        if not class_data:
            raise ValueError("Class not found")
        
        # Find student record
        students = class_data.get('students', [])
        student_record = None
        student_index = None
        for idx, s in enumerate(students):
            if s.get('id') == student_record_id:
                student_record = s
                student_index = idx
                break
        
        if not student_record:
            raise ValueError("Student record not found")
        
        # Initialize attendance
        if 'attendance' not in student_record:
            student_record['attendance'] = {}
        
        current_value = student_record['attendance'].get(date)
        
        # Update attendance based on session number
        if qr_session_number == 1:
            student_record['attendance'][date] = 'P'
            print(f"[DB_QR_SCAN] Session 1: Marked 'P' in main sheet")
        else:
            # Second+ session - need sessions array
            if current_value is None or isinstance(current_value, str):
                sessions = []
                for i in range(1, qr_session_number + 1):
                    sessions.append({
                        "id": f"session_{i}",
                        "name": f"QR Session {i}",
                        "status": current_value if (i == 1 and isinstance(current_value, str)) else "A" if i < qr_session_number else "P"
                    })
                student_record['attendance'][date] = {
                    "sessions": sessions,
                    "updated_at": datetime.utcnow().isoformat()
                }
            elif isinstance(current_value, dict) and 'sessions' in current_value:
                sessions = current_value.get('sessions', [])
                existing_ids = {s.get('id') for s in sessions}
                
                for i in range(1, qr_session_number + 1):
                    session_id = f"session_{i}"
                    if session_id not in existing_ids:
                        sessions.insert(i - 1, {
                            "id": session_id,
                            "name": f"QR Session {i}",
                            "status": "P" if i == qr_session_number else "A"
                        })
                
                for s in sessions:
                    if s.get('id') == f"session_{qr_session_number}":
                        s['status'] = 'P'
                        break
                
                student_record['attendance'][date] = {
                    "sessions": sessions,
                    "updated_at": datetime.utcnow().isoformat()
                }
        
        # Update in database
        students[student_index] = student_record
        self.classes.update_one(
            self._class_filter(class_data.get("id"), teacher_id=class_data.get("teacher_id")),
            {"$set": {"students": students}}
        )
        
        # Record scan in session
        scanned = session.get("scanned_students", [])
        if student_record_id not in scanned:
            scanned.append(student_record_id)
        
        self.qr_sessions.update_one(
            {"class_id": session.get("class_id", rel_class_id), "date": date, "status": "active"},
            {"$set": {
                "scanned_students": scanned,
                "last_scan_at": datetime.utcnow().isoformat()
            }}
        )
        
        print(f"[DB_QR_SCAN] ✅ SUCCESS - Session #{qr_session_number}")
        
        return {
            "success": True,
            "message": f"Attendance marked as Present (Session #{qr_session_number})",
            "scan_count": qr_session_number,
            "session_number": qr_session_number,
            "date": date
        }
    
    # ==================== ATTENDANCE SESSION OPERATIONS ====================
    
    def create_attendance_session(self, user_id: str, class_id: str, session_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create attendance session"""
        import random
        import string
        
        session_id = f"session_{''.join(random.choices(string.ascii_lowercase + string.digits, k=8))}"
        
        full_session_data = {
            **session_data,
            "id": session_id,
            "created_at": datetime.utcnow().isoformat()
        }
        
        self.attendance_sessions.insert_one(full_session_data.copy())
        full_session_data.pop('_id', None)
        
        return full_session_data
    
    def get_class_sessions(self, user_id: str, class_id: str, date: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get all sessions for a class"""
        query = {"class_id": class_id}
        if date:
            query["date"] = date
        
        sessions = list(self.attendance_sessions.find(query, {"_id": 0}))
        return sessions
    
    def delete_attendance_session(self, user_id: str, class_id: str, session_id: str) -> bool:
        """Delete attendance session"""
        result = self.attendance_sessions.delete_one({"id": session_id, "class_id": class_id})
        return result.deleted_count > 0
    
    # ==================== CONTACT OPERATIONS ====================
    
    def save_contact_message(self, email: str, message_data: Dict[str, Any]) -> bool:
        """Save contact form message"""
        try:
            contact_data = {
                "email": email,
                **message_data,
                "created_at": datetime.utcnow().isoformat()
            }
            
            self.contact_messages.insert_one(contact_data)
            return True
        except Exception as e:
            print(f"Error saving contact message: {e}")
            return False
    
    # ==================== DATABASE STATS ====================
    
    def get_database_stats(self) -> Dict[str, Any]:
        """Get database statistics"""
        return {
            "database": "mongodb",
            "users": self.users.count_documents({}),
            "students": self.students.count_documents({}),
            "classes": self.classes.count_documents({}),
            "enrollments": self.enrollments.count_documents({}),
            "active_qr_sessions": self.qr_sessions.count_documents({"status": "active"}),
            "contact_messages": self.contact_messages.count_documents({})
        }
    
    # ==================== COMPATIBILITY METHODS (for file-based API) ====================
    
    def get_class_file(self, user_id: str, class_id: str) -> str:
        """Compatibility method - returns a class identifier for MongoDB.

        NOTE: This is *not* a real file path; it's an opaque identifier used by legacy endpoints
        that were written for file storage.
        """
        return f"mongodb_class|{user_id}|{class_id}"

    def _parse_mongodb_class_ref(self, ref: str) -> Optional[Dict[str, str]]:
        """Parse our compatibility class ref string into {user_id, class_id}."""
        if ref.startswith("mongodb_class|"):
            parts = ref.split("|", 2)
            if len(parts) != 3:
                return None
            _, user_id, class_id = parts
            return {"user_id": user_id, "class_id": class_id}

        # Back-compat: old format used underscores, which breaks because user_id contains '_'.
        if ref.startswith("mongodb_class_"):
            rest = ref.replace("mongodb_class_", "", 1)
            pieces = rest.split("_")
            if len(pieces) < 2:
                return None
            class_id = pieces[-1]
            user_id = "_".join(pieces[:-1])
            return {"user_id": user_id, "class_id": class_id}

        return None

    def read_json(self, file_path: str) -> Optional[Dict[Any, Any]]:
        """Compatibility method - reads class from MongoDB instead of file"""
        parsed = self._parse_mongodb_class_ref(file_path)
        if not parsed:
            return None

        user_id = parsed["user_id"]
        class_id = parsed["class_id"]

        return self.classes.find_one(self._class_filter(class_id, teacher_id=user_id), {"_id": 0})
    
    def write_json(self, file_path: str, data: Dict[Any, Any]):
        """Compatibility method - writes class to MongoDB instead of file"""
        parsed = self._parse_mongodb_class_ref(file_path)
        if not parsed:
            raise ValueError(f"Invalid file path: {file_path}")

        user_id = parsed["user_id"]
        class_id = parsed["class_id"]

        existing = self.classes.find_one(self._class_filter(class_id, teacher_id=user_id), {"_id": 0, "id": 1})
        if not existing:
            raise ValueError(f"Class not found - ID: {class_id}, User: {user_id}")

        stored_class_id = existing.get("id")

        data["updated_at"] = datetime.utcnow().isoformat()
        data["teacher_id"] = user_id
        data["id"] = stored_class_id

        self.classes.update_one(
            {"teacher_id": user_id, "id": stored_class_id},
            {"$set": data}
        )

    # ==========================================
    # VERIFICATION CODES METHODS
    # ==========================================
    
    def store_verification_code(self, email: str, code: str, data: Dict[str, Any]) -> None:
        """
        Store verification code in MongoDB (replaces in-memory dict)
        
        Args:
            email: User's email address
            code: 6-digit verification code
            data: Additional data (name, password, role, device_info, etc.)
        """
        verification_data = {
            "email": email,
            "code": code,
            "created_at": datetime.utcnow().isoformat(),
            **data  # Include all additional fields (name, password, role, device_info, expires_at, etc.)
        }
        
        # Upsert: replace if exists, insert if new
        self.verification_codes.update_one(
            {"email": email},
            {"$set": verification_data},
            upsert=True
        )
    
    def get_verification_code(self, email: str) -> Optional[Dict[str, Any]]:
        """
        Get verification code data for an email
        
        Args:
            email: User's email address
            
        Returns:
            Verification code data if found, None otherwise
        """
        result = self.verification_codes.find_one({"email": email}, {"_id": 0})
        return result
    
    def delete_verification_code(self, email: str) -> bool:
        """
        Delete verification code for an email
        
        Args:
            email: User's email address
            
        Returns:
            True if deleted, False if not found
        """
        result = self.verification_codes.delete_one({"email": email})
        return result.deleted_count > 0
    
    def check_verification_code_exists(self, email: str) -> bool:
        """
        Check if a verification code exists for an email
        
        Args:
            email: User's email address
            
        Returns:
            True if exists, False otherwise
        """
        count = self.verification_codes.count_documents({"email": email})
        return count > 0