// API Configuration and Helper Functions
// Save this as: api-config.js in your frontend root folder

const API_PROTOCOL = window.location.protocol === 'file:' ? 'http:' : window.location.protocol;
const API_HOST = window.location.hostname || 'localhost';
const LIVE_API_BASE_URL = 'https://bihar-skill-intern-backend.onrender.com/api';
const DEFAULT_API_BASE_URL = API_HOST.endsWith('.github.io')
    ? LIVE_API_BASE_URL
    : `${API_PROTOCOL}//${API_HOST}:5000/api`;
const API_BASE_URL = window.BSI_API_BASE_URL || localStorage.getItem('bsiApiBaseUrl') || DEFAULT_API_BASE_URL;

// Shared auth storage for static file mode and normal hosted mode.
// window.name survives file:// page navigation in the same tab, so it backs up localStorage.
class BSIAuthStorage {
    static windowNameKey = 'bsiAuthState';

    static readWindowState() {
        try {
            if (!window.name) return {};
            const state = JSON.parse(window.name);
            return state && typeof state === 'object' ? state : {};
        } catch (error) {
            return {};
        }
    }

    static writeWindowState(nextState) {
        try {
            window.name = JSON.stringify({
                ...this.readWindowState(),
                ...nextState
            });
        } catch (error) {
            console.warn('Unable to write browser-tab auth backup:', error.message);
        }
    }

    static setItem(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (error) {
            console.warn(`Unable to save ${key} in localStorage:`, error.message);
        }

        this.writeWindowState({
            [key]: value
        });
    }

    static removeItem(key) {
        try {
            localStorage.removeItem(key);
        } catch (error) {
            console.warn(`Unable to remove ${key} from localStorage:`, error.message);
        }

        const state = this.readWindowState();
        delete state[key];
        try {
            window.name = JSON.stringify(state);
        } catch (error) {
            console.warn('Unable to update browser-tab auth backup:', error.message);
        }
    }

    static getItem(key) {
        try {
            const value = localStorage.getItem(key);
            if (value !== null) return value;
        } catch (error) {
            console.warn(`Unable to read ${key} from localStorage:`, error.message);
        }

        const state = this.readWindowState();
        return state[key] || null;
    }

    static removeMatchingKeys(predicate) {
        const keys = [];
        try {
            for (let i = 0; i < localStorage.length; i += 1) {
                const key = localStorage.key(i);
                if (key && predicate(key)) keys.push(key);
            }
        } catch (error) {
            console.warn('Unable to inspect localStorage keys:', error.message);
        }

        keys.forEach(key => this.removeItem(key));
    }

    static clearGeneratedStudentArtifacts() {
        [
            'consentFormData',
            'currentCertificateData',
            'certCourseName',
            'certCourseStartDate',
            'certCourseEndDate',
            'courseForCertificate',
            'courseEmojiForCertificate',
            'studentGrade',
            'studentScore',
            'scorePercentage',
            'certificateNumber',
            'selectedCourseId',
            'selectedCourseName',
            'adminConsentStudentId',
            'adminConsentRollNo',
            'adminConsentActiveStudentId',
            'adminConsentActiveRollNo'
        ].forEach(key => this.removeItem(key));

        this.removeMatchingKeys(key =>
            key.startsWith('courseResult_') ||
            key.startsWith('course_') ||
            key.startsWith('progress_') ||
            key.startsWith('courseMaterialAccepted_') ||
            key.startsWith('courseQuizLocked_')
        );
    }

    static clearActiveStudentSession() {
        this.clearGeneratedStudentArtifacts();
        [
            'currentStudentId',
            'student',
            'userName',
            'userFirstName',
            'userLastName',
            'userEmail',
            'userUsername',
            'userPhone',
            'userMobile',
            'userGender',
            'userGuardian',
            'userDOB',
            'userAddress',
            'userState',
            'userUniversity',
            'userDistrict',
            'userCollege',
            'userDegree',
            'userDepartment',
            'userSemester',
            'userSession',
            'userRollNo',
            'userSkill',
            'userEmergencyName',
            'userEmergencyPhone',
            'userRelationship',
            'userProfileImage',
            'userSignatureImage',
            'userPasswordHash',
            'userPassword',
            'userRegistered',
            'isLoggedIn',
            'authToken',
            'token'
        ].forEach(key => this.removeItem(key));
    }

