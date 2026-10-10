import { fetchApi } from './api.js';

let TA_PORTAL_DATA = {};

const q = (s, r = document) => r.querySelector(s);
const qa = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

const courseByCode = code => TA_PORTAL_DATA.courses?.find(c => c.code === code);
const positionById = id => TA_PORTAL_DATA.positions?.find(p => String(p.id) === String(id));
const findFacultyCandidate = id => [...(TA_PORTAL_DATA.faculty?.shortlisted || []), ...(TA_PORTAL_DATA.faculty?.interviewed || []), ...(TA_PORTAL_DATA.faculty?.passed || [])].find(c => String(c.id) === String(id));
const facultyCandidateInfo = c => ({ p: positionById(c.positionId), course: courseByCode(positionById(c.positionId)?.code) });

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
        if (modal) modal.style.display = 'grid';
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

function renderFacultyCandidateDetails(c) {
    const { p, course } = facultyCandidateInfo(c);
    return `
        <div class="candidate-modal-header">
            <div>
                <span class="page-eyebrow"><i class="bi bi-person-vcard"></i> Candidate Details</span>
                <h2 id="candidateModalTitle">${esc(c.name)}</h2>
                <p>${esc(c.email)}</p>
            </div>
            <span class="status-badge ${c.status==='Passed'?'status-success':c.status==='Failed'?'status-danger':'status-info'}">${esc(c.status)}</span>
        </div>
        <div class="candidate-detail-grid">
            <div><span class="detail-label">Course</span><strong>${esc(p?.code)} · ${esc(course?.name)}</strong></div>
            <div><span class="detail-label">Section</span><strong>Section ${esc(p?.section)}</strong></div>
            <div><span class="detail-label">CGPA</span><strong>${esc(c.cgpa)}</strong></div>
            <div><span class="detail-label">Credits</span><strong>${esc(c.credits)}</strong></div>
            <div><span class="detail-label">Interview</span><strong>${esc(c.interviewDate||'Not scheduled')}</strong></div>
            <div><span class="detail-label">Evaluation</span><strong>${esc(c.evaluation||'Not evaluated')}</strong></div>
        </div>
        <div class="candidate-detail-section">
            <h3><i class="bi bi-paperclip"></i> Submitted Files</h3>
            <div class="submitted-file-list">
                ${(c.documents||[]).map(d => `<div class="submitted-file"><div class="submitted-file-icon"><i class="bi bi-file-earmark-pdf"></i></div><div><strong>${esc(d.name)}</strong><div class="small-text">${esc(d.type)} ·${esc(d.size)}</div></div><button type="button" class="btn-light" data-preview-file="${esc(d.name)}">View</button></div>`).join('')}
            </div>
        </div>
        <div class="candidate-detail-section">
            <h3><i class="bi bi-link-45deg"></i> Portfolio / GitHub</h3>
            <a class="portfolio-link" href="${esc(c.portfolio||'#')}" target="_blank" rel="noopener">${esc(c.portfolio||'Not provided')}</a>
        </div>
        <div class="candidate-detail-section">
            <h3><i class="bi bi-chat-square-text"></i> Statement of Interest</h3>
            <p class="statement-preview">${esc(c.statement||'No statement submitted.')}</p>
        </div>
    `;
}

function openCandidateModal(id) {
    const c = findFacultyCandidate(id);
    if (!c) return;
    q('#candidateModalContent').innerHTML = renderFacultyCandidateDetails(c);
    q('#candidateDetailsModal').hidden = false;
    qa('[data-preview-file]').forEach(b => {
        const doc = (c.documents || []).find(d => d.name === b.dataset.previewFile);
        if (doc) b.onclick = () => window.open(doc.url, '_blank', 'noopener');
    });
}

