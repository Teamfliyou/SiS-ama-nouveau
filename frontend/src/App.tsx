import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Classes from './pages/Classes';
import Students from './pages/Students';
import Finances from './pages/Finances';
import Attendance from './pages/Attendance';
import CsvImport from './pages/CsvImport';
import UsersAdmin from './pages/UsersAdmin';
import Teachers from './pages/Teachers';
import Setup from './pages/Setup';
import Grades from './pages/Grades';
import Competencies from './pages/Competencies';
import ReportCards from './pages/ReportCards';
import SchoolSettings from './pages/SchoolSettings';
import Timetable from './pages/Timetable';
import LessonLog from './pages/LessonLog';
import PreRegistrationForm from './pages/PreRegistrationForm';
import PreRegistrations from './pages/PreRegistrations';
import Layout from './components/Layout';

// Protected Route wrapper
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/setup" element={<Setup />} />
        {/* Public: online pre-registration form for families */}
        <Route path="/preinscription" element={<PreRegistrationForm />} />
        
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="classes" element={<Classes />} />
          <Route path="students" element={<Students />} />
          <Route path="pre-registrations" element={<PreRegistrations />} />
          <Route path="finances" element={<Finances />} />
          <Route path="attendance" element={<Attendance />} />
          {/* The roll-call sheets are now a tab of the Appel page. */}
          <Route path="attendance-sheets" element={<Navigate to="/attendance?vue=feuille" replace />} />
          <Route path="timetable" element={<Timetable />} />
          <Route path="lessons" element={<LessonLog />} />
          <Route path="import-csv" element={<CsvImport />} />
          <Route path="users" element={<UsersAdmin />} />
          <Route path="teachers" element={<Teachers />} />
          <Route path="grades" element={<Grades />} />
          <Route path="competencies" element={<Competencies />} />
          <Route path="report-cards" element={<ReportCards />} />
          <Route path="school-settings" element={<SchoolSettings />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
