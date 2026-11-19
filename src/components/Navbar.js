'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { usePlant } from '@/contexts/PlantContext';
import { PLANTS, ALL_PLANTS_ID } from '@/lib/plants';

const NAV_ITEMS = [
  {
    label: 'Dashboard',
    href: '/',
    icon: '📊',
    roles: ['owner', 'admin', 'production', 'dispatch'],
  },
  {
    label: 'Production',
    href: '/production',
    icon: '🏭',
    roles: ['owner', 'admin', 'production'],
  },
  {
    label: 'Dispatch',
    href: '/dispatch',
    icon: '📦',
    roles: ['owner', 'admin', 'dispatch'],
  },
  {
    label: 'Stock',
    href: '/stock',
    icon: '📋',
    roles: ['owner', 'admin', 'production', 'dispatch'],
  },
  {
    label: 'Models',
    href: '/models',
    icon: '⚙️',
    roles: ['owner', 'admin'],
  },
  {
    label: 'Reports',
    href: '/reports',
    icon: '📈',
    roles: ['owner', 'admin'],
  },
  {
    label: 'Admin',
    href: '/admin',
    icon: '👥',
    roles: ['owner', 'admin'],
  },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { employee, user, signOut } = useAuth();
  const { activePlant, setActivePlant, isOwner, allPlants, inboundTransfersCount } = usePlant();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [plantDropdownOpen, setPlantDropdownOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const userRole = employee?.role || 'production';

  // Filter navigation links based on user role (Owner has access to all)
  const visibleNavItems = NAV_ITEMS.filter((item) =>
    isOwner || item.roles.includes(userRole)
  );

  const handleSignOut = async () => {
    try {
      setLoggingOut(true);
      await signOut();
      router.push('/login');
    } catch (error) {
      console.error('Failed to sign out:', error);
    } finally {
      setLoggingOut(false);
    }
  };

  const isLinkActive = (href) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const getRoleBadge = (role) => {
    switch (role) {
      case 'owner':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-400 text-amber-950 border border-amber-300">
            👑 Owner
          </span>
        );
      case 'admin':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
            Admin
          </span>
        );
      case 'production':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
            Production
          </span>
        );
      case 'dispatch':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
            Dispatch
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-primary-100 text-primary-800">
            {role || 'User'}
          </span>
        );
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-primary-800 text-white shadow-md">
      {/* Top Header Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left: Mobile hamburger & Logo & Plant Switcher */}
          <div className="flex items-center space-x-3 sm:space-x-4">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="lg:hidden inline-flex items-center justify-center p-2 rounded-lg text-primary-200 hover:text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-white"
              aria-expanded={mobileMenuOpen}
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>

            <Link href="/" className="flex items-center space-x-2.5 focus:outline-none">
              <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-xl font-bold ring-1 ring-white/20">
                ❄️
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-bold tracking-tight text-white flex items-center gap-1.5">
                  Jospo
                  <span className="text-[10px] uppercase tracking-wider bg-primary-700/80 px-1.5 py-0.5 rounded text-primary-200 font-semibold border border-primary-600/60">
                    {isOwner ? 'ENTERPRISE' : 'MFG'}
                  </span>
                </span>
                <span className="text-[11px] text-primary-200/90 hidden sm:inline">
                  Multi-Plant Manufacturing ERP
                </span>
              </div>
            </Link>

            {/* Plant Selector / Indicator */}
            {isOwner ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setPlantDropdownOpen((prev) => !prev)}
                  className="inline-flex items-center space-x-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-xs font-bold bg-primary-950/80 hover:bg-primary-950 text-white border border-primary-500/60 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-amber-400"
                  title="Switch Active Plant (Owner Control)"
                >
                  <span>{activePlant === ALL_PLANTS_ID ? '🌐' : '🏭'}</span>
                  <span className="font-semibold text-xs truncate max-w-[90px] sm:max-w-none">
                    {activePlant === ALL_PLANTS_ID ? 'All Plants' : `${activePlant} Plant`}
                  </span>
                  <span className="text-[10px] text-primary-300">▼</span>
                </button>

                {plantDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setPlantDropdownOpen(false)}
                    />
                    <div className="absolute left-0 mt-2 w-64 rounded-xl bg-white shadow-2xl border border-gray-200 py-1.5 z-40 text-gray-800 animate-fadeIn">
                      <div className="px-3 py-1.5 border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        Switch Plant View (Owner Access)
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setActivePlant(ALL_PLANTS_ID);
                          setPlantDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-xs font-semibold flex items-center space-x-2.5 transition-colors ${
                          activePlant === ALL_PLANTS_ID
                            ? 'bg-primary-50 text-primary-800 font-bold border-l-4 border-primary-600'
                            : 'hover:bg-gray-50 text-gray-700'
                        }`}
                      >
                        <span className="text-lg">🌐</span>
                        <div>
                          <div className="font-bold">All Plants (Consolidated)</div>
                          <div className="text-[10px] font-normal text-gray-500">
                            Combined view of E41 G2, D4 & C116
                          </div>
                        </div>
                      </button>

                      {allPlants.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setActivePlant(p.id);
                            setPlantDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 text-xs font-semibold flex items-center space-x-2.5 transition-colors ${
                            activePlant === p.id
                              ? 'bg-primary-50 text-primary-800 font-bold border-l-4 border-primary-600'
                              : 'hover:bg-gray-50 text-gray-700'
                          }`}
                        >
                          <span className="text-lg">🏭</span>
                          <div>
                            <div className="font-bold">{p.name}</div>
                            <div className="text-[10px] font-normal text-gray-500">{p.description}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div
                className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-primary-950/70 text-primary-100 border border-primary-600/40"
                title="Your Assigned Plant"
              >
                <span>🏭</span>
                <span className="font-semibold">{activePlant} Plant</span>
              </div>
            )}
          </div>

          {/* Right: Employee Info & Logout Button */}
          <div className="flex items-center space-x-3 sm:space-x-4">
            <div className="flex items-center space-x-3 text-right">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-sm font-semibold text-white truncate max-w-[150px]">
                  {employee?.name || user?.email?.split('@')[0] || 'Employee'}
                </span>
                <div className="mt-0.5">
                  {getRoleBadge(userRole)}
                </div>
              </div>
              <div className="w-9 h-9 rounded-full bg-primary-700 border border-primary-500/50 flex items-center justify-center text-sm font-bold text-white shadow-inner">
                {(employee?.name || user?.email || 'E').charAt(0).toUpperCase()}
              </div>
            </div>

            <button
              type="button"
              onClick={handleSignOut}
              disabled={loggingOut}
              title="Sign Out"
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary-900/60 hover:bg-primary-900 text-primary-100 hover:text-white border border-primary-700/60 transition-colors focus:outline-none focus:ring-2 focus:ring-white disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </div>

      {/* Desktop Navigation Links Bar */}
      <nav aria-label="Main Navigation" className="hidden lg:block bg-primary-900/50 border-t border-primary-700/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-1 py-1.5 overflow-x-auto">
            {visibleNavItems.map((item) => {
              const active = isLinkActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                    active
                      ? 'bg-primary-950 text-white font-semibold shadow-inner border border-primary-600/40'
                      : 'text-primary-100 hover:bg-primary-700/60 hover:text-white'
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  <span>{item.label}</span>
                  {item.href === '/dispatch' && inboundTransfersCount > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-500 text-white shadow-sm animate-pulse">
                      {inboundTransfersCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Mobile Collapsible Navigation Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-primary-700/80 bg-primary-900 px-4 pt-3 pb-4 space-y-1 shadow-xl animate-in slide-in-from-top-2">
          {/* Mobile User Details */}
          <div className="flex items-center justify-between pb-3 mb-2 border-b border-primary-700/60 px-2 sm:hidden">
            <div>
              <p className="text-sm font-semibold text-white">
                {employee?.name || user?.email || 'Employee'}
              </p>
              <p className="text-xs text-primary-200">{user?.email}</p>
            </div>
            <div>{getRoleBadge(userRole)}</div>
          </div>

          {/* Mobile Links */}
          {visibleNavItems.map((item) => {
            const active = isLinkActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg text-base font-medium transition-colors ${
                  active
                    ? 'bg-primary-950 text-white font-semibold border border-primary-600/50'
                    : 'text-primary-100 hover:bg-primary-800 hover:text-white'
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                <span>{item.label}</span>
                {item.href === '/dispatch' && inboundTransfersCount > 0 && (
                  <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-extrabold bg-rose-500 text-white animate-pulse">
                    {inboundTransfersCount} Inbound
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </header>
  );
}
