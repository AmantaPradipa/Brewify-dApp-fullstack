// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IEscrowForShipping {
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
        );
}

/// @title LogisticsPayment
/// @notice Menyimpan dan menyalurkan fee pengiriman (shipping) dari farmer ke logistics,
///         sekaligus menyimpan status tracking pengiriman per-order (per escrowId).
///         Fee dihitung 5% dari harga produk (amount di Escrow).
contract LogisticsPayment {
    enum ShippingStatus {
        None,
        AwaitingPickup, // shipping telah dibayar, menunggu di-pickup logistics
        OnTheWay,       // sedang dikirim oleh logistics
        Arrived         // sudah tiba di buyer (menurut logistics)
    }

    struct ShippingInfo {
        address farmer;
        address logistics;
        uint256 amount; // shipping fee yang dibayarkan
        bool paid;
        bool claimed;
        ShippingStatus status;
    }

    IEscrowForShipping public immutable escrow;

    uint16 public constant SHIPPING_FEE_BPS = 500; // 5% dari harga produk (500 / 10000)

    mapping(uint256 => ShippingInfo) public shippingByEscrow;

    event ShippingPaid(
        uint256 indexed escrowId,
        address indexed farmer,
        address indexed logistics,
        uint256 amount
    );
    event ShippingClaimed(
        uint256 indexed escrowId,
        address indexed logistics,
        uint256 amount
    );
    event ShippingStatusUpdated(uint256 indexed escrowId, ShippingStatus newStatus);

    constructor(address escrowAddress) {
        require(escrowAddress != address(0), "LP: invalid escrow");
        escrow = IEscrowForShipping(escrowAddress);
    }

    /// @notice Informasi shipping untuk suatu escrow.
    function getShipping(uint256 escrowId) external view returns (ShippingInfo memory) {
        return shippingByEscrow[escrowId];
    }

    /// @notice Farmer membayar fee shipping ke logistics untuk satu escrow order.
    /// @dev msg.value harus = 5% dari amount escrow. Logistics wallet ditentukan di sini.
    function payShipping(uint256 escrowId, address logistics) external payable {
        require(logistics != address(0), "LP: invalid logistics");

        (, address seller, uint256 productAmount, , , , , , ) = escrow.getEscrow(escrowId);
        require(seller != address(0), "LP: escrow not found");
        require(msg.sender == seller, "LP: only farmer");

        ShippingInfo storage s = shippingByEscrow[escrowId];
        require(!s.paid, "LP: already paid");

        uint256 expectedFee = (productAmount * SHIPPING_FEE_BPS) / 10_000;
        require(msg.value == expectedFee, "LP: invalid fee");

        s.farmer = msg.sender;
        s.logistics = logistics;
        s.amount = msg.value;
        s.paid = true;
        s.claimed = false;
        s.status = ShippingStatus.AwaitingPickup;

        emit ShippingPaid(escrowId, msg.sender, logistics, msg.value);
        emit ShippingStatusUpdated(escrowId, ShippingStatus.AwaitingPickup);
    }

    /// @notice Logistics menandai pesanan sedang dikirim (On The Way).
    function markOnTheWay(uint256 escrowId) external {
        ShippingInfo storage s = shippingByEscrow[escrowId];
        require(s.paid, "LP: not paid");
        require(msg.sender == s.logistics, "LP: only logistics");
        require(s.status == ShippingStatus.AwaitingPickup, "LP: invalid status");

        s.status = ShippingStatus.OnTheWay;
        emit ShippingStatusUpdated(escrowId, ShippingStatus.OnTheWay);
    }

    /// @notice Logistics menandai pesanan sudah tiba di buyer (Arrived).
    function markArrived(uint256 escrowId) external {
        ShippingInfo storage s = shippingByEscrow[escrowId];
        require(s.paid, "LP: not paid");
        require(msg.sender == s.logistics, "LP: only logistics");
        require(s.status == ShippingStatus.OnTheWay, "LP: invalid status");

        s.status = ShippingStatus.Arrived;
        emit ShippingStatusUpdated(escrowId, ShippingStatus.Arrived);
    }

    /// @notice Logistics mengkonfirmasi dan menarik fee shipping.
    /// @dev Hanya dapat dipanggil setelah status pengiriman mencapai Arrived.
    function confirmAndWithdraw(uint256 escrowId) external {
        ShippingInfo storage s = shippingByEscrow[escrowId];
        require(s.paid, "LP: not paid");
        require(!s.claimed, "LP: already claimed");
        require(msg.sender == s.logistics, "LP: only logistics");
        require(s.status == ShippingStatus.Arrived, "LP: not arrived");

        s.claimed = true;
        uint256 amount = s.amount;
        s.amount = 0;

        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "LP: transfer failed");

        emit ShippingClaimed(escrowId, msg.sender, amount);
    }

    /// @notice Apakah shipping sudah dibayar, diklaim logistics, dan status selesai (Arrived).
    function isShippingConfirmed(uint256 escrowId) external view returns (bool) {
        ShippingInfo storage s = shippingByEscrow[escrowId];
        return s.paid && s.claimed && s.status == ShippingStatus.Arrived;
    }
}
