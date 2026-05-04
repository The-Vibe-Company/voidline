use voidline_bot::{Snapshot, SCHEMA_VERSION};

#[test]
fn snapshot_fixture_roundtrips() {
    let raw = include_str!("fixtures/snapshot-v1.json");
    let snapshot: Snapshot = serde_json::from_str(raw).expect("fixture should deserialize");
    assert_eq!(snapshot.schema_version, SCHEMA_VERSION);
    let encoded = serde_json::to_string(&snapshot).expect("snapshot should serialize");
    let decoded: Snapshot = serde_json::from_str(&encoded).expect("roundtrip should deserialize");
    assert_eq!(snapshot, decoded);
}
