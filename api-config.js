// API Configuration and Helper Functions
// Save this as: api-config.js in your frontend root folder

const API_PROTOCOL = window.location.protocol === 'file:' ? 'http:' : window.location.protocol;
const API_HOST = window.location.hostname || 'localhost';
const LIVE_API_BASE_URL = 'https://bihar-skill-intern-backend.onrender.com/api';
const IS_LOCAL_FRONTEND = window.location.protocol === 'file:' ||
    ['localhost', '127.0.0.1', ''].includes(API_HOST) ||
    API_HOST.startsWith('192.168.') ||
    API_HOST.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(API_HOST);
const DEFAULT_API_BASE_URL = IS_LOCAL_FRONTEND
    ? `${API_PROTOCOL}//${API_HOST || 'localhost'}:5000/api`
    : LIVE_API_BASE_URL;
const STORED_API_BASE_URL = IS_LOCAL_FRONTEND ? localStorage.getItem('bsiApiBaseUrl') : '';
const API_BASE_URL = window.BSI_API_BASE_URL || STORED_API_BASE_URL || DEFAULT_API_BASE_URL;

// Shared auth storage for static file mode and normal hosted mode.
// window.name survives file:// page navigation in the same tab, so it backs up localStorage.
class BSIAuthStorage {
    static windowNameKey = 'bsiAuthState';
    static heavyStorageKeys = new Set([
        'student',
        'userProfileImage',
        'userSignatureImage'
    ]);

    static isHeavyStorageKey(key) {
        return this.heavyStorageKeys.has(key) || String(key || '').startsWith('student_');
    }

    static removeLargeStudentFields(studentData = {}) {
        const cleaned = { ...studentData };
        delete cleaned.profilePhoto;
        delete cleaned.profileImage;
        delete cleaned.signature;
        return cleaned;
    }

