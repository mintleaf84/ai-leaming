export type SystemStatus = {
  os: {
    platform: string;
    release: string;
    uptime: number;
    loadavg: number[];
    cpus: number;
    memory: {
      total: number;
      free: number;
    };
  };
  db: {
    size: number;
  };
  process: {
    uptime: number;
    memory: {
      heapUsed: number;
      rss: number;
    };
    version: string;
  };
  ai: {
    today: {
      totalCalls: number;
      successCalls: number;
      totalCost: number;
      totalTokens: number;
    };
    total: {
      totalCalls: number;
      successCalls: number;
      totalCost: number;
      totalTokens: number;
    };
    byModel: {
      model: string;
      calls: number;
      tokens: number;
      cost: number;
    }[];
  };
  demoMode?: boolean;
  appVersion: string;
  timestamp: number;
};
