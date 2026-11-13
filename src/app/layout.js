import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { ToastProvider } from '@/components/Toast';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Jospo E41 - Manufacturing & Stock Management',
  description: 'Production, inventory, and dispatch management system for Jospo E41 manufacturing unit.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="font-sans">
        <AuthProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
