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

function getSelectedPositionIds() {
    try {
        return JSON.parse(localStorage.getItem('taPortalSelectedPositionsV2') || '[]');
    } catch(e) {
        return [];
    }
}

function setSelectedPositionIds(ids) {
    const maxChoices = TA_PORTAL_DATA.admin?.rules?.maxApplicationChoices || 3;
    localStorage.setItem('taPortalSelectedPositionsV2', JSON.stringify(ids.slice(0, maxChoices)));
}

function preferredStatusForStudent(code) {
    const c = criterionByCode(code);
    const g = TA_PORTAL_DATA.student?.courseGrades[code];
    if (!c || !g) return { below: false, grade: g || '—', preferred: c?.preferredGrade || '—' };
    return { below: gradeRank(g) < gradeRank(c.preferredGrade), grade: g, preferred: c.preferredGrade };
}

function updateNotificationBell() {
    const unread = (TA_PORTAL_DATA.notifications || []).filter(n => n.unread).length;
    const btn = q('#notificationButton');
    if (!btn) return;
    const badge = q('#notificationCount');
    if (unread > 0) {
        if (!badge) {
            const b = document.createElement('span');
            b.id = 'notificationCount';
            b.className = 'notification-count';
            btn.appendChild(b);
        }
        const live = q('#notificationCount');
        live.hidden = false;
        live.textContent = unread;
    } else if (badge) {
        badge.remove();
    }
}

function renderNotificationDropdown() {
    const list = q('#notificationList');
    if (!list) return;
    list.innerHTML = (TA_PORTAL_DATA.notifications || []).slice(0, 3).map(n => `
        <div class="notification-item ${n.unread ? 'unread' : ''}">
            <div>
                <div class="notification-item-title">${esc(n.title)}</div>
                <div class="small-text">${esc(n.text)}</div>
            </div>
            <div class="notification-item-footer">
                ${n.unread ? `<button type="button" data-mark-read="${esc(n.id)}">Mark as read</button>` : '<span class="notification-read-label">Read</span>'}
            </div>
        </div>
    `).join('') || '<div class="empty-state">No notifications.</div>';
}

function wireNotificationBell() {
    const btn = q('#notificationButton'), panel = q('#notificationPanel');
    if (!btn || !panel) return;
    updateNotificationBell();
    renderNotificationDropdown();
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.classList.toggle('open');
    });
    document.addEventListener('click', () => {
        panel.classList.remove('open');
    });
    panel.addEventListener('click', async e => {
        e.stopPropagation(); // Keep panel open when interacting inside
        const id = e.target.closest('[data-mark-read]')?.dataset.markRead;
        if (!id) return;
        try {
            await fetchApi('mark_notification_read', { method: 'POST', body: { id } });
            const n = TA_PORTAL_DATA.notifications.find(x => String(x.id) === String(id));
            if (n) n.unread = false;
            updateNotificationBell();
            renderNotificationDropdown();
        } catch (err) {
            alert(err.message);
        }
    });
}

