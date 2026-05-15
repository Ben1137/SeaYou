import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface TideChartProps {
  data: Array<{
    time: string;
    height: number;
  }>;
}

export const TideChart: React.FC<TideChartProps> = ({ data }) => {
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
          stroke="#3B82F6" 
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

export default TideChart;