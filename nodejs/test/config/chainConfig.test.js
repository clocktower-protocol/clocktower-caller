import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChainConfigService } from '../../src/config/chainConfig.js';

describe('ChainConfigService', () => {
  const baseTokensJson = JSON.stringify([{ address: '0x0987654321098765432109876543210987654321', symbol: 'USDC', name: 'USD Coin', decimals: 6 }]);
  const sepoliaTokensJson = JSON.stringify([{ address: '0x2222222222222222222222222222222222222222', symbol: 'USDC', name: 'USD Coin', decimals: 6 }]);

  beforeEach(() => {
    vi.stubEnv('ACTIVE_CHAINS', undefined);
    vi.stubEnv('ALCHEMY_URL_BASE', undefined);
    vi.stubEnv('CLOCKTOWER_ADDRESS_BASE', undefined);
    vi.stubEnv('CHAIN_ID_BASE', undefined);
    vi.stubEnv('TOKENS_BASE', undefined);
    vi.stubEnv('TOKENS_SEPOLIA_BASE', undefined);
  });

  it('should load default chain when ACTIVE_CHAINS is not set', () => {
    delete process.env.ACTIVE_CHAINS;
    vi.stubEnv('ALCHEMY_URL_BASE', 'https://base-mainnet.g.alchemy.com/v2/');
    vi.stubEnv('CLOCKTOWER_ADDRESS_BASE', '0x1234567890123456789012345678901234567890');
    vi.stubEnv('CHAIN_ID_BASE', '8453');
    vi.stubEnv('TOKENS_BASE', baseTokensJson);

    const service = new ChainConfigService();
    const chains = service.getAllActiveChains();
    
    expect(chains.length).toBe(1);
    expect(chains[0].name).toBe('base');
  });

  it('should load multiple chains from ACTIVE_CHAINS', () => {
    vi.stubEnv('ACTIVE_CHAINS', 'base,sepolia-base');
    vi.stubEnv('ALCHEMY_URL_BASE', 'https://base-mainnet.g.alchemy.com/v2/');
    vi.stubEnv('CLOCKTOWER_ADDRESS_BASE', '0x1234567890123456789012345678901234567890');
    vi.stubEnv('CHAIN_ID_BASE', '8453');
    vi.stubEnv('TOKENS_BASE', baseTokensJson);
    vi.stubEnv('ALCHEMY_URL_SEPOLIA_BASE', 'https://base-sepolia.g.alchemy.com/v2/');
    vi.stubEnv('CLOCKTOWER_ADDRESS_SEPOLIA_BASE', '0x1111111111111111111111111111111111111111');
    vi.stubEnv('CHAIN_ID_SEPOLIA_BASE', '84532');
    vi.stubEnv('TOKENS_SEPOLIA_BASE', sepoliaTokensJson);

    const service = new ChainConfigService();
    const chains = service.getAllActiveChains();
    
    expect(chains.length).toBe(2);
    expect(chains[0].name).toBe('base');
    expect(chains[1].name).toBe('sepolia-base');
  });

  it('should filter out invalid chain configurations', () => {
    vi.stubEnv('ACTIVE_CHAINS', 'base,invalid');
    vi.stubEnv('ALCHEMY_URL_BASE', 'https://base-mainnet.g.alchemy.com/v2/');
    vi.stubEnv('CLOCKTOWER_ADDRESS_BASE', '0x1234567890123456789012345678901234567890');
    vi.stubEnv('CHAIN_ID_BASE', '8453');
    vi.stubEnv('TOKENS_BASE', baseTokensJson);
    // invalid chain has no configuration

    const service = new ChainConfigService();
    const chains = service.getAllActiveChains();
    
    expect(chains.length).toBe(1);
    expect(chains[0].name).toBe('base');
  });

  it('should get display name for known chains', () => {
    const service = new ChainConfigService();
    
    // We need to check the internal method, but it's private
    // Instead, we can check via the chain config
    vi.stubEnv('ACTIVE_CHAINS', 'base');
    vi.stubEnv('ALCHEMY_URL_BASE', 'https://base-mainnet.g.alchemy.com/v2/');
    vi.stubEnv('CLOCKTOWER_ADDRESS_BASE', '0x1234567890123456789012345678901234567890');
    vi.stubEnv('CHAIN_ID_BASE', '8453');
    vi.stubEnv('TOKENS_BASE', baseTokensJson);

    const service2 = new ChainConfigService();
    const chains = service2.getAllActiveChains();
    
    expect(chains[0].displayName).toBe('Base');
  });

  it('should identify testnet chains', () => {
    vi.stubEnv('ACTIVE_CHAINS', 'base,sepolia-base');
    vi.stubEnv('ALCHEMY_URL_BASE', 'https://base-mainnet.g.alchemy.com/v2/');
    vi.stubEnv('CLOCKTOWER_ADDRESS_BASE', '0x1234567890123456789012345678901234567890');
    vi.stubEnv('CHAIN_ID_BASE', '8453');
    vi.stubEnv('TOKENS_BASE', baseTokensJson);
    vi.stubEnv('ALCHEMY_URL_SEPOLIA_BASE', 'https://base-sepolia.g.alchemy.com/v2/');
    vi.stubEnv('CLOCKTOWER_ADDRESS_SEPOLIA_BASE', '0x1111111111111111111111111111111111111111');
    vi.stubEnv('CHAIN_ID_SEPOLIA_BASE', '84532');
    vi.stubEnv('TOKENS_SEPOLIA_BASE', sepoliaTokensJson);

    const service = new ChainConfigService();
    const testnets = service.getTestnetChains();
    const mainnets = service.getMainnetChains();
    
    expect(testnets.length).toBe(1);
    expect(testnets[0].name).toBe('sepolia-base');
    expect(mainnets.length).toBe(1);
    expect(mainnets[0].name).toBe('base');
  });

  it('should get chain config by name', () => {
    vi.stubEnv('ACTIVE_CHAINS', 'base');
    vi.stubEnv('ALCHEMY_URL_BASE', 'https://base-mainnet.g.alchemy.com/v2/');
    vi.stubEnv('CLOCKTOWER_ADDRESS_BASE', '0x1234567890123456789012345678901234567890');
    vi.stubEnv('CHAIN_ID_BASE', '8453');
    vi.stubEnv('TOKENS_BASE', baseTokensJson);

    const service = new ChainConfigService();
    const chain = service.getChainConfig('base');
    
    expect(chain).toBeDefined();
    expect(chain.name).toBe('base');
    expect(chain.chainId).toBe(8453);
  });

  it('should return null for non-existent chain', () => {
    vi.stubEnv('ACTIVE_CHAINS', 'base');
    vi.stubEnv('ALCHEMY_URL_BASE', 'https://base-mainnet.g.alchemy.com/v2/');
    vi.stubEnv('CLOCKTOWER_ADDRESS_BASE', '0x1234567890123456789012345678901234567890');
    vi.stubEnv('CHAIN_ID_BASE', '8453');
    vi.stubEnv('TOKENS_BASE', baseTokensJson);

    const service = new ChainConfigService();
    const chain = service.getChainConfig('nonexistent');
    
    expect(chain).toBeNull();
  });

  it('should get chain config by chain ID', () => {
    vi.stubEnv('ACTIVE_CHAINS', 'base');
    vi.stubEnv('ALCHEMY_URL_BASE', 'https://base-mainnet.g.alchemy.com/v2/');
    vi.stubEnv('CLOCKTOWER_ADDRESS_BASE', '0x1234567890123456789012345678901234567890');
    vi.stubEnv('CHAIN_ID_BASE', '8453');
    vi.stubEnv('TOKENS_BASE', baseTokensJson);

    const service = new ChainConfigService();
    const chain = service.getChainConfigById(8453);
    
    expect(chain).toBeDefined();
    expect(chain.name).toBe('base');
  });

  it('should check if chain is active', () => {
    vi.stubEnv('ACTIVE_CHAINS', 'base');
    vi.stubEnv('ALCHEMY_URL_BASE', 'https://base-mainnet.g.alchemy.com/v2/');
    vi.stubEnv('CLOCKTOWER_ADDRESS_BASE', '0x1234567890123456789012345678901234567890');
    vi.stubEnv('CHAIN_ID_BASE', '8453');
    vi.stubEnv('TOKENS_BASE', baseTokensJson);

    const service = new ChainConfigService();
    
    expect(service.isChainActive('base')).toBe(true);
    expect(service.isChainActive('nonexistent')).toBe(false);
  });

  it('should get chain count', () => {
    vi.stubEnv('ACTIVE_CHAINS', 'base,sepolia-base');
    vi.stubEnv('ALCHEMY_URL_BASE', 'https://base-mainnet.g.alchemy.com/v2/');
    vi.stubEnv('CLOCKTOWER_ADDRESS_BASE', '0x1234567890123456789012345678901234567890');
    vi.stubEnv('CHAIN_ID_BASE', '8453');
    vi.stubEnv('TOKENS_BASE', baseTokensJson);
    vi.stubEnv('ALCHEMY_URL_SEPOLIA_BASE', 'https://base-sepolia.g.alchemy.com/v2/');
    vi.stubEnv('CLOCKTOWER_ADDRESS_SEPOLIA_BASE', '0x1111111111111111111111111111111111111111');
    vi.stubEnv('CHAIN_ID_SEPOLIA_BASE', '84532');
    vi.stubEnv('TOKENS_SEPOLIA_BASE', sepoliaTokensJson);

    const service = new ChainConfigService();
    
    expect(service.getChainCount()).toBe(2);
  });

  it('should reload chain configurations', () => {
    vi.stubEnv('ACTIVE_CHAINS', 'base');
    vi.stubEnv('ALCHEMY_URL_BASE', 'https://base-mainnet.g.alchemy.com/v2/');
    vi.stubEnv('CLOCKTOWER_ADDRESS_BASE', '0x1234567890123456789012345678901234567890');
    vi.stubEnv('CHAIN_ID_BASE', '8453');
    vi.stubEnv('TOKENS_BASE', baseTokensJson);

    const service = new ChainConfigService();
    expect(service.getChainCount()).toBe(1);

    vi.stubEnv('ACTIVE_CHAINS', 'base,sepolia-base');
    vi.stubEnv('ALCHEMY_URL_SEPOLIA_BASE', 'https://base-sepolia.g.alchemy.com/v2/');
    vi.stubEnv('CLOCKTOWER_ADDRESS_SEPOLIA_BASE', '0x1111111111111111111111111111111111111111');
    vi.stubEnv('CHAIN_ID_SEPOLIA_BASE', '84532');
    vi.stubEnv('TOKENS_SEPOLIA_BASE', sepoliaTokensJson);

    service.reload();
    expect(service.getChainCount()).toBe(2);
  });
});