    static saveStudent(studentData, passwordHash) {
        studentData.id = studentData.id || studentData.studentId || (studentData.email ? `student_${studentData.email}` : `student_${Date.now()}`);
        const previousStudentId = this.getItem('currentStudentId');
        const previousEmail = (this.getItem('userEmail') || this.getItem('userUsername') || '').toLowerCase();
        const nextEmail = String(studentData.email || '').toLowerCase();
        if ((previousStudentId && String(previousStudentId) !== String(studentData.id)) || (previousEmail && nextEmail && previousEmail !== nextEmail)) {
            this.clearGeneratedStudentArtifacts();
        }

        this.setItem(studentData.id, JSON.stringify(studentData));

        let studentIds = [];
        try {
            studentIds = JSON.parse(this.getItem('allStudentIds') || '[]');
        } catch (error) {
            studentIds = [];
        }

        if (!studentIds.includes(studentData.id)) {
            studentIds.push(studentData.id);
        }

        this.setItem('allStudentIds', JSON.stringify(studentIds));
        this.setItem('currentStudentId', studentData.id);
        const displayName = (studentData.name || '').trim() ||
            [studentData.firstName, studentData.lastName].filter(Boolean).join(' ').trim() ||
            studentData.email ||
            'Student';
        this.setItem('userName', displayName);
        const nameParts = displayName.split(/\s+/).filter(Boolean);
        this.setItem('userFirstName', studentData.firstName || nameParts[0] || 'Student');
        this.setItem('userLastName', studentData.lastName || nameParts.slice(1).join(' ') || '');
        this.setItem('userEmail', studentData.email);
        this.setItem('userUsername', studentData.email);
        this.removeItem('userPassword');
        this.setItem('userPasswordHash', passwordHash || studentData.passwordHash || '');
        this.setItem('userPhone', studentData.phone || '');
        this.setItem('userMobile', studentData.phone || '');
        this.setItem('userGender', studentData.gender || '');
        this.setItem('userGuardian', studentData.guardian || '');
        this.setItem('userDOB', studentData.dob || '');
        this.setItem('userAddress', studentData.address || '');
        this.setItem('userState', studentData.state || 'Bihar');
        this.setItem('userUniversity', studentData.university || 'Veer Kunwar Singh University');
        this.setItem('userDistrict', studentData.district || '');
        this.setItem('userCollege', studentData.college || '');
        this.setItem('userDegree', studentData.degree || '');
        this.setItem('userDepartment', studentData.department || '');
        this.setItem('userSemester', studentData.semester || '');
        this.setItem('userSession', studentData.session || '');
        this.setItem('userRollNo', studentData.rollno || studentData.rollNo || studentData.userRollNo || '');
        this.setItem('userSkill', studentData.skill || studentData.course || studentData.selectedSkill || studentData.userSkill || '');
        this.setItem('userEmergencyName', studentData.emergencyName || '');
        this.setItem('userEmergencyPhone', studentData.emergencyPhone || '');
        this.setItem('userRelationship', studentData.relationship || '');
        this.setItem('userProfileImage', studentData.profilePhoto || studentData.profileImage || '');
        this.setItem('userSignatureImage', studentData.signature || '');
        this.setItem('userRegistered', 'true');
        this.setItem('paymentStatus', studentData.paymentStatus || 'pending');
        this.setItem('isRegistrationComplete', studentData.paymentStatus === 'completed' ? 'true' : 'false');
        this.setItem('isLoggedIn', 'false');
    }

    static restoreStudentByEmail(email) {
        let studentIds = [];
        try {
            studentIds = JSON.parse(this.getItem('allStudentIds') || '[]');
        } catch (error) {
            studentIds = [];
        }

        for (const id of studentIds) {
            try {
                const student = JSON.parse(this.getItem(id) || 'null');
                if (student && student.email === email) {
                    this.saveStudent(student, student.passwordHash);
                    return student;
                }
            } catch (error) {
                console.warn('Unable to parse saved student:', error.message);
            }
        }

        const currentEmail = this.getItem('userEmail') || this.getItem('userUsername');
        if (currentEmail === email && this.getItem('userPasswordHash')) {
            this.setItem('userRegistered', 'true');
            return {
                email,
                name: this.getItem('userName') || 'Student',
                passwordHash: this.getItem('userPasswordHash')
            };
        }

        return null;
    }
}

// API Service Class
class APIService {
    static getToken() {
        return BSIAuthStorage.getItem('authToken');
    }