function initFacultyDashboard() {
    const f = TA_PORTAL_DATA.faculty || {};
    q('#navProfileName').textContent = TA_PORTAL_DATA.currentUser?.name || 'Dr. M. Rahman';
    q('#welcomeHeader').textContent = `Welcome, ${TA_PORTAL_DATA.currentUser?.name || 'Dr. M. Rahman'}`;
    q('#facultyName').textContent = TA_PORTAL_DATA.currentUser?.name || 'Dr. M. Rahman';
    q('#facultyMetricShortlisted').textContent = (f.shortlisted || []).length;
    q('#facultyMetricInterviews').textContent = (f.interviewed || []).length;
    q('#facultyMetricAssigned').textContent = (f.activeTAs || []).length;
    q('#facultyMetricPending').textContent = (f.interviewed || []).filter(c => c.status === 'Not Evaluated').length;
}

function initFacultyApplicants() {
    q('#navProfileName').textContent = TA_PORTAL_DATA.currentUser?.name || 'Dr. M. Rahman';
    const f = TA_PORTAL_DATA.faculty || {};

    const sortedShortlisted = [...(f.shortlisted || [])].sort((a, b) => {
        const cA = positionById(a.positionId)?.code || '';
        const cB = positionById(b.positionId)?.code || '';
        return cA.localeCompare(cB);
    });

    const rowsShort = sortedShortlisted.map(c => {
        const { p, course } = facultyCandidateInfo(c);
        return `<tr data-candidate-search="${esc((c.name+' '+(p?.code||'')+' '+(course?.name||'')).toLowerCase())}"><td><strong>${esc(c.name)}</strong><div class="small-text">${esc(c.email)}</div></td><td>${esc(c.cgpa)}</td><td>${esc(p?.code)} · ${esc(course?.name)} · Section ${esc(p?.section)}</td><td><span class="status-badge status-warning">Shortlisted</span></td><td class="action-cell"><div class="table-action-group"><button type="button" class="btn-light" data-view-candidate="${esc(c.id)}">View Details</button><a class="btn-primary" href="schedule-interview.html?candidate=${encodeURIComponent(c.id)}"><i class="bi bi-calendar-plus"></i> Schedule Interview</a></div></td></tr>`;
    }).join('');

    const filteredInterviewed = (f.interviewed || []).filter(c => c.status !== 'Passed' && c.status !== 'Assigned');

    const rowsInt = filteredInterviewed.map(c => {
        const { p, course } = facultyCandidateInfo(c);
        const failed = c.status === 'Failed';
        return `<tr data-candidate-search="${esc((c.name+' '+(p?.code||'')+' '+(course?.name||'')).toLowerCase())}"><td><strong>${esc(c.name)}</strong><div class="small-text">${esc(p?.code)} · ${esc(course?.name)} · Section ${esc(p?.section)}</div></td><td>${esc(c.interviewDate||'—')}</td><td>${esc(c.evaluation||'Not Evaluated')}</td><td><span class="status-badge ${failed?'table-status-failed':'table-status-not-evaluated'}">${esc(c.status)}</span></td><td class="action-cell"><div class="table-action-group"><button type="button" class="btn-light" data-view-candidate="${esc(c.id)}">View Details</button>${!failed?`<a class="btn-outline-primary" href="interview-evaluation.html?candidate=${encodeURIComponent(c.id)}"><i class="bi bi-clipboard-check"></i> Evaluate</a>`:'<span class="small-text">Evaluation recorded</span>'}</div></td></tr>`;
    }).join('');

    const rowsPass = (f.passed || []).map(c => {
        const { p, course } = facultyCandidateInfo(c);
        return `<tr data-candidate-search="${esc((c.name+' '+(p?.code||'')+' '+(course?.name||'')).toLowerCase())}"><td><strong>${esc(c.name)}</strong><div class="small-text">${esc(p?.code)} · ${esc(course?.name)} · Section ${esc(p?.section)}</div></td><td>${esc(c.interviewDate||'—')}</td><td>${esc(c.interviewScore)}/20</td><td><span class="status-badge status-success">Passed</span></td><td class="action-cell"><div class="table-action-group"><button type="button" class="btn-light" data-view-candidate="${esc(c.id)}">View Details</button><a class="btn-success" href="assign-ta.html?candidate=${encodeURIComponent(c.id)}"><i class="bi bi-person-check"></i> Assign TA</a></div></td></tr>`;
    }).join('');

    const rowsAssigned = (f.activeTAs || []).map(t => {
        const { p, course } = facultyCandidateInfo(t);
        return `<tr><td><strong>${esc(t.name)}</strong></td><td>${esc(p?.code)} · ${esc(course?.name)} · Section ${esc(p?.section)}</td><td>${esc(t.hours || 3)} hrs</td><td><span class="status-badge status-info">Assigned</span></td></tr>`;
    }).join('');

    q('#facultyShortlistedRows').innerHTML = rowsShort || '<tr><td colspan="5" class="empty-row">No Admin-shortlisted candidates.</td></tr>';
    q('#facultyInterviewedRows').innerHTML = rowsInt || '<tr><td colspan="5" class="empty-row">No interviewed candidates.</td></tr>';
    q('#facultyPassedRows').innerHTML = rowsPass || '<tr><td colspan="5" class="empty-row">No passed candidates are ready for assignment.</td></tr>';
    if(q('#facultyAssignedRows')) q('#facultyAssignedRows').innerHTML = rowsAssigned || '<tr><td colspan="4" class="empty-row">No assigned TAs yet.</td></tr>';

    const bind = (inputId, rowId) => {
        const inp = q(inputId);
        if (!inp) return;
        inp.addEventListener('input', () => {
            const query = inp.value.toLowerCase().trim();
            qa(`${rowId} tr`).forEach(r => r.style.display = !query || r.dataset.candidateSearch?.includes(query) ? '' : 'none');
        });
    };
    bind('#facultyApplicantSearch', '#facultyShortlistedRows');
    bind('#interviewedStudentSearch', '#facultyInterviewedRows');
    bind('#passedStudentSearch', '#facultyPassedRows');

    qa('[data-view-candidate]').forEach(b => b.addEventListener('click', () => openCandidateModal(b.dataset.viewCandidate)));
    q('#candidateModalClose')?.addEventListener('click', () => q('#candidateDetailsModal').hidden = true);
    q('#candidateDetailsModal')?.addEventListener('click', e => { if (e.target.id === 'candidateDetailsModal') q('#candidateDetailsModal').hidden = true; });
}

