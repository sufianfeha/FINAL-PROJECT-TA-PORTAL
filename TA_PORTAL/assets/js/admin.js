import { fetchApi } from './api.js';

let TA_PORTAL_DATA = {};

const q = (s, r = document) => r.querySelector(s);
const qa = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

const courseByCode = code => TA_PORTAL_DATA.courses?.find(c => c.code === code);
const positionById = id => TA_PORTAL_DATA.positions?.find(p => String(p.id) === String(id));
const criterionByCode = code => TA_PORTAL_DATA.admin?.subjectCriteria?.find(c => c.code === code);
const gradeRank = g => ({A:9,'A-':8,'B+':7,B:6,'B-':5,'C+':4,C:3,'C-':2,D:1})[g] || 0;

function wireSettingsMenu() {
    const btn = q('#settingsButton');
    const panel = q('#settingsPanel');
    const modal = q('#passwordModal');
    const changeLink = q('#changePasswordLink');
    const closeBtn = q('#closePasswordModal');
    const form = q('#changePasswordForm');

    if (!btn || !panel) return;

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.classList.toggle('open');
    });

    document.addEventListener('click', () => {
        panel.classList.remove('open');
    });

    changeLink?.addEventListener('click', (e) => {
        e.preventDefault();
        panel.classList.remove('open');
        if (modal) modal.style.display = 'grid'; // Grid maps to CSS modal-overlay centering
    });

    closeBtn?.addEventListener('click', () => {
        if (modal) modal.style.display = 'none';
    });

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const currentPassword = q('#currentPassword').value;
        const newPassword = q('#newPassword').value;

        try {
            await fetchApi('change_password', {
                method: 'POST',
                body: { current_password: currentPassword, new_password: newPassword }
            });
            alert('Password changed successfully!');
            modal.style.display = 'none';
            form.reset();
        } catch (err) {
            alert('Error: ' + err.message);
        }
    });
}

function initAdminDashboard() {
    q('#navProfileName').textContent = TA_PORTAL_DATA.currentUser?.name || 'Admin User';
    q('#adminName').textContent = TA_PORTAL_DATA.currentUser?.name || 'Admin User';
    const a = TA_PORTAL_DATA.admin || {};

    q('#adminTotalApplicants').textContent = (a.applications || []).length;
    q('#adminOpenPositions').textContent = (TA_PORTAL_DATA.positions || []).filter(p => p.status === 'Open').length;
    q('#adminShortlisted').textContent = (a.applications || []).filter(x => x.status === 'Shortlisted').length;
    q('#adminAssigned').textContent = (TA_PORTAL_DATA.faculty?.activeTAs || []).length;

    q('#adminReviewRows').innerHTML = (a.applications || []).filter(x => x.status === 'Under Review').map(x => {
        const p = positionById(x.positionId), c = courseByCode(p?.code), crit = criterionByCode(p?.code);
        const below = gradeRank(x.courseGrade) < gradeRank(crit?.preferredGrade || 'A');
        return `<tr><td>${esc(x.name)}</td><td>${esc(p?.code)} · ${esc(c?.name)}</td><td>${esc(x.courseGrade)}</td><td><span class="status-badge ${below?'status-warning':'status-success'}">${below?'Below Preferred Grade':'Meets Preferred Grade'}</span></td><td><span class="status-badge status-info">${esc(x.status)}</span></td></tr>`;
    }).join('') || '<tr><td colspan="5" class="empty-row">No applications under review.</td></tr>';
}

