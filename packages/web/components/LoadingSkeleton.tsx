import React from 'react';

export const DashboardSkeleton: React.FC = () => (
  <div className="space-y-6 animate-pulse">
    {/* Activity Cards Skeleton */}
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="bg-slate-800 h-32 rounded-lg"></div>
      ))}
    </div>

    {/* Chart Skeleton */}
    <div className="bg-slate-800 h-64 rounded-lg"></div>

    {/* Tabs Skeleton */}
    <div className="flex gap-2 mb-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-slate-800 h-10 w-24 rounded"></div>
      ))}
    </div>

    {/* Table Skeleton */}
    <div className="bg-slate-800 h-96 rounded-lg"></div>
  </div>
);

export const CardSkeleton: React.FC = () => (
  <div className="bg-slate-800 rounded-lg p-6 animate-pulse">
    <div className="flex items-center justify-between mb-4">
      <div className="w-12 h-12 bg-slate-700 rounded"></div>
      <div className="w-16 h-6 bg-slate-700 rounded"></div>
    </div>
    <div className="space-y-2">
      <div className="h-4 bg-slate-700 rounded w-3/4"></div>
      <div className="h-4 bg-slate-700 rounded w-1/2"></div>
    </div>
  </div>
);

export const ChartSkeleton: React.FC = () => (
  <div className="bg-slate-800 rounded-lg p-6 animate-pulse">
    <div className="h-6 bg-slate-700 rounded w-32 mb-4"></div>
    <div className="h-64 bg-slate-700 rounded"></div>
  </div>
);

export const TableSkeleton: React.FC = () => (
  <div className="bg-slate-800 rounded-lg p-6 animate-pulse">
    <div className="h-6 bg-slate-700 rounded w-40 mb-4"></div>
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-12 bg-slate-700 rounded"></div>
      ))}
    </div>
  </div>
);
