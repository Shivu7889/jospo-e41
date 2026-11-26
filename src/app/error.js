'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error('Unhandled Client-Side Error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="card max-w-md w-full p-6 text-center shadow-lg border border-gray-200">
        <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center text-2xl font-bold">
          ⚠️
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-1">
          Something went wrong
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          An unexpected error occurred. You can retry the action or return to the main dashboard.
        </p>

        {error?.message && (
          <div className="mb-4 p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-left">
            <p className="text-[11px] font-mono text-rose-800 break-words">
              {error.message}
            </p>
          </div>
        )}

        <div className="flex items-center justify-center space-x-3">
          <button
            type="button"
            onClick={() => reset()}
            className="btn-primary text-xs py-2 px-4 font-semibold"
          >
            🔄 Try Again
          </button>
          <Link
            href="/"
            className="btn-secondary text-xs py-2 px-4 font-semibold"
          >
            🏠 Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
