import { createViemExecutor, createViemReader, type AgentExecutor } from './chain';
import { ConfigError, loadConfig } from './config';
import { consoleLogger as log } from './log';
import { AgentRunner } from './runner';
import { StateStore } from './state';
import { createStatusServer } from './statusServer';
import { binanceIndicatorSource } from './strategies';

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (e) {
    log('error', 'invalid configuration - refusing to start', { error: (e as Error).message });
    if (e instanceof ConfigError) process.exit(2);
    throw e;
  }
  const reader = createViemReader(config.network, config.rpcUrl);
  const executors = new Map<string, AgentExecutor>();
  for (const a of config.agents) {
    if (a.enabled && !a.privateKey) {
      log('warn', `agent ${a.id}: no key configured (AGENT_${a.id.toUpperCase()}_PRIVATE_KEY or _FILE) - idle`);
    }
    if (!a.enabled || !a.privateKey) continue;
    executors.set(a.id, createViemExecutor(config.network, config.rpcUrl, a.privateKey, a.module, reader.client));
    a.privateKey = null; // the executor holds the account; drop our copy
  }
  for (const k of Object.keys(process.env)) {
    if (/^AGENT_.*_PRIVATE_KEY$/.test(k)) delete process.env[k]; // not inherited by anything
  }

  const state = new StateStore(config.stateDir);
  const runner = new AgentRunner({ config, reader, executors, state, indicators: binanceIndicatorSource(), log });

  log('info', 'agent-runner starting', {
    network: config.network.key,
    testnet: config.network.testnet,
    dryRun: config.dryRun,
    killSwitch: runner.killActive(),
    safe: config.safe,
    agents: config.agents.map((a) => ({ id: a.id, enabled: a.enabled, address: executors.get(a.id)?.agentAddress, module: a.module })),
  });
  if (!config.network.testnet) log('warn', 'MAINNET MODE - real funds', { network: config.network.key });

  const server = createStatusServer(() => runner.status(), { token: config.statusToken });
  server.listen(config.statusPort, '0.0.0.0', () => log('info', 'status API listening', { port: config.statusPort }));

  for (const a of config.agents) if (a.enabled) {
    const p = await runner.preflight(a);
    log(p.ok ? 'info' : 'warn', `preflight ${a.id}`, { ...p });
  }

  const loop = async () => {
    await runner.tick();
  };
  await loop();
  const timer = setInterval(() => void loop(), config.tickSeconds * 1000);

  const stop = (sig: string) => {
    log('info', 'shutting down', { sig });
    clearInterval(timer);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
}

main().catch((e) => {
  log('error', 'fatal', { error: (e as Error).message });
  process.exit(1);
});