    static getAuthHeader() {
        const token = this.getToken();
        return {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` })
        };
    }

    static async request(endpoint, options = {}) {
        const url = `${API_BASE_URL}${endpoint}`;
        const headers = {
            ...this.getAuthHeader(),
            ...(options.headers || {})
        };
        const controller = options.signal ? null : new AbortController();
        const timeoutId = controller ? setTimeout(() => controller.abort(), 70000) : null;
        let response;

        try {
            response = await fetch(url, {
                ...options,
                headers,
                signal: options.signal || controller.signal
            });
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('API request timed out');
            }
            throw error;
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }

        let payload = null;
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            payload = await response.json();
        }

        if (!response.ok) {
            throw new Error((payload && payload.message) || 'API request failed');
        }

        return payload;
    }

    // =============================================
    // AUTH ENDPOINTS
    // =============================================

    static async registerStudent(data) {
        const response = await this.request('/auth/register', {
            method: 'POST',
            body: JSON.stringify(data)
        });

        if (response.success) {
            if (response.token) {
                BSIAuthStorage.setItem('authToken', response.token);
            }
            if (response.student) {
                BSIAuthStorage.saveStudent(response.student, response.student.passwordHash);
                BSIAuthStorage.setItem('student', JSON.stringify(response.student));
            }
        }

        return response;
    }

    static async loginStudent(email, password) {
        const existingPaymentStatus = BSIAuthStorage.getItem('paymentStatus');
        const existingPaymentVerified = BSIAuthStorage.getItem('paymentVerified');
        const response = await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        
        if (response.success) {
            BSIAuthStorage.setItem('authToken', response.token);
            if (response.student) {
                BSIAuthStorage.saveStudent(response.student, response.student.passwordHash);
                const paymentStatus = existingPaymentStatus === 'completed' || existingPaymentVerified === 'true'
                    ? 'completed'
                    : response.student.paymentStatus || existingPaymentStatus || 'pending';
                BSIAuthStorage.setItem('paymentStatus', paymentStatus);
                BSIAuthStorage.setItem('isRegistrationComplete', paymentStatus === 'completed' ? 'true' : 'false');
                BSIAuthStorage.setItem('isLoggedIn', paymentStatus === 'completed' ? 'true' : 'false');
                BSIAuthStorage.setItem('student', JSON.stringify(response.student));
            }
        }
        return response;
    }

    static async loginAdmin(email, password) {
        const response = await this.request('/auth/admin/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        
        if (response.success) {
            BSIAuthStorage.setItem('authToken', response.token);
            BSIAuthStorage.setItem('admin', JSON.stringify(response.admin));
        }
        return response;
    }

    static async verifyToken() {
        return this.request('/auth/verify');
    }

    static logout() {
        BSIAuthStorage.clearActiveStudentSession();
        BSIAuthStorage.removeItem('admin');
        window.location.href = 'index.html';
    }

    // =============================================
    // STUDENT ENDPOINTS
    // =============================================

    static async getStudentProfile() {
        return this.request('/students/profile');
    }

    static async updateStudentProfile(data) {
        return this.request('/students/profile', {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    static async getStudentCourses() {
        return this.request('/students/courses');
    }

    static async getStudentProgress() {
        return this.request('/students/progress');
    }

    // =============================================
    // ADMIN ENDPOINTS
    // =============================================

    static async getAllStudents() {
        return this.request('/admin/students');
    }

    static async getStudent(id) {
        return this.request(`/admin/students/${id}`);
    }

    static async deleteStudent(id) {
        return this.request(`/admin/students/${id}`, {
            method: 'DELETE'
        });
    }

    static async getDashboardStats() {
        return this.request('/admin/stats');
    }

    static async getAdminPaymentAmount() {
        return this.request('/admin/settings/payment-amount');
    }

    static async updateAdminPaymentAmount(amount) {
        return this.request('/admin/settings/payment-amount', {
            method: 'PUT',
            body: JSON.stringify({ amount })
        });
    }

    static async resetAdminPaymentAmount() {
        return this.request('/admin/settings/payment-amount/reset', {
            method: 'POST'
        });
    }

    // =============================================
    // COURSES ENDPOINTS
    // =============================================

    static async getAllCourses() {
        return this.request('/courses/');
    }

    static async getCourse(id) {
        return this.request(`/courses/${id}`);
    }

    static async enrollCourse(courseId) {
        return this.request(`/courses/${courseId}/enroll`, {
            method: 'POST'
        });
    }

    // =============================================
    // PAYMENTS ENDPOINTS
    // =============================================

    static async initiatePayment(courseId, amount) {
        return this.request('/payments/initiate', {
            method: 'POST',
            body: JSON.stringify({ courseId, amount })
        });
    }

    static async createRegistrationPaymentOrder(amount, studentData = {}) {
        return this.request('/payments/registration-order', {
            method: 'POST',
            body: JSON.stringify({ amount, ...studentData })
        });
    }

    static async getRegistrationPaymentAmount() {
        return this.request('/payments/registration-amount');
    }

    static async getRegistrationPaymentStatus(razorpayOrderId, paymentDetails = {}) {
        const params = new URLSearchParams(paymentDetails);
        const query = params.toString() ? `?${params.toString()}` : '';
        return this.request(`/payments/registration-status/${encodeURIComponent(razorpayOrderId)}${query}`, {
            method: 'GET'
        });
    }

    static async verifyPayment(paymentId) {
        return this.request('/payments/verify', {
            method: 'POST',
            body: JSON.stringify({ paymentId })
        });
    }

    static async verifyRegistrationPayment(razorpayPaymentId, razorpayOrderId, razorpaySignature, paymentDetails = {}) {
        return this.request('/payments/registration-verify', {
            method: 'POST',
            body: JSON.stringify({ razorpayPaymentId, razorpayOrderId, razorpaySignature, ...paymentDetails })
        });
    }

    static async getPaymentHistory() {
        return this.request('/payments/history');
    }

    // =============================================
    // CERTIFICATES ENDPOINTS
    // =============================================

    static async getCertificates() {
        return this.request('/certificates/');
    }

    static async getCertificate(id) {
        return this.request(`/certificates/${id}`);
    }

    static async downloadCertificate(id) {
        return this.request(`/certificates/${id}/download`);
    }
}

// Export for use in HTML
if (typeof module !== 'undefined' && module.exports) {
    module.exports = APIService;
}
