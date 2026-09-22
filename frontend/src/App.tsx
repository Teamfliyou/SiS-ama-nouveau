import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Classes from './pages/Classes';
import Students from './pages/Students';
import Finances from './pages/Finances';
import Attendance from './pages/Attendance';
import AttendanceSheets from './pages/AttendanceSheets';
import CsvImport from './pages/CsvImport';
import UsersAdmin from './pages/UsersAdmin';
import Teachers from './pages/Teachers';
import Setup from './pages/Setup';
import Settings from './pages/Settings';
import Layout from './components/Layout';
import ThemedPage from './components/ThemedPage';

import LiquidDashboard from './pages/liquid/Dashboard';
import LiquidStudents from './pages/liquid/Students';
import LiquidClasses from './pages/liquid/Classes';
import LiquidTeachers from './pages/liquid/Teachers';
import LiquidAttendance from './pages/liquid/Attendance';
import LiquidAttendanceSheets from './pages/liquid/AttendanceSheets';
import LiquidFinances from './pages/liquid/Finances';
import LiquidCsvImport from './pages/liquid/CsvImport';
import LiquidUsersAdmin from './pages/liquid/UsersAdmin';
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

        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<ThemedPage classic={Dashboard} liquid={LiquidDashboard} />} />
          <Route path="classes" element={<ThemedPage classic={Classes} liquid={LiquidClasses} />} />
          <Route path="students" element={<ThemedPage classic={Students} liquid={LiquidStudents} />} />
          <Route path="finances" element={<ThemedPage classic={Finances} liquid={LiquidFinances} />} />
          <Route path="attendance" element={<ThemedPage classic={Attendance} liquid={LiquidAttendance} />} />
          <Route path="attendance-sheets" element={<ThemedPage classic={AttendanceSheets} liquid={LiquidAttendanceSheets} />} />
          <Route path="import-csv" element={<ThemedPage classic={CsvImport} liquid={LiquidCsvImport} />} />
          <Route path="users" element={<ThemedPage classic={UsersAdmin} liquid={LiquidUsersAdmin} />} />
          <Route path="teachers" element={<ThemedPage classic={Teachers} liquid={LiquidTeachers} />} />
          <Route path="settings" element={<ThemedPage classic={Settings} liquid={LiquidSettings} />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
