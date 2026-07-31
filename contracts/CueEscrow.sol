// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * Minimal ERC-20 surface. On Arc, USDC is exposed as a standard ERC-20 at a
 * fixed address; this escrow custodies it through transferFrom and transfer.
 */
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/**
 * @title CueEscrow
 * @notice Small, unaudited hackathon escrow for Cue on Arc testnet.
 *
 * A depositor locks USDC for a recipient who has no wallet yet. The recipient is
 * identified only by keccak256 of a claim token, so no address is needed at lock
 * time. Before the unlock time only the depositor can reclaim; at or after it,
 * anyone who can present the token preimage can withdraw to an address supplied
 * at that moment.
 *
 * On chain this is a bearer instrument: the token preimage authorises a
 * withdrawal to any chosen address. In Cue, its backend is the only party that
 * ever submits a withdrawal and still applies its own email check first, so the
 * practical path to funds passes that check. A fully trustless version would
 * require the recipient to hold a key, which is exactly what this product avoids.
 *
 * No owner, no admin, no upgrade, no pause. Deliberately tiny.
 */
contract CueEscrow {
    IERC20 public immutable usdc;

    struct Deposit {
        address depositor;
        bytes32 recipientHash;
        uint256 amount;
        uint64 unlockTime;
        bool settled;
    }

    mapping(uint256 => Deposit) public deposits;
    uint256 public nextId;

    event Locked(
        uint256 indexed id,
        address indexed depositor,
        bytes32 recipientHash,
        uint256 amount,
        uint64 unlockTime
    );
    event Reclaimed(uint256 indexed id, address indexed depositor, uint256 amount);
    event Withdrawn(uint256 indexed id, address indexed to, uint256 amount);

    constructor(address usdcAddress) {
        require(usdcAddress != address(0), "usdc");
        usdc = IERC20(usdcAddress);
    }

    /**
     * Locks `amount` of USDC (6 decimals) for a recipient known only by
     * `recipientHash`, withdrawable at or after `unlockTime`. The caller must
     * have approved this contract for at least `amount` first.
     */
    function lock(bytes32 recipientHash, uint256 amount, uint64 unlockTime)
        external
        returns (uint256 id)
    {
        require(amount > 0, "amount");
        require(recipientHash != bytes32(0), "recipient");
        require(unlockTime > block.timestamp, "unlock");

        id = nextId++;
        deposits[id] = Deposit({
            depositor: msg.sender,
            recipientHash: recipientHash,
            amount: amount,
            unlockTime: unlockTime,
            settled: false
        });

        require(usdc.transferFrom(msg.sender, address(this), amount), "transferFrom");
        emit Locked(id, msg.sender, recipientHash, amount, unlockTime);
    }

    /**
     * Returns the funds to the depositor. Only the depositor, only before unlock,
     * only once.
     */
    function reclaim(uint256 id) external {
        Deposit storage d = deposits[id];
        require(!d.settled, "settled");
        require(msg.sender == d.depositor, "depositor");
        require(block.timestamp < d.unlockTime, "unlocked");

        d.settled = true;
        require(usdc.transfer(d.depositor, d.amount), "transfer");
        emit Reclaimed(id, d.depositor, d.amount);
    }

    /**
     * Pays the deposit to `to` once unlocked, if `preimage` hashes to the stored
     * recipient hash. Only once.
     */
    function withdraw(uint256 id, bytes calldata preimage, address to) external {
        Deposit storage d = deposits[id];
        require(!d.settled, "settled");
        require(block.timestamp >= d.unlockTime, "locked");
        require(to != address(0), "to");
        require(keccak256(preimage) == d.recipientHash, "preimage");

        d.settled = true;
        require(usdc.transfer(to, d.amount), "transfer");
        emit Withdrawn(id, to, d.amount);
    }
}