// Page Specific Initializers
async function initStudentDashboard() {
    wireNotificationBell();
    const s = TA_PORTAL_DATA.student;
    
    if (q('#navProfileName')) q('#navProfileName').textContent = s.name;
    if (q('#studentName')) q('#studentName').textContent = s.name;
    if (q('#studentMeta')) q('#studentMeta').textContent = `Student ID: ${s.id} · Department: ${s.department}`;
    if (q('#studentAcademic')) q('#studentAcademic').textContent = `${s.cgpa.toFixed(2)} CGPA · ${s.credits} Credits`;
    
    const allPositions = TA_PORTAL_DATA.positions || TA_PORTAL_DATA.open_positions || [];
    const getPos = (id) => allPositions.find(p => String(p.position_id) === String(id) || String(p.id) === String(id));

    // 1. RENDER APPLICATIONS
    const appContainer = q('#studentApplicationCards');
    if (appContainer) {
        const apps = s.applications || [];
        appContainer.innerHTML = apps.map((a) => {
            const p = getPos(a.positionId || a.position_id) || {};
            const courseCode = p.course_code || p.code || a.course_code || 'Unknown Course';
            const courseName = p.course_name || p.name || a.course_name || 'Details Unavailable';
            const faculty = p.faculty_name || p.faculty || a.faculty_name || 'TBA';
            const section = p.section_code || p.section || a.section_code || 'N/A';
            
            const stat = a.status || a.workflow_status || 'Pending';
            const isPending = stat === 'Pending' || stat === 'Applied';
            const isShortlisted = stat === 'Shortlisted';
            const isInterview = stat === 'Interview';
            const isAccepted = stat === 'Accepted' || stat === 'Assigned';
            const isRejected = stat === 'Rejected' || stat === 'Failed';
            
            const passedShortlist = isShortlisted || isInterview || isAccepted;
            const passedInterview = isAccepted;

            return `
                <div class="detail-block">
                    <div>
                        <strong>${esc(courseCode)} · ${esc(courseName)}</strong>
                        <span class="small-text" style="margin-left:8px">${esc(faculty)} · Section ${esc(section)}</span>
                    </div>
                    
                    <div class="stepper">
                        <div class="step completed"><div class="step-icon">✓</div><div class="step-text"><b>Submitted</b><span>Done</span></div></div>
                        <div class="step completed"><div class="step-icon">✓</div><div class="step-text"><b>Eligibility</b><span>Checked</span></div></div>
                        
                        <div class="step ${passedShortlist ? 'completed' : (isPending ? 'active' : '')}">
                            <div class="step-icon">${passedShortlist ? '✓' : ''}</div>
                            <div class="step-text"><b>Shortlisted</b><span>Admin review</span></div>
                        </div>
                        
                        <div class="step ${passedInterview ? 'completed' : (isInterview ? 'active' : '')}">
                            <div class="step-icon">${passedInterview ? '✓' : ''}</div>
                            <div class="step-text"><b>Interview</b><span>${isInterview ? 'Scheduled' : 'Pending'}</span></div>
                        </div>
                        
                        <div class="step ${(isAccepted || isRejected) ? 'completed' : ''}">
                            <div class="step-icon">${isAccepted ? '✓' : (isRejected ? '✕' : '')}</div>
                            <div class="step-text"><b>Result</b><span>${isAccepted ? 'Assigned' : (isRejected ? 'Failed' : 'Pending')}</span></div>
                        </div>
                    </div>
                </div>`;
        }).join('') || '<div class="empty-state">No applications yet.</div>';
    }

    // 2. RENDER ASSIGNED SECTIONS
    const assignedContainer = q('#studentAssignedSections');
    if (assignedContainer) {
        const assigned = s.assigned || [];
        assignedContainer.innerHTML = assigned.map(a => {
            const p = getPos(a.positionId || a.position_id) || {};
            const courseCode = p.course_code || p.code || a.course_code || 'Unknown Course';
            const courseName = p.course_name || p.name || a.course_name || 'Details Unavailable';
            const faculty = p.faculty_name || p.faculty || a.faculty_name || 'TBA';
            const section = p.section_code || p.section || a.section_code || 'N/A';
            const daysTime = p.daysTime || 'TBA';
            const room = p.room || 'TBA';
            const hours = a.hours || p.weekly_hours || p.hours || 3;
            
            return `<div class="detail-block">
                <strong>${esc(courseCode)} · ${esc(courseName)} (Section ${esc(section)})</strong>
                <div class="small-text">${esc(daysTime)} · ${esc(room)} · ${esc(hours)} hrs/week · ${esc(faculty)}</div>
            </div>`;
        }).join('') || '<div class="empty-state">No assigned TA sections.</div>';
    }
}

