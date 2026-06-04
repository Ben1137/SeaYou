import React, { useEffect, useState } from 'react';
import {
  ComposedChart,
  Bar,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';

interface MeteogramChartProps {
  lat: number;
  lon: number;
  name: string;
}

interface HourlyPoint {
  label: string;
  temp: number | null;
  wind: number | null;
  precip: number | null;
}

function parseHourly(json: any): HourlyPoint[] {
  const times: string[] = json.hourly?.time ?? [];
  const temps: (number | null)[] = json.hourly?.temperature_2m ?? [];
  const winds: (number | null)[] = json.hourly?.wind_speed_10m ?? [];
  const precips: (number | null)[] = json.hourly?.precipitation ?? [];

  // One point every 6 hours → 28 points over 7 days
  return times
    .filter((_, i) => i % 6 === 0)
    .map((t, i) => {
      const idx = i * 6;
      const date = new Date(t);
      const day = date.toLocaleDateString('en', { weekday: 'short' });
      const hour = date.getHours().toString().padStart(2, '0');
      return {
        label: `${day} ${hour}:00`,
        temp: temps[idx] ?? null,
        wind: winds[idx] ?? null,
        precip: precips[idx] ?? null,
      };
    });
}

export const MeteogramChart: React.FC<MeteogramChartProps> = ({ lat, lon }) => {
  const [data, setData] = useState<HourlyPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
      `&hourly=temperature_2m,wind_speed_10m,precipitation` +
      `&forecast_days=7&timezone=auto`;

    fetch(url, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => setData(parseHourly(json)))
      .catch((err) => {
        if (err.name !== 'AbortError') setError('Forecast unavailable.');
      });

    return () => controller.abort();
  }, [lat, lon]);

  if (error) {
    return (
      <div style={{ padding: '8px', color: '#94a3b8', fontSize: '12px' }}>
        {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div
        style={{
          width: 280,
          height: 180,
          background: '#1e293b',
          borderRadius: '6px',
          margin: '8px 0',
        }}
      />
    );
  }

  return (
    <div style={{ marginTop: '8px', background: '#0f172a', borderRadius: '6px', padding: '4px' }}>
      {/* Fixed dimensions — no ResponsiveContainer because popup DOM has no layout at mount time */}
      <ComposedChart
        width={280}
        height={180}
        data={data}
        margin={{ top: 4, right: 8, bottom: 0, left: -8 }}
      >
        <XAxis
          dataKey="label"
          stroke="#475569"
          tick={{ fill: '#64748b', fontSize: 9 }}
          interval={3}
          tickLine={false}
        />
        <YAxis
          yAxisId="wind"
          orientation="left"
          stroke="#475569"
          tick={{ fill: '#64748b', fontSize: 9 }}
          tickLine={false}
          axisLine={false}
          width={28}
        />
        <YAxis
          yAxisId="temp"
          orientation="right"
          stroke="#475569"
          tick={{ fill: '#64748b', fontSize: 9 }}
          tickLine={false}
          axisLine={false}
          width={28}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '6px',
            fontSize: '11px',
            color: '#cbd5e1',
          }}
          labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
        />
        <Legend wrapperStyle={{ fontSize: '9px', color: '#64748b', paddingTop: '2px' }} />
        <Bar
          yAxisId="wind"
          dataKey="precip"
          name="Precip (mm)"
          fill="#3b82f6"
          opacity={0.7}
          maxBarSize={6}
        />
        <Area
          yAxisId="wind"
          type="monotone"
          dataKey="wind"
          name="Wind (km/h)"
          stroke="#22d3ee"
          fill="#22d3ee"
          fillOpacity={0.15}
          dot={false}
          strokeWidth={1.5}
        />
        <Line
          yAxisId="temp"
          type="monotone"
          dataKey="temp"
          name="Temp (°C)"
          stroke="#f97316"
          dot={false}
          strokeWidth={1.5}
        />
      </ComposedChart>
    </div>
  );
};

export default MeteogramChart;