function initScheduleInterview() {
    q('#navProfileName').textContent = TA_PORTAL_DATA.currentUser?.name || 'Dr. M. Rahman';
    const params = new URLSearchParams(location.search), select = q('#scheduleCandidate'), eligible = TA_PORTAL_DATA.faculty?.shortlisted || [];
    select.innerHTML = eligible.map(c => {
        const { p } = facultyCandidateInfo(c);
        return `<option value="${esc(c.id)}">${esc(c.name)} · ${esc(p?.code)} · Section ${esc(p?.section)}</option>`;
    }).join('') || '<option value="">No eligible shortlisted candidates</option>';
    if (!eligible.length) select.disabled = true;

    const load = () => {
        const c = findFacultyCandidate(select.value);
        if (c) {
            const { p, course } = facultyCandidateInfo(c);
            q('#scheduleCourse').value = `${p?.code} · ${course?.name}`;
            q('#scheduleSection').value = `Section ${p?.section}`;
        }
    };
    select.value = params.get('candidate') && eligible.some(c => String(c.id) === String(params.get('candidate'))) ? params.get('candidate') : eligible[0]?.id || '';
    load();
    select.addEventListener('change', load);

    q('#scheduleInterviewForm')?.addEventListener('submit', async e => {
        e.preventDefault();
        const c = findFacultyCandidate(select.value), dt = q('#scheduleDate').value;
        if (!c || !dt) { alert('Select candidate and interview date/time.'); return; }
        try {
            await fetchApi('schedule_interview', { method: 'POST', body: { choiceId: Number(c.id), scheduledAt: dt, interviewType: (q('#scheduleType').value || '').startsWith('Online') ? 'Online' : 'In-Person', notes: q('#scheduleNotes').value.trim() } });
            alert('Interview scheduled successfully.');
            location.href = 'applicants.html';
        } catch(err) { alert(err.message); }
    });
}

