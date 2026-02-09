from fastapi import FastAPI, HTTPException, Depends, status, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, List, Dict, Any, Callable
import json
import os
from datetime import datetime, timedelta, timezone
import jwt
import hashlib
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import random
import string
from dotenv import load_dotenv
import ssl
from user_agents import parse as parse_user_agent
import sib_api_v3_sdk
from sib_api_v3_sdk.rest import ApiException
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
import asyncio
import time

# Load environment variables from this file's directory so running uvicorn from repo root still works
ENV_PATH = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(dotenv_path=ENV_PATH)

app = FastAPI(title="Lernova Attendsheets API")

# Check database type from environment
DB_TYPE = os.getenv("DB_TYPE", "file")  # "file" or "mongodb"

if DB_TYPE == "mongodb":
    from mongodb_manager import MongoDBManager
    MONGO_URI = os.getenv("MONGO_URI")
    MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "lernova_db")
    
    if not MONGO_URI:
        raise ValueError("MONGO_URI environment variable not set")
    
    db = MongoDBManager(mongo_uri=MONGO_URI, db_name=MONGO_DB_NAME)
    print("✅ Using MongoDB for storage")
else:
    from db_manager import DatabaseManager
    db = DatabaseManager(base_dir="data")
    print("✅ Using file-based storage")

# Environment
APP_ENV = os.getenv("APP_ENV", "development").lower()  # development | production

# CORS Configuration
# In production you should set CORS_ORIGINS to a comma-separated list, e.g.
#   CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
cors_origins_env = os.getenv("CORS_ORIGINS", "").strip()

cors_kwargs: Dict[str, Any] = {
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}

if cors_origins_env:
    # Strict allow-list
    cors_kwargs["allow_origins"] = [o.strip() for o in cors_origins_env.split(",") if o.strip()]
else:
    # Dev-friendly defaults (localhost + LAN IPs for phone/tablet testing)
    cors_kwargs["allow_origins"] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ]
    cors_kwargs["allow_origin_regex"] = r"https?://(localhost|127\\.0\\.0\\.1|\\d+\\.\\d+\\.\\d+\\.\\d+)(:\\d+)?$"

app.add_middleware(CORSMiddleware, **cors_kwargs)

# ==================== TIMEOUT MIDDLEWARE ====================

class TimeoutMiddleware(BaseHTTPMiddleware):
    """
    Middleware to enforce request timeouts
    Prevents requests from hanging indefinitely
    """
    
    def __init__(self, app, timeout: int = 30):
        super().__init__(app)
        self.timeout = timeout
        print(f"✅ Timeout middleware enabled: {timeout}s per request")

    async def dispatch(
        self, 
        request: Request, 
        call_next: Callable
    ) -> Response:
        start_time = time.time()
        
        try:
            # Set timeout for request processing
            response = await asyncio.wait_for(
                call_next(request), 
                timeout=self.timeout
            )
            
            # Log slow requests
            duration = time.time() - start_time
            if duration > 5:  # Warn on requests > 5 seconds
                print(f"⚠️ Slow request: {request.method} {request.url.path} took {duration:.2f}s")
            
            return response
            
        except asyncio.TimeoutError:
            duration = time.time() - start_time
            print(f"⏱️ Request timeout: {request.method} {request.url.path} after {duration:.2f}s")
            
            return JSONResponse(
                status_code=504,
                content={
                    "detail": f"Request timeout - operation took longer than {self.timeout} seconds",
                    "error": "GATEWAY_TIMEOUT",
                    "path": str(request.url.path),
                    "method": request.method
                }
            )
        except Exception as e:
            print(f"❌ Request error: {request.method} {request.url.path} - {str(e)}")
            raise

# Add middleware to app
app.add_middleware(TimeoutMiddleware, timeout=30)
print("✅ Timeout middleware enabled: 30s per request")

