import React from 'react';

interface SkeletonCardProps {
  light: boolean;
}

const SkeletonCard: React.FC<SkeletonCardProps> = ({ light }) => (
  <div className={`${light ? 'bg-white border-gray-200' : 'bg-slate-900 border-white/10'} border p-5 rounded-[2.5rem] flex flex-col gap-4 shadow-xl animate-pulse`}>
    <div className="flex items-center gap-4">
      <div className={`w-24 h-10 ${light ? 'bg-gray-200' : 'bg-slate-800'} rounded-2xl`} />
      <div className="flex flex-col gap-2 flex-1">
        <div className={`h-3 ${light ? 'bg-gray-200' : 'bg-slate-800'} rounded-full w-16`} />
        <div className={`h-4 ${light ? 'bg-gray-200' : 'bg-slate-800'} rounded-full w-40`} />
        <div className={`h-3 ${light ? 'bg-gray-200' : 'bg-slate-800'} rounded-full w-20`} />
      </div>
    </div>
    <div className="flex gap-2">
      <div className={`flex-1 h-24 ${light ? 'bg-gray-200' : 'bg-slate-800'} rounded-[1.5rem]`} />
      <div className={`flex-1 h-24 ${light ? 'bg-gray-100' : 'bg-slate-800/60'} rounded-[1.5rem]`} />
    </div>
  </div>
);

export default SkeletonCard;
