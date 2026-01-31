
import React from 'react';
import { BusLine } from '../types';

interface BusCardProps {
  line: BusLine;
  onSelect: (line: BusLine) => void;
}

const BusCard: React.FC<BusCardProps> = ({ line, onSelect }) => {
  const statusColors = {
    Normal: 'bg-green-100 text-green-800',
    Atrasado: 'bg-yellow-100 text-yellow-800',
    Indisponível: 'bg-red-100 text-red-800',
  };

  return (
    <div 
      onClick={() => onSelect(line)}
      className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow cursor-pointer group"
    >
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">
            {line.number}
          </div>
          <div>
            <h3 className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors">{line.name}</h3>
            <p className="text-sm text-gray-500">{line.origin} → {line.destination}</p>
          </div>
        </div>
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[line.status]}`}>
          {line.status}
        </span>
      </div>
      
      <div className="flex items-center gap-4 text-sm text-gray-600">
        <div className="flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="Wait 12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {line.frequencyMinutes} min
        </div>
        <div className="flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {line.schedules.length} horários
        </div>
      </div>
    </div>
  );
};

export default BusCard;