class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log all requests with timing"""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        start_time = time.time()
        print(f"📥 {request.method} {request.url.path}")
        
        try:
            response = await call_next(request)
            duration = time.time() - start_time
            
            status_icon = "✅" if response.status_code < 400 else "❌"
            print(f"{status_icon} {request.method} {request.url.path} - {response.status_code} ({duration:.2f}s)")
            
            response.headers["X-Process-Time"] = f"{duration:.4f}"
            return response
            
        except Exception as e:
            duration = time.time() - start_time
            print(f"❌ {request.method} {request.url.path} - ERROR ({duration:.2f}s): {str(e)}")
            raise

# Add after TimeoutMiddleware
app.add_middleware(RequestLoggingMiddleware)

# Security
security = HTTPBearer()

# Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-this-in-production")
if APP_ENV != "development" and SECRET_KEY == "your-secret-key-change-this-in-production":
    raise ValueError("SECRET_KEY must be set in production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

# Brevo Configuration
BREVO_API_KEY = os.getenv("BREVO_API_KEY")
FROM_EMAIL = os.getenv("FROM_EMAIL")

# Initialize Brevo
configuration = sib_api_v3_sdk.Configuration()
configuration.api_key['api-key'] = BREVO_API_KEY

# Verification codes are now stored in MongoDB instead of memory
# This allows the app to work across server restarts and multiple instances
password_reset_codes = {}

# ==================== PYDANTIC MODELS ====================

class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    device_id: Optional[str] = None
    device_info: Optional[Dict[str, Any]] = None

class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str = "teacher"
    device_id: Optional[str] = None
    device_info: Optional[Dict[str, Any]] = None

class StudentEnrollmentRequest(BaseModel):
    class_id: str
    name: str
    rollNo: str
    email: EmailStr

class VerifyEmailRequest(BaseModel):
    email: EmailStr
    code: str

class PasswordResetRequest(BaseModel):
    email: EmailStr

class VerifyResetCodeRequest(BaseModel):
    email: EmailStr
    code: str
    new_password: str

class UpdateProfileRequest(BaseModel):
    name: str

class ChangePasswordRequest(BaseModel):
    code: str
    new_password: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: str

class TokenResponse(BaseModel):
    access_token: str
    user: UserResponse

class ClassRequest(BaseModel):
    id: int
    name: str
    students: List[Dict[str, Any]]
    customColumns: List[Dict[str, Any]]
    thresholds: Optional[Dict[str, Any]] = None
    enrollment_mode: Optional[str] = "manual_entry"

class ContactRequest(BaseModel):
    name: str
    email: EmailStr
    subject: str
    message: str

class ResendVerificationRequest(BaseModel):
    email: EmailStr

class AttendanceSessionRequest(BaseModel):
    class_id: str
    date: str
    sessionName: str
    startTime: str
    endTime: str

class QRScanRequest(BaseModel):
    class_id: str
    qr_code: str

class SessionAttendanceUpdate(BaseModel):
    session_id: str
    student_id: str
    status: str

class SessionData(BaseModel):
    id: str
    name: str
    status: Optional[str] = None  # ✅ This allows null
    
    class Config:
        extra = "allow"
        validate_assignment = True

    @field_validator('status')
    @classmethod
    def validate_status(cls, v):
        # ✅ Allow None/null values
        if v is None:
            return None
        # ✅ Only validate if value is provided
        if v not in ['P', 'A', 'L']:
            raise ValueError('Status must be P, A, L, or null')
        return v


class MultiSessionAttendanceUpdate(BaseModel):
    student_id: str
    date: str
    sessions: List[SessionData]
    
    class Config:
        extra = "allow"

class DeviceRequestCreate(BaseModel):
    email: EmailStr  # ✅ ADD THIS LINE
    device_id: str
    device_info: Dict[str, Any]
    reason: str
    
    @field_validator('reason')
    def validate_reason(cls, v):
        if len(v.strip()) < 10:
            raise ValueError('Reason must be at least 10 characters long')
        if len(v.strip()) > 200:
            raise ValueError('Reason must not exceed 200 characters')
        return v.strip()

class DeviceRequestResponse(BaseModel):
    action: str  # "approve" or "reject"

# ==================== HELPER FUNCTIONS ====================

def get_current_session_number_for_date(class_data: dict, date: str) -> int:
    """
    Calculate what the next session number should be based on existing attendance.
    FIXED: Now respects manually entered sessions.
    """
    max_sessions = 0
    
    students = class_data.get("students", [])
    
    for student in students:
        attendance = student.get("attendance", {})
        day_data = attendance.get(date)
        
        if not day_data:
            continue
        
        # Count sessions for this student on this date
        session_count = 0
        
        if isinstance(day_data, dict) and "sessions" in day_data:
            # NEW FORMAT: { sessions: [...], updated_at: "..." }
            session_count = len(day_data["sessions"])
        elif isinstance(day_data, dict) and "status" in day_data:
            # OLD FORMAT: { status: 'P', count: 2 }
            session_count = day_data.get("count", 1)
        elif isinstance(day_data, str):
            # VERY OLD FORMAT: 'P' | 'A' | 'L'
            session_count = 1
        
        # Track the maximum
        max_sessions = max(max_sessions, session_count)
    
    # Next session number is max + 1 (respects manual entries)
    return max_sessions + 1

def get_password_hash(password: str) -> str:
    """Hash a password using SHA-256"""
    return hashlib.sha256(password.encode()).hexdigest()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    return get_password_hash(plain_password) == hashed_password


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def generate_verification_code() -> str:
    """Generate a 6-digit verification code"""
    return ''.join(random.choices(string.digits, k=6))


def send_verification_email(to_email: str, code: str, name: str):
    """Send verification email using Brevo"""
    try:
        api_instance = sib_api_v3_sdk.TransactionalEmailsApi(
            sib_api_v3_sdk.ApiClient(configuration)
        )
        
        html = f"""
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Email Verification</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #a8edea;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background: linear-gradient(135deg, #a8edea 0%, #c2f5e9 100%); min-height: 100vh;">
                <tr>
                    <td style="padding: 40px 20px;">
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background: white; border-radius: 20px; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1); overflow: hidden;">
                            
                            <!-- Header Section -->
                            <tr>
                                <td style="background: linear-gradient(135deg, #16a085 0%, #2ecc71 100%); padding: 50px 40px; text-align: center;">
                                    <!-- Icon -->
                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="70" style="margin: 0 auto 20px; background: white; border-radius: 14px; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);">
                                        <tr>
                                            <td style="padding: 5px; text-align: center;">
                                                <img src="https://lh3.googleusercontent.com/a/ACg8ocLIriLhypLD7WxziHH96HRlq9s8qiksZ2YAlIsjQ_AFODVqjnc=s358-c-no" alt="Logo" width="80" height="80" />   
                                            </td>
                                        </tr>
                                    </table>
                                    <!-- Title -->
                                    <h1 style="margin: 0 0 8px 0; color: white; font-size: 28px; font-weight: 600;">Lernova Attendsheets</h1>
                                    <p style="margin: 0; color: white; font-size: 15px; opacity: 0.95;">Modern Attendance Management</p>
                                </td>
                            </tr>

                            <!-- Content Section -->
                            <tr>
                                <td style="padding: 40px;">
                                    <!-- Welcome Message -->
                                    <h2 style="margin: 0 0 20px 0; color: #2c3e50; font-size: 26px; font-weight: 600;">Welcome, {name}! 👋</h2>
                                    <p style="margin: 0 0 30px 0; color: #7f8c8d; font-size: 15px; line-height: 1.6;">
                                        Thank you for signing up for Lernova Attendsheets. To complete your registration and start managing attendance, please verify your email address.
                                    </p>

                                    <!-- Code Section -->
                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 25px; background: linear-gradient(135deg, #d4f1f4 0%, #c3f0d8 100%); border-radius: 16px;">
                                        <tr>
                                            <td style="padding: 30px; text-align: center;">
                                                <p style="margin: 0 0 15px 0; font-size: 11px; font-weight: 600; letter-spacing: 1.5px; color: #16a085; text-transform: uppercase;">Your Verification Code</p>
                                                
                                                <!-- Code Box -->
                                                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background: white; border-radius: 12px; margin-bottom: 15px;">
                                                    <tr>
                                                        <td style="padding: 20px; text-align: center;">
                                                            <span style="font-size: 42px; font-weight: 700; letter-spacing: 14px; color: #16a085; font-family: 'Courier New', monospace;">{code}</span>
                                                        </td>
                                                    </tr>
                                                </table>
                                                
                                                <p style="margin: 0; font-size: 13px; color: #16a085;">This code will expire in 15 minutes</p>
                                            </td>
                                        </tr>
                                    </table>
                                    
                                    <!-- Security Tip -->
                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background: #f8f9fa; border-left: 4px solid #16a085; border-radius: 8px;">
                                        <tr>
                                            <td style="padding: 15px 20px;">
                                                <p style="margin: 0 0 5px 0; color: #2c3e50; font-size: 14px; font-weight: 600;">Security Tip:</p>
                                                <p style="margin: 0; color: #7f8c8d; font-size: 13px; line-height: 1.5;">If you didn't create an account with Lernova Attendsheets, you can safely ignore this email.</p>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>

                            <!-- Footer Section -->
                            <tr>
                                <td style="padding: 30px 40px; text-align: center; border-top: 1px solid #ecf0f1;">
                                    <p style="margin: 0 0 10px 0; color: #95a5a6; font-size: 14px;">
                                        Need help? Contact us at <a href="mailto:lernova.attendsheets@gmail.com" style="color: #16a085; text-decoration: none; font-weight: 500;">lernova.attendsheets@gmail.com</a>
                                    </p>
                                    <p style="margin: 0; color: #95a5a6; font-size: 12px;">
                                        © 2026 Lernova Attendsheets by Lernova. All rights reserved.<br>
                                        Built by students at Atharva University, Mumbai
                                    </p>
                                </td>
                            </tr>

                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
        """
        
        send_smtp_email = sib_api_v3_sdk.SendSmtpEmail(
            to=[{"email": to_email, "name": name}],
            sender={"email": FROM_EMAIL, "name": "Lernova Attendsheets"},
            subject="Verify Your Lernova Attendsheets Account",
            html_content=html
        )
        
        api_response = api_instance.send_transac_email(send_smtp_email)
        print(f"✅ Verification email sent to {to_email}")
        return True
        
    except ApiException as e:
        print(f"❌ Brevo API error: {e}")
        return False
    except Exception as e:
        print(f"❌ Error sending email: {e}")
        return False
    
def send_password_reset_email(to_email: str, code: str, name: str):
    """Send password reset email using Brevo"""
    try:
        api_instance = sib_api_v3_sdk.TransactionalEmailsApi(
            sib_api_v3_sdk.ApiClient(configuration)
        )
        
        html = f"""
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Password Reset</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #a8edea;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background: linear-gradient(135deg, #a8edea 0%, #c2f5e9 100%); min-height: 100vh;">
                <tr>
                    <td style="padding: 40px 20px;">
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background: white; border-radius: 20px; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1); overflow: hidden;">
                            
                            <!-- Header Section -->
                            <tr>
                                <td style="background: linear-gradient(135deg, #16a085 0%, #2ecc71 100%); padding: 50px 40px; text-align: center;">
                                    <!-- Icon -->
                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="70" style="margin: 0 auto 20px; background: white; border-radius: 14px; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);">
                                        <tr>
                                            <td style="padding: 5px; text-align: center;">
                                                <img src="https://lh3.googleusercontent.com/a/ACg8ocLIriLhypLD7WxziHH96HRlq9s8qiksZ2YAlIsjQ_AFODVqjnc=s358-c-no" alt="Logo" width="80" height="80" />  
                                            </td>
                                        </tr>
                                    </table>
                                    <!-- Title -->
                                    <h1 style="margin: 0 0 8px 0; color: white; font-size: 28px; font-weight: 600;">Password Reset</h1>
                                    <p style="margin: 0; color: white; font-size: 15px; opacity: 0.95;">Lernova Attendsheets</p>
                                </td>
                            </tr>

                            <!-- Content Section -->
                            <tr>
                                <td style="padding: 40px;">
                                    <!-- Welcome Message -->
                                    <h2 style="margin: 0 0 20px 0; color: #2c3e50; font-size: 26px; font-weight: 600;">Hi {name}, 🔒</h2>
                                    <p style="margin: 0 0 30px 0; color: #7f8c8d; font-size: 15px; line-height: 1.6;">
                                        We received a request to reset your password for your Lernova Attendsheets account. Use the verification code below to set a new password.
                                    </p>

                                    <!-- Code Section -->
                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 25px; background: linear-gradient(135deg, #d4f1f4 0%, #c3f0d8 100%); border-radius: 16px;">
                                        <tr>
                                            <td style="padding: 30px; text-align: center;">
                                                <p style="margin: 0 0 15px 0; font-size: 11px; font-weight: 600; letter-spacing: 1.5px; color: #16a085; text-transform: uppercase;">Your Password Reset Code</p>
                                                
                                                <!-- Code Box -->
                                                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background: white; border-radius: 12px; margin-bottom: 15px;">
                                                    <tr>
                                                        <td style="padding: 20px; text-align: center;">
                                                            <span style="font-size: 42px; font-weight: 700; letter-spacing: 14px; color: #16a085; font-family: 'Courier New', monospace;">{code}</span>
                                                        </td>
                                                    </tr>
                                                </table>
                                                
                                                <p style="margin: 0; font-size: 13px; color: #16a085;">This code will expire in 15 minutes</p>
                                            </td>
                                        </tr>
                                    </table>

                                    <!-- Security Tip -->
                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background: #f8f9fa; border-left: 4px solid #e74c3c; border-radius: 8px;">
                                        <tr>
                                            <td style="padding: 15px 20px;">
                                                <p style="margin: 0 0 5px 0; color: #2c3e50; font-size: 14px; font-weight: 600;">Security Alert:</p>
                                                <p style="margin: 0; color: #7f8c8d; font-size: 13px; line-height: 1.5;">If you didn't request a password reset, please ignore this email or contact support if you have concerns about your account security.</p>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>

                            <!-- Footer Section -->
                            <tr>
                                <td style="padding: 30px 40px; text-align: center; border-top: 1px solid #ecf0f1;">
                                    <p style="margin: 0 0 10px 0; color: #95a5a6; font-size: 14px;">
                                        Need help? Contact us at <a href="mailto:lernova.attendsheets@gmail.com" style="color: #16a085; text-decoration: none; font-weight: 500;">lernova.attendsheets@gmail.com</a>
                                    </p>
                                    <p style="margin: 0; color: #95a5a6; font-size: 12px;">
                                        © 2026 Lernova Attendsheets by Lernova. All rights reserved.<br>
                                        Built by students at Atharva University, Mumbai
                                    </p>
                                </td>
                            </tr>

                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
        """
        
        send_smtp_email = sib_api_v3_sdk.SendSmtpEmail(
            to=[{"email": to_email, "name": name}],
            sender={"email": FROM_EMAIL, "name": "Lernova Attendsheets"},
            subject="Reset Your Lernova Attendsheets Password",
            html_content=html
        )
        
        api_response = api_instance.send_transac_email(send_smtp_email)
        print(f"✅ Password reset email sent to {to_email}")
        return True
        
    except ApiException as e:
        print(f"❌ Brevo API error: {e}")
        return False
    except Exception as e:
        print(f"❌ Error sending reset email: {e}")
        return False
    
def send_untrusted_device_alert(to_email: str, name: str, device_info: Dict[str, Any]):
    """Send alert email when student tries to login from untrusted device using Brevo"""
    try:
        api_instance = sib_api_v3_sdk.TransactionalEmailsApi(
            sib_api_v3_sdk.ApiClient(configuration)
        )
        
        device_name = device_info.get("name", "Unknown Device")
        browser = device_info.get("browser", "Unknown Browser")
        os_name = device_info.get("os", "Unknown OS")
        login_time = datetime.now(timezone.utc).strftime("%B %d, %Y at %I:%M %p UTC")
        
        html = f"""
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Login Blocked</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8f9fa;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background: #f8f9fa; min-height: 100vh;">
                <tr>
                    <td style="padding: 40px 20px;">
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background: white; border-radius: 20px; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1); overflow: hidden;">
                            <!-- Header -->
                            <tr>
                                <td style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); padding: 50px 40px; text-align: center;">
                                    <h1 style="margin: 0 0 8px 0; color: white; font-size: 28px; font-weight: 600;">🚫 Login Blocked</h1>
                                    <p style="margin: 0; color: white; font-size: 15px; opacity: 0.95;">New Device Not Authorized</p>
                                </td>
                            </tr>
                            
                            <!-- Content -->
                            <tr>
                                <td style="padding: 40px;">
                                    <h2 style="margin: 0 0 20px 0; color: #1e293b; font-size: 24px; font-weight: 600;">Hi {name},</h2>
                                    
                                    <p style="margin: 0 0 25px 0; color: #64748b; font-size: 15px; line-height: 1.6;">
                                        A login attempt to your Lernova Attendsheets account was <strong>blocked</strong> because it came from an untrusted device.
                                    </p>
                                    
                                    <!-- Device Info Box -->
                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 25px; background: #fee2e2; border-left: 4px solid #dc2626; border-radius: 8px;">
                                        <tr>
                                            <td style="padding: 20px;">
                                                <p style="margin: 0 0 12px 0; color: #991b1b; font-size: 14px; font-weight: 600;">Blocked Login Details:</p>
                                                <p style="margin: 0 0 6px 0; color: #991b1b; font-size: 13px;">
                                                    <strong>Time:</strong> {login_time}
                                                </p>
                                                <p style="margin: 0 0 6px 0; color: #991b1b; font-size: 13px;">
                                                    <strong>Device:</strong> {device_name}
                                                </p>
                                                <p style="margin: 0 0 6px 0; color: #991b1b; font-size: 13px;">
                                                    <strong>Browser:</strong> {browser}
                                                </p>
                                                <p style="margin: 0; color: #991b1b; font-size: 13px;">
                                                    <strong>Operating System:</strong> {os_name}
                                                </p>
                                            </td>
                                        </tr>
                                    </table>
                                    
                                    <!-- Info Box -->
                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 25px; background: #dbeafe; border-left: 4px solid #3b82f6; border-radius: 8px;">
                                        <tr>
                                            <td style="padding: 20px;">
                                                <p style="margin: 0 0 10px 0; color: #1e40af; font-size: 14px; font-weight: 600;">ℹ️ Why was this blocked?</p>
                                                <p style="margin: 0; color: #1e40af; font-size: 13px; line-height: 1.6;">
                                                    For security reasons, you can only login from devices you've previously used. 
                                                    If this was you trying to login from a new device, please use one of your trusted devices or contact your administrator.
                                                </p>
                                            </td>
                                        </tr>
                                    </table>
                                    
                                    <!-- Action Box -->
                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 8px;">
                                        <tr>
                                            <td style="padding: 20px;">
                                                <p style="margin: 0 0 10px 0; color: #92400e; font-size: 14px; font-weight: 600;">📱 Need to add a new device?</p>
                                                <p style="margin: 0; color: #92400e; font-size: 13px; line-height: 1.6;">
                                                    Contact your teacher or administrator to authorize a new device for your account.
                                                </p>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            
                            <!-- Footer -->
                            <tr>
                                <td style="padding: 30px 40px; text-align: center; border-top: 1px solid #e2e8f0;">
                                    <p style="margin: 0 0 10px 0; color: #94a3b8; font-size: 14px;">
                                        Need help? Contact us at 
                                        <a href="mailto:lernova.attendsheets@gmail.com" style="color: #dc2626; text-decoration: none; font-weight: 500;">lernova.attendsheets@gmail.com</a>
                                    </p>
                                    <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                                        © 2026 Lernova Attendsheets by Lernova. All rights reserved.<br/>
                                        Built by students at Atharva University, Mumbai
                                    </p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
        """
        
        send_smtp_email = sib_api_v3_sdk.SendSmtpEmail(
            to=[{"email": to_email, "name": name}],
            sender={"email": FROM_EMAIL, "name": "Lernova Attendsheets Security"},
            subject="🚫 Login Attempt from New Device Blocked - Lernova Attendsheets",
            html_content=html
        )
        
        api_response = api_instance.send_transac_email(send_smtp_email)
        print(f"✅ Untrusted device alert sent to {to_email}")
        return True
        
    except ApiException as e:
        print(f"❌ Brevo API error: {e}")
        return False
    except Exception as e:
        print(f"❌ Error sending alert email: {e}")
        return False
    
def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Verify JWT token and return user email"""
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = str(payload.get("sub"))
        if email is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
            )
        return email
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
        )
    except jwt.PyJWTError:  # ✅ FIXED - Use PyJWTError instead of JWTError
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        )
    
