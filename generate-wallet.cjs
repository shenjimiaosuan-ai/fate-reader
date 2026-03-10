const { ethers } = require('ethers');
const TronWeb = require('tronweb');

// Generate ETH wallet (for ERC20 USDT)
const ethWallet = ethers.Wallet.createRandom();
console.log('=== Ethereum Wallet (ERC20 USDT) ===');
console.log('Address:', ethWallet.address);
console.log('Private Key:', ethWallet.privateKey);
console.log('');

// Generate TRON wallet (for TRC20 USDT)
const tronWallet = TronWeb.utils.accounts.generateAccount();
console.log('=== TRON Wallet (TRC20 USDT) ===');
console.log('Address:', tronWallet.address);
console.log('Private Key:', tronWallet.privateKey);
console.log('');

// Save to file
const fs = require('fs');
const walletData = {
  eth: {
    address: ethWallet.address,
    privateKey: ethWallet.privateKey,
    network: 'ERC20',
    symbol: 'USDT'
  },
  trx: {
    address: tronWallet.address,
    privateKey: tronWallet.privateKey,
    network: 'TRC20',
    symbol: 'USDT'
  },
  created: new Date().toISOString()
};

fs.writeFileSync('D:\\小秘自用工具库\\神机妙算\\wallet.json', JSON.stringify(walletData, null, 2));
console.log('Wallet saved to wallet.json');