function initStudentAvailable() {
    wireNotificationBell();
    const s = TA_PORTAL_DATA.student || {};
    if (s.name && q('#navProfileName')) q('#navProfileName').textContent = s.name;

    const openCount = (TA_PORTAL_DATA.open_positions || []).length;
    const appCount = (s.applications || []).length;
    const assignedCount = (s.assigned || []).length;

    if (q('#studentOpenCount')) q('#studentOpenCount').textContent = openCount;
    if (q('#studentApplicationCount')) q('#studentApplicationCount').textContent = appCount;
    if (q('#studentAssignedCount')) q('#studentAssignedCount').textContent = assignedCount;

    const container = document.getElementById('studentPositionRows') || document.getElementById('positionsContainer') || document.querySelector('tbody');
    if (!container) return;

    let positions = TA_PORTAL_DATA.open_positions || (TA_PORTAL_DATA.positions || []).filter(p => p.status === 'Open' || !p.status);
    const appliedIds = (s.applications || []).map(a => String(a.positionId || a.position_id));
    positions = positions.filter(pos => !appliedIds.includes(String(pos.position_id || pos.id)));
    const selectedIds = getSelectedPositionIds(); 

    if (positions.length === 0) {
        container.innerHTML = '<tr><td colspan="5" style="text-align: center;">No new TA positions available to apply for at the moment.</td></tr>';
        return;
    }

    container.innerHTML = '';
    
    positions.forEach(pos => {
        const courseCode = pos.course_code || pos.code || 'N/A';
        const courseName = pos.course_name || (courseByCode(courseCode)?.name) || pos.name || '';
        const faculty = pos.faculty_name || pos.faculty || 'Unknown Faculty';
        const section = pos.section_code || pos.section || 'N/A';
        const daysTime = pos.daysTime || 'TBA';
        const prefGrade = pos.preferredGrade || 'N/A';
        const posId = String(pos.position_id || pos.id);
        const isAdded = selectedIds.includes(posId);
        
        container.insertAdjacentHTML('beforeend', `
            <tr>
                <td><strong>${esc(courseCode)}</strong><br><small>${esc(courseName)}</small></td>
                <td>${esc(faculty)}</td>
                <td>Section ${esc(section)}<br><small>${esc(daysTime)}</small></td>
                <td>${esc(prefGrade)}</td>
                <td>
                    <button class="btn-primary btn-sm apply-btn" data-id="${esc(posId)}" ${isAdded ? 'disabled' : ''}>
                        ${isAdded ? 'Added ✓' : 'Add to Application'}
                    </button>
                </td>
            </tr>
        `);
    });

    document.querySelectorAll('.apply-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const positionId = String(e.target.getAttribute('data-id'));
            let ids = getSelectedPositionIds();
            const maxChoices = TA_PORTAL_DATA.admin?.rules?.maxApplicationChoices || 3;

            if (!ids.includes(positionId)) {
                if (ids.length >= maxChoices) {
                    alert(`You can only select up to ${maxChoices} positions.`);
                    return;
                }
                ids.push(positionId);
                setSelectedPositionIds(ids);
                e.target.textContent = 'Added ✓';
                e.target.disabled = true;
            }
        });
    });
}

