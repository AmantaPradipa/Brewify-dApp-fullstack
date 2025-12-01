// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title Escrow Manager for Marketplace Orders
/// @notice Holds buyers' funds until delivery is confirmed, with dispute resolution
/// @dev Minimal dependencies (no OZ). Includes basic Ownable and ReentrancyGuard patterns.
contract Escrow {
    // ============ Errors ============
    error NotOwner();
    error NotApprovedMarketplace();
    error InvalidParams();
    error NotBuyer();
    error NotSeller();
    error AlreadyReleased();
    error NotDisputed();
    error NothingToDo();
    error NotLogistics();

    // ============ Types ============
    enum ShippingStatus {
        None,
        AwaitingShipment,
        OnTheWay,
        Arrived
    }

    struct EscrowOrder {
        address buyer;
        address payable seller;
        uint256 amount; // total amount locked
        uint16 feeBpsSnapshot; // fee bps captured at creation
        // Legacy shipping flag (dipertahankan untuk kompatibilitas lama)
        bool shipped; // seller marked as shipped/fulfilled (informational)
        // Shipping terintegrasi
        address logistics; // alamat logistics yang menangani order ini
        uint16 shippingFeeBps; // fee ongkir dalam bps (mis. 500 = 5%)
        ShippingStatus shippingStatus; // status tracking pengiriman
        bool buyerCancelApproved; // buyer consented to cancel/refund
        bool sellerCancelApproved; // seller consented to cancel/refund
        bool disputed; // dispute raised by either party
        bool released; // funds released (completed or cancelled or resolved)
    }

    // ============ Constants ============
    uint16 public constant MAX_BPS = 10_000; // 100%

    // ============ Storage ============
    address public owner; // arbitrator/operator
    address payable public feeRecipient;
    uint16 public feeBps; // default fee bps applied to seller payout

    // default shipping fee bps; logistics akan di-set saat pertama kali logistics
    // memanggil fungsi update status.
    uint16 public defaultShippingFeeBps;

    // approved marketplaces that may create escrows
    mapping(address => bool) public approvedMarketplace;

    // orders
    uint256 public nextEscrowId = 1;
    mapping(uint256 => EscrowOrder) private _escrows;

    // Reentrancy guard
    uint256 private _status; // 1 = unlocked, 2 = locked

    // ============ Events ============
    event OwnerUpdated(address indexed newOwner);
    event FeeParamsUpdated(address indexed feeRecipient, uint16 feeBps);
    event MarketplaceApprovalUpdated(address indexed marketplace, bool approved);

    event EscrowCreated(
        uint256 indexed escrowId,
        address indexed buyer,
        address indexed seller,
        uint256 amount,
        uint16 feeBpsSnapshot,
        address createdBy
    );
    event MarkedShipped(uint256 indexed escrowId, address indexed by);
    event CancelApproved(uint256 indexed escrowId, address indexed by);
    event Cancelled(uint256 indexed escrowId, address indexed refundedTo, uint256 amount);
    event ConfirmedReceived(
        uint256 indexed escrowId,
        address indexed by,
        uint256 sellerPayout,
        uint256 feePaid
    );
    event DisputeRaised(uint256 indexed escrowId, address indexed by);
    event DisputeResolved(
        uint256 indexed escrowId,
        uint256 buyerPayout,
        uint256 sellerPayout,
        uint256 feePaid
    );
    event DefaultShippingFeeBpsUpdated(uint16 newBps);
    event ShippingStatusUpdated(uint256 indexed escrowId, ShippingStatus newStatus);

    // ============ Modifiers ============
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyApproved() {
        if (!approvedMarketplace[msg.sender]) revert NotApprovedMarketplace();
        _;
    }

    modifier nonReentrant() {
        require(_status != 2, "REENTRANCY");
        _status = 2;
        _;
        _status = 1;
    }

    // ============ Constructor ============
    constructor(address payable _feeRecipient, uint16 _feeBps) {
        owner = msg.sender;
        _status = 1;
        _setFeeParams(_feeRecipient, _feeBps);
    }

    // ============ Owner/Admin ============
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidParams();
        owner = newOwner;
        emit OwnerUpdated(newOwner);
    }

    function setFeeParams(address payable _recipient, uint16 _bps) external onlyOwner {
        _setFeeParams(_recipient, _bps);
    }

    function _setFeeParams(address payable _recipient, uint16 _bps) internal {
        if (_recipient == address(0) || _bps > MAX_BPS) revert InvalidParams();
        feeRecipient = _recipient;
        feeBps = _bps;
        emit FeeParamsUpdated(_recipient, _bps);
    }

    function setApprovedMarketplace(address marketplace, bool approved) external onlyOwner {
        if (marketplace == address(0)) revert InvalidParams();
        approvedMarketplace[marketplace] = approved;
        emit MarketplaceApprovalUpdated(marketplace, approved);
    }

    /// @notice Set default shipping fee bps untuk order baru (opsional).
    function setDefaultShippingFeeBps(uint16 bps) external onlyOwner {
        if (bps > MAX_BPS) revert InvalidParams();
        defaultShippingFeeBps = bps;
        emit DefaultShippingFeeBpsUpdated(bps);
    }

    // ============ View Helpers ============
    function getEscrow(uint256 escrowId)
        external
        view
        returns (
            address buyer,
            address seller,
            uint256 amount,
            uint16 feeBpsSnapshot,
            bool shipped,
            bool buyerCancelApproved,
            bool sellerCancelApproved,
            bool disputed,
            bool released
        )
    {
        EscrowOrder storage e = _escrows[escrowId];
        return (
            e.buyer,
            e.seller,
            e.amount,
            e.feeBpsSnapshot,
            e.shipped,
            e.buyerCancelApproved,
            e.sellerCancelApproved,
            e.disputed,
            e.released
        );
    }

    /// @notice Informasi shipping terintegrasi untuk suatu escrow.
    function getShipping(uint256 escrowId)
        external
        view
        returns (
            address logistics,
            uint16 shippingFeeBps,
            ShippingStatus shippingStatus
        )
    {
        EscrowOrder storage e = _escrows[escrowId];
        return (e.logistics, e.shippingFeeBps, e.shippingStatus);
    }

    // ============ Core Logic ============
    /// @notice Create a new escrow for a buyer/seller pair
    /// @dev Must be called by an approved marketplace, forwarding the locked ETH via msg.value
    /// @param seller The seller who will receive funds on completion
    /// @param buyer The buyer who can confirm receipt
    /// @param feeBpsSnapshot Fee bps snapshot to apply for this escrow
    /// @return escrowId The newly created escrow ID
    function createEscrow(
        address payable seller,
        address buyer,
        uint16 feeBpsSnapshot
    ) external payable onlyApproved returns (uint256 escrowId) {
        if (msg.value == 0 || seller == address(0) || buyer == address(0) || seller == buyer) {
            revert InvalidParams();
        }
        if (feeBpsSnapshot > MAX_BPS) revert InvalidParams();

        escrowId = nextEscrowId++;
        EscrowOrder storage e = _escrows[escrowId];
        e.buyer = buyer;
        e.seller = seller;
        e.amount = msg.value;
        e.feeBpsSnapshot = feeBpsSnapshot;

        // Semua order baru mulai dari AwaitingShipment; logistics dan shippingFeeBps
        // akan diisi ketika logistics pertama kali mengupdate status.
        e.shippingStatus = ShippingStatus.AwaitingShipment;
        emit ShippingStatusUpdated(escrowId, ShippingStatus.AwaitingShipment);

        emit EscrowCreated(escrowId, buyer, seller, msg.value, feeBpsSnapshot, msg.sender);
    }

    /// @notice Seller marks the order as shipped/fulfilled (informational)
    function markShipped(uint256 escrowId) external {
        EscrowOrder storage e = _requireActive(escrowId);
        if (msg.sender != e.seller) revert NotSeller();
        e.shipped = true;
        emit MarkedShipped(escrowId, msg.sender);
    }

    /// @notice Buyer confirms receipt; funds released to seller minus fee
    function confirmReceived(uint256 escrowId) external nonReentrant {
        EscrowOrder storage e = _requireActive(escrowId);
        if (msg.sender != e.buyer) revert NotBuyer();

         // Jika shipping ter-set, idealnya status sudah Arrived sebelum buyer confirm.
         if (e.logistics != address(0) && e.shippingFeeBps > 0) {
             require(
                 e.shippingStatus == ShippingStatus.Arrived,
                 "ESCROW: SHIPPING_NOT_ARRIVED"
             );
         }

        e.released = true;

        uint256 platformFee = (e.amount * e.feeBpsSnapshot) / MAX_BPS;

        uint256 shippingFee = 0;
        if (e.logistics != address(0) && e.shippingFeeBps > 0) {
            shippingFee = (e.amount * e.shippingFeeBps) / MAX_BPS;
        }

        uint256 toSeller = e.amount - platformFee - shippingFee;

        _transferETH(e.seller, toSeller);
        if (platformFee > 0) _transferETH(feeRecipient, platformFee);
        if (shippingFee > 0) _transferETH(payable(e.logistics), shippingFee);

        emit ConfirmedReceived(escrowId, msg.sender, toSeller, platformFee);
    }

    /// @notice Logistics menandai pesanan sedang dikirim (On The Way).
    function logisticsMarkOnTheWay(uint256 escrowId) external {
        EscrowOrder storage e = _requireActive(escrowId);

        // Jika belum ada logistics yang tercatat, set ke caller pertama.
        if (e.logistics == address(0)) {
            e.logistics = msg.sender;
            if (e.shippingFeeBps == 0 && defaultShippingFeeBps > 0) {
                e.shippingFeeBps = defaultShippingFeeBps;
            }
        } else if (msg.sender != e.logistics) {
            revert NotLogistics();
        }

        if (e.shippingStatus != ShippingStatus.AwaitingShipment) {
            revert InvalidParams();
        }

        e.shippingStatus = ShippingStatus.OnTheWay;
        e.shipped = true;
        emit ShippingStatusUpdated(escrowId, ShippingStatus.OnTheWay);
    }

    /// @notice Logistics menandai pesanan sudah tiba di tujuan (Arrived).
    function logisticsMarkArrived(uint256 escrowId) external {
        EscrowOrder storage e = _requireActive(escrowId);

        // Jika belum ada logistics yang tercatat, set ke caller pertama.
        if (e.logistics == address(0)) {
            e.logistics = msg.sender;
            if (e.shippingFeeBps == 0 && defaultShippingFeeBps > 0) {
                e.shippingFeeBps = defaultShippingFeeBps;
            }
        } else if (msg.sender != e.logistics) {
            revert NotLogistics();
        }

        if (e.shippingStatus != ShippingStatus.OnTheWay) {
            revert InvalidParams();
        }

        e.shippingStatus = ShippingStatus.Arrived;
        emit ShippingStatusUpdated(escrowId, ShippingStatus.Arrived);
    }

    /// @notice Either party can approve cancellation; when both approve, refund buyer
    function approveCancel(uint256 escrowId) external nonReentrant {
        EscrowOrder storage e = _requireActive(escrowId);
        bool changed;
        if (msg.sender == e.buyer) {
            if (!e.buyerCancelApproved) {
                e.buyerCancelApproved = true;
                changed = true;
            }
        } else if (msg.sender == e.seller) {
            if (!e.sellerCancelApproved) {
                e.sellerCancelApproved = true;
                changed = true;
            }
        } else {
            revert InvalidParams();
        }

        if (!changed) revert NothingToDo();

        emit CancelApproved(escrowId, msg.sender);

        if (e.buyerCancelApproved && e.sellerCancelApproved) {
            e.released = true;
            uint256 amount = e.amount;
            _transferETH(payable(e.buyer), amount);
            emit Cancelled(escrowId, e.buyer, amount);
        }
    }

    /// @notice Raise a dispute; only buyer or seller may call
    function raiseDispute(uint256 escrowId) external {
        EscrowOrder storage e = _escrows[escrowId];
        if (e.released) revert AlreadyReleased();
        if (msg.sender != e.buyer && msg.sender != e.seller) revert InvalidParams();
        e.disputed = true;
        emit DisputeRaised(escrowId, msg.sender);
    }

    /// @notice Resolve a dispute with split in basis points to buyer; seller receives remainder less fee
    /// @dev Only owner (arbitrator). Fee applies only to seller payout.
    /// @param buyerShareBps Portion of escrow amount to refund to buyer (0-10000)
    function resolveDispute(uint256 escrowId, uint16 buyerShareBps) external nonReentrant onlyOwner {
        EscrowOrder storage e = _escrows[escrowId];
        if (e.released) revert AlreadyReleased();
        if (!e.disputed) revert NotDisputed();
        if (buyerShareBps > MAX_BPS) revert InvalidParams();

        e.released = true;

        uint256 toBuyer = (e.amount * buyerShareBps) / MAX_BPS;
        uint256 sellerGross = e.amount - toBuyer;
        uint256 fee = (sellerGross * e.feeBpsSnapshot) / MAX_BPS;
        uint256 toSeller = sellerGross - fee;

        if (toBuyer > 0) _transferETH(payable(e.buyer), toBuyer);
        if (toSeller > 0) _transferETH(e.seller, toSeller);
        if (fee > 0) _transferETH(feeRecipient, fee);

        emit DisputeResolved(escrowId, toBuyer, toSeller, fee);
    }

    // ============ Internal Helpers ============
    function _requireActive(uint256 escrowId) internal view returns (EscrowOrder storage e) {
        e = _escrows[escrowId];
        if (e.released) revert AlreadyReleased();
    }

    function _transferETH(address payable to, uint256 amount) internal {
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "ETH_TRANSFER_FAIL");
    }

    // ============ Rescue ============
    function rescueETH(address payable to, uint256 amount) external onlyOwner {
        _transferETH(to, amount);
    }
}