function initInterviewEvaluation() {
    q('#navProfileName').textContent = TA_PORTAL_DATA.currentUser?.name || 'Dr. M. Rahman';
    const params = new URLSearchParams(location.search), select = q('#evaluationCandidate');
    const eligible = (TA_PORTAL_DATA.faculty?.interviewed || []).filter(c => c.status === 'Not Evaluated');
    select.innerHTML = eligible.map(c => {
        const { p } = facultyCandidateInfo(c);
        return `<option value="${esc(c.id)}">${esc(c.name)} · ${esc(p?.code)} · Section ${esc(p?.section)}</option>`;
    }).join('') || '<option value="">No unevaluated interviews</option>';
    if (!eligible.length) select.disabled = true;

    const load = () => {
        const c = findFacultyCandidate(select.value);
        if (c) {
            const { p, course } = facultyCandidateInfo(c);
            q('#evaluationCourse').value = `${p?.code} · ${course?.name}`;
            q('#evaluationSection').value = `Section ${p?.section}`;
            q('#evaluationDate').value = c.interviewDate || '';
            q('#evaluationCgpa').value = c.cgpa;
        }
    };
    select.value = params.get('candidate') && eligible.some(c => String(c.id) === String(params.get('candidate'))) ? params.get('candidate') : eligible[0]?.id || '';
    load();
    select.addEventListener('change', load);

    const scoreIds = ['technical', 'problem', 'communication', 'teaching'];

    const updateTotal = () => {
        const values = scoreIds.map(id => q('#' + id)?.value);
        const total = values.every(v => v !== '') ? values.reduce((sum, v) => sum + Number(v), 0) : '';
        const totalField = q('#evaluationTotal');
        if (totalField) totalField.value = total === '' ? '' : `${total} / 20`;
    };

    scoreIds.forEach(id => {
        q('#' + id)?.addEventListener('input', updateTotal);
        q('#' + id)?.addEventListener('change', updateTotal);
    });

    const decide = async status => {
        const values = scoreIds.map(id => q('#' + id)?.value);

        if (values.some(v => v === '')) {
            alert('Complete all evaluation score fields before recording a decision.');
            return;
        }

        const scores = values.map(Number);

        if (scores.some(v => !Number.isInteger(v) || v < 1 || v > 5)) {
            alert('Each evaluation score must be an integer from 1 to 5.');
            return;
        }

        updateTotal();

        const c = findFacultyCandidate(select.value);
        if (!c) return;

        try {
            await fetchApi('save_interview_evaluation', {
                method: 'POST',
                body: {
                    choiceId: Number(c.id),
                    technical: scores[0],
                    problem: scores[1],
                    communication: scores[2],
                    teaching: scores[3],
                    comments: q('#evaluationComments').value.trim(),
                    decision: status
                }
            });
            alert(status === 'Passed' ? 'Interview marked as Passed.' : 'Interview marked as Failed.');
            location.href = 'applicants.html';
        } catch(err) { alert(err.message); }
    };

    q('#markPassed')?.addEventListener('click', () => decide('Passed'));
    q('#markFailed')?.addEventListener('click', () => decide('Failed'));
}