async function initStudentApplication() {
    wireNotificationBell();
    q('#navProfileName').textContent = TA_PORTAL_DATA.student.name;
    const params = new URLSearchParams(location.search);
    const requested = params.get('position');
    
    let ids = getSelectedPositionIds();

    // ---------------------------------------------------------
    // BUG FIX: THE CART SANITIZER
    // Filter out any "ghost" IDs that belong to other departments
    // and remove them permanently from localStorage.
    // ---------------------------------------------------------
    const validIds = ids.filter(id => positionById(id));
    if (validIds.length !== ids.length) {
        ids = validIds;
        setSelectedPositionIds(ids); // Wipes the ghost courses from memory
    }

    if (requested && positionById(requested) && !ids.includes(requested)) {
        if (ids.length < TA_PORTAL_DATA.admin.rules.maxApplicationChoices) ids.push(requested);
        setSelectedPositionIds(ids);
    }

    const renderSelected = () => {
        const list = q('#selectedPositionsList');
        const selected = ids.map(positionById).filter(Boolean);
        if (!selected.length) {
            list.innerHTML = '<div class="empty-state">No positions selected. Go to Available Sections to choose.</div>';
            q('#selectedCourse').value = '';
            q('#selectedSectionFaculty').value = '';
            q('#preferredGradeWarnings').innerHTML = '';
            return;
        }
        list.innerHTML = selected.map((p, i) => {
            const c = courseByCode(p.code);
            return `<div class="pending-app-item" style="margin-top:12px"><div><strong>${i===0?'1st':i===1?'2nd':'3rd'} Choice · ${esc(p.code)} · ${esc(c.name)}</strong><div class="small-text">Section ${esc(p.section)} · ${esc(p.faculty)}</div></div><div class="inline-actions"><button type="button" class="btn-light" data-move-up="${esc(p.id)}" ${i===0?'disabled':''}>↑</button><button type="button" class="btn-light" data-move-down="${esc(p.id)}" ${i===selected.length-1?'disabled':''}>↓</button><button type="button" class="btn-outline-danger" data-remove-position="${esc(p.id)}">Remove</button></div></div>`;
        }).join('');
        const active = selected.find(p => p.id === requested) || selected[0];
        const ac = courseByCode(active.code);
        q('#selectedCourse').value = `${active.code} · ${ac.name}`;
        q('#selectedSectionFaculty').value = `Section ${active.section} · ${active.faculty}`;
    };
    renderSelected();

    q('#selectedPositionsList')?.addEventListener('click', e => {
        const up = e.target.closest('[data-move-up]'), down = e.target.closest('[data-move-down]'), remove = e.target.closest('[data-remove-position]');
        if (up) {
            const i = ids.indexOf(up.dataset.moveUp);
            if (i > 0) { [ids[i-1], ids[i]] = [ids[i], ids[i-1]]; setSelectedPositionIds(ids); renderSelected(); }
        }
        if (down) {
            const i = ids.indexOf(down.dataset.moveDown);
            if (i >= 0 && i < ids.length - 1) { [ids[i+1], ids[i]] = [ids[i], ids[i+1]]; setSelectedPositionIds(ids); renderSelected(); }
        }
        if (remove) {
            ids = ids.filter(id => id !== remove.dataset.removePosition);
            setSelectedPositionIds(ids);
            renderSelected();
        }
    });

    const st = q('#statement'), counter = q('#statementCounter');
    st?.addEventListener('input', () => {
        const words = st.value.trim() ? st.value.trim().split(/\s+/).length : 0;
        if (counter) counter.textContent = `${words} / 300 words`;
    });

    q('#submitApplication')?.addEventListener('click', async () => {
        const words = st?.value.trim() ? st.value.trim().split(/\s+/).length : 0;
        if (!ids.length) { alert('Select at least one position.'); return; }
        if (words > 300) { alert('Statement must be under 300 words.'); return; }
        const fd = new FormData();
        
        // Ensure we only send valid, scrubbed IDs to the backend
        fd.append('choices', JSON.stringify(ids.map(Number)));
        
        fd.append('statement', st.value.trim());
        fd.append('portfolio', q('#applicationPortfolio')?.value.trim() || '');
        const cv = q('#applicationCv')?.files?.[0], tr = q('#applicationTranscript')?.files?.[0];
        if (cv) fd.append('cv', cv);
        if (tr) fd.append('transcript', tr);
        try {
            await fetchApi('submit_application', { method: 'POST', body: fd });
            setSelectedPositionIds([]);
            alert('Application submitted successfully.');
            location.href = 's_dashboard.html';
        } catch(err) {
            alert(err.message);
        }
    });
}
async function initStudentNotifications() {
    wireNotificationBell();
    q('#navProfileName').textContent = TA_PORTAL_DATA.student.name;
    const notifs = TA_PORTAL_DATA.notifications || [];
    q('#pageUnreadCount').textContent = notifs.filter(n => n.unread).length;
    q('#studentNotificationList').innerHTML = notifs.map(n => `
        <article class="student-notification-card ${n.unread?'notification-unread':''}">
            <div class="student-notification-icon ${n.unread?'icon-unread':'icon-read'}"><i class="bi bi-${n.unread?'bell-fill':'check-lg'}"></i></div>
            <div class="student-notification-main">
                <div class="student-notification-top"><h4>${esc(n.title)}</h4>${n.unread?'<span class="unread-badge">Unread</span>':'<span class="read-badge">Read</span>'}</div>
                <p>${esc(n.text)}</p>
                <div class="student-notification-meta"><span><i class="bi bi-calendar3"></i>${esc(n.date)}</span></div>
            </div>
            <div class="student-notification-actions">
                ${n.unread ? `<button type="button" class="btn-mark-read" data-page-mark-read="${esc(n.id)}">Mark as read</button>` : '<span class="already-read">Read</span>'}
            </div>
        </article>`).join('') || '<div class="notification-empty-state"><h3>No notifications</h3></div>';

    q('#studentNotificationList')?.addEventListener('click', async e => {
        const id = e.target.closest('[data-page-mark-read]')?.dataset.pageMarkRead;
        if (!id) return;
        try {
            await fetchApi('mark_notification_read', { method: 'POST', body: { id } });
            const n = notifs.find(x => String(x.id) === String(id));
            if (n) n.unread = false;
            initStudentNotifications();
            updateNotificationBell();
        } catch(err) { alert(err.message); }
    });
}

// Global initialization router for Student
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
                // CLEAR THE CART SO IT DOES NOT BLEED TO OTHER ACCOUNTS
                localStorage.removeItem('taPortalSelectedPositionsV2');
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
        const url = window.location.href.toLowerCase();

        if (page === 'student-dashboard' || url.includes('dashboard')) initStudentDashboard();
        else if (page === 'student-available' || url.includes('available')) initStudentAvailable();
        else if (page === 'student-application' || url.includes('apply') || url.includes('application')) initStudentApplication();
        else if (page === 'student-notifications' || url.includes('notification')) initStudentNotifications();
    } catch(err) {
        console.error(err);
        if (err.message.includes('Authentication')) location.href = '../Login/signin.html';
    }
});