import { fetchApi } from './api.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Tab Switching Logic
    const roleTabs = document.querySelectorAll('.tabs button');
    const emailInput = document.getElementById('loginEmail');
    const submitBtn = document.getElementById('loginSubmit');
    const passwordInput = document.getElementById('loginPassword');
    
    roleTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            // Remove 'active' class from all buttons, add to the clicked one
            roleTabs.forEach(t => t.classList.remove('active'));
            e.currentTarget.classList.add('active');
            
            // Get the role from the data attribute
            const currentRole = e.currentTarget.getAttribute('data-login-role');
            
            // Update button text
            submitBtn.textContent = `Log in as ${currentRole}`;
            
            // Auto-fill the correct test email based on the clicked tab
            if (currentRole === 'Student') {
                emailInput.value = 'student@university.edu';
            } else if (currentRole === 'Faculty') {
                emailInput.value = 'faculty@university.edu';
            } else if (currentRole === 'Admin') {
                emailInput.value = 'admin@university.edu';
            }
            
            // Auto-fill the test password so you don't have to type it every time
            passwordInput.value = 'password123';
        });
    });

    // 2. Login Submission Logic
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = emailInput.value.trim();
            const password = passwordInput.value;
            
            try {
                const response = await fetchApi('login', {
                    method: 'POST',
                    body: { email, password }
                });
                
                // If backend says okay, redirect to the dashboard
                if (response.data && response.data.redirect) {
                    window.location.href = response.data.redirect;
                }
            } catch (err) {
                alert('Login failed: ' + err.message);
            }
        });
    }

    // 3. Signup Submission Logic
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const name = document.getElementById('signupName')?.value.trim();
            const studentId = document.getElementById('signupStudentId')?.value.trim();
            const department = document.getElementById('signupDepartment')?.value;
            const email = document.getElementById('signupEmail')?.value.trim();
            const cgpa = parseFloat(document.getElementById('signupCgpa')?.value);
            const credits = parseInt(document.getElementById('signupCredits')?.value, 10);
            const password = document.getElementById('signupPassword')?.value;

            try {
                const response = await fetchApi('signup', {
                    method: 'POST',
                    body: { name, student_id: studentId, department, email, cgpa, credits, password }
                });

                alert(response.message || 'Account created successfully! Please sign in.');
                window.location.href = response.data?.redirect || 'signin.html';
            } catch (err) {
                alert('Registration failed: ' + err.message);
            }
        });
    }
});
;