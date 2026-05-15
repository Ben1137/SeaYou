import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface WindChartProps {
  data: Array<{
    time: string;
    speed: number;
    gusts?: number;
    direction?: number;
  }>;
}

export const WindChart: React.FC<WindChartProps> = ({ data }) => {
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
          dataKey="speed" 
          stroke="#06B6D4" 
          strokeWidth={2}
          dot={false}
        />
        {data[0]?.gusts && (
          <Line 
            type="monotone" 
            dataKey="gusts" 
            stroke="#EF4444" 
            strokeWidth={1}
            strokeDasharray="5 5"
            dot={false}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
};

export default WindChart;