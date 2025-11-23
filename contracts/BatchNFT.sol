// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract BatchNFT is ERC721 {
    uint256 public nextTokenId;

    enum Status { Harvesting, Roasting, Packaged, Shipped, Delivered }
    mapping(uint256 => string) public batchMetadata;
    mapping(uint256 => Status) public batchStatus;

    event BatchMinted(uint256 tokenId, address owner, string ipfsHash);
    event StatusUpdated(uint256 tokenId, Status status);

    constructor() ERC721("Brewify Batch", "BBATCH") {}

    function mintBatch(address to, string memory ipfsHash) public {
        uint256 tokenId = nextTokenId;
        _mint(to, tokenId);
        batchMetadata[tokenId] = ipfsHash;
        batchStatus[tokenId] = Status.Harvesting; // default
        emit BatchMinted(tokenId, to, ipfsHash);
        nextTokenId++;
    }

    function updateBatchStatus(uint256 tokenId, Status newStatus) public {
        require(ownerOf(tokenId) == msg.sender, "Only owner can update status");
        batchStatus[tokenId] = newStatus;
        emit StatusUpdated(tokenId, newStatus);
    }
}
