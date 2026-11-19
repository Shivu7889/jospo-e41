import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { PlantProvider } from '@/contexts/PlantContext';
import { ToastProvider } from '@/components/Toast';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Jospo Enterprise - Multi-Plant Manufacturing & Stock Management',
  description: 'Enterprise multi-plant production, inter-plant transfer, inventory, and dispatch management system for E41 G2, D4, and C116.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="font-sans">
        <AuthProvider>
          <PlantProvider>
            <ToastProvider>
              {children}
            </ToastProvider>
          </PlantProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