    static normalizeDateForInput(value) {
        if (!value) return '';
        const text = String(value).trim();
        const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
        if (isoMatch) return isoMatch[1];

        const parsed = new Date(text);
        if (Number.isNaN(parsed.getTime())) return text;
        const year = parsed.getFullYear();
        const month = String(parsed.getMonth() + 1).padStart(2, '0');
        const day = String(parsed.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

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
            if (error && (error.name === 'QuotaExceededError' || String(error.message || '').toLowerCase().includes('quota'))) {
                this.removeItem(key);
            }
        }

        if (!this.isHeavyStorageKey(key)) {
            this.writeWindowState({
                [key]: value
            });
        }
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
            key.startsWith('courseManualEnroll_') ||
            key.startsWith('courseMaterialAccepted_') ||
            key.startsWith('courseQuizLocked_') ||
            key.startsWith('courseStartDate_') ||
            key.startsWith('courseEndDate_') ||
            key.startsWith('courseEnrolledAt_')
        );
    }

    static clearActiveStudentSession() {
        [
            'userPassword',
            'userRegistered',
            'isLoggedIn',
            'authToken',
            'token'
        ].forEach(key => this.removeItem(key));
    }

    static saveStudent(studentData, passwordHash) {
        studentData.id = studentData.id || studentData.studentId || (studentData.email ? `student_${studentData.email}` : `student_${Date.now()}`);
        const wasLoggedIn = this.getItem('isLoggedIn') === 'true';
        const hasActiveToken = Boolean(this.getItem('authToken') || this.getItem('token') || studentData.token);
        const previousStudentId = this.getItem('currentStudentId');
        const previousEmail = (this.getItem('userEmail') || this.getItem('userUsername') || '').toLowerCase();
        const nextEmail = String(studentData.email || '').toLowerCase();
        const sameStudentEmail = previousEmail && nextEmail && previousEmail === nextEmail;
        const existingPaymentStatus = this.getItem('paymentStatus');
        const existingPaymentVerified = this.getItem('paymentVerified');
        if ((previousStudentId && String(previousStudentId) !== String(studentData.id)) || (previousEmail && nextEmail && previousEmail !== nextEmail)) {
            this.clearGeneratedStudentArtifacts();
        }

        let existingStudent = null;
        try {
            existingStudent = JSON.parse(this.getItem(studentData.id) || 'null');
        } catch (error) {
            existingStudent = null;
        }

        if (!existingStudent && nextEmail) {
            try {
                const studentIds = JSON.parse(this.getItem('allStudentIds') || '[]');
                for (const id of studentIds) {
                    const candidate = JSON.parse(this.getItem(id) || 'null');
                    if (candidate && String(candidate.email || '').toLowerCase() === nextEmail) {
                        existingStudent = candidate;
                        break;
                    }
                }
            } catch (error) {
                existingStudent = null;
            }
        }

        studentData = {
            ...(existingStudent || {}),
            ...Object.fromEntries(
                Object.entries(studentData).filter(([, value]) =>
                    value !== undefined && value !== null && value !== ''
                )
            ),
            id: studentData.id
        };

        const paymentStatus = studentData.paymentStatus === 'completed' ||
            (sameStudentEmail && (existingPaymentStatus === 'completed' || existingPaymentVerified === 'true'))
            ? 'completed'
            : 'pending';
        studentData.paymentStatus = paymentStatus;

        const studentRecord = this.removeLargeStudentFields(studentData);
        this.setItem(studentData.id, JSON.stringify(studentRecord));

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
        this.setItem('userDOB', this.normalizeDateForInput(studentData.dob || studentData.dateOfBirth || studentData.userDOB || ''));
        this.setItem('userAddress', studentData.address || '');
        this.setItem('userPincode', studentData.pincode || studentData.pinCode || studentData.pin || studentData.postalCode || studentData.userPincode || this.getItem('userPincode') || '');
        this.setItem('userState', studentData.state || 'Bihar');
        this.setItem('userUniversity', studentData.university || 'Veer Kunwar Singh University');
        this.setItem('userDistrict', studentData.district || '');
        this.setItem('userCollege', studentData.college || '');
        this.setItem('userDegree', studentData.degree || '');
        this.setItem('userDepartment', studentData.department || '');
        this.setItem('userMajorSubject', studentData.majorSubject || studentData.userMajorSubject || '');
        this.setItem('userSemester', studentData.semester || '');
        this.setItem('userSession', studentData.session || '');
        this.setItem('userRollNo', studentData.rollno || studentData.rollNo || studentData.userRollNo || this.getItem('userRollNo') || '');
        this.setItem('userSkill', studentData.skill || studentData.course || studentData.selectedSkill || studentData.userSkill || '');
        this.setItem('selectedCourseId', studentData.selectedCourseId || studentData.courseId || this.getItem('selectedCourseId') || '');
        this.setItem('selectedCourseName', studentData.selectedCourseName || studentData.course || studentData.skill || this.getItem('selectedCourseName') || '');
        this.setItem('userEmergencyName', studentData.emergencyName || '');
        this.setItem('userEmergencyPhone', studentData.emergencyPhone || '');
        this.setItem('userRelationship', studentData.relationship || '');
        if (studentData.profilePhoto || studentData.profileImage) {
            this.setItem('userProfileImage', studentData.profilePhoto || studentData.profileImage);
        }
        if (studentData.signature) {
            this.setItem('userSignatureImage', studentData.signature);
        }
        this.setItem('userRegistered', 'true');
        this.setItem('paymentStatus', paymentStatus);
        this.setItem('isRegistrationComplete', paymentStatus === 'completed' ? 'true' : 'false');
        this.setItem('isLoggedIn', wasLoggedIn || hasActiveToken || studentData.isLoggedIn === true || studentData.isLoggedIn === 'true' ? 'true' : 'false');
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

    static hasCompletedRegistration() {
        return this.getItem('paymentStatus') === 'completed' ||
            this.getItem('isRegistrationComplete') === 'true' ||
            this.getItem('paymentVerified') === 'true';
    }

    static hasActiveStudentLogin() {
        return this.getItem('isLoggedIn') === 'true' && Boolean(this.getItem('userEmail') || this.getItem('userUsername'));
    }

    static requireCompletedStudent(options = {}) {
        const loginUrl = options.loginUrl || 'login.html';
        const paymentUrl = options.paymentUrl || 'payment.html';
        if (!this.hasActiveStudentLogin()) {
            if (options.alert !== false) alert('Please login first!');
            window.location.href = loginUrl;
            return false;
        }

        if (!this.hasCompletedRegistration()) {
            if (options.alert !== false) alert('Please complete your registration payment first.');
            window.location.href = paymentUrl;
            return false;
        }

        return true;
    }
}

