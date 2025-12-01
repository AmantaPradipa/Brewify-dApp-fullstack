// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title UserProfile
/// @notice Menyimpan profil user (username) dan satu role aktif per wallet.
///         Satu wallet hanya memiliki satu role pada satu waktu untuk menghindari kebingungan.
contract UserProfile {
    enum Role {
        None,
        Buyer,
        Farmer,
        Logistics
    }

    struct Profile {
        Role role;        // single active role untuk wallet ini
        string username;
        bool isRegistered;
    }

    mapping(address => Profile) public profiles;

    event UserRegistered(address indexed user, Role role, string username);
    event ActiveRoleChanged(address indexed user, Role newActiveRole);

    /// @notice Set atau update profil user dan role aktif.
    /// @dev Memanggil fungsi ini lagi akan mengganti role lama dengan role baru (single-role per wallet).
    function setUserProfile(Role _role, string calldata _username) external {
        require(_role != Role.None, "Invalid role");
        require(bytes(_username).length > 0, "Username required");

        Profile storage p = profiles[msg.sender];

        if (!p.isRegistered) {
            p.username = _username;
            p.isRegistered = true;
        }

        // Update username dan role aktif (single-role)
        p.username = _username;
        p.role = _role;

        emit UserRegistered(msg.sender, _role, _username);
        emit ActiveRoleChanged(msg.sender, _role);
    }

    // READ FUNCTIONS

    /// @notice Mengembalikan role aktif (sebagai uint8), username, dan flag terdaftar.
    /// @dev Signature dipertahankan agar kompatibel dengan frontend yang sudah ada.
    function getUser(address user) external view returns (uint8, string memory, bool) {
        Profile storage p = profiles[user];
        return (uint8(p.role), p.username, p.isRegistered);
    }

    /// @notice Role aktif saat ini.
    function getRole(address user) external view returns (Role) {
        return profiles[user].role;
    }

    function getUsername(address user) external view returns (string memory) {
        return profiles[user].username;
    }
}
