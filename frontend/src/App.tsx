import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Classes from './pages/Classes';
import Students from './pages/Students';
import Finances from './pages/Finances';
import Attendance from './pages/Attendance';
import Messages from './pages/Messages';
import Documents from './pages/Documents';
import CsvImport from './pages/CsvImport';
import UsersAdmin from './pages/UsersAdmin';
import Teachers from './pages/Teachers';
import Setup from './pages/Setup';
import Settings from './pages/Settings';
import Grades from './pages/Grades';
import Competencies from './pages/Competencies';
import ReportCards from './pages/ReportCards';
import SchoolSettings from './pages/SchoolSettings';
import Timetable from './pages/Timetable';
import LessonLog from './pages/LessonLog';
import PreRegistrationForm from './pages/PreRegistrationForm';
import Invitation from './pages/Invitation';
import PreRegistrations from './pages/PreRegistrations';
import Layout from './components/Layout';
import ThemedPage from './components/ThemedPage';

import LiquidDashboard from './pages/liquid/Dashboard';
import LiquidStudents from './pages/liquid/Students';
import LiquidClasses from './pages/liquid/Classes';
import LiquidTeachers from './pages/liquid/Teachers';
import LiquidFinances from './pages/liquid/Finances';
import LiquidCsvImport from './pages/liquid/CsvImport';
import LiquidSettings from './pages/liquid/Settings';

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
        <Route path="/preinscription" element={<PreRegistrationForm />} />
        {/* Lien d'invitation reçu par e-mail : le professeur choisit son mot de passe. */}
        <Route path="/invitation" element={<Invitation />} />

        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<ThemedPage classic={Dashboard} liquid={LiquidDashboard} />} />
          <Route path="classes" element={<ThemedPage classic={Classes} liquid={LiquidClasses} />} />
          <Route path="students" element={<ThemedPage classic={Students} liquid={LiquidStudents} />} />
          <Route path="finances" element={<ThemedPage classic={Finances} liquid={LiquidFinances} />} />
          <Route path="import-csv" element={<ThemedPage classic={CsvImport} liquid={LiquidCsvImport} />} />
          <Route path="teachers" element={<ThemedPage classic={Teachers} liquid={LiquidTeachers} />} />
          <Route path="settings" element={<ThemedPage classic={Settings} liquid={LiquidSettings} />} />
          {/* Scolarité : même page dans les deux apparences (le layout Liquid l'habille). */}
          <Route path="pre-registrations" element={<PreRegistrations />} />
          {/* Appel par demi-journée et rôles des comptes : une seule page pour les deux apparences. */}
          <Route path="attendance" element={<Attendance />} />
          {/* The roll-call sheets are now a tab of the Appel page. */}
          <Route path="attendance-sheets" element={<Navigate to="/attendance?vue=feuille" replace />} />
          <Route path="users" element={<UsersAdmin />} />
          <Route path="messagerie" element={<Messages />} />
          <Route path="documents" element={<Documents />} />
          <Route path="timetable" element={<Timetable />} />
          <Route path="lessons" element={<LessonLog />} />
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
