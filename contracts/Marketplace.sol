// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IEscrow {
    function createEscrow(
        address payable seller,
        address buyer,
        uint16 feeBpsSnapshot
    ) external payable returns (uint256 escrowId);
}

interface IBatchNFT {
    function ownerOf(uint256 tokenId) external view returns (address);
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
}

interface IUserProfile {
    enum Role { None, Buyer, Farmer, Logistics }
    function getRole(address user) external view returns (Role);
}

contract Marketplace {
    // ============ Errors ============
    error NotOwner();
    error NotSeller();
    error NotBuyer();
    error InvalidParams();
    error InactiveListing();
    error NotFarmer();
    error InvalidQuantity();

    // ============ Types ============
    struct Listing {
        address payable seller;
        uint256 price;   // harga per unit (wei)
        bool active;
        uint256 tokenId; // link ke NFT batch
        string uri;      // optional metadata/description
        uint256 stock;   // stok unit kopi yang tersedia
    }

    // ============ Storage ============
    address public owner;
    IEscrow public escrow;
    IBatchNFT public batchNFT;
    IUserProfile public userProfile;
    uint16 public feeBps; 

    uint256 public nextListingId = 1;
    mapping(uint256 => Listing) private _listings;

    // ============ Events ============
    event OwnerUpdated(address indexed newOwner);
    event EscrowUpdated(address indexed escrow);
    event FeeBpsUpdated(uint16 feeBps);
    event BatchNFTUpdated(address indexed nftContract);
    event UserProfileUpdated(address indexed profileContract);

    event ListingCreated(
        uint256 indexed listingId,
        address indexed seller,
        uint256 price,
        uint256 tokenId,
        string uri,
        uint256 stock
    );
    event ListingUpdated(uint256 indexed listingId, uint256 price, string uri, uint256 stock);
    event ListingCancelled(uint256 indexed listingId);
    event Purchased(
        uint256 indexed listingId,
        uint256 indexed escrowId,
        address indexed buyer,
        uint256 amount,
        uint256 tokenId,
        uint256 quantity
    );

    // ============ Modifiers ============
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ============ Constructor ============
    constructor(
        address _escrow,
        address _batchNFT,
        address _userProfile,
        uint16 _feeBps
    ) {
        owner = msg.sender;
        _setEscrow(_escrow);
        _setBatchNFT(_batchNFT);
        _setUserProfile(_userProfile);
        _setFeeBps(_feeBps);
    }

    // ============ Owner/Admin ============
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidParams();
        owner = newOwner;
        emit OwnerUpdated(newOwner);
    }

    function setEscrow(address _escrow) external onlyOwner {
        _setEscrow(_escrow);
    }

    function setBatchNFT(address _nft) external onlyOwner {
        _setBatchNFT(_nft);
    }

    function setUserProfile(address _profile) external onlyOwner {
        _setUserProfile(_profile);
    }

    function setFeeBps(uint16 _feeBps) external onlyOwner {
        _setFeeBps(_feeBps);
    }

    function _setEscrow(address _escrow) internal {
        if (_escrow == address(0)) revert InvalidParams();
        escrow = IEscrow(_escrow);
        emit EscrowUpdated(_escrow);
    }

    function _setBatchNFT(address _nft) internal {
        if (_nft == address(0)) revert InvalidParams();
        batchNFT = IBatchNFT(_nft);
        emit BatchNFTUpdated(_nft);
    }

    function _setUserProfile(address _profile) internal {
        if (_profile == address(0)) revert InvalidParams();
        userProfile = IUserProfile(_profile);
        emit UserProfileUpdated(_profile);
    }

    function _setFeeBps(uint16 _feeBps) internal {
        if (_feeBps > 10_000) revert InvalidParams();
        feeBps = _feeBps;
        emit FeeBpsUpdated(_feeBps);
    }

    // ============ Views ============
    function getListing(uint256 listingId) external view returns (
        address seller,
        uint256 price,
        bool active,
        uint256 tokenId,
        string memory uri,
        uint256 stock
    ) {
        Listing storage l = _listings[listingId];
        return (l.seller, l.price, l.active, l.tokenId, l.uri, l.stock);
    }

    // ============ Seller Actions ============
    function createListing(
        uint256 price,
        uint256 tokenId,
        uint256 stock,
        string calldata uri
    ) external returns (uint256 listingId) {
        if (price == 0 || stock == 0) revert InvalidParams();
        if (userProfile.getRole(msg.sender) != IUserProfile.Role.Farmer) revert NotFarmer();
        if (batchNFT.ownerOf(tokenId) != msg.sender) revert NotSeller();

        listingId = nextListingId++;
        _listings[listingId] = Listing({
            seller: payable(msg.sender),
            price: price,
            tokenId: tokenId,
            active: true,
            uri: uri,
            stock: stock
        });
        emit ListingCreated(listingId, msg.sender, price, tokenId, uri, stock);
    }

    function updateListing(
        uint256 listingId,
        uint256 newPrice,
        uint256 newStock,
        string calldata newUri
    ) external {
        Listing storage l = _listings[listingId];
        if (l.seller != msg.sender) revert NotSeller();
        if (!l.active) revert InactiveListing();
        if (newPrice == 0 || newStock == 0) revert InvalidParams();
        l.price = newPrice;
        l.uri = newUri;
        l.stock = newStock;
        emit ListingUpdated(listingId, newPrice, newUri, newStock);
    }

    function cancelListing(uint256 listingId) external {
        Listing storage l = _listings[listingId];
        if (l.seller != msg.sender) revert NotSeller();
        if (!l.active) revert InactiveListing();
        l.active = false;
        emit ListingCancelled(listingId);
    }

    // ============ Buyer Action ============
    /// @notice Buyer membeli sejumlah unit kopi dari listing tertentu.
    /// @dev NFT batch tidak dipindahkan; yang dibeli adalah kopi fisik yang mereferensi batch tersebut.
    function purchase(uint256 listingId, uint256 quantity) external payable returns (uint256 escrowId) {
        Listing storage l = _listings[listingId];
        if (!l.active) revert InactiveListing();
        if (quantity == 0) revert InvalidQuantity();
        if (quantity > l.stock) revert InvalidQuantity();

        uint256 totalPrice = l.price * quantity;
        if (msg.value != totalPrice) revert InvalidParams();

        if (userProfile.getRole(msg.sender) != IUserProfile.Role.Buyer) revert NotBuyer();

        // Lock ETH in Escrow (dana pembayaran kopi)
        escrowId = escrow.createEscrow{value: totalPrice}(l.seller, msg.sender, feeBps);

        // Kurangi stok; jika habis, listing menjadi tidak aktif
        l.stock -= quantity;
        if (l.stock == 0) {
            l.active = false;
        }

        emit Purchased(listingId, escrowId, msg.sender, totalPrice, l.tokenId, quantity);
    }
}
