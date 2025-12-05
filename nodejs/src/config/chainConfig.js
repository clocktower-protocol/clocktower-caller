/**
 * Chain Configuration Service
 * 
 * Manages multi-chain configuration for the Clocktower Caller.
 * Supports dynamic chain addition via environment variables.
 */

export class ChainConfigService {
  constructor() {
    this.chains = this.loadChainConfigs();
  }

  /**
   * Load chain configurations from environment variables
   * @returns {Array} Array of chain configuration objects
   */
  loadChainConfigs() {
    const activeChains = process.env.ACTIVE_CHAINS?.split(',').map(chain => chain.trim()) || ['base'];
    
    return activeChains.map(chainName => {
      const normalizedName = chainName.toUpperCase().replace('-', '_');
      
      return {
        name: chainName,
        alchemyUrl: process.env[`ALCHEMY_URL_${normalizedName}`],
        clocktowerAddress: process.env[`CLOCKTOWER_ADDRESS_${normalizedName}`],
        chainId: parseInt(process.env[`CHAIN_ID_${normalizedName}`], 10),
        usdcAddress: process.env[`USDC_ADDRESS_${normalizedName}`],
        displayName: this.getDisplayName(chainName),
        isTestnet: this.isTestnet(chainName)
      };
    }).filter(chain => this.validateChainConfig(chain));
  }

  /**
   * Get display name for a chain
   * @param {string} chainName - Internal chain name
   * @returns {string} Display name
   */
  getDisplayName(chainName) {
    const names = {
      'base': 'Base',
      'sepolia-base': 'Base Sepolia',
      'ethereum': 'Ethereum',
      'arbitrum': 'Arbitrum',
      'polygon': 'Polygon'
    };
    return names[chainName] || chainName;
  }

  /**
   * Check if a chain is a testnet
   * @param {string} chainName - Internal chain name
   * @returns {boolean} True if testnet
   */
  isTestnet(chainName) {
    return chainName.includes('sepolia') || chainName.includes('testnet') || chainName.includes('goerli');
  }

  /**
   * Validate chain configuration
   * @param {Object} chain - Chain configuration object
   * @returns {boolean} True if valid
   */
  validateChainConfig(chain) {
    const required = ['alchemyUrl', 'clocktowerAddress', 'chainId', 'usdcAddress'];
    const missing = required.filter(field => !chain[field]);
    
    if (missing.length > 0) {
      console.warn(`Chain ${chain.name} is missing required configuration: ${missing.join(', ')}`);
      return false;
    }
    
    if (isNaN(chain.chainId)) {
      console.warn(`Chain ${chain.name} has invalid chain ID: ${chain.chainId}`);
      return false;
    }
    
    return true;
  }

  /**
   * Get all active chain configurations
   * @returns {Array} Array of valid chain configurations
   */
  getAllActiveChains() {
    return this.chains;
  }

  /**
   * Get configuration for a specific chain
   * @param {string} chainName - Chain name
   * @returns {Object|null} Chain configuration or null if not found
   */
  getChainConfig(chainName) {
    return this.chains.find(chain => chain.name === chainName) || null;
  }

  /**
   * Get chain configuration by chain ID
   * @param {number} chainId - Chain ID
   * @returns {Object|null} Chain configuration or null if not found
   */
  getChainConfigById(chainId) {
    return this.chains.find(chain => chain.chainId === chainId) || null;
  }

  /**
   * Check if a chain is active
   * @param {string} chainName - Chain name
   * @returns {boolean} True if chain is active
   */
  isChainActive(chainName) {
    return this.chains.some(chain => chain.name === chainName);
  }

  /**
   * Get all testnet chains
   * @returns {Array} Array of testnet chain configurations
   */
  getTestnetChains() {
    return this.chains.filter(chain => chain.isTestnet);
  }

  /**
   * Get all mainnet chains
   * @returns {Array} Array of mainnet chain configurations
   */
  getMainnetChains() {
    return this.chains.filter(chain => !chain.isTestnet);
  }

  /**
   * Get chain count
   * @returns {number} Number of active chains
   */
  getChainCount() {
    return this.chains.length;
  }

  /**
   * Reload chain configurations (useful for testing or dynamic updates)
   */
  reload() {
    this.chains = this.loadChainConfigs();
  }
}
