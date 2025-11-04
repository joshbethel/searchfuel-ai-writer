import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/dashboard/Sidebar";

export default function DashboardLayout() {
  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="sticky top-0 h-screen">
        <Sidebar />
      </aside>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
