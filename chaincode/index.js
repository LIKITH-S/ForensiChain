'use strict';

const fs = require('fs');
const path = require('path');

const contractPath = path.join(__dirname, 'lib', 'EvidenceContract.js');
let EvidenceContract;

if (fs.existsSync(contractPath)) {
    EvidenceContract = require('./lib/EvidenceContract');
} else {
    // Contract stub prior to Plan 1.2 implementation
    const { Contract } = require('fabric-contract-api');
    EvidenceContract = class EvidenceContract extends Contract {};
}

module.exports.EvidenceContract = EvidenceContract;
module.exports.contracts = [EvidenceContract];