def is_trusted_device(user_data: Dict[str, Any], device_id: str) -> bool:
    """Check if a device is in the user's trusted devices list"""
    trusted_devices = user_data.get("trusted_devices", [])
    return any(d.get("id") == device_id for d in trusted_devices)

def add_trusted_device(user_id: str, device_info: Dict[str, Any]):
    """Add a device to user's trusted devices"""
    user_data = db.get_user(user_id) or db.get_student(user_id)
    if not user_data:
        return
    
    trusted_devices = user_data.get("trusted_devices", [])
    
    # Check if device already exists
    device_exists = any(d.get("id") == device_info.get("id") for d in trusted_devices)
    
    if not device_exists:
        new_device = {
            "id": device_info.get("id"),
            "name": device_info.get("name", "Unknown Device"),
            "browser": device_info.get("browser", "Unknown"),
            "os": device_info.get("os", "Unknown"),
            "device": device_info.get("device", "Unknown"),
            "first_seen": datetime.utcnow().isoformat(),
            "last_seen": datetime.utcnow().isoformat(),
            "login_count": 1
        }
        trusted_devices.append(new_device)
    else:
        # Update last seen and increment login count
        for device in trusted_devices:
            if device.get("id") == device_info.get("id"):
                device["last_seen"] = datetime.now(timezone.utc).isoformat()
                device["login_count"] = device.get("login_count", 0) + 1
                break
    
    # Update user data
    if db.get_user(user_id):
        db.update_user(user_id, trusted_devices=trusted_devices)
    else:
        db.update_student(user_id, {"trusted_devices": trusted_devices})


# ==================== API ENDPOINTS ====================

@app.get("/")
def read_root():
    return {
        "message": "Lernova Attendsheets API",
        "version": "1.0.0",
        "status": "online",
        "database": DB_TYPE
    }


@app.get("/stats")
def get_stats():
    """Get database statistics"""
    return db.get_database_stats()


# ==================== AUTH ENDPOINTS ====================

@app.post("/auth/signup")
async def signup(request: SignupRequest):
    """
    Sign up TEACHER - No device fingerprinting.
    """
    try:
        # Check if user already exists
        existing_user = db.get_user_by_email(request.email)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User with this email already exists"
            )

        if len(request.password) < 8:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password must be at least 8 characters long"
            )

        # Generate verification code
        code = generate_verification_code()
        print(f"✅ TEACHER SIGNUP: {request.email} (Code: {code})")

        # Store verification code (NO device info for teachers)
        db.store_verification_code(request.email, code, {
            "name": request.name,
            "password": get_password_hash(request.password),
            "expires_at": (datetime.utcnow() + timedelta(minutes=15)).isoformat()
        })

        # Send verification email
        email_sent = send_verification_email(request.email, code, request.name)

        return {
            "success": True,
            "message": "Verification code sent to your email" if email_sent else f"Code: {code}"
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Signup error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Signup failed: {str(e)}"
        )

@app.post("/auth/verify-email", response_model=TokenResponse)
async def verify_email(request: VerifyEmailRequest):
    """Verify email with code"""
    try:
        if not db.check_verification_code_exists(request.email):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No verification code found"
            )
        
        stored_data = db.get_verification_code(request.email)
        expires_at = datetime.fromisoformat(stored_data["expires_at"])
        
        if datetime.utcnow() > expires_at:
            db.delete_verification_code(request.email)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Verification code expired"
            )
        
        if stored_data["code"] != request.code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid verification code"
            )
        
        # Create user in database
        user_id = f"user_{int(datetime.utcnow().timestamp())}"
        user_data = db.create_user(
            user_id=user_id,
            email=request.email,
            name=stored_data["name"],
            password_hash=stored_data["password"]
        )
        
        # Clean up verification code
        db.delete_verification_code(request.email)
        
        # Create access token
        access_token = create_access_token(
            data={"sub": request.email},
            expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        )
        
        return TokenResponse(
            access_token=access_token,
            user=UserResponse(id=user_id, email=request.email, name=stored_data["name"])
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"Verification error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Verification failed: {str(e)}"
        )


@app.post("/auth/login", response_model=TokenResponse)
async def login(request: LoginRequest):
    """
    Login TEACHER - No device fingerprinting required.
    Teachers can login from any device without verification.
    """
    user = db.get_user_by_email(request.email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    if not verify_password(request.password, user["password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    # ✅ NO DEVICE CHECKING FOR TEACHERS - Direct login
    print(f"✅ TEACHER LOGIN: {request.email} (no device verification)")
    
    access_token = create_access_token(
        data={"sub": request.email},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    
    return TokenResponse(
        access_token=access_token,
        user=UserResponse(id=user["id"], email=user["email"], name=user["name"])
    )

@app.post("/auth/resend-verification")
async def resend_verification(request: ResendVerificationRequest):
    """Resend verification code"""
    try:
        # Check if there's already a pending verification for this email
        if not db.check_verification_code_exists(request.email):
            # Check if user already exists
            existing_user = db.get_user_by_email(request.email)
            if existing_user:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email already verified"
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="No pending verification found for this email"
                )
        
        # Get the stored data
        stored_data = db.get_verification_code(request.email)
        
        # Generate new code
        code = generate_verification_code()
        print(f"New verification code for {request.email}: {code}")
        
        # Update the stored verification code with new code and expiry
        db.store_verification_code(request.email, code, {
            "name": stored_data["name"],
            "password": stored_data["password"],
            "expires_at": (datetime.utcnow() + timedelta(minutes=15)).isoformat()
        })
        
        # Send new verification email
        email_sent = send_verification_email(request.email, code, stored_data["name"])
        
        return {
            "success": True,
            "message": "New verification code sent to your email" if email_sent else f"Code: {code}"
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Resend verification error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to resend verification code: {str(e)}"
        )

@app.post("/auth/request-password-reset")
async def request_password_reset(request: PasswordResetRequest):
    """Request password reset code"""
    user = db.get_user_by_email(request.email)
    
    # Also check if it's a student
    if not user:
        student = db.get_student_by_email(request.email)
        if student:
            user = student  # Use student data if found
    
    if not user:
        # Don't reveal if email exists - security best practice
        return {"success": True, "message": "If account exists, reset code sent"}
    
    # Generate verification code
    code = generate_verification_code()
    print(f"Password reset code for {request.email}: {code}")
    
    # Store the code in database
    db.store_password_reset_code(request.email, code, {
        "expires_at": (datetime.utcnow() + timedelta(minutes=15)).isoformat()
    })
    
    # 🔧 FIX: Actually send the email with all required parameters
    email_sent = send_password_reset_email(request.email, code, user["name"])
    
    if email_sent:
        print(f"✅ Password reset email sent successfully to {request.email}")
        return {"success": True, "message": "Reset code sent to your email"}
    else:
        print(f"❌ Failed to send password reset email to {request.email}")
        # Still return success but log the failure
        return {"success": True, "message": "Reset code generated (check server logs)"}

@app.post("/auth/reset-password")
async def reset_password(request: VerifyResetCodeRequest):
    """Reset password with code"""
    if not db.check_password_reset_code_exists(request.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No reset code found"
        )
    
    stored_data = db.get_password_reset_code(request.email)
    expires_at = datetime.fromisoformat(stored_data["expires_at"])
    
    if datetime.utcnow() > expires_at:
        db.delete_password_reset_code(request.email)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset code expired"
        )
    
    if stored_data["code"] != request.code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid reset code"
        )
    
    if len(request.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters"
        )
    
    # Update password in database
    user = db.get_user_by_email(request.email)
    if user:
        db.update_user(user["id"], password=get_password_hash(request.new_password))
    
    db.delete_password_reset_code(request.email)
    
    return {"success": True, "message": "Password reset successfully"}


@app.post("/auth/change-password")
async def change_password(request: ChangePasswordRequest, email: str = Depends(verify_token)):
    """Change password for logged-in user - supports both teachers and students"""
    if not db.check_password_reset_code_exists(email):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No verification code found")
    
    stored_data = db.get_password_reset_code(email)
    expires_at = datetime.fromisoformat(stored_data["expires_at"])
    
    if datetime.utcnow() > expires_at:
        db.delete_password_reset_code(email)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Verification code expired")
    
    if stored_data["code"] != request.code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid verification code")
    
    if len(request.new_password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be at least 8 characters")
    
    # Try to find as teacher first
    user = db.get_user_by_email(email)
    if user:
        db.update_user(user["id"], password=get_password_hash(request.new_password))
        db.delete_password_reset_code(email)
        return {"success": True, "message": "Password changed successfully"}
    
    # Try to find as student
    student = db.get_student_by_email(email)
    if student:
        db.update_student(student["id"], {"password": get_password_hash(request.new_password)})
        db.delete_password_reset_code(email)
        return {"success": True, "message": "Password changed successfully"}
    
    # Not found in either
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")


@app.post("/auth/request-change-password")
async def request_change_password(email: str = Depends(verify_token)):
    """Request verification code for password change - supports both teachers and students"""
    # Try to find as teacher first
    user = db.get_user_by_email(email)
    if user:
        code = generate_verification_code()
        print(f"Password change code for {email}: {code}")
        
        db.store_password_reset_code(email, code, {
            "expires_at": (datetime.utcnow() + timedelta(minutes=15)).isoformat()
        })
        
        send_password_reset_email(email, code, user["name"])
        return {"success": True, "message": "Verification code sent"}
    
    # Try to find as student
    student = db.get_student_by_email(email)
    if student:
        code = generate_verification_code()
        print(f"Password change code for {email}: {code}")
        
        db.store_password_reset_code(email, code, {
            "expires_at": (datetime.utcnow() + timedelta(minutes=15)).isoformat()
        })
        
        send_password_reset_email(email, code, student["name"])
        return {"success": True, "message": "Verification code sent"}
    
    # Not found in either
    raise HTTPException(status_code=404, detail="User not found")


@app.put("/auth/update-profile")
async def update_profile(request: UpdateProfileRequest, email: str = Depends(verify_token)):
    """Update user profile - supports both teachers and students"""
    # Try to find as teacher first
    user = db.get_user_by_email(email)
    if user:
        # It's a teacher
        updated_user = db.update_user(user["id"], name=request.name)
        return UserResponse(id=updated_user["id"], email=updated_user["email"], name=updated_user["name"])
    
    # Try to find as student
    student = db.get_student_by_email(email)
    if student:
        # It's a student
        updated_student = db.update_student(student["id"], {"name": request.name})
        return UserResponse(id=updated_student["id"], email=updated_student["email"], name=updated_student["name"])
    
    # Not found in either
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")


@app.post("/auth/logout")
async def logout(email: str = Depends(verify_token)):
    """Logout user"""
    return {"success": True, "message": "Logged out successfully"}


@app.get("/auth/me", response_model=UserResponse)
async def get_current_user(email: str = Depends(verify_token)):
    """Get current user info - supports both teachers and students"""
    # Try teacher first
    user = db.get_user_by_email(email)
    
    if not user:
        # Try student
        user = db.get_student_by_email(email)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return UserResponse(
        id=user["id"], 
        email=user["email"], 
        name=user["name"]
    )

@app.delete("/auth/delete-account")
async def delete_account(email: str = Depends(verify_token)):
    """Delete user account and all associated data"""
    try:
        user = db.get_user_by_email(email)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        user_id = user["id"]
        
        # Use the database manager's delete method
        success = db.delete_user(user_id)
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to delete account"
            )
        
        return {
            "success": True,
            "message": "Account deleted successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Delete account error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete account"
        )

# ==================== STUDENT AUTH ENDPOINTS ====================

@app.post("/auth/student/signup")
async def student_signup(request: SignupRequest):
    """
    Sign up STUDENT - Device fingerprinting enabled.
    First device is automatically trusted.
    """
    try:
        # Check if user already exists
        existing_user = db.get_student_by_email(request.email)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User with this email already exists"
            )

        if len(request.password) < 8:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password must be at least 8 characters long"
            )

        # Generate verification code
        code = generate_verification_code()
        
        if request.device_id and request.device_info:
            print(f"📱 STUDENT SIGNUP: {request.email}")
            print(f"   Device: {request.device_info.get('name')} (ID: {request.device_id})")
        else:
            print(f"📱 STUDENT SIGNUP: {request.email} (no device info)")

        # Store verification code WITH device info for students
        db.store_verification_code(request.email, code, {
            "name": request.name,
            "password": get_password_hash(request.password),
            "role": "student",
            "device_id": request.device_id if request.device_id else None,
            "device_info": request.device_info if request.device_info else None,
            "expires_at": (datetime.utcnow() + timedelta(minutes=15)).isoformat()
        })

        # Send verification email
        email_sent = send_verification_email(request.email, code, request.name)

        return {
            "success": True,
            "message": "Verification code sent to your email" if email_sent else f"Code: {code}"
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Student signup error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Signup failed: {str(e)}"
        )

