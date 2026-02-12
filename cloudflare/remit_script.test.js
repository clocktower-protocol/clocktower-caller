import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseTokensForChain, getChainConfigs } from './remit_script.js';

describe('parseTokensForChain', () => {
  beforeEach(() => {
    vi.unstubAllEnvs?.();
  });

  it('returns tokens array when TOKENS_* is valid JSON with multiple tokens', () => {
    const env = {
      TOKENS_BASE: JSON.stringify([
        { address: '0xabc', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
        { address: '0xdef', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 }
      ])
    };
    const result = parseTokensForChain(env, 'BASE');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ address: '0xabc', symbol: 'USDC', name: 'USD Coin', decimals: 6 });
    expect(result[1]).toEqual({ address: '0xdef', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 });
  });

  it('returns single token with defaults when TOKENS_* has minimal token object', () => {
    const env = {
      TOKENS_BASE: JSON.stringify([{ address: '0xmin', symbol: 'X' }])
    };
    const result = parseTokensForChain(env, 'BASE');
    expect(result).toHaveLength(1);
    expect(result[0].address).toBe('0xmin');
    expect(result[0].symbol).toBe('X');
    expect(result[0].name).toBe('X');
    expect(result[0].decimals).toBe(18);
  });

  it('falls back to single USDC when TOKENS_* unset and USDC_ADDRESS_* set', () => {
    const env = {
      USDC_ADDRESS_BASE: '0x1234567890123456789012345678901234567890'
    };
    const result = parseTokensForChain(env, 'BASE');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      address: '0x1234567890123456789012345678901234567890',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6
    });
  });

  it('returns empty array when both TOKENS_* and USDC_ADDRESS_* unset', () => {
    const env = {};
    const result = parseTokensForChain(env, 'BASE');
    expect(result).toEqual([]);
  });

  it('falls back to USDC when TOKENS_* is invalid JSON', () => {
    const env = {
      TOKENS_BASE: 'not json',
      USDC_ADDRESS_BASE: '0xusdc'
    };
    const result = parseTokensForChain(env, 'BASE');
    expect(result).toHaveLength(1);
    expect(result[0].symbol).toBe('USDC');
    expect(result[0].address).toBe('0xusdc');
  });

  it('falls back to USDC when TOKENS_* is empty array', () => {
    const env = {
      TOKENS_BASE: '[]',
      USDC_ADDRESS_BASE: '0xusdc'
    };
    const result = parseTokensForChain(env, 'BASE');
    expect(result).toHaveLength(1);
    expect(result[0].symbol).toBe('USDC');
  });

  it('uses correct env keys for SEPOLIA_BASE chain key', () => {
    const env = {
      USDC_ADDRESS_SEPOLIA_BASE: '0xsep'
    };
    const result = parseTokensForChain(env, 'SEPOLIA_BASE');
    expect(result).toHaveLength(1);
    expect(result[0].address).toBe('0xsep');
    expect(result[0].symbol).toBe('USDC');
  });
});

describe('getChainConfigs', () => {
  it('returns one enabled chain when only Base has clocktower and tokens', () => {
    const env = {
      CLOCKTOWER_ADDRESS_BASE: '0xclock',
      USDC_ADDRESS_BASE: '0xusdc',
      CHAIN_ID_BASE: '8453'
    };
    const configs = getChainConfigs(env);
    expect(configs).toHaveLength(1);
    expect(configs[0].chainName).toBe('base');
    expect(configs[0].tokens).toHaveLength(1);
    expect(configs[0].tokens[0].symbol).toBe('USDC');
    expect(configs[0].usdcAddress).toBe('0xusdc');
    expect(configs[0].enabled).toBe(true);
  });

  it('returns two chains when both Base and Sepolia configured', () => {
    const env = {
      CLOCKTOWER_ADDRESS_BASE: '0xc1',
      USDC_ADDRESS_BASE: '0xu1',
      CHAIN_ID_BASE: '8453',
      CLOCKTOWER_ADDRESS_SEPOLIA_BASE: '0xc2',
      USDC_ADDRESS_SEPOLIA_BASE: '0xu2',
      CHAIN_ID_SEPOLIA_BASE: '84532'
    };
    const configs = getChainConfigs(env);
    expect(configs).toHaveLength(2);
    expect(configs[0].chainName).toBe('base');
    expect(configs[1].chainName).toBe('sepolia-base');
    expect(configs[0].tokens[0].address).toBe('0xu1');
    expect(configs[1].tokens[0].address).toBe('0xu2');
  });

  it('uses TOKENS_BASE when set and populates tokens and usdcAddress', () => {
    const env = {
      CLOCKTOWER_ADDRESS_BASE: '0xclock',
      TOKENS_BASE: JSON.stringify([
        { address: '0xa', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
        { address: '0xb', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 }
      ]),
      CHAIN_ID_BASE: '8453'
    };
    const configs = getChainConfigs(env);
    expect(configs).toHaveLength(1);
    expect(configs[0].tokens).toHaveLength(2);
    expect(configs[0].tokens[0].symbol).toBe('USDC');
    expect(configs[0].tokens[1].symbol).toBe('WETH');
    expect(configs[0].usdcAddress).toBe('0xa');
  });

  it('returns empty array when no chains have both clocktower and tokens', () => {
    const env = {
      CLOCKTOWER_ADDRESS_BASE: '0xclock'
      // no USDC_ADDRESS_BASE or TOKENS_BASE
    };
    const configs = getChainConfigs(env);
    expect(configs).toHaveLength(0);
  });

  it('filters out Sepolia when Sepolia has no tokens', () => {
    const env = {
      CLOCKTOWER_ADDRESS_BASE: '0xc1',
      USDC_ADDRESS_BASE: '0xu1',
      CHAIN_ID_BASE: '8453',
      CLOCKTOWER_ADDRESS_SEPOLIA_BASE: '0xc2'
      // no USDC_ADDRESS_SEPOLIA_BASE or TOKENS_SEPOLIA_BASE
    };
    const configs = getChainConfigs(env);
    expect(configs).toHaveLength(1);
    expect(configs[0].chainName).toBe('base');
  });

  it('uses default chainId and alchemyUrl for Base when not set', () => {
    const env = {
      CLOCKTOWER_ADDRESS_BASE: '0xclock',
      USDC_ADDRESS_BASE: '0xusdc'
    };
    const configs = getChainConfigs(env);
    expect(configs[0].chainId).toBe(8453);
    expect(configs[0].alchemyUrl).toContain('base-mainnet');
  });
});

describe('scheduled handler', () => {
  it('returns without throwing when no chains are configured', async () => {
    const worker = (await import('./remit_script.js')).default;
    const event = { cron: '0 0 * * *', scheduledTime: Date.now() };
    const env = {};
    const ctx = { waitUntil: () => {} };
    await expect(worker.scheduled(event, env, ctx)).resolves.toBeUndefined();
  });
});