// API Service Class
class APIService {
    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    static isNetworkError(error) {
        const message = String(error?.message || '').toLowerCase();
        return error?.name === 'TypeError' ||
            message.includes('failed to fetch') ||
            message.includes('network') ||
            message.includes('timed out') ||
            message.includes('load failed');
    }

    static async wakeBackend() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 25000);
            await fetch(`${API_BASE_URL}/health`, {
                method: 'GET',
                cache: 'no-store',
                signal: controller.signal
            });
            clearTimeout(timeoutId);
        } catch (error) {
            console.warn('Backend wake-up check failed:', error.message);
        }
    }

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
            let detail = (payload && payload.message) || 'API request failed';
            if (payload && Array.isArray(payload.errors) && payload.errors.length > 0 && !String(detail).includes('\n- ')) {
                const errorLines = payload.errors
                    .map(error => error && (error.message || error.msg))
                    .filter(Boolean)
                    .map(message => `- ${message}`);
                if (errorLines.length > 0) {
                    detail = `${detail}\n${errorLines.join('\n')}`;
                }
            } else if (payload && payload.error && payload.error !== payload.message) {
                detail = `${detail} (${payload.error})`;
            }
            const error = new Error(detail);
            error.status = response.status;
            error.payload = payload;
            error.url = url;
            throw error;
        }

        return payload;
    }

    // =============================================
    // AUTH ENDPOINTS
    // =============================================

    static async registerStudent(data) {
        let response;
        let lastError;

        for (let attempt = 1; attempt <= 2; attempt += 1) {
            try {
                if (attempt > 1) {
                    await this.wakeBackend();
                    await this.sleep(2500);
                }

                response = await this.request('/auth/pending-registration', {
                    method: 'POST',
                    body: JSON.stringify(data)
                });
                break;
            } catch (error) {
                lastError = error;
                if (!this.isNetworkError(error) || attempt === 2) {
                    throw error;
                }
                await this.sleep(2500);
            }
        }

        if (!response && lastError) throw lastError;

        if (response.success) {
            if (response.token) {
                BSIAuthStorage.setItem('authToken', response.token);
            }
            if (response.student) {
                BSIAuthStorage.saveStudent(response.student, response.student.passwordHash);
                const savedStudentId = BSIAuthStorage.getItem('currentStudentId');
                const savedStudent = savedStudentId ? BSIAuthStorage.getItem(savedStudentId) : null;
                BSIAuthStorage.setItem('student', savedStudent || JSON.stringify(BSIAuthStorage.removeLargeStudentFields(response.student)));
            }
        }

        return response;
    }

    static async loginStudent(email, password) {
        const existingPaymentStatus = BSIAuthStorage.getItem('paymentStatus');
        const existingPaymentVerified = BSIAuthStorage.getItem('paymentVerified');
        const existingEmail = (BSIAuthStorage.getItem('userEmail') || BSIAuthStorage.getItem('userUsername') || '').toLowerCase();
        const loginEmail = String(email || '').toLowerCase();
        const canTrustExistingPayment = existingEmail === loginEmail &&
            (existingPaymentStatus === 'completed' || existingPaymentVerified === 'true');
        const response = await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        
        if (response.success) {
            BSIAuthStorage.setItem('authToken', response.token);
            if (response.student) {
                BSIAuthStorage.saveStudent(response.student, response.student.passwordHash);
                const paymentStatus = response.student.paymentStatus === 'completed' || canTrustExistingPayment
                    ? 'completed'
                    : 'pending';
                BSIAuthStorage.setItem('paymentStatus', paymentStatus);
                BSIAuthStorage.setItem('isRegistrationComplete', paymentStatus === 'completed' ? 'true' : 'false');
                BSIAuthStorage.setItem('isLoggedIn', paymentStatus === 'completed' ? 'true' : 'false');
                const savedStudentId = BSIAuthStorage.getItem('currentStudentId');
                const savedStudent = savedStudentId ? BSIAuthStorage.getItem(savedStudentId) : null;
                BSIAuthStorage.setItem('student', savedStudent || JSON.stringify(BSIAuthStorage.removeLargeStudentFields(response.student)));
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

    static async getStudentProofs() {
        return this.request('/students/proofs');
    }

    static async uploadStudentProof(data) {
        return this.request('/students/proofs', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    static async uploadActivityProofs(data) {
        try {
            return await this.request('/students/proofs/bulk', {
                method: 'POST',
                body: JSON.stringify(data)
            });
        } catch (error) {
            const isMissingBulkRoute = error.status === 404 ||
                String(error.message || '').toLowerCase().includes('route not found');

            if (!isMissingBulkRoute) {
                throw error;
            }

            const screenshots = Array.isArray(data?.screenshots) ? data.screenshots : [];
            if (!screenshots.length) {
                throw error;
            }

            const baseDate = data.startDate ? new Date(data.startDate) : new Date();
            if (Number.isNaN(baseDate.getTime())) {
                baseDate.setTime(Date.now());
            }

            const uploadedProofIds = [];
            for (let index = 0; index < screenshots.length; index += 1) {
                const proofDate = new Date(baseDate);
                proofDate.setDate(baseDate.getDate() + index);
                const proof = screenshots[index];
                const response = await this.uploadStudentProof({
                    courseId: data.courseId,
                    proofDate: proofDate.toISOString().slice(0, 10),
                    internshipMode: data.internshipMode || 'online',
                    topic: `${data.topic || 'Activity Proof'} - Day ${index + 1}`,
                    workDescription: data.workDescription || '',
                    screenshot: proof.screenshot,
                    fileName: proof.fileName || `activity-proof-day-${index + 1}.jpg`
                });
                if (response?.proofId) uploadedProofIds.push(response.proofId);
            }

            return {
                success: true,
                message: 'Activity proofs uploaded with compatibility mode.',
                proofIds: uploadedProofIds,
                uploadedCount: uploadedProofIds.length
            };
        }
    }

    static async updateCourseProgress(courseId, data) {
        return this.request(`/courses/${encodeURIComponent(courseId)}/progress`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
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

    static async updateAdminStudent(id, data) {
        return this.request(`/admin/students/${encodeURIComponent(id)}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    static async getDashboardStats() {
        return this.request('/admin/stats');
    }

    static async getInternshipProofs(status = '') {
        const query = status ? `?status=${encodeURIComponent(status)}` : '';
        return this.request(`/admin/proofs${query}`);
    }

    static async reviewInternshipProof(id, status, adminRemarks = '') {
        return this.request(`/admin/proofs/${encodeURIComponent(id)}/review`, {
            method: 'PUT',
            body: JSON.stringify({ status, adminRemarks })
        });
    }

    static async updateStudentCourseUnlock(studentId, courseId, unlock = true) {
        return this.request(`/admin/students/${encodeURIComponent(studentId)}/courses/${encodeURIComponent(courseId)}/unlock`, {
            method: 'PUT',
            body: JSON.stringify({ unlock })
        });
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

    static async getAdminCollegeSettings() {
        return this.request('/admin/college-settings');
    }

    static async saveAdminCollegeSettings(data) {
        return this.request('/admin/college-settings', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    static async deleteAdminCollegeSettings(id) {
        return this.request(`/admin/college-settings/${encodeURIComponent(id)}`, {
            method: 'DELETE'
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

    static async getRegistrationPaymentAmount(details = {}) {
        const params = new URLSearchParams();
        if (details.college) params.set('college', details.college);
        if (details.pendingRegistrationId) params.set('pendingRegistrationId', details.pendingRegistrationId);
        const query = params.toString() ? `?${params.toString()}` : '';
        return this.request(`/payments/registration-amount${query}`);
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

const BSIClassMode = {
    getStoredSettings(studentData = null) {
        const classMode = studentData?.classMode || studentData?.collegeClassMode || (() => {
            try {
                return BSIAuthStorage.getItem('bsiCollegeClassMode') || '';
            } catch (error) {
                return '';
            }
        })();

        const paymentMode = studentData?.paymentMode || (() => {
            try {
                return BSIAuthStorage.getItem('bsiCollegePaymentMode') || '';
            } catch (error) {
                return '';
            }
        })();

        return {
            classMode: classMode === 'offline' ? 'offline' : 'online',
            paymentMode: paymentMode === 'custom' ? 'custom' : 'auto'
        };
    },

    getCollegeValue(studentData = null) {
        const candidates = [
            studentData?.college,
            studentData?.userCollege,
            (() => {
                try {
                    const currentStudentId = BSIAuthStorage.getItem('currentStudentId');
                    const currentStudent = currentStudentId ? BSIAuthStorage.getItem(currentStudentId) : null;
                    return currentStudent?.college || currentStudent?.userCollege || '';
                } catch (error) {
                    return '';
                }
            })(),
            (() => {
                try {
                    const storedStudent = BSIAuthStorage.getItem('student');
                    const parsedStudent = typeof storedStudent === 'string' ? JSON.parse(storedStudent) : storedStudent;
                    return parsedStudent?.college || parsedStudent?.userCollege || '';
                } catch (error) {
                    return '';
                }
            })(),
            (() => {
                try {
                    return BSIAuthStorage.getItem('userCollege') || '';
                } catch (error) {
                    return '';
                }
            })()
        ];

        return String(candidates.find(Boolean) || '').trim();
    },

    isOfflineCollege(studentData = null) {
        return this.getStoredSettings(studentData).classMode === 'offline';
    },

    getClassMode(studentData = null) {
        return this.isOfflineCollege(studentData) ? 'Offline Class' : 'Online Class';
    },

    getInternshipModeLabel(studentData = null) {
        return this.isOfflineCollege(studentData) ? 'Offline Internship' : 'Online Internship';
    }
};

if (typeof window !== 'undefined') {
    window.BSIClassMode = BSIClassMode;
}

// Warm the Render backend in the background as soon as a public page opens.
// This reduces the first-action delay on free Render instances after sleep.
if (typeof window !== 'undefined') {
    window.BSIWarmBackend = window.BSIWarmBackend || function warmBackendOnce() {
        if (window.__bsiBackendWarmStarted) return;
        window.__bsiBackendWarmStarted = true;

        try {
            const apiOrigin = new URL(API_BASE_URL).origin;
            const preconnect = document.createElement('link');
            preconnect.rel = 'preconnect';
            preconnect.href = apiOrigin;
            preconnect.crossOrigin = 'anonymous';
            document.head.appendChild(preconnect);
        } catch (error) {
            console.warn('Unable to preconnect backend:', error.message);
        }

        const runWake = () => APIService.wakeBackend();
        if ('requestIdleCallback' in window) {
            window.requestIdleCallback(runWake, { timeout: 2000 });
        } else {
            setTimeout(runWake, 1200);
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', window.BSIWarmBackend, { once: true });
    } else {
        window.BSIWarmBackend();
    }
}