function initAdminPositions() {
    q('#navProfileName').textContent = TA_PORTAL_DATA.currentUser?.name || 'Admin User';
    q('#adminPositionRows').innerHTML = (TA_PORTAL_DATA.positions || []).map(p => {
        const c = courseByCode(p.code), canClose = p.status === 'Open';
        return `<tr><td><strong>${esc(p.code)}</strong></td><td>${esc(c?.name)}</td><td>Section ${esc(p.section)}</td><td>${esc(p.faculty)}</td><td>${esc(p.daysTime)} · ${esc(p.room)}</td><td>${esc(p.hours)} hrs</td><td><span class="status-badge ${p.status==='Open'?'status-success':p.status==='Assigned'?'status-info':'status-muted'}">${esc(p.status)}</span></td><td class="action-cell">${canClose?`<button type="button" class="btn-outline-danger" data-close-position="${esc(p.id)}">Close Position</button>`:'<span class="small-text">No action available</span>'}</td></tr>`;
    }).join('');

    qa('[data-close-position]').forEach(b => b.addEventListener('click', async () => {
        try {
            await fetchApi('admin_close_position', { method: 'POST', body: { positionId: Number(b.dataset.closePosition) } });
            alert('TA position closed.');
            location.reload();
        } catch(err) { alert(err.message); }
    }));
}

function initAdminOpenPosition() {
    q('#navProfileName').textContent = TA_PORTAL_DATA.currentUser?.name || 'Admin User';
    
    const deptSelect = q('#positionDepartment');
    const courseSelect = q('#positionCourseCode');
    
    // 1. New filter function: renders courses based on the selected department
    const renderCourses = () => {
        const selectedDept = deptSelect.value;
        
        // Filter courses if a department is selected, otherwise show all
        const filteredCourses = selectedDept 
            ? (TA_PORTAL_DATA.courses || []).filter(c => c.department === selectedDept)
            : (TA_PORTAL_DATA.courses || []);
            
        courseSelect.innerHTML = filteredCourses.map(c => `<option value="${esc(c.code)}">${esc(c.code)} · ${esc(c.name)}</option>`).join('');
        fill(); // Automatically update the title for the first item in the new list
    };

    // 2. Auto-fill the course title (and set department if not already selected)
    const fill = () => {
        const c = courseByCode(courseSelect.value);
        q('#positionCourseTitle').value = c?.name || '';
        if (c && !deptSelect.value) {
            deptSelect.value = c.department;
        }
    };
    
    // 3. Attach listeners and run initial setup
    deptSelect.addEventListener('change', renderCourses);
    courseSelect.addEventListener('change', fill);
    renderCourses(); // Initial render on page load
    
    // Dynamically populate Faculty dropdown from backend data
    const facultySelect = q('#positionFaculty');
    const facultyList = TA_PORTAL_DATA.facultyList || [];
    if (facultyList.length > 0) {
        facultySelect.innerHTML = '<option value="">Select Faculty...</option>' + 
            facultyList.map(f => `<option value="${esc(f.name)}">${esc(f.name)}</option>`).join('');
    }

    // Handle form submission
    q('#openPositionForm')?.addEventListener('submit', async e => {
        e.preventDefault();
        const days = q('#positionDays').value.trim();
        const time = q('#positionTime').value.trim();
        const combinedDaysTime = `${days} · ${time}`;

        try {
            await fetchApi('admin_open_position', { 
                method: 'POST', 
                body: { 
                    courseCode: courseSelect.value, 
                    section: q('#positionSection').value.trim(), 
                    faculty: q('#positionFaculty').value, 
                    daysTime: combinedDaysTime,
                    room: q('#positionRoom').value.trim(), 
                    hours: Number(q('#positionHours').value || 3)
                } 
            });
            alert('TA position opened successfully.');
            location.href = 'Ta_position.html';
        } catch(err) { alert(err.message); }
    });
}