@app.post("/auth/student/verify-email", response_model=TokenResponse)
async def verify_student_email(request: VerifyEmailRequest):
    """
    Verify student email and automatically trust their first device.
    """
    try:
        if not db.check_verification_code_exists(request.email):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No verification code found"
            )

        stored_data = db.get_verification_code(request.email)

        # Ensure this is a student verification
        if stored_data.get("role") != "student":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid verification attempt"
            )

        # Check expiration
        expires_at = datetime.fromisoformat(stored_data["expires_at"])
        if datetime.utcnow() > expires_at:
            db.delete_verification_code(request.email)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Verification code expired"
            )

        # Check code
        if stored_data["code"] != request.code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid verification code"
            )

        # Create student in database
        student_id = f"student_{int(datetime.utcnow().timestamp())}"
        student_data = db.create_student(
            student_id=student_id,
            email=request.email,
            name=stored_data["name"],
            password_hash=stored_data["password"]
        )

        # 🔐 Add first device as trusted if device info was provided
        if stored_data.get("device_id") and stored_data.get("device_info"):
            add_trusted_device(student_id, stored_data["device_info"])
            print(f"✅ First device auto-trusted for student: {request.email}")
            print(f"   Device: {stored_data['device_info'].get('name')}")

        # Clean up verification code
        db.delete_verification_code(request.email)

        # Create access token
        access_token = create_access_token(
            data={"sub": request.email, "role": "student"},
            expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        )

        return TokenResponse(
            access_token=access_token,
            user=UserResponse(id=student_id, email=request.email, name=stored_data["name"])
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"Student verification error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Verification failed: {str(e)}"
        )

# main.py - Update student_login function

@app.post("/auth/student/login", response_model=TokenResponse)
async def student_login(request: LoginRequest):
    """
    Login STUDENT - Device fingerprinting required.
    If untrusted device: suggest device request flow
    """
    user = db.get_student_by_email(request.email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    if not verify_password(request.password, user["password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    # 🔐 CHECK DEVICE FINGERPRINT
    if request.device_id and request.device_info:
        if not is_trusted_device(user, request.device_id):
            # NEW DEVICE DETECTED
            print(f"🚨 NEW DEVICE LOGIN ATTEMPT (STUDENT): {request.email}")
            print(f"   Device: {request.device_info.get('name')}")
            print(f"   ID: {request.device_id}")
            
            # Check if device is linked to another student
            other_student = db.find_student_by_device(request.device_id)
            if other_student and other_student["id"] != user["id"]:
                send_untrusted_device_alert(
                    request.email,
                    user["name"],
                    request.device_info
                )
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="DEVICE_ALREADY_LINKED"
                )
            
            # Check monthly request limit
            current_month = datetime.now(timezone.utc).strftime("%Y-%m")
            last_request_month = user.get("last_request_month", "")
            request_count = user.get("device_request_count", 0)
            
            if last_request_month == current_month and request_count >= 3:
                send_untrusted_device_alert(
                    request.email,
                    user["name"],
                    request.device_info
                )
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="MONTHLY_LIMIT_REACHED"
                )
            
            # Device request is possible
            send_untrusted_device_alert(
                request.email,
                user["name"],
                request.device_info
            )
            
            remaining_requests = 3 - request_count if last_request_month == current_month else 3
            
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"NEW_DEVICE|{remaining_requests}"
            )
        else:
            # Trusted device - allow login
            print(f"✅ STUDENT LOGIN (TRUSTED DEVICE): {request.email}")
            add_trusted_device(user["id"], request.device_info)
    else:
        # No device info provided - block for security
        print(f"⚠️ STUDENT LOGIN BLOCKED (NO DEVICE INFO): {request.email}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Device fingerprinting required for student login"
        )
    
    # Allow login only for trusted devices
    access_token = create_access_token(
        data={"sub": request.email, "role": "student"},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    
    return TokenResponse(
        access_token=access_token,
        user=UserResponse(id=user["id"], email=user["email"], name=user["name"])
    )

@app.delete("/auth/student/delete-account")
async def delete_student_account(email: str = Depends(verify_token)):
    """Delete student account and all associated data"""
    try:
        print(f"API: Delete student account request for {email}")
        
        # Get student data
        student = db.get_student_by_email(email)
        if not student:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Student not found"
            )
        
        student_id = student["id"]
        
        # Use the database manager's delete method
        success = db.delete_student(student_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to delete student account"
            )
        
        print(f"API: Student account deleted successfully")
        return {"success": True, "message": "Student account deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"API: Delete student account error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete student account"
        )

# ==================== DEVICE MANAGEMENT ENDPOINTS ====================

@app.post("/student/request-device")
def request_device_access(request: DeviceRequestCreate):
    """
    Submit a device access request (NO AUTHENTICATION REQUIRED)
    This is called when a student tries to login from a new device.
    """
    try:
        print(f"\n{'='*60}")
        print(f"[DEVICE_REQUEST] New request from {request.email}")
        print(f"  Device ID: {request.device_id}")
        print(f"  Reason: {request.reason}")
        print(f"{'='*60}")
        
        # 1. Verify the student exists
        student = db.get_student_by_email(request.email)
        if not student:
            print(f"[DEVICE_REQUEST] ❌ Student not found: {request.email}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Student account not found"
            )
        
        student_id = student["id"]
        print(f"[DEVICE_REQUEST] ✓ Student found: {student['name']} ({student_id})")
        
        # 2. Check if device is already trusted
        trusted_devices = student.get("trusted_devices", [])
        if any(d.get("id") == request.device_id for d in trusted_devices):
            print(f"[DEVICE_REQUEST] ❌ Device already trusted")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This device is already trusted"
            )
        
        # 3. Check if device is already linked to another student
        other_student = db.find_student_by_device(request.device_id)
        if other_student and other_student["id"] != student_id:
            print(f"[DEVICE_REQUEST] ❌ Device linked to another student")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="DEVICE_ALREADY_LINKED|This device is already linked to another student account"
            )
        
        # 4. Check for existing pending request
        existing_requests = list(db.device_requests.find({
            "student_id": student_id,
            "device_id": request.device_id,
            "status": "pending"
        }))
        
        if existing_requests:
            print(f"[DEVICE_REQUEST] ❌ Pending request exists")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="PENDING_REQUEST_EXISTS|You already have a pending request for this device"
            )
        
        # 5. Check monthly limit (3 requests per month)
        current_month = datetime.now(timezone.utc).strftime("%Y-%m")
        first_day_of_month = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        
        requests_this_month = db.device_requests.count_documents({
            "student_id": student_id,
            "created_at": {"$gte": first_day_of_month.isoformat()}
        })
        
        if requests_this_month >= 3:
            print(f"[DEVICE_REQUEST] ❌ Monthly limit reached: {requests_this_month}")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="MONTHLY_LIMIT_REACHED|You have reached the monthly limit of 3 device requests"
            )
        
        # 6. Find teacher - get from first enrollment
        enrollments = db.get_student_enrollments(student_id)
        teacher_id = None
        teacher_name = "Unknown Teacher"
        
        if enrollments:
            # Get teacher from first class
            first_class_id = enrollments[0]["class_id"]
            class_data = db.get_class_by_id(first_class_id)
            if class_data:
                teacher_id = class_data.get("teacher_id")
                if teacher_id:
                    teacher = db.get_user(teacher_id)
                    if teacher:
                        teacher_name = teacher.get("name", "Unknown Teacher")
        
        if not teacher_id:
            print(f"[DEVICE_REQUEST] ⚠️ No enrollments found, finding any teacher")
            # Find any teacher as fallback
            all_teachers = list(db.users.find({"role": "teacher"}, {"_id": 0}).limit(1))
            if all_teachers:
                teacher = all_teachers[0]
                teacher_id = teacher["id"]
                teacher_name = teacher.get("name", "Unknown Teacher")
            else:
                teacher_id = "system"
                teacher_name = "System Administrator"
        
        print(f"[DEVICE_REQUEST] ✓ Teacher: {teacher_name} ({teacher_id})")
        
        # 7. Create the device request using the manager method
        request_id = db.create_device_request({
            "student_id": student_id,
            "student_name": student.get("name", "Unknown Student"),
            "student_email": request.email,
            "teacher_id": teacher_id,
            "teacher_name": teacher_name,
            "device_id": request.device_id,
            "device_info": request.device_info,
            "reason": request.reason,
            "status": "pending"
        })
        
        remaining_requests = 3 - (requests_this_month + 1)
        
        print(f"[DEVICE_REQUEST] ✅ Request created: {request_id}")
        print(f"[DEVICE_REQUEST] Remaining requests: {remaining_requests}")
        print(f"{'='*60}\n")
        
        return {
            "success": True,
            "message": "Device access request submitted successfully",
            "request_id": request_id,
            "remaining_requests": remaining_requests
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[DEVICE_REQUEST] ❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to submit device request"
        )

