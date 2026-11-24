// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title EvidenceChainOfCustody
 * @notice Maintains tamper-evident, verifiable on-chain records of digital evidence registration,
 * forensic metadata, and role-based access control for judicial and investigative audits.
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

    mapping(string => EvidenceRecord) private _evidenceStore;
    string[] private _evidenceIds;

    event EvidenceRegistered(
        string indexed evidenceId,
        string indexed caseId,
        string sha256Hash,
        string collectorId,
        address indexed custodian,
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
}
