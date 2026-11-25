// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title EvidenceChainOfCustody
 * @notice Maintains tamper-evident, verifiable on-chain records of digital evidence registration,
 * two-party custody handovers, access audit logs, and cryptographic integrity verification for judicial audits.
 * Aligned with Indian Bharatiya Sakshya Adhiniyam, 2023 (BSA Section 63) electronic record standards.
 */
contract EvidenceChainOfCustody is AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant COLLECTOR_ROLE = keccak256("COLLECTOR_ROLE");
    bytes32 public constant CUSTODIAN_ROLE = keccak256("CUSTODIAN_ROLE");
    bytes32 public constant EXAMINER_ROLE = keccak256("EXAMINER_ROLE");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");

    enum EvidenceStatus {
        REGISTERED,
        IN_TRANSFER,
        DISPOSED
    }

    struct ForensicMetadata {
        string evidenceId;
        string caseId;
        string sha256Hash;
        uint256 fileSize;
        string mediaType;
        string storageObjectId;
        string collectorId;
        string organizationId;
        string collectedAt;
        string location;
        string acquisitionMethod;
        string toolVersion;
        string parentEvidenceId;
    }

    struct EvidenceRecord {
        ForensicMetadata metadata;
        EvidenceStatus status;
        address currentCustodian;
        uint256 registeredAtBlock;
        uint256 registeredAtTime;
        bool exists;
    }

    struct PendingTransfer {
        address fromCustodian;
        address toCustodian;
        string reason;
        uint256 proposedAtBlock;
        uint256 proposedAtTime;
        bool active;
    }

    struct CustodyTransition {
        string action;
        address fromAddress;
        address toAddress;
        address actor;
        string reason;
        uint256 blockNumber;
        uint256 timestamp;
    }

    struct AccessLogEntry {
        address actor;
        string action;
        string purpose;
        uint256 blockNumber;
        uint256 timestamp;
    }

    struct VerificationRecord {
        address verifier;
        string observedSha256;
        string baselineSha256;
        bool isMatch;
        uint256 blockNumber;
        uint256 timestamp;
    }

    mapping(string => EvidenceRecord) private _evidenceStore;
    string[] private _evidenceIds;
    mapping(string => PendingTransfer) private _pendingTransfers;
    mapping(string => CustodyTransition[]) private _custodyHistory;
    mapping(string => AccessLogEntry[]) private _accessLogs;
    mapping(string => VerificationRecord[]) private _verificationRecords;

    event EvidenceRegistered(
        string indexed evidenceId,
        string indexed caseId,
        string sha256Hash,
        string collectorId,
        address indexed custodian,
        uint256 timestamp
    );

    event TransferProposed(
        string indexed evidenceId,
        address indexed fromCustodian,
        address indexed toCustodian,
        string reason,
        uint256 timestamp
    );

    event TransferAccepted(
        string indexed evidenceId,
        address indexed fromCustodian,
        address indexed toCustodian,
        uint256 timestamp
    );

    event TransferRejected(
        string indexed evidenceId,
        address indexed fromCustodian,
        address indexed rejectedBy,
        string reason,
        uint256 timestamp
    );

    event TransferCancelled(
        string indexed evidenceId,
        address indexed cancelledBy,
        address indexed intendedRecipient,
        uint256 timestamp
    );

    event AccessRecorded(
        string indexed evidenceId,
        address indexed actor,
        string action,
        string purpose,
        uint256 timestamp
    );

    event IntegrityChecked(
        string indexed evidenceId,
        address indexed verifier,
        bool isMatch,
        string observedSha256,
        string baselineSha256,
        uint256 timestamp
    );

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);

        _setRoleAdmin(COLLECTOR_ROLE, ADMIN_ROLE);
        _setRoleAdmin(CUSTODIAN_ROLE, ADMIN_ROLE);
        _setRoleAdmin(EXAMINER_ROLE, ADMIN_ROLE);
        _setRoleAdmin(AUDITOR_ROLE, ADMIN_ROLE);
    }

    /**
     * @notice Register newly collected digital evidence with 13 forensic metadata attributes.
     * @param metadata ForensicMetadata struct containing collection and acquisition data.
     */
    function registerEvidence(ForensicMetadata calldata metadata) external returns (bool) {
        require(
            hasRole(COLLECTOR_ROLE, msg.sender) || hasRole(ADMIN_ROLE, msg.sender),
            "AccessControl: caller lacks COLLECTOR_ROLE or ADMIN_ROLE"
        );

        require(bytes(metadata.evidenceId).length > 0, "Evidence ID cannot be empty");
        require(bytes(metadata.caseId).length > 0, "Case ID cannot be empty");
        require(bytes(metadata.sha256Hash).length == 64, "Invalid SHA-256 hash length");
        require(metadata.fileSize > 0, "File size must be positive");
        require(!_evidenceStore[metadata.evidenceId].exists, "Evidence already registered");

        _evidenceStore[metadata.evidenceId] = EvidenceRecord({
            metadata: metadata,
            status: EvidenceStatus.REGISTERED,
            currentCustodian: msg.sender,
            registeredAtBlock: block.number,
            registeredAtTime: block.timestamp,
            exists: true
        });

        _evidenceIds.push(metadata.evidenceId);

        _appendCustodyTransition(
            metadata.evidenceId,
            "REGISTERED",
            address(0),
            msg.sender,
            msg.sender,
            "Initial evidence registration"
        );

        emit EvidenceRegistered(
            metadata.evidenceId,
            metadata.caseId,
            metadata.sha256Hash,
            metadata.collectorId,
            msg.sender,
            block.timestamp
        );

        return true;
    }

    /**
     * @notice Propose a two-party custody handover to an eligible custody role holder.
     * @param evidenceId Unique evidence identifier.
     * @param toAddress Designated recipient address.
     * @param reason Forensic/operational reason for the custody handover.
     */
    function proposeTransfer(
        string calldata evidenceId,
        address toAddress,
        string calldata reason
    ) external returns (bool) {
        require(_evidenceStore[evidenceId].exists, "Evidence does not exist");
        EvidenceRecord storage record = _evidenceStore[evidenceId];

        require(msg.sender == record.currentCustodian, "Only current custodian can propose transfer");
        require(
            record.status == EvidenceStatus.REGISTERED && !_pendingTransfers[evidenceId].active,
            "Evidence is not available for transfer"
        );
        require(toAddress != address(0), "Recipient address cannot be zero");
        require(toAddress != record.currentCustodian, "Cannot transfer custody to current custodian");
        require(_hasEligibleCustodyRole(toAddress), "Recipient lacks eligible custody role");
        require(bytes(reason).length > 0, "Transfer reason cannot be empty");

        record.status = EvidenceStatus.IN_TRANSFER;
        _pendingTransfers[evidenceId] = PendingTransfer({
            fromCustodian: msg.sender,
            toCustodian: toAddress,
            reason: reason,
            proposedAtBlock: block.number,
            proposedAtTime: block.timestamp,
            active: true
        });

        _appendCustodyTransition(
            evidenceId,
            "TRANSFER_PROPOSED",
            msg.sender,
            toAddress,
            msg.sender,
            reason
        );

        emit TransferProposed(evidenceId, msg.sender, toAddress, reason, block.timestamp);
        return true;
    }

    /**
     * @notice Accept a pending custody handover as the designated recipient.
     * @param evidenceId Unique evidence identifier.
     */
    function acceptTransfer(string calldata evidenceId) external returns (bool) {
        require(_evidenceStore[evidenceId].exists, "Evidence does not exist");
        EvidenceRecord storage record = _evidenceStore[evidenceId];
        PendingTransfer storage pending = _pendingTransfers[evidenceId];

        require(
            record.status == EvidenceStatus.IN_TRANSFER && pending.active,
            "No pending transfer for evidence"
        );
        require(msg.sender == pending.toCustodian, "Only designated recipient can accept transfer");
        require(_hasEligibleCustodyRole(msg.sender), "Recipient lacks eligible custody role");

        address previousCustodian = pending.fromCustodian;
        string memory reason = pending.reason;

        record.currentCustodian = msg.sender;
        record.status = EvidenceStatus.REGISTERED;
        delete _pendingTransfers[evidenceId];

        _appendCustodyTransition(
            evidenceId,
            "TRANSFER_ACCEPTED",
            previousCustodian,
            msg.sender,
            msg.sender,
            reason
        );

        emit TransferAccepted(evidenceId, previousCustodian, msg.sender, block.timestamp);
        return true;
    }

    /**
     * @notice Reject a pending custody handover as the designated recipient.
     * @param evidenceId Unique evidence identifier.
     * @param reason Reason for rejecting custody handover.
     */
    function rejectTransfer(
        string calldata evidenceId,
        string calldata reason
    ) external returns (bool) {
        require(_evidenceStore[evidenceId].exists, "Evidence does not exist");
        EvidenceRecord storage record = _evidenceStore[evidenceId];
        PendingTransfer storage pending = _pendingTransfers[evidenceId];

        require(
            record.status == EvidenceStatus.IN_TRANSFER && pending.active,
            "No pending transfer for evidence"
        );
        require(msg.sender == pending.toCustodian, "Only designated recipient can reject transfer");
        require(bytes(reason).length > 0, "Rejection reason cannot be empty");

        address fromCustodian = pending.fromCustodian;

        record.status = EvidenceStatus.REGISTERED;
        delete _pendingTransfers[evidenceId];

        _appendCustodyTransition(
            evidenceId,
            "TRANSFER_REJECTED",
            fromCustodian,
            msg.sender,
            msg.sender,
            reason
        );

        emit TransferRejected(evidenceId, fromCustodian, msg.sender, reason, block.timestamp);
        return true;
    }

    /**
     * @notice Cancel a pending custody handover before recipient acceptance.
     * @param evidenceId Unique evidence identifier.
     */
    function cancelTransfer(string calldata evidenceId) external returns (bool) {
        require(_evidenceStore[evidenceId].exists, "Evidence does not exist");
        EvidenceRecord storage record = _evidenceStore[evidenceId];
        PendingTransfer storage pending = _pendingTransfers[evidenceId];

        require(
            record.status == EvidenceStatus.IN_TRANSFER && pending.active,
            "No pending transfer for evidence"
        );
        require(msg.sender == record.currentCustodian, "Only current custodian can cancel transfer");

        address intendedRecipient = pending.toCustodian;

        record.status = EvidenceStatus.REGISTERED;
        delete _pendingTransfers[evidenceId];

        _appendCustodyTransition(
            evidenceId,
            "TRANSFER_CANCELLED",
            msg.sender,
            intendedRecipient,
            msg.sender,
            "Transfer cancelled by custodian"
        );

        emit TransferCancelled(evidenceId, msg.sender, intendedRecipient, block.timestamp);
        return true;
    }

    /**
     * @notice Record an authorized access, examination, preview, or download action on evidence.
     * @param evidenceId Unique evidence identifier.
     * @param action Operational action performed (e.g. "PREVIEW", "DOWNLOAD", "EXAMINATION").
     * @param purpose Reason or case authorization context for the access.
     */
    function recordAccess(
        string calldata evidenceId,
        string calldata action,
        string calldata purpose
    ) external returns (bool) {
        require(_evidenceStore[evidenceId].exists, "Evidence does not exist");
        require(bytes(action).length > 0, "Action cannot be empty");
        require(bytes(purpose).length > 0, "Purpose cannot be empty");

        _accessLogs[evidenceId].push(
            AccessLogEntry({
                actor: msg.sender,
                action: action,
                purpose: purpose,
                blockNumber: block.number,
                timestamp: block.timestamp
            })
        );

        emit AccessRecorded(evidenceId, msg.sender, action, purpose, block.timestamp);
        return true;
    }

    /**
     * @notice Retrieve ordered chronological access logs for an evidence item.
     */
    function getAccessLogs(string calldata evidenceId) external view returns (AccessLogEntry[] memory) {
        require(_evidenceStore[evidenceId].exists, "Evidence does not exist");
        return _accessLogs[evidenceId];
    }

    /**
     * @notice Verify the cryptographic integrity of evidence by comparing observed SHA-256 against baseline.
     * Emits IntegrityChecked event with isMatch (PASS vs MISMATCH) and records the audit record.
     * @param evidenceId Unique evidence identifier.
     * @param observedSha256 64-character SHA-256 hex digest computed from retrieved evidence bytes.
     */
    function verifyIntegrity(
        string calldata evidenceId,
        string calldata observedSha256
    ) external returns (bool) {
        require(_evidenceStore[evidenceId].exists, "Evidence does not exist");
        require(bytes(observedSha256).length == 64, "Invalid observed SHA-256 length");

        string memory baseline = _evidenceStore[evidenceId].metadata.sha256Hash;
        bool isMatch = keccak256(bytes(observedSha256)) == keccak256(bytes(baseline));

        _verificationRecords[evidenceId].push(
            VerificationRecord({
                verifier: msg.sender,
                observedSha256: observedSha256,
                baselineSha256: baseline,
                isMatch: isMatch,
                blockNumber: block.number,
                timestamp: block.timestamp
            })
        );

        emit IntegrityChecked(evidenceId, msg.sender, isMatch, observedSha256, baseline, block.timestamp);
        return isMatch;
    }

    /**
     * @notice Retrieve ordered verification history (PASS and MISMATCH checks) for an evidence item.
     */
    function getVerificationHistory(string calldata evidenceId) external view returns (VerificationRecord[] memory) {
        require(_evidenceStore[evidenceId].exists, "Evidence does not exist");
        return _verificationRecords[evidenceId];
    }

    /**
     * @notice Retrieve the active pending transfer state for an evidence item.
     */
    function getPendingTransfer(string calldata evidenceId) external view returns (PendingTransfer memory) {
        require(_evidenceStore[evidenceId].exists, "Evidence does not exist");
        return _pendingTransfers[evidenceId];
    }

    /**
     * @notice Retrieve the ordered chronological custody history for an evidence item.
     */
    function getCustodyHistory(string calldata evidenceId) external view returns (CustodyTransition[] memory) {
        require(_evidenceStore[evidenceId].exists, "Evidence does not exist");
        return _custodyHistory[evidenceId];
    }

    /**
     * @notice Retrieve an evidence record by unique ID.
     */
    function getEvidence(string calldata evidenceId) external view returns (EvidenceRecord memory) {
        require(_evidenceStore[evidenceId].exists, "Evidence does not exist");
        return _evidenceStore[evidenceId];
    }

    /**
     * @notice Check whether an evidence record exists on the ledger.
     */
    function evidenceExists(string calldata evidenceId) external view returns (bool) {
        return _evidenceStore[evidenceId].exists;
    }

    /**
     * @notice Retrieve all registered evidence IDs.
     */
    function getAllEvidenceIds() external view returns (string[] memory) {
        return _evidenceIds;
    }

    /**
     * @notice Retrieve the total count of registered evidence items.
     */
    function getEvidenceCount() external view returns (uint256) {
        return _evidenceIds.length;
    }

    function _hasEligibleCustodyRole(address account) internal view returns (bool) {
        return
            hasRole(CUSTODIAN_ROLE, account) ||
            hasRole(EXAMINER_ROLE, account) ||
            hasRole(COLLECTOR_ROLE, account);
    }

    function _appendCustodyTransition(
        string memory evidenceId,
        string memory action,
        address fromAddress,
        address toAddress,
        address actor,
        string memory reason
    ) internal {
        _custodyHistory[evidenceId].push(
            CustodyTransition({
                action: action,
                fromAddress: fromAddress,
                toAddress: toAddress,
                actor: actor,
                reason: reason,
                blockNumber: block.number,
                timestamp: block.timestamp
            })
        );
    }
}