function initAdminApplications() {
    q('#navProfileName').textContent = TA_PORTAL_DATA.currentUser?.name || 'Admin User';
    const render = () => {
        const s = (q('#adminStudentSearch')?.value || '').toLowerCase().trim();
        const c = (q('#adminCourseSearch')?.value || '').toLowerCase().trim();
        const st = q('#adminStatusFilter')?.value || 'all';
        const rows = (TA_PORTAL_DATA.admin?.applications || []).map(a => {
            const p = positionById(a.positionId), course = courseByCode(p?.code), crit = criterionByCode(p?.code);
            const below = gradeRank(a.courseGrade) < gradeRank(crit?.preferredGrade || 'A');
            const ok = (!s || a.name.toLowerCase().includes(s)) && (!c || (p?.code+' '+(course?.name||'')).toLowerCase().includes(c)) && (st === 'all' || a.status === st);
            return `<tr style="${ok?'':'display:none'}"><td><strong>${esc(a.name)}</strong><div class="small-text">${esc(a.email)}</div></td><td>${esc(p?.code)} · ${esc(course?.name)}<div class="small-text">Section ${esc(p?.section)} · ${esc(p?.faculty)}</div></td><td>${esc(a.appliedOn)}</td><td>${esc(a.courseGrade)}</td><td>${esc(a.credits)}</td><td><span class="status-badge ${below?'status-warning':'status-success'}">${below?'Below Preferred Grade':'Meets Preferred Grade'}</span></td><td><span class="status-badge ${a.status==='Shortlisted'?'status-success':a.status==='Rejected'?'status-danger':a.status==='Assigned'?'status-success':'status-info'}">${esc(a.status)}</span></td><td class="action-cell"><a class="btn-light" href="application-view.html?id=${encodeURIComponent(a.id)}">View</a></td></tr>`;
        }).join('');
        q('#adminApplicationRows').innerHTML = rows || '<tr><td colspan="8" class="empty-row">No applications found.</td></tr>';
    };
    ['#adminStudentSearch', '#adminCourseSearch', '#adminStatusFilter'].forEach(id => q(id)?.addEventListener('input', render));
    render();
}

function initAdminApplicationDetails() {
    q('#navProfileName').textContent = TA_PORTAL_DATA.currentUser?.name || 'Admin User';
    const id = new URLSearchParams(location.search).get('id');
    const a = (TA_PORTAL_DATA.admin?.applications || []).find(x => String(x.id) === String(id));
    const content = q('#applicationViewContent');
    if (!a) {
        q('#applicationViewName').textContent = 'Application Not Found';
        q('#applicationViewCourse').textContent = 'The selected application could not be found.';
        content.innerHTML = '<a class="btn-primary" href="Applications.html">Back to Applications</a>';
        return;
    }
    const p = positionById(a.positionId), course = courseByCode(p?.code), crit = criterionByCode(p?.code);
    const below = gradeRank(a.courseGrade) < gradeRank(crit?.preferredGrade || 'A');
    q('#applicationViewName').textContent = a.name;
    q('#applicationViewCourse').textContent = `${p?.code} · ${course?.name} · Section ${p?.section}`;
    q('#applicationViewStatus').textContent = a.status;
    q('#applicationViewStatus').className = `status-badge ${a.status==='Shortlisted'||a.status==='Assigned'?'status-success':a.status==='Rejected'?'status-danger':'status-info'}`;

    content.innerHTML = `
        <section class="static-page-grid">
            <div class="custom-card"><div class="detail-card-title"><i class="bi bi-person-vcard"></i> Student Information</div>
                <div class="detail-grid-4">
                    <div class="info-cell"><span class="detail-label">Name</span><strong>${esc(a.name)}</strong></div>
                    <div class="info-cell"><span class="detail-label">ID</span><strong>${esc(a.studentId||'—')}</strong></div>
                    <div class="info-cell"><span class="detail-label">Dept</span><strong>${esc(a.department||'—')}</strong></div>
                    <div class="info-cell"><span class="detail-label">Email</span><strong>${esc(a.email)}</strong></div>
                </div>
            </div>
            <div class="custom-card"><div class="detail-card-title"><i class="bi bi-mortarboard"></i> Academic Record</div>
                <div class="detail-grid-4">
                    <div class="info-cell"><span class="detail-label">CGPA</span><strong>${esc(a.cgpa)}</strong></div>
                    <div class="info-cell"><span class="detail-label">Course Grade</span><strong>${esc(a.courseGrade)}</strong></div>
                    <div class="info-cell"><span class="detail-label">Credits</span><strong>${esc(a.credits)}</strong></div>
                    <div class="info-cell"><span class="detail-label">General Rules</span><span class="status-badge status-success">Meets Rules</span></div>
                </div>
            </div>
        </section>
        <section class="custom-card"><div class="detail-card-title"><i class="bi bi-paperclip"></i> Documents</div>
            <div class="file-link-list">${(a.documents||[]).map(d => `<div class="file-link"><div class="file-icon"><i class="bi bi-file-earmark"></i></div><div class="file-main"><strong>${esc(d.name)}</strong><span>${esc(d.type)} ·${esc(d.size)}</span></div><a class="btn-light" href="${esc(d.url)}" target="_blank" rel="noopener">View File</a></div>`).join('')}</div>
        </section>
        <section class="custom-card"><div class="detail-card-title"><i class="bi bi-chat-square-text"></i> Statement of Interest</div><p class="statement-preview">${esc(a.statement||'No statement submitted.')}</p></section>
        <section class="custom-card detail-review-actions"><div><strong>Admin Review</strong></div><div class="form-actions"><a class="btn-secondary" href="Applications.html">Close</a>${a.status==='Under Review'?`<button type="button" class="btn-primary" id="applicationShortlist">Shortlist</button><button type="button" class="btn-outline-danger" id="applicationReject">Reject</button>`:''}</div></section>
    `;

    q('#applicationShortlist')?.addEventListener('click', async () => {
        try {
            await fetchApi('admin_shortlist', { method: 'POST', body: { choiceId: Number(a.id) } });
            alert(`${a.name} has been shortlisted.`);
            location.href = 'Applications.html';
        } catch(err) { alert(err.message); }
    });
    q('#applicationReject')?.addEventListener('click', async () => {
        try {
            await fetchApi('admin_reject', { method: 'POST', body: { choiceId: Number(a.id) } });
            alert(`${a.name}'s application has been rejected.`);
            location.href = 'Applications.html';
        } catch(err) { alert(err.message); }
    });
}

