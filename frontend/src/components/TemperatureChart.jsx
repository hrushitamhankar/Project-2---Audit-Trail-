import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const TEMPERATURE_EVENT_TYPES = new Set([
  'TEMPERATURE_READING',
  'TEMPERATURE_SPIKE',
  'SENSOR_ALERT',
]);

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
}

function TemperatureDot({ cx, cy, payload }) {
  const color = payload.isAlert ? 'var(--red)' : 'var(--accent)';
  return (
    <circle
      cx={cx}
      cy={cy}
      r={payload.isAlert ? 4 : 3}
      fill={payload.isAlert ? color : 'var(--surface)'}
      stroke={color}
      strokeWidth={2}
    />
  );
}

function TemperatureChart({ events }) {
  const readings = events
    .filter((event) => TEMPERATURE_EVENT_TYPES.has(event.eventType))
    .flatMap((event) => {
      const temperature = Number(event.payload?.temperature);
      if (event.payload?.temperature == null || !Number.isFinite(temperature)) return [];

      return [{
        timestamp: new Date(event.timestamp).getTime(),
        temperature,
        sensorId: event.payload.sensorId || 'Temperature sensor',
        isAlert:
          event.eventType === 'SENSOR_ALERT' ||
          event.payload.isAlert === true ||
          temperature > 8,
      }];
    })
    .sort((first, second) => first.timestamp - second.timestamp);
  const temperatures = readings.map((reading) => reading.temperature);
  const temperatureDomain = [
    Math.floor(Math.min(8, ...temperatures) - 1),
    Math.ceil(Math.max(8, ...temperatures) + 1),
  ];
  const timestampDomain = readings.length === 1
    ? [readings[0].timestamp - 60 * 60 * 1000, readings[0].timestamp + 60 * 60 * 1000]
    : ['dataMin', 'dataMax'];

  return (
    <section className="content-panel temperature-panel">
      <div className="panel-heading">
        <div>
          <span className="panel-kicker">Cold-chain monitoring</span>
          <h2>Temperature history</h2>
        </div>
        <span className="panel-count">{readings.length} readings</span>
      </div>
      {readings.length === 0 ? (
        <p className="temperature-empty">No temperature readings recorded.</p>
      ) : (
        <div className="temperature-chart">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={readings} margin={{ top: 12, right: 12, bottom: 4, left: 2 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} />
              <XAxis
                type="number"
                scale="time"
                dataKey="timestamp"
                domain={timestampDomain}
                tickFormatter={formatTime}
                minTickGap={24}
                stroke="var(--text-muted)"
                tick={{ fontSize: 10 }}
              />
              <YAxis
                width={48}
                domain={temperatureDomain}
                tickFormatter={(value) => `${value}°`}
                stroke="var(--text-muted)"
                tick={{ fontSize: 10 }}
              />
              <Tooltip
                labelFormatter={(timestamp) => new Date(timestamp).toLocaleString()}
                formatter={(value, _name, item) => [
                  `${value}°C${item.payload.isAlert ? ' · Alert' : ''}`,
                  item.payload.sensorId,
                ]}
                contentStyle={{
                  border: '1px solid var(--border-strong)',
                  borderRadius: 0,
                  background: 'var(--surface)',
                  color: 'var(--text)',
                }}
              />
              <ReferenceLine
                y={8}
                stroke="var(--red)"
                strokeDasharray="4 4"
                label={{ value: 'Alert threshold', fill: 'var(--red)', fontSize: 10, position: 'insideTopRight' }}
              />
              <Line
                type="monotone"
                dataKey="temperature"
                name="Temperature"
                stroke="var(--accent)"
                strokeWidth={2}
                dot={TemperatureDot}
                activeDot={{ r: 5, fill: 'var(--accent)' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

export default TemperatureChart;