@app.get("/teacher/device-requests")
async def get_device_requests(email: str = Depends(verify_token)):
    """Get all pending device requests for teacher's students"""
    try:
        print(f"\n[DEVICE_REQUESTS] Request from: {email}")
        
        user = db.get_user_by_email(email)
        if not user:
            print(f"[DEVICE_REQUESTS] ❌ User not found")
            raise HTTPException(status_code=404, detail="User not found")
        
        print(f"[DEVICE_REQUESTS] ✓ User found: {user['id']}")
        
        # Get all classes for this teacher
        classes = db.get_all_classes(user["id"])
        print(f"[DEVICE_REQUESTS] ✓ Found {len(classes)} classes")
        
        # Get all enrolled student IDs across all classes
        enrolled_student_ids = set()
        for cls in classes:
            try:
                enrollments = db.enrollments.find({"class_id": str(cls["id"]), "status": "active"})
                for enrollment in enrollments:
                    enrolled_student_ids.add(enrollment["student_id"])
            except Exception as e:
                print(f"[DEVICE_REQUESTS] ⚠️ Error getting enrollments for class {cls['id']}: {e}")
                continue
        
        print(f"[DEVICE_REQUESTS] ✓ Found {len(enrolled_student_ids)} enrolled students")
        
        # Get device requests for these students
        if enrolled_student_ids:
            requests = db.get_device_requests_for_students(list(enrolled_student_ids))
        else:
            requests = []
        
        print(f"[DEVICE_REQUESTS] ✓ Found {len(requests)} device requests")
        
        return {"requests": requests}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[DEVICE_REQUESTS] ❌ Error: {e}")
        import traceback
        traceback.print_exc()
        
        # Return empty list instead of 401
        return {"requests": []}
        
@app.post("/teacher/device-requests/{request_id}/respond")
async def respond_to_device_request(
    request_id: str,
    response: DeviceRequestResponse,
    email: str = Depends(verify_token)
):
    """Approve or reject a device request"""
    try:
        user = db.get_user_by_email(email)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Get the request
        request_data = db.get_device_request(request_id)
        if not request_data:
            raise HTTPException(status_code=404, detail="Request not found")
        
        if request_data["status"] != "pending":
            raise HTTPException(status_code=400, detail="Request already processed")
        
        # Verify teacher has this student in their classes
        student_id = request_data["student_id"]
        has_access = db.teacher_has_student(user["id"], student_id)
        
        if not has_access:
            raise HTTPException(
                status_code=403,
                detail="You don't have permission to respond to this request"
            )
        
        if response.action == "approve":
            # Add device to student's trusted devices
            student = db.get_student(student_id)
            if student:
                device_info = request_data["device_info"]
                device_info["approved_by"] = user["name"]
                device_info["approved_at"] = datetime.now(timezone.utc).isoformat()
                
                add_trusted_device(student_id, device_info)
                
                # Update request status
                db.update_device_request(request_id, {
                    "status": "approved",
                    "approved_by": user["id"],
                    "approved_by_name": user["name"],
                    "processed_at": datetime.now(timezone.utc).isoformat()
                })
                
                return {
                    "success": True,
                    "message": "Device access approved",
                    "action": "approved"
                }
        else:
            # Reject request
            db.update_device_request(request_id, {
                "status": "rejected",
                "rejected_by": user["id"],
                "rejected_by_name": user["name"],
                "processed_at": datetime.now(timezone.utc).isoformat()
            })
            
            return {
                "success": True,
                "message": "Device access rejected",
                "action": "rejected"
            }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error responding to device request: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to process device request"
        )

@app.get("/teacher/student-devices")
async def get_all_student_devices(email: str = Depends(verify_token)):
    """Get all devices for all students enrolled in teacher's classes"""
    try:
        user = db.get_user_by_email(email)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Get all classes for this teacher
        classes = db.get_all_classes(user["id"])
        
        if not classes:
            return {"students": []}
        
        # Get all enrolled student IDs across all classes
        enrolled_student_ids = set()
        for cls in classes:
            class_id = str(cls["id"])
            enrollments = db.enrollments.find({"class_id": class_id, "status": "active"})
            for enrollment in enrollments:
                enrolled_student_ids.add(enrollment["student_id"])
        
        if not enrolled_student_ids:
            return {"students": []}
        
        # Get device info for each student
        student_devices = []
        for student_id in enrolled_student_ids:
            student = db.get_student(student_id)
            if student:
                devices = student.get("trusted_devices", [])
                if devices:  # Only include students who have devices
                    student_devices.append({
                        "student_id": student_id,
                        "student_name": student.get("name", "Unknown"),
                        "student_email": student.get("email", ""),
                        "devices": devices
                    })
        
        # Sort by student name
        student_devices.sort(key=lambda x: x["student_name"].lower())
        
        return {"students": student_devices}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching student devices: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch student devices"
        )


@app.delete("/teacher/student-devices/{student_id}/{device_id}")
async def remove_student_device(
    student_id: str,
    device_id: str,
    email: str = Depends(verify_token)
):
    """Remove a device from a student's trusted devices (teacher only)"""
    try:
        user = db.get_user_by_email(email)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Verify teacher has this student in their classes
        has_access = db.teacher_has_student(user["id"], student_id)
        
        if not has_access:
            raise HTTPException(
                status_code=403,
                detail="You don't have permission to manage this student's devices"
            )
        
        # Get student
        student = db.get_student(student_id)
        if not student:
            raise HTTPException(status_code=404, detail="Student not found")
        
        # Remove the device
        trusted_devices = student.get("trusted_devices", [])
        updated_devices = [d for d in trusted_devices if d.get("id") != device_id]
        
        if len(updated_devices) == len(trusted_devices):
            raise HTTPException(status_code=404, detail="Device not found")
        
        db.update_student(student_id, {"trusted_devices": updated_devices})
        
        return {
            "success": True,
            "message": "Device removed successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error removing device: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to remove device"
        )

@app.get("/student/devices")
async def get_student_devices(email: str = Depends(verify_token)):
    """Get student's trusted devices"""
    try:
        student = db.get_student_by_email(email)
        if not student:
            raise HTTPException(status_code=404, detail="Student not found")
        
        trusted_devices = student.get("trusted_devices", [])
        
        return {"devices": trusted_devices}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching devices: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch devices"
        )


@app.delete("/student/devices/{device_id}")
async def remove_student_device(device_id: str, email: str = Depends(verify_token)):
    """Remove a trusted device (student can only have one device, but keeping for future extensibility)"""
    try:
        student = db.get_student_by_email(email)
        if not student:
            raise HTTPException(status_code=404, detail="Student not found")
        
        student_id = student["id"]
        trusted_devices = student.get("trusted_devices", [])
        
        # Remove the device
        updated_devices = [d for d in trusted_devices if d.get("id") != device_id]
        
        if len(updated_devices) == len(trusted_devices):
            raise HTTPException(status_code=404, detail="Device not found")
        
        db.update_student(student_id, {"trusted_devices": updated_devices})
        
        return {
            "success": True,
            "message": "Device removed successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error removing device: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to remove device"
        )

# ==================== STUDENT ENROLLMENT ENDPOINTS ====================

@app.post("/student/enroll")
async def enroll_in_class(request: StudentEnrollmentRequest, email: str = Depends(verify_token)):
    """
    Enroll student in a class.
    - If student was previously enrolled and unenrolled, restore their data
    - If new enrollment, create new record
    - Email must match logged-in user (security)
    """
    try:
        # Get student data
        student = db.get_student_by_email(email)
        if not student:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")
        
        student_id = student['id']
        
        # SECURITY: Ensure the email in request matches logged-in user
        if request.email != email:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You must use your registered email"
            )
        
        # Prepare student info
        student_info = {
            "name": request.name,
            "rollNo": request.rollNo,
            "email": request.email
        }
        
        # Enroll student - this handles re-enrollment with data preservation
        enrollment = db.enroll_student(student_id, request.class_id, student_info)
        
        return {
            "success": True,
            "message": enrollment.get("message", "Successfully enrolled in class"),
            "enrollment": enrollment
        }
        
    except ValueError as e:
        error_message = str(e)
        print(f"[ENROLL_ENDPOINT] ValueError: {error_message}")
        
        if "already enrolled" in error_message.lower():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error_message)
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error_message)
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ENROLL_ENDPOINT] ERROR: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to enroll in class"
        )
    
    
@app.delete("/student/unenroll/{class_id}")
async def unenroll_from_class(class_id: str, email: str = Depends(verify_token)):
    """Unenroll student from a class"""
    try:
        # Get student data
        student = db.get_student_by_email(email)
        if not student:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Student not found"
            )
        
        # Verify class exists
        class_data = db.get_class_by_id(class_id)
        if not class_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Class not found"
            )
        
        # Unenroll student
        success = db.unenroll_student(student["id"], class_id)
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You are not enrolled in this class"
            )
        
        return {
            "success": True,
            "message": "Successfully unenrolled from class"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Unenrollment error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to unenroll from class: {str(e)}"
        )

@app.get("/student/classes")
async def get_student_classes(email: str = Depends(verify_token)):
    """Get all classes a student is enrolled in"""
    try:
        print(f"\n{'='*60}")
        print(f"[STUDENT_CLASSES] Loading classes for {email}")
        print(f"{'='*60}")
        
        student = db.get_student_by_email(email)
        if not student:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Student not found"
            )
        
        student_id = student["id"]
        print(f"[STUDENT_CLASSES] Student ID: {student_id}")
        
        enrolled_classes = db.get_student_enrollments(student_id)
        print(f"[STUDENT_CLASSES] Found {len(enrolled_classes)} enrollments")
        
        # Get detailed info for each class
        classes_details = []
        for enrollment in enrolled_classes:
            class_id = enrollment["class_id"]
            print(f"\n[STUDENT_CLASSES] Processing class: {class_id}")
            
            class_details = db.get_student_class_details(student_id, class_id)
            
            if class_details:
                # ✅ DEBUG: Print what we're sending
                print(f"[STUDENT_CLASSES] Class details:")
                print(f"  Name: {class_details.get('class_name')}")
                print(f"  Student Record ID: {class_details['student_record'].get('id')}")
                
                attendance = class_details['student_record'].get('attendance', {})
                print(f"  Attendance entries: {len(attendance)}")
                
                if attendance:
                    # Show first entry to verify format
                    first_date = list(attendance.keys())[0]
                    first_value = attendance[first_date]
                    print(f"  Sample ({first_date}): {first_value}")
                
                print(f"  Statistics: {class_details.get('statistics')}")
                
                classes_details.append(class_details)
        
        print(f"\n[STUDENT_CLASSES] ✅ Returning {len(classes_details)} classes")
        print(f"{'='*60}\n")
        
        return {
            "classes": classes_details
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[STUDENT_CLASSES] ❌ Error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch classes"
        )

