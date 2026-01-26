const { ethers } = require('ethers');
const { provider } = require('../config/blockchain');

class ENSService {
  /**
   * Resolve ENS name to address
   * @param {string} ensName - ENS name (e.g., "username.justan.id")
   * @returns {string|null} - Resolved address or null
   */
  static async resolveENS(ensName) {
    try {
      const address = await provider.resolveName(ensName);
      return address;
    } catch (error) {
      console.error('ENS resolution error:', error);
      return null;
    }
  }

  /**
   * Reverse resolve address to ENS name
   * @param {string} address - Ethereum address
   * @returns {string|null} - ENS name or null
   */
  static async reverseResolve(address) {
    try {
      const name = await provider.lookupAddress(address);
      return name;
    } catch (error) {
      console.error('Reverse ENS resolution error:', error);
      return null;
    }
  }

  /**
   * Check if an ENS name is available
   * @param {string} ensName - ENS name to check
   * @returns {boolean} - true if available
   */
  static async isAvailable(ensName) {
    const address = await this.resolveENS(ensName);
    return address === null;
  }
}

module.exports = ENSService;
