const ethers = require('ethers');
const axios = require('axios');
const db = require('../lib/firebase');
const { ERC721Connector } = require('../lib/rpc');
const { sanitize } = require('../lib/utils');
const logger = require('../lib/logger');

module.exports = async job => {
    const data = job.data;

    if (!data.workspaceId || !data.address || data.tokenId === undefined || data.tokenId === null)
        throw new Error('Missing parameter.');

    const workspace = await db.getWorkspaceById(data.workspaceId);
    const contract = await db.getContractByWorkspaceId(workspace.id, data.address);

    let metadata = {}, URI = null, owner = null, totalSupply = null;
    const erc721Connector = new ERC721Connector(workspace.rpcServer, data.address, { metadata: contract.has721Metadata, enumerable: contract.has721Enumerable });

    try {
        totalSupply = await erc721Connector.totalSupply();
    } catch(error) {
        totalSupply = null;
    }

    if (totalSupply)
        await db.storeContractDataWithWorkspaceId(workspace.id, data.address, { totalSupply: totalSupply });

    try {
        URI = await erc721Connector.tokenURI(data.tokenId.toString());
    } catch(_) {
        URI = null;
    }

    if (URI) {
        const axiosableURI = URI.startsWith('ipfs://') ?
            `https://ipfs.io/ipfs/${URI.slice(7, URI.length)}` : URI;

        try {
            metadata = (await axios.get(axiosableURI)).data;
        } catch(error) {
            metadata = {};
        }
    }

    try {
        owner = await erc721Connector.ownerOf(data.tokenId.toString());
    } catch(_) {
         owner = null;
    }

    if (!URI && !Object.keys(metadata).length && !owner)
        return;

    return await db.storeErc721Token(workspace.id, data.address, sanitize({ URI, tokenId: data.tokenId, metadata, owner }));
};