@app.get("/student/class/{class_id}")
async def get_student_class_detail(class_id: str, email: str = Depends(verify_token)):
    """Get detailed information about a specific class"""
    try:
        student = db.get_student_by_email(email)
        if not student:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Student not found"
            )
        
        class_details = db.get_student_class_details(student["id"], class_id)
        if not class_details:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Class not found or student not enrolled"
            )
        
        return {
            "class": class_details
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching class details: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch class details"
        )


@app.get("/class/verify/{class_id}")
async def verify_class_exists(class_id: str):
    """Verify if a class exists (public endpoint for enrollment)"""
    try:
        class_data = db.get_class_by_id(class_id)
        if not class_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Class not found"
            )
        
        # Get teacher info
        teacher_id = class_data.get("teacher_id")
        teacher_name = "Unknown"
        if teacher_id:
            teacher = db.get_user(teacher_id)
            if teacher:
                teacher_name = teacher.get("name", "Unknown")
        
        return {
            "exists": True,
            "class_name": class_data.get("name", ""),
            "teacher_name": teacher_name,
            "class_id": class_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error verifying class: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to verify class"
        )


# 5. UPDATE your existing verify-email endpoint to handle both roles
# REPLACE your existing @app.post("/auth/verify-email") with this:

@app.post("/auth/verify-email", response_model=TokenResponse)
async def verify_email(request: VerifyEmailRequest):
    """Verify email with code - handles both teacher and student"""
    try:
        if not db.check_verification_code_exists(request.email):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No verification code found"
            )
        
        stored_data = db.get_verification_code(request.email)
        expires_at = datetime.fromisoformat(stored_data["expires_at"])
        
        if datetime.utcnow() > expires_at:
            db.delete_verification_code(request.email)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Verification code expired"
            )
        
        if stored_data["code"] != request.code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid verification code"
            )
        
        # Get role from stored data (default to teacher for backward compatibility)
        role = stored_data.get("role", "teacher")
        
        # Create user based on role
        if role == "student":
            user_id = f"student_{int(datetime.utcnow().timestamp())}"
            user_data = db.create_student(
                student_id=user_id,
                email=request.email,
                name=stored_data["name"],
                password_hash=stored_data["password"]
            )
        else:
            user_id = f"user_{int(datetime.utcnow().timestamp())}"
            user_data = db.create_user(
                user_id=user_id,
                email=request.email,
                name=stored_data["name"],
                password_hash=stored_data["password"]
            )
        
        # Clean up verification code
        db.delete_verification_code(request.email)
        
        # Create access token with role
        access_token = create_access_token(
            data={"sub": request.email, "role": role},
            expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        )
        
        return TokenResponse(
            access_token=access_token,
            user=UserResponse(id=user_id, email=request.email, name=stored_data["name"])
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"Verification error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Verification failed: {str(e)}"
        )


# ==================== CLASS ENDPOINTS ====================

@app.get("/classes")
async def get_classes(email: str = Depends(verify_token)):
    """Get all classes for the current user"""
    user = db.get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    classes = db.get_all_classes(user["id"])
    return {"classes": classes}


@app.post("/classes")
async def create_class(class_data: ClassRequest, email: str = Depends(verify_token)):
    """Create a new class"""
    user = db.get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    created_class = db.create_class(user["id"], class_data.model_dump())
    return {"success": True, "class": created_class}


@app.get("/classes/{class_id}")
async def get_class(class_id: str, email: str = Depends(verify_token)):
    """Get a specific class"""
    user = db.get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    class_data = db.get_class(user["id"], class_id)
    if not class_data:
        raise HTTPException(status_code=404, detail="Class not found")
    
    return {"class": class_data}


@app.put("/classes/{class_id}")
async def update_class(
    class_id: str,
    class_data: ClassRequest,
    email: str = Depends(verify_token)
):
    """Update a class - handles student deletions AND preserves inactive student data"""
    print(f"\n{'='*60}")
    print(f"[UPDATE_CLASS API] Updating class {class_id}")
    print(f"{'='*60}")
    
    try:
        user = db.get_user_by_email(email)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        user_id = user["id"]
        payload = class_data.model_dump()
        
        # Let db_manager handle ALL the logic
        updated_class = db.update_class(user_id, class_id, payload)
        
        print(f"[UPDATE_CLASS API] ✅ Class updated successfully")
        print(f"{'='*60}\n")
        
        return {"success": True, "class": updated_class}
    
    except ValueError as e:
        # Fallback for MongoDB numeric-id mismatches (prevents false 404s)
        if DB_TYPE == "mongodb" and hasattr(db, "classes"):
            try:
                from datetime import datetime

                # Try to locate the class doc using a few id representations
                id_candidates = []
                id_candidates.append(class_id)
                try:
                    id_candidates.append(int(class_id))
                except Exception:
                    pass
                try:
                    id_candidates.append(int(payload.get("id")))
                except Exception:
                    pass

                # de-dupe candidates
                seen = set()
                deduped = []
                for v in id_candidates:
                    k = (type(v), v)
                    if k in seen:
                        continue
                    seen.add(k)
                    deduped.append(v)

                existing = db.classes.find_one({"teacher_id": user_id, "id": {"$in": deduped}}, {"_id": 0})
                if existing:
                    stored_id = existing.get("id")
                    payload["teacher_id"] = user_id
                    payload["id"] = stored_id
                    payload["updated_at"] = datetime.utcnow().isoformat()

                    # Recompute stats if the db object supports it
                    if hasattr(db, "calculate_class_statistics"):
                        try:
                            payload["statistics"] = db.calculate_class_statistics(payload, str(stored_id))
                        except Exception:
                            pass

                    db.classes.update_one({"teacher_id": user_id, "id": stored_id}, {"$set": payload})
                    updated = db.classes.find_one({"teacher_id": user_id, "id": stored_id}, {"_id": 0})

                    print("[UPDATE_CLASS API] ✅ Class updated successfully (MongoDB fallback)")
                    print(f"{'='*60}\n")
                    return {"success": True, "class": updated}
            except Exception as fallback_err:
                print(f"[UPDATE_CLASS API] MongoDB fallback failed: {fallback_err}")

        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        print(f"[UPDATE_CLASS API] ❌ Error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to update class: {str(e)}")

@app.put("/classes/{class_id}/multi-session-attendance")
async def update_multi_session_attendance(
    class_id: str,
    request: MultiSessionAttendanceUpdate,
    email: str = Depends(verify_token)
):
    try:
        print("\n" + "="*80)
        print("[MULTI_SESSION_API] REQUEST RECEIVED")
        print(f"  Class ID: {class_id}")
        print(f"  Student ID: {request.student_id}")
        print(f"  Date: {request.date}")
        print(f"  Sessions: {[{**s.dict(), 'status': s.status} for s in request.sessions]}")
        print("="*80)
        
        # Get user
        user = db.get_user_by_email(email)
        if not user:
            print("[MULTI_SESSION_API] ❌ User not found")
            raise HTTPException(status_code=404, detail="User not found")
        
        print(f"[MULTI_SESSION_API] User: {user['name']} ({user['id']})")
        
        # Filter valid sessions
        valid_sessions = [
            s for s in request.sessions 
            if s.status is not None and s.status in ['P', 'A', 'L']
        ]
        
        print(f"[MULTI_SESSION_API] Valid sessions: {len(valid_sessions)}/{len(request.sessions)}")
        
        # Get class
        class_data = db.get_class(user["id"], str(class_id))
        if not class_data:
            print(f"[MULTI_SESSION_API] ❌ Class not found: {class_id}")
            raise HTTPException(status_code=404, detail="Class not found")
        
        print(f"[MULTI_SESSION_API] Class: {class_data.get('name')}")
        print(f"[MULTI_SESSION_API] Mode: {class_data.get('enrollment_mode', 'manual_entry')}")
        print(f"[MULTI_SESSION_API] Total students: {len(class_data.get('students', []))}")
        
        # Find student
        student_found = False
        student_name = None
        
        # Convert request.student_id to string for comparison
        target_student_id = str(request.student_id)
        
        for student in class_data['students']:
            # Convert student ID to string for comparison
            if str(student['id']) == target_student_id:
                student_found = True
                student_name = student.get('name', 'Unknown')
                
                print(f"[MULTI_SESSION_API] ✅ Found student: {student_name} (ID: {student['id']})")
                
                # Initialize attendance
                if 'attendance' not in student:
                    student['attendance'] = {}
                
                # Save or clear attendance
                if valid_sessions:
                    student['attendance'][request.date] = {
                        'sessions': [
                            {
                                'id': s.id,
                                'name': s.name,
                                'status': s.status
                            }
                            for s in valid_sessions
                        ],
                        'updated_at': datetime.now(timezone.utc).isoformat()
                    }
                    print(f"[MULTI_SESSION_API] ✅ Saved {len(valid_sessions)} sessions for {request.date}")
                else:
                    if request.date in student['attendance']:
                        del student['attendance'][request.date]
                        print(f"[MULTI_SESSION_API] ✅ Cleared attendance for {request.date}")
                
                break
        
        if not student_found:
            print(f"[MULTI_SESSION_API] ❌ Student not found with ID: {target_student_id}")
            print(f"[MULTI_SESSION_API] Available student IDs: {[str(s['id']) for s in class_data['students'][:5]]}")
            raise HTTPException(
                status_code=404,
                detail=f"Student not found in class"
            )
        
        # Recalculate statistics
        total_present = 0
        total_absent = 0
        total_late = 0
        total_sessions = 0
        
        for student in class_data['students']:
            if 'attendance' in student:
                for date_key, attendance_data in student['attendance'].items():
                    if isinstance(attendance_data, dict) and 'sessions' in attendance_data:
                        for session in attendance_data['sessions']:
                            total_sessions += 1
                            if session['status'] == 'P':
                                total_present += 1
                            elif session['status'] == 'A':
                                total_absent += 1
                            elif session['status'] == 'L':
                                total_late += 1
                    elif isinstance(attendance_data, dict) and 'status' in attendance_data:
                        count = attendance_data.get('count', 1)
                        total_sessions += count
                        if attendance_data['status'] == 'P':
                            total_present += count
                        elif attendance_data['status'] == 'A':
                            total_absent += count
                        elif attendance_data['status'] == 'L':
                            total_late += count
                    elif isinstance(attendance_data, str):
                        total_sessions += 1
                        if attendance_data == 'P':
                            total_present += 1
                        elif attendance_data == 'A':
                            total_absent += 1
                        elif attendance_data == 'L':
                            total_late += 1
        
        avg_attendance = 0
        if total_sessions > 0:
            avg_attendance = ((total_present + total_late) / total_sessions) * 100
        
        class_data['statistics'] = {
            'totalStudents': len(class_data['students']),
            'avgAttendance': round(avg_attendance, 3),
            'atRiskCount': 0,
            'excellentCount': 0
        }
        
        # Save to database
        class_data['updated_at'] = datetime.now(timezone.utc).isoformat()
        class_file = db.get_class_file(user["id"], str(class_id))
        db.write_json(class_file, class_data)
        
        print(f"[MULTI_SESSION_API] ✅ Saved to database")
        print(f"[MULTI_SESSION_API] Stats: {total_sessions} sessions, {avg_attendance:.1f}% avg")
        print("="*80 + "\n")
        
        return {
            "success": True,
            "message": f"Attendance updated for {student_name}",
            "class": class_data
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[MULTI_SESSION_API] ❌ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        print("="*80 + "\n")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update attendance: {str(e)}"
        )
        
