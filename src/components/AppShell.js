'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import Navbar from '@/components/Navbar';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function AppShell({ children, allowedRoles }) {
  const { user, employee, loading, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [loading, user, router]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="card max-w-sm w-full text-center py-10">
          <div className="w-12 h-12 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center text-2xl mx-auto mb-4 ring-1 ring-primary-100">
            ❄️
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-1">Jospo E41</h2>
          <LoadingSpinner message="Verifying authentication & profile..." size="md" />
        </div>
      </div>
    );
  }

  // Not logged in (handled by useEffect redirect, but graceful fallback)
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="card max-w-md w-full text-center">
          <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xl mx-auto mb-3">
            🔒
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Authentication Required</h2>
          <p className="text-sm text-gray-600 mb-6">
            Please log in to access the Jospo E41 Manufacturing System.
          </p>
          <Link href="/login" className="btn-primary inline-flex items-center justify-center w-full">
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  // Logged in but employee record not found
  if (!employee) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Navbar />
        <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
          <div className="card max-w-lg w-full text-center p-8 border-red-200">
            <div className="w-14 h-14 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-2xl mx-auto mb-4">
              ⚠️
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">No Employee Profile Found</h2>
            <p className="text-sm text-gray-600 mb-4 leading-relaxed">
              Your login credentials were confirmed ({user.email}), but no active employee profile is linked to your account in the system database.
            </p>
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 mb-6 border border-gray-200 text-left">
              <strong>Next Step:</strong> Contact your system administrator to ensure your profile has been added to the <code>employees</code> table with the role <em>admin</em>, <em>production</em>, or <em>dispatch</em>.
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                type="button"
                onClick={() => signOut()}
                className="btn-secondary text-sm"
              >
                Sign Out
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="btn-primary text-sm"
              >
                Retry Connection
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Role check: if allowedRoles is specified and employee.role is not permitted
  if (allowedRoles && Array.isArray(allowedRoles) && allowedRoles.length > 0) {
    if (!allowedRoles.includes(employee.role)) {
      return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
          <Navbar />
          <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
            <div className="card max-w-lg w-full text-center p-8 border-amber-200">
              <div className="w-14 h-14 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-2xl mx-auto mb-4">
                🚫
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
              <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                You do not have permission to view this section.
              </p>
              <div className="bg-amber-50 rounded-lg p-3.5 text-xs text-amber-800 mb-6 border border-amber-200 text-left space-y-1">
                <div>
                  <span className="font-semibold">Your Current Role:</span>{' '}
                  <span className="capitalize font-mono font-bold">{employee.role}</span>
                </div>
                <div>
                  <span className="font-semibold">Required Role(s):</span>{' '}
                  <span className="font-mono">{allowedRoles.join(', ')}</span>
                </div>
              </div>
              <div className="flex justify-center">
                <Link href="/" className="btn-primary text-sm inline-flex items-center space-x-2">
                  <span>← Return to Dashboard</span>
                </Link>
              </div>
            </div>
          </main>
        </div>
      );
    }
  }

  // Authorized: render Navbar + Main Content
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {children}
      </main>
      <footer className="bg-white border-t border-gray-200 py-4 text-center text-xs text-gray-500">
        <div className="max-w-7xl mx-auto px-4">
          Jospo E41 • Manufacturing & Stock Management System
        </div>
      </footer>
    </div>
  );
}
