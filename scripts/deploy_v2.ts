// scripts/deploy_v2.ts — Multi-Chain Deployment for ArbBot.sol
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
require('dotenv').config();

const CHAIN = process.env.CHAIN || 'base';

const CONFIGS: any = {
    base: {
        name: 'Base',
        chainId: 8453,
        rpc: process.env.BASE_HTTP_URL || 'https://mainnet.base.org',
        pool: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
        usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
    },
    arbitrum: {
        name: 'Arbitrum',
        chainId: 42161,
        rpc: process.env.ARB_HTTP_URL || 'https://arb1.arbitrum.io/rpc',
        pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
        usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
    }
};

const ACTIVE = CONFIGS[CHAIN] || CONFIGS.base;
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';

async function main() {
    console.log(`\n🚀 Deploying ArbBot to ${ACTIVE.name}...`);
    
    // 1. Compile
    const solcModule = require('solc');
    const contractPath = path.resolve(__dirname, '..', 'contracts', 'ArbBot.sol');
    const source = fs.readFileSync(contractPath, 'utf8');

    const input = {
        language: 'Solidity',
        sources: { 'ArbBot.sol': { content: source } },
        settings: {
            optimizer: { enabled: true, runs: 200 },
            viaIR: true,
            outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
        },
    };

    function findImports(importPath: string) {
        if (importPath.startsWith('@openzeppelin/')) {
            const absolutePath = path.resolve(__dirname, '..', 'node_modules', importPath);
            return { contents: fs.readFileSync(absolutePath, 'utf8') };
        }
        return { error: 'File not found' };
    }

    const output = JSON.parse(solcModule.compile(JSON.stringify(input), { import: findImports }));
    const compiled = output.contracts['ArbBot.sol']['ArbBot'];
    const { abi, evm: { bytecode: { object: bytecode } } } = compiled;

    // 2. Deploy
    const provider = new ethers.JsonRpcProvider(ACTIVE.rpc, ACTIVE.chainId, { staticNetwork: true });
    const signer = new ethers.Wallet(PRIVATE_KEY, provider);
    
    console.log(`📍 Deployer: ${signer.address}`);
    const factory = new ethers.ContractFactory(abi, bytecode, signer);
    
    // Pass pool and usdc to the new constructor
    const contract = await factory.deploy(ACTIVE.pool, ACTIVE.usdc);
    await contract.waitForDeployment();
    
    const address = await contract.getAddress();
    console.log(`✅ Deployed at: ${address}`);

    // 3. Log results for .env (Manual update recommended for multi-chain)
    console.log(`\nAdd this to your .env or Bots Manager config:`);
    console.log(`${ACTIVE.name.toUpperCase()}_CONTRACT_ADDRESS=${address}`);
}

main().catch(e => console.error(`❌ Failed: ${e.message}`));