function initAdminRules() {
    q('#navProfileName').textContent = TA_PORTAL_DATA.currentUser?.name || 'Admin User';
    const r = TA_PORTAL_DATA.admin?.rules || {};
    q('#minCgpa').value = r.minCgpa;
    q('#minCredits').value = r.minCredits;
    q('#prereqRequired').checked = r.prerequisiteRequired;
    q('#maxAssignments').value = r.maxTaAssignments;
    q('#deadline').value = r.applicationDeadline;

    const tbody = q('#subjectCriteriaRows');
    if (tbody) {
        tbody.innerHTML = (TA_PORTAL_DATA.admin?.subjectCriteria || []).map(c => {
            const course = courseByCode(c.code);
            const gradeOptions = (TA_PORTAL_DATA.grades || []).map(g => `<option ${g===c.preferredGrade?'selected':''}>${g}</option>`).join('');
            const prereqOptions = ['None', ...(TA_PORTAL_DATA.courses || []).map(x => x.code)].filter(v => v !== c.code).map(v => `<option ${v===c.prerequisite?'selected':''}>${v}</option>`).join('');
            return `<tr><td><strong>${esc(c.code)}</strong></td><td>${esc(course?.name)}</td><td><select data-inline-grade="${esc(c.code)}" class="form-select">${gradeOptions}</select></td><td><select data-inline-prereq="${esc(c.code)}" class="form-select">${prereqOptions}</select></td></tr>`;
        }).join('');

        qa('[data-inline-grade]').forEach(el => el.addEventListener('change', async () => {
            try {
                const c = criterionByCode(el.dataset.inlineGrade);
                await fetchApi('admin_update_criterion', { method: 'POST', body: { code: el.dataset.inlineGrade, preferredGrade: el.value, prerequisite: c?.prerequisite || 'None' } });
                if (c) c.preferredGrade = el.value;
            } catch(err) { alert(err.message); }
        }));
        qa('[data-inline-prereq]').forEach(el => el.addEventListener('change', async () => {
            try {
                const c = criterionByCode(el.dataset.inlinePrereq);
                await fetchApi('admin_update_criterion', { method: 'POST', body: { code: el.dataset.inlinePrereq, preferredGrade: c?.preferredGrade, prerequisite: el.value } });
                if (c) c.prerequisite = el.value;
            } catch(err) { alert(err.message); }
        }));
    }

    q('#rulesForm')?.addEventListener('submit', async e => {
        e.preventDefault();
        try {
            await fetchApi('admin_save_rules', { method: 'POST', body: { minCgpa: Number(q('#minCgpa').value || 0), minCredits: Number(q('#minCredits').value || 0), prerequisiteRequired: q('#prereqRequired').checked, maxAssignments: Math.max(2, Number(q('#maxAssignments').value || 2)), deadline: q('#deadline').value } });
            alert('Recruitment rules saved.');
        } catch(err) { alert(err.message); }
    });
}

