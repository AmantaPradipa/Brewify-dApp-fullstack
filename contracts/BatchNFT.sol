// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

interface IUserProfileRoles {
    enum Role {
        None,
        Buyer,
        Farmer,
        Logistics
    }

    function getRole(address user) external view returns (Role);
}

contract BatchNFT is ERC721URIStorage, AccessControl {
    IUserProfileRoles public userProfile;

    enum Status {
        Unknown,
        Harvested,
        Processed,
        Packed,
        Shipped,
        Delivered
    }

    mapping(uint256 => Status) public tokenStatus;
    mapping(uint256 => address) public creator;

    uint256 private _nextId = 1;

    event BatchMinted(address indexed to, uint256 indexed tokenId, string uri);
    event StatusUpdated(uint256 indexed tokenId, Status previousStatus, Status newStatus);
    event TokenURIUpdated(uint256 indexed tokenId, string newUri);
    event UserProfileUpdated(address indexed userProfile);

    constructor() ERC721("Brewify Coffee Batch", "BREW") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function setUserProfile(address _userProfile) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_userProfile != address(0), "BatchNFT: invalid profile");
        userProfile = IUserProfileRoles(_userProfile);
        emit UserProfileUpdated(_userProfile);
    }

    function mintBatch(address to, string memory uri) external returns (uint256) {
        require(address(userProfile) != address(0), "BatchNFT: userProfile not set");
        IUserProfileRoles.Role role = userProfile.getRole(msg.sender);
        require(role == IUserProfileRoles.Role.Farmer, "BatchNFT: only farmer role");

        uint256 tokenId = _nextId++;

        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);

        tokenStatus[tokenId] = Status.Harvested;
        creator[tokenId]     = msg.sender;

        emit BatchMinted(to, tokenId, uri);
        emit StatusUpdated(tokenId, Status.Unknown, Status.Harvested);

        return tokenId;
    }

    function updateBatchStatus(uint256 tokenId, Status newStatus) external {
        require(_exists(tokenId), "BatchNFT: token does not exist");

        Status current = tokenStatus[tokenId];
        require(uint8(newStatus) > uint8(current), "BatchNFT: invalid status transition");

        require(address(userProfile) != address(0), "BatchNFT: userProfile not set");
        IUserProfileRoles.Role role = userProfile.getRole(msg.sender);

        // Farmer mengelola tahap produksi awal
        if (
            newStatus == Status.Harvested ||
            newStatus == Status.Processed ||
            newStatus == Status.Packed
        ) {
            require(
                role == IUserProfileRoles.Role.Farmer,
                "BatchNFT: only farmer role"
            );
        }
        // Logistics / verifier mengelola pengiriman & delivered
        else {
            require(
                role == IUserProfileRoles.Role.Logistics,
                "BatchNFT: only logistics role"
            );
        }

        tokenStatus[tokenId] = newStatus;
        emit StatusUpdated(tokenId, current, newStatus);
    }

    /// Izinkan pemilik token (atau farmer role aktif) meng-update metadata URI (mis. saat ganti gambar/metadata IPFS)
    function updateTokenURI(uint256 tokenId, string calldata newUri) external {
        require(_exists(tokenId), "BatchNFT: token does not exist");

        bool isOwnerOrApproved = _isApprovedOrOwner(_msgSender(), tokenId);
        bool isFarmer = false;
        if (address(userProfile) != address(0)) {
            isFarmer = userProfile.getRole(_msgSender()) == IUserProfileRoles.Role.Farmer;
        }
        require(isOwnerOrApproved || isFarmer, "BatchNFT: not authorised");

        _setTokenURI(tokenId, newUri);
        emit TokenURIUpdated(tokenId, newUri);
    }

    function getStatus(uint256 tokenId) external view returns (Status) {
        require(_exists(tokenId), "BatchNFT: token does not exist");
        return tokenStatus[tokenId];
    }

    // ==== Overrides ====

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorage, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _burn(uint256 tokenId)
        internal
        override(ERC721URIStorage)
    {
        super._burn(tokenId);
        delete tokenStatus[tokenId];
        delete creator[tokenId];
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }
}
