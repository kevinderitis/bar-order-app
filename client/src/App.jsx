import AdminApp from "./pages/AdminApp.jsx";
import CustomerApp from "./pages/CustomerApp.jsx";

export default function App() {
  const isAdmin = window.location.pathname.startsWith("/admin");
  return isAdmin ? <AdminApp /> : <CustomerApp />;
}
