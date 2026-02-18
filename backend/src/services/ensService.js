const { ethers } = require('ethers');
const { provider } = require('../config/blockchain');

class ENSService {
  /**
   * Resolve ENS name to address
   * @param {string} ensName - ENS name (e.g., "username.lafung.eth")
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
   * Reverse resolve address to ENS name via JustaName API
   * @param {string} address - Ethereum address
   * @returns {string|null} - ENS name or null
   */
  static async reverseResolve(address) {
    try {
      const res = await fetch(
        `https://api.justaname.id/ens/v1/subname/address?address=${address}&chainId=1`
      );
      const json = await res.json();
      const subnames = json?.result?.data?.subnames;
      if (Array.isArray(subnames) && subnames.length > 0) {
        // Find the lafung.eth subname specifically
        const jawSubname = subnames.find(s => s.ens && s.ens.endsWith('.lafung.eth'));
        if (jawSubname) return jawSubname.ens;
        return subnames[0].ens;
      }
      return null;
    } catch (error) {
      console.error('JustaName reverse resolution error:', error);
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
