-- --------------------------------------------------------
-- 1. DATABASE RESET & CREATION
-- --------------------------------------------------------
DROP DATABASE IF EXISTS ta_portal;
CREATE DATABASE ta_portal CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ta_portal;

-- --------------------------------------------------------
-- 2. TABLE CREATIONS
-- --------------------------------------------------------

-- Users Table (Handles Auth & Roles)
CREATE TABLE users (
    user_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('Student', 'Faculty', 'Admin') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Student Profiles
CREATE TABLE student_profiles (
    profile_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL UNIQUE,
    student_id_number VARCHAR(50) NOT NULL UNIQUE,
    department VARCHAR(100) NOT NULL,
    cgpa DECIMAL(3,2) NOT NULL,
    completed_credits INT UNSIGNED NOT NULL,
    CONSTRAINT fk_student_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Faculty Profiles
CREATE TABLE faculty_profiles (
    profile_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL UNIQUE,
    department VARCHAR(100) NOT NULL,
    designation VARCHAR(100) NOT NULL,
    CONSTRAINT fk_faculty_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Recruitment Rules (Authoritative global rules for Fall 2026 cycle)
CREATE TABLE recruitment_rules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cycle_name VARCHAR(50) NOT NULL DEFAULT 'Fall 2026',
    min_cgpa DECIMAL(3,2) NOT NULL DEFAULT 3.50,
    min_credits INT UNSIGNED NOT NULL DEFAULT 60,
    prerequisite_required BOOLEAN NOT NULL DEFAULT 1,
    max_ta_assignments INT UNSIGNED NOT NULL DEFAULT 2,
    application_deadline DATE NOT NULL DEFAULT '2026-12-31',
    max_application_choices INT UNSIGNED NOT NULL DEFAULT 3,
    updated_by BIGINT UNSIGNED NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Student Academic Records (Prerequisite & Completed course verification)
CREATE TABLE student_academic_records (
    record_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    student_user_id BIGINT UNSIGNED NOT NULL,
    course_code VARCHAR(20) NOT NULL,
    grade VARCHAR(5) NOT NULL,
    completed_flag BOOLEAN NOT NULL DEFAULT 1,
    semester VARCHAR(20) DEFAULT 'Spring 2026',
    CONSTRAINT fk_academic_student FOREIGN KEY (student_user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Courses Table (Canonical IDs without spaces, Departments: BBA, CSE, EEE, Civil)
CREATE TABLE courses (
    course_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    course_code VARCHAR(20) NOT NULL UNIQUE,
    course_name VARCHAR(255) NOT NULL,
    department VARCHAR(100) NOT NULL
) ENGINE=InnoDB;

-- Course Criteria (Centrally managed rules for specific courses)
CREATE TABLE course_criteria (
    criterion_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    course_id BIGINT UNSIGNED NOT NULL UNIQUE,
    preferred_grade VARCHAR(5) DEFAULT 'A',
    prerequisite_code VARCHAR(20) DEFAULT 'None',
    CONSTRAINT fk_criteria_course FOREIGN KEY (course_id) REFERENCES courses(course_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- TA Positions (Structured schedule: recurring days, start_time, end_time, room)
CREATE TABLE ta_positions (
    position_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    course_id BIGINT UNSIGNED NOT NULL,
    section_code VARCHAR(10) NOT NULL,
    faculty_user_id BIGINT UNSIGNED NOT NULL,
    days VARCHAR(50) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    room VARCHAR(50) NOT NULL,
    weekly_hours INT UNSIGNED NOT NULL DEFAULT 3,
    status ENUM('Open', 'Closed', 'Assigned') DEFAULT 'Open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_position_course FOREIGN KEY (course_id) REFERENCES courses(course_id) ON DELETE CASCADE,
    CONSTRAINT fk_position_faculty FOREIGN KEY (faculty_user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT uk_course_section UNIQUE (course_id, section_code)
) ENGINE=InnoDB;

-- Student Applications (One per student per recruitment cycle)
CREATE TABLE applications (
    application_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    student_user_id BIGINT UNSIGNED NOT NULL,
    cycle_id VARCHAR(50) NOT NULL DEFAULT 'Fall 2026',
    statement_of_interest TEXT,
    cv_file_path VARCHAR(255),
    transcript_file_path VARCHAR(255),
    portfolio_link VARCHAR(255),
    overall_status ENUM('Under Review', 'Shortlisted', 'Rejected', 'Interview', 'Passed', 'Assigned') DEFAULT 'Under Review',
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_app_student FOREIGN KEY (student_user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT uk_student_cycle UNIQUE (student_user_id, cycle_id)
) ENGINE=InnoDB;

-- Application Choices (Ranked choices with unique position and rank per application)
CREATE TABLE application_choices (
    application_choice_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    application_id BIGINT UNSIGNED NOT NULL,
    position_id BIGINT UNSIGNED NOT NULL,
    preference_rank TINYINT UNSIGNED NOT NULL,
    workflow_status ENUM('Under Review', 'Shortlisted', 'Rejected', 'Interview', 'Passed', 'Failed', 'Assigned') DEFAULT 'Under Review',
    CONSTRAINT fk_choice_app FOREIGN KEY (application_id) REFERENCES applications(application_id) ON DELETE CASCADE,
    CONSTRAINT fk_choice_pos FOREIGN KEY (position_id) REFERENCES ta_positions(position_id) ON DELETE CASCADE,
    CONSTRAINT uk_app_pos UNIQUE (application_id, position_id),
    CONSTRAINT uk_app_rank UNIQUE (application_id, preference_rank)
) ENGINE=InnoDB;

-- Interviews (Scheduling and delivery only)
CREATE TABLE interviews (
    interview_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    application_choice_id BIGINT UNSIGNED NOT NULL UNIQUE,
    scheduled_at DATETIME NOT NULL,
    interview_type ENUM('Online', 'In-Person') NOT NULL DEFAULT 'In-Person',
    notes TEXT,
    status ENUM('Scheduled', 'Completed', 'Cancelled') DEFAULT 'Scheduled',
    CONSTRAINT fk_interview_choice FOREIGN KEY (application_choice_id) REFERENCES application_choices(application_choice_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Interview Evaluations (Authoritative 4 sections x 1-5 = 20 max marks)
CREATE TABLE interview_evaluations (
    evaluation_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    interview_id BIGINT UNSIGNED NOT NULL UNIQUE,
    technical_knowledge TINYINT UNSIGNED NOT NULL,
    problem_solving TINYINT UNSIGNED NOT NULL,
    communication TINYINT UNSIGNED NOT NULL,
    teaching_ability TINYINT UNSIGNED NOT NULL,
    comments TEXT,
    total_score TINYINT UNSIGNED AS (technical_knowledge + problem_solving + communication + teaching_ability) STORED,
    decision ENUM('Passed', 'Failed') NOT NULL,
    evaluated_by BIGINT UNSIGNED NOT NULL,
    evaluated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_eval_interview FOREIGN KEY (interview_id) REFERENCES interviews(interview_id) ON DELETE CASCADE,
    CONSTRAINT fk_eval_faculty FOREIGN KEY (evaluated_by) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT chk_eval_scores CHECK (
        technical_knowledge BETWEEN 1 AND 5 AND 
        problem_solving BETWEEN 1 AND 5 AND 
        communication BETWEEN 1 AND 5 AND 
        teaching_ability BETWEEN 1 AND 5
    )
) ENGINE=InnoDB;

-- TA Assignments (Enforces exactly one active TA assignment per position)
CREATE TABLE ta_assignments (
    assignment_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    application_choice_id BIGINT UNSIGNED NOT NULL UNIQUE,
    position_id BIGINT UNSIGNED NOT NULL UNIQUE,
    student_user_id BIGINT UNSIGNED NOT NULL,
    assigned_hours INT UNSIGNED NOT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_assign_choice FOREIGN KEY (application_choice_id) REFERENCES application_choices(application_choice_id) ON DELETE CASCADE,
    CONSTRAINT fk_assign_pos FOREIGN KEY (position_id) REFERENCES ta_positions(position_id) ON DELETE CASCADE,
    CONSTRAINT fk_assign_student FOREIGN KEY (student_user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- TA Semester Performance Evaluations (Authoritative semester evaluation & incident reporting)
CREATE TABLE ta_performance_evaluations (
    perf_eval_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    assignment_id BIGINT UNSIGNED NOT NULL,
    evaluator_id BIGINT UNSIGNED NOT NULL,
    rating TINYINT UNSIGNED NOT NULL,
    feedback TEXT NOT NULL,
    incident_report TEXT DEFAULT NULL,
    evaluated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_perf_assign FOREIGN KEY (assignment_id) REFERENCES ta_assignments(assignment_id) ON DELETE CASCADE,
    CONSTRAINT fk_perf_evaluator FOREIGN KEY (evaluator_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT chk_perf_rating CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB;

-- Notifications
CREATE TABLE notifications (
    notification_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    category VARCHAR(50),
    is_unread BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- --------------------------------------------------------
-- 3. SEED DATA (Demo Users, Rules, Courses, Criteria, Positions, Workflow)
-- --------------------------------------------------------

-- Test Users (Password for all demo accounts is 'password123')
-- Bcrypt hash for 'password123': $2y$10$Ua1IcodsAcXaCvTgETHVs.NGu7B9YDZ7NdawnoF6RPgI4cvgo/Bpe
INSERT INTO users (user_id, name, email, password_hash, role) VALUES
(1,  'System Admin',       'admin@university.edu',   '$2y$10$Ua1IcodsAcXaCvTgETHVs.NGu7B9YDZ7NdawnoF6RPgI4cvgo/Bpe', 'Admin'),
(2,  'Dr. M. Rahman',      'faculty@university.edu', '$2y$10$Ua1IcodsAcXaCvTgETHVs.NGu7B9YDZ7NdawnoF6RPgI4cvgo/Bpe', 'Faculty'),
(3,  'Dr. Tahmina Khan',   'tkhan@university.edu',   '$2y$10$Ua1IcodsAcXaCvTgETHVs.NGu7B9YDZ7NdawnoF6RPgI4cvgo/Bpe', 'Faculty'),
(4,  'Dr. Farhan Ahmed',   'fahmed@university.edu',  '$2y$10$Ua1IcodsAcXaCvTgETHVs.NGu7B9YDZ7NdawnoF6RPgI4cvgo/Bpe', 'Faculty'),
(5,  'Dr. Nasrin Sultana', 'nsultana@university.edu','$2y$10$Ua1IcodsAcXaCvTgETHVs.NGu7B9YDZ7NdawnoF6RPgI4cvgo/Bpe', 'Faculty'),
(6,  'Dr. Kamal Hossain',  'khossain@university.edu','$2y$10$Ua1IcodsAcXaCvTgETHVs.NGu7B9YDZ7NdawnoF6RPgI4cvgo/Bpe', 'Faculty'),
(7,  'Dr. Sadia Afroze',   'safroze@university.edu', '$2y$10$Ua1IcodsAcXaCvTgETHVs.NGu7B9YDZ7NdawnoF6RPgI4cvgo/Bpe', 'Faculty'),
(8,  'Siam Ahmed',         'student@university.edu', '$2y$10$Ua1IcodsAcXaCvTgETHVs.NGu7B9YDZ7NdawnoF6RPgI4cvgo/Bpe', 'Student'),
(9,  'Ayesha Siddiqua',    'ayesha@university.edu',  '$2y$10$Ua1IcodsAcXaCvTgETHVs.NGu7B9YDZ7NdawnoF6RPgI4cvgo/Bpe', 'Student'),
(10, 'Tanvir Hasan',       'tanvir@university.edu',  '$2y$10$Ua1IcodsAcXaCvTgETHVs.NGu7B9YDZ7NdawnoF6RPgI4cvgo/Bpe', 'Student'),
(11, 'Nusrat Jahan',       'nusrat@university.edu',  '$2y$10$Ua1IcodsAcXaCvTgETHVs.NGu7B9YDZ7NdawnoF6RPgI4cvgo/Bpe', 'Student'),
(12, 'Rafiqul Islam',      'rafiq@university.edu',   '$2y$10$Ua1IcodsAcXaCvTgETHVs.NGu7B9YDZ7NdawnoF6RPgI4cvgo/Bpe', 'Student'),
(13, 'Sabrina Akter',      'sabrina@university.edu', '$2y$10$Ua1IcodsAcXaCvTgETHVs.NGu7B9YDZ7NdawnoF6RPgI4cvgo/Bpe', 'Student'),
(14, 'Mehedi Hasan',       'mehedi@university.edu',  '$2y$10$Ua1IcodsAcXaCvTgETHVs.NGu7B9YDZ7NdawnoF6RPgI4cvgo/Bpe', 'Student'),
(15, 'Fariha Rahman',      'fariha@university.edu',  '$2y$10$Ua1IcodsAcXaCvTgETHVs.NGu7B9YDZ7NdawnoF6RPgI4cvgo/Bpe', 'Student'),
(16, 'Anik Chowdhury',     'anik@university.edu',    '$2y$10$Ua1IcodsAcXaCvTgETHVs.NGu7B9YDZ7NdawnoF6RPgI4cvgo/Bpe', 'Student'),
(17, 'Tasnim Zara',        'tasnim@university.edu',  '$2y$10$Ua1IcodsAcXaCvTgETHVs.NGu7B9YDZ7NdawnoF6RPgI4cvgo/Bpe', 'Student'),
(18, 'Imran Khan',         'imran@university.edu',   '$2y$10$Ua1IcodsAcXaCvTgETHVs.NGu7B9YDZ7NdawnoF6RPgI4cvgo/Bpe', 'Student'),
(19, 'Ritu Saha',          'ritu@university.edu',    '$2y$10$Ua1IcodsAcXaCvTgETHVs.NGu7B9YDZ7NdawnoF6RPgI4cvgo/Bpe', 'Student');

-- Faculty Profiles
INSERT INTO faculty_profiles (user_id, department, designation) VALUES
(2, 'CSE', 'Professor'),
(3, 'CSE', 'Associate Professor'),
(4, 'EEE', 'Professor'),
(5, 'Civil', 'Associate Professor'),
(6, 'BBA', 'Professor'),
(7, 'CSE', 'Assistant Professor');

-- Student Profiles (Including User 10 who is deliberately below threshold: CGPA 3.40, 55 credits for demo)
INSERT INTO student_profiles (user_id, student_id_number, department, cgpa, completed_credits) VALUES
(8,  '2026-00108', 'CSE',   3.95, 82),
(9,  '2026-00109', 'CSE',   3.85, 75),
(10, '2026-00110', 'CSE',   3.40, 55),
(11, '2026-00111', 'CSE',   3.70, 70),
(12, '2026-00112', 'EEE',   3.80, 80),
(13, '2026-00113', 'EEE',   3.65, 68),
(14, '2026-00114', 'Civil', 3.90, 85),
(15, '2026-00115', 'Civil', 3.75, 72),
(16, '2026-00116', 'BBA',   3.82, 78),
(17, '2026-00117', 'BBA',   3.68, 65),
(18, '2026-00118', 'CSE',   3.78, 74),
(19, '2026-00119', 'CSE',   3.92, 90);

-- Seed Recruitment Rules for Fall 2026
INSERT INTO recruitment_rules (id, cycle_name, min_cgpa, min_credits, prerequisite_required, max_ta_assignments, application_deadline, max_application_choices, updated_by) VALUES
(1, 'Fall 2026', 3.50, 60, 1, 2, '2026-12-31', 3, 1);

-- Student Academic Records (Prerequisites & Course Grades)
INSERT INTO student_academic_records (student_user_id, course_code, grade, completed_flag, semester) VALUES
(8,  'CSE1112', 'A',  1, 'Fall 2024'),
(8,  'CSE1116', 'A',  1, 'Spring 2025'),
(8,  'CSE2118', 'A',  1, 'Summer 2025'),
(8,  'CSE2216', 'B',  1, 'Fall 2025'),
(8,  'CSE3842', 'A',  1, 'Spring 2026'),
(9,  'CSE1112', 'A',  1, 'Fall 2024'),
(9,  'CSE1116', 'A-', 1, 'Spring 2025'),
(9,  'CSE2118', 'B+', 1, 'Summer 2025'),
(11, 'CSE1112', 'A',  1, 'Fall 2024'),
(11, 'CSE1116', 'B+', 1, 'Spring 2025'),
(12, 'EEE102',  'A',  1, 'Fall 2024'),
(12, 'EEE201',  'A',  1, 'Spring 2025'),
(13, 'EEE102',  'B+', 1, 'Fall 2024'),
(14, 'CE102',   'A',  1, 'Fall 2024'),
(14, 'CE204',   'A',  1, 'Spring 2025'),
(15, 'CE102',   'B+', 1, 'Fall 2024'),
(16, 'ACT201',  'A',  1, 'Fall 2024'),
(16, 'BUS102',  'A',  1, 'Spring 2025'),
(18, 'CSE1112', 'B+', 1, 'Fall 2024'),
(19, 'CSE1112', 'A',  1, 'Fall 2024'),
(19, 'CSE1116', 'A',  1, 'Spring 2025');

-- Course Catalog (42 courses across CSE, EEE, Civil, BBA)
INSERT INTO courses (course_id, course_code, course_name, department) VALUES
(1,  'CSE1112', 'Structured Programming Language Laboratory', 'CSE'),
(2,  'CSE1116', 'Object Oriented Programming Lab', 'CSE'),
(3,  'CSE2118', 'Advanced Object Oriented Programming Lab', 'CSE'),
(4,  'CSE226',  'Digital Logic Design Lab', 'CSE'),
(5,  'CSE2216', 'Data Structure and Algorithms I Laboratory', 'CSE'),
(6,  'CSE2218', 'Algorithms Laboratory / Data Structure and Algorithms II Lab', 'CSE'),
(7,  'CSE236',  'Assembly Programming Laboratory', 'CSE'),
(8,  'CSE3842', 'Artificial Intelligence Laboratory', 'CSE'),
(9,  'CSE4326', 'Microprocessors and Microcontrollers Lab', 'CSE'),
(10, 'CSE3412', 'System Analysis and Design Lab', 'CSE'),
(11, 'CSE2124', 'Electronics Lab', 'CSE'),
(12, 'EEE102',  'Physics Laboratory', 'EEE'),
(13, 'EEE201',  'Electrical Circuit Lab', 'EEE'),
(14, 'EEE203',  'Electronics Lab', 'EEE'),
(15, 'EEE302',  'Digital Electronics Lab', 'EEE'),
(16, 'EEE304',  'Energy Conversion Lab', 'EEE'),
(17, 'EEE306',  'Microprocessor Lab', 'EEE'),
(18, 'EEE402',  'Digital Signal Processing (DSP) Lab', 'EEE'),
(19, 'EEE404',  'Control Lab', 'EEE'),
(20, 'EEE406',  'Communication Lab', 'EEE'),
(21, 'EEE408',  'Microwave Lab', 'EEE'),
(22, 'CE102',   'Chemistry Lab', 'Civil'),
(23, 'CE104',   'Physics Lab', 'Civil'),
(24, 'CE106',   'Civil Engineering Drawing I & II', 'Civil'),
(25, 'CE202',   'Computer Programming Lab', 'Civil'),
(26, 'CE204',   'Engineering Materials Laboratory', 'Civil'),
(27, 'CE206',   'GIS and Remote Sensing Lab', 'Civil'),
(28, 'CE208',   'Details of Construction', 'Civil'),
(29, 'CE302',   'Construction Detailing and Estimation Lab', 'Civil'),
(30, 'CE304',   'Environmental Engineering Laboratory', 'Civil'),
(31, 'CE306',   'Architectural Engineering & Planning Appreciation', 'Civil'),
(32, 'CE308',   'Reinforced Concrete Structure Design Lab', 'Civil'),
(33, 'CE310',   'Open Channel Flow Laboratory', 'Civil'),
(34, 'CE402',   'Steel Structures Design Lab', 'Civil'),
(35, 'CE404',   'Highway Materials and Traffic Engineering Design Lab', 'Civil'),
(36, 'CE406',   'Computer Applications', 'Civil'),
(37, 'CE408',   'Industrial Attachment', 'Civil'),
(38, 'ACT201',  'Principles of Accounting', 'BBA'),
(39, 'FIN301',  'Corporate Finance', 'BBA'),
(40, 'MGT251',  'Organizational Behavior', 'BBA'),
(41, 'MKT201',  'Principles of Marketing', 'BBA'),
(42, 'BUS102',  'Business Communication Lab', 'BBA');

-- Set Default Course Criteria
INSERT INTO course_criteria (course_id, preferred_grade, prerequisite_code) VALUES
(1,  'A', 'None'),
(2,  'A', 'CSE1112'),
(3,  'A', 'CSE1116'),
(4,  'A', 'None'),
(5,  'A', 'CSE1112'),
(6,  'A', 'CSE2216'),
(7,  'A', 'CSE226'),
(8,  'A', 'CSE2218'),
(9,  'A', 'CSE236'),
(10, 'A', 'None'),
(11, 'A', 'None');

INSERT INTO course_criteria (course_id, preferred_grade, prerequisite_code)
SELECT c.course_id, 'A', 'None' FROM courses c
WHERE c.course_id NOT IN (SELECT course_id FROM course_criteria);

-- --------------------------------------------------------
-- TA Positions (15 positions: 12 Open, 2 Assigned, 1 Closed)
-- Note: Pos 1 and Pos 3 deliberately overlap on Sun, Tue to demonstrate schedule conflict detection!
-- --------------------------------------------------------
INSERT INTO ta_positions (position_id, course_id, section_code, faculty_user_id, days, start_time, end_time, room, weekly_hours, status) VALUES
(1,  1,  'A', 2, 'Sun, Tue', '09:00:00', '10:30:00', 'Room 301', 3, 'Open'),
(2,  1,  'B', 2, 'Sun, Tue', '11:00:00', '12:30:00', 'Room 302', 3, 'Open'),
(3,  3,  'A', 2, 'Sun, Tue', '10:00:00', '11:30:00', 'Room 303', 3, 'Open'),
(4,  5,  'A', 3, 'Mon, Wed', '09:00:00', '10:30:00', 'Room 401', 3, 'Open'),
(5,  5,  'B', 3, 'Mon, Wed', '11:00:00', '12:30:00', 'Room 402', 3, 'Open'),
(6,  4,  'A', 7, 'Mon, Wed', '14:00:00', '15:30:00', 'Room 405', 3, 'Open'),
(7,  12, 'A', 4, 'Sun, Tue', '08:30:00', '10:00:00', 'Room E101', 3, 'Open'),
(8,  13, 'A', 4, 'Sun, Tue', '10:30:00', '12:00:00', 'Room E202', 3, 'Open'),
(9,  22, 'A', 5, 'Mon, Wed', '09:00:00', '10:30:00', 'Room C101', 3, 'Open'),
(10, 26, 'A', 5, 'Mon, Wed', '11:00:00', '12:30:00', 'Room C202', 3, 'Open'),
(11, 38, 'A', 6, 'Sun, Tue', '13:00:00', '14:30:00', 'Room B101', 3, 'Open'),
(12, 42, 'A', 6, 'Sun, Tue', '15:00:00', '16:30:00', 'Room B105', 3, 'Open'),
(13, 8,  'A', 2, 'Mon, Wed', '10:00:00', '11:30:00', 'Room 501', 3, 'Assigned'),
(14, 2,  'A', 2, 'Sun, Tue', '14:00:00', '15:30:00', 'Room 304', 3, 'Assigned'),
(15, 9,  'A', 3, 'Sun, Tue', '13:00:00', '14:30:00', 'Room 502', 3, 'Closed');

-- --------------------------------------------------------
-- Applications & Workflow Data
-- --------------------------------------------------------

-- Applications
INSERT INTO applications (application_id, student_user_id, cycle_id, overall_status, statement_of_interest, cv_file_path, transcript_file_path, portfolio_link) VALUES
(1, 8,  'Fall 2026', 'Assigned',     'Strong interest in AI and core computer science lab assistance.', '../uploads/cv_demo.pdf', '../uploads/transcript_demo.pdf', 'https://github.com/demo-siam'),
(2, 9,  'Fall 2026', 'Shortlisted',  'Experienced in peer tutoring and structured programming labs.',   '../uploads/cv_demo.pdf', '../uploads/transcript_demo.pdf', NULL),
(3, 11, 'Fall 2026', 'Interview',    'Passionate about helping first-year students master C programming.', '../uploads/cv_demo.pdf', '../uploads/transcript_demo.pdf', NULL),
(4, 18, 'Fall 2026', 'Under Review', 'Excited to contribute as a lab teaching assistant.',              '../uploads/cv_demo.pdf', '../uploads/transcript_demo.pdf', NULL),
(5, 19, 'Fall 2026', 'Under Review', 'Seeking TA position for structured programming.',                  '../uploads/cv_demo.pdf', '../uploads/transcript_demo.pdf', NULL),
(6, 12, 'Fall 2026', 'Under Review', 'Physics laboratory TA candidate.',                                 '../uploads/cv_demo.pdf', '../uploads/transcript_demo.pdf', NULL),
(7, 14, 'Fall 2026', 'Under Review', 'Chemistry lab demonstration assistant.',                           '../uploads/cv_demo.pdf', '../uploads/transcript_demo.pdf', NULL),
(8, 16, 'Fall 2026', 'Under Review', 'Accounting principles course teaching assistant candidate.',      '../uploads/cv_demo.pdf', '../uploads/transcript_demo.pdf', NULL);

-- Application Choices (Ranks 1-3, representing all major demo states)
INSERT INTO application_choices (application_choice_id, application_id, position_id, preference_rank, workflow_status) VALUES
(1,  1, 13, 1, 'Assigned'),
(2,  1, 14, 2, 'Assigned'),
(3,  1, 1,  3, 'Passed'),
(4,  2, 1,  1, 'Shortlisted'),
(5,  2, 2,  2, 'Under Review'),
(6,  3, 1,  1, 'Interview'),
(7,  4, 2,  1, 'Failed'),
(8,  5, 2,  1, 'Rejected'),
(9,  6, 7,  1, 'Shortlisted'),
(10, 7, 9,  1, 'Under Review'),
(11, 8, 11, 1, 'Under Review');

-- Scheduled Interviews
INSERT INTO interviews (interview_id, application_choice_id, scheduled_at, interview_type, notes, status) VALUES
(1, 1, '2026-09-18 10:00:00', 'In-Person', 'Evaluation for AI Lab TA', 'Completed'),
(2, 2, '2026-09-19 14:00:00', 'In-Person', 'Evaluation for OOP Lab TA', 'Completed'),
(3, 3, '2026-09-20 10:00:00', 'In-Person', 'Evaluation for Structured Programming TA', 'Completed'),
(4, 6, '2026-10-05 11:00:00', 'In-Person', 'Structured programming interview scheduled', 'Scheduled'),
(5, 7, '2026-09-22 14:00:00', 'Online',    'Review of core fundamentals', 'Completed');

-- Interview Evaluations (4 categories x 1-5 = max 20 marks)
-- Note: total_score is a generated column and will compute automatically
INSERT INTO interview_evaluations (evaluation_id, interview_id, technical_knowledge, problem_solving, communication, teaching_ability, comments, decision, evaluated_by) VALUES
(1, 1, 5, 5, 5, 5, 'Exceptional performance in AI theory and lab instructions.', 'Passed', 2),
(2, 2, 5, 5, 4, 5, 'Strong OOP fundamentals and lab management skills.',        'Passed', 2),
(3, 3, 5, 5, 5, 5, 'Outstanding mastery in structured C programming.',          'Passed', 2),
(4, 5, 2, 2, 2, 2, 'Did not demonstrate adequate lab problem-solving skill.',    'Failed', 2);

-- TA Assignments (Siam Ahmed holds 2 assignments: Pos 13 and Pos 14)
-- This allows testing the max-assignment rule (rule = 2) when Faculty attempts to assign Choice 3 (Pos 1)
INSERT INTO ta_assignments (assignment_id, application_choice_id, position_id, student_user_id, assigned_hours) VALUES
(1, 1, 13, 8, 3),
(2, 2, 14, 8, 3);

-- Semester Performance Evaluations
INSERT INTO ta_performance_evaluations (perf_eval_id, assignment_id, evaluator_id, rating, feedback, incident_report) VALUES
(1, 1, 2, 5, 'Consistently punctual and proactive in preparing lab scripts.', NULL);

-- Notifications (Mix of unread and read across different event categories)
INSERT INTO notifications (notification_id, user_id, title, message, category, is_unread) VALUES
(1, 8, 'TA Assignment Confirmed', 'Congratulations! You have been officially assigned as Teaching Assistant for CSE3842 Section A (3 hrs/week).', 'Assignment', 1),
(2, 8, 'TA Assignment Confirmed', 'Congratulations! You have been officially assigned as Teaching Assistant for CSE1116 Section A (3 hrs/week).', 'Assignment', 0),
(3, 8, 'Interview Result: Passed', 'Congratulations! You have passed the interview for CSE1112 Section A.', 'Interview', 0),
(4, 8, 'Application Submitted',   'Your TA application and ranked choices have been received successfully.', 'Application', 0),
(5, 9, 'Application Shortlisted', 'Your application for CSE1112 Section A has been shortlisted for interview.', 'Application', 1),
(6, 11, 'Interview Scheduled',    'Your interview for CSE1112 Section A has been scheduled for 05 Oct 2026, 11:00 AM (In-Person).', 'Interview', 1),
(7, 18, 'Interview Result: Failed','Thank you for attending the interview for CSE1112 Section B. You were not selected for this position.', 'Interview', 0);

-- --------------------------------------------------------
-- 4. INDEXES
-- --------------------------------------------------------
CREATE INDEX idx_user_role ON users(role);
CREATE INDEX idx_course_dept ON courses(department);
CREATE INDEX idx_position_status ON ta_positions(status);
CREATE INDEX idx_app_status ON applications(overall_status);
CREATE INDEX idx_choice_workflow ON application_choices(workflow_status);
CREATE INDEX idx_interview_status ON interviews(status);

-- --------------------------------------------------------
-- 5. AUTHORITATIVE VIEWS
-- --------------------------------------------------------
CREATE OR REPLACE VIEW view_application_details AS
SELECT 
    ac.application_choice_id,
    a.application_id,
    u.user_id AS student_user_id,
    u.name AS student_name,
    u.email AS student_email,
    sp.student_id_number,
    sp.department AS student_department,
    sp.cgpa,
    sp.completed_credits,
    ac.preference_rank,
    ac.workflow_status AS choice_status,
    a.overall_status AS application_status,
    a.statement_of_interest, 
    a.cv_file_path, 
    a.transcript_file_path, 
    a.portfolio_link,
    p.position_id,
    c.course_code,
    c.course_name,
    p.section_code,
    p.faculty_user_id,
    f_user.name AS faculty_name,
    a.submitted_at
FROM application_choices ac
JOIN applications a ON ac.application_id = a.application_id
JOIN users u ON a.student_user_id = u.user_id
JOIN student_profiles sp ON u.user_id = sp.user_id
JOIN ta_positions p ON ac.position_id = p.position_id
JOIN courses c ON p.course_id = c.course_id
JOIN users f_user ON p.faculty_user_id = f_user.user_id;

CREATE OR REPLACE VIEW view_available_positions AS
SELECT 
    p.position_id,
    c.course_code,
    c.course_name,
    c.department AS course_department,
    p.section_code,
    p.faculty_user_id,
    u.name AS faculty_name,
    p.days,
    p.start_time,
    p.end_time,
    p.room,
    p.weekly_hours,
    p.status,
    crit.preferred_grade,
    crit.prerequisite_code
FROM ta_positions p
JOIN courses c ON p.course_id = c.course_id
JOIN users u ON p.faculty_user_id = u.user_id
LEFT JOIN course_criteria crit ON c.course_id = crit.course_id;