@app.delete("/classes/{class_id}")
async def delete_class(class_id: str, email: str = Depends(verify_token)):
    """Delete a class"""
    user = db.get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    success = db.delete_class(user["id"], class_id)
    if not success:
        raise HTTPException(status_code=404, detail="Class not found")
    
    return {"success": True, "message": "Class deleted successfully"}

# ==================== ATTENDANCE SESSION ENDPOINTS ====================

@app.post("/sessions")
async def create_session(request: AttendanceSessionRequest, email: str = Depends(verify_token)):
    """Create a new attendance session"""
    print(f"\n{'='*60}")
    print(f"[CREATE_SESSION API] New session creation request")
    print(f"  Email: {email}")
    print(f"  Class ID: {request.class_id}")
    print(f"  Date: {request.date}")
    print(f"  Session Name: {request.sessionName}")
    print(f"  Start Time: {request.startTime}")
    print(f"  End Time: {request.endTime}")
    print(f"{'='*60}\n")
    
    try:
        # Get user
        user = db.get_user_by_email(email)
        if not user:
            print(f"[CREATE_SESSION API] ❌ User not found: {email}")
            raise HTTPException(status_code=404, detail="User not found")
        
        print(f"[CREATE_SESSION API] ✅ User found: {user['id']}")
        
        # Verify class ownership
        class_data = db.get_class(user["id"], request.class_id)
        if not class_data:
            print(f"[CREATE_SESSION API] ❌ Class not found: {request.class_id}")
            raise HTTPException(status_code=404, detail="Class not found")
        
        print(f"[CREATE_SESSION API] ✅ Class verified: {class_data.get('name')}")
        
        # Create session
        session_data_dict = request.model_dump()
        print(f"[CREATE_SESSION API] Calling db.create_attendance_session...")
        
        session = db.create_attendance_session(
            user["id"],
            request.class_id,
            session_data_dict
        )
        
        print(f"[CREATE_SESSION API] ✅ Session created successfully: {session['id']}")
        return {"success": True, "session": session}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[CREATE_SESSION API] ❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to create session: {str(e)}"
        )

@app.get("/sessions/{class_id}")
async def get_sessions(class_id: str, date: Optional[str] = None, email: str = Depends(verify_token)):
    """Get all sessions for a class, optionally filtered by date"""
    try:
        user = db.get_user_by_email(email)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        sessions = db.get_class_sessions(user["id"], class_id, date)
        return {"sessions": sessions}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Get sessions error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get sessions")


@app.put("/sessions/attendance")
async def update_session_attendance(
    request: SessionAttendanceUpdate,
    class_id: str,
    email: str = Depends(verify_token)
):
    """Update attendance for a specific session"""
    try:
        user = db.get_user_by_email(email)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        success = db.update_session_attendance(
            user["id"],
            class_id,
            request.session_id,
            request.student_id,
            request.status
        )
        
        if not success:
            raise HTTPException(status_code=404, detail="Session not found")
        
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Update attendance error: {e}")
        raise HTTPException(status_code=500, detail="Failed to update attendance")


@app.delete("/sessions/{class_id}/{session_id}")
async def delete_session(class_id: str, session_id: str, email: str = Depends(verify_token)):
    """Delete an attendance session"""
    try:
        user = db.get_user_by_email(email)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        success = db.delete_attendance_session(user["id"], class_id, session_id)
        
        if not success:
            raise HTTPException(status_code=404, detail="Session not found")
        
        return {"success": True, "message": "Session deleted"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Delete session error: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete session")


@app.get("/sessions/{class_id}/student/{student_id}/day/{date}")
async def get_student_day_stats(
    class_id: str,
    student_id: str,
    date: str,
    email: str = Depends(verify_token)
):
    """Get student's attendance stats for a specific day across all sessions"""
    try:
        user = db.get_user_by_email(email)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        stats = db.get_student_day_attendance(user["id"], class_id, student_id, date)
        return stats
    except HTTPException:
        raise
    except Exception as e:
        print(f"Get day stats error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get day stats")

# ==================== CONTACT ENDPOINT ====================

@app.post("/contact")
async def submit_contact(request: ContactRequest):
    """Submit contact form"""
    try:
        message_data = {
            "name": request.name,
            "subject": request.subject,
            "message": request.message
        }
        
        success = db.save_contact_message(request.email, message_data)
        
        if success:
            return {"success": True, "message": "Message received successfully"}
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to save message"
            )
    except Exception as e:
        print(f"Contact form error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process contact form"
        )
    
    # ==================== QR CODE ATTENDANCE ENDPOINTS ====================

