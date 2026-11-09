import React from 'react';

export interface StatusCardProps {
  icon: React.ReactNode;
  bgColor: string;
  value: string;
  valueColor?: string;
  label: string;
}
export const StatusCard: React.FC<StatusCardProps> = ({
  icon, bgColor, value, valueColor = 'text-white', label,
}) => (
  <div className="bg-gray-800/60 backdrop-blur-sm rounded-2xl p-4 border border-gray-700/50">
    <div className="flex items-center gap-3">
      <div className={`w-12 h-12 ${bgColor} rounded-xl flex items-center justify-center`}>
        {icon}
      </div>
      <div>
        <div className={`text-lg font-bold ${valueColor}`}>{value}</div>
        <div className="text-gray-400 text-sm">{label}</div>
      </div>
    </div>
  </div>
);
export const StatusCard_StatusCard = StatusCard;
