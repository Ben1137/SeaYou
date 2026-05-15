import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface SwellChartProps {
  data: Array<{
    time: string;
    height: number;
    period?: number;
    direction?: number;
  }>;
}

export const SwellChart: React.FC<SwellChartProps> = ({ data }) => {
  return (
    <ResponsiveContainer width="100%" height={300} minWidth={1} minHeight={1}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis 
          dataKey="time" 
          stroke="#9CA3AF"
          fontSize={12}
        />
        <YAxis 
          stroke="#9CA3AF"
          fontSize={12}
        />
        <Tooltip 
          contentStyle={{
            backgroundColor: '#1F2937',
            border: '1px solid #374151',
            borderRadius: '8px',
            color: '#F9FAFB'
          }}
        />
        <Line 
          type="monotone" 
          dataKey="height" 
          stroke="#8B5CF6" 
          strokeWidth={2}
          dot={false}
        />
        {data[0]?.period && (
          <Line 
            type="monotone" 
            dataKey="period" 
            stroke="#EC4899" 
            strokeWidth={1}
            dot={false}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
};

export default SwellChart;