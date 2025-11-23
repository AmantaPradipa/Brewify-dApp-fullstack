// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract BatchNFT is ERC721URIStorage, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    enum Status {
        Unknown,
        Harvested,
        Processed,
        Packed,
        Shipped,
        Delivered
    }

    mapping(uint256 => Status) public tokenStatus;
    uint256 private _nextId = 1;

    event BatchMinted(address indexed to, uint256 indexed tokenId, string uri);
    event StatusUpdated(uint256 indexed tokenId, Status newStatus);

    constructor() ERC721("Brewify Coffee Batch", "BREW") {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(MINTER_ROLE, msg.sender);
    }

    function mintBatch(
        address to,
        string memory uri
    ) external onlyRole(MINTER_ROLE) {
        uint256 tokenId = _nextId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
        tokenStatus[tokenId] = Status.Harvested;
        emit BatchMinted(to, tokenId, uri);
    }

    function updateStatus(
        uint256 tokenId,
        Status newStatus
    ) external onlyRole(MINTER_ROLE) {
        require(_exists(tokenId), "Token does not exist");
        tokenStatus[tokenId] = newStatus;
        emit StatusUpdated(tokenId, newStatus);
    }

    function getStatus(uint256 tokenId) external view returns (Status) {
        return tokenStatus[tokenId];
    }

    // 1) supportsInterface
    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721URIStorage, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    // 2) _burn
    function _burn(uint256 tokenId) internal override(ERC721URIStorage) {
        super._burn(tokenId);
    }

    // 3) tokenURI
    function tokenURI(
        uint256 tokenId
    ) public view override(ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }
}
