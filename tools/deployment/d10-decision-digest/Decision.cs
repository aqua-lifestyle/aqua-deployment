using System.Text.Json.Serialization;

namespace AqualLifeStyle.Domain.AQGreen;

// The decision DTO mirrors the three types in AQGreenD10Commissioning.cs at the
// pinned source blob. The executor checks that blob before any successor write.
public sealed class AQGreenD10Decision
{
    public string AdmissionMode { get; set; } = "HISTORICAL_B6";
    public string? CleanStartResetId { get; set; }
    public int? CleanStartRootCustomerId { get; set; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? CleanStartRootSelectionPolicy { get; set; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public DateTime? CleanStartResetBoundaryUtc { get; set; }
    [JsonRequired] public string ContractVersion { get; set; } = "AQGreenD10CutoverV1";
    public string? DecisionId { get; set; }
    public string? DecisionReference { get; set; }
    public string? Outcome { get; set; }
    public int TenantId { get; set; }
    public string? TenantSnapshotKey { get; set; }
    public string? PopulationScope { get; set; }
    public Guid[]? AuthorizedAreaIds { get; set; }
    public DateTime V2EffectiveAtUtc { get; set; }
    public DateTime AuthorizedAtUtc { get; set; }
    public bool? AllowProspectiveAdmissions { get; set; }
    public bool? EnableGraduation { get; set; }
    public string? SourceSnapshotDigest { get; set; }
    public string? BaseManifestDigest { get; set; }
    public string? FinalManifestDigest { get; set; }
    public string? AcceptedComponentDigest { get; set; }
    public SortedDictionary<string, string>? PopulationDigests { get; set; }
    public SortedDictionary<string, string[]>? PopulationParticipantKeys { get; set; }
    public string? MembershipDigest { get; set; }
    public string? ReconciledPlacementDigest { get; set; }
    public string? RequiredConfigurationDigest { get; set; }
    public string? RequiredDatabaseIdentityDigest { get; set; }
    public string? RequiredSchemaDigest { get; set; }
    public string? RequiredAssemblyDigest { get; set; }
    public string? RequiredRuntimeAssemblyDigest { get; set; }
    public List<AQGreenD10MemberIdentity>? HistoricalMembers { get; set; }
    public List<AQGreenD10PlacementEvidence>? ReconciledPlacements { get; set; }
}

public sealed class AQGreenD10MemberIdentity
{
    public int CustomerId { get; set; }
    public Guid ParticipantId { get; set; }
    public Guid AreaId { get; set; }
    public string? ComponentDigest { get; set; }
    public string? ParticipantSnapshotKey { get; set; }
}

public sealed class AQGreenD10PlacementEvidence
{
    public Guid PlacementId { get; set; }
    public Guid ParticipantId { get; set; }
    public Guid PlacementTreeScopeId { get; set; }
    public Guid? ParentParticipantId { get; set; }
    public int? Slot { get; set; }
    public string? CanonicalPath { get; set; }
    public DateTime PlacedAtUtc { get; set; }
    public string? RulesVersion { get; set; }
}