@app.post("/qr/start-session")
async def start_qr_session(request: dict, email: str = Depends(verify_token)):
    """Start QR session for a date"""
    class_id = request.get("class_id")
    date = request.get("date")  # YYYY-MM-DD format
    rotation_interval = request.get("rotation_interval", 5)
    
    if not class_id or not date:
        raise HTTPException(status_code=400, detail="class_id and date are required")
    
    print(f"\n[QR_START] ═══════════════════════════════════")
    print(f"[QR_START] Starting QR session")
    print(f"[QR_START] Class: {class_id}, Date: {date}")
    print(f"[QR_START] Interval: {rotation_interval}s")
    
    user = db.get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Verify class ownership
    class_data = db.get_class(user["id"], class_id)
    if not class_data:
        raise HTTPException(status_code=404, detail="Class not found")
    
    try:
        # Calculate session number
        session_number = get_current_session_number_for_date(class_data, date)
        print(f"[QR_START] Session number: {session_number}")
        
        # Generate QR code
        import random
        import string
        code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
        print(f"[QR_START] Generated code: {code}")
        
        # ✅ CRITICAL FIX: Use consistent timestamp format
        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()
        
        # Create session data
        session_data = {
            "class_id": class_id,
            "teacher_id": user["id"],
            "date": date,
            "current_code": code,
            "rotation_interval": int(rotation_interval),  # Ensure integer
            "session_number": session_number,
            "scanned_students": [],
            "started_at": now_iso,
            "last_rotation": now_iso,
            "code_generated_at": now_iso  # ✅ This is the key field for rotation
        }
        
        # Store in active sessions
        session_key = f"{class_id}_{date}"
        if not hasattr(db, 'active_qr_sessions'):
            db.active_qr_sessions = {}
        db.active_qr_sessions[session_key] = session_data
        
        print(f"[QR_START] ✅ Session started successfully")
        print(f"[QR_START] ═══════════════════════════════════\n")
        
        return {"success": True, "session": session_data}
        
    except ValueError as e:
        print(f"[QR_START] ❌ ValueError: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"[QR_START] ❌ Error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to start QR session: {str(e)}")

def rotate_qr_code_if_needed(session: Dict[str, Any]) -> Dict[str, Any]:
    """
    Check if QR code needs rotation and rotate if needed.
    Returns updated session data.
    """
    import random
    import string
    from datetime import datetime, timezone
    
    rotation_interval = session.get("rotation_interval", 5)
    
    # Get last rotation time
    last_rotation = session.get("code_generated_at") or session.get("last_rotation") or session.get("started_at")
    
    if not last_rotation:
        print("[ROTATE] ⚠️ No timestamp found, skipping rotation")
        return session
    
    # Parse ISO timestamp
    try:
        if isinstance(last_rotation, str):
            # Handle both formats: with and without 'Z' suffix
            last_rotation_clean = last_rotation.replace('Z', '').replace('+00:00', '')
            last_rotation_dt = datetime.fromisoformat(last_rotation_clean)
            # Ensure timezone aware
            if last_rotation_dt.tzinfo is None:
                last_rotation_dt = last_rotation_dt.replace(tzinfo=timezone.utc)
        else:
            last_rotation_dt = last_rotation
            if last_rotation_dt.tzinfo is None:
                last_rotation_dt = last_rotation_dt.replace(tzinfo=timezone.utc)
    except Exception as e:
        print(f"[ROTATE] ❌ Error parsing timestamp: {e}, value: {last_rotation}")
        return session
    
    # Calculate elapsed time
    now = datetime.now(timezone.utc)
    elapsed_seconds = (now - last_rotation_dt).total_seconds()
    
    print(f"[ROTATE] Checking: elapsed={elapsed_seconds:.1f}s, interval={rotation_interval}s")
    
    # ✅ CRITICAL FIX: Add buffer to prevent premature rotation
    # Only rotate if we're past the interval by at least 0.5 seconds
    if elapsed_seconds >= (rotation_interval - 0.5):
        new_code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
        now_iso = now.isoformat()
        
        # Update all timestamp fields
        session["current_code"] = new_code
        session["last_rotation"] = now_iso
        session["code_generated_at"] = now_iso
        
        print(f"[ROTATE] ✅ Code rotated to: {new_code} (after {elapsed_seconds:.1f}s)")
        return session
    else:
        print(f"[ROTATE] ⏳ Not yet, need {rotation_interval - elapsed_seconds:.1f}s more")
        return session

@app.get("/qr/session/{class_id}")
async def get_qr_session(class_id: str, date: str, email: str = Depends(verify_token)):
    """Get active QR session with auto-rotation"""
    user = db.get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    session_key = f"{class_id}_{date}"
    
    # Check active sessions
    if not hasattr(db, 'active_qr_sessions'):
        db.active_qr_sessions = {}
    
    session = db.active_qr_sessions.get(session_key)
    
    if not session or session["teacher_id"] != user["id"]:
        return {"active": False}
    
    # ✅ CRITICAL: Always check and rotate if needed
    print(f"\n[QR_SESSION] Polling session {session_key}")
    print(f"[QR_SESSION] Current code: {session.get('current_code')}")
    print(f"[QR_SESSION] Last rotation: {session.get('code_generated_at')}")
    
    # Rotate if needed
    updated_session = rotate_qr_code_if_needed(session)
    
    # ✅ CRITICAL: Update in memory storage
    db.active_qr_sessions[session_key] = updated_session
    
    print(f"[QR_SESSION] After rotation check: {updated_session.get('current_code')}")
    print(f"[QR_SESSION] Response ready\n")
    
    return {"active": True, "session": updated_session}
    
@app.post("/qr/scan")
async def scan_qr_code(
    request: QRScanRequest,
    email: str = Depends(verify_token)
):
    """Student scans QR code to mark attendance"""
    print(f"\n[QR_SCAN] Request from {email} for class {request.class_id}")
    
    try:
        # Get student
        student = db.get_student_by_email(email)
        if not student:
            print(f"[QR_SCAN] ❌ Student not found: {email}")
            raise HTTPException(
                status_code=404,
                detail="Student not found"
            )
        
        student_id = student["id"]
        print(f"[QR_SCAN] ✓ Student: {student['name']} ({student_id})")
        
        # Parse QR code
        try:
            qr_data = json.loads(request.qr_code)
            date = qr_data["date"]
            qr_code_value = qr_data["code"]
            qr_class_id = str(qr_data["class_id"])
            print(f"[QR_SCAN] ✓ QR parsed: date={date}, code={qr_code_value}")
        except (json.JSONDecodeError, KeyError) as e:
            print(f"[QR_SCAN] ❌ Invalid QR format: {e}")
            raise HTTPException(
                status_code=400,
                detail="Invalid QR code format"
            )
        
        # Validate class match
        if qr_class_id != str(request.class_id):
            print(f"[QR_SCAN] ❌ Class mismatch: {qr_class_id} != {request.class_id}")
            raise HTTPException(
                status_code=400,
                detail="This QR code is for a different class!"
            )
        
        # Get active session
        session_key = f"{request.class_id}_{date}"
        if not hasattr(db, 'active_qr_sessions'):
            db.active_qr_sessions = {}
        
        session = db.active_qr_sessions.get(session_key)
        if not session:
            print(f"[QR_SCAN] ❌ No active session for {session_key}")
            raise HTTPException(
                status_code=404,
                detail="No active QR session for this date. Teacher may have stopped the session."
            )
        
        print(f"[QR_SCAN] ✓ Session found: #{session['session_number']}")
        
        # Validate QR code
        if session["current_code"] != qr_code_value:
            print(f"[QR_SCAN] ❌ Code mismatch")
            raise HTTPException(
                status_code=400,
                detail="Invalid or expired QR code. Please try scanning again."
            )
        
        session_number = session["session_number"]
        
        # Check enrollment
        enrollment = db.enrollments.find_one({
            "student_id": student_id,
            "class_id": request.class_id,
            "status": "active"
        })
        
        if not enrollment:
            print(f"[QR_SCAN] ❌ Not enrolled")
            raise HTTPException(
                status_code=403,
                detail="You are not enrolled in this class"
            )
        
        student_record_id = enrollment["student_record_id"]
        print(f"[QR_SCAN] ✓ Enrollment confirmed: {student_record_id}")
        
        # Get class data
        class_file = db.get_class_file(session["teacher_id"], request.class_id)
        class_data = db.read_json(class_file)
        
        # Find student record
        students = class_data["students"]
        student_index = None
        student_record = None
        
        for idx, s in enumerate(students):
            if s["id"] == student_record_id:
                student_record = s
                student_index = idx
                break
        
        if student_record is None:
            print(f"[QR_SCAN] ❌ Student record not found in class")
            raise HTTPException(
                status_code=404,
                detail="Student record not found in class"
            )
        
        print(f"[QR_SCAN] ✓ Found student record: {student_record['name']}")
        
        # Initialize attendance
        if "attendance" not in student_record:
            student_record["attendance"] = {}
        
        current_value = student_record["attendance"].get(date)
                
        # Mark attendance
        if session_number == 1:
            # Check if there's existing data
            if current_value is None:
                student_record["attendance"][date] = "P"
                print(f"[QR_SCAN] ✓ Marked as 'P' (first session)")
            else:
                # Already has data - convert to sessions format
                if isinstance(current_value, str):
                    sessions = [{
                        "id": "session_1",
                        "name": "Session 1",
                        "status": current_value  # Preserve manual entry
                    }]
                elif isinstance(current_value, dict) and "sessions" in current_value:
                    sessions = current_value["sessions"]
                else:
                    sessions = [{
                        "id": "session_1",
                        "name": "Session 1",
                        "status": "P"
                    }]
                
                student_record["attendance"][date] = {
                    "sessions": sessions,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
                print(f"[QR_SCAN] ✓ Preserved existing session 1")
            
        else:
            # Multi-session
            if isinstance(current_value, str) or current_value is None:
                sessions = []
                for i in range(1, session_number + 1):
                    status = (
                        current_value if (i == 1 and isinstance(current_value, str))
                        else ("P" if i == session_number else "A")
                    )
                    sessions.append({
                        "id": f"session_{i}",
                        "name": f"Session {i}",
                        "status": status
                    })
                
                student_record["attendance"][date] = {
                    "sessions": sessions,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
                print(f"[QR_SCAN] ✓ Created {len(sessions)} sessions")
                
            elif isinstance(current_value, dict) and "sessions" in current_value:
                sessions = current_value["sessions"]
                session_found = False
                
                # Only update current session
                for s in sessions:
                    if s["id"] == f"session_{session_number}":
                        s["status"] = "P"
                        session_found = True
                        break
                
                if not session_found:
                    # Fill missing sessions
                    existing_ids = {int(s["id"].split("_")[1]) for s in sessions}
                    
                    for i in range(1, session_number + 1):
                        if i not in existing_ids:
                            sessions.append({
                                "id": f"session_{i}",
                                "name": f"Session {i}",
                                "status": "A" if i != session_number else "P"
                            })
                
                sessions.sort(key=lambda x: int(x["id"].split("_")[1]))
                
                student_record["attendance"][date] = {
                    "sessions": sessions,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
                print(f"[QR_SCAN] ✓ Updated session #{session_number} (preserved manual)")

        # Save to database
        students[student_index] = student_record
        class_data["students"] = students
        class_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        class_data["statistics"] = db.calculate_class_statistics(
            class_data,
            request.class_id
        )
        
        db.write_json(class_file, class_data)
        print(f"[QR_SCAN] ✓ Saved to database")
        
        # Update session scanned students
        scanned = session.get("scanned_students", [])
        if student_record_id not in scanned:
            scanned.append(student_record_id)
            session["scanned_students"] = scanned
            db.active_qr_sessions[session_key] = session
            print(f"[QR_SCAN] ✓ Added to scanned list ({len(scanned)} total)")
        
        print(f"[QR_SCAN] ✅ SUCCESS - {student_record['name']} marked present\n")
        
        return {
            "success": True,
            "message": f"Attendance marked successfully! (Session #{session_number})",
            "session_number": session_number,
            "date": date,
            "student_name": student_record["name"]
        }
        
    except HTTPException:
        raise
        
    except Exception as e:
        print(f"[QR_SCAN] ❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to scan QR code: {str(e)}"
        )
    
@app.post("/qr/stop-session")
async def stop_qr_session(payload: dict, email: str = Depends(verify_token)):
    """Stop QR session and mark absent for non-scanners"""
    class_id = payload.get("class_id")
    date = payload.get("date")
    
    if not class_id or not date:
        raise HTTPException(status_code=400, detail="class_id and date required")

    user = db.get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        print(f"\n[QR_STOP] Stopping session for class {class_id}, date {date}")
        
        session_key = f"{class_id}_{date}"
        
        # Get active session
        if not hasattr(db, 'active_qr_sessions'):
            db.active_qr_sessions = {}
        
        session = db.active_qr_sessions.get(session_key)
        
        if not session:
            raise HTTPException(status_code=404, detail="No active session found")
        
        if session.get("teacher_id") != user["id"]:
            raise HTTPException(status_code=403, detail="Unauthorized")
        
        session_number = session.get("session_number", 1)
        scanned_students = set(session.get("scanned_students", []))
        
        print(f"[QR_STOP] Session #{session_number}, Scanned: {len(scanned_students)}")
        
        # Get class data
        class_data = db.get_class(user["id"], class_id)
        if not class_data:
            raise HTTPException(status_code=404, detail="Class not found")
        
        students = class_data.get("students", [])
        absent_count = 0
        
        # Mark absent for non-scanned students
        for student in students:
            student_id = student.get("id")
            
            if student_id not in scanned_students:
                if "attendance" not in student:
                    student["attendance"] = {}
                
                current_value = student["attendance"].get(date)
                
                if session_number == 1:
                    # First session - simple 'A'
                    student["attendance"][date] = "A"
                else:
                    # Multi-session handling
                    if isinstance(current_value, str) or current_value is None:
                        # Convert to sessions array
                        sessions = []
                        for i in range(1, session_number + 1):
                            sessions.append({
                                "id": f"session_{i}",
                                "name": f"QR Session {i}",
                                "status": current_value if (i == 1 and isinstance(current_value, str)) else "A"
                            })
                        student["attendance"][date] = {
                            "sessions": sessions,
                            "updated_at": datetime.now(timezone.utc).isoformat()
                        }
                    elif isinstance(current_value, dict) and "sessions" in current_value:
                        # Update existing sessions
                        sessions = current_value.get("sessions", [])
                        existing_ids = {s.get("id") for s in sessions}
                        
                        # Add missing sessions
                        for i in range(1, session_number + 1):
                            session_id = f"session_{i}"
                            if session_id not in existing_ids:
                                sessions.insert(i - 1, {
                                    "id": session_id,
                                    "name": f"QR Session {i}",
                                    "status": "A"
                                })
                        
                        student["attendance"][date] = {
                            "sessions": sessions,
                            "updated_at": datetime.now(timezone.utc).isoformat()
                        }
                
                absent_count += 1
        
        # Update class in database
        class_data["students"] = students
        class_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        class_data["statistics"] = db.calculate_class_statistics(class_data, class_id)
        
        class_file = db.get_class_file(user["id"], class_id)
        db.write_json(class_file, class_data)
        
        # Update teacher overview
        db.update_user_overview(user["id"])
        
        # Remove active session
        del db.active_qr_sessions[session_key]
        
        print(f"[QR_STOP] ✅ Session stopped successfully")
        print(f"  Scanned: {len(scanned_students)}, Absent: {absent_count}")
        
        return {
            "success": True,
            "scanned_count": len(scanned_students),
            "absent_count": absent_count,
            "session_number": session_number,
            "date": date
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[QR_STOP] ❌ Error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to stop session: {str(e)}")

@app.get("/qr/debug/{class_id}")
async def debug_qr_session(class_id: str, date: str, email: str = Depends(verify_token)):
    """Debug endpoint to see raw session data"""
    user = db.get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    session_key = f"{class_id}_{date}"
    
    if not hasattr(db, 'active_qr_sessions'):
        return {"error": "No active sessions"}
    
    session = db.active_qr_sessions.get(session_key)
    
    if not session:
        return {"error": "Session not found", "session_key": session_key}
    
    # Calculate time info
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    last_rotation = session.get("code_generated_at") or session.get("last_rotation")
    
    if last_rotation:
        try:
            last_rotation_clean = str(last_rotation).replace('Z', '').replace('+00:00', '')
            last_rotation_dt = datetime.fromisoformat(last_rotation_clean)
            if last_rotation_dt.tzinfo is None:
                last_rotation_dt = last_rotation_dt.replace(tzinfo=timezone.utc)
            elapsed = (now - last_rotation_dt).total_seconds()
        except:
            elapsed = -1
    else:
        elapsed = -1
    
    return {
        "session_key": session_key,
        "current_code": session.get("current_code"),
        "rotation_interval": session.get("rotation_interval"),
        "session_number": session.get("session_number"),
        "started_at": session.get("started_at"),
        "last_rotation": session.get("last_rotation"),
        "code_generated_at": session.get("code_generated_at"),
        "elapsed_seconds": round(elapsed, 2) if elapsed >= 0 else "N/A",
        "time_until_next": round(session.get("rotation_interval", 5) - elapsed, 2) if elapsed >= 0 else "N/A",
        "scanned_count": len(session.get("scanned_students", [])),
        "now_utc": now.isoformat()
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
