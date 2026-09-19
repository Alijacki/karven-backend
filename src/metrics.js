import client from 'prom-client';

client.collectDefaultMetrics({ prefix: 'karven_' });

export const httpDuration = new client.Histogram({
  name: 'karven_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method','route','status'],
  buckets: [0.01,0.025,0.05,0.1,0.25,0.5,1,2,5]
});

export const registry = client.register;
