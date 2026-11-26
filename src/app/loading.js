import LoadingSpinner from '@/components/LoadingSpinner';

export default function GlobalLoading() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="h-16 bg-primary-800 shadow-md w-full animate-pulse" />
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex items-center justify-center">
        <LoadingSpinner message="Loading page..." size="md" />
      </div>
    </div>
  );
}
