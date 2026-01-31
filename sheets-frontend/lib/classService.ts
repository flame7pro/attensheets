const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

import { Class } from '@/types';

export interface AttendanceCounts {
  P: number;
  A: number;
  L: number;
}

class ClassService {
  private getAuthHeaders(): Record<string, string> {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    return {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
    };
  }

  private async apiCall<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    let response: Response;

    try {
      response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: {
          ...this.getAuthHeaders(),
          ...(options.headers as Record<string, string>),
        },
      });
    } catch (err) {
      // Browser network errors (CORS blocked, backend down, connection reset) surface as TypeError("Failed to fetch").
      // Provide a more actionable message.
      const hint = `Network error calling ${API_URL}${endpoint}. Is the backend running on port 8000 and CORS allowing this origin?`;
      throw new Error(hint);
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || error.message || `API Error: ${response.statusText}`);
    }

    return response.json();
  }

  async getAllClasses(): Promise<Class[]> {
    try {
      const result = await this.apiCall<{ classes: Class[] }>('/classes');
      return result.classes;
    } catch (error) {
      console.error('Error fetching classes:', error);
      throw error;
    }
  }

  async getClass(classId: string): Promise<Class> {
    try {
      const result = await this.apiCall<{ class: Class }>(`/classes/${classId}`);
      return result.class;
    } catch (error) {
      console.error('Error fetching class:', error);
      throw error;
    }
  }

  async createClass(classData: Class): Promise<Class> {
    try {
      const result = await this.apiCall<{ success: boolean; class: Class }>('/classes', {
        method: 'POST',
        body: JSON.stringify(classData),
      });
      return result.class;
    } catch (error) {
      console.error('Error creating class:', error);
      throw error;
    }
  }

  async updateClass(classId: string, classData: Class): Promise<Class> {
    try {
      const result = await this.apiCall<{ success: boolean; class: Class }>(`/classes/${classId}`, {
        method: 'PUT',
        body: JSON.stringify(classData),
      });
      return result.class;
    } catch (error) {
      console.error('Error updating class:', error);
      throw error;
    }
  }

  async deleteClass(classId: string): Promise<boolean> {
    try {
      const result = await this.apiCall<{ success: boolean; message: string }>(`/classes/${classId}`, {
        method: 'DELETE',
      });
      return result.success;
    } catch (error) {
      console.error('Error deleting class:', error);
      throw error;
    }
  }

  async syncClasses(localClasses: Class[]): Promise<Class[]> {
    try {
      const backendClasses = await this.getAllClasses();
      const backendClassIds = new Set(backendClasses.map(c => c.id));

      for (const localClass of localClasses) {
        if (!backendClassIds.has(localClass.id)) {
          await this.createClass(localClass);
        } else {
          await this.updateClass(String(localClass.id), localClass);
        }
      }

      return await this.getAllClasses();
    } catch (error) {
      console.error('Error syncing classes:', error);
      throw error;
    }
  }

  async loadClasses(): Promise<Class[]> {
    try {
      return await this.getAllClasses();
    } catch (error) {
      console.error('Error loading classes:', error);
      return [];
    }
  }
}

export const classService = new ClassService();