function initAssignTa() {
    q('#navProfileName').textContent = TA_PORTAL_DATA.currentUser?.name || 'Dr. M. Rahman';
    const params = new URLSearchParams(location.search), select = q('#assignCandidate'), eligible = TA_PORTAL_DATA.faculty?.passed || [];
    select.innerHTML = eligible.map(c => {
        const { p } = facultyCandidateInfo(c);
        return `<option value="${esc(c.id)}">${esc(c.name)} · ${esc(p?.code)} · Section ${esc(p?.section)}</option>`;
    }).join('') || '<option value="">No passed candidates available</option>';
    if (!eligible.length) select.disabled = true;

    const load = () => {
        const c = eligible.find(x => String(x.id) === String(select.value));
        if (c) {
            const { p, course } = facultyCandidateInfo(c);
            q('#assignCourse').value = `${p?.code} · ${course?.name}`;
            q('#assignSection').value = `Section ${p?.section}`;
            q('#assignCgpa').value = c.cgpa;
            q('#assignInterviewResult').value = c.interviewScore ? `${c.interviewScore}/20` : c.evaluation;
            q('#assignHours').value = c.hours || 3;
        }
    };
    select.value = params.get('candidate') && eligible.some(c => String(c.id) === String(params.get('candidate'))) ? params.get('candidate') : eligible[0]?.id || '';
    load();
    select.addEventListener('change', load);

    q('#activeTaRows').innerHTML = (TA_PORTAL_DATA.faculty?.activeTAs || []).map(t => {
        const p = positionById(t.positionId), course = courseByCode(p?.code);
        return `<tr><td><strong>${esc(t.name)}</strong></td><td>${esc(p?.code)} · ${esc(course?.name)}</td><td>Section ${esc(p?.section)}</td><td>${esc(t.hours)} hrs</td></tr>`;
    }).join('') || '<tr><td colspan="4" class="empty-row">No active TA assignments.</td></tr>';

    q('#assignTaForm')?.addEventListener('submit', async e => {
        e.preventDefault();
        const c = eligible.find(x => String(x.id) === String(select.value));
        if (!c) return;
        try {
            await fetchApi('assign_ta', { method: 'POST', body: { choiceId: Number(c.id), hours: Number(q('#assignHours').value || 0) } });
            alert(`${c.name} has been assigned successfully.`);
            location.href = 'applicants.html';
        } catch(err) { alert(err.message); }
    });
}

