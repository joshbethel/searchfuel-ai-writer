import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Plans from "./pages/Plans";
import Dashboard from "./pages/Dashboard";
import Articles from "./pages/Articles";
import Keywords from "./pages/Keywords";
import Calendar from "./pages/Calendar";
import ArticleDetail from "./pages/ArticleDetail";
import Settings from "./pages/Settings";
import WordPressDebug from "./pages/WordPressDebug";
import Presentation from "./pages/Presentation";
import DashboardLayout from "./layouts/DashboardLayout";
import NotFound from "./pages/NotFound";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import { ProtectedRoute } from "./layouts/ProtectedRoute";
import { SubscriptionProtectedRoute } from "./layouts/SubscriptionProtectedRoute";
import { AdminProtectedRoute } from "./layouts/AdminProtectedRoute";
import { SiteProvider } from "./contexts/SiteContext";
import Admin from "./pages/Admin";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <Toaster />
      <Sonner />
      <SiteProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Auth />} />
            <Route path="/index" element={<Index />} />
            <Route path="/plans" element={<Plans />} />
            <Route path="/presentation" element={<Presentation />} />
            <Route element={<SubscriptionProtectedRoute><DashboardLayout /></SubscriptionProtectedRoute>}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/articles" element={<Articles />} />
              <Route path="/articles/:id" element={<ArticleDetail />} />
              <Route path="/keywords" element={<Keywords />} />
              <Route path="/calendar" element={<Calendar />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/debug" element={<WordPressDebug />} />
            </Route>
            <Route element={<AdminProtectedRoute><DashboardLayout /></AdminProtectedRoute>}>
              <Route path="/admin" element={<Admin />} />
            </Route>
            {/* SearchFuel blog routes */}
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogPost />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </SiteProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