function initAdminReports() {
    q('#navProfileName').textContent = TA_PORTAL_DATA.currentUser?.name || 'Admin User';
    
    qa('[data-report]').forEach(b => b.addEventListener('click', async () => {
        try {
            const title = b.dataset.report;
            const r = await fetchApi('reports', { method: 'POST', body: { type: title } });
            
            const printWindow = window.open('', '_blank');
            const th = r.data.columns.map(c => `<th>${c}</th>`).join('');
            const tr = r.data.rows.length 
                ? r.data.rows.map(row => `<tr>${row.map(cell => `<td>${cell !== null ? cell : '-'}</td>`).join('')}</tr>`).join('')
                : `<tr><td colspan="${r.data.columns.length}" style="text-align:center;">No data available for this report.</td></tr>`;
            
            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>${title}</title>
                    <style>
                        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #333; }
                        .header { border-bottom: 3px solid #0d6efd; padding-bottom: 10px; margin-bottom: 30px; }
                        h1 { color: #0d6efd; margin: 0; font-size: 28px; }
                        .date { color: #666; font-size: 14px; margin-top: 5px; }
                        table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
                        th, td { border: 1px solid #dee2e6; padding: 12px; text-align: left; }
                        th { background: #f8f9fa; font-weight: bold; }
                        .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #999; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1>${title}</h1>
                        <div class="date">Generated on: ${new Date().toLocaleString()}</div>
                    </div>
                    <table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>
                    <div class="footer">TA Recruitment & Management Portal - Official Report</div>
                    <script>window.onload = function() { window.print(); }</script>
                </body>
                </html>
            `);
            printWindow.document.close();
            
        } catch(err) { 
            alert('Failed to generate report: ' + err.message); 
        }
    }));
}

document.addEventListener('DOMContentLoaded', async () => {
    // Enable Settings Modal functionality globally
    wireSettingsMenu();

    const logoutBtn = q('#logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!confirm("Are you sure you want to log out?")) return;
            try {
                await fetchApi('logout', { method: 'POST' });
            } catch (err) {
                console.error('Logout error:', err);
            }
            window.location.href = '../Login/signin.html';
        });
    }

    try {
        const response = await fetchApi('bootstrap');
        TA_PORTAL_DATA = response.data;
        const page = document.body.dataset.page;

        if (page === 'admin-dashboard') initAdminDashboard();
        else if (page === 'admin-positions') initAdminPositions();
        else if (page === 'admin-open') initAdminOpenPosition();
        else if (page === 'admin-applications') initAdminApplications();
        else if (page === 'admin-application-details') initAdminApplicationDetails();
        else if (page === 'admin-rules') initAdminRules();
        else if (page === 'admin-reports') initAdminReports();
    } catch(err) {
        console.error(err);
        if (err.message.includes('Authentication')) location.href = '../Login/signin.html';
    }
});