function initTaEvaluation() {
    q('#navProfileName').textContent = TA_PORTAL_DATA.currentUser?.name || 'Dr. M. Rahman';
    const tas = TA_PORTAL_DATA.faculty?.tasForEvaluation || [];
    const fill = () => {
        q('#taEvaluationSelect').innerHTML = tas.map(t => {
            const p = positionById(t.positionId);
            return `<option value="${esc(t.id)}">${esc(t.name)} · ${esc(p?.code)} Section ${esc(p?.section)}</option>`;
        }).join('');
        q('#certificateTaSelect').innerHTML = q('#taEvaluationSelect').innerHTML;
        q('#taIssueSelect').innerHTML = tas.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
    };
    fill();

    q('#taEvaluationForm')?.addEventListener('submit', async e => {
        e.preventDefault();
        const form = e.target;
        const ratingSelect = form.querySelector('select:not(#taEvaluationSelect)'), feedback = form.querySelector('textarea');
        try {
            await fetchApi('save_ta_evaluation', { method: 'POST', body: { assignmentId: Number(q('#taEvaluationSelect').value), rating: Number((ratingSelect?.value || '').split(' ')[0]), feedback: feedback?.value.trim() || '' } });
            alert('TA performance evaluation submitted.');
            form.reset();
        } catch(err) { alert(err.message); }
    });

    q('#taIssueForm')?.addEventListener('submit', async e => {
        e.preventDefault();
        const form = e.target;
        try {
            await fetchApi('report_ta_issue', { method: 'POST', body: { assignmentId: Number(q('#taIssueSelect').value), issue: form.querySelector('textarea')?.value.trim() || '' } });
            alert('TA incident report submitted.');
            form.reset();
        } catch(err) { alert(err.message); }
    });

    const certificateData = () => {
        const ta = tas.find(t => String(t.id) === String(q('#certificateTaSelect')?.value)) || tas[0];
        const p = positionById(ta?.positionId), course = courseByCode(p?.code);
        const date = q('#certificateDate')?.value || '2026-09-25';
        const rec = q('#certificateRecognition')?.value.trim() || 'Successfully completed assigned Teaching Assistant responsibilities.';
        const pretty = new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
        return { ta, p, course, date, pretty, rec };
    };

    const renderCertificate = () => {
        const d = certificateData();
        if (!d.ta) return;
        q('#certificatePreview').hidden = false;
        q('#certificateDocument').innerHTML = `<div class="certificate-inner"><div class="certificate-watermark">TA PORTAL</div><div class="certificate-topline">${esc(TA_PORTAL_DATA.systemName)}</div><div class="certificate-seal"><i class="bi bi-award-fill"></i></div><div class="certificate-kicker">CERTIFICATE OF APPRECIATION</div><h1>Teaching Assistant</h1><p class="certificate-intro">This certificate is proudly presented to</p><div class="certificate-name">${esc(d.ta.name)}</div><div class="certificate-rule"></div><p class="certificate-body">for successfully serving as a Teaching Assistant for <strong>${esc(d.p?.code)} · ${esc(d.course?.name)}</strong>, Section <strong>${esc(d.p?.section)}</strong>, during <strong>${esc(TA_PORTAL_DATA.term)}</strong>.</p><p class="certificate-recognition">${esc(d.rec)}</p><div class="certificate-meta-row"><div><span>Certificate Date</span><strong>${esc(d.pretty)}</strong></div><div><span>Faculty</span><strong>${esc(d.p?.faculty)}</strong></div></div><div class="certificate-footer">${esc(TA_PORTAL_DATA.term)}</div></div>`;
    };

    q('#clearCertificate')?.addEventListener('click', () => q('#certificatePreview').hidden = true);

    q('#generateCertificate')?.addEventListener('click', async () => {
        const d = certificateData();

        if (!d.ta) {
            alert("No active TAs found! You must assign a student as a TA before you can generate a certificate.");
            return;
        }

        try {
            const r = await fetchApi('generate_certificate', {
                method: 'POST',
                body: {
                    assignmentId: Number(q('#certificateTaSelect').value),
                    issueDate: q('#certificateDate').value,
                    recognition: q('#certificateRecognition').value.trim()
                }
            });
            window.generatedCertificate = r.data;
            renderCertificate();
        } catch(err) { alert(err.message); }
    });

    q('#printCertificate')?.addEventListener('click', () => {
        if (q('#certificatePreview').hidden) renderCertificate();
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html><head><title>TA Certificate</title>
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css">
            <link rel="stylesheet" href="../assets/css/style.css">
            <style>body { padding: 40px; background: white; } .certificate-document { border: 8px solid #0d6efd; padding: 40px; text-align: center; border-radius: 12px; } </style>
            </head><body>
            ${q('#certificateDocument').innerHTML}
            <script>window.onload = function() { window.print(); }</script>
            </body></html>
        `);
        printWindow.document.close();
    });

    q('#sendCertificate')?.addEventListener('click', async () => {
        const selectedId = q('#certificateTaSelect')?.value;
        if (!selectedId) {
            alert('Please select a TA before sending.');
            return;
        }
        try {
            await fetchApi('send_certificate', { method: 'POST', body: { assignmentId: Number(selectedId) } });
            alert('Certificate successfully sent to the student portal!');
        } catch(err) { alert(err.message); }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
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

        if (page === 'faculty-dashboard') initFacultyDashboard();
        else if (page === 'faculty-applicants') initFacultyApplicants();
        else if (page === 'faculty-schedule') initScheduleInterview();
        else if (page === 'faculty-interview-evaluation') initInterviewEvaluation();
        else if (page === 'faculty-assign') initAssignTa();
        else if (page === 'faculty-ta-evaluation') initTaEvaluation();
    } catch(err) {
        console.error(err);
        if (err.message.includes('Authentication')) location.href = '../Login/signin.html';
    }
});